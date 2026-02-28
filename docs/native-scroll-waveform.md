# Native Scroll Waveform Pan (iOS Momentum)

## Overview

The main waveform uses a native scroll container to provide iOS-native touch pan with momentum/deceleration, replacing the previous custom velocity/friction JS implementation.

## Architecture

```
containerRef (position: relative, overflow: visible, overscrollBehaviorX: none)
  scrollRef (overflowX: scroll, touchAction: pan-x)
    spacer div (width: containerWidth * duration / viewDuration)
      SVG (width: containerWidth, position: sticky, left: 0)
  handle overlay (position: absolute, overflow: visible, pointerEvents: none)
    start handle (position: absolute, touchAction: none, pointerEvents: auto)
    end handle (position: absolute, touchAction: none, pointerEvents: auto)
```

### How it works

- **scrollRef** is a native scroll container. A spacer div inside is sized proportionally to the zoom ratio, creating a scrollable range.
- **SVG** uses `position: sticky; left: 0` to stay visually fixed at the left edge while scroll position changes.
- **Scroll events** on scrollRef are translated to viewStart/viewEnd changes (scroll-to-view sync).
- **View changes** from other sources (zoom, overview bar, playhead follow) programmatically set scrollRef.scrollLeft (view-to-scroll sync).
- **Desktop** wheel events are intercepted on containerRef with `preventDefault()` and handled via `applyPan()`/`applyZoom()`. The scroll container is not involved in desktop interaction.

### Bidirectional sync

Two useEffects maintain sync between scroll position and view state:

1. **Scroll -> view** (`handleScroll`): reads scrollLeft, computes viewStart/viewEnd, calls setUserView. Sets `scrollCausedViewChangeRef = true` so the view->scroll sync skips.

2. **View -> scroll**: reads viewStart/viewEnd, computes and sets scrollLeft. Checks `scrollCausedViewChangeRef` to avoid feedback when the scroll handler caused the change. Sets `programmaticScrollRef = true` so the scroll handler ignores the resulting scroll event.

Without both guards, zoom/overview drag/playhead follow fight with the scroll handler in a feedback loop.

## Key bugs encountered and fixes

### Scroll handler never attached on iOS

**Bug**: The scroll handler useEffect had deps `[setUserView, checkFollowEngage]` — both stable memoized callbacks. On first render, `containerWidth = 0` so the scrollRef Box isn't rendered. When containerWidth becomes positive and Box mounts, the effect never re-runs because deps haven't changed. scrollRef.current is null on first run, so the early return fires, and the handler is never attached.

**Fix**: Add `containerWidth` to the dependency array.

### Feedback loop between scroll and view

**Bug**: Programmatic `el.scrollLeft = x` fires a real scroll event. The scroll handler picks it up, recomputes view with floating-point drift, calls setUserView, which triggers another scrollLeft update. This causes pinch-zoom and overview drag to fight with scroll.

**Fix**: `programmaticScrollRef` flag. View->scroll sync sets it before `el.scrollLeft = x`. Scroll handler checks and skips if true.

### Page width expansion from handle hit areas

**Bug**: Handle hit areas are absolutely positioned siblings of scrollRef. When zoomed, off-screen loop boundaries produce handle positions thousands of pixels beyond the container. With `overflow: visible` on the overlay, these extend the page layout width.

**Fix**: Clamp handle positions to `[0, containerWidth]` in JS. Don't render a handle when its loop boundary is completely off-screen (`startHitVisible`/`endHitVisible` guards). No CSS overflow clipping needed.

**Why not `overflow: clip` or `overflow: hidden`?** Both break iOS native scroll when applied to containerRef (parent of scrollRef). `overflow: hidden` creates a scroll container per CSS spec, interfering with the child scroll container. `overflow: clip` also disrupts iOS touch handling despite not creating a scroll container per spec. Even applying `overflow: clip` to the handle overlay div (a sibling of scrollRef, not a parent) caused iOS scroll issues — the exact mechanism is unclear but reproducible.

### Handle touchAction conflict with scroll

**Bug**: Handle hit areas originally had `touchAction: 'none'` to prevent the browser from stealing handle drags. But these invisible 44px-wide divs sit on top of the scroll container. When a touch lands on a handle area, iOS sees `touchAction: none` and won't initiate native scroll — degrading scroll momentum and causing intermittent seek failures.

Changing to `touchAction: 'pan-x'` allows scroll but causes `pointercancel` during handle drags (iOS initiates scroll, killing the pointer capture).

**Fix**: Keep `touchAction: 'none'` on handles (so drags work), but solve the scroll interference by clamping handle positions so they only exist in the DOM when their loop boundary is visible. When handles are off-screen, they're not rendered and can't interfere with touch. When handles are on-screen, the ~44px hit area is an acceptable dead zone for scroll — the user is near a handle and likely intends to interact with it.

### Desktop browser back-navigation on overscroll

**Bug**: Rapidly scrolling left at the waveform boundary triggers browser back-navigation.

**Fix**: `overscrollBehaviorX: 'none'` on both containerRef (for the desktop wheel handler path) and scrollRef (for the native scroll path). Both are needed because the wheel handler on containerRef intercepts scroll events and calls preventDefault() — scrollRef never scrolls natively on desktop, so its overscrollBehaviorX alone doesn't help.

## CSS properties and why they're set

| Property | Element | Purpose |
|---|---|---|
| `overflowX: scroll` | scrollRef | Creates the native scroll container |
| `overflowY: hidden` | scrollRef | Prevent vertical scroll |
| `overscrollBehaviorX: none` | scrollRef | Prevent scroll chaining to page (iOS) |
| `overscrollBehaviorX: none` | containerRef | Prevent back-nav from desktop wheel handler |
| `WebkitOverflowScrolling: touch` | scrollRef | iOS momentum scrolling (legacy, may be unnecessary) |
| `touchAction: pan-x` | scrollRef | Tell browser to handle horizontal touch as scroll |
| `position: sticky; left: 0` | SVG | Keep SVG visually fixed while scroll position changes |
| `touchAction: none` | handle divs | Prevent browser from stealing handle drags as scroll |
| `pointerEvents: none` / `auto` | overlay / handles | Only handles receive events, not the overlay div |
| `scrollbarWidth: none` | scrollRef | Hide scrollbar (Firefox) |
| `&::-webkit-scrollbar: none` | scrollRef | Hide scrollbar (WebKit) |

## Touch interaction model

- **Horizontal swipe on waveform** -> native scroll (iOS momentum)
- **Tap on waveform** -> seek (pointerdown + pointerup without movement)
- **Drag on handle** -> resize loop region (touchAction: none prevents scroll theft)
- **Pinch on waveform** -> zoom (passive touchmove, touch-action: pan-x prevents native pinch)
- **Desktop wheel** -> zoom (ctrl/meta) or pan (shift or bare horizontal)

On iOS, touch on the SVG inside scrollRef gets `touchAction: pan-x` from the scroll container. The browser handles horizontal pan as native scroll, firing `pointercancel` on the SVG. Seeks only work for taps (no horizontal movement). Handle drags work because handle divs have `touchAction: none`, preventing the browser from initiating scroll for that touch.

## Pinch-to-zoom touchmove handler

The pinch handler uses `{ passive: true }` and does NOT call `e.preventDefault()`. With `touch-action: pan-x` on the scroll container, the browser already prevents native pinch-zoom. Making the handler passive avoids blocking native scroll initiation on iOS.
