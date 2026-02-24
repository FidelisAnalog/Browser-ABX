# Safari Silent Audio Bug

## Symptom
Sometimes no audio is produced in Safari even though:
- The tab shows the audio indicator (speaker icon)
- The app reports playing state
- Transport controls work normally

This seems to happen when another tab has active AudioContexts.

## No clean repro yet.

## Investigation leads
- Safari may have a limit on concurrent AudioContexts across tabs, silently deprioritizing or routing output to nowhere.
- The probe AudioContext in `audioEngine.js` constructor (lines 29-31) is created and immediately closed to detect hardware sample rate. If `close()` is async and hasn't fully released resources, the real context created on line 34 might be affected.
- Check `engine._context.state` when the bug occurs — if it shows `'running'` but no audio, Safari is routing to nowhere. If `'suspended'`, the resume path isn't triggering.
- Related: Safari is more aggressive than Chrome/Firefox about AudioContext suspension policies when multiple tabs compete for audio.
