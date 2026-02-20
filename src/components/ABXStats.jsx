/**
 * ABXStats — table displaying ABX test results.
 * Shows confusion matrix with A/B labels and correct/incorrect summary with p-value.
 */

import React from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import Label from './Label';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * @param {object} props
 * @param {object} props.stats - ABX stats object from computeAbxStats
 */
export default function ABXStats({ stats }) {
  return (
    <Box mb={2}>
      <Typography variant="h6" gutterBottom>{stats.name}</Typography>

      {/* Confusion matrix */}
      {stats.matrix && stats.optionNames && (
        <Box mb={1}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell
                    colSpan={stats.optionNames.length}
                    align="left"
                    sx={{ fontWeight: 'bold' }}
                  >
                    You selected
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>X is</TableCell>
                  {stats.optionNames.map((name, i) => (
                    <TableCell key={name} align="center">
                      <Label color="secondary">{LETTERS[i]}</Label>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.optionNames.map((correctName, rowIdx) => (
                  <TableRow key={correctName}>
                    <TableCell>
                      <Label color="secondary">{LETTERS[rowIdx]}</Label>
                      {' '}{correctName}
                    </TableCell>
                    {stats.optionNames.map((selectedName) => (
                      <TableCell
                        key={selectedName}
                        align="center"
                        sx={{
                          fontWeight: correctName === selectedName ? 'bold' : 'normal',
                        }}
                      >
                        <Tooltip title={selectedName}>
                          <Box component="span">
                            {stats.matrix[correctName]?.[selectedName] ?? 0}
                          </Box>
                        </Tooltip>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
                  <Tooltip title="Probability of getting this many or more correct identifications by chance. Lower values suggest the listener can reliably distinguish the options.">
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
