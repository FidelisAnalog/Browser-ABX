# Waveform Code Review

Forensic review of `src/waveform/` — architecture, fragility, and code quality.

**Date:** 2026-03-13
**Branch reviewed:** test
**Files:** Waveform.jsx, OverviewBar.jsx, Playhead.jsx, LoopRegion.jsx, Timeline.jsx, generateWaveform.js

---

## Fragile / Risky

### 1. Six interdependent boolean ref flags with no state machine

Waveform.jsx lines 61–88: `dragActiveRef`, `scrollCausedViewChangeRef`, `programmaticScrollRef`, `gestureActiveRef`, `overviewDraggingRef`, `followActiveRef`. Each is a bare boolean that must be set/cleared in exactly the right order across different handlers and effects. There's no single place that shows the valid combinations or transitions. Adding a new gesture type means understanding all six flags and their interactions across ~400 lines of handlers.

This isn't a hack — it works — but it's the single most fragile surface in the waveform system. A state machine (even a simple string enum like `gestureState: 'idle' | 'wheel' | 'pinch' | 'overviewDrag' | 'handleDrag'`) would make valid transitions explicit and impossible to get into contradictory states.

### 2. `programmaticScrollRef` is a one-shot flag with no guarantee of consumption

Line 620–621 sets `programmaticScrollRef = true`, then writes `scrollLeft`. Line 554–556 clears it. But if the browser doesn't fire a scroll event for that write (e.g., scrollLeft was already at the target value, or the element isn't scrollable at that moment), the flag stays `true` and the next real user scroll gets silently swallowed. Known class of bug with one-shot sentinel flags.

### 3. Touch pinch doesn't prevent native scroll

Line 535: `touchstart` is `{ passive: true }`, meaning `e.preventDefault()` can't be called. If a two-finger pinch has any vertical component, iOS may simultaneously pinch-zoom the page. The `touchAction: 'pan-x pan-y'` on the scroll container (line 854) should block page zoom, but that's on the scroll wrapper, not the container where the touch listener lives. The touch listener is on `containerRef` (line 480), which has no `touchAction` set.

### 4. Touch pinch gestureEnd doesn't use a timer like wheel does

Lines 529–533: `handleTouchEnd` immediately sets `gestureActiveRef = false` and calls `checkFollowEngage()`. But the wheel handler (line 409) uses a 150ms debounce timer before clearing. If a pinch ends and the rAF follow-check runs in the same frame, follow can re-engage while the user's fingers are still lifting. Inconsistent treatment of gesture end timing between input methods.

### 5. `overviewDraggingRef` cleared before scrollLeft write is committed

Line 793 clears `overviewDraggingRef`, then line 808 writes scrollLeft. The useLayoutEffect at line 600 guards on `overviewDraggingRef`. If React batches a state update from the gesture-end callback and runs the layout effect synchronously, it will see `overviewDraggingRef = false` and try to write scrollLeft itself — potentially racing with the explicit write on line 808. The flag should be cleared after the scrollLeft write, or the explicit write should be the only path and the layout effect should always skip when it detects the gesture-end wrote.

---

## Below Standards / Code Smells

### 6. Magic number `0.001` repeated 7+ times with two different meanings

- "Is full range" check: LoopRegion.jsx:32, Waveform.jsx:674, OverviewBar.jsx:279
- "Is zoomed" check: Waveform.jsx:308, 438, 773, OverviewBar.jsx:128
- Also in useLayoutEffect: Waveform.jsx:614

Should be named constants (`FULL_RANGE_EPSILON`, `ZOOM_EPSILON`) and ideally extracted into a shared helper like `isFullRange(start, end, duration)`.

### 7. `isZoomed` computed in 4 separate places

Waveform.jsx:308, 438, 773, OverviewBar.jsx:128. Each re-derives it from the same formula. If the threshold ever changes, it needs to change in 4 places.

### 8. Duplicated SVG path builder in Waveform.jsx and OverviewBar.jsx

Waveform.jsx:132–157 and OverviewBar.jsx:97–120 are nearly identical — same upper/lower envelope logic, different height constants. Should be a shared `buildEnvelopePath(data, width, height)` utility in generateWaveform.js.

### 9. OverviewBar loop region position computed inline 4 times

OverviewBar.jsx:281–304: `(loopRegion[0] / duration) * containerWidth` appears 3 times, `(loopRegion[1] / duration) * containerWidth` appears 2 times. Should be computed once as local variables.

### 10. `generateWaveformData` and `extractChannel0` are dead code

generateWaveform.js:84–96. The comment says "Used by OverviewBar" but OverviewBar imports `downsampleRange` directly and receives pre-averaged data. `extractChannel0` is not imported anywhere. Confirmed via grep — only referenced in their own definition file.

### 11. OverviewBar handlers are not memoized

OverviewBar.jsx:135–229: `handlePointerDown`, `handlePointerMove`, `handlePointerUp`, `xToTime`, `updateCursor` are all bare function declarations inside the component body (no `useCallback`). Since OverviewBar is `React.memo`, the component itself won't re-render unnecessarily, but these handlers are recreated every render. Inconsistent with the careful memoization discipline in Waveform.jsx.

### 12. Two independent rAF loops for playhead

Both Playhead.jsx and OverviewBar.jsx:69–88 run their own `requestAnimationFrame` loops doing the same thing — reading `currentTimeRef` and updating an SVG line. When unzoomed (overview not visible), the OverviewBar loop runs for nothing. Two animation loops where one coordinator could serve both.

### 13. LoopRegion dim overlay uses hardcoded `rgba(0,0,0,0.15)`

LoopRegion.jsx:45–52: every other color comes from `theme.palette.waveform.*`, but the dim overlay ignores the theme. Can't be tuned per-theme.

---

## Verdict

The architecture is sound — separation of concerns is clean, the two-phase data pipeline is elegant, and the playhead rAF bypass is the right call. The main risk is the ref-flag coordination in Waveform.jsx. It works today because each interaction has been carefully debugged (the snap fix saga proves that), but it's the kind of system where the next change has a high chance of breaking a subtle invariant.

The code smells (duplicated path builder, repeated magic numbers, dead exports) are straightforward to clean up.
