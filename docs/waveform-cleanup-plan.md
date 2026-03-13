# Waveform Cleanup Plan

Phased plan to address findings from [waveform-review.md](waveform-review.md).
Low risk (pure cleanup) separated from high risk (interaction logic).

---

## Phase 1 — Low Risk (pure cleanup, zero behavior change)

Safe refactors with no interaction logic changes.

### 1a. Extract shared constants and helpers (review #6, #7)
- Add `EPSILON = 0.001` constant
- Extract `isFullRange(start, end, duration)` — returns `start <= EPSILON && end >= duration - EPSILON`
- Extract `isZoomed(viewStart, viewEnd, duration)` — returns `viewStart > EPSILON || viewEnd < duration - EPSILON`
- Replace all 7+ inline `0.001` checks across Waveform.jsx, OverviewBar.jsx, LoopRegion.jsx
- **Files:** Waveform.jsx, OverviewBar.jsx, LoopRegion.jsx, new shared constants file

### 1b. Extract shared SVG path builder (review #8)
- Move upper/lower envelope path builder into `generateWaveform.js` as `buildEnvelopePath(data, width, height)`
- Replace duplicate implementations in Waveform.jsx and OverviewBar.jsx
- **Files:** generateWaveform.js, Waveform.jsx, OverviewBar.jsx

### 1c. Deduplicate OverviewBar loop region positions (review #9)
- Compute `loopStartX` and `loopEndX` once as local variables, use in all 5 places
- **Files:** OverviewBar.jsx

### 1d. Remove dead code (review #10)
- Delete `generateWaveformData` and `extractChannel0` from generateWaveform.js
- **Files:** generateWaveform.js

### 1e. Theme the loop region dim overlay (review #13)
- Replace hardcoded `rgba(0,0,0,0.15)` with `theme.palette.waveform.loopDim`
- Add `loopDim` to waveform palette in theme
- **Files:** LoopRegion.jsx, theme file

### 1f. Memoize OverviewBar handlers (review #11)
- Wrap `handlePointerDown`, `handlePointerMove`, `handlePointerUp` in `useCallback`
- Move `xToTime` to `useCallback`
- Consistent with Waveform.jsx memoization discipline
- **Files:** OverviewBar.jsx

---

## Phase 2 — High Risk (interaction logic, requires careful testing)

Each item touches gesture/scroll coordination. Separate commits with testing between each.

### 2a. Fix `overviewDraggingRef` ordering (review #5)
- In `handleOverviewGestureEnd`: move `overviewDraggingRef = false` to AFTER the scrollLeft write, not before
- Prevents race where useLayoutEffect sees the cleared flag and writes scrollLeft simultaneously
- **Files:** Waveform.jsx
- **Test:** Overview bar handle drag past swap point during playback, verify no snap

### 2b. Fix `programmaticScrollRef` stale flag (review #2)
- After writing scrollLeft, compare written value to `el.scrollLeft`
- If they match (browser didn't fire a scroll event because value was unchanged), immediately clear the flag
- **Files:** Waveform.jsx
- **Test:** Zoom to a position, zoom again to same position, then scroll — verify scroll not swallowed

### 2c. Fix touch pinch gesture end timing (review #4)
- Add 150ms debounce timer to `handleTouchEnd`, matching the wheel handler pattern
- Prevents follow from re-engaging mid-finger-lift
- **Files:** Waveform.jsx
- **Test:** Pinch-zoom on iOS, release fingers, verify playhead follow doesn't snap viewport

### 2d. Fix touch pinch native scroll prevention (review #3)
- Add `touchAction: 'none'` to `containerRef` (the outer Box), not just the scroll wrapper
- This is where the touch pinch listener lives — prevents iOS from capturing the gesture as page zoom
- **Files:** Waveform.jsx
- **Test:** Two-finger pinch on iOS with vertical component, verify no page zoom

### 2e. Consolidate rAF loops (review #12)
- Single rAF coordinator in Waveform that updates both main playhead and overview playhead positions
- Pass position data to OverviewBar via ref instead of it running its own loop
- **Files:** Waveform.jsx, OverviewBar.jsx, Playhead.jsx
- **Test:** Playhead animation smooth at all zoom levels, overview playhead tracks correctly

---

## Phase 3 — Structural (largest change, highest risk)

### 3a. Replace ref flags with gesture state machine (review #1)
- Replace `dragActiveRef`, `gestureActiveRef`, `overviewDraggingRef` with a single `gestureState` enum: `'idle' | 'wheel' | 'pinch' | 'overviewDrag' | 'handleDrag' | 'scroll'`
- `followActiveRef` stays separate (derived behavior, not a gesture)
- `scrollCausedViewChangeRef` and `programmaticScrollRef` stay separate (one-shot sync flags, not gesture state)
- Transition logic in one place — each handler calls `setGesture('type')` / `endGesture()` instead of toggling individual booleans
- Guards read `gestureState` instead of individual flags: `overviewDraggingRef.current` becomes `gestureState === 'overviewDrag'`
- **Files:** Waveform.jsx
- **Test:** Full regression — every gesture type on desktop and iOS: wheel zoom, trackpad pinch, touch pinch, overview drag (pan + resize + swap), loop handle drag, native scroll, playhead follow engage/disengage, click-to-seek
