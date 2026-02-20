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
import Welcome from './Welcome';
import ABTest from './ABTest';
import ABXTest from './ABXTest';
import Results from './Results';
import SampleRateInfo from './SampleRateInfo';

/** Test type is ABX-family (ABX or ABX+C). */
function isAbxType(testType) {
  const t = testType.toLowerCase();
  return t === 'abx' || t === 'abx+c';
}

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
    parseConfig(configUrl)
      .then((cfg) => {
        setConfig(cfg);
        setResults(
          cfg.tests.map((test) => ({
            name: test.name,
            testType: test.testType,
            optionNames: test.options.map((o) => o.name),
            nOptions: test.options.length,
            ...(test.testType.toLowerCase() === 'ab'
              ? { userSelections: [] }
              : { userSelectionsAndCorrects: [] }),
          }))
        );
      })
      .catch((err) => setConfigError(err.message));
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

    loadAndValidate(audioUrls, (loaded, total) => {
      setLoadProgress({ loaded, total });
    })
      .then((data) => {
        // Cache decoded data by URL
        const cache = new Map();
        for (let i = 0; i < audioUrls.length; i++) {
          cache.set(audioUrls[i], data.decoded[i]);
        }
        decodedCacheRef.current = cache;
        setAudioSampleRate(data.sampleRate);
        setAudioInitialized(true);
      })
      .catch((err) => setConfigError(err.message));
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
    // For ABX, add the first option again (X is always one of them — same waveform shape)
    if (isAbxType(test.testType) && ch0.length > 0) {
      ch0.push(ch0[0]);
    }
    return ch0;
  }, [config, testStep]);

  /**
   * Build AudioBuffers for a set of options (+ optional X) and load into engine.
   */
  const loadIterationAudio = useCallback((options, xOpt) => {
    if (!engineRef.current) return;
    const ctx = engineRef.current.context;

    const cache = decodedCacheRef.current;
    const buffers = options.map((opt) => {
      const decoded = cache.get(opt.audioUrl);
      return createAudioBuffer(ctx, decoded);
    });

    if (xOpt) {
      const xDecoded = cache.get(xOpt.audioUrl);
      buffers.push(createAudioBuffer(ctx, xDecoded));
    }

    engineRef.current.loadBuffers(buffers);
  }, []);

  // Setup test iteration — shuffle once on first iteration, reuse on repeats
  const setupIteration = useCallback((test, isNewTest) => {
    const ordered = isNewTest ? shuffle(test.options) : shuffledOptionsRef.current;
    if (isNewTest) shuffledOptionsRef.current = ordered;
    setCurrentOptions(ordered);

    let xOpt = null;
    if (isAbxType(test.testType)) {
      const randomOption = ordered[Math.floor(Math.random() * ordered.length)];
      xOpt = { name: 'X', audioUrl: randomOption.audioUrl };
      setXOption(xOpt);
    } else {
      setXOption(null);
    }

    iterationStartRef.current = Date.now();
    return { shuffled: ordered, xOpt };
  }, []);

  // Start test (from welcome screen)
  const handleStart = useCallback((formData) => {
    setForm(formData);
    setTestStep(0);
    setRepeatStep(0);
    if (config.tests.length > 0) {
      const { shuffled, xOpt } = setupIteration(config.tests[0], true);
      loadIterationAudio(shuffled, xOpt);
    }
  }, [config, setupIteration, loadIterationAudio]);

  // Restart test (from results screen) — reuses cached audio
  const handleRestart = useCallback(() => {
    // Reset results to fresh empty state
    setResults(
      config.tests.map((test) => ({
        name: test.name,
        testType: test.testType,
        optionNames: test.options.map((o) => o.name),
        nOptions: test.options.length,
        ...(test.testType.toLowerCase() === 'ab'
          ? { userSelections: [] }
          : { userSelectionsAndCorrects: [] }),
      }))
    );
    setTestStep(0);
    setRepeatStep(0);
    if (config.tests.length > 0) {
      const { shuffled, xOpt } = setupIteration(config.tests[0], true);
      loadIterationAudio(shuffled, xOpt);
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

  // Handle ABX test submission
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

  // Advance to next iteration or test
  const advanceStep = (updatedResults) => {
    const test = config.tests[testStep];

    if (repeatStep + 1 < test.repeat) {
      // Next repeat of same test
      const nextRepeat = repeatStep + 1;
      setRepeatStep(nextRepeat);
      const { shuffled, xOpt } = setupIteration(test, false);
      loadIterationAudio(shuffled, xOpt);
    } else if (testStep + 1 < config.tests.length) {
      // Next test
      const nextTest = testStep + 1;
      setTestStep(nextTest);
      setRepeatStep(0);
      const { shuffled, xOpt } = setupIteration(config.tests[nextTest], true);
      loadIterationAudio(shuffled, xOpt);
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

  if (test.testType.toLowerCase() === 'ab') {
    return (
      <ABTest
        key={testStep}
        name={test.name}
        description={test.description}
        stepStr={stepStr}
        options={currentOptions}
        engine={engine}
        channelData={testChannelData}
        crossfadeForced={crossfadeForced}
        onSubmit={handleAbSubmit}
      />
    );
  }

  if (isAbxType(test.testType)) {
    return (
      <ABXTest
        key={testStep}
        name={test.name}
        description={test.description}
        stepStr={stepStr}
        options={currentOptions}
        xOption={xOption}
        engine={engine}
        channelData={testChannelData}
        crossfadeForced={crossfadeForced}
        totalIterations={test.repeat}
        iterationResults={results[testStep].userSelectionsAndCorrects}
        showConfidence={test.testType.toLowerCase() === 'abx+c'}
        onSubmit={handleAbxSubmit}
      />
    );
  }

  return (
    <Typography color="error">Unsupported test type: {test.testType}</Typography>
  );
}
