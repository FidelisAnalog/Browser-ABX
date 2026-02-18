/**
 * Transport controls — Play, Pause, Stop buttons.
 */

import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';

/**
 * @param {object} props
 * @param {string} props.transportState - 'stopped' | 'playing' | 'paused'
 * @param {() => void} props.onPlay
 * @param {() => void} props.onPause
 * @param {() => void} props.onStop
 * @param {boolean} [props.disabled]
 */
export default function TransportControls({
  transportState,
  onPlay,
  onPause,
  onStop,
  disabled = false,
}) {
  return (
    <Box display="flex" flexDirection="row" alignItems="center" gap={0.5}>
      {transportState === 'playing' ? (
        <Tooltip title="Pause">
          <span>
            <IconButton
              onClick={onPause}
              disabled={disabled}
              color="primary"
              size="medium"
            >
              <PauseIcon />
            </IconButton>
          </span>
        </Tooltip>
      ) : (
        <Tooltip title="Play">
          <span>
            <IconButton
              onClick={onPlay}
              disabled={disabled}
              color="primary"
              size="medium"
            >
              <PlayArrowIcon />
            </IconButton>
          </span>
        </Tooltip>
      )}
      <Tooltip title="Stop">
        <span>
          <IconButton
            onClick={onStop}
            disabled={disabled || transportState === 'stopped'}
            size="medium"
          >
            <StopIcon />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
