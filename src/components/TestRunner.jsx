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
  const [xOption, setXOption] = useState(null);
  const [yOption, setYOption] = useState(null);

  // Triangle test state
  const [triangleTriplet, setTriangleTriplet] = useState(null);
  const [triangleCorrectOption, setTriangleCorrectOption] = useState(null);

  // Same-different test state
  const sameDiffTrialSeqRef = useRef([]);
  const [sameDiffPair, setSameDiffPair] = useState(null);
  const [sameDiffPairType, setSameDiffPairType] = useState(null);

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
    let cancelled = false;

    loadAndValidate(audioUrls, (loaded, total) => {
      if (!cancelled) setLoadProgress({ loaded, total });
    })
      .then((data) => {
        if (cancelled) return;
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
        if (!cancelled) setConfigError(err.message);
      });
    return () => { cancelled = true; };
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
   * Build AudioBuffers for a set of options (+ optional X) and load into engine.
   */
  const loadIterationAudio = useCallback((options, xOpt, yOpt, triplet, sdPair) => {
    if (!engineRef.current) return;
    const ctx = engineRef.current.context;
    const cache = decodedCacheRef.current;

    if (sdPair) {
      // Same-different: load 2 pair buffers
      const buffers = sdPair.map((opt) => {
        const decoded = cache.get(opt.audioUrl);
        return createAudioBuffer(ctx, decoded);
      });
      engineRef.current.loadBuffers(buffers);
    } else if (triplet) {
      // Triangle: load 3 triplet buffers
      const buffers = triplet.map((opt) => {
        const decoded = cache.get(opt.audioUrl);
        return createAudioBuffer(ctx, decoded);
      });
      engineRef.current.loadBuffers(buffers);
    } else {
      // AB/ABX: load options + optional X
      const buffers = options.map((opt) => {
        const decoded = cache.get(opt.audioUrl);
        return createAudioBuffer(ctx, decoded);
      });
      if (xOpt) {
        const xDecoded = cache.get(xOpt.audioUrl);
        buffers.push(createAudioBuffer(ctx, xDecoded));
      }
      if (yOpt) {
        const yDecoded = cache.get(yOpt.audioUrl);
        buffers.push(createAudioBuffer(ctx, yDecoded));
      }
      engineRef.current.loadBuffers(buffers);
    }
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

  // Setup test iteration — shuffle once on first iteration, reuse on repeats.
  // When a new test starts, records the shuffled option order in results so the
  // confusion matrix A/B mapping always matches what the user saw.
  const setupIteration = useCallback((test, testIndex, isNewTest, repeatIndex = 0) => {
    const { entry, baseType } = getTestType(test.testType);
    const shouldReshuffle = isNewTest || entry.reshuffleEveryIteration;
    const ordered = shouldReshuffle ? shuffle(test.options) : shuffledOptionsRef.current;
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

    let xOpt = null;
    let yOpt = null;
    let triplet = null;
    let correctOdd = null;

    if (baseType === 'abx' || baseType === 'abxy') {
      const randomIndex = Math.floor(Math.random() * ordered.length);
      const randomOption = ordered[randomIndex];
      xOpt = { name: 'X', audioUrl: randomOption.audioUrl };
      setXOption(xOpt);

      if (baseType === 'abxy') {
        const otherIndex = randomIndex === 0 ? 1 : 0;
        const otherOption = ordered[otherIndex];
        yOpt = { name: 'Y', audioUrl: otherOption.audioUrl };
        setYOption(yOpt);
      } else {
        setYOption(null);
      }
    } else if (baseType === 'triangle') {
      // Pick one option as odd, duplicate the other
      const oddIdx = Math.floor(Math.random() * ordered.length);
      const dupIdx = oddIdx === 0 ? 1 : 0;
      correctOdd = ordered[oddIdx];
      // Build triplet: [dup, odd, dup] then shuffle
      triplet = shuffle([
        { ...ordered[dupIdx] },
        { ...correctOdd },
        { ...ordered[dupIdx] },
      ]);
      setTriangleTriplet(triplet);
      setTriangleCorrectOption(correctOdd);
    } else if (baseType === '2afc-sd') {
      // Generate trial sequence on first iteration
      if (isNewTest) {
        sameDiffTrialSeqRef.current = generateTrialSequence(test.repeat, test.balanced);
      }
      // Pop the next trial type
      const trialType = sameDiffTrialSeqRef.current[repeatIndex];
      const pType = (trialType === 'AA' || trialType === 'BB') ? 'same' : 'different';
      // Build pair from the two options (ordered[0]=A, ordered[1]=B)
      const pairMap = {
        AA: [ordered[0], ordered[0]],
        BB: [ordered[1], ordered[1]],
        AB: [ordered[0], ordered[1]],
        BA: [ordered[1], ordered[0]],
      };
      const sdPair = pairMap[trialType].map((o) => ({ ...o }));
      setSameDiffPair(sdPair);
      setSameDiffPairType(pType);
      iterationStartRef.current = Date.now();
      return { shuffled: ordered, xOpt: null, yOpt: null, triplet: null, sdPair };
    } else {
      setXOption(null);
      setYOption(null);
      setTriangleTriplet(null);
      setTriangleCorrectOption(null);
    }

    iterationStartRef.current = Date.now();
    return { shuffled: ordered, xOpt, yOpt, triplet, sdPair: null };
  }, [generateTrialSequence]);

  // Start test (from welcome screen)
  const handleStart = useCallback((formData) => {
    setForm(formData);
    setTestStep(0);
    setRepeatStep(0);
    if (config.tests.length > 0) {
      const { shuffled, xOpt, yOpt, triplet, sdPair } = setupIteration(config.tests[0], 0, true);
      loadIterationAudio(shuffled, xOpt, yOpt, triplet, sdPair);
    }
  }, [config, setupIteration, loadIterationAudio]);

  // Restart test (from results screen) — reuses cached audio
  const handleRestart = useCallback(() => {
    setTestStep(0);
    setRepeatStep(0);
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
      const { shuffled, xOpt, yOpt, triplet, sdPair } = setupIteration(config.tests[0], 0, true);
      loadIterationAudio(shuffled, xOpt, yOpt, triplet, sdPair);
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

  // Advance to next iteration or test
  const advanceStep = (updatedResults) => {
    const test = config.tests[testStep];

    if (repeatStep + 1 < test.repeat) {
      // Next repeat of same test
      const nextRepeat = repeatStep + 1;
      setRepeatStep(nextRepeat);
      const { shuffled, xOpt, yOpt, triplet, sdPair } = setupIteration(test, testStep, false, nextRepeat);
      loadIterationAudio(shuffled, xOpt, yOpt, triplet, sdPair);
    } else if (testStep + 1 < config.tests.length) {
      // Next test
      const nextTest = testStep + 1;
      setTestStep(nextTest);
      setRepeatStep(0);
      const { shuffled, xOpt, yOpt, triplet, sdPair } = setupIteration(config.tests[nextTest], nextTest, true);
      loadIterationAudio(shuffled, xOpt, yOpt, triplet, sdPair);
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
  const stepStr = `${repeatStep + 1}/${test.repeat}`;
  const crossfadeForced = currentTest?.crossfade || false;

  const { entry, hasConfidence, baseType } = getTestType(test.testType);
  const TestComponent = entry.testComponent;
  const submitHandler = entry.submitType === 'samediff' ? handleSameDiffSubmit
    : entry.submitType === 'ab' ? handleAbSubmit
    : handleAbxSubmit;

  // Common props shared by all test types
  const commonProps = {
    key: testStep,
    name: test.name,
    description: test.description,
    stepStr,
    engine,
    channelData: testChannelData,
    crossfadeForced,
    onSubmit: submitHandler,
  };

  // Type-specific props
  let typeProps = {};
  if (baseType === 'ab') {
    typeProps = { options: currentOptions };
  } else if (baseType === 'abx') {
    typeProps = {
      options: currentOptions,
      xOption,
      totalIterations: test.repeat,
      iterationResults: results[testStep].userSelectionsAndCorrects,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === 'abxy') {
    typeProps = {
      options: currentOptions,
      xOption,
      yOption,
      totalIterations: test.repeat,
      iterationResults: results[testStep].userSelectionsAndCorrects,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === 'triangle') {
    typeProps = {
      triplet: triangleTriplet,
      correctOption: triangleCorrectOption,
      totalIterations: test.repeat,
      iterationResults: results[testStep].userSelectionsAndCorrects,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  } else if (baseType === '2afc-sd') {
    typeProps = {
      pair: sameDiffPair,
      pairType: sameDiffPairType,
      options: currentOptions,
      totalIterations: test.repeat,
      iterationResults: results[testStep].userSelectionsAndCorrects,
      showConfidence: hasConfidence,
      showProgress: test.showProgress,
    };
  }

  return <TestComponent {...commonProps} {...typeProps} />;
}
