/**
 * ABXTest — identification test screen for ABX and ABXY.
 * ABX: N options + X (mystery). User identifies which option X matches.
 * ABXY: N options + X + Y (mysteries). User identifies which option X matches.
 *
 * Track count and mystery indices come from the plugin's setup ui props,
 * so this component handles both ABX and ABXY without type-specific branching.
 *
 * When showConfidence is true (+C), clicking "X is A" transforms
 * the submit button into a vertical stack of confidence buttons.
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
 * @param {object[]} props.options - Original (non-mystery) options in fixed order
 * @param {number} props.trackCount - Total tracks including mysteries
 * @param {number[]} props.mysteryIndices - Indices of mystery tracks (e.g., [2] for ABX, [2,3] for ABXY)
 * @param {import('../audio/audioEngine').AudioEngine|null} props.engine
 * @param {number} props.totalIterations - Total number of iterations for this test
 * @param {object[]} props.progressDots - Array of {isCorrect, confidence} for completed iterations
 * @param {boolean} [props.showConfidence] - Whether to show confidence selection (+C)
 * @param {boolean} [props.showProgress] - Whether to show iteration progress bar
 * @param {number} props.iterationKey - Counter for state resets between iterations
 * @param {(answerId: string, confidence: string|null) => void} props.onSubmit
 */
export default function ABXTest({
  name,
  description,
  stepStr,
  options,
  trackCount,
  mysteryIndices,
  engine,
  totalIterations,
  progressDots = [],
  showConfidence = false,
  showProgress = false,
  iterationKey,
  onSubmit,
}) {
  const selectedTrack = useSelectedTrack(engine);

  const [answer, setAnswer] = useState(null);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const { heardTracks, markHeard } = useHeardTracks(iterationKey);

  // Reset state on new iteration
  useEffect(() => { setAnswer(null); setPendingSubmit(false); }, [iterationKey]);

  const handleTrackSelect = (index) => {
    engine?.selectTrack(index);
    markHeard(index);
    // Selecting a mystery track is just for listening — not an answer
    setAnswer(mysteryIndices.includes(index) ? null : index);
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

  // Must have an answer and must have heard X (first mystery track)
  const canSubmit = answer !== null && heardTracks.has(mysteryIndices[0]);

  // Pass xTrackIndex as single number for ABX (center layout) or array for ABXY (circle layout)
  const xTrackIndex = mysteryIndices.length === 1 ? mysteryIndices[0] : mysteryIndices;

  useHotkeys({ engine, trackCount, xTrackIndex, onTrackSelect: handleTrackSelect, onSubmit: handleSubmitClick });

  return (
    <>
      <Box p={2.5}>
        <TestHeader name={name} description={description} />

        <Box display="flex" justifyContent="flex-end" mt={0.5} mr={1}>
          <Typography color="text.secondary">{stepStr}</Typography>
        </Box>

        {/* Track selector with mystery tracks */}
        <TrackSelector
          trackCount={trackCount}
          selectedTrack={selectedTrack}
          onSelect={handleTrackSelect}
          xTrackIndex={xTrackIndex}
        />

        {/* Submit / Confidence area — fixed height, stack grows upward */}
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
                X is {getAnswerLabel()}
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
