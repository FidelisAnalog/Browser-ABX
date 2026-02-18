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

/**
 * @param {object} props
 * @param {string} props.name - Test name
 * @param {string} [props.description] - Test instructions
 * @param {string} props.stepStr - e.g., "3/10"
 * @param {object[]} props.options - Shuffled option objects
 * @param {object} props.engine - useAudioEngine return value
 * @param {AudioBuffer[]} props.audioBuffers - AudioBuffers in option order
 * @param {(selectedOption: object) => void} props.onSubmit
 */
export default function ABTest({
  name,
  description,
  stepStr,
  options,
  engine,
  audioBuffers,
  onSubmit,
}) {
  const channelData = useMemo(
    () => extractChannel0(audioBuffers),
    [audioBuffers]
  );

  const selectedLabel = engine.selectedTrack !== null
    ? String.fromCharCode(65 + engine.selectedTrack)
    : '?';

  const handleSubmit = () => {
    if (engine.selectedTrack === null) return;
    engine.stop();
    onSubmit(options[engine.selectedTrack]);
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
                selectedTrack={engine.selectedTrack}
                onSelect={engine.selectTrack}
              />

              {/* Submit */}
              <Box display="flex" justifyContent="flex-end" mt={2}>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleSubmit}
                  disabled={engine.selectedTrack === null}
                >
                  Select {selectedLabel}
                </Button>
              </Box>
            </Box>
          </Paper>

          {/* Audio controls */}
          <AudioControls
            channelData={channelData}
            duration={engine.duration}
            currentTime={engine.currentTime}
            loopRegion={engine.loopRegion}
            transportState={engine.transportState}
            volume={engine.volume}
            duckingEnabled={engine.duckingEnabled}
            duckingForced={engine.duckingForced}
            onPlay={engine.play}
            onPause={engine.pause}
            onStop={engine.stop}
            onSeek={engine.seek}
            onLoopRegionChange={engine.setLoopRegion}
            onVolumeChange={engine.setVolume}
            onDuckingChange={engine.setDuckingEnabled}
          />
        </Box>
      </Container>
    </Box>
  );
}
