/**
 * ABTest — preference test screen.
 * User selects which of A/B/C... they prefer.
 * Track selection, waveform, transport, and submit.
 */

import React, { useMemo } from 'react';
import { Box, Button, Container, Divider, Paper, Typography } from '@mui/material';
import TrackSelector from './TrackSelector';
import AudioControls from './AudioControls';
import { extractChannel0 } from '../waveform/generateWaveform';
import { useSelectedTrack } from '../audio/useEngineState';

/**
 * @param {object} props
 * @param {string} props.name - Test name
 * @param {string} [props.description] - Test instructions
 * @param {string} props.stepStr - e.g., "3/10"
 * @param {object[]} props.options - Shuffled option objects
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {AudioBuffer[]} props.audioBuffers - AudioBuffers in option order
 * @param {boolean} props.duckingForced
 * @param {(selectedOption: object) => void} props.onSubmit
 */
export default function ABTest({
  name,
  description,
  stepStr,
  options,
  engine,
  audioBuffers,
  duckingForced,
  onSubmit,
}) {
  const channelData = useMemo(
    () => extractChannel0(audioBuffers),
    [audioBuffers]
  );

  const selectedTrack = useSelectedTrack(engine);

  const selectedLabel = String.fromCharCode(65 + selectedTrack);

  const handleSubmit = () => {
    engine?.stop();
    onSubmit(options[selectedTrack]);
  };

  return (
    <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={2} pb={2}>
      <Container maxWidth="sm">
        <Box display="flex" flexDirection="column" gap={1.5}>
          {/* Test info */}
          <Paper>
            <Box p={2.5}>
              <Box mb={4}>
                <Typography variant="h4" textAlign="center">
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
                onSelect={(i) => engine?.selectTrack(i)}
              />

              {/* Submit */}
              <Box display="flex" justifyContent="flex-end" mt={2}>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleSubmit}
                >
                  Select {selectedLabel}
                </Button>
              </Box>
            </Box>
          </Paper>

          {/* Audio controls */}
          <AudioControls
            engine={engine}
            channelData={channelData}
            duckingForced={duckingForced}
          />
        </Box>
      </Container>
    </Box>
  );
}
