/**
 * Share URL encoding/decoding.
 * Encodes test results into compact, obfuscated URL parameters
 * for sharing results without a server.
 */

import { bytesToBase64, base64ToBytes } from './base64';
import { chiSquaredPValue, binomialPValue, zScore } from '../stats/statistics';
import { getTestType } from './testTypeRegistry';

/**
 * Seeded PRNG (Mulberry32) for reproducible obfuscation.
 * @param {number} seed
 * @returns {() => number} Returns values in [0, 1)
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create an obfuscation mask.
 * @param {number} seed
 * @param {number} len
 * @param {number} maxInt
 * @returns {number[]}
 */
function createMask(seed, len, maxInt) {
  const rng = mulberry32(seed);
  const mask = [];
  for (let i = 0; i < len; i++) {
    mask.push(Math.floor(rng() * maxInt));
  }
  return mask;
}

/**
 * Decode 6 confidence breakdown bytes into breakdown array.
 * @param {number[]} bytes
 * @param {number} offset - Start index in bytes array
 * @returns {object[]|null} Confidence breakdown or null if all zeros
 */
function decodeConfidenceBreakdown(bytes, offset) {
  const levels = [
    { level: 'sure', correct: bytes[offset], total: bytes[offset + 1] },
    { level: 'somewhat', correct: bytes[offset + 2], total: bytes[offset + 3] },
    { level: 'guessing', correct: bytes[offset + 4], total: bytes[offset + 5] },
  ];
  const rows = levels.filter((r) => r.total > 0);
  return rows.length > 0 ? rows : null;
}

/**
 * Create a share URL encoding all test results.
 * @param {object[]} allTestStats - Array of AB/ABX stats
 * @param {object} config - Full config
 * @returns {string} Share URL
 */
export function createShareUrl(allTestStats, config) {
  const encoded = encodeTestResults(allTestStats, config);
  const url = new URL(window.location.href);
  url.searchParams.set('results', encoded);
  return url.toString();
}

/**
 * Encode test results into compact string.
 * @param {object[]} allTestStats
 * @param {object} config
 * @returns {string}
 */
export function encodeTestResults(allTestStats, config) {
  // Build ordinal maps
  const testNameToOrd = {};
  config.tests.forEach((t, i) => (testNameToOrd[t.name] = i));

  const optionNameToOrd = {};
  config.options.forEach((o, i) => (optionNameToOrd[o.name] = i));

  // Build byte array
  const bytes = [];
  const seed = Math.floor(Math.random() * 256);
  bytes.push(seed);

  // Build test type lookup by name
  const testTypeByName = {};
  config.tests.forEach((t) => (testTypeByName[t.name] = t.testType));

  for (const stats of allTestStats) {
    bytes.push(testNameToOrd[stats.name] || 0);

    const { entry, hasConfidence } = getTestType(testTypeByName[stats.name]);

    if (entry.shareEncoding === 'abx') {
      // ABX: encode full confusion matrix
      for (const correctName of stats.optionNames) {
        bytes.push(optionNameToOrd[correctName] || 0);
        for (const selectedName of stats.optionNames) {
          bytes.push(optionNameToOrd[selectedName] || 0);
          bytes.push(stats.matrix[correctName]?.[selectedName] ?? 0);
        }
      }
    } else if (entry.shareEncoding === 'triangle') {
      // Triangle: encode correct/incorrect counts
      bytes.push(stats.totalCorrect);
      bytes.push(stats.totalIncorrect);
    } else if (entry.shareEncoding === '2afc-sd') {
      // 2AFC-SD: encode signal detection counts
      bytes.push(stats.hits);
      bytes.push(stats.misses);
      bytes.push(stats.falseAlarms);
      bytes.push(stats.correctRejections);
    } else if (entry.shareEncoding === '2afc-staircase') {
      // Staircase: reversal levels + totals + floor/ceiling + trial-by-trial data
      const reversals = stats.reversalsUsed || [];
      bytes.push(reversals.length);
      for (const level of reversals) {
        bytes.push(level);
      }
      bytes.push(stats.totalTrials);
      bytes.push(stats.totalCorrect);
      // Floor/ceiling flag: 0=normal, 1=floor, 2=ceiling
      bytes.push(stats.floorCeiling === 'floor' ? 1 : stats.floorCeiling === 'ceiling' ? 2 : 0);
      // Trial data: 1 byte per trial — high bit = isCorrect, lower 7 bits = level
      const trials = stats.trials || [];
      bytes.push(trials.length);
      for (const trial of trials) {
        bytes.push((trial.isCorrect ? 0x80 : 0) | (trial.level & 0x7F));
      }
    } else if (entry.shareEncoding === 'ab') {
      // AB: encode count per option
      for (const opt of stats.options) {
        bytes.push(optionNameToOrd[opt.name] || 0);
        bytes.push(opt.count);
      }
    }

    // +C variants: encode confidence breakdown (6 bytes)
    if (hasConfidence) {
      const bd = stats.confidenceBreakdown || [];
      const byLevel = {};
      for (const row of bd) byLevel[row.level] = row;
      bytes.push(byLevel.sure?.correct ?? 0);
      bytes.push(byLevel.sure?.total ?? 0);
      bytes.push(byLevel.somewhat?.correct ?? 0);
      bytes.push(byLevel.somewhat?.total ?? 0);
      bytes.push(byLevel.guessing?.correct ?? 0);
      bytes.push(byLevel.guessing?.total ?? 0);
    }
  }

  // Apply obfuscation mask (skip seed byte)
  const mask = createMask(seed, bytes.length - 1, 128);
  for (let i = 1; i < bytes.length; i++) {
    bytes[i] = (bytes[i] + mask[i - 1]) & 0xff;
  }

  return bytesToBase64(new Uint8Array(bytes));
}

/**
 * Decode test results from share URL parameter.
 * @param {string} dataStr - Encoded results string
 * @param {object} config - Full config
 * @returns {object[]} Decoded stats
 */
export function decodeTestResults(dataStr, config) {
  const decoded = base64ToBytes(dataStr);
  const bytes = Array.from(decoded);

  if (bytes.length === 0) return [];

  // Remove obfuscation
  const seed = bytes[0];
  const mask = createMask(seed, bytes.length - 1, 128);
  for (let i = 1; i < bytes.length; i++) {
    bytes[i] = (bytes[i] - mask[i - 1] + 256) & 0xff;
  }

  // Build reverse maps
  const testNames = config.tests.map((t) => t.name);
  const testTypeByName = {};
  config.tests.forEach((t) => (testTypeByName[t.name] = t.testType));

  const optionNames = config.options.map((o) => o.name);

  const stats = [];
  let i = 1;

  while (i < bytes.length) {
    const testOrd = bytes[i++];
    const testName = testNames[testOrd] || `Test ${testOrd}`;
    const testType = testTypeByName[testName];
    const { entry: typeEntry, hasConfidence, baseType } = getTestType(testType);

    if (typeEntry.shareEncoding === 'abx') {
      // ABX: decode full confusion matrix
      const test = config.tests[testOrd];
      const nOptions = test ? test.options.length : 0;
      const testOptionNames = [];
      const matrix = {};
      let totalCorrect = 0;
      let totalIncorrect = 0;

      for (let row = 0; row < nOptions; row++) {
        const correctName = optionNames[bytes[i++]];
        testOptionNames.push(correctName);
        matrix[correctName] = {};
        for (let col = 0; col < nOptions; col++) {
          const selectedName = optionNames[bytes[i++]];
          const count = bytes[i++];
          matrix[correctName][selectedName] = count;
          if (correctName === selectedName) {
            totalCorrect += count;
          } else {
            totalIncorrect += count;
          }
        }
      }

      const total = totalCorrect + totalIncorrect;
      const decoded = {
        name: testName,
        _baseType: baseType,
        optionNames: testOptionNames,
        matrix,
        totalCorrect,
        totalIncorrect,
        total,
        pValue: total > 0 ? binomialPValue(totalCorrect, total, 1 / nOptions) : 1,
      };

      if (hasConfidence) {
        decoded.confidenceBreakdown = decodeConfidenceBreakdown(bytes, i);
        i += 6;
      }

      stats.push(decoded);
    } else if (typeEntry.shareEncoding === 'triangle') {
      // Triangle: decode correct/incorrect counts
      const test = config.tests[testOrd];
      const testOptionNames = test ? test.options.map((o) => o.name) : [];
      const totalCorrect = bytes[i++];
      const totalIncorrect = bytes[i++];
      const total = totalCorrect + totalIncorrect;

      const decoded = {
        name: testName,
        _baseType: baseType,
        optionNames: testOptionNames,
        totalCorrect,
        totalIncorrect,
        total,
        pValue: total > 0 ? binomialPValue(totalCorrect, total, 1 / 3) : 1,
      };

      if (hasConfidence) {
        decoded.confidenceBreakdown = decodeConfidenceBreakdown(bytes, i);
        i += 6;
      }

      stats.push(decoded);
    } else if (typeEntry.shareEncoding === '2afc-sd') {
      // 2AFC-SD: decode signal detection counts and recompute stats
      const test = config.tests[testOrd];
      const testOptionNames = test ? test.options.map((o) => o.name) : [];
      const hits = bytes[i++];
      const misses = bytes[i++];
      const falseAlarms = bytes[i++];
      const correctRejections = bytes[i++];

      // Recompute signal detection measures with Hautus log-linear correction
      const nDiff = hits + misses;
      const nSame = falseAlarms + correctRejections;
      const hitRate = (hits + 0.5) / (nDiff + 1);
      const falseAlarmRate = (falseAlarms + 0.5) / (nSame + 1);
      const dPrime = zScore(hitRate) - zScore(falseAlarmRate);
      const criterionC = -0.5 * (zScore(hitRate) + zScore(falseAlarmRate));

      const totalCorrect = hits + correctRejections;
      const totalIncorrect = misses + falseAlarms;
      const total = totalCorrect + totalIncorrect;

      const decoded = {
        name: testName,
        _baseType: baseType,
        optionNames: testOptionNames,
        hits,
        misses,
        falseAlarms,
        correctRejections,
        hitRate,
        falseAlarmRate,
        dPrime,
        criterionC,
        totalCorrect,
        totalIncorrect,
        total,
        pValue: total > 0 ? binomialPValue(totalCorrect, total, 0.5) : 1,
      };

      if (hasConfidence) {
        decoded.confidenceBreakdown = decodeConfidenceBreakdown(bytes, i);
        i += 6;
      }

      stats.push(decoded);
    } else if (typeEntry.shareEncoding === '2afc-staircase') {
      // Staircase: decode reversal levels + totals + floor/ceiling + trial data
      const test = config.tests[testOrd];
      const testOptionNames = test ? test.options.map((o) => o.name) : [];
      const nReversals = bytes[i++];
      const reversalsUsed = [];
      for (let j = 0; j < nReversals; j++) {
        reversalsUsed.push(bytes[i++]);
      }
      const totalTrials = bytes[i++];
      const totalCorrect = bytes[i++];
      const fcFlag = bytes[i++];
      const floorCeiling = fcFlag === 1 ? 'floor' : fcFlag === 2 ? 'ceiling' : null;

      // Decode trial-by-trial data: 1 byte per trial, high bit = isCorrect, lower 7 = level
      const nTrials = bytes[i++];
      const trials = [];
      for (let j = 0; j < nTrials; j++) {
        const packed = bytes[i++];
        trials.push({ level: packed & 0x7F, isCorrect: !!(packed & 0x80) });
      }

      // Compute JND from reversal values
      const jnd = reversalsUsed.length > 0
        ? reversalsUsed.reduce((a, b) => a + b, 0) / reversalsUsed.length
        : 0;
      const jndVariance = reversalsUsed.length > 1
        ? reversalsUsed.reduce((sum, v) => sum + (v - jnd) ** 2, 0) / (reversalsUsed.length - 1)
        : 0;
      const jndSD = Math.sqrt(jndVariance);
      const jndLevel = Math.round(jnd);
      const jndOptionName = (jndLevel >= 1 && jndLevel < testOptionNames.length)
        ? testOptionNames[jndLevel]
        : `Level ${jndLevel}`;

      stats.push({
        name: testName,
        _baseType: baseType,
        optionNames: testOptionNames,
        jnd,
        jndSD,
        jndLevel,
        jndOptionName,
        reversalsUsed,
        totalTrials,
        totalCorrect,
        totalIncorrect: totalTrials - totalCorrect,
        reversalCount: nReversals,
        floorCeiling,
        interleaved: false,
        trials,
      });
    } else if (typeEntry.shareEncoding === 'ab') {
      // AB: decode option counts
      const test = config.tests[testOrd];
      const nOptions = test ? test.options.length : 0;
      const options = [];
      for (let j = 0; j < nOptions; j++) {
        const optOrd = bytes[i++];
        const count = bytes[i++];
        options.push({
          name: optionNames[optOrd] || `Option ${optOrd}`,
          count,
        });
      }

      const total = options.reduce((a, o) => a + o.count, 0);
      options.forEach((o) => {
        o.percentage = total > 0 ? ((o.count / total) * 100).toFixed(1) : '0.0';
      });
      options.sort((a, b) => b.count - a.count);

      const countArray = options.map((o) => o.count);
      // Chi-squared goodness-of-fit test against uniform distribution
      const expected = total / options.length;
      const chiSq = expected > 0 ? countArray.reduce((sum, obs) => sum + ((obs - expected) ** 2) / expected, 0) : 0;
      const pValue = total > 0 ? chiSquaredPValue(chiSq, options.length - 1) : 1;

      stats.push({ name: testName, _baseType: baseType, options, total, pValue });
    }
  }

  return stats;
}
