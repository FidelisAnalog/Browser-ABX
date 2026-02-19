/**
 * Transport controls — Play, Pause, Stop buttons.
 * Subscribes to transportState only — does not re-render on volume/track/loop changes.
 */

import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import { useTransportState } from '../audio/useEngineState';

/**
 * @param {object} props
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {boolean} [props.disabled]
 */
export default function TransportControls({ engine, disabled = false }) {
  const transportState = useTransportState(engine);

  return (
    <Box display="flex" flexDirection="row" alignItems="center" gap={0.5}>
      {transportState === 'playing' ? (
        <Tooltip title="Pause">
          <span>
            <IconButton
              onClick={() => engine?.pause()}
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
              onClick={() => engine?.play()}
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
            onClick={() => engine?.stop()}
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
