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
  if (!stats || stats.length === 0) return null;

  return (
    <Box mt={3}>
      <Typography variant="h5" gutterBottom>Aggregated Results</Typography>
      {stats.map((s, i) => (
        <ABStats key={i} stats={s} />
      ))}
    </Box>
  );
}
