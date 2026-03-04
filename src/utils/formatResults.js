/**
 * formatResultsForEmit — transforms internal results state into the public
 * postMessage payload shape for dbt:completed.
 *
 * This is the serialization boundary between internal pipeline and public API.
 * Internal results contain full option objects (with audioUrl, etc.); the public
 * payload contains only what the consumer needs and doesn't already know.
 */

import { parseTestType } from './testTypeRegistry';

/**
 * Build letter-keyed options map from optionNames array.
 * ['FLAC', 'MP3 320k'] → { A: 'FLAC', B: 'MP3 320k' }
 * @param {string[]} optionNames
 * @returns {Object<string, string>}
 */
function buildOptionsMap(optionNames) {
  const map = {};
  for (let i = 0; i < optionNames.length; i++) {
    map[String.fromCharCode(65 + i)] = optionNames[i];
  }
  return map;
}

/**
 * Build reverse lookup: option name → label letter.
 * { 'FLAC': 'A', 'MP3 320k': 'B' }
 * @param {string[]} optionNames
 * @returns {Object<string, string>}
 */
function buildNameToLabel(optionNames) {
  const map = {};
  for (let i = 0; i < optionNames.length; i++) {
    map[optionNames[i]] = String.fromCharCode(65 + i);
  }
  return map;
}

/**
 * Create a { label, name } option reference.
 * @param {string} name - Option name
 * @param {Object<string, string>} nameToLabel - Reverse lookup
 * @returns {{ label: string, name: string }}
 */
function optionRef(name, nameToLabel) {
  return { label: nameToLabel[name] || '?', name };
}

/**
 * Compute duration in ms from startedAt/finishedAt timestamps.
 * @param {number} startedAt
 * @param {number} finishedAt
 * @returns {number}
 */
function durationMs(startedAt, finishedAt) {
  return finishedAt - startedAt;
}

/**
 * Format AB iterations.
 * @param {object[]} userSelections
 * @param {Object<string, string>} nameToLabel
 * @returns {object[]}
 */
function formatAbIterations(userSelections, nameToLabel) {
  return userSelections.map((s) => ({
    selected: optionRef(s.name, nameToLabel),
    durationMs: durationMs(s.startedAt, s.finishedAt),
  }));
}

/**
 * Format ABX / ABXY / Triangle iterations.
 * @param {object[]} userSelectionsAndCorrects
 * @param {Object<string, string>} nameToLabel
 * @returns {object[]}
 */
function formatAbxIterations(userSelectionsAndCorrects, nameToLabel) {
  return userSelectionsAndCorrects.map((s) => ({
    selected: optionRef(s.selectedOption.name, nameToLabel),
    correctAnswer: optionRef(s.correctOption.name, nameToLabel),
    isCorrect: s.selectedOption.name === s.correctOption.name,
    ...(s.confidence != null && { confidence: s.confidence }),
    durationMs: durationMs(s.startedAt, s.finishedAt),
  }));
}

/**
 * Format 2AFC-SD iterations.
 * @param {object[]} userSelectionsAndCorrects
 * @returns {object[]}
 */
function formatSameDiffIterations(userSelectionsAndCorrects) {
  return userSelectionsAndCorrects.map((s) => ({
    response: s.userResponse,
    pairType: s.pairType,
    isCorrect: s.userResponse === s.pairType,
    ...(s.confidence != null && { confidence: s.confidence }),
    durationMs: durationMs(s.startedAt, s.finishedAt),
  }));
}

/**
 * Format staircase iterations.
 * @param {object} staircaseData - { trials, finalState, interleaved }
 * @returns {{ iterations: object[], finalState: object|null }}
 */
function formatStaircaseIterations(staircaseData) {
  if (Array.isArray(staircaseData) && staircaseData.length === 0) {
    return { iterations: [], finalState: null };
  }
  return {
    iterations: staircaseData.trials.map((t) => ({
      level: t.level,
      correct: t.isCorrect,
      durationMs: durationMs(t.startedAt, t.finishedAt),
    })),
    finalState: staircaseData.finalState,
  };
}

/**
 * Transform internal results array into the public API payload.
 * @param {object[]} results - Internal results state from TestRunner
 * @returns {object[]} Clean public payload array
 */
export function formatResultsForEmit(results) {
  return results.map((result) => {
    const { baseType } = parseTestType(result.testType);
    const options = buildOptionsMap(result.optionNames);
    const nameToLabel = buildNameToLabel(result.optionNames);

    const base = {
      name: result.name,
      testType: result.testType,
      options,
    };

    if (baseType === 'ab') {
      return { ...base, iterations: formatAbIterations(result.userSelections, nameToLabel) };
    }
    if (baseType === 'abx' || baseType === 'abxy' || baseType === 'triangle') {
      return { ...base, iterations: formatAbxIterations(result.userSelectionsAndCorrects, nameToLabel) };
    }
    if (baseType === '2afc-sd') {
      return { ...base, iterations: formatSameDiffIterations(result.userSelectionsAndCorrects) };
    }
    if (baseType === '2afc-staircase') {
      const { iterations, finalState } = formatStaircaseIterations(result.staircaseData);
      return { ...base, iterations, finalState };
    }

    // Unknown type — pass through name and options only
    return base;
  });
}
