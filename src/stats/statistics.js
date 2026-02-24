/**
 * Statistical calculations for AB/ABX listening tests.
 *
 * Provides p-value computation, AB preference statistics,
 * ABX identification statistics, and tag-based aggregation.
 */

// --- Gamma function and CDF for chi-squared p-values ---

function logGamma(z) {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function gser(x, a) {
  const ITMAX = 100;
  const EPS = 3.0e-7;
  let sum = 1.0 / a;
  let del = sum;
  let ap = a;
  for (let n = 1; n <= ITMAX; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) {
      return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    }
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function gcf(x, a) {
  const ITMAX = 100;
  const EPS = 3.0e-7;
  const FPMIN = 1.0e-30;
  let b = x + 1 - a;
  let c = 1.0 / FPMIN;
  let d = 1.0 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2.0;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function gammaCdf(x, a) {
  if (x <= 0) return 0;
  if (x < a + 1) return gser(x, a);
  return 1 - gcf(x, a);
}

/**
 * Chi-squared p-value (two-tailed).
 * @param {number} x - Chi-squared statistic
 * @param {number} df - Degrees of freedom
 * @returns {number} p-value
 */
export function chiSquaredPValue(x, df) {
  return 1 - gammaCdf(x / 2, df / 2);
}

// --- Multinomial PMF ---

/**
 * Multinomial probability mass function.
 * Computes the exact probability of observing the given counts
 * under the given probability distribution.
 *
 * P(X₁=x₁, ..., Xₖ=xₖ) = n! / (x₁!...xₖ!) × p₁^x₁ × ... × pₖ^xₖ
 *
 * @param {number[]} counts - Observed counts per category
 * @param {number|number[]} probabilities - Probability per category (or single value for uniform)
 * @returns {number} PMF value
 */
export function multinomialPMF(counts, probabilities) {
  const n = counts.reduce((a, b) => a + b, 0);
  const k = counts.length;

  // Normalize probabilities
  const probs = typeof probabilities === 'number'
    ? Array(k).fill(probabilities)
    : probabilities;

  // Use log space to avoid overflow with large factorials
  let logP = logGamma(n + 1);
  for (let i = 0; i < k; i++) {
    logP -= logGamma(counts[i] + 1);
    if (probs[i] > 0 && counts[i] > 0) {
      logP += counts[i] * Math.log(probs[i]);
    } else if (probs[i] === 0 && counts[i] > 0) {
      return 0; // impossible outcome
    }
  }

  return Math.exp(logP);
}

/**
 * One-tailed binomial p-value: probability of getting `k` or more successes
 * out of `n` trials with success probability `p`, by chance.
 *
 * Used for ABX tests where we want: P(correct >= observed | guessing).
 *
 * @param {number} k - Number of successes (correct answers)
 * @param {number} n - Total number of trials
 * @param {number} p - Probability of success under null hypothesis (e.g., 0.5 for 2-option ABX)
 * @returns {number} p-value
 */
export function binomialPValue(k, n, p) {
  if (n === 0) return 1;
  if (k <= 0) return 1;

  // Sum P(X >= k) = sum from i=k to n of C(n,i) * p^i * (1-p)^(n-i)
  let pValue = 0;
  for (let i = k; i <= n; i++) {
    const logProb = logGamma(n + 1) - logGamma(i + 1) - logGamma(n - i + 1)
      + i * Math.log(p) + (n - i) * Math.log(1 - p);
    pValue += Math.exp(logProb);
  }

  return Math.min(1, pValue);
}

// --- AB Test Statistics ---

/**
 * Compute AB test statistics from user selections.
 * @param {string} name - Test name
 * @param {string[]} optionNames - Option names in original order
 * @param {object[]} userSelections - Array of selected option objects
 * @returns {object} AB stats
 */
export function computeAbStats(name, optionNames, userSelections) {
  const counts = {};
  for (const optName of optionNames) {
    counts[optName] = 0;
  }
  for (const selection of userSelections) {
    counts[selection.name] = (counts[selection.name] || 0) + 1;
  }

  const total = userSelections.length;
  const countArray = optionNames.map((n) => counts[n]);
  // Chi-squared goodness-of-fit test against uniform distribution
  const expected = total / optionNames.length;
  const chiSq = expected > 0 ? countArray.reduce((sum, obs) => sum + ((obs - expected) ** 2) / expected, 0) : 0;
  const pValue = total > 0 ? chiSquaredPValue(chiSq, optionNames.length - 1) : 1;

  const options = optionNames.map((n) => ({
    name: n,
    count: counts[n],
    percentage: total > 0 ? ((counts[n] / total) * 100).toFixed(1) : '0.0',
  }));

  // Sort by count descending
  options.sort((a, b) => b.count - a.count);

  return { name, options, total, pValue };
}

// --- ABX Test Statistics ---

/**
 * Compute ABX test statistics from user selections and correct answers.
 * @param {string} name - Test name
 * @param {string[]} optionNames - Option names (not including X)
 * @param {object[]} userSelectionsAndCorrects - Array of { selectedOption, correctOption }
 * @returns {object} ABX stats
 */
export function computeAbxStats(name, optionNames, userSelectionsAndCorrects) {
  // Build confusion matrix
  const matrix = {};
  for (const correct of optionNames) {
    matrix[correct] = {};
    for (const selected of optionNames) {
      matrix[correct][selected] = 0;
    }
  }

  let totalCorrect = 0;
  let totalIncorrect = 0;

  // Confidence breakdown accumulators
  const confidenceCounts = { sure: { correct: 0, total: 0 }, somewhat: { correct: 0, total: 0 }, guessing: { correct: 0, total: 0 } };
  let hasConfidence = false;

  for (const { selectedOption, correctOption, confidence } of userSelectionsAndCorrects) {
    if (matrix[correctOption.name]) {
      matrix[correctOption.name][selectedOption.name] =
        (matrix[correctOption.name][selectedOption.name] || 0) + 1;
    }
    const isCorrect = selectedOption.name === correctOption.name;
    if (isCorrect) {
      totalCorrect++;
    } else {
      totalIncorrect++;
    }
    if (confidence) {
      hasConfidence = true;
      confidenceCounts[confidence].total++;
      if (isCorrect) confidenceCounts[confidence].correct++;
    }
  }

  const total = userSelectionsAndCorrects.length;
  const nOptions = optionNames.length;

  // p-value: one-tailed binomial test
  // Probability of getting this many or more correct by random guessing
  const pValue = total > 0
    ? binomialPValue(totalCorrect, total, 1 / nOptions)
    : 1;

  // Build confidence breakdown (only for +C variants)
  const confidenceBreakdown = hasConfidence
    ? ['sure', 'somewhat', 'guessing']
        .filter((level) => confidenceCounts[level].total > 0)
        .map((level) => ({
          level,
          correct: confidenceCounts[level].correct,
          total: confidenceCounts[level].total,
        }))
    : null;

  return {
    name,
    optionNames,
    matrix,
    totalCorrect,
    totalIncorrect,
    total,
    pValue,
    confidenceBreakdown,
  };
}

// --- Triangle Test Statistics ---

/**
 * Compute Triangle test statistics from user selections and correct answers.
 * Same confusion matrix structure as ABX, but chance probability is 1/3
 * (3 tracks presented, 1 correct answer).
 *
 * @param {string} name - Test name
 * @param {string[]} optionNames - Option names (the 2 original options)
 * @param {object[]} userSelectionsAndCorrects - Array of { selectedOption, correctOption }
 * @returns {object} Triangle stats
 */
export function computeTriangleStats(name, optionNames, userSelectionsAndCorrects) {
  let totalCorrect = 0;
  let totalIncorrect = 0;

  // Confidence breakdown accumulators
  const confidenceCounts = { sure: { correct: 0, total: 0 }, somewhat: { correct: 0, total: 0 }, guessing: { correct: 0, total: 0 } };
  let hasConfidence = false;

  for (const { selectedOption, correctOption, confidence } of userSelectionsAndCorrects) {
    const isCorrect = selectedOption.name === correctOption.name;
    if (isCorrect) {
      totalCorrect++;
    } else {
      totalIncorrect++;
    }
    if (confidence) {
      hasConfidence = true;
      confidenceCounts[confidence].total++;
      if (isCorrect) confidenceCounts[confidence].correct++;
    }
  }

  const total = userSelectionsAndCorrects.length;

  // p-value: one-tailed binomial test with chance = 1/3
  // Triangle always has 3 presented tracks, so random guessing = 1/3
  const pValue = total > 0
    ? binomialPValue(totalCorrect, total, 1 / 3)
    : 1;

  // Build confidence breakdown (only for +C variants)
  const confidenceBreakdown = hasConfidence
    ? ['sure', 'somewhat', 'guessing']
        .filter((level) => confidenceCounts[level].total > 0)
        .map((level) => ({
          level,
          correct: confidenceCounts[level].correct,
          total: confidenceCounts[level].total,
        }))
    : null;

  return {
    name,
    optionNames,
    totalCorrect,
    totalIncorrect,
    total,
    pValue,
    confidenceBreakdown,
  };
}

// --- Inverse Normal CDF (Probit) ---

/**
 * Inverse normal CDF (z-score) using rational approximation.
 * Abramowitz and Stegun formula 26.2.23. Accurate to ~4.5e-4.
 * @param {number} p - Probability (0 < p < 1)
 * @returns {number} z-score
 */
export function zScore(p) {
  if (p <= 0 || p >= 1) return NaN;
  if (p < 0.5) return -zScore(1 - p);
  const t = Math.sqrt(-2 * Math.log(1 - p));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;
  return t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
}

// --- 2AFC Same-Different Statistics ---

/**
 * Compute 2AFC Same-Different statistics with signal detection theory.
 *
 * Trial types: AA, BB (same pairs) and AB, BA (different pairs).
 * Responses: "same" or "different".
 *
 * Signal detection:
 * - Hit = correctly identifying a different pair as "different"
 * - Miss = incorrectly identifying a different pair as "same"
 * - False alarm = incorrectly identifying a same pair as "different"
 * - Correct rejection = correctly identifying a same pair as "same"
 *
 * d' and criterion c use Hautus (1995) log-linear correction:
 * add 0.5 to both hit and false-alarm counts, add 1 to totals.
 *
 * @param {string} name - Test name
 * @param {string[]} optionNames - The 2 original option names
 * @param {object[]} userSelectionsAndCorrects - Array of { userResponse, pairType, confidence }
 * @returns {object} Same-different stats
 */
export function computeSameDiffStats(name, optionNames, userSelectionsAndCorrects) {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;

  // Confidence breakdown accumulators
  const confidenceCounts = { sure: { correct: 0, total: 0 }, somewhat: { correct: 0, total: 0 }, guessing: { correct: 0, total: 0 } };
  let hasConfidence = false;

  for (const { userResponse, pairType, confidence } of userSelectionsAndCorrects) {
    const isCorrect = userResponse === pairType;
    if (pairType === 'different') {
      if (userResponse === 'different') hits++;
      else misses++;
    } else {
      if (userResponse === 'different') falseAlarms++;
      else correctRejections++;
    }
    if (confidence) {
      hasConfidence = true;
      confidenceCounts[confidence].total++;
      if (isCorrect) confidenceCounts[confidence].correct++;
    }
  }

  const totalDifferent = hits + misses;
  const totalSame = falseAlarms + correctRejections;
  const totalCorrect = hits + correctRejections;
  const totalIncorrect = misses + falseAlarms;
  const total = userSelectionsAndCorrects.length;

  // Hautus (1995) log-linear correction: add 0.5 to counts, 1 to totals
  const hitRate = totalDifferent > 0
    ? (hits + 0.5) / (totalDifferent + 1)
    : 0.5;
  const falseAlarmRate = totalSame > 0
    ? (falseAlarms + 0.5) / (totalSame + 1)
    : 0.5;

  const dPrime = zScore(hitRate) - zScore(falseAlarmRate);
  const criterionC = -0.5 * (zScore(hitRate) + zScore(falseAlarmRate));

  // Binomial p-value: chance = 0.5
  const pValue = total > 0 ? binomialPValue(totalCorrect, total, 0.5) : 1;

  // Confidence breakdown
  const confidenceBreakdown = hasConfidence
    ? ['sure', 'somewhat', 'guessing']
        .filter((level) => confidenceCounts[level].total > 0)
        .map((level) => ({
          level,
          correct: confidenceCounts[level].correct,
          total: confidenceCounts[level].total,
        }))
    : null;

  return {
    name,
    optionNames,
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
    pValue,
    confidenceBreakdown,
  };
}

// --- Tag-based Aggregation ---

/**
 * Aggregate AB stats across tests by option tags.
 * @param {object[]} allTestStats - Array of AB stats objects
 * @param {object} config - Full config (for tag lookup)
 * @returns {object[]} Aggregated tag stats
 */
export function computeAbTagStats(allTestStats, config) {
  if (!config || !config.options) return [];

  // Build tag map: option name → tag
  const tagMap = {};
  for (const opt of config.options) {
    if (opt.tag) tagMap[opt.name] = opt.tag;
  }

  // Group by unique tag combination sets
  const groups = {};
  for (const stats of allTestStats) {
    const tags = stats.options
      .map((opt) => tagMap[opt.name] || opt.name)
      .sort()
      .join(' vs ');

    if (!groups[tags]) {
      groups[tags] = { name: tags, tagNames: [], counts: {}, testCount: 0 };
      // Initialize counts for each tag
      for (const opt of stats.options) {
        const tag = tagMap[opt.name] || opt.name;
        if (!groups[tags].counts[tag]) {
          groups[tags].counts[tag] = 0;
          groups[tags].tagNames.push(tag);
        }
      }
    }

    groups[tags].testCount++;

    // Accumulate counts
    for (const opt of stats.options) {
      const tag = tagMap[opt.name] || opt.name;
      groups[tags].counts[tag] += opt.count;
    }
  }

  // Convert to stats format
  return Object.values(groups).map((group) => {
    const total = Object.values(group.counts).reduce((a, b) => a + b, 0);
    const countArray = group.tagNames.map((t) => group.counts[t]);
    // Chi-squared goodness-of-fit test against uniform distribution
    const expected = total / group.tagNames.length;
    const chiSq = expected > 0 ? countArray.reduce((sum, obs) => sum + ((obs - expected) ** 2) / expected, 0) : 0;
    const pValue = total > 0 ? chiSquaredPValue(chiSq, group.tagNames.length - 1) : 1;

    return {
      name: group.name,
      options: group.tagNames.map((tag) => ({
        name: tag,
        count: group.counts[tag],
        percentage: total > 0 ? ((group.counts[tag] / total) * 100).toFixed(1) : '0.0',
      })),
      total,
      pValue,
      testCount: group.testCount,
    };
  });
}

/**
 * Aggregate ABX stats across tests by option tags.
 * @param {object[]} allTestStats - Array of ABX stats objects
 * @param {object} config - Full config
 * @returns {object[]} Aggregated tag stats
 */
export function computeAbxTagStats(allTestStats, config) {
  if (!config || !config.options) return [];

  const tagMap = {};
  for (const opt of config.options) {
    if (opt.tag) tagMap[opt.name] = opt.tag;
  }

  const groups = {};
  for (const stats of allTestStats) {
    const tags = stats.optionNames
      .map((n) => tagMap[n] || n)
      .sort()
      .join(' vs ');

    if (!groups[tags]) {
      groups[tags] = {
        name: tags,
        optionNames: stats.optionNames.map((n) => tagMap[n] || n),
        totalCorrect: 0,
        totalIncorrect: 0,
        total: 0,
        testCount: 0,
      };
    }

    groups[tags].testCount++;
    groups[tags].totalCorrect += stats.totalCorrect;
    groups[tags].totalIncorrect += stats.totalIncorrect;
    groups[tags].total += stats.total;
  }

  return Object.values(groups).map((group) => {
    const nOptions = group.optionNames.length;
    const pValue = group.total > 0
      ? binomialPValue(group.totalCorrect, group.total, 1 / nOptions)
      : 1;

    return {
      ...group,
      pValue,
    };
  });
}
