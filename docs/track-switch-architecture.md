# Track Switch Architecture

## Problem

Switching between audio tracks (A/B) during playback produces clicks, pops, and level dips. The Web Audio API's `AudioBufferSourceNode` operations interact with the audio rendering thread in ways that make glitch-free switching non-trivial.

## Root Causes Identified

### 1. Graph mutations during switch

`disconnect()` and `connect()` are **immediate graph mutations** — the audio thread sees them at the next render quantum boundary. `start()` and `stop()` are **scheduled operations** — they queue for processing at a specified time.

When graph mutations (creating nodes, connecting/disconnecting) occur in the same JS block as start/stop, the audio thread may process them at different quantum boundaries. A render quantum at 96kHz is 128 samples (1.333ms). If a quantum boundary falls between the graph mutation and the start/stop, the listener hears a gap (silence) or doubling (both sources playing).

### 2. Rerouting live sources

The original per-source gain implementation (before pre-created sources) rerouted live audio through different gain nodes during crossfade. Any `disconnect()` → `connect()` sequence on a playing source risks a render quantum of silence between the two operations.

### 3. On-demand node creation

Creating `AudioBufferSourceNode` and `GainNode` during the switch adds JS execution time between scheduling the ramps and starting the source. The audio thread continues rendering during this time, so ramps begin before the new source produces audio — causing a level dip proportional to the delay (measured at 2–3 render quanta = -6dB to -14dB).

## Solution: Pre-created Ready Sources

Matches the pattern used by jaakkopasanen/ABX (the original project this was forked from).

### Architecture

```
Ready (not started):   source → sourceGain(1) → masterGain → destination
Active (playing):      source → sourceGain(1) → masterGain → destination
```

At `loadBuffers` time, a source + gain node pair is pre-created and connected for every track. These sit in the graph producing silence (not started). At switch time, the only operations are `start()`, `stop()`, and gain automation — zero graph mutations.

### Instant switch (crossfade off)

```js
ready.source.start(switchAt, switchPos);
oldSource.stop(switchAt);
```

Both scheduled at the same future time. The audio thread processes them atomically at the same quantum boundary. No graph mutations, no possible split.

### Crossfade switch

```js
// All at the same future timestamp (startAt)
oldSourceGain.gain.setValueAtTime(1, startAt);
oldSourceGain.gain.linearRampToValueAtTime(0, startAt + dur);
ready.sourceGain.gain.setValueAtTime(0, startAt);
ready.sourceGain.gain.linearRampToValueAtTime(1, startAt + dur);
ready.source.start(startAt, switchPos);
```

All gain ramps and source start share the same timestamp. Audio thread processes them at the same quantum.

### Lookahead scheduling

Operations are scheduled at `context.currentTime + 5ms` rather than at `context.currentTime`. Since `context.currentTime` reflects the **start of the last rendered quantum**, scheduling at "now" risks the audio thread having already advanced past that time. A 5ms lookahead (3–4 quanta at 96kHz) guarantees the audio thread hasn't reached the target time, so all operations queued at that time are processed together. 5ms latency is imperceptible (human threshold ~10–20ms).

The playback position is adjusted by the lookahead to account for where the source will actually be when the switch takes effect.

### Lifecycle

1. **`loadBuffers`** — `_prepareAllSources()`: create source+gain for each track, connect to graph
2. **Switch** — consume the ready source (start it), stop the old one
3. **After switch** — deferred `setTimeout(0)`: disconnect old nodes, `_prepareSource()` replacement for the consumed track
4. **`setLoopRegion`** — update `loopStart`/`loopEnd` on all ready sources
5. **`_silenceAndStopSource`** (pause/stop) — re-prepare ready source for the stopped track
6. **`destroy`** — `_destroyReadySources()`: disconnect all

Graph mutations (prepare replacement, disconnect old) are always deferred to a separate JS task via `setTimeout(0)`, so they cannot share a render quantum with the switch's start/stop.

### Fallback

If no ready source is available (e.g., consumed by crossfade before replacement was prepared), `_startSource()` creates nodes on the fly. This may produce minor artifacts but is a rare edge case.

## Diagnostic Investigation

### What the diagnostic logging ruled out

Added structured logging to every crossfade and instant switch (sequence number, gap between switches, cleanup timing, preemption flags, fallback flags). Results with 1kHz test signal:

- **No preempted cleanups** — all cleanups fire normally at ~21ms
- **No missing ready sources** — never hits fallback path
- **No timing anomalies** — gaps are 400-550ms (normal human clicking), cleanups consistently 21-22ms
- **Clicks happen during completely normal operations** — ~75% of crossfade switches tick with identical content

A tautological position-delta calculation (Δ) was also added but proved useless — both old and new source positions are derived from the same stale `context.currentTime`, so the delta is always 0 by construction. It cannot reveal the actual audio-thread-level position mismatch.

### Crossfade duration test

Changed `_crossfadeDuration` via console from 5ms to 50ms. **The tick sounds identical.** This rules out any overlap/phase theory — if the tick were caused by phase interference during the crossfade window, a 10× longer crossfade would produce a very different sound (a dip, not a click).

**Conclusion: the tick is a discrete event at the transition point, not an artefact of the ramp duration.**

### Music content testing

Created test content to isolate the tick from vinyl artefacts:

- **`Don't-Know-Why_DC_Orig.wav`** — clean digital source (88.2kHz/24bit), de-clicked
- **`Don't-Know-Why_DC_Wow.wav`** — same file with induced wow matching the real vinyl rip characteristics (0.55Hz, 0.15ms peak — measured via cross-correlation of the actual vinyl rips NJ_A/NJ_B)

Test configs:
- `digital-baseline.yml` — identical clean digital for A and B
- `wow-test.yml` — original vs wow'd copy
- `crossfade-test.yml` — identical 1kHz sine (original diagnostic)

Results:

| Test | Crossfade off | Crossfade on |
|------|--------------|-------------|
| 1kHz sine (identical) | Perfect | Tick ~75% of switches |
| Digital baseline (identical music) | Perfect | No audible tick |
| Wow test (timing-shifted music) | Discontinuities (expected) | Rare tick, correlates with underlying discontinuities |

**Key insight**: the tick is only audible when there's a discontinuity in the source content at the crossfade point. With identical content there's no discontinuity to leak through, so even though the tick exists in the gain envelope, it's inaudible with music. With wow-induced timing differences, the crossfade is supposed to mask the discontinuity but a brief gain-sum dip lets it partially through.

### Vinyl rip timing analysis

Cross-correlation of NJ_A.flac vs NJ_B.flac (SP-10 MK3 turntable):

- Wow frequency: ~0.55 Hz
- Peak-to-peak displacement: ~0.22ms
- Per-pass W&F (unweighted): ~0.019% RMS — consistent with turntable spec of 0.015% JIS
- Total drift over 90s: negligible (~0.02ms)

### Root cause found: gain.value leakage

Ready sources are created with `sourceGain.gain.value = 1`. The crossfade schedules `setValueAtTime(0, startAt)` but before that automation event takes effect, the AudioParam's intrinsic value is 1. If there's even a single-sample window where the source has started but the automation hasn't applied, one sample passes through at full gain instead of 0.

**Fix (confirmed)**: set `ready.sourceGain.gain.value = 0` immediately before scheduling automation, so the intrinsic value is 0 regardless of automation timing.

Post-fix results:
- 1kHz sine (identical): 4 tests, zero ticks (was ~75% tick rate)
- Digital baseline (identical music): 2 tests, no artefacts
- Wow test (timing-shifted music): 2 tests, no confirmed ticks

## Key Learnings

1. **`disconnect()` is immediate; `start()`/`stop()` are scheduled.** Never mix immediate graph mutations with scheduled operations in the same timing-critical path.

2. **`context.currentTime` is stale.** It reflects the last rendered quantum, not the current audio thread position. Schedule in the future to guarantee atomicity.

3. **Pre-create and pre-connect.** The original jaakkopasanen/ABX project pre-creates all source nodes at init. At switch time it only calls `start()` and `stop()`. This is why it works — zero graph mutations during the switch.

4. **Linear crossfade of identical signals sums to unity only if perfectly phase-aligned.** Any position mismatch between old and new source causes comb filtering during the crossfade. The position mismatch comes from `context.currentTime` quantization (up to 1 render quantum of error).

5. **Defer graph mutations.** Even "silent" operations (disconnecting stopped sources, connecting not-yet-started sources) should be deferred to a separate JS task to avoid any interaction with scheduled audio operations.

6. **Test with realistic content, not just synthetic.** A 1kHz sine exposes artefacts that are inaudible with music. Conversely, music with timing differences (wow) exposes crossfade gain issues that identical content hides. Both test types are needed.

7. **AudioParam `.value` vs automation timeline.** Setting automation events at a future time doesn't change the `.value` property. The intrinsic value persists until the first scheduled event takes effect. For gain nodes that must be silent before a future ramp begins, explicitly set `.value = 0`.

## Files

- `src/audio/audioEngine.js` — all switch/crossfade logic and diagnostic logging
- `src/audio/audioLoader.js` — AudioBuffer creation (unchanged)
- `src/components/TestRunner.jsx` — calls `selectTrack()` (unchanged)
- `docs/track-switch-architecture.md` — this file

## Test content

- `public/test-audio/sine-1k-96k.wav` — 1kHz sine, 96kHz
- `public/test-audio/Don't-Know-Why_DC_Orig.wav` — clean digital music, 88.2kHz/24bit
- `public/test-audio/Don't-Know-Why_DC_Wow.wav` — same with 0.55Hz/0.15ms wow applied
- `public/test-audio/NJ_A.flac`, `NJ_B.flac` — real vinyl rips (SP-10 MK3)
- `public/crossfade-test.yml`, `digital-baseline.yml`, `wow-test.yml` — test configs

## Tags

- `pre-buffer-reuse` (a8266ca) — cleanest playback before ready sources
- `pre-cleanup-centralization` (115148a) — buffer reuse, HEAD of main work
- `pre-lookahead` (dfad9ab) — ready sources + deferred mutations, before lookahead

## Reference

- Original project: [jaakkopasanen/ABX](https://github.com/jaakkopasanen/ABX) — `src/ABTest.js` lines 33–101
- Web Audio spec: [AudioBufferSourceNode](https://webaudio.github.io/web-audio-api/#AudioBufferSourceNode) — render quantum is always 128 samples
- Render quantum: 128 samples / sampleRate. At 96kHz = 1.333ms, at 48kHz = 2.667ms
