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

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/**
 * Multinomial probability mass function.
 * Computes the probability of observing the given counts
 * under the given probability distribution.
 *
 * @param {number[]} counts - Observed counts per category
 * @param {number|number[]} probabilities - Probability per category (or single value for uniform)
 * @returns {number} PMF value (used as p-value for the exact test)
 */
export function multinomialPMF(counts, probabilities) {
  const n = counts.reduce((a, b) => a + b, 0);
  const k = counts.length;

  // Normalize probabilities
  const probs = typeof probabilities === 'number'
    ? Array(k).fill(probabilities)
    : probabilities;

  let logP = logGamma(n + 1);
  for (let i = 0; i < k; i++) {
    logP -= logGamma(counts[i] + 1);
    logP += counts[i] * Math.log(probs[i]);
  }

  // Sum over all outcomes at least as extreme
  // For the listening test use case, we compute the probability
  // of seeing results this uneven or more under the null hypothesis
  let pValue = 0;
  const thisP = Math.exp(logP);

  // Enumerate all possible outcomes with the same n
  function enumerate(remaining, depth, currentCounts) {
    if (depth === k - 1) {
      currentCounts[depth] = remaining;
      let lp = logGamma(n + 1);
      for (let i = 0; i < k; i++) {
        lp -= logGamma(currentCounts[i] + 1);
        lp += currentCounts[i] * Math.log(probs[i]);
      }
      const p = Math.exp(lp);
      if (p <= thisP + 1e-10) {
        pValue += p;
      }
      return;
    }
    for (let c = 0; c <= remaining; c++) {
      currentCounts[depth] = c;
      enumerate(remaining - c, depth + 1, currentCounts);
    }
  }

  enumerate(n, 0, new Array(k));
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
  const pValue = total > 0 ? multinomialPMF(countArray, 1 / optionNames.length) : 1;

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

  for (const { selectedOption, correctOption } of userSelectionsAndCorrects) {
    if (matrix[correctOption.name]) {
      matrix[correctOption.name][selectedOption.name] =
        (matrix[correctOption.name][selectedOption.name] || 0) + 1;
    }
    if (selectedOption.name === correctOption.name) {
      totalCorrect++;
    } else {
      totalIncorrect++;
    }
  }

  const total = userSelectionsAndCorrects.length;
  const nOptions = optionNames.length;

  // p-value: probability of getting this many or more correct by chance
  const countArray = [totalCorrect, totalIncorrect];
  const pValue = total > 0
    ? multinomialPMF(countArray, [1 / nOptions, 1 - 1 / nOptions])
    : 1;

  return {
    name,
    optionNames,
    matrix,
    totalCorrect,
    totalIncorrect,
    total,
    pValue,
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
      groups[tags] = { name: tags, tagNames: [], counts: {} };
      // Initialize counts for each tag
      for (const opt of stats.options) {
        const tag = tagMap[opt.name] || opt.name;
        if (!groups[tags].counts[tag]) {
          groups[tags].counts[tag] = 0;
          groups[tags].tagNames.push(tag);
        }
      }
    }

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
    const pValue = total > 0 ? multinomialPMF(countArray, 1 / group.tagNames.length) : 1;

    return {
      name: group.name,
      options: group.tagNames.map((tag) => ({
        name: tag,
        count: group.counts[tag],
        percentage: total > 0 ? ((group.counts[tag] / total) * 100).toFixed(1) : '0.0',
      })),
      total,
      pValue,
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
      };
    }

    groups[tags].totalCorrect += stats.totalCorrect;
    groups[tags].totalIncorrect += stats.totalIncorrect;
    groups[tags].total += stats.total;
  }

  return Object.values(groups).map((group) => {
    const nOptions = group.optionNames.length;
    const countArray = [group.totalCorrect, group.totalIncorrect];
    const pValue = group.total > 0
      ? multinomialPMF(countArray, [1 / nOptions, 1 - 1 / nOptions])
      : 1;

    return {
      ...group,
      pValue,
    };
  });
}
