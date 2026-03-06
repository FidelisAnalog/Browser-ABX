/**
 * TestRunner — main test orchestrator.
 * Handles audio initialization, test sequencing, and results collection.
 *
 * Anti-cheat: correct answers are never stored in React state/refs.
 * Each iteration creates a SHA-256 hash commitment. At submit time,
 * the user's answer is verified against the commitment. Trial records
 * are accumulated privately and merged into results at test completion.
 *
 * Audio lifecycle:
 * 1. Parse config → collect all unique audio URLs
 * 2. Fetch + decode all audio files once → cache decoded data by URL
 * 3. Create AudioEngine once at source sample rate
 * 4. Create AudioBuffers once from decoded cache (one per unique URL)
 * 5. Per test iteration: build array of AudioBuffer references, load into engine
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Box, CircularProgress, Container, Typography } from '@mui/material';
import { loadAndValidate, createAudioBufferMap } from '../audio/audioLoader';
import { useConfig } from '../hooks/useConfig';
import { AudioEngine } from '../audio/audioEngine';
import { shuffle } from '../utils/shuffle';
import { getTestType } from '../utils/testTypeRegistry';
import { createShareUrl } from '../utils/share';
import { emitEvent } from '../utils/events';
import { isEmbedded } from '../utils/embed';
import { formatResultsForEmit } from '../utils/formatResults';
import { createCommitment, verifyAnswer, deriveCorrectId } from '../utils/commitment';
import {
  createStaircaseState, createInterleavedState, getCurrentLevel,
  recordResponse, pickInterleavedTrack, recordInterleavedResponse,
  isInterleavedComplete, minRemainingTrials, minInterleavedRemainingTrials,
} from '../stats/staircase';
import Welcome from './Welcome';
import Results from './Results';
import SampleRateInfo from './SampleRateInfo';

/**
 * Module-level storage for answer reconstruction data.
 * NOT visible in React DevTools (only hooks are inspectable).
 * Set in setupIteration, consumed in handleSubmit, then cleared.
 */
let _iterationMeta = null;

/**
 * @param {object} props
 * @param {string} [props.configUrl] - URL to YAML config (standalone mode)
 * @param {object} [props.config] - Pre-parsed config object (embed mode, already normalized)
 * @param {boolean} [props.postResults] - Include results in acidtest:completed event (default: true)
 * @param {boolean} [props.skipWelcome] - Skip welcome screen, auto-start when audio ready
 * @param {boolean} [props.skipResults] - Skip results screen, show minimal completion state
 */
export default function TestRunner({ configUrl, config: configProp, postResults = true, skipWelcome = false, skipResults = false, onScreen }) {
  const { config, configError } = useConfig(configUrl, configProp);
  const [audioError, setAudioError] = useState(null);

  // Decoded audio cache: Map<url, DecodedAudio>
  const decodedCacheRef = useRef(new Map());
  // AudioBuffer cache: Map<url, AudioBuffer> — created once, reused every iteration
  const audioBufferMapRef = useRef(null);
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
  // Anti-cheat: NO commitment/hash data here — only non-answer metadata (testLevel, etc.).
  const iterationStateRef = useRef({});
  // Re-render trigger for iteration state changes (ref updates don't cause re-renders)
  const [, setIterationVersion] = useState(0);

  // Per-test persistent state (e.g. 2AFC-SD trial bag, staircase state)
  const testStateRef = useRef({});

  // Anti-cheat: iteration key counter — components use this for state resets
  const [iterationKey, setIterationKey] = useState(0);

  // Anti-cheat: progress dots — {isCorrect, confidence}[] for progress bar rendering
  const [progressDots, setProgressDots] = useState([]);

  // Anti-cheat: private trial records — full data for stats, never exposed as props.
  // Merged into results at test completion.
  const trialRecordsRef = useRef([]);

  // Dynamic page title
  useEffect(() => {
    if (!config) return;
    if (testStep === -1) {
      document.title = `${config.name} — acidtest.io`;
    } else if (testStep >= config.tests.length) {
      document.title = `Results — ${config.name} — acidtest.io`;
    } else {
      document.title = `${config.tests[testStep].name} — acidtest.io`;
    }
  }, [config, testStep]);

  // Adaptive test state — persists across trials within a test.
  // For staircase: holds the staircase state or interleaved state object.
  const adaptiveStateRef = useRef(null);

  // Staircase familiarization phase — true before first real trial
  const familiarizingRef = useRef(false);

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
    audioBufferMapRef.current = createAudioBufferMap(
      engineRef.current.context, decodedCacheRef.current
    );
    window.__engine = engineRef.current; // dev console access
  }
  const engine = engineRef.current;

  // Cleanup engine on unmount (SPA navigation) and on page unload (full navigation).
  // React useEffect cleanup does NOT fire on full page navigation, so pagehide
  // is needed to ensure the AudioContext is closed and the audio thread stops.
  useEffect(() => {
    const cleanup = () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
    window.addEventListener('pagehide', cleanup);
    return () => {
      window.removeEventListener('pagehide', cleanup);
      cleanup();
    };
  }, []);

  // Update crossfade config when test changes
  useEffect(() => {
    if (!engine) return;
    engine.setCrossfadeForced(currentTest?.crossfade ?? null);
    if (currentTest?.crossfadeDuration != null) {
      engine.setCrossfadeDuration(currentTest.crossfadeDuration / 1000);
    }
  }, [engine, currentTest]);

  // Track whether acidtest:completed has been emitted (prevent duplicates on re-render)
  const completedEmittedRef = useRef(false);

  /** Initialize results array when config is loaded. */
  const initResults = useCallback((cfg) => {
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
  }, []);

  // Initialize results when config becomes available
  useEffect(() => {
    if (config) initResults(config);
  }, [config, initResults]);

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
      if (!controller.signal.aborted) {
        setLoadProgress({ loaded, total });
        emitEvent('acidtest:loading', { loaded, total });
      }
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
        if (!controller.signal.aborted) setAudioError(err.message);
      });
    return () => { controller.abort(); };
  }, [audioUrls]);

  // Stable channel data per test — derived from decoded cache, not AudioBuffers.
  // Only recomputes when testStep changes (new test = potentially different files).
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
   * Look up pre-built AudioBuffers by URL and load into engine.
   * @param {{ bufferSources: object[] }} iterationData
   */
  const loadIterationAudio = useCallback((iterationData) => {
    if (!engineRef.current) return;
    const buffers = iterationData.bufferSources.map((opt) =>
      audioBufferMapRef.current.get(opt.audioUrl)
    );
    engineRef.current.loadBuffers(buffers);
  }, []);

  /**
   * Draw a single 2AFC-SD trial type from a bag (balanced) or randomly.
   * Balanced: shuffled block of 4 types, draw randomly within block, refill when empty.
   */
  const drawSameDiffTrial = useCallback((test, isNewTest) => {
    const types = ['AA', 'AB', 'BA', 'BB'];
    if (!test.balanced) {
      return types[Math.floor(Math.random() * 4)];
    }
    if (isNewTest) {
      testStateRef.current = { sdBag: shuffle([...types]) };
    }
    const bag = testStateRef.current.sdBag;
    if (bag.length === 0) {
      bag.push(...shuffle([...types]));
    }
    const idx = Math.floor(Math.random() * bag.length);
    return bag.splice(idx, 1)[0];
  }, []);

  /**
   * Build a staircase trial pair: reference + test at current level.
   * Randomizes which track is A vs B.
   */
  const buildStaircasePair = useCallback((options, level) => {
    const reference = options[0];
    const test = options[level];
    const referenceIdx = Math.random() < 0.5 ? 0 : 1;
    const pair = referenceIdx === 0
      ? [{ ...reference }, { ...test }]
      : [{ ...test }, { ...reference }];
    return { pair, referenceIdx };
  }, []);

  /**
   * Setup test iteration — async. Creates SHA-256 hash commitment.
   *
   * Anti-cheat: answer-revealing data is stored ONLY in module-level
   * _iterationMeta (invisible to React DevTools). iterationStateRef
   * contains only opaque hashes and non-revealing metadata.
   */
  const setupIteration = useCallback(async (test, testIndex, isNewTest, repeatIndex = 0) => {
    const { entry, baseType } = getTestType(test.testType);

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

      const allAnswerIds = ordered.map((_, i) => String(i));
      const commitment = await createCommitment(String(randomIndex), allAnswerIds);
      _iterationMeta = { correctIndex: randomIndex, commitment };

      if (baseType === 'abxy') {
        const otherIndex = randomIndex === 0 ? 1 : 0;
        const otherOption = ordered[otherIndex];
        const yOpt = { name: 'Y', audioUrl: otherOption.audioUrl };
        iterationStateRef.current = {};
        bufferSources = [...ordered, xOpt, yOpt];
      } else {
        iterationStateRef.current = {};
        bufferSources = [...ordered, xOpt];
      }
    } else if (baseType === 'triangle') {
      const oddIdx = Math.floor(Math.random() * ordered.length);
      const dupIdx = oddIdx === 0 ? 1 : 0;
      const correctOdd = ordered[oddIdx];
      const triplet = shuffle([
        { ...ordered[dupIdx] },
        { ...correctOdd },
        { ...ordered[dupIdx] },
      ]);
      const correctTripletIdx = triplet.findIndex((t) => t.audioUrl === correctOdd.audioUrl);

      const allAnswerIds = ['0', '1', '2'];
      const commitment = await createCommitment(String(correctTripletIdx), allAnswerIds);
      _iterationMeta = { tripletOptions: triplet.map((t) => ({ name: t.name })), commitment };

      iterationStateRef.current = {};
      bufferSources = triplet;
    } else if (baseType === '2afc-sd') {
      const trialType = drawSameDiffTrial(test, isNewTest);
      const pairType = (trialType === 'AA' || trialType === 'BB') ? 'same' : 'different';
      const pairMap = {
        AA: [ordered[0], ordered[0]],
        BB: [ordered[1], ordered[1]],
        AB: [ordered[0], ordered[1]],
        BA: [ordered[1], ordered[0]],
      };
      const sdPair = pairMap[trialType].map((o) => ({ ...o }));

      const allAnswerIds = ['same', 'different'];
      const commitment = await createCommitment(pairType, allAnswerIds);
      _iterationMeta = { commitment };

      iterationStateRef.current = {};
      bufferSources = sdPair;
    } else if (isStaircase) {
      if (isNewTest) {
        const sc = test.staircase;
        if (sc.interleave) {
          adaptiveStateRef.current = createInterleavedState(sc);
        } else {
          adaptiveStateRef.current = createStaircaseState(sc);
        }
        familiarizingRef.current = true;
      }

      if (familiarizingRef.current) {
        const reference = ordered[0];
        const startLevel = test.staircase.nLevels;
        const testStim = ordered[startLevel];
        const pair = [{ ...reference }, { ...testStim }];

        _iterationMeta = null;
        iterationStateRef.current = {
          testLevel: startLevel,
          interleavedTrackIdx: null,
          familiarizing: true,
          pairNames: [reference.name, testStim.name],
        };
        bufferSources = pair;
      } else {
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

        const allAnswerIds = ['0', '1'];
        const commitment = await createCommitment(String(referenceIdx), allAnswerIds);
        _iterationMeta = { commitment };

        iterationStateRef.current = {
          testLevel: level,
          interleavedTrackIdx: trackIdx,
        };
        bufferSources = pair;
      }
    } else {
      // AB: preference — no commitment
      _iterationMeta = null;
      iterationStateRef.current = {};
      bufferSources = ordered;
    }

    iterationStartRef.current = Date.now();
    setIterationKey((k) => k + 1);
    setIterationVersion((v) => v + 1);
    return { options: ordered, bufferSources };
  }, [drawSameDiffTrial, buildStaircasePair]);

  // Start test
  const handleStart = useCallback(async (formData) => {
    setForm(formData);
    setTestStep(0);
    setRepeatStep(0);
    setProgressDots([]);
    trialRecordsRef.current = [];
    emitEvent('acidtest:started', { form: formData });
    if (config.tests.length > 0) {
      const iterationData = await setupIteration(config.tests[0], 0, true);
      loadIterationAudio(iterationData);
    }
  }, [config, setupIteration, loadIterationAudio]);

  // skipWelcome: auto-start when audio is ready
  useEffect(() => {
    if (skipWelcome && audioInitialized && testStep === -1 && config) {
      handleStart({});
    }
  }, [skipWelcome, audioInitialized, testStep, config, handleStart]);

  // Restart test — reuses cached audio
  const handleRestart = useCallback(async () => {
    completedEmittedRef.current = false;
    setTestStep(0);
    setRepeatStep(0);
    setProgressDots([]);
    trialRecordsRef.current = [];
    adaptiveStateRef.current = null;
    familiarizingRef.current = false;
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
      const iterationData = await setupIteration(config.tests[0], 0, true);
      loadIterationAudio(iterationData);
    }
  }, [config, setupIteration, loadIterationAudio]);

  /**
   * Merge private trial records into results for the completed test.
   */
  const mergeTrialRecords = useCallback((testIndex, currentResults) => {
    const test = config.tests[testIndex];
    const { entry, baseType } = getTestType(test.testType);
    const newResults = JSON.parse(JSON.stringify(currentResults));

    if (baseType === '2afc-staircase') {
      newResults[testIndex].staircaseData = {
        trials: JSON.parse(JSON.stringify(trialRecordsRef.current)),
        finalState: JSON.parse(JSON.stringify(adaptiveStateRef.current)),
        interleaved: test.staircase.interleave,
      };
    } else {
      newResults[testIndex][entry.resultDataKey] = JSON.parse(JSON.stringify(trialRecordsRef.current));
    }

    return newResults;
  }, [config]);

  /**
   * Unified submit handler for all test types.
   * @param {string|null} answerId - Track index as string, 'same'/'different', or null (familiarization)
   * @param {string|null} confidence - 'sure'|'somewhat'|'guessing'|null
   */
  const handleSubmit = (answerId, confidence) => {
    const now = Date.now();
    const test = config.tests[testStep];
    const { baseType } = getTestType(test.testType);
    const iterState = iterationStateRef.current;

    // Staircase familiarization: skip to first real trial
    if (baseType === '2afc-staircase' && iterState.familiarizing) {
      familiarizingRef.current = false;
      setupIteration(test, testStep, false).then((data) => loadIterationAudio(data));
      return;
    }

    // Verify answer via commitment (non-AB types)
    let isCorrect = null;
    const commitment = _iterationMeta?.commitment;
    if (baseType !== 'ab' && commitment) {
      isCorrect = verifyAnswer(commitment.answerHashes, answerId, commitment.correctHash);
    }

    // Build trial record
    const timing = { startedAt: iterationStartRef.current, finishedAt: now };

    if (baseType === 'ab') {
      trialRecordsRef.current.push({
        ...currentOptions[parseInt(answerId)],
        ...timing,
      });
    } else if (baseType === '2afc-sd') {
      const correctPairType = deriveCorrectId(commitment.answerHashes, commitment.correctHash);
      trialRecordsRef.current.push({
        userResponse: answerId,
        pairType: correctPairType,
        confidence: confidence || null,
        ...timing,
      });
    } else if (baseType === '2afc-staircase') {
      const state = adaptiveStateRef.current;
      if (test.staircase.interleave) {
        recordInterleavedResponse(state, iterState.interleavedTrackIdx, isCorrect);
      } else {
        recordResponse(state, isCorrect);
      }
      trialRecordsRef.current.push({
        level: iterState.testLevel,
        isCorrect,
        ...timing,
      });
    } else {
      // ABX, ABXY, Triangle
      let selectedOption, correctOption;
      const correctAnswerId = deriveCorrectId(commitment.answerHashes, commitment.correctHash);

      if (baseType === 'triangle') {
        const meta = _iterationMeta;
        selectedOption = meta ? { name: meta.tripletOptions[parseInt(answerId)].name }
          : { name: `Track ${answerId}` };
        correctOption = meta ? { name: meta.tripletOptions[parseInt(correctAnswerId)].name }
          : { name: `Track ${correctAnswerId}` };
      } else {
        selectedOption = { name: currentOptions[parseInt(answerId)].name };
        correctOption = { name: currentOptions[parseInt(correctAnswerId)].name };
      }

      trialRecordsRef.current.push({
        selectedOption,
        correctOption,
        confidence: confidence || null,
        ...timing,
      });
    }

    // Update progress dots
    setProgressDots((prev) => [...prev, { isCorrect, confidence: confidence || null }]);

    _iterationMeta = null;

    advanceStep(isCorrect);
  };

  /**
   * Advance to next iteration or test.
   */
  const advanceStep = async (isCorrect) => {
    const test = config.tests[testStep];
    const { entry, baseType } = getTestType(test.testType);

    emitEvent('acidtest:progress', {
      testIndex: testStep,
      testName: test.name,
      trialIndex: repeatStep,
      totalTests: config.tests.length,
      totalTrials: entry.isAdaptive ? null : test.repeat,
    });

    let continueTest;
    if (entry.isAdaptive) {
      const state = adaptiveStateRef.current;
      const complete = test.staircase.interleave
        ? isInterleavedComplete(state)
        : state.complete;
      continueTest = !complete;
    } else {
      continueTest = repeatStep + 1 < test.repeat;
    }

    if (continueTest) {
      const nextRepeat = repeatStep + 1;
      setRepeatStep(nextRepeat);
      const iterationData = await setupIteration(test, testStep, false, nextRepeat);
      loadIterationAudio(iterationData);
    } else {
      // Test complete — merge trial records into results
      const mergedResults = mergeTrialRecords(testStep, results);
      setResults(mergedResults);

      if (testStep + 1 < config.tests.length) {
        const nextTest = testStep + 1;
        setTestStep(nextTest);
        setRepeatStep(0);
        setProgressDots([]);
        trialRecordsRef.current = [];
        adaptiveStateRef.current = null;
        familiarizingRef.current = false;
        const iterationData = await setupIteration(config.tests[nextTest], nextTest, true);
        loadIterationAudio(iterationData);
      } else {
        setTestStep(config.tests.length);
      }
    }
  };

  // Emit acidtest:completed when all tests are done
  useEffect(() => {
    if (!config || testStep < config.tests.length || completedEmittedRef.current) return;
    completedEmittedRef.current = true;

    if (postResults) {
      const allStats = results.map((result) => {
        const { entry } = getTestType(result.testType);
        const resultData = result[entry.resultDataKey];
        return entry.computeStats(result.name, result.optionNames, resultData);
      });
      const shareUrl = createShareUrl(allStats, config, configUrl);
      emitEvent('acidtest:completed', { results: formatResultsForEmit(results), stats: allStats, shareUrl, form });
    } else {
      emitEvent('acidtest:completed');
    }
  }, [config, testStep, postResults, results, form]);

  // Report current screen to parent
  const screen = !config ? 'loading'
    : testStep === -1 ? (skipWelcome ? 'loading' : 'welcome')
    : testStep >= (config?.tests?.length ?? 0) ? 'results'
    : 'test';
  useEffect(() => { onScreen?.(screen); }, [screen, onScreen]);

  // --- Render ---

  const error = configError || audioError;
  if (error) {
    return (
      <Box sx={{ minHeight: isEmbedded ? undefined : '100vh' }} pt={4}>
        <Container maxWidth="md">
          <Typography color="error" variant="h6">Error</Typography>
          <Typography>{error}</Typography>
        </Container>
      </Box>
    );
  }

  if (!config) {
    if (skipWelcome) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={isEmbedded ? '700px' : '100vh'}>
          <CircularProgress />
        </Box>
      );
    }
    return null;
  }

  if (testStep === -1) {
    if (skipWelcome) {
      return (
        <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight={isEmbedded ? '700px' : '100vh'} gap={2}>
          <CircularProgress />
          {loadProgress.total > 0 && (
            <Typography variant="body2" color="text.secondary">
              Loading audio ({loadProgress.loaded}/{loadProgress.total})
            </Typography>
          )}
        </Box>
      );
    }
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

  if (testStep >= config.tests.length) {
    if (skipResults) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={isEmbedded ? undefined : '100vh'}>
          <Typography variant="h6" color="text.secondary">Test complete</Typography>
        </Box>
      );
    }
    return (
      <Box sx={{ minHeight: isEmbedded ? undefined : '100vh' }} pt={2} pb={2}>
        <Container maxWidth="md">
          <Results
            description={config.results?.description}
            results={results}
            config={config}
            configUrl={configUrl}
            onRestart={handleRestart}
          />
        </Container>
      </Box>
    );
  }

  // Test screens
  const test = config.tests[testStep];
  const crossfadeForced = currentTest?.crossfade ?? null;

  const { entry, hasConfidence, baseType } = getTestType(test.testType);
  const TestComponent = entry.testComponent;

  const stepStr = entry.isAdaptive
    ? `Trial ${repeatStep + 1}`
    : `${repeatStep + 1}/${test.repeat}`;

  const commonProps = {
    key: testStep,
    name: test.name,
    description: test.description,
    stepStr,
    engine,
    channelData: testChannelData,
    crossfadeForced,
    onSubmit: handleSubmit,
    iterationKey,
  };

  const iterState = iterationStateRef.current;
  let typeProps = {};
  if (baseType === 'ab') {
    typeProps = { options: currentOptions };
  } else if (baseType === 'abx') {
    typeProps = {
      options: currentOptions,
      totalIterations: test.repeat,
      progressDots,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === 'abxy') {
    typeProps = {
      options: currentOptions,
      totalIterations: test.repeat,
      progressDots,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === 'triangle') {
    typeProps = {
      totalIterations: test.repeat,
      progressDots,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === '2afc-sd') {
    typeProps = {
      totalIterations: test.repeat,
      progressDots,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === '2afc-staircase') {
    const state = adaptiveStateRef.current;
    const sc = test.staircase;
    if (iterState.familiarizing) {
      typeProps = {
        testLevel: iterState.testLevel,
        familiarizing: true,
        pairNames: iterState.pairNames,
        reversalCount: 0,
        targetReversals: sc.interleave ? sc.reversals * 2 : sc.reversals,
        progressDots,
        minRemaining: 0,
      };
    } else {
      typeProps = {
        testLevel: iterState.testLevel,
        reversalCount: sc.interleave
          ? state.tracks.reduce((sum, t) => sum + t.reversals.length, 0)
          : state.reversals.length,
        targetReversals: sc.interleave
          ? sc.reversals * 2
          : sc.reversals,
        progressDots,
        minRemaining: sc.interleave
          ? minInterleavedRemainingTrials(state)
          : minRemainingTrials(state),
      };
    }
  }

  return <TestComponent {...commonProps} {...typeProps} />;
}
