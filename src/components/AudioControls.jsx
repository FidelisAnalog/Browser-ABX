/**
 * AudioControls — combined component assembling waveform display, transport controls,
 * volume slider, and ducking toggle into a single audio control panel.
 */

import React from 'react';
import { Box, Paper } from '@mui/material';
import Waveform from '../waveform/Waveform';
import TransportControls from './TransportControls';
import VolumeSlider from './VolumeSlider';
import DuckingToggle from './DuckingToggle';

/**
 * @param {object} props
 * @param {Float32Array[]} props.channelData - Channel 0 data from each track
 * @param {number} props.duration - Total duration in seconds
 * @param {{ current: number }} props.currentTimeRef - Ref containing current playback position
 * @param {[number, number]} props.loopRegion - [start, end] in seconds
 * @param {string} props.transportState - 'stopped' | 'playing' | 'paused'
 * @param {number} props.volume
 * @param {boolean} props.duckingEnabled
 * @param {boolean} props.duckingForced
 * @param {() => void} props.onPlay
 * @param {() => void} props.onPause
 * @param {() => void} props.onStop
 * @param {(time: number) => void} props.onSeek
 * @param {(start: number, end: number) => void} props.onLoopRegionChange
 * @param {(volume: number) => void} props.onVolumeChange
 * @param {(enabled: boolean) => void} props.onDuckingChange
 */
export default function AudioControls({
  channelData,
  duration,
  currentTimeRef,
  loopRegion,
  transportState,
  volume,
  duckingEnabled,
  duckingForced,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onLoopRegionChange,
  onVolumeChange,
  onDuckingChange,
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      {/* Waveform */}
      <Box mb={1}>
        <Waveform
          channelData={channelData}
          duration={duration}
          currentTimeRef={currentTimeRef}
          loopRegion={loopRegion}
          transportState={transportState}
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
        <TransportControls
          transportState={transportState}
          onPlay={onPlay}
          onPause={onPause}
          onStop={onStop}
        />

        {/* Center: Ducking toggle */}
        <DuckingToggle
          enabled={duckingEnabled}
          forced={duckingForced}
          onChange={onDuckingChange}
        />

        {/* Right: Volume */}
        <Box sx={{ minWidth: 140, maxWidth: 200 }}>
          <VolumeSlider volume={volume} onChange={onVolumeChange} />
        </Box>
      </Box>
    </Paper>
  );
}
