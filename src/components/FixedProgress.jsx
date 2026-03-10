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
          if (d.confidence) {
            const outcome = d.isCorrect ? 'correct' : 'incorrect';
            color = theme.palette.confidence[outcome][d.confidence];
          } else {
            color = d.isCorrect ? theme.palette.progress.correct : theme.palette.progress.incorrect;
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
