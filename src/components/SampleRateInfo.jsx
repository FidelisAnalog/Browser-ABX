/**
 * SampleRateInfo — displays audio sample rate status.
 * Shows source rate, context rate, hardware rate, and any mismatches.
 */

import React from 'react';
import { Alert, AlertTitle, Typography, Box } from '@mui/material';

/**
 * @param {object} props
 * @param {object} props.info - SampleRateInfo from AudioEngine
 * @param {number} props.info.sourceRate
 * @param {number} props.info.contextRate
 * @param {number} props.info.hardwareRate
 * @param {boolean} props.info.rateMatch - contextRate === sourceRate
 * @param {boolean} props.info.hardwareMatch - hardwareRate === sourceRate
 */
export default function SampleRateInfo({ info }) {
  if (!info) return null;

  const formatRate = (rate) => {
    const kHz = rate / 1000;
    return kHz % 1 === 0 ? `${kHz}kHz` : `${kHz.toFixed(1)}kHz`;
  };

  // Everything matches — no need to show anything
  if (info.rateMatch && info.hardwareMatch) {
    return null;
  }

  // Browser rejected our requested rate
  if (!info.rateMatch) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <AlertTitle>Browser Sample Rate Mismatch</AlertTitle>
        <Typography variant="body2">
          Your audio files are {formatRate(info.sourceRate)} but your browser is running at{' '}
          {formatRate(info.contextRate)}. Audio will be resampled internally.
          Try a different browser for native rate support.
        </Typography>
      </Alert>
    );
  }

  // Context matches source but hardware doesn't
  if (!info.hardwareMatch) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        <AlertTitle>System Output Rate Mismatch</AlertTitle>
        <Typography variant="body2">
          Your audio files are {formatRate(info.sourceRate)} but your system audio output is set to{' '}
          {formatRate(info.hardwareRate)}. For bit-accurate playback, set your system output
          to {formatRate(info.sourceRate)} or higher.
        </Typography>
        <Box mt={1}>
          <Typography variant="caption" color="text.secondary">
            This does not affect the validity of comparison results since both tracks
            go through the same output path.
          </Typography>
        </Box>
      </Alert>
    );
  }

  return null;
}
