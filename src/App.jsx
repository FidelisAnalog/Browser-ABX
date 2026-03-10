import { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, ThemeProvider, Typography, createTheme, CssBaseline } from '@mui/material';
import TestSession from './components/TestSession';
import SharedResults from './components/SharedResults';
import LandingPage from './components/LandingPage';
import Layout from './components/Layout';
import { useConfig } from './hooks/useConfig';
import { useAppEvents } from './hooks/useAppEvents';
import { normalizeConfig } from './utils/config';
import { isEmbedded } from './utils/embed';

/** Shared palette values that work on both light and dark backgrounds */
const shared = {
  primary:   { main: '#1976d2' },
  secondary: { main: '#f57c00' },
  success: { light: '#66bb6a', main: '#43a047', dark: '#2e7d32' },
  error:   { light: '#ef5350', main: '#e53935', dark: '#c62828' },
  confidence: {
    correct:   { sure: '#175C33', somewhat: '#279957', guessing: '#59C987' },
    incorrect: { sure: '#7A1B15', somewhat: '#C42E22', guessing: '#E87B72' },
  },
};

const lightPalette = {
  mode: 'light',
  ...shared,
  background: { default: '#f6f6f6', paper: '#ffffff' },
  track: { main: '#424242', hover: '#616161', contrastText: '#ffffff' },
  progress: { pending: '#e0e0e0', correct: '#43a047', incorrect: '#e53935' },
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
  progress: { pending: '#424242', correct: '#43a047', incorrect: '#e53935' },
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
  createTheme({
    palette: mode === 'dark' ? darkPalette : lightPalette,
    ...(isEmbedded && {
      components: {
        MuiContainer: {
          defaultProps: { disableGutters: true },
        },
      },
    }),
  });

/** Default embed options */
const DEFAULT_EMBED_OPTIONS = {
  postResults: true,
  skipWelcome: false,
  skipResults: false,
};

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

  // Current screen reported by TestSession (loading, welcome, test, results)
  const [screen, setScreen] = useState(null);

  // Content height reported by Layout (for acidtest:resize)
  const [contentHeight, setContentHeight] = useState(null);
  const onContentHeight = useCallback((h) => setContentHeight(h), []);

  // Boundary adapter — single owner of all outbound postMessage
  const { onTestEvent } = useAppEvents({ contentHeight });

  // Standalone config loading (URL param)
  const { config: standaloneConfig, configError } = useConfig(configUrl);

  // postMessage state — config received via postMessage from parent/opener
  const [postMessageConfig, setPostMessageConfig] = useState(null);
  const [postMessageOptions, setPostMessageOptions] = useState(DEFAULT_EMBED_OPTIONS);
  const [postMessageError, setPostMessageError] = useState(null);

  // When no URL config, listen for config and theme messages via postMessage
  const needsPostMessage = !configUrl && !shareParam;
  useEffect(() => {
    if (!needsPostMessage) return;

    const handler = (e) => {
      if (e.data?.type === 'acidtest:config') {
        try {
          const normalized = normalizeConfig(e.data.config);
          const opts = { ...DEFAULT_EMBED_OPTIONS, ...e.data.options };
          setPostMessageConfig(normalized);
          setPostMessageOptions(opts);
          // Apply initial theme override if provided
          const t = opts.theme;
          if (t === 'light' || t === 'dark' || t === 'system') {
            setThemeOverride(t);
          }
        } catch (err) {
          setPostMessageError(err.message);
          onTestEvent('error', { error: err.message });
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
    return () => window.removeEventListener('message', handler);
  }, [needsPostMessage, onTestEvent]);

  // Determine content and screen for non-TestSession routes
  let content;
  let directScreen = null; // screen set directly (non-TestSession routes)
  if (shareParam) {
    directScreen = 'shared-results';
    content = <SharedResults shareParam={shareParam} />;
  } else if (configUrl) {
    if (configError) {
      directScreen = 'error';
      content = (
        <Box display="flex" justifyContent="center" alignItems="center" flex={1}>
          <Typography color="error">{configError}</Typography>
        </Box>
      );
    } else if (standaloneConfig) {
      content = (
        <TestSession
          config={standaloneConfig}
          configUrl={configUrl}
          onScreen={setScreen}
          onTestEvent={onTestEvent}
        />
      );
    } else {
      // Config still loading — TestSession will show loading screen
      content = null;
    }
  } else if (postMessageError) {
    directScreen = 'error';
    content = (
      <Box display="flex" justifyContent="center" alignItems="center" flex={1}>
        <Typography color="error">{postMessageError}</Typography>
      </Box>
    );
  } else if (postMessageConfig) {
    content = (
      <TestSession
        config={postMessageConfig}
        postResults={postMessageOptions.postResults}
        skipWelcome={postMessageOptions.skipWelcome}
        skipResults={postMessageOptions.skipResults}
        onScreen={setScreen}
        onTestEvent={onTestEvent}
      />
    );
  } else {
    directScreen = 'landing';
    content = <LandingPage />;
  }

  // directScreen overrides TestSession's screen for non-TestSession routes
  const activeScreen = directScreen || screen;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Layout screen={activeScreen} onContentHeight={onContentHeight}>
        {content}
      </Layout>
    </ThemeProvider>
  );
}
