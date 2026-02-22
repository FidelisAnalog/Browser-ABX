# Loop Boundary Fade — Analysis

## Problem

Web Audio API's `AudioBufferSourceNode.loop` does a hard sample-level splice from `loopEnd` back to `loopStart`. No interpolation, no fade, no smoothing. If the waveform values at those two points don't match, you get a click. The spec doesn't address this — confirmed via MDN, the W3C spec, and Web Audio WG issues (#267, #2072). Every app dealing with this (game audio, samplers, browser DAWs) handles it manually.

The click is usually minor during normal playback (depends on waveform at loop points), but becomes severe during loop region drag — the end cursor pushing past the playhead forces rapid source swaps, each with a hard cut.

## Current State (post micro-fade commit)

- Transport controls (play/pause/stop) — clean, 3ms fades ✓
- Single-click seek while playing — clean, fade-out then fade-in with no gain restore between ✓
- Loop region drag, playhead in bounds — clean, no source recreation needed ✓
- Loop region drag, playhead out of bounds — faded swap, rapid events discarded during in-flight fade ✓
- Native loop wrap (playback reaches loopEnd naturally) — **hard cut, no fade**
- End cursor drag backward through playhead — **clicky**, rapid out-of-bounds swaps + native loop wraps compound

## Proposed Fix: Manual Loop Management

Replace `loop: true` with manual loop scheduling:

1. Start source with `loop: false`, playing from `loopStart`
2. Schedule `source.stop()` at the context time when playback reaches `loopEnd`
3. ~3ms before stop: ramp gain to 0
4. At `loopEnd`: start new source at `loopStart` with gain at 0, ramp to volume
5. Repeat — each iteration schedules the next

### Known Negatives

- **Timing precision**: `setTimeout` has ~4ms minimum resolution and jitter. rAF runs at ~16ms. Neither is sample-accurate. Web Audio's native loop is sample-accurate on the audio thread. Manual scheduling means the loop point may drift by a few ms each iteration.

- **6ms silence at every loop point**: 3ms fade-out + 3ms fade-in. Probably inaudible for listening tests, but not present with the native loop.

- **Complexity**: Every operation that currently just sets `loopStart`/`loopEnd` properties on the source now must also recalculate and reschedule the loop swap timer. Affects `setLoopRegion` (drag), `seek`, `selectTrack`, `play`/`pause`/`stop`.

- **Gain node contention**: Transport micro-fades and loop-boundary fades share `_gainNode`. If pause or seek happens near a loop boundary, two fades collide. Needs careful state management.

- **Short loops**: If `loopEnd - loopStart` < ~10ms, the fade-out for the next iteration starts before the fade-in from the previous one finishes. Loops shorter than the fade cycle break entirely.

### Possible Negatives

- Timing drift may compound over many loop iterations — accumulated error vs. what the audio thread would have done.
- Browser tab throttling (background tabs) delays `setTimeout` significantly — loops could break when tab isn't focused.
- Rapid loop region changes during the scheduling window could leave orphaned sources playing.

## Decision

TBD — needs evaluation of whether the loop-point click during normal playback is bad enough to justify the complexity and timing trade-offs. The drag-while-playing static is already improved by the discard-during-fade approach.

## File

`/Users/jjones/Documents/source/repos/Browser-ABX/src/audio/audioEngine.js`
