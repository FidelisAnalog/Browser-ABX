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
import { useAudioEngine } from '../audio/useAudioEngine';
import { shuffle } from '../utils/shuffle';
import Welcome from './Welcome';
import ABTest from './ABTest';
import ABXTest from './ABXTest';
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

  // Current test options (shuffled per iteration)
  const [currentOptions, setCurrentOptions] = useState([]);
  const [xOption, setXOption] = useState(null);

  // Current AudioBuffers for the active test iteration
  const [currentBuffers, setCurrentBuffers] = useState([]);

  // Get current test config (for ducking settings)
  const currentTest = config && testStep >= 0 && testStep < config.tests.length
    ? config.tests[testStep]
    : null;

  // Create audio engine once when sample rate is known
  const engine = useAudioEngine({
    sampleRate: audioSampleRate,
    duckingForced: currentTest?.ducking || false,
    duckDuration: currentTest?.duckDuration || 5,
  });

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

  /**
   * Build AudioBuffers for a set of options (+ optional X) and load into engine.
   */
  const loadIterationAudio = useCallback((options, xOpt) => {
    const ctx = engine.getContext();
    if (!ctx) return;

    const cache = decodedCacheRef.current;
    const buffers = options.map((opt) => {
      const decoded = cache.get(opt.audioUrl);
      return createAudioBuffer(ctx, decoded);
    });

    if (xOpt) {
      const xDecoded = cache.get(xOpt.audioUrl);
      buffers.push(createAudioBuffer(ctx, xDecoded));
    }

    setCurrentBuffers(buffers);
    engine.loadBuffers(buffers);
  }, [engine]);

  // Setup test iteration (shuffle options, pick X for ABX)
  const setupIteration = useCallback((test) => {
    const shuffled = shuffle(test.options);
    setCurrentOptions(shuffled);

    let xOpt = null;
    if (test.testType.toLowerCase() === 'abx') {
      const randomOption = shuffled[Math.floor(Math.random() * shuffled.length)];
      xOpt = { name: 'X', audioUrl: randomOption.audioUrl };
      setXOption(xOpt);
    } else {
      setXOption(null);
    }

    return { shuffled, xOpt };
  }, []);

  // Start test (from welcome screen)
  const handleStart = useCallback((formData) => {
    setForm(formData);
    setTestStep(0);
    setRepeatStep(0);
    if (config.tests.length > 0) {
      const { shuffled, xOpt } = setupIteration(config.tests[0]);
      // Defer audio load slightly to ensure engine has created its context
      setTimeout(() => loadIterationAudio(shuffled, xOpt), 50);
    }
  }, [config, setupIteration, loadIterationAudio]);

  // Handle AB test submission
  const handleAbSubmit = (selectedOption) => {
    const newResults = JSON.parse(JSON.stringify(results));
    newResults[testStep].userSelections.push({ ...selectedOption });
    setResults(newResults);
    advanceStep(newResults);
  };

  // Handle ABX test submission
  const handleAbxSubmit = (selectedOption, correctOption) => {
    const newResults = JSON.parse(JSON.stringify(results));
    newResults[testStep].userSelectionsAndCorrects.push({
      selectedOption: { ...selectedOption },
      correctOption: { ...correctOption },
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
      const { shuffled, xOpt } = setupIteration(test);
      setTimeout(() => loadIterationAudio(shuffled, xOpt), 0);
    } else if (testStep + 1 < config.tests.length) {
      // Next test
      const nextTest = testStep + 1;
      setTestStep(nextTest);
      setRepeatStep(0);
      const { shuffled, xOpt } = setupIteration(config.tests[nextTest]);
      setTimeout(() => loadIterationAudio(shuffled, xOpt), 0);
    } else {
      // Done — show results
      setTestStep(config.tests.length);
    }
  };

  // --- Render ---

  if (configError) {
    return (
      <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={4}>
        <Container maxWidth="sm">
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
        {engine.sampleRateInfo && (
          <Container maxWidth="sm" sx={{ pt: 2 }}>
            <SampleRateInfo info={engine.sampleRateInfo} />
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
        <Container maxWidth="sm">
          <Results
            description={config.results?.description}
            results={results}
            config={config}
          />
        </Container>
      </Box>
    );
  }

  // Test screens
  const test = config.tests[testStep];
  const stepStr = `${repeatStep + 1}/${test.repeat}`;

  if (test.testType.toLowerCase() === 'ab') {
    return (
      <ABTest
        key={`${testStep}.${repeatStep}`}
        name={test.name}
        description={test.description}
        stepStr={stepStr}
        options={currentOptions}
        engine={engine}
        audioBuffers={currentBuffers}
        onSubmit={handleAbSubmit}
      />
    );
  }

  if (test.testType.toLowerCase() === 'abx') {
    return (
      <ABXTest
        key={`${testStep}.${repeatStep}`}
        name={test.name}
        description={test.description}
        stepStr={stepStr}
        options={currentOptions}
        xOption={xOption}
        engine={engine}
        audioBuffers={currentBuffers}
        onSubmit={handleAbxSubmit}
      />
    );
  }

  return (
    <Typography color="error">Unsupported test type: {test.testType}</Typography>
  );
}
