/**
 * SameDiffTest — 2AFC same-different discrimination test screen.
 * Each trial presents a pair of audio samples (AA, BB, AB, or BA).
 * User answers "Same" or "Different."
 *
 * When showConfidence is true (2AFC-SD+C), clicking Same/Different
 * transforms into a vertical stack of confidence buttons.
 */

import React, { useState, useEffect } from 'react';
import { Box, Button, Container, Divider, Paper, Typography } from '@mui/material';
import TrackSelector from './TrackSelector';
import AudioControls from './AudioControls';
import { useSelectedTrack } from '../audio/useEngineState';
import { useHotkeys } from '../audio/useHotkeys';

/**
 * @param {object} props
 * @param {string} props.name - Test name
 * @param {string} [props.description] - Test instructions
 * @param {string} props.stepStr - e.g., "3/16"
 * @param {object[]} props.pair - 2 audio option objects for this trial
 * @param {string} props.pairType - 'same' or 'different'
 * @param {object[]} props.options - Original A/B options in fixed order
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform
 * @param {boolean} props.crossfadeForced
 * @param {number} props.totalIterations - Total number of iterations
 * @param {object[]} props.iterationResults - Completed iteration results
 * @param {boolean} [props.showConfidence] - Whether to show confidence selection
 * @param {boolean} [props.showProgress] - Whether to show iteration progress bar
 * @param {(userResponse: string, pairType: string, confidence: string|null) => void} props.onSubmit
 */
export default function SameDiffTest({
  name,
  description,
  stepStr,
  pair,
  pairType,
  options,
  engine,
  channelData,
  crossfadeForced,
  totalIterations,
  iterationResults = [],
  showConfidence = false,
  showProgress = false,
  onSubmit,
}) {
  const trackCount = 2;
  const selectedTrack = useSelectedTrack(engine);

  // The user's answer: 'same' or 'different', or null
  const [answer, setAnswer] = useState(null);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Reset state when pair changes (new iteration)
  useEffect(() => { setAnswer(null); setPendingSubmit(false); }, [pair]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
  };

  const handleAnswerClick = (response) => {
    setAnswer(response);
    setPendingSubmit(false);
    if (showConfidence) {
      setPendingSubmit(true);
    } else {
      engine?.stop();
      onSubmit(response, pairType, null);
    }
  };

  const handleConfidenceClick = (confidence) => {
    engine?.stop();
    onSubmit(answer, pairType, confidence);
  };

  // Hotkeys: Enter is not used for submit here since we have two answer buttons.
  // Track selection via A/B keys still works.
  useHotkeys({ engine, trackCount, onTrackSelect: handleTrackSelect, onSubmit: () => {} });

  return (
    <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={2} pb={2}>
      <Container maxWidth="md">
        <Box display="flex" flexDirection="column" gap={1.5}>
          {/* Test info */}
          <Paper>
            <Box p={2.5}>
              <Box mb={4}>
                <Typography variant="h5" textAlign="center">
                  {name}
                </Typography>
                {description && (
                  <Box mt={2}>
                    <Typography textAlign="center">{description}</Typography>
                  </Box>
                )}
              </Box>

              <Divider />

              <Box display="flex" justifyContent="flex-end" mt={0.5} mr={1}>
                <Typography color="text.secondary">{stepStr}</Typography>
              </Box>

              {/* Track selector — 2 buttons, no X */}
              <TrackSelector
                trackCount={trackCount}
                selectedTrack={selectedTrack}
                onSelect={handleTrackSelect}
                xTrackIndex={null}
              />

              {/* Answer / Confidence area */}
              <Box
                display="flex"
                justifyContent="flex-end"
                mt={1}
                sx={{ position: 'relative', height: 36.5 }}
              >
                {!pendingSubmit && (
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      display: 'flex',
                      gap: 1,
                    }}
                  >
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={() => handleAnswerClick('same')}
                      sx={{ textTransform: 'none' }}
                    >
                      Same
                    </Button>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={() => handleAnswerClick('different')}
                      sx={{ textTransform: 'none' }}
                    >
                      Different
                    </Button>
                  </Box>
                )}

                {pendingSubmit && (
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                    }}
                  >
                    {[
                      { value: 'guessing', label: 'Guessing' },
                      { value: 'somewhat', label: 'Somewhat sure' },
                      { value: 'sure', label: 'Sure' },
                    ].map((c) => (
                      <Button
                        key={c.value}
                        variant="outlined"
                        color="primary"
                        onClick={() => handleConfidenceClick(c.value)}
                        sx={{ textTransform: 'none' }}
                      >
                        {c.label}
                      </Button>
                    ))}
                  </Box>
                )}
              </Box>
            </Box>

            {/* Iteration progress bar */}
            {showProgress && (
              <Box
                display="flex"
                gap="3px"
                sx={{ px: 2.5, pb: 1.5 }}
              >
                {Array.from({ length: totalIterations }, (_, i) => {
                  let color = '#e0e0e0';
                  if (i < iterationResults.length) {
                    const r = iterationResults[i];
                    const correct = r.userResponse === r.pairType;
                    if (r.confidence === 'sure') {
                      color = correct ? '#2e7d32' : '#c62828';
                    } else if (r.confidence === 'somewhat') {
                      color = correct ? '#43a047' : '#e53935';
                    } else {
                      color = correct ? '#66bb6a' : '#ef5350';
                    }
                  }
                  return (
                    <Box
                      key={i}
                      sx={{
                        flex: 1,
                        height: 6,
                        borderRadius: 1,
                        backgroundColor: color,
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </Paper>

          {/* Audio controls */}
          <AudioControls
            engine={engine}
            channelData={channelData}
            crossfadeForced={crossfadeForced}
          />
        </Box>
      </Container>
    </Box>
  );
}
