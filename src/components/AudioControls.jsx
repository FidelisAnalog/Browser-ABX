/**
 * AudioControls — combined component assembling waveform display, transport controls,
 * zoom controls, volume slider, and crossfade toggle into a single audio control panel.
 *
 * Layout: three flex children in a wrapping row.
 * - Transport (left-anchored, no grow)
 * - Middle group: crossfade + volume (grows to fill, items spaced evenly)
 * - Zoom (right-anchored, no grow)
 * On narrow viewports the middle group wraps to a second line at full width.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Box, Paper, IconButton, Tooltip } from '@mui/material';
import Waveform from '../waveform/Waveform';
import TransportControls from './TransportControls';
import VolumeSlider from './VolumeSlider';
import CrossfadeToggle from './CrossfadeToggle';
import ReplayIcon from '@mui/icons-material/Replay';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
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
  const waveformRef = useRef(null);
  const [zoomState, setZoomState] = useState({ isZoomed: false, isMaxZoom: false });

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
          ref={waveformRef}
          channelData={channelData}
          duration={duration}
          currentTimeRef={engine?.currentTimeRef}
          loopRegion={loopRegion}
          onSeek={onSeek}
          onLoopRegionChange={onLoopRegionChange}
          onZoomChange={setZoomState}
        />
      </Box>

      {/* Controls row */}
      <Box
        display="flex"
        flexDirection="row"
        alignItems="center"
        flexWrap="wrap"
        gap={1}
      >
        {/* Left: Transport + bracket controls */}
        <Box display="flex" alignItems="center" gap={0.5} sx={{ order: 1 }}>
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

        {/* Middle: Crossfade + Volume — grows to fill, wraps to row 2 on narrow viewports */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-evenly"
          gap={1}
          sx={{
            order: 3,
            flexGrow: 1,
            flexBasis: '100%',
            '@media (min-width: 800px)': {
              order: 2,
              flexBasis: 'auto',
            },
          }}
        >
          <CrossfadeToggle engine={engine} forced={crossfadeForced} />
          <Box sx={{ minWidth: 140, maxWidth: 200 }}>
            <VolumeSlider engine={engine} />
          </Box>
        </Box>

        {/* Right: Zoom controls — ml:auto keeps it right-anchored when middle wraps */}
        <Box display="flex" alignItems="center" gap={0.5} sx={{ order: 2, ml: 'auto' }}>
          <Tooltip title="Zoom in (+)">
            <span>
              <IconButton
                onClick={() => waveformRef.current?.zoomIn()}
                disabled={duration <= 0 || zoomState.isMaxZoom}
                size="medium"
              >
                <ZoomInIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Zoom out (\u2212)">
            <span>
              <IconButton
                onClick={() => waveformRef.current?.zoomOut()}
                disabled={duration <= 0 || !zoomState.isZoomed}
                size="medium"
              >
                <ZoomOutIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Reset zoom (0)">
            <span>
              <IconButton
                onClick={() => waveformRef.current?.resetZoom()}
                disabled={duration <= 0 || !zoomState.isZoomed}
                size="medium"
              >
                <ZoomOutMapIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Paper>
  );
}
