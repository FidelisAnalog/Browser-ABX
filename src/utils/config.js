/**
 * YAML configuration parser — loads and normalizes test configuration.
 * Backwards compatible with existing jaakkopasanen/ABX YAML configs.
 */

import yaml from 'js-yaml';
import { VALID_TEST_TYPES, parseTestType } from './testTypeRegistry';
import { STAIRCASE_DEFAULTS } from '../stats/staircase';

/**
 * Convert Dropbox share links to direct download links.
 * @param {string} urlStr
 * @returns {string}
 */
function rawLink(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.hostname === 'www.dropbox.com' || url.hostname === 'dropbox.com') {
      url.hostname = 'dl.dropboxusercontent.com';
      url.searchParams.set('dl', '1');
      return url.toString();
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

/**
 * Fetch and parse a YAML config file.
 * @param {string} configUrl - URL to YAML config file
 * @returns {Promise<object>} Parsed and normalized config
 */
export async function parseConfig(configUrl) {
  const url = rawLink(configUrl);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${configUrl} (${response.status})`);
  }
  const text = await response.text();
  const raw = yaml.load(text);

  return normalizeConfig(raw);
}

/** Valid staircase rules */
const VALID_RULES = ['1u1d', '1u2d', '1u3d'];

/**
 * Parse and validate staircase-specific config fields.
 * @param {object} test - Raw test object from YAML
 * @param {number} nOptions - Number of options for this test
 * @returns {object} Validated staircase config
 */
function normalizeStaircaseConfig(test, nOptions) {
  const sc = test.staircase || {};

  const rule = (sc.rule || STAIRCASE_DEFAULTS.rule).toLowerCase();
  if (!VALID_RULES.includes(rule)) {
    throw new Error(
      `Test "${test.name}" has invalid staircase rule "${rule}". Valid rules: ${VALID_RULES.join(', ')}`
    );
  }

  const reversals = sc.reversals ?? STAIRCASE_DEFAULTS.reversals;
  if (reversals < 3 || reversals > 12) {
    throw new Error(
      `Test "${test.name}" has staircase reversals: ${reversals}. Must be 3-12.`
    );
  }

  const maxTrials = sc.maxTrials ?? STAIRCASE_DEFAULTS.maxTrials;
  if (maxTrials < 15 || maxTrials > 50) {
    throw new Error(
      `Test "${test.name}" has staircase maxTrials: ${maxTrials}. Must be 15-50.`
    );
  }

  const initialStep = sc.initialStep ?? STAIRCASE_DEFAULTS.initialStep;
  if (initialStep < 1 || initialStep >= nOptions) {
    throw new Error(
      `Test "${test.name}" has staircase initialStep: ${initialStep}. Must be 1-${nOptions - 1}.`
    );
  }

  const finalStep = sc.finalStep ?? STAIRCASE_DEFAULTS.finalStep;
  if (finalStep < 1 || finalStep > initialStep) {
    throw new Error(
      `Test "${test.name}" has staircase finalStep: ${finalStep}. Must be 1-${initialStep}.`
    );
  }

  const stepReductionAfter = sc.stepReductionAfter ?? STAIRCASE_DEFAULTS.stepReductionAfter;
  if (stepReductionAfter < 1 || stepReductionAfter >= reversals) {
    throw new Error(
      `Test "${test.name}" has staircase stepReductionAfter: ${stepReductionAfter}. Must be 1-${reversals - 1}.`
    );
  }

  const startLevel = sc.startLevel ?? STAIRCASE_DEFAULTS.startLevel;
  if (startLevel != null && (startLevel < 1 || startLevel > nOptions - 1)) {
    throw new Error(
      `Test "${test.name}" has staircase startLevel: ${startLevel}. Must be 1-${nOptions - 1}.`
    );
  }

  const interleave = sc.interleave ?? STAIRCASE_DEFAULTS.interleave;

  return {
    rule,
    reversals,
    maxTrials,
    initialStep,
    finalStep,
    stepReductionAfter,
    startLevel,
    interleave,
    nLevels: nOptions - 1, // Exclude reference (options[0]) from staircase levels
  };
}

/**
 * Normalize raw YAML config into standard structure.
 * @param {object} raw - Raw parsed YAML
 * @returns {object} Normalized config
 */
function normalizeConfig(raw) {
  if (!raw.name) throw new Error('Config must have a "name" field');
  if (!raw.options || raw.options.length === 0) throw new Error('Config must have "options"');
  if (!raw.tests || raw.tests.length === 0) throw new Error('Config must have "tests"');

  // Normalize options
  const optionMap = {};
  const options = raw.options.map((opt) => {
    const normalized = {
      name: opt.name,
      audioUrl: rawLink(opt.audioUrl),
      tag: opt.tag || null,
    };
    if (optionMap[opt.name]) {
      throw new Error(
        `Duplicate option name "${opt.name}". Option names must be unique. ` +
        '(Hint: if your names contain "#", wrap them in quotes in the YAML.)'
      );
    }
    optionMap[opt.name] = normalized;
    return normalized;
  });

  // Normalize tests
  const tests = raw.tests.map((test) => {
    if (!test.testType) throw new Error(`Test "${test.name}" must have a "testType" (${VALID_TEST_TYPES.join(', ')})`);
    if (!VALID_TEST_TYPES.includes(test.testType.toLowerCase())) {
      throw new Error(`Test "${test.name}" has unsupported testType "${test.testType}". Valid types: ${VALID_TEST_TYPES.join(', ')}`);
    }
    if (!test.options || test.options.length === 0) {
      throw new Error(`Test "${test.name}" must have "options"`);
    }

    const { baseType } = parseTestType(test.testType);

    // ABXY requires exactly 2 options
    if (baseType === 'abxy' && test.options.length !== 2) {
      throw new Error(
        `ABXY tests require exactly 2 options, but test "${test.name}" has ${test.options.length}`
      );
    }

    // 2AFC-Staircase requires at least 5 options
    if (baseType === '2afc-staircase' && test.options.length < 5) {
      throw new Error(
        `2AFC-Staircase tests require at least 5 options (quality levels), but test "${test.name}" has ${test.options.length}`
      );
    }

    // Resolve option names to option objects
    const testOptions = test.options.map((optName) => {
      const opt = optionMap[optName];
      if (!opt) throw new Error(`Test "${test.name}" references unknown option "${optName}"`);
      return { ...opt };
    });

    // Staircase tests don't use repeat — they use maxTrials from staircase config
    const isStaircase = baseType === '2afc-staircase';

    const repeat = isStaircase ? null : (test.repeat || 10);
    if (!isStaircase && repeat > 50) {
      throw new Error(
        `Test "${test.name}" has repeat: ${repeat}. Maximum is 50.`
      );
    }

    const normalized = {
      name: test.name,
      testType: test.testType,
      description: test.description || null,
      options: testOptions,
      repeat,
      crossfade: test.crossfade ?? false,
      crossfadeDuration: test.crossfadeDuration ?? null,
      showProgress: test.showProgress ?? false,
      balanced: test.balanced ?? true,
    };

    // Attach staircase config if applicable
    if (isStaircase) {
      normalized.staircase = normalizeStaircaseConfig(test, testOptions.length);
    }

    return normalized;
  });

  return {
    name: raw.name,
    welcome: raw.welcome || { description: '' },
    results: raw.results || null,
    options,
    tests,
    email: raw.email || null,
  };
}
