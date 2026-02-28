/**
 * StaircaseStats — displays 2AFC adaptive staircase test results.
 * Shows JND estimate, trial summary, interpretation, and staircase plot.
 */

import React from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import Label from './Label';

/**
 * Generate interpretation text from staircase results.
 * @param {object} stats - Stats from computeStaircaseStats
 * @returns {string}
 */
function interpretStaircase(stats) {
  if (stats.floorCeiling === 'floor') {
    return 'Floor effect: listener detected all differences, even the smallest. Consider adding finer quality levels.';
  }
  if (stats.floorCeiling === 'ceiling') {
    return 'Ceiling effect: listener could not detect differences, even the largest. The options may be too similar.';
  }
  if (stats.jndSD > stats.jnd * 0.5 && stats.jnd > 1) {
    return 'High variability in reversal levels. The JND estimate may be unreliable — consider more reversals.';
  }
  return `JND estimated at level ${stats.jndLevel} (${stats.jndOptionName}). The listener can reliably detect differences at or below this level.`;
}

/**
 * SVG staircase plot — level vs trial number with reversal points.
 * @param {object} props
 * @param {object[]} props.trials - Array of { level, isCorrect }
 * @param {number[]} props.reversalLevels - Reversal level values
 * @param {number} props.nLevels - Total number of levels
 * @param {number} props.jnd - JND estimate
 */
function StaircasePlot({ trials, reversalLevels, nLevels, jnd }) {
  if (trials.length === 0) return null;

  const width = 500;
  const height = 200;
  const padding = { top: 20, right: 30, bottom: 30, left: 45 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xScale = (i) => padding.left + (i / Math.max(trials.length - 1, 1)) * plotW;
  const yScale = (level) => padding.top + ((level - 1) / Math.max(nLevels - 1, 1)) * plotH;

  // Build polyline path
  const points = trials.map((t, i) => `${xScale(i)},${yScale(t.level)}`).join(' ');

  // Find reversal trial indices (where level matches reversal values, in order)
  const reversalIndices = [];
  let rIdx = 0;
  for (let i = 1; i < trials.length && rIdx < reversalLevels.length; i++) {
    // A reversal at a trial is when direction changed — detect by level matching
    // We match sequentially: the first trial at each reversal level
    if (trials[i].level === reversalLevels[rIdx]) {
      reversalIndices.push(i);
      rIdx++;
    }
  }

  // Y-axis labels (levels)
  const yTicks = [];
  const step = nLevels <= 10 ? 1 : Math.ceil(nLevels / 8);
  for (let l = 1; l <= nLevels; l += step) {
    yTicks.push(l);
  }
  if (!yTicks.includes(nLevels)) yTicks.push(nLevels);

  // X-axis labels (trial numbers)
  const xTicks = [];
  const xStep = trials.length <= 10 ? 1 : Math.ceil(trials.length / 8);
  for (let i = 0; i < trials.length; i += xStep) {
    xTicks.push(i);
  }
  if (!xTicks.includes(trials.length - 1)) xTicks.push(trials.length - 1);

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }}>
        {/* Grid lines */}
        {yTicks.map((l) => (
          <line
            key={`grid-${l}`}
            x1={padding.left} y1={yScale(l)}
            x2={width - padding.right} y2={yScale(l)}
            stroke="#f0f0f0" strokeWidth={1}
          />
        ))}

        {/* JND reference line */}
        <line
          x1={padding.left} y1={yScale(jnd)}
          x2={width - padding.right} y2={yScale(jnd)}
          stroke="#1976d2" strokeWidth={1} strokeDasharray="4,3"
        />
        <text
          x={width - padding.right + 3} y={yScale(jnd) + 3}
          fontSize={9} fill="#1976d2"
        >
          JND
        </text>

        {/* Staircase line */}
        <polyline
          points={points}
          fill="none"
          stroke="#333"
          strokeWidth={1.5}
        />

        {/* Trial points */}
        {trials.map((t, i) => (
          <circle
            key={i}
            cx={xScale(i)} cy={yScale(t.level)}
            r={3}
            fill={t.isCorrect ? '#66bb6a' : '#ef5350'}
          />
        ))}

        {/* Reversal markers */}
        {reversalIndices.map((ti, ri) => (
          <circle
            key={`rev-${ri}`}
            cx={xScale(ti)} cy={yScale(trials[ti].level)}
            r={6}
            fill="none"
            stroke="#1976d2"
            strokeWidth={1.5}
          />
        ))}

        {/* Y-axis */}
        <line
          x1={padding.left} y1={padding.top}
          x2={padding.left} y2={height - padding.bottom}
          stroke="#999" strokeWidth={1}
        />
        {yTicks.map((l) => (
          <text
            key={`y-${l}`}
            x={padding.left - 6} y={yScale(l) + 3}
            textAnchor="end" fontSize={10} fill="#666"
          >
            {l}
          </text>
        ))}
        <text
          x={12} y={height / 2}
          textAnchor="middle" fontSize={10} fill="#666"
          transform={`rotate(-90, 12, ${height / 2})`}
        >
          Level
        </text>

        {/* X-axis */}
        <line
          x1={padding.left} y1={height - padding.bottom}
          x2={width - padding.right} y2={height - padding.bottom}
          stroke="#999" strokeWidth={1}
        />
        {xTicks.map((i) => (
          <text
            key={`x-${i}`}
            x={xScale(i)} y={height - padding.bottom + 14}
            textAnchor="middle" fontSize={10} fill="#666"
          >
            {i + 1}
          </text>
        ))}
        <text
          x={(padding.left + width - padding.right) / 2}
          y={height - 4}
          textAnchor="middle" fontSize={10} fill="#666"
        >
          Trial
        </text>
      </svg>
    </Box>
  );
}

/**
 * @param {object} props
 * @param {object} props.stats - Stats from computeStaircaseStats
 */
export default function StaircaseStats({ stats }) {
  return (
    <Box mb={2}>
      <Typography variant="h6" gutterBottom>
        {stats.name}
        <Typography component="span" variant="body2" color="text.secondary" ml={1}>2AFC-Staircase</Typography>
      </Typography>

      {/* Option names */}
      {stats.optionNames && (
        <Box mb={1}>
          <Typography variant="body2" color="text.secondary">
            {stats.optionNames.length} levels: {stats.optionNames[0]} → {stats.optionNames[stats.optionNames.length - 1]}
          </Typography>
        </Box>
      )}

      {/* JND result table */}
      <Box mt={1}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '35%' }}>
                  <Box display="inline" mr={1}>JND</Box>
                  <Tooltip title="Just Noticeable Difference — the smallest quality level where the listener can reliably detect a difference from the reference. Lower is better (finer discrimination).">
                    <Box display="inline">
                      <Label color="primary">?</Label>
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '30%' }}>Level</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '35%' }}>
                  <Box display="inline" mr={1}>SD</Box>
                  <Tooltip title="Standard deviation of reversal levels used to compute JND. Lower SD indicates more stable convergence.">
                    <Box display="inline">
                      <Label color="primary">?</Label>
                    </Box>
                  </Tooltip>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>{stats.jnd.toFixed(1)}</TableCell>
                <TableCell>{stats.jndOptionName}</TableCell>
                <TableCell>{stats.jndSD.toFixed(2)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                  {interpretStaircase(stats)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Trial summary table */}
      <Box mt={1}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Trials</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Correct</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Reversals</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>
                  <Box display="inline" mr={1}>Used</Box>
                  <Tooltip title="Number of reversal values used to compute the JND (after discarding coarse-phase reversals).">
                    <Box display="inline">
                      <Label color="primary">?</Label>
                    </Box>
                  </Tooltip>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>{stats.totalTrials}</TableCell>
                <TableCell>{stats.totalCorrect} / {stats.totalTrials}</TableCell>
                <TableCell>{stats.reversalCount}</TableCell>
                <TableCell>{stats.reversalsUsed.length}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Staircase plot */}
      <Box mt={1}>
        <Paper variant="outlined" sx={{ p: 1 }}>
          <StaircasePlot
            trials={stats.trials}
            reversalLevels={stats.reversalsUsed}
            nLevels={stats.optionNames.length}
            jnd={stats.jnd}
          />
        </Paper>
      </Box>

      {/* Response time */}
      {stats.timing && (
        <Box mt={1}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '50%' }}>
                    <Box display="inline" mr={1}>Median</Box>
                    <Tooltip title="Median response time per trial. More robust than average — not skewed by outliers from pauses or distractions.">
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
