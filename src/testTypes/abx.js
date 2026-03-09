/**
 * ABX / ABXY test type — identify which option matches the mystery track(s).
 *
 * ABX: N options + X (mystery). User identifies which option X matches.
 * ABXY: N options + X + Y (mysteries). X and Y each match a different option.
 * Commitment created for X's correct index.
 *
 * Handles both ABX and ABXY via the `isABXY` flag derived from the base type.
 */

import { shuffle } from '../utils/shuffle';
import { createCommitment, verifyAnswer, deriveCorrectId } from '../utils/commitment';

/**
 * @param {object} params
 * @param {object[]} params.options - Test options from config
 * @param {object} params.testConfig - Full test config object
 * @param {boolean} params.isNewTest - First iteration of this test
 * @param {object|null} params.testState - Per-test persistent state
 * @param {boolean} params.hasConfidence - Whether +C suffix was used
 * @param {object[]} params.shuffledOptions - Previously shuffled options
 * @param {string} params.baseType - 'abx' or 'abxy'
 * @returns {{ ui: object, secure: object|null, bufferSources: object[], shuffledOptions: object[], testState: object|null }}
 */
export async function setup({ options, testConfig, isNewTest, testState, hasConfidence, shuffledOptions, baseType }) {
  const isABXY = baseType === 'abxy';
  const shouldReshuffle = isNewTest; // ABX/ABXY don't reshuffle every iteration
  const ordered = shouldReshuffle ? shuffle(options) : shuffledOptions;

  const randomIndex = Math.floor(Math.random() * ordered.length);
  const randomOption = ordered[randomIndex];
  const xOpt = { name: 'X', audioUrl: randomOption.audioUrl };

  const allAnswerIds = ordered.map((_, i) => String(i));
  const commitment = await createCommitment(String(randomIndex), allAnswerIds);

  let bufferSources;
  if (isABXY) {
    const otherIndex = randomIndex === 0 ? 1 : 0;
    const otherOption = ordered[otherIndex];
    const yOpt = { name: 'Y', audioUrl: otherOption.audioUrl };
    bufferSources = [...ordered, xOpt, yOpt];
  } else {
    bufferSources = [...ordered, xOpt];
  }

  return {
    ui: {
      options: ordered,
      totalIterations: testConfig.repeat,
      showConfidence: hasConfidence,
      showProgress: testConfig.showProgress,
    },
    secure: { correctIndex: randomIndex, commitment },
    bufferSources,
    shuffledOptions: ordered,
    testState: null,
  };
}

/**
 * @param {object} params
 * @param {string} params.answerId - Selected track index as string
 * @param {string|null} params.confidence - Confidence level if +C
 * @param {object} params.secure - { correctIndex, commitment }
 * @param {object[]} params.options - Current shuffled options
 * @param {object|null} params.testState - Per-test persistent state
 * @param {{ startedAt: number, finishedAt: number }} params.timing
 * @returns {{ isCorrect: boolean|null, trialRecord: object, progressDot: object, testState: object|null }}
 */
export function processSubmit({ answerId, confidence, secure, options, testState, timing }) {
  const { commitment } = secure;
  const isCorrect = verifyAnswer(commitment.answerHashes, answerId, commitment.correctHash);
  const correctAnswerId = deriveCorrectId(commitment.answerHashes, commitment.correctHash);

  const selectedOption = { name: options[parseInt(answerId)].name };
  const correctOption = { name: options[parseInt(correctAnswerId)].name };

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
