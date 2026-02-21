/**
 * Test type registry — central lookup for all test type behavior.
 *
 * Each base type (ab, abx, triangle) maps to a descriptor containing
 * component references, stats functions, and behavioral flags.
 * The +C confidence suffix is handled by parseTestType(), not as
 * separate registry entries.
 */

import ABTest from '../components/ABTest';
import ABXTest from '../components/ABXTest';
import ABXYTest from '../components/ABXYTest';
import TriangleTest from '../components/TriangleTest';
import SameDiffTest from '../components/SameDiffTest';
import ABStats from '../components/ABStats';
import ABXStats from '../components/ABXStats';
import TriangleStats from '../components/TriangleStats';
import SameDiffStats from '../components/SameDiffStats';
import {
  computeAbStats, computeAbxStats, computeTriangleStats, computeSameDiffStats,
} from '../stats/statistics';

/**
 * Parse a testType string into base type key + confidence flag.
 * @param {string} testType - Raw type string from config (e.g., "ABX+C", "Triangle")
 * @returns {{ baseType: string, hasConfidence: boolean }}
 */
export function parseTestType(testType) {
  const lower = testType.toLowerCase();
  const hasConfidence = lower.endsWith('+c');
  const baseType = hasConfidence ? lower.slice(0, -2) : lower;
  return { baseType, hasConfidence };
}

/**
 * Test type registry.
 * Maps base type string → behavior descriptor.
 */
export const TEST_TYPES = {
  ab: {
    testComponent: ABTest,
    statsComponent: ABStats,
    computeStats: computeAbStats,
    resultDataKey: 'userSelections',
    supportsConfidence: false,
    reshuffleEveryIteration: true,
    waveformExtraTracks: 0,
    submitType: 'ab',
    shareEncoding: 'ab',
  },
  abx: {
    testComponent: ABXTest,
    statsComponent: ABXStats,
    computeStats: computeAbxStats,
    resultDataKey: 'userSelectionsAndCorrects',
    supportsConfidence: true,
    reshuffleEveryIteration: false,
    waveformExtraTracks: 1,
    submitType: 'abx',
    shareEncoding: 'abx',
  },
  abxy: {
    testComponent: ABXYTest,
    statsComponent: ABXStats,
    computeStats: computeAbxStats,
    resultDataKey: 'userSelectionsAndCorrects',
    supportsConfidence: true,
    reshuffleEveryIteration: false,
    waveformExtraTracks: 2,
    submitType: 'abx',
    shareEncoding: 'abx',
  },
  triangle: {
    testComponent: TriangleTest,
    statsComponent: TriangleStats,
    computeStats: computeTriangleStats,
    resultDataKey: 'userSelectionsAndCorrects',
    supportsConfidence: true,
    reshuffleEveryIteration: false,
    waveformExtraTracks: 1,
    submitType: 'abx',
    shareEncoding: 'triangle',
  },
  '2afc-sd': {
    testComponent: SameDiffTest,
    statsComponent: SameDiffStats,
    computeStats: computeSameDiffStats,
    resultDataKey: 'userSelectionsAndCorrects',
    supportsConfidence: true,
    reshuffleEveryIteration: false,
    waveformExtraTracks: 0,
    submitType: 'samediff',
    shareEncoding: '2afc-sd',
  },
};

/**
 * Look up a test type entry.
 * @param {string} testType - Raw type string from config
 * @returns {{ entry: object, hasConfidence: boolean, baseType: string }}
 * @throws {Error} If type is unknown or +C is unsupported
 */
export function getTestType(testType) {
  const { baseType, hasConfidence } = parseTestType(testType);
  const entry = TEST_TYPES[baseType];
  if (!entry) {
    throw new Error(`Unknown test type: "${testType}"`);
  }
  if (hasConfidence && !entry.supportsConfidence) {
    throw new Error(`Test type "${baseType}" does not support +C confidence variant`);
  }
  return { entry, hasConfidence, baseType };
}

/**
 * All valid type strings (for config validation).
 * Derived from registry keys + supportsConfidence flag.
 */
export const VALID_TEST_TYPES = Object.keys(TEST_TYPES).flatMap((base) => {
  const entry = TEST_TYPES[base];
  return entry.supportsConfidence ? [base, `${base}+c`] : [base];
});
