/**
 * ConfidenceButtons — three-button vertical stack for confidence selection.
 * Shown after the user selects an answer in +C test variants.
 * Renders: Sure, Somewhat sure, Guessing (top to bottom).
 */

import { Box, Button } from '@mui/material';

const LEVELS = [
  { value: 'guessing', label: 'Guessing' },
  { value: 'somewhat', label: 'Somewhat sure' },
  { value: 'sure', label: 'Sure' },
];

export default function ConfidenceButtons({ onSelect }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      {LEVELS.map((c) => (
        <Button
          key={c.value}
          variant="outlined"
          color="primary"
          onClick={() => onSelect(c.value)}
          sx={{ textTransform: 'none' }}
        >
          {c.label}
        </Button>
      ))}
    </Box>
  );
}
