# Anti-Cheat + Layout + Test Component Unification

## Context

Three problems converge on the same files and benefit from a combined refactor:

1. **Cheating exposure**: Correct answers are readable in React DevTools — `correctOption`, `referenceIdx`, `pairType`, `xOption.audioUrl`, and accumulated `iterationResults` all reveal answers. The full SameDiff trial sequence is pre-generated and visible.

2. **Layout duplication**: Every screen (6 test components, LandingPage, SharedResults, TestRunner error/results/welcome) repeats `<Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }}><Container maxWidth="md">`. Sizing for embedded vs standalone is scattered across components. No slot architecture for future branding.

3. **Test component duplication**: 6 test components share ~80% identical code (shell, header, TrackSelector, AudioControls, confidence stack, progress bar). Only submit button text, answer mode, and a few staircase-specific elements differ.

The anti-cheat refactor removes answer-awareness from components, making their submit signatures uniform. Layout extraction removes their outer shell. Both changes make unification into a single component natural rather than forced.

## Plan

### Phase 1: Commitment utility

New file: `src/utils/commitment.js`

Two functions:
- `createCommitment(correctAnswerId, allAnswerIds)` — async. Generates random token via `crypto.getRandomValues`, computes `SHA-256(token + '|' + answerId)` for every possible answer via `crypto.subtle.digest`. Returns `{ token, answerHashes: Map<id, hash>, correctHash }`.
- `verifyAnswer(answerHashes, selectedId, correctHash)` — **synchronous**. Map lookup + string comparison. Returns `isCorrect` boolean.

Sync verification is key: all hashes are pre-computed at iteration setup time (async is fine there). At submit time, verification is a map lookup — no await needed. This means staircase's adaptive algorithm gets `isCorrect` synchronously.

Answer ID scheme:
- AB/ABX/ABXY/Triangle/Staircase: `String(trackIndex)`
- SameDiff: `'same'` or `'different'`

### Phase 2: Config loading extraction

Extract config loading from TestRunner into a `useConfig` hook.

- `useConfig(configUrl, configProp)` — returns `{ config, configError }`
- Handles both modes: embedded (configProp already normalized) and standalone (fetch + parseConfig)
- TestRunner receives resolved config, doesn't own the loading concern

Audio init stays in TestRunner for now — it's tightly coupled to engine creation and buffer mapping.

### Phase 3: Anti-cheat integration into TestRunner

**setupIteration changes** — becomes async:
- After determining the correct answer (which it already does), calls `await createCommitment(...)`
- Stores commitment in `iterationStateRef.current.commitment`
- Removes answer-revealing data from what gets passed to components:
  - ABX/ABXY: keeps `xOption`/`yOption` for rendering X/Y tracks but strips `audioUrl` (component only needs to know X exists, not which option it matches)
  - Triangle: removes `correctOption` from props
  - Staircase: removes `referenceIdx` from props
  - SameDiff: removes `pairType` from props
  - AB: removes full option objects from props, passes only labels

**All callers of setupIteration become async**: `handleStart`, `handleRestart`, `advanceStep`. There are exactly 4 call sites.

**Submit handlers unified**: All test types converge on `onSubmit(answerId, confidence)`. TestRunner's single handler:
1. Calls `verifyAnswer(commitment.answerHashes, answerId, commitment.correctHash)` — sync
2. For staircase: feeds `isCorrect` to adaptive algorithm immediately
3. Stores `isCorrect` in a `progressDots` ref for the progress bar
4. Stores full trial record (with correctOption from internal state) in a private ref for stats computation — never exposed as props
5. On test completion, copies accumulated trial records into results for stats

**Results accumulation changes**: During the test, `results` state no longer contains `correctOption` per trial. Components see only `progressDots: { isCorrect, confidence }[]`. Full data for confusion matrix / stats is accumulated privately in TestRunner and merged into results when the test completes.

**SameDiff trial sequence**: Generate one trial at a time instead of pre-generating full array. For balanced mode, maintain a "bag" (shuffled block of `['AA','AB','BA','BB']`), pop one per trial, refill when empty. Current trial type stored in iterationStateRef, future trials not visible anywhere.

**iterationKey prop**: Components currently reset on `[xOption]`, `[triplet]`, `[pair]` changes. Replace with an `iterationKey` counter that TestRunner increments each iteration.

### Phase 4: Update test components for new props

Mechanical changes to each component to match the new contract:

- Remove: `correctOption`, `referenceIdx`, `pairType`, `xOption` (as answer source), `iterationResults`
- Add: `progressDots`, `iterationKey`
- Submit calls become `onSubmit(String(answerIndex), confidence)` or `onSubmit('same'/'different', confidence)`
- Remove `getCorrectOption()` from ABX/ABXY
- Progress bar uses `progressDots[i].isCorrect` directly instead of computing from `selectedOption.audioUrl === correctOption.audioUrl`

After this phase: all components call `onSubmit(answerId, confidence)` uniformly.

### Phase 5: Layout component

New file: `src/components/Layout.jsx`

- Renders the common shell: background, Container with maxWidth, header/footer slots
- Receives `screen` identifier (`'loading'`, `'welcome'`, `'test'`, `'results'`, `'error'`, `'landing'`, `'shared-results'`)
- Owns `minHeight` logic (standalone vs embedded) — replaces all scattered conditionals
- Slot architecture for future branding (header, footer) — content not implemented now, just the structure
- Consults a pure-logic branding rules module (`src/utils/branding.js`) that returns what to render per slot based on screen + isEmbedded

Remove the `Box/Container` shell from:
- All 6 test components
- `LandingPage.jsx`
- `SharedResults.jsx`
- TestRunner's error/loading/results render paths
- App.jsx's embed loading/error states

### Phase 6: Test component unification

Composition-based approach — TestPanel is the shared shell, not a monolith. Per-type behavior lives in small pluggable components, not conditionals.

**`src/components/TestPanel.jsx`** — shared shell only:
- Header (name + description)
- Divider + stepStr
- TrackSelector (parameterized by `trackCount`, `xTrackIndex`)
- **Answer area slot** — renders whatever answer component the registry specifies
- **Progress bar slot** — renders whatever progress component the registry specifies
- AudioControls
- `useHotkeys` and `useSelectedTrack`
- Answer state + reset on `iterationKey` change

**Answer area components** (small, focused):
- `TrackAnswer` — single submit button with configurable label function. Covers AB, ABX, ABXY, Triangle, Staircase. Label examples: `a => 'X is ' + a`, `a => a + ' is different'`, `a => 'Select ' + a`
- `PairAnswer` — two side-by-side buttons (Same/Different). Covers SameDiff.
- `FamiliarizationAnswer` — "Start Test" button, always enabled. Staircase pre-test phase.
- Confidence stack is shared across all answer components (renders on top of whichever answer component is active when `showConfidence` is true)

**Progress bar components** (small, focused):
- `FixedProgress` — fixed-length dots with confidence-based color shading. Used by ABX, ABXY, Triangle, SameDiff.
- `AdaptiveProgress` — dynamic-length dots (grows with trials + minRemaining), no confidence shading. Used by Staircase.
- None — AB has no progress bar.

**Extra slots**:
- `headerExtra` — optional content between divider and track selector. Staircase uses this for reversals counter + familiarization labels.

**Registry changes** (`testTypeRegistry.js`):
- Add `uiConfig` to each entry specifying which answer/progress components and their configuration
- Keep `testComponent` as optional override — if a future test type needs genuinely different UI (slider response, drag-to-rank), it provides `testComponent` instead of `uiConfig`, and TestRunner renders that directly
- Remove `submitType` (unified)
- TestRunner constructs TestPanel props from `uiConfig` + runtime state

**Adding a new test type**: add a registry entry with `uiConfig`. If existing answer/progress components fit, it's purely config. If it needs a new answer mode, add a small answer component — TestPanel doesn't change. If it needs entirely different UI, provide a custom `testComponent` override.

Delete after unification:
- `src/components/ABTest.jsx`
- `src/components/ABXTest.jsx`
- `src/components/ABXYTest.jsx`
- `src/components/TriangleTest.jsx`
- `src/components/SameDiffTest.jsx`
- `src/components/StaircaseTest.jsx`

## Files

### Created
| File | Purpose |
|------|---------|
| `src/utils/commitment.js` | SHA-256 commitment create + verify |
| `src/utils/branding.js` | Branding rules (screen → slot content) |
| `src/components/Layout.jsx` | Shell: background, container, header/footer slots |
| `src/components/TestPanel.jsx` | Unified test component |

### Modified
| File | Changes |
|------|---------|
| `src/components/TestRunner.jsx` | Extract config loading, async setupIteration, commitment integration, unified submit handler, private trial records, progressDots, Layout wrapping, TestPanel usage, on-demand SameDiff trial generation |
| `src/utils/testTypeRegistry.js` | Replace `testComponent` with `uiConfig`, remove `submitType` |
| `src/components/App.jsx` | Wrap embed loading/error in Layout |
| `src/components/LandingPage.jsx` | Remove Box/Container shell |
| `src/components/SharedResults.jsx` | Remove Box/Container shell |
| `src/components/Welcome.jsx` | Minor — may need shell removal if TestRunner currently wraps it inconsistently |

### Deleted
| File | Replaced by |
|------|-------------|
| `src/components/ABTest.jsx` | TestPanel |
| `src/components/ABXTest.jsx` | TestPanel |
| `src/components/ABXYTest.jsx` | TestPanel |
| `src/components/TriangleTest.jsx` | TestPanel |
| `src/components/SameDiffTest.jsx` | TestPanel |
| `src/components/StaircaseTest.jsx` | TestPanel |

### Unchanged
| File | Why |
|------|-----|
| `src/utils/share.js` | Encodes aggregated stats, not per-trial correct answers |
| `src/stats/statistics.js` | Same input format — TestRunner constructs it |
| `src/stats/staircase.js` | Adaptive algorithm unchanged |
| `src/audio/*` | Audio system unchanged |
| `src/components/TrackSelector.jsx` | Unchanged |
| `src/components/AudioControls.jsx` | Unchanged |

## Verification

1. All test types: run each type (AB, ABX, ABX+C, ABXY, Triangle, Triangle+C, 2AFC-SD, 2AFC-SD+C, 2AFC-Staircase), verify correct behavior, scoring, progress dots, confidence
2. React DevTools: inspect component props and state during trial — no correct answer, no referenceIdx, no pairType, no correctOption, no future trial sequence visible
3. Results: verify confusion matrix, p-values, staircase JND all compute correctly
4. Share URLs: create share URL, open in new tab, verify stats display correctly
5. Embed mode: verify postMessage config → test → dbt:completed flow works, results payload is correct
6. Layout: verify consistent sizing across all screens, no jumping between transitions, embedded vs standalone sizing correct
7. Restart: verify test restart works (re-randomizes, resets progress dots, re-creates commitments)
