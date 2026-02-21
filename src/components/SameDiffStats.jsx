/**
 * SameDiffStats — table displaying 2AFC Same-Different test results.
 * Shows signal detection measures (d', criterion c, hit rate, false alarm rate),
 * p-value summary, and optional confidence breakdown.
 */

import React from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import Label from './Label';

/**
 * Generate a plain-language interpretation from d' and criterion c.
 * @param {number} dPrime - Sensitivity index
 * @param {number} c - Response criterion (negative = biased toward "different")
 */
function interpretSameDiff(dPrime, c) {
  // Sensitivity interpretation
  let sensitivity;
  if (dPrime < 0.5) sensitivity = 'No reliable discrimination detected.';
  else if (dPrime < 1.0) sensitivity = 'Weak discrimination.';
  else if (dPrime < 2.0) sensitivity = 'Moderate discrimination.';
  else sensitivity = 'Strong discrimination.';

  // Bias interpretation (negative c = biased toward "different")
  let bias;
  const absC = Math.abs(c);
  if (absC < 0.5) {
    bias = 'No notable response bias.';
  } else {
    const direction = c < 0 ? '"different"' : '"same"';
    const strength = absC < 1.0 ? 'Slight' : 'Strong';
    bias = `${strength} bias toward responding ${direction}.`;
  }

  return `${sensitivity} ${bias}`;
}

/**
 * @param {object} props
 * @param {object} props.stats - Stats from computeSameDiffStats
 */
export default function SameDiffStats({ stats }) {
  return (
    <Box mb={2}>
      <Typography variant="h6" gutterBottom>
        {stats.name}
        <Typography component="span" variant="body2" color="text.secondary" ml={1}>2AFC-SD</Typography>
      </Typography>

      {/* Option names */}
      {stats.optionNames && (
        <Box mb={1}>
          <Typography variant="body2" color="text.secondary">
            {stats.optionNames.join(' vs ')}
          </Typography>
        </Box>
      )}

      {/* Signal detection table */}
      <Box mt={1}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '50%' }}>
                  <Box display="inline" mr={1}>d&prime;</Box>
                  <Tooltip title="Sensitivity index from signal detection theory. Higher values indicate better ability to distinguish between the two options. d&prime; = 0 means no discrimination; d&prime; > 1 suggests reliable detection.">
                    <Box display="inline">
                      <Label color="primary">?</Label>
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>
                  <Box display="inline" mr={1}>Hit rate</Box>
                  <Tooltip title="Proportion of different pairs correctly identified as different.">
                    <Box display="inline">
                      <Label color="primary">?</Label>
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>
                  <Box display="inline" mr={1}>FA rate</Box>
                  <Tooltip title="False alarm rate: proportion of same pairs incorrectly called different. High FA rate suggests bias toward reporting differences.">
                    <Box display="inline">
                      <Label color="primary">?</Label>
                    </Box>
                  </Tooltip>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>{stats.dPrime.toFixed(2)} (c = {stats.criterionC.toFixed(2)})</TableCell>
                <TableCell>{(stats.hitRate * 100).toFixed(0)}%</TableCell>
                <TableCell>{(stats.falseAlarmRate * 100).toFixed(0)}%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                  {interpretSameDiff(stats.dPrime, stats.criterionC)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* P-value / Correct / Incorrect summary */}
      <Box mt={1}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '50%' }}>
                  <Box display="inline" mr={1}>p-value</Box>
                  <Tooltip title="Probability of getting this many or more correct answers by chance (1/2). Lower values suggest the listener can reliably distinguish the options.">
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

      {/* Response breakdown: hits / misses / FA / CR */}
      <Box mt={1}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>
                  <Box display="inline" mr={1}>Hits</Box>
                  <Tooltip title="Different pairs correctly identified as different.">
                    <Box display="inline"><Label color="primary">?</Label></Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>
                  <Box display="inline" mr={1}>Misses</Box>
                  <Tooltip title="Different pairs incorrectly called same. Failed to detect a real difference.">
                    <Box display="inline"><Label color="primary">?</Label></Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>
                  <Box display="inline" mr={1}>False alarms</Box>
                  <Tooltip title="Same pairs incorrectly called different. Perceived a difference that wasn't there.">
                    <Box display="inline"><Label color="primary">?</Label></Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>
                  <Box display="inline" mr={1}>Correct rej.</Box>
                  <Tooltip title="Same pairs correctly identified as same.">
                    <Box display="inline"><Label color="primary">?</Label></Box>
                  </Tooltip>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>{stats.hits}</TableCell>
                <TableCell>{stats.misses}</TableCell>
                <TableCell>{stats.falseAlarms}</TableCell>
                <TableCell>{stats.correctRejections}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Confidence breakdown (2AFC-SD+C only) */}
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
    </Box>
  );
}
