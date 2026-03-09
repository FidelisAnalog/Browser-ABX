/**
 * Triangle test type — pick the odd one out of three.
 *
 * Two tracks are identical, one is different. User identifies the different one.
 * Commitment created for the correct odd track position (0, 1, or 2).
 */

import { shuffle } from '../utils/shuffle';
import { createCommitment, verifyAnswer, deriveCorrectId } from '../utils/commitment';

/**
 * @param {object} params
 * @param {object[]} params.options - Test options from config (2+ options, first 2 used)
 * @param {object} params.testConfig - Full test config object
 * @param {boolean} params.isNewTest - First iteration of this test
 * @param {object|null} params.testState - Per-test persistent state
 * @param {boolean} params.hasConfidence - Whether +C suffix was used
 * @param {object[]} params.shuffledOptions - Previously shuffled options
 * @returns {{ ui: object, secure: object|null, bufferSources: object[], shuffledOptions: object[], testState: object|null }}
 */
export async function setup({ options, testConfig, isNewTest, testState, hasConfidence, shuffledOptions }) {
  const ordered = isNewTest ? shuffle(options) : shuffledOptions;

  const oddIdx = Math.floor(Math.random() * ordered.length);
  const dupIdx = oddIdx === 0 ? 1 : 0;
  const correctOdd = ordered[oddIdx];
  const triplet = shuffle([
    { ...ordered[dupIdx] },
    { ...correctOdd },
    { ...ordered[dupIdx] },
  ]);
  const correctTripletIdx = triplet.findIndex((t) => t.audioUrl === correctOdd.audioUrl);

  const allAnswerIds = ['0', '1', '2'];
  const commitment = await createCommitment(String(correctTripletIdx), allAnswerIds);

  return {
    ui: {
      totalIterations: testConfig.repeat,
      showConfidence: hasConfidence,
      showProgress: testConfig.showProgress,
    },
    secure: { tripletOptions: triplet.map((t) => ({ name: t.name })), commitment },
    bufferSources: triplet,
    shuffledOptions: ordered,
    testState: null,
  };
}

/**
 * @param {object} params
 * @param {string} params.answerId - Selected track position as string ('0', '1', or '2')
 * @param {string|null} params.confidence - Confidence level if +C
 * @param {object} params.secure - { tripletOptions, commitment }
 * @param {object[]} params.options - Current shuffled options
 * @param {object|null} params.testState - Per-test persistent state
 * @param {{ startedAt: number, finishedAt: number }} params.timing
 * @returns {{ isCorrect: boolean|null, trialRecord: object, progressDot: object, testState: object|null }}
 */
export function processSubmit({ answerId, confidence, secure, options, testState, timing }) {
  const { tripletOptions, commitment } = secure;
  const isCorrect = verifyAnswer(commitment.answerHashes, answerId, commitment.correctHash);
  const correctAnswerId = deriveCorrectId(commitment.answerHashes, commitment.correctHash);

  const selectedOption = { name: tripletOptions[parseInt(answerId)].name };
  const correctOption = { name: tripletOptions[parseInt(correctAnswerId)].name };

  const trialRecord = {
    selectedOption,
    correctOption,
    confidence: confidence || null,
    ...timing,
  };

  return {
    isCorrect,
    trialRecord,
    progressDot: { isCorrect, confidence: confidence || null },
    testState: null,
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
