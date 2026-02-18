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
  if (!stats || stats.length === 0) return null;

  return (
    <Box mt={3}>
      <Typography variant="h5" gutterBottom>Aggregated Results</Typography>
      {stats.map((s, i) => (
        <ABXStats key={i} stats={s} />
      ))}
    </Box>
  );
}
