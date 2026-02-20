/**
 * Results — displays all test results with statistics and share URL.
 */

import React, { useMemo, useState } from 'react';
import {
  Box, Button, Container, Paper, Tooltip, Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ReplayIcon from '@mui/icons-material/Replay';
import ReactMarkdown from 'react-markdown';
import ABStats from './ABStats';
import ABXStats from './ABXStats';
import TriangleStats from './TriangleStats';
import ABTagStats from './ABTagStats';
import ABXTagStats from './ABXTagStats';
import {
  computeAbStats, computeAbxStats, computeTriangleStats,
  computeAbTagStats, computeAbxTagStats,
} from '../stats/statistics';
import { createShareUrl } from '../utils/share';

/**
 * @param {object} props
 * @param {string} [props.description] - Results page markdown
 * @param {object[]} props.results - Raw results from TestRunner
 * @param {object} props.config - Full config
 * @param {object[]} [props.precomputedStats] - Pre-computed stats (for shared results)
 * @param {() => void} [props.onRestart] - Callback to restart the test (without re-downloading audio)
 */
export default function Results({ description, results, config, precomputedStats, onRestart }) {
  const [copied, setCopied] = useState(false);

  const { abStats, abxStats, triangleStats, abTagStats, abxTagStats, shareUrl } = useMemo(() => {
    if (precomputedStats) {
      // Build a lookup of test name → test type from config
      const testTypeMap = {};
      if (config?.tests) {
        for (const t of config.tests) {
          testTypeMap[t.name] = t.testType.toLowerCase();
        }
      }

      const ab = precomputedStats.filter((s) => s.options !== undefined);
      const matrixStats = precomputedStats.filter((s) => s.totalCorrect !== undefined);
      const abx = matrixStats.filter((s) => testTypeMap[s.name] !== 'triangle' && testTypeMap[s.name] !== 'triangle+c');
      const tri = matrixStats.filter((s) => testTypeMap[s.name] === 'triangle' || testTypeMap[s.name] === 'triangle+c');
      return {
        abStats: ab,
        abxStats: abx,
        triangleStats: tri,
        abTagStats: computeAbTagStats(ab, config),
        abxTagStats: computeAbxTagStats(matrixStats, config),
        shareUrl: null,
      };
    }

    const ab = [];
    const abx = [];
    const tri = [];

    for (const result of results) {
      const t = result.testType.toLowerCase();
      if (t === 'ab') {
        ab.push(computeAbStats(result.name, result.optionNames, result.userSelections));
      } else if (t === 'abx' || t === 'abx+c') {
        abx.push(computeAbxStats(result.name, result.optionNames, result.userSelectionsAndCorrects));
      } else if (t === 'triangle' || t === 'triangle+c') {
        tri.push(computeTriangleStats(result.name, result.optionNames, result.userSelectionsAndCorrects));
      }
    }

    const allStats = [...ab, ...abx, ...tri];
    return {
      abStats: ab,
      abxStats: abx,
      triangleStats: tri,
      abTagStats: computeAbTagStats(ab, config),
      abxTagStats: computeAbxTagStats([...abx, ...tri], config),
      shareUrl: createShareUrl(allStats, config),
    };
  }, [results, config, precomputedStats]);

  const handleCopy = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Paper>
      <Box p={3}>
        <Typography variant="h4" textAlign="center" gutterBottom>
          Results
        </Typography>

        {description && (
          <Box mb={3}>
            <ReactMarkdown>{description}</ReactMarkdown>
          </Box>
        )}

        {/* AB test results */}
        {abStats.map((s, i) => (
          <ABStats key={`ab-${i}`} stats={s} />
        ))}

        {/* ABX test results */}
        {abxStats.map((s, i) => (
          <ABXStats key={`abx-${i}`} stats={s} />
        ))}

        {/* Triangle test results */}
        {triangleStats.map((s, i) => (
          <TriangleStats key={`tri-${i}`} stats={s} />
        ))}

        {/* Tag aggregated stats */}
        <ABTagStats stats={abTagStats} />
        <ABXTagStats stats={abxTagStats} />

        {/* Share URL + Restart */}
        <Box mt={3} display="flex" justifyContent="center" gap={2}>
          {shareUrl && (
            <Tooltip title={copied ? 'Copied!' : 'Copy share link'}>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy Share Link'}
              </Button>
            </Tooltip>
          )}
          {onRestart && (
            <Button
              variant="outlined"
              startIcon={<ReplayIcon />}
              onClick={onRestart}
            >
              Take Again
            </Button>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
