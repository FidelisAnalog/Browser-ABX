/**
 * Share URL encoding/decoding.
 * Encodes test results into compact, obfuscated URL parameters
 * for sharing results without a server.
 */

import { bytesToBase64, base64ToBytes } from './base64';
import { multinomialPMF, binomialPValue } from '../stats/statistics';

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

  for (const stats of allTestStats) {
    bytes.push(testNameToOrd[stats.name] || 0);

    if (stats.matrix) {
      // ABX: encode full confusion matrix
      for (const correctName of stats.optionNames) {
        bytes.push(optionNameToOrd[correctName] || 0);
        for (const selectedName of stats.optionNames) {
          bytes.push(optionNameToOrd[selectedName] || 0);
          bytes.push(stats.matrix[correctName]?.[selectedName] ?? 0);
        }
      }
    } else {
      // AB: encode count per option
      for (const opt of stats.options) {
        bytes.push(optionNameToOrd[opt.name] || 0);
        bytes.push(opt.count);
      }
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
  const testTypes = {};
  config.tests.forEach((t) => (testTypes[t.name] = t.testType));

  const optionNames = config.options.map((o) => o.name);

  const stats = [];
  let i = 1;

  while (i < bytes.length) {
    const testOrd = bytes[i++];
    const testName = testNames[testOrd] || `Test ${testOrd}`;
    const testType = testTypes[testName];

    if (testType && (testType.toLowerCase() === 'abx' || testType.toLowerCase() === 'abx+c')) {
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
      stats.push({
        name: testName,
        optionNames: testOptionNames,
        matrix,
        totalCorrect,
        totalIncorrect,
        total,
        pValue: total > 0 ? binomialPValue(totalCorrect, total, 1 / nOptions) : 1,
      });
    } else {
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
      const pValue = total > 0 ? multinomialPMF(countArray, 1 / options.length) : 1;

      stats.push({ name: testName, options, total, pValue });
    }
  }

  return stats;
}
