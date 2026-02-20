/**
 * ABXTagStats — renders aggregated ABX stats grouped by tags.
 */

import React from 'react';
import { Box, Typography } from '@mui/material';
import ABXStats from './ABXStats';

/**
 * @param {object} props
 * @param {object[]} props.stats - Array of aggregated ABX tag stats
 */
export default function ABXTagStats({ stats }) {
  const multi = (stats || []).filter((s) => s.testCount >= 2);
  if (multi.length === 0) return null;

  return (
    <Box mt={3}>
      <Typography variant="h5" gutterBottom>Aggregated Results</Typography>
      {multi.map((s, i) => (
        <ABXStats key={i} stats={s} />
      ))}
    </Box>
  );
}
