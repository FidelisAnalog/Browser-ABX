/**
 * Results — displays all test results with statistics and share URL.
 */

import React, { useMemo, useState } from 'react';
import {
  Box, Button, Container, Paper, Tooltip, Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ReactMarkdown from 'react-markdown';
import ABStats from './ABStats';
import ABXStats from './ABXStats';
import ABTagStats from './ABTagStats';
import ABXTagStats from './ABXTagStats';
import {
  computeAbStats, computeAbxStats,
  computeAbTagStats, computeAbxTagStats,
} from '../stats/statistics';
import { createShareUrl } from '../utils/share';

/**
 * @param {object} props
 * @param {string} [props.description] - Results page markdown
 * @param {object[]} props.results - Raw results from TestRunner
 * @param {object} props.config - Full config
 * @param {object[]} [props.precomputedStats] - Pre-computed stats (for shared results)
 */
export default function Results({ description, results, config, precomputedStats }) {
  const [copied, setCopied] = useState(false);

  const { abStats, abxStats, abTagStats, abxTagStats, shareUrl } = useMemo(() => {
    if (precomputedStats) {
      const ab = precomputedStats.filter((s) => !s.matrix && !s.totalCorrect !== undefined);
      const abx = precomputedStats.filter((s) => s.totalCorrect !== undefined);
      return {
        abStats: ab,
        abxStats: abx,
        abTagStats: computeAbTagStats(ab, config),
        abxTagStats: computeAbxTagStats(abx, config),
        shareUrl: null,
      };
    }

    const ab = [];
    const abx = [];

    for (const result of results) {
      if (result.testType.toLowerCase() === 'ab') {
        ab.push(computeAbStats(result.name, result.optionNames, result.userSelections));
      } else if (result.testType.toLowerCase() === 'abx') {
        abx.push(computeAbxStats(result.name, result.optionNames, result.userSelectionsAndCorrects));
      }
    }

    const allStats = [...ab, ...abx];
    return {
      abStats: ab,
      abxStats: abx,
      abTagStats: computeAbTagStats(ab, config),
      abxTagStats: computeAbxTagStats(abx, config),
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

        {/* Tag aggregated stats */}
        <ABTagStats stats={abTagStats} />
        <ABXTagStats stats={abxTagStats} />

        {/* Share URL */}
        {shareUrl && (
          <Box mt={3} textAlign="center">
            <Tooltip title={copied ? 'Copied!' : 'Copy share link'}>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy Share Link'}
              </Button>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
