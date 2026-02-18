/**
 * ABXStats — table displaying ABX test results.
 * Shows confusion matrix and correct/incorrect summary with p-value.
 */

import React from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import Label from './Label';

/**
 * @param {object} props
 * @param {object} props.stats - ABX stats object from computeAbxStats
 */
export default function ABXStats({ stats }) {
  return (
    <Box mb={2}>
      <Typography variant="h6" gutterBottom>{stats.name}</Typography>

      {/* Confusion matrix (if available) */}
      {stats.matrix && stats.optionNames && (
        <Box mb={1}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Correct \ Selected</TableCell>
                  {stats.optionNames.map((name, i) => (
                    <TableCell key={name} align="center">
                      <Label color={i === 0 ? 'primary' : 'secondary'}>{name}</Label>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.optionNames.map((correctName) => (
                  <TableRow key={correctName}>
                    <TableCell>{correctName}</TableCell>
                    {stats.optionNames.map((selectedName) => (
                      <TableCell
                        key={selectedName}
                        align="center"
                        sx={{
                          fontWeight: correctName === selectedName ? 'bold' : 'normal',
                        }}
                      >
                        {stats.matrix[correctName]?.[selectedName] ?? 0}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Summary */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableBody>
            <TableRow>
              <TableCell>Correct</TableCell>
              <TableCell align="right">{stats.totalCorrect}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Incorrect</TableCell>
              <TableCell align="right">{stats.totalIncorrect}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell align="right">{stats.total}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box mt={0.5}>
        <Tooltip title="Probability of getting this many or more correct identifications by chance. Lower values suggest the listener can reliably distinguish the options.">
          <Typography variant="caption" color="text.secondary">
            p-value: {stats.pValue.toFixed(4)}
          </Typography>
        </Tooltip>
      </Box>
    </Box>
  );
}
