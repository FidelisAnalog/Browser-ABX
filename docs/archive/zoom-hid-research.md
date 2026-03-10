# Waveform Zoom HID Research

How browser-based audio/waveform tools handle zoom and pan input across desktop mouse, trackpad, and touch devices.

## Tools Investigated

### Wavesurfer.js
- **Zoom**: Scroll wheel — zoom plugin listens to `wheel` events, calls `preventDefault()` unconditionally. No modifier key check.
- **Pinch-to-zoom**: Added v7.11.1 via touch events with `preventDefault()` when pinch active.
- **Pan**: Native CSS `overflow-x: scroll` on container. No built-in drag-to-pan.
- **Scroll hijacking**: **Persistent documented problem.** Issues #649, #3348 — all vertical scroll over the waveform is captured.
- **Mobile bugs**: Critical — two-finger pinch on mobile Chrome locks all page interactions, requiring refresh (issues #3833, #4020).
- **Minimap**: Yes — Minimap plugin renders overview waveform as scrollbar.
- **Verdict**: Cautionary tale. Do not use unconditional scroll capture.

### Peaks.js (BBC)
- **Zoom**: Disabled by default (`wheelMode: 'none'`). Opt-in via `setWheelMode('scroll')`.
- **When enabled**: `captureVerticalScroll: false` (default) requires Shift+scroll for horizontal scrolling. Without Shift, vertical scroll passes through.
- **Zoom levels**: Pre-defined discrete steps, not continuous.
- **Pan**: Horizontal trackpad gesture scrolls waveform. Vertical scrolls page. Click-and-drag available.
- **Scroll hijacking**: Much better — default is no capture.
- **Minimap**: Yes — "overview" waveform view alongside zoomable view.
- **Verdict**: Most thoughtful interaction model among browser waveform libraries.

### Soundtrap (Spotify)
- **Zoom**: Ctrl+scroll (Win) / Cmd+scroll (Mac). Trackpad pinch works via ctrlKey trick.
- **Pan**: Shift+scroll for horizontal timeline scroll. Plain scroll = vertical track list scroll.
- **No plain scroll-wheel zoom** — plain scroll scrolls the page.
- **Touch**: Tablet mode after reload. Mobile app has touch-optimized controls.
- **Scroll hijacking**: None — Ctrl modifier gating.
- **Minimap**: No — uses horizontal scrollbar + grid-size controls.
- **Verdict**: Clean implementation of modifier-key gating.

### BandLab
- **Zoom**: Ctrl/Cmd + scroll wheel (web). Trackpad pinch via ctrlKey trick. +/- buttons.
- **Mobile app**: Pinch-to-zoom up to 8x. Double-tap with two fingers resets.
- **Pan**: Horizontal scrollbar. Mobile: tap-and-hold then drag.
- **Scroll hijacking**: None — Ctrl modifier pattern.
- **Minimap**: Not documented.

### Audacity (Desktop)
- **Zoom**: Ctrl+scroll (Win) / Cmd+Ctrl+scroll (Mac). Toolbar buttons. Keyboard: Ctrl+1/2/3, Ctrl+E (zoom to selection), Ctrl+F (fit to width), Shift+Z (zoom toggle).
- **Pan**: Shift+scroll for horizontal. Page Up/Down. Horizontal scrollbar.
- **Scroll hijacking**: N/A (desktop app).
- **Minimap**: No — uses scrollbar + zoom-to-fit.

### iZotope RX (Desktop)
- **Zoom**: Mouse wheel over rulers (time/frequency/amplitude). Keyboard arrows. Zoom sliders. Zoom tool (drag selection = zoom to fit). Double-click ruler = reset.
- **Pan**: Grab & Drag tool (shortcut G). Click-drag on rulers. Page Up/Down.
- **Spatial gating**: Scroll over ruler = zoom, scroll elsewhere = no capture. Only works in full-window apps.
- **Overview bar**: Prominent feature. Full waveform at top, highlighted viewport region. Drag region to pan. Drag edges to zoom. Double-click to zoom out fully.
- **Verdict**: Gold standard for overview bar UX.

### SoundCloud
- **No zoom at all.** Fixed-scale waveform shows entire track. Click/tap to seek, drag to scrub.

## The ctrlKey Trick — Critical Finding

When users pinch-to-zoom on a trackpad (MacBook, Windows precision touchpad), Chrome, Firefox, and Edge emit synthetic `WheelEvent` objects with `ctrlKey: true`. The `deltaY` holds the scale delta.

This means checking `e.ctrlKey || e.metaKey` on wheel events gives:
1. **Ctrl + mouse scroll wheel** = zoom (explicit user intent)
2. **Trackpad pinch** = zoom (natural gesture, automatically generates ctrlKey)

Plain scroll-wheel events (no Ctrl) do NOT have `ctrlKey: true`, so they pass through to the page.

**Safari exception**: Safari does NOT use the ctrlKey trick. It fires proprietary `GestureEvent` with `scale` and `rotation` properties. Need separate `gesturestart`/`gesturechange`/`gestureend` handlers.

**Must use `{ passive: false }`** on the wheel event listener — Chrome defaults wheel listeners to passive, and `preventDefault()` is silently ignored in passive listeners.

```javascript
waveformElement.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const zoomDelta = -e.deltaY;
    applyZoom(zoomDelta, e.clientX);
  }
  // No modifier → do nothing, page scrolls normally
}, { passive: false });

// Safari fallback
waveformElement.addEventListener('gesturechange', (e) => {
  e.preventDefault();
  applyZoom(e.scale, e.clientX);
});
```

This is the pattern used by Soundtrap, BandLab, Google Maps cooperative mode.

## Touch Devices

- **`touch-action: pan-x pan-y`** on waveform container — disables browser pinch-zoom while allowing scroll. Frees pinch for custom zoom handler.
- **iOS Safari limitation**: Only supports `touch-action: auto` and `touch-action: manipulation`. More granular values have limited support. Always provide button fallbacks.
- **`touch-action: none`** — AVOID. Breaks all native scrolling past the element. Mobile Chrome lockup bugs.
- **Drag-to-pan vs tap-to-seek**: Genuine conflict. Options: (1) buttons + scrollbar for pan, tap for seek; (2) two-finger pan, one-finger tap; (3) mode toggle.

## Settled Interaction Matrix

| Action | Desktop Mouse | Desktop Trackpad | Touch Device |
|--------|--------------|-----------------|--------------|
| Zoom | Ctrl/Cmd + scroll | Pinch (auto ctrlKey) | +/- buttons; pinch with touch-action |
| Pan | Shift + scroll, overview bar | Two-finger horizontal, overview bar | Horizontal swipe, overview bar |
| Page scroll | Scroll (no modifier) | Two-finger vertical | Vertical swipe |
| Seek | Click | Click | Tap |
| Reset zoom | Double-click, `0` key | Double-click, `0` key | Double-tap |

## What to Avoid

- Unconditional scroll capture (wavesurfer.js) — user complaints guaranteed
- `touch-action: none` on large elements — mobile Chrome lockup
- Conflating drag-to-pan with tap-to-seek on touch
- Mouse wheel vs trackpad detection heuristics — browsers make these indistinguishable
- Relying on `touch-action: pan-x pan-y` on iOS Safari — limited support

## Sources

- Wavesurfer.js: Issues #649, #3348, #3389, #3833, #4020, #4141, #3102
- Peaks.js: Issue #271, API docs
- Soundtrap keyboard shortcuts docs
- BandLab Studio shortcuts docs
- Audacity manual: Zooming, Mouse Preferences, View Menu
- iZotope RX 9: Interactive Tools, Keyboard Shortcut Guide, Spectrogram Display
- Google Maps cooperative gesture handling docs
- Chromium ctrlKey pinch discussion (chromium-dev group)
- Dan Burzo — "DOM Gestures: Scalable Interactions"
- Mappedin — "Why Panning and Zooming in a Web App Can't Be Perfect"
