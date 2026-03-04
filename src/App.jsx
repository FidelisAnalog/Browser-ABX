import React, { useState, useEffect, useMemo } from 'react';
import { Box, CircularProgress, ThemeProvider, Typography, createTheme, CssBaseline } from '@mui/material';
import TestRunner from './components/TestRunner';
import SharedResults from './components/SharedResults';
import LandingPage from './components/LandingPage';
import { normalizeConfig } from './utils/config';
import { emitEvent } from './utils/events';

/** Shared palette values that work on both light and dark backgrounds */
const shared = {
  primary:   { main: '#1976d2' },
  secondary: { main: '#f57c00' },
  success: { light: '#66bb6a', main: '#43a047', dark: '#2e7d32' },
  error:   { light: '#ef5350', main: '#e53935', dark: '#c62828' },
};

const lightPalette = {
  mode: 'light',
  ...shared,
  background: { default: '#f6f6f6', paper: '#ffffff' },
  track: { main: '#424242', hover: '#616161', contrastText: '#ffffff' },
  progress: { pending: '#e0e0e0' },
  waveform: {
    fill:               '#1976d2',
    background:         '#f5f5f5',
    border:             '#e0e0e0',
    grid:               '#bdbdbd',
    playhead:           '#d32f2f',
    loopHandle:         '#f57c00',
    loopRegion:         'rgba(255, 152, 0, 0.15)',
    overviewFill:       '#90a4ae',
    overviewActiveFill: '#1976d2',
    overviewBackground: '#eceff1',
    timelineTick:       '#757575',
    timelineText:       '#616161',
    timelineBackground: '#eeeeee',
  },
  chart: { grid: '#f0f0f0', line: '#333333', axis: '#999999', label: '#666666' },
};

const darkPalette = {
  mode: 'dark',
  ...shared,
  background: { default: '#121212', paper: '#1e1e1e' },
  track: { main: '#9e9e9e', hover: '#bdbdbd', contrastText: '#000000' },
  progress: { pending: '#424242' },
  waveform: {
    fill:               '#42a5f5',
    background:         '#1a1a1a',
    border:             '#333333',
    grid:               '#444444',
    playhead:           '#ef5350',
    loopHandle:         '#ffb74d',
    loopRegion:         'rgba(255, 183, 77, 0.2)',
    overviewFill:       '#546e7a',
    overviewActiveFill: '#42a5f5',
    overviewBackground: '#1a1a1a',
    timelineTick:       '#888888',
    timelineText:       '#aaaaaa',
    timelineBackground: '#222222',
  },
  chart: { grid: '#2a2a2a', line: '#cccccc', axis: '#777777', label: '#aaaaaa' },
};

/** Read OS dark mode preference */
const getSystemMode = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const buildTheme = (mode) =>
  createTheme({ palette: mode === 'dark' ? darkPalette : lightPalette });

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
  const shareParam = url.searchParams.get('share');

  // Theme mode: 'system' follows OS, 'light'/'dark' are manual overrides
  const [themeOverride, setThemeOverride] = useState('system');
  const [systemMode, setSystemMode] = useState(getSystemMode);

  const activeMode = themeOverride === 'system' ? systemMode : themeOverride;
  const theme = useMemo(() => buildTheme(activeMode), [activeMode]);

  // Track OS preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemMode(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Ctrl+Shift+D to cycle: system → light → dark → system
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setThemeOverride((prev) => {
          const next = prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system';
          console.log(`[theme] ${next}${next === 'system' ? ` (${getSystemMode()})` : ''}`);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Embed state — config received via postMessage from parent iframe
  const [embeddedConfig, setEmbeddedConfig] = useState(null);
  const [embedOptions, setEmbedOptions] = useState(DEFAULT_EMBED_OPTIONS);
  const [embedError, setEmbedError] = useState(null);

  // When embedded in an iframe, listen for config and theme messages from parent
  useEffect(() => {
    if (!isEmbedded) return;

    const handler = (e) => {
      if (e.data?.type === 'acidtest:config') {
        try {
          const normalized = normalizeConfig(e.data.config);
          const opts = { ...DEFAULT_EMBED_OPTIONS, ...e.data.options };
          setEmbeddedConfig(normalized);
          setEmbedOptions(opts);
          // Apply initial theme override if provided
          const t = opts.theme;
          if (t === 'light' || t === 'dark' || t === 'system') {
            setThemeOverride(t);
          }
        } catch (err) {
          setEmbedError(err.message);
          emitEvent('acidtest:error', { error: err.message });
        }
      } else if (e.data?.type === 'acidtest:theme') {
        // Live theme update from parent
        const t = e.data.theme;
        if (t === 'light' || t === 'dark' || t === 'system') {
          setThemeOverride(t);
        }
      }
    };

    window.addEventListener('message', handler);
    emitEvent('acidtest:ready');

    return () => window.removeEventListener('message', handler);
  }, []);

  let content;
  if (shareParam) {
    // Self-contained shared results view
    content = <SharedResults shareParam={shareParam} />;
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
