/**
 * AdaptiveProgress — dynamic-length progress bar for adaptive tests.
 * Total length grows based on completed trials + estimated remaining.
 * Minimum 7 slots. Two-tone coloring (correct/incorrect, no confidence shading).
 * Used by Staircase.
 */

import { Box, useTheme } from '@mui/material';

export default function AdaptiveProgress({ progressDots = [], minRemaining = 1 }) {
  const theme = useTheme();
  const totalSlots = Math.max(7, progressDots.length + Math.max(1, minRemaining));

  return (
    <Box display="flex" gap="3px" sx={{ px: 2.5, pb: 1.5 }}>
      {Array.from({ length: totalSlots }, (_, i) => (
        <Box
          key={i}
          sx={{
            flex: 1,
            height: 6,
            borderRadius: 1,
            backgroundColor: i < progressDots.length
              ? (progressDots[i].isCorrect ? theme.palette.success.light : theme.palette.error.light)
              : theme.palette.progress.pending,
          }}
        />
      ))}
    </Box>
  );
}
