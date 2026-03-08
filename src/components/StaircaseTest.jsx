/**
 * StaircaseTest — 2AFC adaptive staircase test screen.
 * Each trial presents 2 audio tracks: reference (level 1) and test (at current staircase level).
 * Assignment to A/B is randomized per trial.
 * User identifies which track is the reference.
 *
 * Follows the standard UI pattern: select a track, then click one submit button.
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
 * @param {string} props.stepStr - e.g., "Trial 5"
 * @param {number} props.testLevel - Current staircase level (1-based)
 * @param {number} props.reversalCount - Current reversal count
 * @param {number} props.targetReversals - Target reversal count
 * @param {object[]} props.progressDots - Array of {isCorrect, confidence} for progress bar
 * @param {number} [props.minRemaining=1] - Best-case minimum remaining trials (from staircase algorithm)
 * @param {boolean} [props.familiarizing=false] - True during free-listen familiarization phase
 * @param {string[]} [props.pairNames] - Option names for A and B during familiarization
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform
 * @param {boolean} props.crossfadeForced
 * @param {number} props.iterationKey - Counter for state resets between iterations
 * @param {(answerId: string|null, confidence: null) => void} props.onSubmit
 */
export default function StaircaseTest({
  name,
  description,
  stepStr,
  testLevel,
  reversalCount,
  targetReversals,
  progressDots = [],
  minRemaining = 1,
  familiarizing = false,
  pairNames,
  engine,
  channelData,
  crossfadeForced,
  iterationKey,
  onSubmit,
}) {
  const trackCount = 2;
  const theme = useTheme();
  const selectedTrack = useSelectedTrack(engine);
  const [answer, setAnswer] = useState(null);
  const { heardTracks, markHeard } = useHeardTracks(iterationKey);

  // Reset answer on new trial
  useEffect(() => { setAnswer(null); }, [iterationKey]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
    markHeard(index);
    setAnswer(index);
  };

  const getAnswerLabel = () => {
    if (answer === null) return '?';
    return String.fromCharCode(65 + answer);
  };

  const canSubmit = familiarizing || (answer !== null && heardTracks.size >= trackCount);

  const handleSubmit = () => {
    if (!canSubmit) return;
    engine?.stop();
    onSubmit(familiarizing ? null : String(answer), null);
  };

  useHotkeys({ engine, trackCount, onTrackSelect: handleTrackSelect, onSubmit: handleSubmit });

  return (
    <Box display="flex" flexDirection="column" gap={1.5}>
      {/* Test info */}
      <Paper>
            <Box p={2.5}>
              <Box mb={4}>
                <Typography variant="h5" textAlign="center">
                  {name}
                </Typography>
                {familiarizing ? (
                  <Box mt={2}>
                    <Typography textAlign="center" color="text.secondary">
                      Listen freely to both tracks, then press Start
                    </Typography>
                  </Box>
                ) : description && (
                  <Box mt={2}>
                    <Typography textAlign="center">{description}</Typography>
                  </Box>
                )}
              </Box>

              <Divider />

              {/* Progress info: reversals on left, trial on right */}
              {!familiarizing && (
                <Box display="flex" justifyContent="space-between" mt={0.5} mx={1}>
                  <Typography color="text.secondary" variant="body2">
                    Reversals: {reversalCount}/{targetReversals}
                  </Typography>
                  <Typography color="text.secondary">{stepStr}</Typography>
                </Box>
              )}

              {/* Track selector — 2 buttons */}
              <TrackSelector
                trackCount={trackCount}
                selectedTrack={selectedTrack}
                onSelect={handleTrackSelect}
                xTrackIndex={null}
              />

              {/* Option name labels below buttons during familiarization */}
              {familiarizing && pairNames && (
                <Box display="flex" justifyContent="space-between" mx={4}>
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ flex: 1, fontWeight: 'bold' }}>
                    {pairNames[0]}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ flex: 1, fontWeight: 'bold' }}>
                    {pairNames[1]}
                  </Typography>
                </Box>
              )}

              {/* Submit */}
              <Box display="flex" justifyContent="flex-end" mt={2}>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  sx={{ textTransform: 'none' }}
                >
                  {familiarizing ? 'Start Test' : `${getAnswerLabel()} is the reference`}
                </Button>
              </Box>
            </Box>

            {/* Progress bar: min 7 slots, grey slots = best-case remaining, grows dynamically */}
            {!familiarizing && (
              <Box
                display="flex"
                gap="3px"
                sx={{ px: 2.5, pb: 1.5 }}
              >
                {Array.from({ length: Math.max(7, progressDots.length + Math.max(1, minRemaining)) }, (_, i) => (
                  <Box
                    key={i}
                    sx={{
                      flex: 1,
                      height: 6,
                      borderRadius: 1,
                      backgroundColor: i < progressDots.length
                        ? (progressDots[i].isCorrect ? theme.palette.success.light : theme.palette.error.light)
                        : theme.palette.progress.pending,
                    }}
                  />
                ))}
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
