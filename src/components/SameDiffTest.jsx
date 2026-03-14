/**
 * SameDiffTest — 2AFC same-different discrimination test screen.
 * Each trial presents a pair of audio samples (AA, BB, AB, or BA).
 * User answers "Same" or "Different."
 *
 * When showConfidence is true (2AFC-SD+C), clicking Same/Different
 * transforms into a vertical stack of confidence buttons.
 */

import { useState, useEffect } from 'react';
import { Box, Button, Typography } from '@mui/material';
import TestHeader from './TestHeader';
import TrackSelector from './TrackSelector';
import ConfidenceButtons from './ConfidenceButtons';
import FixedProgress from './FixedProgress';
import { useSelectedTrack } from '../audio/useEngineState';
import { useHotkeys } from '../audio/useHotkeys';
import { useHeardTracks } from '../audio/useHeardTracks';

/**
 * @param {object} props
 * @param {string} props.name - Test name
 * @param {string} [props.description] - Test instructions
 * @param {string} props.stepStr - e.g., "3/16"
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {number} props.totalIterations - Total number of iterations
 * @param {object[]} props.progressDots - Array of {isCorrect, confidence} for completed iterations
 * @param {boolean} [props.showConfidence] - Whether to show confidence selection
 * @param {boolean} [props.showProgress] - Whether to show iteration progress bar
 * @param {number} props.iterationKey - Counter for state resets between iterations
 * @param {(answerId: string, confidence: string|null) => void} props.onSubmit
 */
export default function SameDiffTest({
  name,
  description,
  stepStr,
  engine,
  totalIterations,
  progressDots = [],
  showConfidence = false,
  showProgress = false,
  iterationKey,
  onSubmit,
}) {
  const trackCount = 2;
  const selectedTrack = useSelectedTrack(engine);

  const [answer, setAnswer] = useState(null);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const { heardTracks, markHeard } = useHeardTracks(iterationKey);

  // Reset state on new iteration
  useEffect(() => { setAnswer(null); setPendingSubmit(false); }, [iterationKey]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
    markHeard(index);
  };

  const canAnswer = heardTracks.size >= trackCount;

  const handleAnswerClick = (response) => {
    setAnswer(response);
    setPendingSubmit(false);
    if (showConfidence) {
      setPendingSubmit(true);
    } else {
      engine?.stop();
      onSubmit(response, null);
    }
  };

  const handleConfidenceClick = (confidence) => {
    engine?.stop();
    onSubmit(answer, confidence);
  };

  useHotkeys({ engine, trackCount, onTrackSelect: handleTrackSelect, onSubmit: () => {} });

  return (
    <>
      <Box p={2.5}>
        <TestHeader name={name} description={description} />

        <Box display="flex" justifyContent="flex-end" mt={0.5} mr={1}>
          <Typography color="text.secondary">{stepStr}</Typography>
        </Box>

        {/* Track selector — 2 buttons, no X */}
        <TrackSelector
          trackCount={trackCount}
          selectedTrack={selectedTrack}
          onSelect={handleTrackSelect}
          xTrackIndex={null}
        />

        {/* Answer / Confidence area */}
        <Box
          display="flex"
          justifyContent="flex-end"
          mt={1}
          sx={{ position: 'relative', height: 36.5 }}
        >
          {!pendingSubmit && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                display: 'flex',
                gap: 1,
              }}
            >
              <Button
                variant="outlined"
                color="primary"
                onClick={() => handleAnswerClick('same')}
                disabled={!canAnswer}
                sx={{ textTransform: 'none', minWidth: 100 }}
              >
                Same
              </Button>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => handleAnswerClick('different')}
                disabled={!canAnswer}
                sx={{ textTransform: 'none', minWidth: 100 }}
              >
                Different
              </Button>
            </Box>
          )}

          {pendingSubmit && (
            <ConfidenceButtons onSelect={handleConfidenceClick} />
          )}
        </Box>
      </Box>

      {showProgress && (
        <FixedProgress progressDots={progressDots} totalIterations={totalIterations} />
      )}
    </>
  );
}
