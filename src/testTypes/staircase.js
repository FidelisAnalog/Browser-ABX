/**
 * Staircase (2AFC-Staircase) test type — adaptive threshold measurement.
 *
 * Two phases: familiarization (free listen at max level) then real trials.
 * Real trials use adaptive staircase algorithm to find threshold.
 * Supports interleaved (multi-track) staircases.
 * Commitment created for reference track position (0 or 1).
 */

import { createCommitment, verifyAnswer } from '../utils/commitment';
import {
  createStaircaseState, createInterleavedState, getCurrentLevel,
  recordResponse, pickInterleavedTrack, recordInterleavedResponse,
  isInterleavedComplete, minRemainingTrials, minInterleavedRemainingTrials,
} from '../stats/staircase';

/**
 * Build a pair of [reference, test] with randomized positions.
 */
function buildPair(options, level) {
  const reference = options[0];
  const test = options[level];
  const referenceIdx = Math.random() < 0.5 ? 0 : 1;
  const pair = referenceIdx === 0
    ? [{ ...reference }, { ...test }]
    : [{ ...test }, { ...reference }];
  return { pair, referenceIdx };
}

/**
 * @param {object} params
 * @param {object[]} params.options - Test options from config (option[0] = reference, rest = quality levels)
 * @param {object} params.testConfig - Full test config object (includes staircase config)
 * @param {boolean} params.isNewTest - First iteration of this test
 * @param {object|null} params.testState - { adaptiveState, familiarizing }
 * @param {boolean} params.hasConfidence - Always false for staircase
 * @param {object[]} params.shuffledOptions - Not used (staircase doesn't shuffle)
 * @returns {{ ui: object, secure: object|null, bufferSources: object[], shuffledOptions: object[], testState: object }}
 */
export async function setup({ options, testConfig, isNewTest, testState, hasConfidence, shuffledOptions }) {
  const sc = testConfig.staircase;
  const ordered = options; // Staircase never shuffles

  // Initialize adaptive state on new test
  if (isNewTest) {
    const adaptiveState = sc.interleave
      ? createInterleavedState(sc)
      : createStaircaseState(sc);
    testState = { adaptiveState, familiarizing: true };
  }

  if (testState.familiarizing) {
    const reference = ordered[0];
    const startLevel = sc.nLevels;
    const testStim = ordered[startLevel];
    const pair = [{ ...reference }, { ...testStim }];

    return {
      ui: {
        testLevel: startLevel,
        familiarizing: true,
        pairNames: [reference.name, testStim.name],
        reversalCount: 0,
        targetReversals: sc.interleave ? sc.reversals * 2 : sc.reversals,
        minRemaining: 0,
      },
      secure: null,
      bufferSources: pair,
      shuffledOptions: ordered,
      testState,
    };
  }

  // Real trial
  const state = testState.adaptiveState;
  let level;
  let trackIdx = null;
  if (sc.interleave) {
    trackIdx = pickInterleavedTrack(state);
    level = getCurrentLevel(state.tracks[trackIdx]);
  } else {
    level = getCurrentLevel(state);
  }

  const { pair, referenceIdx } = buildPair(ordered, level);

  const allAnswerIds = ['0', '1'];
  const commitment = await createCommitment(String(referenceIdx), allAnswerIds);

  return {
    ui: {
      testLevel: level,
      reversalCount: sc.interleave
        ? state.tracks.reduce((sum, t) => sum + t.reversals.length, 0)
        : state.reversals.length,
      targetReversals: sc.interleave
        ? sc.reversals * 2
        : sc.reversals,
      minRemaining: sc.interleave
        ? minInterleavedRemainingTrials(state)
        : minRemainingTrials(state),
      interleavedTrackIdx: trackIdx,
    },
    secure: { commitment },
    bufferSources: pair,
    shuffledOptions: ordered,
    testState,
  };
}

/**
 * @param {object} params
 * @param {string|null} params.answerId - Selected track index as string, or null for familiarization
 * @param {string|null} params.confidence - Always null for staircase
 * @param {object|null} params.secure - { commitment } or null for familiarization
 * @param {object[]} params.options - Current options (not shuffled)
 * @param {object} params.testState - { adaptiveState, familiarizing }
 * @param {{ startedAt: number, finishedAt: number }} params.timing
 * @param {object} params.ui - The ui return from setup (contains interleavedTrackIdx)
 * @returns {{ isCorrect: boolean|null, trialRecord: object|null, progressDot: object|null, testState: object, isFamiliarization: boolean }}
 */
export function processSubmit({ answerId, confidence, secure, options, testState, timing, ui }) {
  // Familiarization: no trial record, just transition to real trials
  if (testState.familiarizing) {
    return {
      isCorrect: null,
      trialRecord: null,
      progressDot: null,
      testState: { ...testState, familiarizing: false },
      isFamiliarization: true,
    };
  }

  const { commitment } = secure;
  const isCorrect = verifyAnswer(commitment.answerHashes, answerId, commitment.correctHash);

  // Update adaptive state
  const state = testState.adaptiveState;
  if (ui.interleavedTrackIdx != null) {
    recordInterleavedResponse(state, ui.interleavedTrackIdx, isCorrect);
  } else {
    recordResponse(state, isCorrect);
  }

  const trialRecord = {
    level: ui.testLevel,
    isCorrect,
    ...timing,
  };

  return {
    isCorrect,
    trialRecord,
    progressDot: { isCorrect, confidence: null },
    testState,
    isFamiliarization: false,
  };
}

/**
 * @param {object} testState - { adaptiveState, familiarizing }
 * @param {number} repeatStep
 * @param {object} testConfig
 * @returns {boolean}
 */
export function isComplete(testState, repeatStep, testConfig) {
  if (testState.familiarizing) return false;
  const state = testState.adaptiveState;
  if (testConfig.staircase.interleave) {
    return isInterleavedComplete(state);
  }
  return state.complete;
}

/**
 * @param {object[]} trialRecords
 * @param {object} testState - { adaptiveState }
 * @param {object} testConfig
 * @returns {object}
 */
export function mergeResults(trialRecords, testState, testConfig) {
  return {
    staircaseData: {
      trials: JSON.parse(JSON.stringify(trialRecords)),
      finalState: JSON.parse(JSON.stringify(testState.adaptiveState)),
      interleaved: testConfig.staircase.interleave,
    },
  };
}
