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
 * @param {boolean} props.forced - Whether crossfade is forced by config (toggle locked)
 */
export default function CrossfadeToggle({ engine, forced }) {
  const enabled = useCrossfadeEnabled(engine);

  if (forced) {
    return (
      <Tooltip title="Crossfade is required for this test to mask track switching artifacts">
        <Box display="flex" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Crossfade: On (required)
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
