# Transport Micro-Fade (Anti-Click)

## Problem

Play, pause, stop, and seek all produce audible clicks from the waveform being cut at a non-zero-crossing point. The instantaneous jump from a sample value to silence (or vice versa) is a step function — a broadband click.

## Solution

2-3ms linear gain ramps on every transport transition. Standard approach used by all major DAWs (Pro Tools, Logic, Ableton, Reaper). Zero-crossing detection was considered and rejected — it adds unpredictable latency, fails on DC-offset audio, and waits too long on low-frequency content.

## Current State

- `_silenceAndStopSource()` does `disconnect()` then `stop()`. Disconnecting first prevents the worst pops, but the disconnect itself is still instantaneous — click from sudden silence.
- `seek()` while playing creates a new source at the new position then stops the old — step from old waveform position to new. Click.
- `play()` starts a source cold — first sample may be non-zero. Click.
- Track switch crossfade already handles this with temporary gain nodes.

## Implementation

Add `_fadeOut(callback)` and `_fadeIn()` helpers to `audioEngine.js`. ~2-3ms linear ramp on `_gainNode.gain`.

**Pause**: Capture position → ramp gain to 0 over ~2-3ms → in scheduled callback: disconnect/stop source, restore gain to `_volume`, set state to paused.

**Stop**: Ramp gain to 0 → disconnect/stop source, restore gain, reset position to loop start, set state to stopped.

**Play/Resume**: Set gain to 0 → start source → ramp gain to `_volume` over ~2-3ms.

**Seek while playing**: Ramp gain to 0 → swap sources at ramp end → ramp back up.

**Key detail**: Pause must capture `this.currentTime` BEFORE starting the fade-out, not after — the ~2-3ms fade window lets the position advance slightly.

`_silenceAndStopSource()` stays as the immediate-kill fallback for `loadBuffers()` and `destroy()`.

## Scope

~20-30 lines of changes in `src/audio/audioEngine.js`. No other files affected.

## File

`/Users/jjones/Documents/source/repos/Browser-ABX/src/audio/audioEngine.js`
