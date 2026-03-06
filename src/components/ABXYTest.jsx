/**
 * ABXYTest — identification test screen with two unknown tracks.
 * X and Y are randomly assigned to A and B. User identifies which option X matches.
 * Having both X and Y gives more comparison opportunities (X↔Y, X↔A, Y↔B, etc.)
 *
 * Statistically identical to ABX: binary choice, 50% chance rate.
 *
 * When showConfidence is true (ABXY+C), clicking "X is A" transforms
 * the submit button into a vertical stack of confidence buttons.
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
 * @param {string} props.stepStr - e.g., "3/10"
 * @param {object[]} props.options - Original (non-mystery) options in fixed order
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform (from TestRunner)
 * @param {boolean} props.crossfadeForced
 * @param {number} props.totalIterations - Total number of iterations for this test
 * @param {object[]} props.progressDots - Array of {isCorrect, confidence} for completed iterations
 * @param {boolean} [props.showConfidence] - Whether to show confidence selection (ABXY+C)
 * @param {boolean} [props.showProgress] - Whether to show iteration progress bar
 * @param {number} props.iterationKey - Counter for state resets between iterations
 * @param {(answerId: string, confidence: string|null) => void} props.onSubmit
 */
export default function ABXYTest({
  name,
  description,
  stepStr,
  options,
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
  const trackCount = options.length + 2; // options + X + Y
  const xTrackIndex = options.length;     // X is at index 2
  const yTrackIndex = options.length + 1; // Y is at index 3
  const mysteryIndices = [xTrackIndex, yTrackIndex];

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
    // Selecting a mystery track is just for listening — not an answer
    if (index === xTrackIndex || index === yTrackIndex) {
      setAnswer(null);
    } else {
      setAnswer(index);
    }
    setPendingSubmit(false);
  };

  const getAnswerLabel = () => {
    if (answer === null) return '?';
    return String.fromCharCode(65 + answer);
  };

  const handleSubmitClick = () => {
    if (answer === null) return;
    if (showConfidence) {
      setPendingSubmit(true);
    } else {
      engine?.stop();
      onSubmit(String(answer), null);
    }
  };

  const handleConfidenceClick = (confidence) => {
    engine?.stop();
    onSubmit(String(answer), confidence);
  };

  const canSubmit = answer !== null && heardTracks.has(xTrackIndex);

  useHotkeys({ engine, trackCount, xTrackIndex: mysteryIndices, onTrackSelect: handleTrackSelect, onSubmit: handleSubmitClick });

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

              {/* Track selector with X and Y */}
              <TrackSelector
                trackCount={trackCount}
                selectedTrack={selectedTrack}
                onSelect={handleTrackSelect}
                xTrackIndex={mysteryIndices}
              />

              {/* Submit / Confidence area — fixed height, stack grows upward */}
              <Box
                display="flex"
                justifyContent="flex-end"
                mt={1}
                sx={{ position: 'relative', height: 36.5 }}
              >
                {!pendingSubmit && (
                  <Box sx={{ position: 'absolute', bottom: 0, right: 0 }}>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={handleSubmitClick}
                      disabled={!canSubmit}
                      sx={{ textTransform: 'none' }}
                    >
                      X is {getAnswerLabel()}
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
                    if (!d.confidence) {
                      color = d.isCorrect ? theme.palette.success.dark : theme.palette.error.dark;
                    } else if (d.confidence === 'sure') {
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
