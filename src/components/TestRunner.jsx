/**
 * TestRunner — main test orchestrator.
 * Handles config loading, audio initialization, test sequencing, and results collection.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, CircularProgress, Container, Typography } from '@mui/material';
import { parseConfig } from '../utils/config';
import { loadAndValidate, createAudioBuffer } from '../audio/audioLoader';
import { AudioEngine } from '../audio/audioEngine';
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
  const [audioData, setAudioData] = useState(null);
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

  // Load audio
  useEffect(() => {
    if (audioUrls.length === 0) return;

    loadAndValidate(audioUrls, (loaded, total) => {
      setLoadProgress({ loaded, total });
    })
      .then((data) => {
        setAudioData(data);
        setAudioInitialized(true);
      })
      .catch((err) => setConfigError(err.message));
  }, [audioUrls]);

  // Get current test config
  const currentTest = config && testStep >= 0 && testStep < config.tests.length
    ? config.tests[testStep]
    : null;

  // Audio engine for current test
  const currentTestUrls = useMemo(() => {
    if (!currentOptions || currentOptions.length === 0) return [];
    const urls = currentOptions.map((o) => o.audioUrl);
    if (xOption) urls.push(xOption.audioUrl);
    return urls;
  }, [currentOptions, xOption]);

  const engine = useAudioEngine({
    urls: currentTestUrls,
    duckingForced: currentTest?.ducking || false,
    duckDuration: currentTest?.duckDuration || 5,
  });

  // Build AudioBuffers for current test options from cached data
  const currentAudioBuffers = useMemo(() => {
    if (!audioData || !engine.sampleRateInfo || currentTestUrls.length === 0) return [];
    // We need AudioBuffers but our engine already loaded them
    // This is a placeholder — the engine handles buffer management internally
    return [];
  }, [audioData, engine.sampleRateInfo, currentTestUrls]);

  // Setup test iteration (shuffle options, pick X for ABX)
  const setupIteration = useCallback((test) => {
    const shuffled = shuffle(test.options);
    setCurrentOptions(shuffled);

    if (test.testType.toLowerCase() === 'abx') {
      const randomOption = shuffled[Math.floor(Math.random() * shuffled.length)];
      setXOption({
        name: 'X',
        audioUrl: randomOption.audioUrl,
      });
    } else {
      setXOption(null);
    }
  }, []);

  // Start test
  const handleStart = (formData) => {
    setForm(formData);
    setTestStep(0);
    setRepeatStep(0);
    if (config.tests.length > 0) {
      setupIteration(config.tests[0]);
    }
  };

  // Handle AB test submission
  const handleAbSubmit = (selectedOption) => {
    const newResults = JSON.parse(JSON.stringify(results));
    const option = { ...selectedOption };
    newResults[testStep].userSelections.push(option);
    setResults(newResults);
    nextStep(newResults);
  };

  // Handle ABX test submission
  const handleAbxSubmit = (selectedOption, correctOption) => {
    const newResults = JSON.parse(JSON.stringify(results));
    newResults[testStep].userSelectionsAndCorrects.push({
      selectedOption: { ...selectedOption },
      correctOption: { ...correctOption },
    });
    setResults(newResults);
    nextStep(newResults);
  };

  // Advance to next iteration or test
  const nextStep = (updatedResults) => {
    if (repeatStep + 1 < config.tests[testStep].repeat) {
      // Next repeat
      const nextRepeat = repeatStep + 1;
      setRepeatStep(nextRepeat);
      setupIteration(config.tests[testStep]);
    } else if (testStep + 1 < config.tests.length) {
      // Next test
      const nextTest = testStep + 1;
      setTestStep(nextTest);
      setRepeatStep(0);
      setupIteration(config.tests[nextTest]);
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
        audioBuffers={currentAudioBuffers}
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
        audioBuffers={currentAudioBuffers}
        onSubmit={handleAbxSubmit}
      />
    );
  }

  return (
    <Typography color="error">Unsupported test type: {test.testType}</Typography>
  );
}
