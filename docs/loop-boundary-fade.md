# Loop Boundary Fade

## Problem

Web Audio API's `AudioBufferSourceNode.loop` does a hard sample-level splice from `loopEnd` back to `loopStart`. No interpolation, no fade, no smoothing. If the waveform values at those two points don't match, you get a click. The spec doesn't address this — confirmed via MDN, the W3C spec, and Web Audio WG issues (#267, #2072). Every app dealing with this (game audio, samplers, browser DAWs) handles it manually.

For blind listening tests, the problem is twofold:
1. **Click/pop at loop boundary** — audible discontinuity on every loop wrap.
2. **Different tracks click differently** — each track has different waveform values at the splice point, so one track may click while another doesn't (or clicks louder). This leaks track identity across trials, defeating the blind test.

## Options Evaluated

### 1. Manual loop management

Replace `loop: true` with JS-scheduled source swaps: stop the source at `loopEnd`, start a new one at `loopStart` with fade-out/fade-in.

**Rejected.** JS timing (`setTimeout`, `rAF`) has ~4–16ms jitter. Native `loop: true` is sample-accurate on the audio thread. Manual scheduling loses that precision, introduces timing drift over many iterations, breaks under browser tab throttling, and adds complexity to every operation that touches loop boundaries (seek, drag, track switch, play/pause/stop). Gain node contention between transport fades and loop fades would also require careful state management.

### 2. Zero-crossing alignment

Snap `loopStart` and `loopEnd` to zero crossings in the audio so the splice is seamless.

**Rejected.** Each track has different audio content. A zero crossing in track A at sample N is not a zero crossing in track B at sample N. Finding shared zero crossings across all tracks simultaneously is essentially impossible with real music. Even if found, the waveform slope (derivative) still differs, producing a discontinuity.

### 3. Per-sourceGain fade at loop boundary

Use the existing `sourceGain` node (which handles crossfade on track switches) to schedule gain dips around loop wrap points.

**Rejected.** `sourceGain` is already used for crossfade automation during track switches. If a track switch happens near a loop boundary, the two sets of automation events collide. `cancelScheduledValues` on one would nuke the other. Would require complex coordination between two independent concerns sharing one gain node.

### 4. Dedicated loopFadeGain node ← Implemented

Add a separate `GainNode` per source dedicated to loop boundary fades. Keep native `loop: true` for sample-accurate timing. Schedule gain dips on the audio thread — no JS timing dependency.

## Solution

### Modified audio graph

```
Before:  source → sourceGain → masterGain → destination
After:   source → loopFadeGain → sourceGain → masterGain → destination
```

- `sourceGain` — crossfade (track switch) and transport. Unchanged.
- `loopFadeGain` — loop boundary fades only. No contention with crossfade.

### How it works

1. Native `loop: true` handles the actual audio looping — sample-accurate, on the audio thread.
2. Wrap times are deterministic: first wrap at `contextStartTime + (loopEnd - playOffset)`, subsequent wraps every `loopEnd - loopStart` seconds.
3. For each wrap, 3 `AudioParam` automation events on `loopFadeGain`:
   - `setValueAtTime(1, wrapTime - 3ms)` — anchor at full gain
   - `linearRampToValueAtTime(0, wrapTime)` — fade out over 3ms
   - `linearRampToValueAtTime(1, wrapTime + 3ms)` — fade back in over 3ms
4. 100 wraps pre-scheduled upfront. All automation runs on the audio thread.
5. Lazy JS refill timer fires at wrap 90, schedules 100 more wraps from where the batch ended. Self-renewing — each batch sets the next timer. Not timing-critical: 10 wraps of runway remain when the timer fires.

### Why 100 wraps + lazy refill

The number of loops matters, not elapsed time. A 0.5s loop region × 100 wraps = 50 seconds. Someone rapidly switching tracks on a short loop can exhaust 100 wraps quickly. A lazy `setTimeout` refill timer fires at wrap 90 and appends another batch of 100. The timer has 10 wraps of margin (minimum 5 seconds at the shortest 500ms loop) — more than enough even under browser tab throttling. The timer is cancelled on any action that clears or reschedules fades (seek, loop drag, track switch, pause, stop).

### Cancel and reschedule

User actions that change wrap timing trigger `cancelScheduledValues` + reschedule:
- **Seek** — new source created, gets fresh fades via `_startSource()`
- **Loop region drag (in bounds)** — same source, cancel + reschedule from current position
- **Loop region drag (out of bounds)** — new source created, gets fresh fades
- **Track switch (instant or crossfade)** — new source from ready pool, fades scheduled on its own `loopFadeGain`

No interaction with crossfade automation — they're on separate gain nodes.

### Fade parameters

- `_loopFadeDuration = 0.003` (3ms) — same as transport micro-fade, independently tunable
- `_loopFadeCount = 100` — wraps to pre-schedule per batch
- `_loopFadeRefillAt = 90` — refill timer fires after this many wraps
- Linear ramps, not equal-power. Equal-power crossfades cause audible boost in practice due to phase difference between the two sides of the fade.
- Guard: if loop duration < 9ms (3× fade duration), skip fades entirely. Purely defensive.

### What the fade sounds like

6ms of near-silence at every loop boundary (3ms down + 3ms up). Inaudible with music content — the ear integrates over longer windows. Critically, it sounds identical for every track, so it cannot leak which track is which.

## Transport state summary (post-implementation)

- Transport controls (play/pause/stop) — clean, 3ms micro-fades on `_gainNode` ✓
- Single-click seek while playing — clean, fade-out then fade-in ✓
- Loop region drag, playhead in bounds — clean, loop fades rescheduled ✓
- Loop region drag, playhead out of bounds — faded swap, rapid events discarded ✓
- **Native loop wrap — clean, 3ms fade-out/fade-in on `loopFadeGain` ✓**
- End cursor drag backward through playhead — improved (faded swap + loop fades) ✓
- Track switch at loop boundary — no contention (separate gain nodes) ✓

## Implementation

**Commit:** `0ba46a7` (PR #14)
**File:** `src/audio/audioEngine.js`

### New methods
- `_scheduleLoopFades(loopFadeGain, playOffset, contextStartTime)` — calculates wrap times, schedules 100 × 3 automation events
- `_clearLoopFades()` — cancels all scheduled loop fades on active source, resets to gain 1

### Modified methods
- `_prepareSource()` — creates `loopFadeGain` in the chain
- `_startSource()` — creates `loopFadeGain`, schedules loop fades
- `selectTrack()` — schedules loop fades on new source (both instant and crossfade paths)
- `setLoopRegion()` — reschedules loop fades when in bounds; captures `oldLoopFadeGain` for cleanup when out of bounds
- `seek()` — captures `oldLoopFadeGain` for cleanup
- `_silenceAndStopSource()` — disconnects `loopFadeGain`
- `_destroyReadySources()` — disconnects `loopFadeGain` per ready source
