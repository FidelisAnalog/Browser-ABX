/**
 * ABTest — preference test screen.
 * User selects which of A/B/C... they prefer.
 * No correct answer, no progress bar, no confidence.
 */

import { useState, useEffect } from 'react';
import { Box, Button, Typography } from '@mui/material';
import TestHeader from './TestHeader';
import TrackSelector from './TrackSelector';
import { useSelectedTrack } from '../audio/useEngineState';
import { useHotkeys } from '../audio/useHotkeys';
import { useHeardTracks } from '../audio/useHeardTracks';

/**
 * @param {object} props
 * @param {string} props.name - Test name
 * @param {string} [props.description] - Test instructions
 * @param {string} props.stepStr - e.g., "3/10"
 * @param {object[]} props.options - Shuffled option objects
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {number} props.iterationKey - Counter for state resets between iterations
 * @param {(answerId: string, confidence: null) => void} props.onSubmit
 */
export default function ABTest({
  name,
  description,
  stepStr,
  options,
  engine,
  iterationKey,
  onSubmit,
}) {
  const selectedTrack = useSelectedTrack(engine);
  const [answer, setAnswer] = useState(null);
  const { heardTracks, markHeard } = useHeardTracks(iterationKey);

  // Reset state on new iteration
  useEffect(() => { setAnswer(null); }, [iterationKey]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
    markHeard(index);
    setAnswer(index);
  };

  const getAnswerLabel = () => {
    if (answer === null) return '?';
    return String.fromCharCode(65 + answer);
  };

  const canSubmit = answer !== null && heardTracks.size >= options.length;

  const handleSubmit = () => {
    if (!canSubmit) return;
    engine?.stop();
    onSubmit(String(answer), null);
  };

  useHotkeys({ engine, trackCount: options.length, onTrackSelect: handleTrackSelect, onSubmit: handleSubmit });

  return (
    <Box p={2.5}>
      <TestHeader name={name} description={description} />

      <Box display="flex" justifyContent="flex-end" mt={0.5} mr={1}>
        <Typography color="text.secondary">{stepStr}</Typography>
      </Box>

      <TrackSelector
        trackCount={options.length}
        selectedTrack={selectedTrack}
        onSelect={handleTrackSelect}
      />

      <Box display="flex" justifyContent="flex-end" mt={2}>
        <Button
          variant="outlined"
          color="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          sx={{ textTransform: 'none' }}
        >
          Select {getAnswerLabel()}
        </Button>
      </Box>
    </Box>
  );
}
