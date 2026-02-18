import React from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import TestRunner from './components/TestRunner';
import SharedResults from './components/SharedResults';
import LandingPage from './components/LandingPage';

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#f57c00' },
  },
});

export default function App() {
  const url = new URL(window.location.toString());
  const configUrl = url.searchParams.get('test');
  const resultsParam = url.searchParams.get('results');

  let content;
  if (configUrl && resultsParam) {
    content = <SharedResults configUrl={configUrl} resultsParam={resultsParam} />;
  } else if (configUrl) {
    content = <TestRunner configUrl={configUrl} />;
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
