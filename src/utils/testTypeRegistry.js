/**
 * Test type registry — central lookup for all test type behavior.
 *
 * Each base type (ab, abx, triangle, etc.) maps to a descriptor containing:
 * - Plugin functions: setup, processSubmit, isComplete, mergeResults
 * - UI references: testComponent, statsComponent
 * - Stats: computeStats
 * - Behavioral flags: supportsConfidence, waveformExtraTracks, etc.
 *
 * The +C confidence suffix is handled by parseTestType(), not as
 * separate registry entries.
 *
 * See docs/test-type-architecture.md for the full plugin contract.
 */

import ABTest from '../components/ABTest';
import ABXTest from '../components/ABXTest';
import TriangleTest from '../components/TriangleTest';
import SameDiffTest from '../components/SameDiffTest';
import StaircaseTest from '../components/StaircaseTest';
import ABStats from '../components/ABStats';
import ABXStats from '../components/ABXStats';
import TriangleStats from '../components/TriangleStats';
import SameDiffStats from '../components/SameDiffStats';
import StaircaseStats from '../components/StaircaseStats';
import {
  computeAbStats, computeAbxStats, computeTriangleStats, computeSameDiffStats,
  computeStaircaseStats,
} from '../stats/statistics';

import * as abType from '../testTypes/ab';
import * as abxType from '../testTypes/abx';
import * as triangleType from '../testTypes/triangle';
import * as sameDiffType from '../testTypes/sameDiff';
import * as staircaseType from '../testTypes/staircase';

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
    setup: abType.setup,
    processSubmit: abType.processSubmit,
    isComplete: abType.isComplete,
    mergeResults: abType.mergeResults,
    testComponent: ABTest,
    statsComponent: ABStats,
    computeStats: computeAbStats,
    resultDataKey: 'userSelections',
    supportsConfidence: false,
    waveformExtraTracks: 0,
    shareEncoding: 'ab',
    isAdaptive: false,
  },
  abx: {
    setup: abxType.setup,
    processSubmit: abxType.processSubmit,
    isComplete: abxType.isComplete,
    mergeResults: abxType.mergeResults,
    testComponent: ABXTest,
    statsComponent: ABXStats,
    computeStats: computeAbxStats,
    resultDataKey: 'userSelectionsAndCorrects',
    supportsConfidence: true,
    waveformExtraTracks: 1,
    shareEncoding: 'abx',
    isAdaptive: false,
  },
  abxy: {
    setup: abxType.setup,
    processSubmit: abxType.processSubmit,
    isComplete: abxType.isComplete,
    mergeResults: abxType.mergeResults,
    testComponent: ABXTest,
    statsComponent: ABXStats,
    computeStats: computeAbxStats,
    resultDataKey: 'userSelectionsAndCorrects',
    supportsConfidence: true,
    waveformExtraTracks: 2,
    shareEncoding: 'abx',
    isAdaptive: false,
  },
  triangle: {
    setup: triangleType.setup,
    processSubmit: triangleType.processSubmit,
    isComplete: triangleType.isComplete,
    mergeResults: triangleType.mergeResults,
    testComponent: TriangleTest,
    statsComponent: TriangleStats,
    computeStats: computeTriangleStats,
    resultDataKey: 'userSelectionsAndCorrects',
    supportsConfidence: true,
    waveformExtraTracks: 1,
    shareEncoding: 'triangle',
    isAdaptive: false,
  },
  '2afc-sd': {
    setup: sameDiffType.setup,
    processSubmit: sameDiffType.processSubmit,
    isComplete: sameDiffType.isComplete,
    mergeResults: sameDiffType.mergeResults,
    testComponent: SameDiffTest,
    statsComponent: SameDiffStats,
    computeStats: computeSameDiffStats,
    resultDataKey: 'userSelectionsAndCorrects',
    supportsConfidence: true,
    waveformExtraTracks: 0,
    shareEncoding: '2afc-sd',
    isAdaptive: false,
  },
  '2afc-staircase': {
    setup: staircaseType.setup,
    processSubmit: staircaseType.processSubmit,
    isComplete: staircaseType.isComplete,
    mergeResults: staircaseType.mergeResults,
    testComponent: StaircaseTest,
    statsComponent: StaircaseStats,
    computeStats: computeStaircaseStats,
    resultDataKey: 'staircaseData',
    supportsConfidence: false,
    waveformExtraTracks: 0,
    shareEncoding: '2afc-staircase',
    isAdaptive: true,
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
