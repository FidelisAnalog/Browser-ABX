# Release Notes

## 2026-03-13

- Fixed zoom out tooltip showing literal \u2212 instead of minus sign
- Added zoom control disabled states
- Removed double-click to reset zoom
- Added click-and-drag to pan on main waveform (mouse only)
- Replaced 3 boolean gesture ref flags with single enum state machine
- Consolidated 3 requestAnimationFrame loops into a single coordinator
- Added touchAction:none to outer waveform container
- Added debounce to touch pinch gesture end timing
- Fixed overview gesture end ordering
- Memoized OverviewBar event handlers
- Moved loop dim color to theme palette
- Removed dead code (generateWaveformData, extractChannel0)
- Extracted shared waveform constants and helpers to generateWaveform.js
- Removed all diagnostic/debug code from waveform components
- Fixed overview bar viewport snap to far right on finger lift
- Fixed iOS magnifier/Find dialog appearing on handle drag
- Widened overview bar viewport edge handles from 6px to 20px for touch
- Narrowed loop handle hit zones for mouse while preserving full touch area
- Fixed iOS vertical scroll blocked by waveform touch
- Fixed Chrome Android blue highlight on waveform touch

## 2026-03-12

- Added Safari audio cleanup guidance for embedders

## 2026-03-11

- Added lazy refill timer for loop boundary fades
- Added loop boundary fade to eliminate clicks at native loop splice points

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

## 2026-03-06

- Moved commitment data from React ref to module-level variable

## 2026-03-05

- Added SHA-256 anti-cheat commitment to all test types
- Extracted config loading into useConfig hook
- Added SHA-256 commitment utility for anti-cheat answer verification
- Flushed audio pipeline with silence on pagehide (Safari)
- Prevented bfcache to fix cross-session audio bleed (Chrome; Safari ignores this)
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
- Added native scroll container for iOS touch momentum on main waveform
- Added click-and-drag viewport in overview bar
- Added overview loop region highlight and native trackpad pan with momentum

## 2026-02-27

- Added lookahead scheduling and crossfade gain.value fix for click-free switching

## 2026-02-25

- Reused AudioBuffers across iterations instead of reallocating

## 2026-02-24

- Renamed project to DBT with dynamic page titles
- Added 2AFC adaptive staircase test type for JND determination
- Fixed audio click on trial submit by respecting in-flight micro fade
- Fixed Safari trackpad pinch zoom exponential acceleration
- Code review fixes: statistics, validation, and hardening

## 2026-02-23

- Fixed Shift+ArrowLeft firing both pan and jump back
- Fixed seek during playback: update engine position immediately
- Overview bar UX improvements and waveform drag-to-pan
- Added playhead indicator to overview bar
- Added playhead follow mode (iZotope RX-style)

## 2026-02-22

- Fixed overflow on waveform container during zoom
- Added waveform zoom, pan, and overview bar
- Added fade-swap on loop region drag when playhead is out of bounds
- Added transport micro-fade

## 2026-02-21

- Detected duplicate option names and added async effect cleanup
- Fixed sample rate display
- Added tooltips to response breakdown headers
- Added ABXY test type
- Added 2AFC-SD (same-different) test type
- Centralized test type logic into registry

## 2026-02-20

- Added confidence breakdown tables
- Added keyboard hotkeys for test screens
- Changed to no track pre-selected on iteration start, click-to-play
- Ignored waveform clicks outside loop region
- Fixed ABX confusion matrix A/B transposition

## 2026-02-19

- Added Triangle/Triangle+C test types
- Added ABX+C test type, results page redesign, share improvements
- Added ABX iteration progress bar
- Widened layout, taller waveform
- Fixed ABX submit button not resetting when X is selected
- Added cache: no-store to audio fetch for iOS Chrome compatibility
- Fixed share URL encoding (URL-safe base64, double encoding, filter bug)
- Replaced ducking with crossfade on track switch
- Fixed crossfade timing, gap, and click artifacts
- Shuffled options once per test, persisted for all iterations
- Reshuffled AB preference test option order every iteration
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
- Persisted loop region across iterations
- Fixed ABX p-value: use one-tailed binomial test instead of raw PMF
- Fixed audio engine lifecycle: waveform, track switching, seek, and multi-round playback
- Initial implementation of Browser ABX listening test app
