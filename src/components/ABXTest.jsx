/**
 * ABXTest — identification test screen.
 * X is a random copy of one option. User identifies which option X matches.
 * Uses composition (not inheritance) with shared AudioControls.
 *
 * When showConfidence is true (ABX+C), clicking "X is A" transforms
 * the submit button into a vertical stack of confidence buttons.
 * Clicking a confidence button submits the answer.
 */

import { useState, useEffect } from 'react';
import { Box, Button, Divider, Paper, Typography, useTheme } from '@mui/material';
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
 * @param {object[]} props.options - Original (non-X) options in fixed order
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform (from TestRunner)
 * @param {boolean} props.crossfadeForced
 * @param {number} props.totalIterations - Total number of iterations for this test
 * @param {object[]} props.progressDots - Array of {isCorrect, confidence} for completed iterations
 * @param {boolean} [props.showConfidence] - Whether to show confidence selection (ABX+C)
 * @param {boolean} [props.showProgress] - Whether to show iteration progress bar
 * @param {number} props.iterationKey - Counter for state resets between iterations
 * @param {(answerId: string, confidence: string|null) => void} props.onSubmit
 */
export default function ABXTest({
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
  const trackCount = options.length + 1; // options + X
  const xTrackIndex = trackCount - 1;    // X is always last

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
    // If they selected a non-X track, that's their answer; selecting X resets
    setAnswer(index === xTrackIndex ? null : index);
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

  useHotkeys({ engine, trackCount, xTrackIndex, onTrackSelect: handleTrackSelect, onSubmit: handleSubmitClick });

  return (
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

              {/* Track selector with X */}
              <TrackSelector
                trackCount={trackCount}
                selectedTrack={selectedTrack}
                onSelect={handleTrackSelect}
                xTrackIndex={xTrackIndex}
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
  );
}
