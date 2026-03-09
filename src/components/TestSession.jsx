/**
 * TestSession — test execution page.
 * Composes useAudioEngine + useTestFlow, renders the right screen.
 * No test logic, no state machines, no event emission.
 */

import { useMemo, useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useTestFlow } from '../hooks/useTestFlow';
import Welcome from './Welcome';
import Results from './Results';
import SampleRateInfo from './SampleRateInfo';

export default function TestSession({ config, configUrl, postResults = true, skipWelcome = false, skipResults = false, onScreen, onTestEvent }) {
  const audioUrls = useMemo(() => {
    if (!config) return [];
    const urls = new Set();
    for (const opt of config.options) {
      urls.add(opt.audioUrl);
    }
    return Array.from(urls);
  }, [config]);

  const audioEngine = useAudioEngine(audioUrls);

  const {
    screen,
    testComponent: TestComponent,
    testProps,
    welcomeProps,
    resultsProps,
    sampleRateInfo,
    loadProgress,
  } = useTestFlow({
    config,
    configUrl,
    audioEngine,
    onEvent: onTestEvent,
    skipWelcome,
    skipResults,
    postResults,
  });

  // Report screen to parent
  useEffect(() => { onScreen?.(screen); }, [screen, onScreen]);

  // Report load progress as lifecycle event
  useEffect(() => {
    if (audioEngine.loadProgress.total > 0) {
      onTestEvent('loading', { loaded: audioEngine.loadProgress.loaded, total: audioEngine.loadProgress.total });
    }
  }, [audioEngine.loadProgress.loaded, audioEngine.loadProgress.total, onTestEvent]);

  // --- Render ---

  if (audioEngine.audioError) {
    return (
      <>
        <Typography color="error" variant="h6">Error</Typography>
        <Typography>{audioEngine.audioError}</Typography>
      </>
    );
  }

  if (screen === 'loading') {
    if (skipWelcome) {
      return (
        <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" flex={1} gap={2}>
          <CircularProgress />
          {loadProgress.total > 0 && (
            <Typography variant="body2" color="text.secondary">
              Loading audio ({loadProgress.loaded}/{loadProgress.total})
            </Typography>
          )}
        </Box>
      );
    }
    return null;
  }

  if (screen === 'welcome') {
    return (
      <>
        {sampleRateInfo && (
          <SampleRateInfo info={sampleRateInfo} />
        )}
        <Welcome {...welcomeProps} />
      </>
    );
  }

  if (screen === 'results') {
    if (skipResults) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" flex={1}>
          <Typography variant="h6" color="text.secondary">Test complete</Typography>
        </Box>
      );
    }
    return <Results {...resultsProps} />;
  }

  // Test screen
  if (TestComponent && testProps) {
    return <TestComponent {...testProps} engine={audioEngine.engineFacade} />;
  }

  return null;
}
