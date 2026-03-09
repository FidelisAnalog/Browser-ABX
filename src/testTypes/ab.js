/**
 * AB test type — preference test, no correct answer.
 *
 * Users select which track they prefer from N shuffled options.
 * No commitment, no verification, no confidence.
 */

import { shuffle } from '../utils/shuffle';

/**
 * @param {object} params
 * @param {object[]} params.options - Test options from config
 * @param {object} params.testConfig - Full test config object
 * @param {boolean} params.isNewTest - First iteration of this test
 * @param {object|null} params.testState - Per-test persistent state
 * @param {boolean} params.hasConfidence - Whether +C suffix was used
 * @param {object[]} params.shuffledOptions - Previously shuffled options (for non-reshuffle types)
 * @returns {{ ui: object, secure: object|null, bufferSources: object[], shuffledOptions: object[], testState: object|null }}
 */
export async function setup({ options, testConfig, isNewTest, testState, hasConfidence, shuffledOptions }) {
  const ordered = isNewTest ? shuffle(options) : shuffle(options); // AB reshuffles every iteration

  return {
    ui: { options: ordered },
    secure: null,
    bufferSources: ordered,
    shuffledOptions: ordered,
    testState: null,
  };
}

/**
 * @param {object} params
 * @param {string} params.answerId - Selected track index as string
 * @param {string|null} params.confidence - Always null for AB
 * @param {object|null} params.secure - Always null for AB
 * @param {object[]} params.options - Current shuffled options
 * @param {object|null} params.testState - Per-test persistent state
 * @param {{ startedAt: number, finishedAt: number }} params.timing
 * @returns {{ isCorrect: boolean|null, trialRecord: object, progressDot: object, testState: object|null }}
 */
export function processSubmit({ answerId, confidence, secure, options, testState, timing }) {
  const trialRecord = {
    ...options[parseInt(answerId)],
    ...timing,
  };

  return {
    isCorrect: null,
    trialRecord,
    progressDot: { isCorrect: null, confidence: null },
    testState: null,
  };
}

/**
 * @param {object|null} testState - Per-test persistent state
 * @param {number} repeatStep - Current iteration (0-based)
 * @param {object} testConfig - Full test config object
 * @returns {boolean} Whether the test should continue
 */
export function isComplete(testState, repeatStep, testConfig) {
  return repeatStep + 1 >= testConfig.repeat;
}

/**
 * @param {object[]} trialRecords - All trial records from this test
 * @param {object|null} testState - Per-test persistent state
 * @param {object} testConfig - Full test config object
 * @returns {object} Result data to merge into results array
 */
export function mergeResults(trialRecords, testState, testConfig) {
  return { userSelections: trialRecords };
}
