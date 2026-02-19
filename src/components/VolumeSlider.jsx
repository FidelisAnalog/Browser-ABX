/**
 * Volume slider control.
 * Subscribes to volume only — does not re-render on transport/track/loop changes.
 */

import React from 'react';
import { Box, Slider } from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import { useVolume } from '../audio/useEngineState';

/**
 * @param {object} props
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 */
export default function VolumeSlider({ engine }) {
  const volume = useVolume(engine);

  const handleChange = (event, newValue) => {
    engine?.setVolume(newValue);
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
