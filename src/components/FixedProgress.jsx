/**
 * FixedProgress — fixed-length progress bar for test iterations.
 * Each dot represents one iteration, colored by correctness and confidence.
 * Used by ABX, ABXY, Triangle, SameDiff.
 */

import { Box, useTheme } from '@mui/material';

export default function FixedProgress({ progressDots = [], totalIterations }) {
  const theme = useTheme();

  return (
    <Box display="flex" gap="3px" sx={{ px: 2.5, pb: 1.5 }}>
      {Array.from({ length: totalIterations }, (_, i) => {
        let color = theme.palette.progress.pending;
        if (i < progressDots.length) {
          const d = progressDots[i];
          if (!d.confidence) {
            color = d.isCorrect ? theme.palette.success.dark : theme.palette.error.dark;
          } else if (d.confidence === 'sure') {
            color = d.isCorrect ? theme.palette.success.dark : theme.palette.error.dark;
          } else if (d.confidence === 'somewhat') {
            color = d.isCorrect ? theme.palette.success.main : theme.palette.error.main;
          } else {
            color = d.isCorrect ? theme.palette.success.light : theme.palette.error.light;
          }
        }
        return (
          <Box
            key={i}
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 1,
              backgroundColor: color,
            }}
          />
        );
      })}
    </Box>
  );
}
