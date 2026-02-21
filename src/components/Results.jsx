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
import ABTagStats from './ABTagStats';
import ABXTagStats from './ABXTagStats';
import { computeAbTagStats, computeAbxTagStats } from '../stats/statistics';
import { getTestType, parseTestType, TEST_TYPES } from '../utils/testTypeRegistry';
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

  const { abStats, abxStats, abxyStats, triangleStats, sdStats, abTagStats, abxTagStats, shareUrl } = useMemo(() => {
    if (precomputedStats) {
      // Precomputed stats have _baseType from share.js decoding;
      // fall back to config lookup for older share URLs without it
      const testTypeMap = {};
      if (config?.tests) {
        for (const t of config.tests) {
          testTypeMap[t.name] = t.testType;
        }
      }
      const getBase = (s) => s._baseType || parseTestType(testTypeMap[s.name] || '').baseType;

      const ab = precomputedStats.filter((s) => getBase(s) === 'ab');
      const abx = precomputedStats.filter((s) => getBase(s) === 'abx');
      const abxy = precomputedStats.filter((s) => getBase(s) === 'abxy');
      const tri = precomputedStats.filter((s) => getBase(s) === 'triangle');
      const sd = precomputedStats.filter((s) => getBase(s) === '2afc-sd');
      return {
        abStats: ab,
        abxStats: abx,
        abxyStats: abxy,
        triangleStats: tri,
        sdStats: sd,
        abTagStats: computeAbTagStats(ab, config),
        abxTagStats: computeAbxTagStats([...abx, ...abxy, ...tri, ...sd], config),
        shareUrl: null,
      };
    }

    const ab = [];
    const abx = [];
    const abxy = [];
    const tri = [];
    const sd = [];

    for (const result of results) {
      const { entry, baseType } = getTestType(result.testType);
      const resultData = result[entry.resultDataKey];
      const stats = entry.computeStats(result.name, result.optionNames, resultData);

      if (baseType === 'ab') ab.push(stats);
      else if (baseType === 'abx') abx.push(stats);
      else if (baseType === 'abxy') abxy.push(stats);
      else if (baseType === 'triangle') tri.push(stats);
      else if (baseType === '2afc-sd') sd.push(stats);
    }

    const allStats = [...ab, ...abx, ...abxy, ...tri, ...sd];
    return {
      abStats: ab,
      abxStats: abx,
      abxyStats: abxy,
      triangleStats: tri,
      sdStats: sd,
      abTagStats: computeAbTagStats(ab, config),
      abxTagStats: computeAbxTagStats([...abx, ...abxy, ...tri, ...sd], config),
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
        {abStats.map((s, i) => {
          const StatsComp = TEST_TYPES.ab.statsComponent;
          return <StatsComp key={`ab-${i}`} stats={s} />;
        })}

        {/* ABX test results */}
        {abxStats.map((s, i) => {
          const StatsComp = TEST_TYPES.abx.statsComponent;
          return <StatsComp key={`abx-${i}`} stats={s} />;
        })}

        {/* ABXY test results */}
        {abxyStats.map((s, i) => {
          const StatsComp = TEST_TYPES.abxy.statsComponent;
          return <StatsComp key={`abxy-${i}`} stats={s} typeLabel="ABXY" />;
        })}

        {/* Triangle test results */}
        {triangleStats.map((s, i) => {
          const StatsComp = TEST_TYPES.triangle.statsComponent;
          return <StatsComp key={`tri-${i}`} stats={s} />;
        })}

        {/* Same-different test results */}
        {sdStats.map((s, i) => {
          const StatsComp = TEST_TYPES['2afc-sd'].statsComponent;
          return <StatsComp key={`sd-${i}`} stats={s} />;
        })}

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
