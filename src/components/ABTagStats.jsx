/**
 * ABTagStats — renders aggregated AB stats grouped by tags.
 */

import React from 'react';
import { Box, Typography } from '@mui/material';
import ABStats from './ABStats';

/**
 * @param {object} props
 * @param {object[]} props.stats - Array of aggregated AB tag stats
 */
export default function ABTagStats({ stats }) {
  const multi = (stats || []).filter((s) => s.testCount >= 2);
  if (multi.length === 0) return null;

  return (
    <Box mt={3}>
      <Typography variant="h5" gutterBottom>Aggregated Results</Typography>
      {multi.map((s, i) => (
        <ABStats key={i} stats={s} />
      ))}
    </Box>
  );
}
