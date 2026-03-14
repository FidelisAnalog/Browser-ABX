# Release Notes

## 2026-03-13

- Fixed Chrome Android blue highlight on waveform touch
- Fixed iOS vertical scroll blocked by waveform touch
- Narrowed loop handle hit zones for mouse while preserving full touch area
- Widened overview bar viewport edge handles from 6px to 20px for touch
- Fixed iOS magnifier/Find dialog appearing on handle drag
- Fixed overview bar viewport snap to far right on finger lift
- Removed all diagnostic/debug code from waveform components
- Extracted shared waveform constants and helpers to generateWaveform.js
- Removed dead code (generateWaveformData, extractChannel0)
- Moved loop dim color to theme palette
- Memoized OverviewBar event handlers
- Fixed overview gesture end ordering
- Added debounce to touch pinch gesture end timing
- Added touchAction:none to outer waveform container
- Consolidated 3 requestAnimationFrame loops into a single coordinator
- Replaced 3 boolean gesture ref flags with single enum state machine
- Added click-and-drag to pan on main waveform (mouse only)
- Removed double-click to reset zoom
- Added zoom control disabled states
- Fixed zoom out tooltip showing literal \u2212 instead of minus sign

## 2026-03-12

- Added Safari audio cleanup guidance for embedders
- Added latency debug logging for Safari iframe investigation

## 2026-03-11

- Added loop boundary fade to eliminate clicks at native loop splice points
- Added lazy refill timer for loop boundary fades

## 2026-03-10

- Updated embedded min-height from 700px to 755px
- Removed deprecated DEV-NOTES.md
- Updated docs to reflect current codebase
- Changed theme toggle shortcut to Ctrl+Shift+T
- Added iframe resize handling to embed-test.html
- Added per-theme confidence palette (sure=bright, guessing=dark)
- Added progress and confidence palette groups for progress bar colors
- Extracted shared building blocks, refactored test components, merged ABX+ABXY (Phase 6b)

## 2026-03-09

- Fixed blank white page after Start (uiPropsRef race condition)
- Extracted per-type logic into plugin modules, made useTestFlow generic (Phase 6a)
- Fixed loading/started event ordering in embedded mode
- Decomposed TestRunner into useAudioEngine + useTestFlow + useAppEvents + TestSession (Phase 5b)

## 2026-03-08

- Added Layout wrapper and branding rules engine (Phase 5)

## 2026-03-07

- Added isCorrect to acidtest:progress postMessage event
- Changed license from MIT to CPAL-1.0

## 2026-03-06

- Moved commitment data from React ref to module-level variable

## 2026-03-05

- Added SHA-256 anti-cheat commitment to all test types
- Extracted config loading into useConfig hook
- Added SHA-256 commitment utility for anti-cheat answer verification
- Flushed audio pipeline with silence on pagehide for Safari
- Prevented bfcache to fix cross-session audio bleed
- Restored loading spinner for embedded skipWelcome flow
- Removed Container gutters when embedded for better mobile width
- Fixed audio bleed across page navigations
- Removed minHeight: 100vh from test components
- Fixed embedded iframe gap by using min-height instead of height

## 2026-03-04

- Renamed project to acidtest.io and updated links
- Decoupled embed, postMessage, and branding concerns
- Added "powered by acidtest.io" footer in embed mode
- Added preview branch to deploy workflow
- Renamed postMessage prefix from dbt: to acidtest:
- Rebranded landing page from DBT to acidtest.io
- Added self-contained share URLs and heard-tracks hook
- Added dark mode with system detection and embed theme control

## 2026-03-03

- Added iframe embed support via postMessage

## 2026-03-01

- Added staircase familiarization phase, stopped remounting per trial
- Fixed staircase defaults, plot orientation, and interpretation text

## 2026-02-28

- Added response timing stats and share URL version byte
- Fixed back-nav over handle hit areas, always consume horizontal wheel
- Fixed iOS scroll regressions: handle clamping, feedback loop, page width
- Fixed iOS native scroll: attach handler on mount, prevent feedback loop

## 2026-02-22

- Fixed overflow on waveform container during zoom
- Added waveform zoom, pan, and overview bar
- Added fade-swap on loop region drag when playhead is out of bounds
- Added transport micro-fade

## 2026-02-21

- Added ABXY test type
- Added 2AFC-SD (same-different) test type
- Centralized test type logic into registry
- Detected duplicate option names and added async effect cleanup

## 2026-02-20

- Added confidence breakdown tables
- Added keyboard hotkeys for test screens
- Changed to no track pre-selected on iteration start, click-to-play
- Ignored waveform clicks outside loop region
- Fixed ABX confusion matrix A/B transposition

## 2026-02-19

- Added Triangle/Triangle+C test types
- Added ABX+C test type, results page redesign, share improvements
- Added cache: no-store to audio fetch for iOS Chrome compatibility
- Fixed crossfade timing, gap, and click artifacts
- Replaced ducking with crossfade on track switch
- Shuffled options once per test, persisted for all iterations
- Fixed waveform width flash by deferring render until measured
- Eliminated drag pops: re-anchor instead of recreating source when in bounds
- Refactored cursor handles from SVG hit rects to HTML divs with Pointer Events
- Added touch support for cursor dragging (iPad/mobile)
- Added bracket buttons: [ ] to set ±2s loop around playhead, ] [ to reset
- Added jump-back button
- Enforced 0.5s minimum loop duration between cursors
- Fixed loop cursor behavior: coupled movement and playhead coherence

## 2026-02-18

- Fixed audio pops on seek while paused and stop while paused
- Refactored AudioEngine as external store with selective subscriptions
- Fixed ABX p-value: use one-tailed binomial test instead of raw PMF
- Fixed audio engine lifecycle: waveform, track switching, seek, and multi-round playback
- Initial implementation of Browser ABX listening test app
