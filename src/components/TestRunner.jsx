/**
 * TestRunner — main test orchestrator.
 * Handles config loading, audio initialization, test sequencing, and results collection.
 *
 * Audio lifecycle:
 * 1. Parse config → collect all unique audio URLs
 * 2. Fetch + decode all audio files once → cache decoded data by URL
 * 3. Create AudioEngine once at source sample rate
 * 4. Per test iteration: build AudioBuffers for the current options, load into engine
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Box, CircularProgress, Container, Typography } from '@mui/material';
import { parseConfig } from '../utils/config';
import { loadAndValidate, createAudioBuffer } from '../audio/audioLoader';
import { AudioEngine } from '../audio/audioEngine';
import { shuffle } from '../utils/shuffle';
import { getTestType } from '../utils/testTypeRegistry';
import {
  createStaircaseState, createInterleavedState, getCurrentLevel,
  recordResponse, pickInterleavedTrack, recordInterleavedResponse,
  isInterleavedComplete, minRemainingTrials, minInterleavedRemainingTrials,
} from '../stats/staircase';
import Welcome from './Welcome';
import Results from './Results';
import SampleRateInfo from './SampleRateInfo';

/**
 * @param {object} props
 * @param {string} props.configUrl - URL to YAML config
 */
export default function TestRunner({ configUrl }) {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);

  // Decoded audio cache: Map<url, DecodedAudio>
  const decodedCacheRef = useRef(new Map());
  const [audioSampleRate, setAudioSampleRate] = useState(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });

  // Test flow state
  const [form, setForm] = useState({});
  const [testStep, setTestStep] = useState(-1);  // -1 = welcome
  const [repeatStep, setRepeatStep] = useState(0);
  const [results, setResults] = useState([]);

  // Current test options (shuffled once per test, persisted across iterations)
  const [currentOptions, setCurrentOptions] = useState([]);
  const shuffledOptionsRef = useRef([]);

  // Per-iteration type-specific state (populated by setupIteration, read during render).
  // Shape varies by test type — see setupIteration for each type's structure.
  const iterationStateRef = useRef({});
  const [iterationVersion, setIterationVersion] = useState(0);

  // Per-test persistent state (e.g. 2AFC-SD trial sequence, staircase state)
  const testStateRef = useRef({});

  // Adaptive test state — persists across trials within a test.
  // For staircase: holds the staircase state or interleaved state object.
  const adaptiveStateRef = useRef(null);

  // Iteration timing
  const iterationStartRef = useRef(null);

  // Get current test config (for crossfade settings)
  const currentTest = config && testStep >= 0 && testStep < config.tests.length
    ? config.tests[testStep]
    : null;

  // Create engine once when sample rate is known (synchronous, deterministic)
  const engineRef = useRef(null);
  if (audioSampleRate && !engineRef.current) {
    engineRef.current = new AudioEngine(audioSampleRate);
    window.__engine = engineRef.current; // dev console access
  }
  const engine = engineRef.current;

  // Cleanup engine on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  // Update crossfade config when test changes
  useEffect(() => {
    if (!engine) return;
    engine.setCrossfadeForced(currentTest?.crossfade || false);
    if (currentTest?.crossfadeDuration != null) {
      engine.setCrossfadeDuration(currentTest.crossfadeDuration / 1000);
    }
  }, [engine, currentTest]);

  // Load config
  useEffect(() => {
    let cancelled = false;
    parseConfig(configUrl)
      .then((cfg) => {
        if (cancelled) return;
        setConfig(cfg);
        setResults(
          cfg.tests.map((test) => {
            const { entry } = getTestType(test.testType);
            return {
              name: test.name,
              testType: test.testType,
              optionNames: null,
              nOptions: test.options.length,
              [entry.resultDataKey]: [],
            };
          })
        );
      })
      .catch((err) => {
        if (!cancelled) setConfigError(err.message);
      });
    return () => { cancelled = true; };
  }, [configUrl]);

  // Collect all unique audio URLs from config
  const audioUrls = useMemo(() => {
    if (!config) return [];
    const urls = new Set();
    for (const opt of config.options) {
      urls.add(opt.audioUrl);
    }
    return Array.from(urls);
  }, [config]);

  // Load and decode all audio files once
  useEffect(() => {
    if (audioUrls.length === 0) return;
    const controller = new AbortController();

    loadAndValidate(audioUrls, (loaded, total) => {
      if (!controller.signal.aborted) setLoadProgress({ loaded, total });
    }, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        // Cache decoded data by URL
        const cache = new Map();
        for (let i = 0; i < audioUrls.length; i++) {
          cache.set(audioUrls[i], data.decoded[i]);
        }
        decodedCacheRef.current = cache;
        setAudioSampleRate(data.sampleRate);
        setAudioInitialized(true);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return; // Unmount — ignore
        if (!controller.signal.aborted) setConfigError(err.message);
      });
    return () => { controller.abort(); };
  }, [audioUrls]);

  // Stable channel data per test — derived from decoded cache, not AudioBuffers.
  // Only recomputes when testStep changes (new test = potentially different files).
  // For ABX the waveform composite is identical every iteration since A, B are fixed
  // and X is always one of A or B.
  const testChannelData = useMemo(() => {
    if (!config || testStep < 0 || testStep >= config.tests.length) return [];
    const cache = decodedCacheRef.current;
    if (cache.size === 0) return [];
    const test = config.tests[testStep];
    // Extract channel 0 from each option's decoded data
    const ch0 = test.options.map((opt) => {
      const decoded = cache.get(opt.audioUrl);
      return decoded ? decoded.samples[0] : new Float32Array(0);
    });
    // Add extra waveform tracks (ABX: +1 for X, Triangle: +1 for duplicate)
    const { entry } = getTestType(test.testType);
    for (let extra = 0; extra < entry.waveformExtraTracks; extra++) {
      if (ch0.length > 0) ch0.push(ch0[0]);
    }
    return ch0;
  }, [config, testStep]);

  /**
   * Build AudioBuffers from iterationData.bufferSources and load into engine.
   * @param {{ bufferSources: object[] }} iterationData
   */
  const loadIterationAudio = useCallback((iterationData) => {
    if (!engineRef.current) return;
    const ctx = engineRef.current.context;
    const cache = decodedCacheRef.current;
    const buffers = iterationData.bufferSources.map((opt) => {
      const decoded = cache.get(opt.audioUrl);
      return createAudioBuffer(ctx, decoded);
    });
    engineRef.current.loadBuffers(buffers);
  }, []);

  /**
   * Generate a 2AFC-SD trial sequence.
   * Balanced: blocked randomization per ITU-R — blocks of 4 (AA, AB, BA, BB),
   * shuffled within each block. Partial last block draws without replacement.
   * Random: each trial independently picks one of {AA, AB, BA, BB}.
   */
  const generateTrialSequence = useCallback((repeat, balanced) => {
    const types = ['AA', 'AB', 'BA', 'BB'];
    if (!balanced) {
      return Array.from({ length: repeat }, () => types[Math.floor(Math.random() * 4)]);
    }
    // Blocked randomization
    const fullBlocks = Math.floor(repeat / 4);
    const remainder = repeat % 4;
    const seq = [];
    for (let b = 0; b < fullBlocks; b++) {
      seq.push(...shuffle([...types]));
    }
    if (remainder > 0) {
      const partial = shuffle([...types]).slice(0, remainder);
      seq.push(...partial);
    }
    return seq;
  }, []);

  /**
   * Build a staircase trial pair: reference + test at current level.
   * Randomizes which track is A vs B.
   * @param {object[]} options - Test options in order (index 0 = reference, 1..N = levels 1..N)
   * @param {number} level - Current staircase level (1-based into non-reference options)
   * @returns {{ pair: object[], referenceIdx: number }}
   */
  const buildStaircasePair = useCallback((options, level) => {
    const reference = options[0];   // First option = reference
    const test = options[level];    // Level 1 → options[1], level N → options[N]
    // Randomize assignment to A/B
    const referenceIdx = Math.random() < 0.5 ? 0 : 1;
    const pair = referenceIdx === 0
      ? [{ ...reference }, { ...test }]
      : [{ ...test }, { ...reference }];
    return { pair, referenceIdx };
  }, []);

  /**
   * Setup test iteration — shuffle once on first iteration, reuse on repeats.
   * When a new test starts, records the shuffled option order in results so the
   * confusion matrix A/B mapping always matches what the user saw.
   *
   * Populates iterationStateRef with type-specific state and returns
   * { options, bufferSources } for loadIterationAudio.
   */
  const setupIteration = useCallback((test, testIndex, isNewTest, repeatIndex = 0) => {
    const { entry, baseType } = getTestType(test.testType);

    // Staircase: never shuffle options (order = quality levels)
    const isStaircase = baseType === '2afc-staircase';
    const shouldReshuffle = !isStaircase && (isNewTest || entry.reshuffleEveryIteration);
    const ordered = shouldReshuffle ? shuffle(test.options) : (isStaircase ? test.options : shuffledOptionsRef.current);
    if (isNewTest) shuffledOptionsRef.current = ordered;
    setCurrentOptions(ordered);

    if (isNewTest) {
      const names = ordered.map((o) => o.name);
      setResults((prev) => {
        const r = JSON.parse(JSON.stringify(prev));
        r[testIndex].optionNames = names;
        return r;
      });
    }

    let bufferSources;

    if (baseType === 'abx' || baseType === 'abxy') {
      const randomIndex = Math.floor(Math.random() * ordered.length);
      const randomOption = ordered[randomIndex];
      const xOpt = { name: 'X', audioUrl: randomOption.audioUrl };

      if (baseType === 'abxy') {
        const otherIndex = randomIndex === 0 ? 1 : 0;
        const otherOption = ordered[otherIndex];
        const yOpt = { name: 'Y', audioUrl: otherOption.audioUrl };
        iterationStateRef.current = { xOption: xOpt, yOption: yOpt };
        bufferSources = [...ordered, xOpt, yOpt];
      } else {
        iterationStateRef.current = { xOption: xOpt, yOption: null };
        bufferSources = [...ordered, xOpt];
      }
    } else if (baseType === 'triangle') {
      // Pick one option as odd, duplicate the other
      const oddIdx = Math.floor(Math.random() * ordered.length);
      const dupIdx = oddIdx === 0 ? 1 : 0;
      const correctOdd = ordered[oddIdx];
      // Build triplet: [dup, odd, dup] then shuffle
      const triplet = shuffle([
        { ...ordered[dupIdx] },
        { ...correctOdd },
        { ...ordered[dupIdx] },
      ]);
      iterationStateRef.current = { triplet, correctOption: correctOdd };
      bufferSources = triplet;
    } else if (baseType === '2afc-sd') {
      // Generate trial sequence on first iteration
      if (isNewTest) {
        testStateRef.current = {
          trialSeq: generateTrialSequence(test.repeat, test.balanced),
        };
      }
      // Pop the next trial type
      const trialType = testStateRef.current.trialSeq[repeatIndex];
      const pType = (trialType === 'AA' || trialType === 'BB') ? 'same' : 'different';
      // Build pair from the two options (ordered[0]=A, ordered[1]=B)
      const pairMap = {
        AA: [ordered[0], ordered[0]],
        BB: [ordered[1], ordered[1]],
        AB: [ordered[0], ordered[1]],
        BA: [ordered[1], ordered[0]],
      };
      const sdPair = pairMap[trialType].map((o) => ({ ...o }));
      iterationStateRef.current = { pair: sdPair, pairType: pType };
      bufferSources = sdPair;
    } else if (isStaircase) {
      // Initialize staircase state on first iteration
      if (isNewTest) {
        const sc = test.staircase;
        if (sc.interleave) {
          adaptiveStateRef.current = createInterleavedState(sc);
        } else {
          adaptiveStateRef.current = createStaircaseState(sc);
        }
      }

      // Get current level from the adaptive state
      let level;
      let trackIdx = null;
      const state = adaptiveStateRef.current;
      if (test.staircase.interleave) {
        trackIdx = pickInterleavedTrack(state);
        level = getCurrentLevel(state.tracks[trackIdx]);
      } else {
        level = getCurrentLevel(state);
      }

      const { pair, referenceIdx } = buildStaircasePair(ordered, level);
      iterationStateRef.current = {
        pair,
        referenceIdx,
        testLevel: level,
        interleavedTrackIdx: trackIdx,
      };
      bufferSources = pair;
    } else {
      // AB: options are the buffers
      iterationStateRef.current = {};
      bufferSources = ordered;
    }

    iterationStartRef.current = Date.now();
    setIterationVersion((v) => v + 1);
    return { options: ordered, bufferSources };
  }, [generateTrialSequence, buildStaircasePair]);

  // Start test (from welcome screen)
  const handleStart = useCallback((formData) => {
    setForm(formData);
    setTestStep(0);
    setRepeatStep(0);
    if (config.tests.length > 0) {
      const iterationData = setupIteration(config.tests[0], 0, true);
      loadIterationAudio(iterationData);
    }
  }, [config, setupIteration, loadIterationAudio]);

  // Restart test (from results screen) — reuses cached audio
  const handleRestart = useCallback(() => {
    setTestStep(0);
    setRepeatStep(0);
    adaptiveStateRef.current = null;
    // Reset results and update optionNames to shuffled order for first test
    const freshResults = config.tests.map((test) => {
      const { entry } = getTestType(test.testType);
      return {
        name: test.name,
        testType: test.testType,
        optionNames: null,
        nOptions: test.options.length,
        [entry.resultDataKey]: [],
      };
    });
    setResults(freshResults);
    if (config.tests.length > 0) {
      const iterationData = setupIteration(config.tests[0], 0, true);
      loadIterationAudio(iterationData);
    }
  }, [config, setupIteration, loadIterationAudio]);

  // Handle AB test submission
  const handleAbSubmit = (selectedOption) => {
    const now = Date.now();
    const newResults = JSON.parse(JSON.stringify(results));
    newResults[testStep].userSelections.push({
      ...selectedOption,
      startedAt: iterationStartRef.current,
      finishedAt: now,
    });
    setResults(newResults);
    advanceStep(newResults);
  };

  // Handle ABX / Triangle test submission
  const handleAbxSubmit = (selectedOption, correctOption, confidence) => {
    const now = Date.now();
    const newResults = JSON.parse(JSON.stringify(results));
    newResults[testStep].userSelectionsAndCorrects.push({
      selectedOption: { ...selectedOption },
      correctOption: { ...correctOption },
      confidence: confidence || null,
      startedAt: iterationStartRef.current,
      finishedAt: now,
    });
    setResults(newResults);
    advanceStep(newResults);
  };

  // Handle same-different test submission
  const handleSameDiffSubmit = (userResponse, pairType, confidence) => {
    const now = Date.now();
    const newResults = JSON.parse(JSON.stringify(results));
    newResults[testStep].userSelectionsAndCorrects.push({
      userResponse,
      pairType,
      confidence: confidence || null,
      startedAt: iterationStartRef.current,
      finishedAt: now,
    });
    setResults(newResults);
    advanceStep(newResults);
  };

  // Handle staircase test submission
  const handleStaircaseSubmit = (selectedIdx) => {
    const now = Date.now();
    const { referenceIdx, testLevel, interleavedTrackIdx } = iterationStateRef.current;
    const isCorrect = selectedIdx === referenceIdx;
    const test = config.tests[testStep];

    // Update adaptive state
    const state = adaptiveStateRef.current;
    if (test.staircase.interleave) {
      recordInterleavedResponse(state, interleavedTrackIdx, isCorrect);
    } else {
      recordResponse(state, isCorrect);
    }

    // Record trial in results
    const newResults = JSON.parse(JSON.stringify(results));
    const staircaseData = newResults[testStep].staircaseData;

    // On first trial, staircaseData is [], convert to structured object
    if (Array.isArray(staircaseData) && staircaseData.length === 0) {
      newResults[testStep].staircaseData = {
        trials: [],
        finalState: null,
        interleaved: test.staircase.interleave,
      };
    }

    newResults[testStep].staircaseData.trials.push({
      level: testLevel,
      isCorrect,
      startedAt: iterationStartRef.current,
      finishedAt: now,
    });

    // Check if staircase is complete
    const complete = test.staircase.interleave
      ? isInterleavedComplete(state)
      : state.complete;

    if (complete) {
      // Deep copy the final adaptive state into results
      newResults[testStep].staircaseData.finalState = JSON.parse(JSON.stringify(state));
    }

    setResults(newResults);
    advanceStep(newResults, complete);
  };

  /**
   * Advance to next iteration or test.
   * @param {object[]} updatedResults
   * @param {boolean} [adaptiveComplete] - For adaptive types: whether the algorithm says we're done
   */
  const advanceStep = (updatedResults, adaptiveComplete) => {
    const test = config.tests[testStep];
    const { entry } = getTestType(test.testType);

    // Determine if we should continue this test
    let continueTest;
    if (entry.isAdaptive) {
      continueTest = !adaptiveComplete;
    } else {
      continueTest = repeatStep + 1 < test.repeat;
    }

    if (continueTest) {
      // Next trial/repeat of same test
      const nextRepeat = repeatStep + 1;
      setRepeatStep(nextRepeat);
      const iterationData = setupIteration(test, testStep, false, nextRepeat);
      loadIterationAudio(iterationData);
    } else if (testStep + 1 < config.tests.length) {
      // Next test
      const nextTest = testStep + 1;
      setTestStep(nextTest);
      setRepeatStep(0);
      adaptiveStateRef.current = null;
      const iterationData = setupIteration(config.tests[nextTest], nextTest, true);
      loadIterationAudio(iterationData);
    } else {
      // Done — show results
      setTestStep(config.tests.length);
    }
  };

  // --- Render ---

  if (configError) {
    return (
      <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={4}>
        <Container maxWidth="md">
          <Typography color="error" variant="h6">Error</Typography>
          <Typography>{configError}</Typography>
        </Container>
      </Box>
    );
  }

  if (!config) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  // Welcome screen
  if (testStep === -1) {
    return (
      <>
        {engine && (
          <Container maxWidth="md" sx={{ pt: 2 }}>
            <SampleRateInfo info={engine.getSampleRateInfo()} />
          </Container>
        )}
        <Welcome
          description={config.welcome?.description}
          form={config.welcome?.form}
          initialized={audioInitialized}
          onStart={handleStart}
        />
      </>
    );
  }

  // Results screen
  if (testStep >= config.tests.length) {
    return (
      <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={2} pb={2}>
        <Container maxWidth="md">
          <Results
            description={config.results?.description}
            results={results}
            config={config}
            onRestart={handleRestart}
          />
        </Container>
      </Box>
    );
  }

  // Test screens
  const test = config.tests[testStep];
  const crossfadeForced = currentTest?.crossfade || false;

  const { entry, hasConfidence, baseType } = getTestType(test.testType);
  const TestComponent = entry.testComponent;

  // Step string: adaptive types show "Trial N", fixed types show "N/total"
  const stepStr = entry.isAdaptive
    ? `Trial ${repeatStep + 1}`
    : `${repeatStep + 1}/${test.repeat}`;

  // Submit handler
  const submitHandler = entry.submitType === 'staircase' ? handleStaircaseSubmit
    : entry.submitType === 'samediff' ? handleSameDiffSubmit
    : entry.submitType === 'ab' ? handleAbSubmit
    : handleAbxSubmit;

  // Common props shared by all test types.
  // Adaptive types remount every trial (pair changes); fixed types remount per test only.
  const componentKey = entry.isAdaptive ? `${testStep}-${iterationVersion}` : testStep;
  const commonProps = {
    key: componentKey,
    name: test.name,
    description: test.description,
    stepStr,
    engine,
    channelData: testChannelData,
    crossfadeForced,
    onSubmit: submitHandler,
  };

  // Type-specific props — read from iterationStateRef
  const iterState = iterationStateRef.current;
  let typeProps = {};
  if (baseType === 'ab') {
    typeProps = { options: currentOptions };
  } else if (baseType === 'abx') {
    typeProps = {
      options: currentOptions,
      xOption: iterState.xOption,
      totalIterations: test.repeat,
      iterationResults: results[testStep].userSelectionsAndCorrects,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === 'abxy') {
    typeProps = {
      options: currentOptions,
      xOption: iterState.xOption,
      yOption: iterState.yOption,
      totalIterations: test.repeat,
      iterationResults: results[testStep].userSelectionsAndCorrects,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === 'triangle') {
    typeProps = {
      triplet: iterState.triplet,
      correctOption: iterState.correctOption,
      totalIterations: test.repeat,
      iterationResults: results[testStep].userSelectionsAndCorrects,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === '2afc-sd') {
    typeProps = {
      pair: iterState.pair,
      pairType: iterState.pairType,
      options: currentOptions,
      totalIterations: test.repeat,
      iterationResults: results[testStep].userSelectionsAndCorrects,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === '2afc-staircase') {
    const state = adaptiveStateRef.current;
    const sc = test.staircase;
    typeProps = {
      pair: iterState.pair,
      referenceIdx: iterState.referenceIdx,
      testLevel: iterState.testLevel,
      reversalCount: sc.interleave
        ? state.tracks.reduce((sum, t) => sum + t.reversals.length, 0)
        : state.reversals.length,
      targetReversals: sc.interleave
        ? sc.reversals * 2  // 2 tracks
        : sc.reversals,
      trialHistory: results[testStep].staircaseData?.trials || [],
      minRemaining: sc.interleave
        ? minInterleavedRemainingTrials(state)
        : minRemainingTrials(state),
    };
  }

  return <TestComponent {...commonProps} {...typeProps} />;
}
