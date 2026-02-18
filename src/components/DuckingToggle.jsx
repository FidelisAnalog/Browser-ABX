/**
 * Ducking toggle — enables/disables audio ducking on track switches.
 * Hidden or locked when ducking is forced via config.
 */

import React from 'react';
import { Box, FormControlLabel, Switch, Tooltip, Typography } from '@mui/material';

/**
 * @param {object} props
 * @param {boolean} props.enabled - Whether ducking is on
 * @param {boolean} props.forced - Whether ducking is forced by config (toggle locked)
 * @param {(enabled: boolean) => void} props.onChange
 */
export default function DuckingToggle({ enabled, forced, onChange }) {
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
          onChange={(e) => onChange(e.target.checked)}
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
