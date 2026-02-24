# Safari Silent Audio Bug

## Symptom
Sometimes no audio is produced in Safari even though:
- The tab shows the audio indicator (speaker icon)
- The app reports playing state
- Transport controls work normally

This seems to happen when another tab has active AudioContexts.

## Confirmed behavior (2026-02-24)

Debugged live on macOS Safari. All of the following were verified in the console:

- `__engine._context.state` = `"running"`
- `__engine._context.sampleRate` = 96000
- `__engine._gainNode.gain.value` = 0.5
- `__engine._activeSource !== null` = true
- `__engine._activeSourceDest === __engine._gainNode` = true
- `__engine._activeSource.buffer.duration` = 97.1s (valid buffer)
- `__engine._hardwareRate` = 96000

**Safari reports everything as healthy. It lies.**

### Scope: all Web Audio API output is blocked

- Creating a **fresh AudioContext** with rebuilt buffers: silent
- Creating a **standalone AudioContext + OscillatorNode** (no connection to our app): silent
- **HTML media elements work fine** — YouTube, Facebook audio plays normally
- This is not our code. Safari is blocking the entire Web Audio API output path system-wide.

### Other observations
- Every tab in Safari shows the speaker icon, even plain pages with no AudioContext (separate UI quirk)
- The silent state persists until Safari is quit and reopened

### Ruled out
- Not caused by our probe AudioContext (`audioEngine.js` lines 29-31) — fresh contexts are equally silent
- Not a sample rate mismatch — hardware and context both report 96000
- Not a gain/connection issue — graph verified source → gainNode → destination
- Not a buffer issue — buffer has valid duration and non-zero sample data
- Not autoplay policy — context state is "running"

## Recovery findings (2026-02-24)

While the original engine context was in zombie state ("running" but silent):
- Creating a new AudioContext at 44100 Hz → reported "suspended" (honest)
- Resuming it from a user gesture (click handler) → state changed to "running" **and produced sound**
- Could not test 96000 Hz separately because audio recovered before we could test
- Audio recovered after manually `.close()`ing several test contexts from the console, then refreshing — unclear exactly which action cleared the state

### Key insight: zombie context
The zombie context reports "running" but produces no output. New contexts created alongside it are either:
- Honestly "suspended" (can be resumed and may work after zombie is closed)
- Also zombie (silent "running")

## Known fixes
- Quit Safari (Cmd+Q) and reopen — reliably clears the state
- Page refresh alone does NOT reliably fix it (hard refresh didn't help during initial testing)
- During debugging, audio recovered after we manually `.close()`d several zombie test contexts from the console, then refreshed — unclear which action actually cleared the state

## Workarounds that DON'T work
- `navigator.audioSession.type = "playback"` — no effect while zombie is active
- Silent `<audio>` element loop — doesn't unlock Web Audio output
- Creating fresh AudioContext from console (without closing zombie) — also silent
- Rebuilding buffers in a new context (without closing zombie) — also silent

## Detection challenge
- All Web Audio API introspection reports correct/healthy values
- `context.state`, gain values, node connections, buffer data — all look fine
- No known API to detect that Safari is silently routing output to nowhere
- Potential approach: AnalyserNode monitoring (needs testing during repro — does it see non-zero data when output is blocked, or also zeros?)

## Potential fix: context recovery in the engine
If we can detect the zombie state, the engine could:
1. Close the zombie context
2. Recreate the context on the next user gesture (track button click already provides this)
3. Rebuild the gain chain and re-wrap existing buffer data into new AudioBuffers

The `selectTrack()` method already calls `resumeContext()` — this could be extended to also handle context recreation.

**Open question:** how to reliably detect the zombie state when all APIs report healthy values.

## Further research
- WebKit Bug #237322: Web Audio muted when iOS ringer muted — related audio session routing
- WebKit Bug #215270: No audio with WebRTC in multiple tabs — related concurrent context issue
- WebAudio/web-audio-api#2585: Safari non-standard "interrupted" state
- File a WebKit bug for this specific symptom (running + silent + system-wide)
