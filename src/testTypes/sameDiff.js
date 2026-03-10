/**
 * SameDiff (2AFC-SD) test type — same or different?
 *
 * Two tracks are presented. User judges whether they are the same or different.
 * Trials are drawn from a balanced bag of 4 types (AA, AB, BA, BB) or randomly.
 * Commitment created for the correct pair type ('same' or 'different').
 */

import { shuffle } from '../utils/shuffle';
import { createCommitment, verifyAnswer, deriveCorrectId } from '../utils/commitment';

const TRIAL_TYPES = ['AA', 'AB', 'BA', 'BB'];

/**
 * Draw a single trial type from a balanced bag or randomly.
 * Mutates testState.sdBag when balanced.
 */
function drawTrialType(testConfig, isNewTest, testState) {
  if (!testConfig.balanced) {
    return { trialType: TRIAL_TYPES[Math.floor(Math.random() * 4)], testState };
  }

  const newState = isNewTest
    ? { sdBag: shuffle([...TRIAL_TYPES]) }
    : { ...testState };

  const bag = newState.sdBag;
  if (bag.length === 0) {
    bag.push(...shuffle([...TRIAL_TYPES]));
  }
  const idx = Math.floor(Math.random() * bag.length);
  const trialType = bag.splice(idx, 1)[0];

  return { trialType, testState: newState };
}

/**
 * @param {object} params
 * @param {object[]} params.options - Test options from config (2+ options, first 2 used)
 * @param {object} params.testConfig - Full test config object
 * @param {boolean} params.isNewTest - First iteration of this test
 * @param {object|null} params.testState - Per-test persistent state ({ sdBag: string[] })
 * @param {boolean} params.hasConfidence - Whether +C suffix was used
 * @param {object[]} params.shuffledOptions - Previously shuffled options
 * @returns {{ ui: object, secure: object|null, bufferSources: object[], shuffledOptions: object[], testState: object|null }}
 */
export async function setup({ options, testConfig, isNewTest, testState, hasConfidence, shuffledOptions }) {
  const ordered = isNewTest ? shuffle(options) : shuffledOptions;

  const { trialType, testState: newState } = drawTrialType(testConfig, isNewTest, testState);
  const pairType = (trialType === 'AA' || trialType === 'BB') ? 'same' : 'different';
  const pairMap = {
    AA: [ordered[0], ordered[0]],
    BB: [ordered[1], ordered[1]],
    AB: [ordered[0], ordered[1]],
    BA: [ordered[1], ordered[0]],
  };
  const sdPair = pairMap[trialType].map((o) => ({ ...o }));

  const allAnswerIds = ['same', 'different'];
  const commitment = await createCommitment(pairType, allAnswerIds);

  return {
    ui: {
      totalIterations: testConfig.repeat,
      showConfidence: hasConfidence,
      showProgress: testConfig.showProgress,
    },
    secure: { commitment },
    bufferSources: sdPair,
    shuffledOptions: ordered,
    testState: newState,
  };
}

/**
 * @param {object} params
 * @param {string} params.answerId - 'same' or 'different'
 * @param {string|null} params.confidence - Confidence level if +C
 * @param {object} params.secure - { commitment }
 * @param {object[]} params.options - Current shuffled options
 * @param {object|null} params.testState - Per-test persistent state
 * @param {{ startedAt: number, finishedAt: number }} params.timing
 * @returns {{ isCorrect: boolean|null, trialRecord: object, progressDot: object, testState: object|null }}
 */
export function processSubmit({ answerId, confidence, secure, options, testState, timing }) {
  const { commitment } = secure;
  const isCorrect = verifyAnswer(commitment.answerHashes, answerId, commitment.correctHash);
  const correctPairType = deriveCorrectId(commitment.answerHashes, commitment.correctHash);

  const trialRecord = {
    userResponse: answerId,
    pairType: correctPairType,
    confidence: confidence || null,
    ...timing,
  };

  return {
    isCorrect,
    trialRecord,
    progressDot: { isCorrect, confidence: confidence || null },
    testState,
  };
}

/**
 * @param {object|null} testState
 * @param {number} repeatStep
 * @param {object} testConfig
 * @returns {boolean}
 */
export function isComplete(testState, repeatStep, testConfig) {
  return repeatStep + 1 >= testConfig.repeat;
}

/**
 * @param {object[]} trialRecords
 * @param {object|null} testState
 * @param {object} testConfig
 * @returns {object}
 */
export function mergeResults(trialRecords, testState, testConfig) {
  return { userSelectionsAndCorrects: trialRecords };
}
