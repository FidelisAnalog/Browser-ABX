/**
 * StaircaseTest — 2AFC adaptive staircase test screen.
 * Each trial presents 2 audio tracks: reference (level 1) and test (at current staircase level).
 * Assignment to A/B is randomized per trial.
 * User identifies which track is the reference.
 *
 * Follows the standard UI pattern: select a track, then click one submit button.
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
 * @param {string} props.stepStr - e.g., "Trial 5"
 * @param {object[]} props.pair - 2 audio option objects [trackA, trackB]
 * @param {number} props.referenceIdx - Which index in pair is the reference (0 or 1)
 * @param {number} props.testLevel - Current staircase level (1-based)
 * @param {number} props.reversalCount - Current reversal count
 * @param {number} props.targetReversals - Target reversal count
 * @param {object[]} props.trialHistory - Array of { isCorrect } for progress bar
 * @param {number} [props.minRemaining=1] - Best-case minimum remaining trials (from staircase algorithm)
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform
 * @param {boolean} props.crossfadeForced
 * @param {(selectedIdx: number) => void} props.onSubmit - Called with the user's selected track index
 */
export default function StaircaseTest({
  name,
  description,
  stepStr,
  pair,
  referenceIdx,
  testLevel,
  reversalCount,
  targetReversals,
  trialHistory = [],
  minRemaining = 1,
  engine,
  channelData,
  crossfadeForced,
  onSubmit,
}) {
  const trackCount = 2;
  const selectedTrack = useSelectedTrack(engine);
  const [answer, setAnswer] = useState(null);

  // Reset answer when pair changes (new trial)
  useEffect(() => { setAnswer(null); }, [pair]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
    setAnswer(index);
  };

  const getAnswerLabel = () => {
    if (answer === null) return '?';
    return String.fromCharCode(65 + answer);
  };

  const canSubmit = answer !== null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    engine?.stop();
    onSubmit(answer);
  };

  useHotkeys({ engine, trackCount, onTrackSelect: handleTrackSelect, onSubmit: handleSubmit });

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

              {/* Progress info: reversals on left, trial on right */}
              <Box display="flex" justifyContent="space-between" mt={0.5} mx={1}>
                <Typography color="text.secondary" variant="body2">
                  Reversals: {reversalCount}/{targetReversals}
                </Typography>
                <Typography color="text.secondary">{stepStr}</Typography>
              </Box>

              {/* Track selector — 2 buttons */}
              <TrackSelector
                trackCount={trackCount}
                selectedTrack={selectedTrack}
                onSelect={handleTrackSelect}
                xTrackIndex={null}
              />

              {/* Submit */}
              <Box display="flex" justifyContent="flex-end" mt={2}>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  sx={{ textTransform: 'none' }}
                >
                  {getAnswerLabel()} is the reference
                </Button>
              </Box>
            </Box>

            {/* Progress bar: min 7 slots, grey slots = best-case remaining, grows dynamically */}
            <Box
              display="flex"
              gap="3px"
              sx={{ px: 2.5, pb: 1.5 }}
            >
              {Array.from({ length: Math.max(7, trialHistory.length + Math.max(1, minRemaining)) }, (_, i) => (
                <Box
                  key={i}
                  sx={{
                    flex: 1,
                    height: 6,
                    borderRadius: 1,
                    backgroundColor: i < trialHistory.length
                      ? (trialHistory[i].isCorrect ? '#66bb6a' : '#ef5350')
                      : '#e0e0e0',
                  }}
                />
              ))}
            </Box>
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
