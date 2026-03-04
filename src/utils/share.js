/**
 * Share URL encoding/decoding.
 *
 * Self-contained binary format: a single ?share= param encodes both the
 * config structure and test results. No external config file needed.
 *
 * Layout: [seed][version][config section][results section]
 * - Seed (1 byte): PRNG seed for obfuscation mask
 * - Version (1 byte): format version
 * - Config: name, options (name+tag), tests (name+type+option refs), config URL
 * - Results: per-test stats (existing binary format)
 * - Obfuscation mask applied to all bytes after seed
 */

import { bytesToBase64, base64ToBytes } from './base64';
import { chiSquaredPValue, binomialPValue, zScore } from '../stats/statistics';
import { VALID_TEST_TYPES, getTestType } from './testTypeRegistry';

// ── PRNG & obfuscation ─────────────────────────────────────────────

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createMask(seed, len, maxInt) {
  const rng = mulberry32(seed);
  const mask = [];
  for (let i = 0; i < len; i++) {
    mask.push(Math.floor(rng() * maxInt));
  }
  return mask;
}

// ── Format version ──────────────────────────────────────────────────

const SHARE_VERSION = 2;

// ── Test type enum (derived from registry) ──────────────────────────

const TYPE_TO_ENUM = {};
const ENUM_TO_TYPE = {};
VALID_TEST_TYPES.forEach((t, i) => {
  TYPE_TO_ENUM[t] = i;
  ENUM_TO_TYPE[i] = t;
});

// ── String encoding helpers ─────────────────────────────────────────

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

/** Write a 1-byte-length-prefixed UTF-8 string. Empty/null → length 0. */
function encodeString(bytes, str) {
  if (!str) { bytes.push(0); return; }
  const encoded = utf8Encoder.encode(str);
  bytes.push(encoded.length);
  for (const b of encoded) bytes.push(b);
}

/** Read a 1-byte-length-prefixed UTF-8 string. Returns { value, bytesRead }. */
function decodeString(bytes, offset) {
  const len = bytes[offset];
  if (len === 0) return { value: '', bytesRead: 1 };
  const strBytes = bytes.slice(offset + 1, offset + 1 + len);
  return { value: utf8Decoder.decode(new Uint8Array(strBytes)), bytesRead: 1 + len };
}

/** Write a 2-byte-length-prefixed UTF-8 string (for URLs). Null/empty → length 0. */
function encodeLongString(bytes, str) {
  if (!str) { bytes.push(0, 0); return; }
  const encoded = utf8Encoder.encode(str);
  bytes.push((encoded.length >> 8) & 0xff);
  bytes.push(encoded.length & 0xff);
  for (const b of encoded) bytes.push(b);
}

/** Read a 2-byte-length-prefixed UTF-8 string. Returns { value, bytesRead }. */
function decodeLongString(bytes, offset) {
  const len = (bytes[offset] << 8) | bytes[offset + 1];
  if (len === 0) return { value: null, bytesRead: 2 };
  const strBytes = bytes.slice(offset + 2, offset + 2 + len);
  return { value: utf8Decoder.decode(new Uint8Array(strBytes)), bytesRead: 2 + len };
}

// ── Timing helpers ──────────────────────────────────────────────────

function encodeTiming(timing, bytes) {
  if (!timing) {
    for (let j = 0; j < 6; j++) bytes.push(0);
    return;
  }
  for (const val of [timing.median, timing.fastest, timing.slowest]) {
    const tenths = Math.round(val * 10);
    const clamped = Math.min(65535, Math.max(0, tenths));
    bytes.push((clamped >> 8) & 0xff);
    bytes.push(clamped & 0xff);
  }
}

function decodeTiming(bytes, offset) {
  const median = ((bytes[offset] << 8) | bytes[offset + 1]) / 10;
  const fastest = ((bytes[offset + 2] << 8) | bytes[offset + 3]) / 10;
  const slowest = ((bytes[offset + 4] << 8) | bytes[offset + 5]) / 10;
  if (median === 0 && fastest === 0 && slowest === 0) return null;
  return { median, fastest, slowest };
}

function decodeConfidenceBreakdown(bytes, offset) {
  const levels = [
    { level: 'sure', correct: bytes[offset], total: bytes[offset + 1] },
    { level: 'somewhat', correct: bytes[offset + 2], total: bytes[offset + 3] },
    { level: 'guessing', correct: bytes[offset + 4], total: bytes[offset + 5] },
  ];
  const rows = levels.filter((r) => r.total > 0);
  return rows.length > 0 ? rows : null;
}

// ── Config encoding ─────────────────────────────────────────────────

function encodeConfig(bytes, config, configUrl) {
  encodeString(bytes, config.name);

  // Options
  const optionNameToOrd = {};
  config.options.forEach((o, i) => (optionNameToOrd[o.name] = i));
  bytes.push(config.options.length);
  for (const opt of config.options) {
    encodeString(bytes, opt.name);
    encodeString(bytes, opt.tag || '');
  }

  // Tests
  bytes.push(config.tests.length);
  for (const test of config.tests) {
    encodeString(bytes, test.name);
    const typeEnum = TYPE_TO_ENUM[test.testType.toLowerCase()];
    if (typeEnum === undefined) throw new Error(`Unknown test type for share encoding: ${test.testType}`);
    bytes.push(typeEnum);
    bytes.push(test.options.length);
    for (const opt of test.options) {
      bytes.push(optionNameToOrd[opt.name] ?? 0);
    }
  }

  // Config URL (2-byte length, 0 = none)
  encodeLongString(bytes, configUrl || '');
}

function decodeConfig(bytes, offset) {
  let i = offset;

  const name = decodeString(bytes, i);
  i += name.bytesRead;

  // Options
  const nOptions = bytes[i++];
  const options = [];
  for (let j = 0; j < nOptions; j++) {
    const optName = decodeString(bytes, i);
    i += optName.bytesRead;
    const optTag = decodeString(bytes, i);
    i += optTag.bytesRead;
    const opt = { name: optName.value };
    if (optTag.value) opt.tag = optTag.value;
    options.push(opt);
  }

  // Tests
  const nTests = bytes[i++];
  const tests = [];
  for (let j = 0; j < nTests; j++) {
    const testName = decodeString(bytes, i);
    i += testName.bytesRead;
    const typeEnum = bytes[i++];
    const testType = ENUM_TO_TYPE[typeEnum];
    if (!testType) throw new Error(`Unknown test type enum: ${typeEnum}`);
    const nTestOpts = bytes[i++];
    const testOpts = [];
    for (let k = 0; k < nTestOpts; k++) {
      testOpts.push({ name: options[bytes[i++]].name });
    }
    tests.push({ name: testName.value, testType, options: testOpts });
  }

  // Config URL
  const configUrl = decodeLongString(bytes, i);
  i += configUrl.bytesRead;

  return {
    config: { name: name.value, options, tests },
    configUrl: configUrl.value,
    bytesRead: i - offset,
  };
}

// ── Results encoding ────────────────────────────────────────────────

function encodeResults(bytes, allTestStats, config) {
  const testNameToOrd = {};
  config.tests.forEach((t, i) => (testNameToOrd[t.name] = i));

  const optionNameToOrd = {};
  config.options.forEach((o, i) => (optionNameToOrd[o.name] = i));

  const testTypeByName = {};
  config.tests.forEach((t) => (testTypeByName[t.name] = t.testType));

  for (const stats of allTestStats) {
    bytes.push(testNameToOrd[stats.name] || 0);

    const { entry, hasConfidence } = getTestType(testTypeByName[stats.name]);

    if (entry.shareEncoding === 'abx') {
      for (const correctName of stats.optionNames) {
        bytes.push(optionNameToOrd[correctName] || 0);
        for (const selectedName of stats.optionNames) {
          bytes.push(optionNameToOrd[selectedName] || 0);
          bytes.push(stats.matrix[correctName]?.[selectedName] ?? 0);
        }
      }
    } else if (entry.shareEncoding === 'triangle') {
      bytes.push(stats.totalCorrect);
      bytes.push(stats.totalIncorrect);
    } else if (entry.shareEncoding === '2afc-sd') {
      bytes.push(stats.hits);
      bytes.push(stats.misses);
      bytes.push(stats.falseAlarms);
      bytes.push(stats.correctRejections);
    } else if (entry.shareEncoding === '2afc-staircase') {
      const reversals = stats.reversalsUsed || [];
      bytes.push(reversals.length);
      for (const level of reversals) bytes.push(level);
      bytes.push(stats.totalTrials);
      bytes.push(stats.totalCorrect);
      bytes.push(stats.floorCeiling === 'floor' ? 1 : stats.floorCeiling === 'ceiling' ? 2 : 0);
      const trials = stats.trials || [];
      bytes.push(trials.length);
      for (const trial of trials) {
        bytes.push((trial.isCorrect ? 0x80 : 0) | (trial.level & 0x7F));
      }
    } else if (entry.shareEncoding === 'ab') {
      for (const opt of stats.options) {
        bytes.push(optionNameToOrd[opt.name] || 0);
        bytes.push(opt.count);
      }
    }

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

    encodeTiming(stats.timing || null, bytes);
  }
}

function decodeResults(bytes, offset, config) {
  const testNames = config.tests.map((t) => t.name);
  const testTypeByName = {};
  config.tests.forEach((t) => (testTypeByName[t.name] = t.testType));
  const optionNames = config.options.map((o) => o.name);

  const stats = [];
  let i = offset;

  while (i < bytes.length) {
    const testOrd = bytes[i++];
    const testName = testNames[testOrd] || `Test ${testOrd}`;
    const testType = testTypeByName[testName];
    const { entry: typeEntry, hasConfidence, baseType } = getTestType(testType);

    if (typeEntry.shareEncoding === 'abx') {
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
          if (correctName === selectedName) totalCorrect += count;
          else totalIncorrect += count;
        }
      }

      const total = totalCorrect + totalIncorrect;
      const decoded = {
        name: testName, _baseType: baseType, optionNames: testOptionNames,
        matrix, totalCorrect, totalIncorrect, total,
        pValue: total > 0 ? binomialPValue(totalCorrect, total, 1 / nOptions) : 1,
      };

      if (hasConfidence) { decoded.confidenceBreakdown = decodeConfidenceBreakdown(bytes, i); i += 6; }
      decoded.timing = decodeTiming(bytes, i); i += 6;
      stats.push(decoded);

    } else if (typeEntry.shareEncoding === 'triangle') {
      const test = config.tests[testOrd];
      const testOptionNames = test ? test.options.map((o) => o.name) : [];
      const totalCorrect = bytes[i++];
      const totalIncorrect = bytes[i++];
      const total = totalCorrect + totalIncorrect;

      const decoded = {
        name: testName, _baseType: baseType, optionNames: testOptionNames,
        totalCorrect, totalIncorrect, total,
        pValue: total > 0 ? binomialPValue(totalCorrect, total, 1 / 3) : 1,
      };

      if (hasConfidence) { decoded.confidenceBreakdown = decodeConfidenceBreakdown(bytes, i); i += 6; }
      decoded.timing = decodeTiming(bytes, i); i += 6;
      stats.push(decoded);

    } else if (typeEntry.shareEncoding === '2afc-sd') {
      const test = config.tests[testOrd];
      const testOptionNames = test ? test.options.map((o) => o.name) : [];
      const hits = bytes[i++];
      const misses = bytes[i++];
      const falseAlarms = bytes[i++];
      const correctRejections = bytes[i++];

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
        name: testName, _baseType: baseType, optionNames: testOptionNames,
        hits, misses, falseAlarms, correctRejections,
        hitRate, falseAlarmRate, dPrime, criterionC,
        totalCorrect, totalIncorrect, total,
        pValue: total > 0 ? binomialPValue(totalCorrect, total, 0.5) : 1,
      };

      if (hasConfidence) { decoded.confidenceBreakdown = decodeConfidenceBreakdown(bytes, i); i += 6; }
      decoded.timing = decodeTiming(bytes, i); i += 6;
      stats.push(decoded);

    } else if (typeEntry.shareEncoding === '2afc-staircase') {
      const test = config.tests[testOrd];
      const testOptionNames = test ? test.options.map((o) => o.name) : [];
      const nReversals = bytes[i++];
      const reversalsUsed = [];
      for (let j = 0; j < nReversals; j++) reversalsUsed.push(bytes[i++]);
      const totalTrials = bytes[i++];
      const totalCorrect = bytes[i++];
      const fcFlag = bytes[i++];
      const floorCeiling = fcFlag === 1 ? 'floor' : fcFlag === 2 ? 'ceiling' : null;

      const nTrials = bytes[i++];
      const trials = [];
      for (let j = 0; j < nTrials; j++) {
        const packed = bytes[i++];
        trials.push({ level: packed & 0x7F, isCorrect: !!(packed & 0x80) });
      }

      const jnd = reversalsUsed.length > 0
        ? reversalsUsed.reduce((a, b) => a + b, 0) / reversalsUsed.length : 0;
      const jndVariance = reversalsUsed.length > 1
        ? reversalsUsed.reduce((sum, v) => sum + (v - jnd) ** 2, 0) / (reversalsUsed.length - 1) : 0;
      const jndSD = Math.sqrt(jndVariance);
      const jndLevel = Math.round(jnd);
      const jndOptionName = (jndLevel >= 1 && jndLevel < testOptionNames.length)
        ? testOptionNames[jndLevel] : `Level ${jndLevel}`;

      const timing = decodeTiming(bytes, i); i += 6;

      stats.push({
        name: testName, _baseType: baseType, optionNames: testOptionNames,
        jnd, jndSD, jndLevel, jndOptionName, reversalsUsed,
        totalTrials, totalCorrect, totalIncorrect: totalTrials - totalCorrect,
        reversalCount: nReversals, floorCeiling, interleaved: false, trials, timing,
      });

    } else if (typeEntry.shareEncoding === 'ab') {
      const test = config.tests[testOrd];
      const nOptions = test ? test.options.length : 0;
      const options = [];
      for (let j = 0; j < nOptions; j++) {
        const optOrd = bytes[i++];
        const count = bytes[i++];
        options.push({ name: optionNames[optOrd] || `Option ${optOrd}`, count });
      }

      const total = options.reduce((a, o) => a + o.count, 0);
      options.forEach((o) => {
        o.percentage = total > 0 ? ((o.count / total) * 100).toFixed(1) : '0.0';
      });
      options.sort((a, b) => b.count - a.count);

      const expected = total / options.length;
      const chiSq = expected > 0
        ? options.reduce((sum, o) => sum + ((o.count - expected) ** 2) / expected, 0) : 0;
      const pValue = total > 0 ? chiSquaredPValue(chiSq, options.length - 1) : 1;

      const timing = decodeTiming(bytes, i); i += 6;
      stats.push({ name: testName, _baseType: baseType, options, total, pValue, timing });
    }
  }

  return stats;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Create a self-contained share URL.
 * @param {object[]} allTestStats - Computed stats for all tests
 * @param {object} config - Full normalized config
 * @param {string|null} [configUrl] - Original config URL (for "Take the Test" link)
 * @returns {string} Share URL with ?share= param
 */
export function createShareUrl(allTestStats, config, configUrl) {
  const bytes = [];
  const seed = Math.floor(Math.random() * 256);
  bytes.push(seed);
  bytes.push(SHARE_VERSION);

  encodeConfig(bytes, config, configUrl);
  encodeResults(bytes, allTestStats, config);

  // Obfuscation mask over everything after seed
  const mask = createMask(seed, bytes.length - 1, 128);
  for (let i = 1; i < bytes.length; i++) {
    bytes[i] = (bytes[i] + mask[i - 1]) & 0xff;
  }

  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('share', bytesToBase64(new Uint8Array(bytes)));
  return url.toString();
}

/**
 * Decode a self-contained share URL param.
 * @param {string} shareParam - The ?share= value
 * @returns {{ config: object, stats: object[], configUrl: string|null }}
 */
export function decodeShareParam(shareParam) {
  const raw = base64ToBytes(shareParam);
  const bytes = Array.from(raw);
  if (bytes.length === 0) throw new Error('Invalid share link');

  // Remove obfuscation
  const seed = bytes[0];
  const mask = createMask(seed, bytes.length - 1, 128);
  for (let i = 1; i < bytes.length; i++) {
    bytes[i] = (bytes[i] - mask[i - 1] + 256) & 0xff;
  }

  const version = bytes[1];
  if (version !== SHARE_VERSION) {
    throw new Error(
      `Unsupported share link version (${version}). This link may have been created with a different version of the app.`
    );
  }

  const { config, configUrl, bytesRead } = decodeConfig(bytes, 2);
  const stats = decodeResults(bytes, 2 + bytesRead, config);

  return { config, stats, configUrl };
}
