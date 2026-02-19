/**
 * SharedResults — displays results decoded from a share URL.
 */

import React, { useState, useEffect } from 'react';
import { Box, CircularProgress, Container, Typography } from '@mui/material';
import { parseConfig } from '../utils/config';
import { decodeTestResults } from '../utils/share';
import Results from './Results';

/**
 * @param {object} props
 * @param {string} props.configUrl - URL to YAML config
 * @param {string} props.resultsParam - Encoded results from URL
 */
export default function SharedResults({ configUrl, resultsParam }) {
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    parseConfig(configUrl)
      .then((cfg) => {
        setConfig(cfg);
        const decoded = decodeTestResults(resultsParam, cfg);
        setStats(decoded);
      })
      .catch((err) => setError(err.message));
  }, [configUrl, resultsParam]);

  if (error) {
    return (
      <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={4}>
        <Container maxWidth="md">
          <Typography color="error" variant="h6">Error</Typography>
          <Typography>{error}</Typography>
        </Container>
      </Box>
    );
  }

  if (!config || !stats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={2} pb={2}>
      <Container maxWidth="md">
        <Results
          description={config.results?.description}
          results={[]}
          config={config}
          precomputedStats={stats}
        />
      </Container>
    </Box>
  );
}
