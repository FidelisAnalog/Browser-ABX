/**
 * TriangleTest — odd-one-out identification test screen.
 * Three tracks are presented: two identical, one different.
 * User identifies which track is the odd one out.
 *
 * When showConfidence is true (Triangle+C), clicking the submit button
 * transforms into a vertical stack of confidence buttons.
 * When false (plain Triangle), clicking submits immediately.
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
 * @param {object[]} props.triplet - 3 option objects in randomized order (2 identical, 1 different)
 * @param {object} props.correctOption - The odd-one-out option
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform
 * @param {boolean} props.crossfadeForced
 * @param {number} props.totalIterations - Total number of iterations for this test
 * @param {object[]} props.iterationResults - Array of completed iteration results
 * @param {boolean} [props.showConfidence] - Whether to show confidence selection (Triangle+C)
 * @param {boolean} [props.showProgress] - Whether to show iteration progress bar
 * @param {(selectedOption: object, correctOption: object, confidence: string|null) => void} props.onSubmit
 */
export default function TriangleTest({
  name,
  description,
  stepStr,
  triplet,
  correctOption,
  engine,
  channelData,
  crossfadeForced,
  totalIterations,
  iterationResults = [],
  showConfidence = false,
  showProgress = false,
  onSubmit,
}) {
  const trackCount = 3;
  const selectedTrack = useSelectedTrack(engine);

  const [answer, setAnswer] = useState(null);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Reset state when triplet changes (new iteration)
  useEffect(() => { setAnswer(null); setPendingSubmit(false); }, [triplet]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
    setAnswer(index);
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
      onSubmit(triplet[answer], correctOption, null);
    }
  };

  const handleConfidenceClick = (confidence) => {
    engine?.stop();
    onSubmit(triplet[answer], correctOption, confidence);
  };

  const canSubmit = answer !== null;

  useHotkeys({ engine, trackCount, onTrackSelect: handleTrackSelect, onSubmit: handleSubmitClick });

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

              {/* Track selector — 3 buttons, no X */}
              <TrackSelector
                trackCount={trackCount}
                selectedTrack={selectedTrack}
                onSelect={handleTrackSelect}
                xTrackIndex={null}
              />

              {/* Submit / Confidence area */}
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
                      {getAnswerLabel()} is different
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
                    const correct = r.selectedOption.audioUrl === r.correctOption.audioUrl;
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
