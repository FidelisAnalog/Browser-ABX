/**
 * Volume slider control.
 */

import React from 'react';
import { Box, Slider } from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';

/**
 * @param {object} props
 * @param {number} props.volume - Current volume (0.0 to 1.0)
 * @param {(volume: number) => void} props.onChange
 */
export default function VolumeSlider({ volume, onChange }) {
  const handleChange = (event, newValue) => {
    onChange(newValue);
  };

  return (
    <Box display="flex" flexDirection="row" alignItems="center" gap={1} sx={{ minWidth: 120 }}>
      {volume === 0 ? (
        <VolumeOffIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
      ) : (
        <VolumeUpIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
      )}
      <Slider
        value={volume}
        min={0}
        max={1}
        step={0.01}
        onChange={handleChange}
        size="small"
        sx={{ flex: 1 }}
      />
    </Box>
  );
}
