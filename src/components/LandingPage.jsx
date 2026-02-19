/**
 * LandingPage — info page when no test URL is specified.
 */

import React from 'react';
import { Box, Button, Container, Link, Paper, Typography } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';

export default function LandingPage() {
  return (
    <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={4} pb={4}>
      <Container maxWidth="md">
        <Paper>
          <Box p={4} textAlign="center">
            <Typography variant="h3" gutterBottom>
              Browser ABX
            </Typography>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Double-blind audio listening tests in your browser
            </Typography>

            <Box mt={4} mb={4}>
              <Typography variant="body1" paragraph>
                Browser ABX is a tool for creating and conducting controlled AB and ABX
                listening tests. It runs entirely in your browser with a focus on audio
                integrity — custom WAV/FLAC decoding, sample rate matching, and a clean
                playback pipeline.
              </Typography>
              <Typography variant="body1" paragraph>
                Create a test by writing a YAML configuration file that references your
                audio samples, then share the URL with participants.
              </Typography>
            </Box>

            <Box mt={3}>
              <Button
                variant="outlined"
                startIcon={<GitHubIcon />}
                component={Link}
                href="https://github.com/FidelisAnalog/Browser-ABX"
                target="_blank"
                rel="noopener"
              >
                View on GitHub
              </Button>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
