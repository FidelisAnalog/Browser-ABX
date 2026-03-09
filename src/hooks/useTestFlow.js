/**
 * useTestFlow — test state machine hook.
 * Owns the entire test lifecycle: audio fetch/decode, test flow, iteration setup,
 * commitment creation, answer verification, results accumulation, screen derivation,
 * and prop construction.
 *
 * Anti-cheat: _iterationMeta is module-level (invisible to React DevTools).
 * Trial records are private (trialRecordsRef), merged into results at completion.
 *
 * Reports ALL lifecycle events via onEvent callback — never emits postMessage directly.
 * Loading events fire synchronously from fetch callback (not through React state/effects).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { loadAndValidate } from '../audio/audioLoader';
import { shuffle } from '../utils/shuffle';
import { getTestType } from '../utils/testTypeRegistry';
import { createShareUrl } from '../utils/share';
import { formatResultsForEmit } from '../utils/formatResults';
import { createCommitment, verifyAnswer, deriveCorrectId } from '../utils/commitment';
import {
  createStaircaseState, createInterleavedState, getCurrentLevel,
  recordResponse, pickInterleavedTrack, recordInterleavedResponse,
  isInterleavedComplete, minRemainingTrials, minInterleavedRemainingTrials,
} from '../stats/staircase';

/**
 * Module-level storage for answer reconstruction data.
 * NOT visible in React DevTools (only hooks are inspectable).
 * Set in setupIteration, consumed in handleSubmit, then cleared.
 */
let _iterationMeta = null;

/**
 * @param {object} params
 * @param {object} params.config - Parsed config object
 * @param {string} [params.configUrl] - URL for share URL construction
 * @param {object} params.audioEngine - { initialized, loadBuffers, setCrossfadeConfig, engineFacade, sampleRateInfo }
 * @param {(type: string, data: object) => void} params.onEvent - Lifecycle callback
 * @param {({ decodedCache: Map, sampleRate: number }) => void} params.onAudioLoaded - Called when audio fetch/decode completes
 * @param {boolean} params.skipWelcome
 * @param {boolean} params.skipResults
 * @param {boolean} params.postResults
 */
export function useTestFlow({ config, configUrl, audioEngine, onEvent, onAudioLoaded, skipWelcome, skipResults, postResults }) {
  const { initialized: audioInitialized, loadBuffers, setCrossfadeConfig } = audioEngine;

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
  const trialRecordsRef = useRef([]);

  // Adaptive test state — persists across trials within a test.
  const adaptiveStateRef = useRef(null);

  // Staircase familiarization phase — true before first real trial
  const familiarizingRef = useRef(false);

  // Iteration timing
  const iterationStartRef = useRef(null);

  // Track whether completed event has been reported (prevent duplicates on re-render)
  const completedEmittedRef = useRef(false);

  // --- Audio loading state ---
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });
  const [audioError, setAudioError] = useState(null);
  const decodedCacheRef = useRef(new Map());

  // Extract unique audio URLs from config
  const audioUrls = useMemo(() => {
    if (!config) return [];
    const urls = new Set();
    for (const opt of config.options) {
      urls.add(opt.audioUrl);
    }
    return Array.from(urls);
  }, [config]);

  // Fetch and decode all audio files
  useEffect(() => {
    if (audioUrls.length === 0) return;
    const controller = new AbortController();

    loadAndValidate(audioUrls, (loaded, total) => {
      if (!controller.signal.aborted) {
        // Emit loading event synchronously — bypasses React state/effect cycle
        onEvent('loading', { loaded, total });
        setLoadProgress({ loaded, total });
      }
    }, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        const cache = new Map();
        for (let i = 0; i < audioUrls.length; i++) {
          cache.set(audioUrls[i], data.decoded[i]);
        }
        decodedCacheRef.current = cache;
        onAudioLoaded({ decodedCache: cache, sampleRate: data.sampleRate });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setAudioError(err.message);
          onEvent('error', { error: err.message });
        }
      });
    return () => { controller.abort(); };
  }, [audioUrls, onEvent, onAudioLoaded]);

  /**
   * Get channel 0 data for each option + extra waveform tracks.
   * Derived from decoded cache, not AudioBuffers.
   * @param {object} test - Test config object with options[] and testType
   * @returns {Float32Array[]}
   */
  const getChannelData = useCallback((test) => {
    const cache = decodedCacheRef.current;
    if (cache.size === 0) return [];
    const ch0 = test.options.map((opt) => {
      const decoded = cache.get(opt.audioUrl);
      return decoded ? decoded.samples[0] : new Float32Array(0);
    });
    const { entry } = getTestType(test.testType);
    for (let extra = 0; extra < entry.waveformExtraTracks; extra++) {
      if (ch0.length > 0) ch0.push(ch0[0]);
    }
    return ch0;
  }, []);

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

  // Get current test config (for crossfade settings)
  const currentTest = config && testStep >= 0 && testStep < config.tests.length
    ? config.tests[testStep]
    : null;

  // Update crossfade config when test changes
  useEffect(() => {
    setCrossfadeConfig(currentTest);
  }, [currentTest, setCrossfadeConfig]);

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

  /**
   * Draw a single 2AFC-SD trial type from a bag (balanced) or randomly.
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
   */
  const setupIteration = useCallback(async (test, testIndex, isNewTest) => {
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
   * Advance to next iteration or test.
   */
  const advanceStep = async (isCorrect) => {
    const test = config.tests[testStep];
    const { entry } = getTestType(test.testType);

    onEvent('progress', {
      testIndex: testStep,
      testName: test.name,
      trialIndex: repeatStep,
      totalTests: config.tests.length,
      totalTrials: entry.isAdaptive ? null : test.repeat,
      isCorrect,
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
      const iterationData = await setupIteration(test, testStep, false);
      loadBuffers(iterationData.bufferSources);
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
        loadBuffers(iterationData.bufferSources);
      } else {
        setTestStep(config.tests.length);
      }
    }
  };

  /**
   * Unified submit handler for all test types.
   */
  const handleSubmit = (answerId, confidence) => {
    const now = Date.now();
    const test = config.tests[testStep];
    const { baseType } = getTestType(test.testType);
    const iterState = iterationStateRef.current;

    // Staircase familiarization: skip to first real trial
    if (baseType === '2afc-staircase' && iterState.familiarizing) {
      familiarizingRef.current = false;
      setupIteration(test, testStep, false).then((data) => loadBuffers(data.bufferSources));
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

  // Start test
  const handleStart = useCallback(async (formData) => {
    setForm(formData);
    setTestStep(0);
    setRepeatStep(0);
    setProgressDots([]);
    trialRecordsRef.current = [];
    onEvent('started', { form: formData });
    if (config.tests.length > 0) {
      const iterationData = await setupIteration(config.tests[0], 0, true);
      loadBuffers(iterationData.bufferSources);
    }
  }, [config, setupIteration, loadBuffers, onEvent]);

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
    testStateRef.current = {};
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
      loadBuffers(iterationData.bufferSources);
    }
  }, [config, setupIteration, loadBuffers]);

  // Report completed when all tests are done
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
      onEvent('completed', { results: formatResultsForEmit(results), stats: allStats, shareUrl, form });
    } else {
      onEvent('completed', {});
    }
  }, [config, testStep, postResults, results, form, configUrl, onEvent]);

  // --- Derive screen ---
  const screen = !config ? 'loading'
    : testStep === -1 ? (skipWelcome ? 'loading' : 'welcome')
    : testStep >= (config?.tests?.length ?? 0) ? 'results'
    : 'test';

  // --- Derive channel data for current test ---
  const testChannelData = useMemo(() => {
    if (!config || testStep < 0 || testStep >= config.tests.length) return [];
    return getChannelData(config.tests[testStep]);
  }, [config, testStep, getChannelData]);

  // --- Build props for each screen ---

  const welcomeProps = config ? {
    description: config.welcome?.description,
    form: config.welcome?.form,
    initialized: audioInitialized,
    onStart: handleStart,
  } : null;

  // Build test props only when on test screen
  let testComponent = null;
  let testProps = null;
  if (config && testStep >= 0 && testStep < config.tests.length) {
    const test = config.tests[testStep];
    const crossfadeForced = currentTest?.crossfade ?? null;
    const { entry, hasConfidence, baseType } = getTestType(test.testType);
    testComponent = entry.testComponent;

    const stepStr = entry.isAdaptive
      ? `Trial ${repeatStep + 1}`
      : `${repeatStep + 1}/${test.repeat}`;

    const commonProps = {
      key: testStep,
      name: test.name,
      description: test.description,
      stepStr,
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

    testProps = { ...commonProps, ...typeProps };
  }

  const resultsProps = config ? {
    description: config.results?.description,
    results,
    config,
    configUrl,
    onRestart: handleRestart,
  } : null;

  return {
    screen,
    testComponent,
    testProps,
    welcomeProps,
    resultsProps,
    sampleRateInfo: audioEngine.sampleRateInfo,
    loadProgress,
    audioError,
    skipWelcome,
    skipResults,
  };
}
