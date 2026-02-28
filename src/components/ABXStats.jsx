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
export default function ABXStats({ stats, typeLabel = 'ABX' }) {
  return (
    <Box mb={2}>
      <Typography variant="h6" gutterBottom>
        {stats.name}
        <Typography component="span" variant="body2" color="text.secondary" ml={1}>{typeLabel}</Typography>
      </Typography>

      {/* Confusion matrix */}
      {stats.matrix && stats.optionNames && (
        <Box mb={1}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: '50%' }} />
                  <TableCell
                    colSpan={stats.optionNames.length}
                    align="left"
                    sx={{ fontWeight: 'bold' }}
                  >
                    You selected
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '50%' }}>X is</TableCell>
                  {stats.optionNames.map((name, i) => (
                    <TableCell key={name}>
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
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '50%' }}>
                  <Box display="inline" mr={1}>p-value</Box>
                  <Tooltip title="Probability of getting this many or more correct identifications by chance. Lower values suggest the listener can reliably distinguish the options.">
                    <Box display="inline">
                      <Label color="primary">?</Label>
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Correct</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Incorrect</TableCell>
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

      {/* Confidence breakdown (ABX+C only) */}
      {stats.confidenceBreakdown && (
        <Box mt={1}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '50%' }}>Confidence</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Correct</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Accuracy</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.confidenceBreakdown.map((row) => (
                  <TableRow key={row.level}>
                    <TableCell>
                      {row.level === 'sure' ? 'Sure' : row.level === 'somewhat' ? 'Somewhat sure' : 'Guessing'}
                    </TableCell>
                    <TableCell>{row.correct} / {row.total}</TableCell>
                    <TableCell>{((row.correct / row.total) * 100).toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Response time */}
      {stats.timing && (
        <Box mt={1}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '50%' }}>
                    <Box display="inline" mr={1}>Median</Box>
                    <Tooltip title="Median response time per iteration. More robust than average — not skewed by outliers from pauses or distractions.">
                      <Box display="inline">
                        <Label color="primary">?</Label>
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Fastest</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Slowest</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{stats.timing.median.toFixed(1)}s</TableCell>
                  <TableCell>{stats.timing.fastest.toFixed(1)}s</TableCell>
                  <TableCell>{stats.timing.slowest.toFixed(1)}s</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
}
