import React, { useState, useEffect } from 'react';
import { Box, CircularProgress, ThemeProvider, Typography, createTheme, CssBaseline } from '@mui/material';
import TestRunner from './components/TestRunner';
import SharedResults from './components/SharedResults';
import LandingPage from './components/LandingPage';
import { normalizeConfig } from './utils/config';
import { emitEvent } from './utils/events';

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#f57c00' },
  },
});

/** Default embed options */
const DEFAULT_EMBED_OPTIONS = {
  postResults: true,
  skipWelcome: false,
  skipResults: false,
};

/** True when running inside an iframe */
const isEmbedded = window.parent !== window;

export default function App() {
  const url = new URL(window.location.toString());
  const configUrl = url.searchParams.get('test');
  const resultsParam = url.searchParams.get('results');

  // Embed state — config received via postMessage from parent iframe
  const [embeddedConfig, setEmbeddedConfig] = useState(null);
  const [embedOptions, setEmbedOptions] = useState(DEFAULT_EMBED_OPTIONS);
  const [embedError, setEmbedError] = useState(null);

  // When embedded in an iframe, listen for config from parent
  useEffect(() => {
    if (!isEmbedded) return;

    const handler = (e) => {
      if (e.data?.type !== 'dbt:config') return;

      try {
        const normalized = normalizeConfig(e.data.config);
        const opts = { ...DEFAULT_EMBED_OPTIONS, ...e.data.options };
        setEmbeddedConfig(normalized);
        setEmbedOptions(opts);
      } catch (err) {
        setEmbedError(err.message);
        emitEvent('dbt:error', { error: err.message });
      }
    };

    window.addEventListener('message', handler);
    emitEvent('dbt:ready');

    return () => window.removeEventListener('message', handler);
  }, []);

  let content;
  if (configUrl && resultsParam) {
    // Shared results view (works in iframe or standalone)
    content = <SharedResults configUrl={configUrl} resultsParam={resultsParam} />;
  } else if (configUrl) {
    // Standalone YAML config (works in iframe or standalone)
    content = <TestRunner configUrl={configUrl} />;
  } else if (isEmbedded) {
    // In iframe with no URL params — wait for postMessage config
    if (embedError) {
      content = (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" p={3}>
          <Typography color="error">{embedError}</Typography>
        </Box>
      );
    } else if (!embeddedConfig) {
      content = (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <CircularProgress />
        </Box>
      );
    } else {
      content = (
        <TestRunner
          config={embeddedConfig}
          postResults={embedOptions.postResults}
          skipWelcome={embedOptions.skipWelcome}
          skipResults={embedOptions.skipResults}
        />
      );
    }
  } else {
    content = <LandingPage />;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {content}
    </ThemeProvider>
  );
}
