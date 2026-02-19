# Dev Notes

## Console Access

The audio engine is exposed on `window.__engine` for runtime tuning.

### Crossfade Duration

```js
__engine._crossfadeDuration = 0.005  // 5ms (default)
__engine._crossfadeDuration = 0.003  // 3ms
__engine._crossfadeDuration = 0.01   // 10ms
__engine._crossfadeDuration = 0.05   // 50ms
```

Crossfade uses linear gain ramps to suppress clicks when switching tracks.
Shorter durations reduce phase cancellation between correlated but time-offset
signals (e.g., different vinyl captures of the same source). Too short (<2ms)
risks audible clicks on low-frequency content. 5ms is a good compromise.
