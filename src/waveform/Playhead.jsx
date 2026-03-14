/**
 * Playhead — thin vertical line indicating current playback position.
 * Pure render component: parent drives position updates via forwarded ref.
 */

import React from 'react';
import { useTheme } from '@mui/material';

const PLAYHEAD_WIDTH = 1.5;

const Playhead = React.forwardRef(function Playhead({ height }, ref) {
  const theme = useTheme();

  return (
    <line
      ref={ref}
      x1={0}
      y1={0}
      x2={0}
      y2={height}
      stroke={theme.palette.waveform.playhead}
      strokeWidth={PLAYHEAD_WIDTH}
      pointerEvents="none"
    />
  );
});

export default Playhead;
