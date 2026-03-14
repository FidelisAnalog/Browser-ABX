/**
 * TestSession — test execution page.
 * Composes useAudioEngine + useTestFlow, renders the right screen.
 * No test logic, no state machines, no event emission.
 *
 * Wiring: useTestFlow fetches audio, reports decoded data via onAudioLoaded.
 * TestSession stores it in state and passes to useAudioEngine, which creates the engine.
 * useTestFlow receives the engine on the next render for loadBuffers/setCrossfadeConfig.
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useTestFlow } from '../hooks/useTestFlow';
import Welcome from './Welcome';
import Results from './Results';
import SampleRateInfo from './SampleRateInfo';
import TestPanel from './TestPanel';

export default function TestSession({ config, configUrl, postResults = true, skipWelcome = false, skipResults = false, onScreen, onTestEvent }) {
  // Audio data produced by useTestFlow's fetch, consumed by useAudioEngine
  const [audioData, setAudioData] = useState({ decodedCache: null, sampleRate: null });
  const onAudioLoaded = useCallback((data) => setAudioData(data), []);

  const audioEngine = useAudioEngine(audioData.decodedCache, audioData.sampleRate);

  const {
    screen,
    testComponent: TestComponent,
    testProps,
    welcomeProps,
    resultsProps,
    sampleRateInfo,
    loadProgress,
    audioError,
  } = useTestFlow({
    config,
    configUrl,
    audioEngine,
    onEvent: onTestEvent,
    onAudioLoaded,
    skipWelcome,
    skipResults,
    postResults,
  });

  // Report screen to parent
  useEffect(() => { onScreen?.(screen); }, [screen, onScreen]);

  // --- Render ---

  if (audioError) {
    return (
      <>
        <Typography color="error" variant="h6">Error</Typography>
        <Typography>{audioError}</Typography>
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
    const { channelData, crossfadeForced, ...typeProps } = testProps;
    return (
      <TestPanel engine={audioEngine.engineFacade} channelData={channelData} crossfadeForced={crossfadeForced}>
        <TestComponent {...typeProps} engine={audioEngine.engineFacade} />
      </TestPanel>
    );
  }

  return null;
}
