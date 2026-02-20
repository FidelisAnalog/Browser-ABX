/**
 * ABStats — table displaying AB test results.
 * Shows sample name, selection count with percentage, and p-value.
 */

import React from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import Label from './Label';

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
              <TableCell sx={{ fontWeight: 'bold' }}>Sample</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Selected</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stats.options.map((opt) => (
              <TableRow key={opt.name}>
                <TableCell>{opt.name}</TableCell>
                <TableCell>{opt.count} ({opt.percentage}%)</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>
                <Box display="inline" mr={1}>p-value</Box>
                <Tooltip title="Probability of seeing this result or more extreme under the null hypothesis (all options equally likely). Lower values suggest a real preference.">
                  <Box display="inline">
                    <Label color="primary">?</Label>
                  </Box>
                </Tooltip>
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>
                {stats.pValue.toPrecision(3)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
