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
import { Box, Button, Container, Divider, Paper, Typography } from '@mui/material';
import TrackSelector from './TrackSelector';
import AudioControls from './AudioControls';
import { useSelectedTrack } from '../audio/useEngineState';
import { useHotkeys } from '../audio/useHotkeys';

/**
 * @param {object} props
 * @param {string} props.name - Test name
 * @param {string} [props.description] - Test instructions
 * @param {string} props.stepStr - e.g., "3/10"
 * @param {object[]} props.options - Original (non-mystery) options in fixed order
 * @param {object} props.xOption - The X option (has audioUrl matching one of the options)
 * @param {object} props.yOption - The Y option (has audioUrl matching the OTHER option)
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform (from TestRunner)
 * @param {boolean} props.crossfadeForced
 * @param {number} props.totalIterations - Total number of iterations for this test
 * @param {object[]} props.iterationResults - Array of {selectedOption, correctOption} for completed iterations
 * @param {boolean} [props.showConfidence] - Whether to show confidence selection (ABXY+C)
 * @param {boolean} [props.showProgress] - Whether to show iteration progress bar
 * @param {(selectedOption: object, correctOption: object, confidence: string|null) => void} props.onSubmit
 */
export default function ABXYTest({
  name,
  description,
  stepStr,
  options,
  xOption,
  yOption,
  engine,
  channelData,
  crossfadeForced,
  totalIterations,
  iterationResults = [],
  showConfidence = false,
  showProgress = false,
  onSubmit,
}) {
  const trackCount = options.length + 2; // options + X + Y
  const xTrackIndex = options.length;     // X is at index 2
  const yTrackIndex = options.length + 1; // Y is at index 3
  const mysteryIndices = [xTrackIndex, yTrackIndex];

  const selectedTrack = useSelectedTrack(engine);

  // The user's answer: which non-mystery option they think X matches
  const [answer, setAnswer] = useState(null);
  // Whether the confidence stack is showing (ABXY+C only)
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Reset state when X changes (new iteration)
  useEffect(() => { setAnswer(null); setPendingSubmit(false); }, [xOption]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
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

  // Find the correct option (the one whose audioUrl matches X)
  const getCorrectOption = () =>
    options.find((opt) => opt.audioUrl === xOption.audioUrl);

  const handleSubmitClick = () => {
    if (answer === null) return;
    if (showConfidence) {
      // Show confidence stack
      setPendingSubmit(true);
    } else {
      // Plain ABXY — submit immediately
      engine?.stop();
      onSubmit(options[answer], getCorrectOption(), null);
    }
  };

  const handleConfidenceClick = (confidence) => {
    engine?.stop();
    onSubmit(options[answer], getCorrectOption(), confidence);
  };

  const canSubmit = answer !== null;

  useHotkeys({ engine, trackCount, xTrackIndex: mysteryIndices, onTrackSelect: handleTrackSelect, onSubmit: handleSubmitClick });

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
                {/* Submit button — conditionally rendered, no animation */}
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

                {/* Confidence stack — animates upward from the button position */}
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
                  let color = '#e0e0e0'; // grey — not yet attempted
                  if (i < iterationResults.length) {
                    const r = iterationResults[i];
                    const correct = r.selectedOption.audioUrl === r.correctOption.audioUrl;
                    if (!r.confidence) {
                      // Plain ABXY — single shade
                      color = correct ? '#2e7d32' : '#c62828';
                    } else if (r.confidence === 'sure') {
                      color = correct ? '#2e7d32' : '#c62828';
                    } else if (r.confidence === 'somewhat') {
                      color = correct ? '#43a047' : '#e53935';
                    } else {
                      // guessing
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
