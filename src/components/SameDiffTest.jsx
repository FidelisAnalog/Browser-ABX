/**
 * SameDiffTest — 2AFC same-different discrimination test screen.
 * Each trial presents a pair of audio samples (AA, BB, AB, or BA).
 * User answers "Same" or "Different."
 *
 * When showConfidence is true (2AFC-SD+C), clicking Same/Different
 * transforms into a vertical stack of confidence buttons.
 */

import React, { useState, useEffect } from 'react';
import { Box, Button, Container, Divider, Paper, Typography, useTheme } from '@mui/material';
import TrackSelector from './TrackSelector';
import AudioControls from './AudioControls';
import { useSelectedTrack } from '../audio/useEngineState';
import { useHotkeys } from '../audio/useHotkeys';
import { useHeardTracks } from '../audio/useHeardTracks';

/**
 * @param {object} props
 * @param {string} props.name - Test name
 * @param {string} [props.description] - Test instructions
 * @param {string} props.stepStr - e.g., "3/16"
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform
 * @param {boolean} props.crossfadeForced
 * @param {number} props.totalIterations - Total number of iterations
 * @param {object[]} props.progressDots - Array of {isCorrect, confidence} for completed iterations
 * @param {boolean} [props.showConfidence] - Whether to show confidence selection
 * @param {boolean} [props.showProgress] - Whether to show iteration progress bar
 * @param {number} props.iterationKey - Counter for state resets between iterations
 * @param {(answerId: string, confidence: string|null) => void} props.onSubmit
 */
export default function SameDiffTest({
  name,
  description,
  stepStr,
  engine,
  channelData,
  crossfadeForced,
  totalIterations,
  progressDots = [],
  showConfidence = false,
  showProgress = false,
  iterationKey,
  onSubmit,
}) {
  const trackCount = 2;
  const theme = useTheme();
  const selectedTrack = useSelectedTrack(engine);

  const [answer, setAnswer] = useState(null);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const { heardTracks, markHeard } = useHeardTracks(iterationKey);

  // Reset state on new iteration
  useEffect(() => { setAnswer(null); setPendingSubmit(false); }, [iterationKey]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
    markHeard(index);
  };

  const canAnswer = heardTracks.size >= trackCount;

  const handleAnswerClick = (response) => {
    setAnswer(response);
    setPendingSubmit(false);
    if (showConfidence) {
      setPendingSubmit(true);
    } else {
      engine?.stop();
      onSubmit(response, null);
    }
  };

  const handleConfidenceClick = (confidence) => {
    engine?.stop();
    onSubmit(answer, confidence);
  };

  useHotkeys({ engine, trackCount, onTrackSelect: handleTrackSelect, onSubmit: () => {} });

  return (
    <Box pt={2} pb={2}>
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
                      disabled={!canAnswer}
                      sx={{ textTransform: 'none', minWidth: 100 }}
                    >
                      Same
                    </Button>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={() => handleAnswerClick('different')}
                      disabled={!canAnswer}
                      sx={{ textTransform: 'none', minWidth: 100 }}
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
                  let color = theme.palette.progress.pending;
                  if (i < progressDots.length) {
                    const d = progressDots[i];
                    if (d.confidence === 'sure') {
                      color = d.isCorrect ? theme.palette.success.dark : theme.palette.error.dark;
                    } else if (d.confidence === 'somewhat') {
                      color = d.isCorrect ? theme.palette.success.main : theme.palette.error.main;
                    } else {
                      color = d.isCorrect ? theme.palette.success.light : theme.palette.error.light;
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
