/**
 * SharedResults — displays results decoded from a self-contained share URL.
 */

import { useMemo, useState, useEffect } from 'react';
import { Box, Button, Link, Typography } from '@mui/material';
import { decodeShareParam } from '../utils/share';
import { rawLink } from '../utils/config';
import Results from './Results';

/**
 * @param {object} props
 * @param {string} props.shareParam - Encoded share param (binary payload, base64)
 */
export default function SharedResults({ shareParam }) {
  const { config, stats, configUrl, error } = useMemo(() => {
    try {
      const decoded = decodeShareParam(shareParam);
      document.title = `Results — ${decoded.config.name} — acidtest.io`;
      return decoded;
    } catch (err) {
      return { config: null, stats: null, configUrl: null, error: err.message };
    }
  }, [shareParam]);

  // Verify config URL is still reachable before showing "Take the Test"
  const [testUrl, setTestUrl] = useState(null);
  useEffect(() => {
    if (!configUrl) return;
    fetch(rawLink(configUrl))
      .then((res) => {
        if (res.ok) {
          const u = new URL(window.location.origin + window.location.pathname);
          u.searchParams.set('test', configUrl);
          setTestUrl(u.toString());
        }
      })
      .catch(() => {}); // Config gone — no button
  }, [configUrl]);

  if (error) {
    return (
      <>
        <Typography color="error" variant="h6">Error</Typography>
        <Typography>{error}</Typography>
      </>
    );
  }

  return (
    <>
      <Results
        description={null}
        results={[]}
        config={config}
        precomputedStats={stats}
      />
      {testUrl && (
        <Box textAlign="center" mt={3}>
          <Button
            component={Link}
            href={testUrl}
            target="_blank"
            variant="contained"
            color="secondary"
            size="large"
          >
            Take the Test
          </Button>
        </Box>
      )}
    </>
  );
}
