/**
 * useTestFlow — generic test lifecycle engine.
 *
 * Orchestrates the test flow (start, iterate, submit, advance, complete) by
 * delegating all type-specific logic to plugin functions registered in the
 * test type registry. No test type names or per-type branching appear here.
 *
 * Anti-cheat: _iterationMeta is module-level (invisible to React DevTools).
 * Setup returns { ui, secure }. Framework stores secure in _iterationMeta,
 * passes it to processSubmit at submit time, then clears it.
 * Trial records are private (trialRecordsRef), merged into results at completion.
 *
 * Reports ALL lifecycle events via onEvent callback — never emits postMessage directly.
 * Loading events fire synchronously from fetch callback (not through React state/effects).
 *
 * See docs/test-type-architecture.md for the full plugin contract.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { loadAndValidate } from '../audio/audioLoader';
import { getTestType } from '../utils/testTypeRegistry';
import { createShareUrl } from '../utils/share';
import { formatResultsForEmit } from '../utils/formatResults';

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

  // Per-iteration UI props from setup's `ui` return. Safe (no answer data).
  const uiPropsRef = useRef({});
  // Re-render trigger for ref updates (refs don't cause re-renders)
  const [, setIterationVersion] = useState(0);

  // Per-test persistent state — opaque blob managed by type plugins.
  // e.g. SameDiff's balanced bag, Staircase's adaptive state + familiarizing flag.
  const testStateRef = useRef(null);

  // Anti-cheat: iteration key counter — components use this for state resets
  const [iterationKey, setIterationKey] = useState(0);

  // Anti-cheat: progress dots — {isCorrect, confidence}[] for progress bar rendering
  const [progressDots, setProgressDots] = useState([]);

  // Anti-cheat: private trial records — full data for stats, never exposed as props.
  const trialRecordsRef = useRef([]);

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
   * Setup test iteration — async. Delegates to type plugin's setup function.
   * Stores secure data in module-level _iterationMeta (anti-cheat).
   * Stores ui props in uiPropsRef for prop construction.
   */
  const setupIteration = useCallback(async (test, testIndex, isNewTest) => {
    const { entry, hasConfidence, baseType } = getTestType(test.testType);

    const result = await entry.setup({
      options: test.options,
      testConfig: test,
      isNewTest,
      testState: testStateRef.current,
      hasConfidence,
      shuffledOptions: shuffledOptionsRef.current,
      baseType,
    });

    // Anti-cheat: store secure data at module level (invisible to DevTools)
    _iterationMeta = result.secure;

    // Store ui props for prop construction (safe — no answer data)
    uiPropsRef.current = result.ui;

    // Store updated test state (opaque to framework)
    testStateRef.current = result.testState;

    // Track shuffled options
    if (isNewTest) shuffledOptionsRef.current = result.shuffledOptions;
    setCurrentOptions(result.shuffledOptions);

    // Store option names in results on first iteration
    if (isNewTest) {
      const names = result.shuffledOptions.map((o) => o.name);
      setResults((prev) => {
        const r = JSON.parse(JSON.stringify(prev));
        r[testIndex].optionNames = names;
        return r;
      });
    }

    iterationStartRef.current = Date.now();
    setIterationKey((k) => k + 1);
    setIterationVersion((v) => v + 1);
    return { bufferSources: result.bufferSources };
  }, []);

  /**
   * Merge private trial records into results for the completed test.
   * Delegates to type plugin's mergeResults function.
   */
  const mergeTrialRecords = useCallback((testIndex, currentResults) => {
    const test = config.tests[testIndex];
    const { entry } = getTestType(test.testType);
    const newResults = JSON.parse(JSON.stringify(currentResults));

    const merged = entry.mergeResults(
      JSON.parse(JSON.stringify(trialRecordsRef.current)),
      testStateRef.current,
      test,
    );
    Object.assign(newResults[testIndex], merged);

    return newResults;
  }, [config]);

  /**
   * Advance to next iteration or test.
   * Uses type plugin's isComplete to determine whether to continue.
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

    const complete = entry.isComplete(testStateRef.current, repeatStep, test);

    if (!complete) {
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
        testStateRef.current = null;
        const iterationData = await setupIteration(config.tests[nextTest], nextTest, true);
        loadBuffers(iterationData.bufferSources);
      } else {
        setTestStep(config.tests.length);
      }
    }
  };

  /**
   * Unified submit handler — delegates to type plugin's processSubmit.
   */
  const handleSubmit = (answerId, confidence) => {
    const now = Date.now();
    const test = config.tests[testStep];
    const { entry } = getTestType(test.testType);
    const timing = { startedAt: iterationStartRef.current, finishedAt: now };

    const result = entry.processSubmit({
      answerId,
      confidence,
      secure: _iterationMeta,
      options: currentOptions,
      testState: testStateRef.current,
      timing,
      ui: uiPropsRef.current,
    });

    // Update test state from plugin
    testStateRef.current = result.testState;

    // Clear secure data (anti-cheat)
    _iterationMeta = null;

    // Familiarization: re-run setup without recording trial/progress
    if (result.isFamiliarization) {
      setupIteration(test, testStep, false).then((data) => loadBuffers(data.bufferSources));
      return;
    }

    // Record trial and update progress
    if (result.trialRecord) {
      trialRecordsRef.current.push(result.trialRecord);
    }
    if (result.progressDot) {
      setProgressDots((prev) => [...prev, result.progressDot]);
    }

    advanceStep(result.isCorrect);
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
    testStateRef.current = null;
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

  // Build test props only when on test screen.
  // Common props from framework + type-specific ui props from setup's return.
  let testComponent = null;
  let testProps = null;
  if (config && testStep >= 0 && testStep < config.tests.length) {
    const test = config.tests[testStep];
    const crossfadeForced = currentTest?.crossfade ?? null;
    const { entry } = getTestType(test.testType);
    testComponent = entry.testComponent;

    const stepStr = entry.isAdaptive
      ? `Trial ${repeatStep + 1}`
      : `${repeatStep + 1}/${test.repeat}`;

    testProps = {
      key: testStep,
      name: test.name,
      description: test.description,
      stepStr,
      channelData: testChannelData,
      crossfadeForced,
      onSubmit: handleSubmit,
      iterationKey,
      progressDots,
      ...uiPropsRef.current,
    };
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
