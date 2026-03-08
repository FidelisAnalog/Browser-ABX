/**
 * ABTest — preference test screen.
 * User selects which of A/B/C... they prefer.
 * Track selection, waveform, transport, and submit.
 */

import { useState, useEffect } from 'react';
import { Box, Button, Divider, Paper, Typography } from '@mui/material';
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
 * @param {object[]} props.options - Shuffled option objects
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform (from TestRunner)
 * @param {boolean} props.crossfadeForced
 * @param {number} props.iterationKey - Counter for state resets between iterations
 * @param {(answerId: string, confidence: null) => void} props.onSubmit
 */
export default function ABTest({
  name,
  description,
  stepStr,
  options,
  engine,
  channelData,
  crossfadeForced,
  iterationKey,
  onSubmit,
}) {
  const selectedTrack = useSelectedTrack(engine);
  const [answer, setAnswer] = useState(null);
  const { heardTracks, markHeard } = useHeardTracks(iterationKey);

  // Reset state on new iteration
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

  const canSubmit = answer !== null && heardTracks.size >= options.length;

  const handleSubmit = () => {
    if (!canSubmit) return;
    engine?.stop();
    onSubmit(String(answer), null);
  };

  useHotkeys({ engine, trackCount: options.length, onTrackSelect: handleTrackSelect, onSubmit: handleSubmit });

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

              {/* Track selector */}
              <TrackSelector
                trackCount={options.length}
                selectedTrack={selectedTrack}
                onSelect={handleTrackSelect}
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
                  Select {getAnswerLabel()}
                </Button>
              </Box>
            </Box>
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
