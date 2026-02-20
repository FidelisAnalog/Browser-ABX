/**
 * TriangleStats — table displaying Triangle test results.
 * Shows the two compared options, then p-value / correct / incorrect summary.
 * No confusion matrix (not meaningful for triangle tests).
 */

import React from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import Label from './Label';

/**
 * @param {object} props
 * @param {object} props.stats - Triangle stats object from computeTriangleStats
 */
export default function TriangleStats({ stats }) {
  return (
    <Box mb={2}>
      <Typography variant="h6" gutterBottom>
        {stats.name}
        <Typography component="span" variant="body2" color="text.secondary" ml={1}>Triangle</Typography>
      </Typography>

      {/* Option names */}
      {stats.optionNames && (
        <Box mb={1}>
          <Typography variant="body2" color="text.secondary">
            {stats.optionNames.join(' vs ')}
          </Typography>
        </Box>
      )}

      {/* P-value / Correct / Incorrect summary */}
      <Box mt={1}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  <Box display="inline" mr={1}>p-value</Box>
                  <Tooltip title="Probability of getting this many or more correct identifications by chance (1/3). Lower values suggest the listener can reliably distinguish the options.">
                    <Box display="inline">
                      <Label color="primary">?</Label>
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Correct</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Incorrect</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>{stats.pValue.toPrecision(3)}</TableCell>
                <TableCell>{stats.totalCorrect}</TableCell>
                <TableCell>{stats.totalIncorrect}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}
