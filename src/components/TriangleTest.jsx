/**
 * TriangleTest — odd-one-out identification test screen.
 * Three tracks are presented: two identical, one different.
 * User identifies which track is the odd one out.
 *
 * When showConfidence is true (Triangle+C), clicking the submit button
 * transforms into a vertical stack of confidence buttons.
 * When false (plain Triangle), clicking submits immediately.
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
 * @param {string} props.stepStr - e.g., "3/10"
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {number} props.totalIterations - Total number of iterations for this test
 * @param {object[]} props.progressDots - Array of {isCorrect, confidence} for completed iterations
 * @param {boolean} [props.showConfidence] - Whether to show confidence selection (Triangle+C)
 * @param {boolean} [props.showProgress] - Whether to show iteration progress bar
 * @param {number} props.iterationKey - Counter for state resets between iterations
 * @param {(answerId: string, confidence: string|null) => void} props.onSubmit
 */
export default function TriangleTest({
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
  const trackCount = 3;
  const selectedTrack = useSelectedTrack(engine);

  const [answer, setAnswer] = useState(null);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const { heardTracks, markHeard } = useHeardTracks(iterationKey);

  // Reset state on new iteration
  useEffect(() => { setAnswer(null); setPendingSubmit(false); }, [iterationKey]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
    markHeard(index);
    setAnswer(index);
    setPendingSubmit(false);
  };

  const getAnswerLabel = () => {
    if (answer === null) return '?';
    return String.fromCharCode(65 + answer);
  };

  const handleSubmitClick = () => {
    if (answer === null) return;
    if (showConfidence) {
      setPendingSubmit(true);
    } else {
      engine?.stop();
      onSubmit(String(answer), null);
    }
  };

  const handleConfidenceClick = (confidence) => {
    engine?.stop();
    onSubmit(String(answer), confidence);
  };

  const canSubmit = answer !== null && heardTracks.size >= trackCount;

  useHotkeys({ engine, trackCount, onTrackSelect: handleTrackSelect, onSubmit: handleSubmitClick });

  return (
    <>
      <Box p={2.5}>
        <TestHeader name={name} description={description} />

        <Box display="flex" justifyContent="flex-end" mt={0.5} mr={1}>
          <Typography color="text.secondary">{stepStr}</Typography>
        </Box>

        {/* Track selector — 3 buttons, no X */}
        <TrackSelector
          trackCount={trackCount}
          selectedTrack={selectedTrack}
          onSelect={handleTrackSelect}
          xTrackIndex={null}
        />

        {/* Submit / Confidence area */}
        <Box
          display="flex"
          justifyContent="flex-end"
          mt={1}
          sx={{ position: 'relative', height: 36.5 }}
        >
          {!pendingSubmit && (
            <Box sx={{ position: 'absolute', bottom: 0, right: 0 }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleSubmitClick}
                disabled={!canSubmit}
                sx={{ textTransform: 'none' }}
              >
                {getAnswerLabel()} is different
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
