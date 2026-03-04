/**
 * Crossfade toggle — enables/disables crossfade on track switches.
 * Shows locked state when crossfade is forced via config.
 * Subscribes to crossfadeEnabled only.
 */

import React from 'react';
import { Box, FormControlLabel, Switch, Tooltip, Typography } from '@mui/material';
import { useCrossfadeEnabled } from '../audio/useEngineState';

/**
 * @param {object} props
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {boolean|null} props.forced - true = force on, false = force off, null = user choice
 */
export default function CrossfadeToggle({ engine, forced }) {
  const enabled = useCrossfadeEnabled(engine);

  if (forced === true) {
    return (
      <Tooltip title="Crossfade has been set by the test administrator">
        <Box display="flex" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Crossfade: On
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  if (forced === false) {
    return (
      <Tooltip title="Crossfade has been set by the test administrator">
        <Box display="flex" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Crossfade: Off
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  return (
    <FormControlLabel
      control={
        <Switch
          checked={enabled}
          onChange={(e) => engine?.setCrossfade(e.target.checked)}
          size="small"
        />
      }
      label={
        <Tooltip title="Crossfades audio during track switches to prevent clicks from waveform discontinuities">
          <Typography variant="caption" color="text.secondary">
            Crossfade
          </Typography>
        </Tooltip>
      }
    />
  );
}
