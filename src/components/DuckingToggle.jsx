/**
 * Ducking toggle — enables/disables audio ducking on track switches.
 * Shows locked state when ducking is forced via config.
 * Subscribes to duckingEnabled only.
 */

import React from 'react';
import { Box, FormControlLabel, Switch, Tooltip, Typography } from '@mui/material';
import { useDuckingEnabled } from '../audio/useEngineState';

/**
 * @param {object} props
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {boolean} props.forced - Whether ducking is forced by config (toggle locked)
 */
export default function DuckingToggle({ engine, forced }) {
  const enabled = useDuckingEnabled(engine);

  if (forced) {
    return (
      <Tooltip title="Audio ducking is required for this test to mask track switching artifacts">
        <Box display="flex" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Ducking: On (required)
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
          onChange={(e) => engine?.setDucking(e.target.checked)}
          size="small"
        />
      }
      label={
        <Tooltip title="Briefly mutes audio during track switches to prevent clicks from waveform discontinuities">
          <Typography variant="caption" color="text.secondary">
            Ducking
          </Typography>
        </Tooltip>
      }
    />
  );
}
