# Test Type Plugin Architecture

## Overview

Each test type is a **plugin** — a set of functions and components that define how that test type behaves. The framework (useTestFlow + TestPanel) is generic and delegates all type-specific logic to the registered plugin.

**Adding a new test type = one registry entry pointing to its pieces.** No changes to useTestFlow or TestPanel.

## Plugin Interface

A test type plugin provides 5 pieces, registered in `src/utils/testTypeRegistry.js`:

### 1. `setup(params)` → `{ ui, secure, bufferSources, shuffledOptions, testState }`

Called at the start of each iteration. Builds the track lineup for this trial.

**Params:**
- `options` — the test's options array from the YAML config
- `testConfig` — full test config object (repeat count, staircase params, etc.)
- `isNewTest` — true on the first iteration of this test
- `testState` — opaque per-test state from the previous iteration (null on first call). Use this for state that persists across iterations (e.g., balanced trial bags, adaptive algorithm state).
- `hasConfidence` — whether the +C suffix was used on this test type
- `shuffledOptions` — the shuffled options from the previous iteration (use on subsequent iterations if your type doesn't reshuffle)
- `baseType` — the base type key (e.g., 'abx', 'abxy'). Useful when two types share one plugin (ABX and ABXY share `abx.js`).

**Returns:**
- `ui` — props for the UI component. **Must not contain correct answers.** This data is passed to React and is visible in DevTools. Include things like: track count, option labels, whether to show confidence, familiarization flags, adaptive state for display.
- `secure` — anti-cheat data (commitment hash, correct answer index, etc.). Stored at module level in useTestFlow's `_iterationMeta` — **invisible to React DevTools**. Passed back to `processSubmit` for verification. Set to `null` for types with no correct answer (e.g., AB preference tests).
- `bufferSources` — array of `{ name, audioUrl }` objects to load into the audio engine for this iteration.
- `shuffledOptions` — the current options ordering. Framework stores this for use in `processSubmit` and for persisting across iterations.
- `testState` — updated per-test persistent state. Framework stores this opaquely and passes it back on the next call.

### 2. `processSubmit(params)` → `{ isCorrect, trialRecord, progressDot, testState, isFamiliarization? }`

Called when the user submits an answer. Verifies the answer and builds the trial record.

**Params:**
- `answerId` — the user's answer (string). Opaque to the framework — could be a track index, 'same'/'different', or anything.
- `confidence` — confidence level ('sure', 'somewhat', 'guessing') or null.
- `secure` — the anti-cheat data from `_iterationMeta` (set by setup). Use this to verify the answer. `null` for types with no correct answer.
- `options` — the current shuffled options array.
- `testState` — per-test persistent state.
- `timing` — `{ startedAt, finishedAt }` timestamps for this iteration.
- `ui` — the ui props from setup (useful for staircase which needs `interleavedTrackIdx` and `testLevel`).

**Returns:**
- `isCorrect` — boolean (true/false) or null (for preference tests).
- `trialRecord` — object to add to the trial records array. Set to `null` for familiarization (no trial recorded).
- `progressDot` — `{ isCorrect, confidence }` for the progress bar. Set to `null` for familiarization.
- `testState` — updated per-test persistent state.
- `isFamiliarization` — (optional, default false) if true, the framework re-runs setup instead of advancing. Used for staircase warm-up phase.

### 3. `isComplete(testState, repeatStep, testConfig)` → boolean

Called after each trial to determine whether the test should end.

- `testState` — per-test persistent state
- `repeatStep` — current iteration index (0-based)
- `testConfig` — full test config object

Return `true` when the test is complete. For fixed-count tests, this is `repeatStep + 1 >= testConfig.repeat`. For adaptive tests, check the convergence state.

### 4. `mergeResults(trialRecords, testState, testConfig)` → object

Called when the test completes. Produces the result data to merge into the results array.

- `trialRecords` — array of all trial records from this test (deep copy)
- `testState` — per-test persistent state (for adaptive tests that store final state)
- `testConfig` — full test config object

Return an object whose keys will be merged into the test's result entry. For example: `{ userSelectionsAndCorrects: trialRecords }` or `{ staircaseData: { trials, finalState, interleaved } }`.

### 5. UI Component

The React component rendered during the test. Owns the full interaction area: track selector, answer mechanism, confidence buttons (if applicable), progress bar.

Receives:
- Common props from framework: `name`, `description`, `stepStr`, `onSubmit`, `iterationKey`, `progressDots`, `engine`
- Type-specific props from `setup`'s `ui` return (spread directly)

Note: `channelData` and `crossfadeForced` are NOT passed to type components — those go to TestPanel (the card frame shell that wraps the type component with AudioControls).

The component calls `onSubmit(answerId, confidence)` when the user submits.

## Registry Entry

Each test type is registered in `TEST_TYPES` in `src/utils/testTypeRegistry.js`:

```js
myNewType: {
  // Plugin functions
  setup: myTypeModule.setup,
  processSubmit: myTypeModule.processSubmit,
  isComplete: myTypeModule.isComplete,
  mergeResults: myTypeModule.mergeResults,

  // UI
  testComponent: MyTypeTest,       // React component for the test screen
  statsComponent: MyTypeStats,     // React component for the results screen

  // Stats
  computeStats: computeMyTypeStats, // Pure function: (name, optionNames, resultData) → stats object

  // Metadata
  resultDataKey: 'myTypeData',      // Key in results array for this type's data
  supportsConfidence: true,          // Whether +C suffix is valid
  waveformExtraTracks: 0,           // Extra tracks for composite waveform (1 for X, 2 for X+Y)
  shareEncoding: 'mytype',          // Encoding key for share URLs
  isAdaptive: false,                // true = no fixed trial count (affects step label)
}
```

## Anti-Cheat Contract

The plugin architecture enforces a strict separation between public and private data:

1. **Setup returns two channels:** `ui` (public, goes to React) and `secure` (private, stored at module level).
2. **The framework owns `_iterationMeta`** — the module-level variable in useTestFlow.js. Plugins never read or write it directly.
3. **processSubmit receives `secure` back** from the framework for verification. After processing, the framework clears `_iterationMeta`.
4. **Trial records are private** — stored in `trialRecordsRef`, never exposed as props. Merged into results only at test completion.
5. **Engine facade** — components receive a facade object with public methods only. No access to `_buffers` or internal audio nodes.

## File Structure

```
src/
  testTypes/          ← Plugin modules (pure JS, no React)
    ab.js             ← AB preference test
    abx.js            ← ABX and ABXY identification tests
    triangle.js       ← Triangle odd-one-out test
    sameDiff.js       ← Same/Different (2AFC-SD) test
    staircase.js      ← Adaptive staircase (2AFC-Staircase) test
  utils/
    testTypeRegistry.js  ← Maps type names → plugin pieces
  hooks/
    useTestFlow.js       ← Generic lifecycle engine (no type-specific code)
  components/
    TestSession.jsx      ← Composes useAudioEngine + useTestFlow, renders screens
    TestPanel.jsx        ← Minimal card frame (Paper + AudioControls)
    TestHeader.jsx       ← Shared: name + description + divider
    ConfidenceButtons.jsx ← Shared: sure/somewhat/guessing button stack
    FixedProgress.jsx    ← Shared: fixed-length progress dots (ABX, Triangle, etc.)
    AdaptiveProgress.jsx ← Shared: dynamic-length progress bar (Staircase)
    ABTest.jsx           ← UI component for AB
    ABXTest.jsx          ← UI component for ABX and ABXY
    TriangleTest.jsx     ← UI component for Triangle
    SameDiffTest.jsx     ← UI component for Same/Different
    StaircaseTest.jsx    ← UI component for Staircase
```

## How to Add a New Test Type

1. **Create a plugin module** in `src/testTypes/yourType.js` exporting `setup`, `processSubmit`, `isComplete`, `mergeResults`.
2. **Create a UI component** in `src/components/YourTypeTest.jsx` (or reuse an existing one if the interaction pattern matches).
3. **Create a stats component** in `src/components/YourTypeStats.jsx` and a `computeYourTypeStats` function in `src/stats/statistics.js`.
4. **Add a registry entry** in `src/utils/testTypeRegistry.js`.
5. **Add config validation** in `src/utils/config.js` for any new config fields your type uses.

No changes to useTestFlow, TestSession, or any other framework code.
