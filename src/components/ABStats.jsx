/**
 * ABStats — table displaying AB test results.
 * Shows option name, count, percentage, and p-value.
 */

import React from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';

/**
 * @param {object} props
 * @param {object} props.stats - AB stats object from computeAbStats
 */
export default function ABStats({ stats }) {
  return (
    <Box mb={2}>
      <Typography variant="h6" gutterBottom>{stats.name}</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Option</TableCell>
              <TableCell align="right">Count</TableCell>
              <TableCell align="right">%</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stats.options.map((opt) => (
              <TableRow key={opt.name}>
                <TableCell>{opt.name}</TableCell>
                <TableCell align="right">{opt.count}</TableCell>
                <TableCell align="right">{opt.percentage}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box mt={0.5}>
        <Tooltip title="Probability of seeing this result or more extreme under the null hypothesis (all options equally likely). Lower values suggest a real preference.">
          <Typography variant="caption" color="text.secondary">
            p-value: {stats.pValue.toFixed(4)}
          </Typography>
        </Tooltip>
      </Box>
    </Box>
  );
}
