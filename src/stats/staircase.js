/**
 * Adaptive staircase algorithm for JND (Just Noticeable Difference) determination.
 *
 * Pure state machine — no React dependencies. Operates on plain objects.
 * Supports transformed up-down methods (Levitt 1971):
 *   - 1u1d: 1 incorrect → step up, 1 correct → step down (50% threshold)
 *   - 1u2d: 1 incorrect → step up, 2 consecutive correct → step down (70.7%)
 *   - 1u3d: 1 incorrect → step up, 3 consecutive correct → step down (79.4%)
 *
 * Two-phase step sizes: coarse (initialStep) for fast convergence,
 * fine (finalStep) after stepReductionAfter reversals.
 *
 * Optional interleaving: 2 independent tracks run concurrently to reduce bias.
 */

/**
 * Default configuration values (single source of truth).
 * Imported by config.js for YAML parsing defaults.
 */
export const STAIRCASE_DEFAULTS = {
  rule: '1u1d',
  reversals: 6,
  maxTrials: 30,
  initialStep: 2,
  finalStep: 1,
  stepReductionAfter: 2,
  startLevel: null, // null = auto (middle of options)
  interleave: false,
};

/**
 * Parse rule string into correctsNeeded.
 * @param {string} rule - e.g. '1u1d', '1u2d', '1u3d'
 * @returns {number} Number of consecutive correct answers needed to step down
 */
function parseRule(rule) {
  const match = rule.match(/^1u(\d)d$/);
  if (!match) throw new Error(`Invalid staircase rule: "${rule}"`);
  return parseInt(match[1], 10);
}

/**
 * Create initial staircase state.
 * @param {object} config - Staircase config from normalized test
 * @param {number} config.nLevels - Number of quality levels (= options.length)
 * @param {string} config.rule - Transformed up-down rule
 * @param {number} config.reversals - Target number of reversals
 * @param {number} config.maxTrials - Maximum number of trials
 * @param {number} config.initialStep - Step size during coarse phase
 * @param {number} config.finalStep - Step size during fine phase
 * @param {number} config.stepReductionAfter - Switch to fine step after this many reversals
 * @param {number|null} config.startLevel - Starting level (1-based), null for auto
 * @returns {object} Initial staircase state
 */
export function createStaircaseState(config) {
  const nLevels = config.nLevels;
  const correctsNeeded = parseRule(config.rule);
  const startLevel = config.startLevel != null
    ? config.startLevel
    : Math.ceil(nLevels / 2); // Auto: middle

  return {
    // Config (immutable after init)
    nLevels,
    correctsNeeded,
    targetReversals: config.reversals,
    maxTrials: config.maxTrials,
    initialStep: config.initialStep,
    finalStep: config.finalStep,
    stepReductionAfter: config.stepReductionAfter,

    // Mutable state
    level: startLevel,          // Current level (1-based: 1=easiest/best, nLevels=hardest/worst)
    direction: null,            // 'up' | 'down' | null (no direction yet)
    consecutiveCorrect: 0,      // Streak counter for transformed rules
    reversals: [],              // Array of level values at each reversal
    trials: [],                 // Array of { level, isCorrect } for every trial
    complete: false,            // True when done
  };
}

/**
 * Get the current level (1-based index into options array).
 * Level 1 = reference / best quality, Level N = worst quality / hardest.
 * @param {object} state - Staircase state
 * @returns {number} Current level (1-based)
 */
export function getCurrentLevel(state) {
  return state.level;
}

/**
 * Record a response and advance the staircase.
 * Mutates and returns the state object.
 *
 * @param {object} state - Staircase state (will be mutated)
 * @param {boolean} isCorrect - Whether the listener answered correctly
 * @returns {object} The same state object (mutated)
 */
export function recordResponse(state, isCorrect) {
  if (state.complete) return state;

  // Record trial
  state.trials.push({ level: state.level, isCorrect });

  // Determine current step size
  const stepSize = state.reversals.length >= state.stepReductionAfter
    ? state.finalStep
    : state.initialStep;

  let newDirection = state.direction;

  if (!isCorrect) {
    // Incorrect: reset streak, step up (toward harder = higher level number)
    state.consecutiveCorrect = 0;
    newDirection = 'up';
    if (newDirection !== state.direction && state.direction !== null) {
      // Direction changed → reversal
      state.reversals.push(state.level);
    }
    state.direction = newDirection;
    state.level = Math.min(state.level + stepSize, state.nLevels);
  } else {
    // Correct: increment streak
    state.consecutiveCorrect++;
    if (state.consecutiveCorrect >= state.correctsNeeded) {
      // Enough consecutive correct → step down (toward easier = lower level number)
      state.consecutiveCorrect = 0;
      newDirection = 'down';
      if (newDirection !== state.direction && state.direction !== null) {
        // Direction changed → reversal
        state.reversals.push(state.level);
      }
      state.direction = newDirection;
      state.level = Math.max(state.level - stepSize, 1);
    }
    // If streak not yet met, no direction change, no level change
  }

  // Check completion
  if (state.reversals.length >= state.targetReversals || state.trials.length >= state.maxTrials) {
    state.complete = true;
  }

  return state;
}

/**
 * Compute JND from completed staircase state.
 * Discards first `stepReductionAfter` reversals (coarse phase),
 * computes mean and SD of remaining reversal levels.
 *
 * @param {object} state - Completed staircase state
 * @returns {{ jnd: number, sd: number, reversalsUsed: number[] }}
 */
export function computeJND(state) {
  const discard = state.stepReductionAfter;
  const usable = state.reversals.slice(discard);

  if (usable.length === 0) {
    // Not enough reversals — use all of them
    const all = state.reversals;
    if (all.length === 0) {
      return { jnd: state.level, sd: 0, reversalsUsed: [] };
    }
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const variance = all.length > 1
      ? all.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (all.length - 1)
      : 0;
    return { jnd: mean, sd: Math.sqrt(variance), reversalsUsed: all };
  }

  const mean = usable.reduce((a, b) => a + b, 0) / usable.length;
  const variance = usable.length > 1
    ? usable.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (usable.length - 1)
    : 0;

  return { jnd: mean, sd: Math.sqrt(variance), reversalsUsed: usable };
}

/**
 * Check if staircase is stuck at floor or ceiling.
 * @param {object} state - Staircase state
 * @returns {'floor'|'ceiling'|null}
 */
export function checkFloorCeiling(state) {
  if (state.trials.length === 0) return null;

  // Check last few trials — if all at boundary, flag it
  const recent = state.trials.slice(-3);
  const allAtFloor = recent.every((t) => t.level === 1);
  const allAtCeiling = recent.every((t) => t.level === state.nLevels);

  if (allAtFloor) return 'floor';
  if (allAtCeiling) return 'ceiling';
  return null;
}

/**
 * Compute the best-case minimum number of remaining trials.
 * Each remaining reversal requires at minimum 1 trial (a single direction change).
 * @param {object} state - Staircase state
 * @returns {number} Minimum remaining trials (>= 0)
 */
export function minRemainingTrials(state) {
  if (state.complete) return 0;
  return Math.max(0, state.targetReversals - state.reversals.length);
}

// --- Interleaving ---

/**
 * Create an interleaved staircase state (2 independent tracks).
 * @param {object} config - Same config as createStaircaseState
 * @returns {object} Interleaved state
 */
export function createInterleavedState(config) {
  return {
    tracks: [
      createStaircaseState(config),
      createStaircaseState(config),
    ],
    currentTrack: null,  // Set by pickInterleavedTrack
  };
}

/**
 * Pick the next track for an interleaved trial.
 * Random selection among non-complete tracks.
 * @param {object} interleaved - Interleaved state
 * @returns {number} Track index (0 or 1), or -1 if both complete
 */
export function pickInterleavedTrack(interleaved) {
  const available = interleaved.tracks
    .map((t, i) => ({ track: t, index: i }))
    .filter(({ track }) => !track.complete);

  if (available.length === 0) return -1;
  const pick = available[Math.floor(Math.random() * available.length)];
  interleaved.currentTrack = pick.index;
  return pick.index;
}

/**
 * Record a response on a specific interleaved track.
 * @param {object} interleaved - Interleaved state
 * @param {number} trackIndex - Which track (0 or 1)
 * @param {boolean} isCorrect - Whether the listener answered correctly
 * @returns {object} The interleaved state
 */
export function recordInterleavedResponse(interleaved, trackIndex, isCorrect) {
  recordResponse(interleaved.tracks[trackIndex], isCorrect);
  return interleaved;
}

/**
 * Check if all interleaved tracks are complete.
 * @param {object} interleaved - Interleaved state
 * @returns {boolean}
 */
export function isInterleavedComplete(interleaved) {
  return interleaved.tracks.every((t) => t.complete);
}

/**
 * Compute JND from interleaved staircase (average of both tracks).
 * @param {object} interleaved - Completed interleaved state
 * @returns {{ jnd: number, sd: number, tracks: object[] }}
 */
export function computeInterleavedJND(interleaved) {
  const trackResults = interleaved.tracks.map((t) => computeJND(t));
  const jnd = trackResults.reduce((a, r) => a + r.jnd, 0) / trackResults.length;
  // Pooled SD: sqrt of average of variances
  const avgVariance = trackResults.reduce((a, r) => a + r.sd ** 2, 0) / trackResults.length;

  return {
    jnd,
    sd: Math.sqrt(avgVariance),
    tracks: trackResults,
  };
}

/**
 * Compute best-case minimum remaining trials for interleaved staircase.
 * Sum of remaining trials across all non-complete tracks.
 * @param {object} interleaved - Interleaved state
 * @returns {number}
 */
export function minInterleavedRemainingTrials(interleaved) {
  return interleaved.tracks.reduce((sum, t) => sum + minRemainingTrials(t), 0);
}
