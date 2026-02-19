/**
 * AudioControls — combined component assembling waveform display, transport controls,
 * volume slider, and crossfade toggle into a single audio control panel.
 */

import React, { useCallback } from 'react';
import { Box, Paper, IconButton, Tooltip } from '@mui/material';
import Waveform from '../waveform/Waveform';
import TransportControls from './TransportControls';
import VolumeSlider from './VolumeSlider';
import CrossfadeToggle from './CrossfadeToggle';
import ReplayIcon from '@mui/icons-material/Replay';
import { useDuration, useLoopRegion, useTransportState } from '../audio/useEngineState';

/**
 * @param {object} props
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Channel 0 data from each track
 * @param {boolean} props.crossfadeForced
 */
export default function AudioControls({ engine, channelData, crossfadeForced }) {
  const duration = useDuration(engine);
  const loopRegion = useLoopRegion(engine);
  const transportState = useTransportState(engine);

  const onSeek = useCallback((t) => engine?.seek(t), [engine]);
  const onLoopRegionChange = useCallback((s, e) => engine?.setLoopRegion(s, e), [engine]);

  const BRACKET_HALF = 2; // seconds either side of playhead

  const handleBracket = useCallback(() => {
    if (!engine || duration <= 0) return;
    const pos = engine.currentTime;
    const start = Math.max(0, pos - BRACKET_HALF);
    const end = Math.min(duration, pos + BRACKET_HALF);
    engine.setLoopRegion(start, end);
  }, [engine, duration]);

  const handleResetBracket = useCallback(() => {
    if (!engine || duration <= 0) return;
    engine.setLoopRegion(0, duration);
  }, [engine, duration]);

  const handleJumpBack = useCallback(() => {
    if (!engine) return;
    const pos = engine.currentTime;
    engine.seek(Math.max(loopRegion[0], pos - 2));
  }, [engine, loopRegion]);

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
        {/* Left: Transport + bracket controls */}
        <Box display="flex" alignItems="center" gap={0.5}>
          <TransportControls engine={engine} />
          <Tooltip title="Jump back 2s">
            <span>
              <IconButton
                onClick={handleJumpBack}
                disabled={transportState === 'stopped'}
                size="medium"
              >
                <ReplayIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Bracket ±2s around playhead">
            <span>
              <IconButton
                onClick={handleBracket}
                disabled={duration <= 0}
                size="medium"
                sx={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.1rem', px: 0.5, minWidth: 36 }}
              >
                []
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Reset loop to full range">
            <span>
              <IconButton
                onClick={handleResetBracket}
                disabled={duration <= 0 || (loopRegion[0] <= 0.001 && loopRegion[1] >= duration - 0.001)}
                size="medium"
                sx={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.1rem', px: 0.5, minWidth: 36 }}
              >
                ][
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Center: Crossfade toggle */}
        <CrossfadeToggle engine={engine} forced={crossfadeForced} />

        {/* Right: Volume */}
        <Box sx={{ minWidth: 140, maxWidth: 200 }}>
          <VolumeSlider engine={engine} />
        </Box>
      </Box>
    </Paper>
  );
}
