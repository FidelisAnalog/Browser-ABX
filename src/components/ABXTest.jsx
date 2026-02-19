/**
 * ABXTest — identification test screen.
 * X is a random copy of one option. User identifies which option X matches.
 * Uses composition (not inheritance) with shared AudioControls.
 */

import React, { useState, useEffect } from 'react';
import { Box, Button, Container, Divider, Paper, Typography } from '@mui/material';
import TrackSelector from './TrackSelector';
import AudioControls from './AudioControls';
import { useSelectedTrack } from '../audio/useEngineState';

/**
 * @param {object} props
 * @param {string} props.name - Test name
 * @param {string} [props.description] - Test instructions
 * @param {string} props.stepStr - e.g., "3/10"
 * @param {object[]} props.options - Original (non-X) options in fixed order
 * @param {object} props.xOption - The X option (has audioUrl matching one of the options)
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {Float32Array[]} props.channelData - Stable channel 0 data for waveform (from TestRunner)
 * @param {boolean} props.crossfadeForced
 * @param {number} props.totalIterations - Total number of iterations for this test
 * @param {object[]} props.iterationResults - Array of {selectedOption, correctOption} for completed iterations
 * @param {(selectedOption: object, correctOption: object) => void} props.onSubmit
 */
export default function ABXTest({
  name,
  description,
  stepStr,
  options,
  xOption,
  engine,
  channelData,
  crossfadeForced,
  totalIterations,
  iterationResults = [],
  onSubmit,
}) {
  const trackCount = options.length + 1; // options + X
  const xTrackIndex = trackCount - 1;    // X is always last

  const selectedTrack = useSelectedTrack(engine);

  // The user's answer: which non-X option they think X matches
  const [answer, setAnswer] = useState(null);

  // Reset answer when X changes (new iteration)
  useEffect(() => { setAnswer(null); }, [xOption]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
    // If they selected a non-X track, that's their answer; selecting X resets
    setAnswer(index === xTrackIndex ? null : index);
  };

  const getAnswerLabel = () => {
    if (answer === null) return '?';
    return String.fromCharCode(65 + answer);
  };

  const handleSubmit = () => {
    if (answer === null) return;
    engine?.stop();

    // Find the correct option (the one whose audioUrl matches X)
    const correctOption = options.find(
      (opt) => opt.audioUrl === xOption.audioUrl
    );

    onSubmit(options[answer], correctOption);
  };

  // Can submit when: user has selected a non-X option as their answer
  const canSubmit = answer !== null;

  return (
    <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={2} pb={2}>
      <Container maxWidth="md">
        <Box display="flex" flexDirection="column" gap={1.5}>
          {/* Test info */}
          <Paper>
            <Box p={2.5}>
              <Box mb={4}>
                <Typography variant="h4" textAlign="center">
                  {name}
                </Typography>
                {description && (
                  <Box mt={2}>
                    <Typography textAlign="center">{description}</Typography>
                  </Box>
                )}
              </Box>

              <Divider />

              <Box display="flex" justifyContent="flex-end" mt={0.5} mr={1}>
                <Typography color="text.secondary">{stepStr}</Typography>
              </Box>

              {/* Track selector with X */}
              <TrackSelector
                trackCount={trackCount}
                selectedTrack={selectedTrack}
                onSelect={handleTrackSelect}
                xTrackIndex={xTrackIndex}
              />

              {/* Submit */}
              <Box display="flex" justifyContent="flex-end" mt={2}>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  sx={{ textTransform: 'none' }}
                >
                  X is {getAnswerLabel()}
                </Button>
              </Box>
            </Box>

            {/* Iteration progress bar */}
            <Box
              display="flex"
              gap="3px"
              sx={{ px: 2.5, pb: 1.5 }}
            >
              {Array.from({ length: totalIterations }, (_, i) => {
                let color = '#e0e0e0'; // grey — not yet attempted
                if (i < iterationResults.length) {
                  const r = iterationResults[i];
                  color = r.selectedOption.audioUrl === r.correctOption.audioUrl
                    ? '#4caf50'   // green — correct
                    : '#f44336';  // red — incorrect
                }
                return (
                  <Box
                    key={i}
                    sx={{
                      flex: 1,
                      height: 6,
                      borderRadius: 1,
                      backgroundColor: color,
                    }}
                  />
                );
              })}
            </Box>
          </Paper>

          {/* Audio controls */}
          <AudioControls
            engine={engine}
            channelData={channelData}
            crossfadeForced={crossfadeForced}
          />
        </Box>
      </Container>
    </Box>
  );
}
