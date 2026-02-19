/**
 * AudioControls — combined component assembling waveform display, transport controls,
 * volume slider, and ducking toggle into a single audio control panel.
 */

import React, { useCallback } from 'react';
import { Box, Paper } from '@mui/material';
import Waveform from '../waveform/Waveform';
import TransportControls from './TransportControls';
import VolumeSlider from './VolumeSlider';
import DuckingToggle from './DuckingToggle';
import { useDuration, useLoopRegion } from '../audio/useEngineState';

/**
 * @param {object} props
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Channel 0 data from each track
 * @param {boolean} props.duckingForced
 */
export default function AudioControls({ engine, channelData, duckingForced }) {
  const duration = useDuration(engine);
  const loopRegion = useLoopRegion(engine);

  const onSeek = useCallback((t) => engine?.seek(t), [engine]);
  const onLoopRegionChange = useCallback((s, e) => engine?.setLoopRegion(s, e), [engine]);

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      {/* Waveform */}
      <Box mb={1}>
        <Waveform
          channelData={channelData}
          duration={duration}
          currentTimeRef={engine?.currentTimeRef}
          loopRegion={loopRegion}
          onSeek={onSeek}
          onLoopRegionChange={onLoopRegionChange}
        />
      </Box>

      {/* Controls row */}
      <Box
        display="flex"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={1}
      >
        {/* Left: Transport */}
        <TransportControls engine={engine} />

        {/* Center: Ducking toggle */}
        <DuckingToggle engine={engine} forced={duckingForced} />

        {/* Right: Volume */}
        <Box sx={{ minWidth: 140, maxWidth: 200 }}>
          <VolumeSlider engine={engine} />
        </Box>
      </Box>
    </Paper>
  );
}
