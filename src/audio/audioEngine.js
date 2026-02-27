/**
 * Audio engine — manages AudioContext, playback, transport controls, track switching,
 * loop region, seeking, crossfade, volume persistence, and playhead animation.
 *
 * This is a plain JS class that acts as an external store for React components.
 * Components subscribe to state slices via useSyncExternalStore (see useEngineState.js).
 *
 * All transport transitions (play, pause, stop, seek) use 3ms micro-fades on the
 * gain node to eliminate clicks from waveform discontinuities at start/stop points.
 * Seek while playing overlaps the new source before stopping the old to avoid gaps.
 */

/**
 * @typedef {'stopped' | 'playing' | 'paused'} TransportState
 */

/**
 * @typedef {{ hardwareRate: number, contextRate: number, sourceRate: number, rateMatch: boolean, hardwareMatch: boolean }} SampleRateInfo
 */

export class AudioEngine {
  /**
   * @param {number} sampleRate - Desired sample rate (from source files)
   */
  constructor(sampleRate) {
    this._sourceRate = sampleRate;

    // Probe hardware rate before creating our context
    const probe = new AudioContext();
    this._hardwareRate = probe.sampleRate;
    probe.close();

    // Create context at source file sample rate
    this._context = new AudioContext({ sampleRate, latencyHint: 'interactive' });
    this._contextRate = this._context.sampleRate;

    // Gain node for volume control
    this._gainNode = this._context.createGain();
    this._gainNode.connect(this._context.destination);

    // State
    this._buffers = [];        // AudioBuffer per track
    this._activeSource = null; // Currently playing AudioBufferSourceNode
    this._activeSourceGain = null; // Per-source GainNode (source → sourceGain → _gainNode)
    this._readySources = [];   // Pre-created {source, sourceGain} per track for instant switch
    this._selectedTrack = -1;  // Index of selected A/B/X track (-1 = none)
    this._transportState = 'stopped';
    this._playStartTime = 0;   // audioContext.currentTime when play started
    this._playOffset = 0;      // Offset into buffer when play started

    // Loop region (in seconds)
    this._loopStart = 0;
    this._loopEnd = 0;
    this._loopRegionSnapshot = [0, 0]; // Referentially stable for React
    this._prevDuration = 0;

    // Volume — init from localStorage
    const stored = localStorage.getItem('abx-volume');
    this._volume = stored !== null ? parseFloat(stored) : 0.5;
    this._gainNode.gain.value = this._volume;
    this._volumePersistTimer = null;

    // Transport micro-fade (anti-click)
    this._microFadeDuration = 0.003; // 3ms
    this._pendingFadeOut = null;

    // Crossfade
    this._crossfadeEnabled = false;
    this._crossfadeForced = false;
    this._crossfadeDuration = 0.005; // 5ms
    this._pendingCrossfadeCleanup = null;

    // Switch lookahead — schedule start/stop/ramps slightly in the future so the
    // audio thread hasn't reached the target time yet, guaranteeing all operations
    // at that timestamp are processed at the same render quantum boundary.
    this._switchLookahead = 0.005; // 5ms

    // Playhead animation — ref-like object, updated via rAF
    this._currentTimeRef = { current: 0 };
    this._animFrameId = null;

    // Subscriber set for useSyncExternalStore
    this._subscribers = new Set();

    // Context resume promise
    this._resumePromise = null;

    // Cached sample rate info (stable object, computed once)
    this._sampleRateInfo = {
      hardwareRate: this._hardwareRate,
      contextRate: this._contextRate,
      sourceRate: this._sourceRate,
      rateMatch: this._contextRate === this._sourceRate,
      hardwareMatch: this._hardwareRate === this._sourceRate,
    };
  }

  // --- Subscription (useSyncExternalStore contract) ---

  /**
   * Subscribe to state changes. Returns unsubscribe function.
   * @param {() => void} callback
   * @returns {() => void}
   */
  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  /** Notify all subscribers that state has changed. */
  _notify() {
    for (const cb of this._subscribers) {
      cb();
    }
  }

  // --- Snapshot getters (referentially stable when unchanged) ---

  getTransportState() { return this._transportState; }
  getSelectedTrack() { return this._selectedTrack; }
  getDuration() { return this._buffers.length > 0 ? this._buffers[0].duration : 0; }
  getVolume() { return this._volume; }
  getLoopRegion() { return this._loopRegionSnapshot; }
  getCrossfadeEnabled() { return this._crossfadeEnabled; }

  /** @returns {SampleRateInfo} */
  getSampleRateInfo() { return this._sampleRateInfo; }

  // --- Property getters ---

  /** @returns {AudioContext} */
  get context() {
    return this._context;
  }

  /** @returns {{ current: number }} Ref-like object for playhead position */
  get currentTimeRef() {
    return this._currentTimeRef;
  }

  /** @returns {number} Current playback position in seconds */
  get currentTime() {
    if (this._transportState === 'stopped') {
      return this._loopStart;
    }
    if (this._transportState === 'paused') {
      return this._playOffset;
    }
    // Playing — absolute position in the buffer
    const elapsed = this._context.currentTime - this._playStartTime;
    const pos = this._playOffset + elapsed;
    const loopDuration = this._loopEnd - this._loopStart;
    if (loopDuration <= 0) return this._playOffset;

    // Clamp into loop range — Web Audio API loops the actual audio,
    // we just need the visual playhead to stay within bounds
    if (pos >= this._loopEnd) {
      const overshoot = pos - this._loopStart;
      return this._loopStart + (overshoot % loopDuration);
    }
    if (pos < this._loopStart) {
      return this._loopStart;
    }
    return pos;
  }

  // --- Audio loading ---

  /**
   * Load AudioBuffers for all tracks.
   * Stops playback, resets transport. Preserves loop region if duration is unchanged.
   * @param {AudioBuffer[]} buffers
   */
  loadBuffers(buffers) {
    this._stopAnimation();
    // If a fade-out is in flight (from stop/pause), let it finish cleanly.
    // Only force-kill the source if nothing is fading it out.
    if (!this._pendingFadeOut) {
      this._silenceAndStopSource();
    }
    this._buffers = buffers;

    const dur = this.getDuration();
    // Preserve loop region if duration unchanged (same test, new iteration)
    if (Math.abs(dur - this._prevDuration) < 0.001 && this._loopRegionSnapshot[1] > 0) {
      this._loopStart = this._loopRegionSnapshot[0];
      this._loopEnd = this._loopRegionSnapshot[1];
    } else {
      this._loopStart = 0;
      this._loopEnd = dur;
      this._loopRegionSnapshot = [0, dur];
    }
    this._prevDuration = dur;

    this._selectedTrack = -1;
    this._transportState = 'stopped';
    this._playOffset = this._loopStart;
    this._currentTimeRef.current = this._loopStart;
    this._prepareAllSources();
    this._notify();
  }

  // --- Volume ---

  /**
   * Set volume (0.0 to 1.0).
   * @param {number} volume
   */
  setVolume(volume) {
    this._volume = volume;
    this._gainNode.gain.value = volume;
    // Debounce localStorage persistence
    clearTimeout(this._volumePersistTimer);
    this._volumePersistTimer = setTimeout(() => {
      localStorage.setItem('abx-volume', volume);
    }, 500);
    this._notify();
  }

  // --- Loop region ---

  /**
   * Set loop region. Only creates a new snapshot array if values changed.
   * @param {number} start
   * @param {number} end
   */
  setLoopRegion(start, end) {
    if (this._loopRegionSnapshot[0] === start && this._loopRegionSnapshot[1] === end) {
      return;
    }

    // Capture position BEFORE updating boundaries so modulo wraps against old loop range
    const playingPos = this._transportState === 'playing' ? this.currentTime : null;

    this._loopStart = start;
    this._loopEnd = end;
    this._loopRegionSnapshot = [start, end];

    if (this._activeSource) {
      this._activeSource.loopStart = start;
      this._activeSource.loopEnd = end;
    }
    for (const ready of this._readySources) {
      if (ready) {
        ready.source.loopStart = start;
        ready.source.loopEnd = end;
      }
    }

    // Keep playhead coherent with new loop boundaries
    if (this._transportState === 'stopped') {
      this._playOffset = start;
      this._currentTimeRef.current = start;
    } else if (this._transportState === 'paused') {
      if (this._playOffset >= end) {
        // End cursor passed playhead — wrap to loop start
        this._playOffset = start;
        this._currentTimeRef.current = start;
      } else if (this._playOffset < start) {
        // Start cursor passed playhead — push it along
        this._playOffset = start;
        this._currentTimeRef.current = start;
      }
    } else if (this._transportState === 'playing') {
      if (playingPos >= start && playingPos < end) {
        // Still in bounds — re-anchor tracking, no source recreation (avoids pops)
        this._playStartTime = this._context.currentTime;
        this._playOffset = playingPos;
      } else {
        // Out of bounds — fade-swap to new position
        // Skip if a fade is already in flight (rapid drag — discard until done)
        if (this._pendingFadeOut) return;
        const oldSource = this._activeSource;
        const oldSourceGain = this._activeSourceGain;
        this._activeSource = null;
        this._activeSourceGain = null;
        const now = this._context.currentTime;
        const gain = this._gainNode.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + this._microFadeDuration);
        this._pendingFadeOut = setTimeout(() => {
          this._pendingFadeOut = null;
          if (oldSource) {
            oldSource.disconnect();
            try { oldSource.stop(); } catch { /* */ }
          }
          if (oldSourceGain) {
            oldSourceGain.disconnect();
          }
          this._startSource(this._loopStart);
          this._fadeIn();
        }, this._microFadeDuration * 1000 + 1);
      }
    }

    this._notify();
  }

  // --- Crossfade ---

  /**
   * Enable/disable crossfade on track switches.
   * Ignored when crossfade is forced by config.
   * @param {boolean} enabled
   */
  setCrossfade(enabled) {
    if (this._crossfadeForced) return;
    this._crossfadeEnabled = enabled;
    this._notify();
  }

  /**
   * Lock crossfade on/off based on test config.
   * @param {boolean} forced
   */
  setCrossfadeForced(forced) {
    this._crossfadeForced = forced;
    if (forced) {
      this._crossfadeEnabled = true;
    }
    this._notify();
  }

  /**
   * Set crossfade duration in seconds.
   * @param {number} duration
   */
  setCrossfadeDuration(duration) {
    this._crossfadeDuration = duration;
  }

  // --- Track selection ---

  /**
   * Select a track (A=0, B=1, X=2, etc.) — switches audio source.
   * If playing, performs seamless switch (with optional crossfade).
   * If stopped, starts playback on the selected track.
   * Eagerly resumes AudioContext on user gesture.
   * @param {number} index
   */
  selectTrack(index) {
    if (index < 0 || index >= this._buffers.length) return;

    // Eagerly resume context on user gesture so play() is instant
    this.resumeContext();

    const wasPlaying = this._transportState === 'playing';
    const prevTrack = this._selectedTrack;
    this._selectedTrack = index;
    this._notify();

    if (!wasPlaying) {
      this.play();
      return;
    }

    if (prevTrack !== index) {
      const position = this.currentTime;

      if (this._crossfadeEnabled) {
        // Flush any in-flight crossfade cleanup before starting a new one
        if (this._pendingCrossfadeCleanup) {
          clearTimeout(this._pendingCrossfadeCleanup);
          this._pendingCrossfadeCleanup = null;
        }

        const dur = this._crossfadeDuration;
        const startAt = this._context.currentTime + this._switchLookahead;
        const switchPos = this._futurePosition(this._switchLookahead);

        // Capture old source + its gain node
        const oldSource = this._activeSource;
        const oldSourceGain = this._activeSourceGain;
        const ready = this._readySources[index];

        // All ramps + start scheduled at startAt (in the future) — the audio thread
        // hasn't reached this time yet, so everything is processed at the same quantum.
        oldSourceGain.gain.cancelScheduledValues(startAt);
        oldSourceGain.gain.setValueAtTime(1, startAt);
        oldSourceGain.gain.linearRampToValueAtTime(0, startAt + dur);
        if (ready) {
          ready.sourceGain.gain.value = 0;
          ready.sourceGain.gain.cancelScheduledValues(startAt);
          ready.sourceGain.gain.setValueAtTime(0, startAt);
          ready.sourceGain.gain.linearRampToValueAtTime(1, startAt + dur);
          ready.source.start(startAt, switchPos);

          this._activeSource = ready.source;
          this._activeSourceGain = ready.sourceGain;
          this._readySources[index] = null;
          this._playStartTime = startAt;
          this._playOffset = switchPos;
        } else {
          // Fallback: no ready source, create on the fly (may dip)
          this._startSource(switchPos, 0);
          this._activeSourceGain.gain.setValueAtTime(0, startAt);
          this._activeSourceGain.gain.linearRampToValueAtTime(1, startAt + dur);
        }

        // Clean up old source after crossfade + lookahead completes
        this._pendingCrossfadeCleanup = setTimeout(() => {
          this._pendingCrossfadeCleanup = null;
          try { oldSource.stop(); } catch { /* */ }
          oldSource.disconnect();
          oldSourceGain.disconnect();
          // Re-prepare both tracks' ready sources
          if (prevTrack >= 0 && prevTrack < this._buffers.length && !this._readySources[prevTrack]) {
            this._readySources[prevTrack] = this._prepareSource(prevTrack);
          }
          if (index >= 0 && index < this._buffers.length && !this._readySources[index]) {
            this._readySources[index] = this._prepareSource(index);
          }
        }, (this._switchLookahead + dur + 0.01) * 1000);
      } else {
        // Instant switch — zero graph mutations.
        const ready = this._readySources[index];
        if (ready) {
          const oldSource = this._activeSource;
          const oldSourceGain = this._activeSourceGain;
          const switchAt = this._context.currentTime + this._switchLookahead;
          const switchPos = this._futurePosition(this._switchLookahead);

          // Both start and stop at the same future time — audio thread
          // processes them atomically at the same quantum boundary.
          ready.source.start(switchAt, switchPos);
          if (oldSource) {
            oldSource.stop(switchAt);
          }

          this._activeSource = ready.source;
          this._activeSourceGain = ready.sourceGain;
          this._readySources[index] = null;
          this._playStartTime = switchAt;
          this._playOffset = switchPos;

          // Defer ALL graph mutations to a separate task so they can't
          // share a render quantum with the start/stop above.
          setTimeout(() => {
            if (oldSource) oldSource.disconnect();
            if (oldSourceGain) oldSourceGain.disconnect();
            if (prevTrack >= 0 && prevTrack < this._buffers.length && !this._readySources[prevTrack]) {
              this._readySources[prevTrack] = this._prepareSource(prevTrack);
            }
          }, 0);
        } else {
          // Fallback: no pre-created source available, create on the fly
          const oldSource = this._activeSource;
          const oldSourceGain = this._activeSourceGain;
          this._startSource(position);
          if (oldSource) {
            try { oldSource.stop(); } catch { /* */ }
          }
          setTimeout(() => {
            if (oldSource) oldSource.disconnect();
            if (oldSourceGain) oldSourceGain.disconnect();
          }, 50);
        }
      }
    }
  }

  // --- Context resume ---

  /**
   * Eagerly resume the AudioContext. Call on any user gesture.
   * The context is never suspended by the engine — this only handles
   * the browser's autoplay policy suspension.
   * @returns {Promise<void>}
   */
  resumeContext() {
    if (this._context.state === 'running') {
      return Promise.resolve();
    }
    if (!this._resumePromise) {
      this._resumePromise = this._context.resume().then(() => {
        this._resumePromise = null;
      });
    }
    return this._resumePromise;
  }

  // --- Transport controls ---

  /**
   * Play — start or resume playback with fade-in to avoid click.
   * Creates a new source from the current position (paused) or loop start (stopped).
   */
  play() {
    if (this._buffers.length === 0) return;
    if (this._selectedTrack < 0) return;
    if (this._transportState === 'playing') return;

    // Cancel any pending fade-out (e.g. rapid pause→play)
    this._cancelFadeOut();

    const position =
      this._transportState === 'paused' ? this._playOffset : this._loopStart;

    if (this._context.state !== 'running') {
      this._setTransportState('playing');
      this._startAnimation();
      this.resumeContext().then(() => {
        if (this._transportState === 'playing') {
          this._startSource(position);
          this._fadeIn();
        }
      });
    } else {
      this._startSource(position);
      this._fadeIn();
      this._setTransportState('playing');
      this._startAnimation();
    }
  }

  /**
   * Pause — fade out, record position, and discard the source.
   * Position is captured before the fade so the ~3ms ramp doesn't shift it.
   */
  pause() {
    if (this._transportState !== 'playing') return;

    // Capture position BEFORE fade-out
    this._playOffset = this.currentTime;
    this._currentTimeRef.current = this._playOffset;
    this._stopAnimation();
    this._setTransportState('paused');

    this._fadeOut(() => {
      this._silenceAndStopSource();
    });
  }

  /**
   * Stop — fade out, destroy source, and reset to loop start.
   */
  stop() {
    const wasPlaying = this._transportState === 'playing';
    this._stopAnimation();
    this._playOffset = this._loopStart;
    this._currentTimeRef.current = this._loopStart;
    this._setTransportState('stopped');

    if (wasPlaying && this._activeSource) {
      this._fadeOut(() => {
        this._silenceAndStopSource();
      });
    } else {
      this._silenceAndStopSource();
    }
  }

  /**
   * Seek to a specific position.
   * While playing: fade out, swap sources, fade in (gapless).
   * While paused/stopped: just update the offset.
   * @param {number} time
   */
  seek(time) {
    const clampedTime = Math.max(this._loopStart, Math.min(time, this._loopEnd));

    if (this._transportState === 'playing') {
      // Fade out, swap sources at silence, fade in — no gain restore between
      const oldSource = this._activeSource;
      const oldSourceGain = this._activeSourceGain;
      this._activeSource = null;
      this._activeSourceGain = null;
      this._playOffset = clampedTime;
      this._playStartTime = this._context.currentTime;
      this._cancelFadeOut();
      const now = this._context.currentTime;
      const gain = this._gainNode.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, now + this._microFadeDuration);
      this._pendingFadeOut = setTimeout(() => {
        this._pendingFadeOut = null;
        if (oldSource) {
          try { oldSource.stop(); } catch { /* */ }
          oldSource.disconnect();
        }
        if (oldSourceGain) {
          oldSourceGain.disconnect();
        }
        // Gain is at 0 — start new source silent, then ramp up
        this._startSource(clampedTime);
        this._fadeIn();
      }, this._microFadeDuration * 1000 + 1);
      this._currentTimeRef.current = clampedTime;
    } else if (this._transportState === 'paused') {
      // No live source while paused — just update the offset
      this._playOffset = clampedTime;
      this._currentTimeRef.current = clampedTime;
    } else {
      // Stopped — just update offset, transition to paused
      this._playOffset = clampedTime;
      this._currentTimeRef.current = clampedTime;
      this._setTransportState('paused');
    }
  }

  /**
   * Clean up all resources.
   */
  destroy() {
    this._stopAnimation();
    this._cancelFadeOut();
    this._silenceAndStopSource();
    this._destroyReadySources();
    clearTimeout(this._volumePersistTimer);
    clearTimeout(this._pendingCrossfadeCleanup);
    this._subscribers.clear();
    this._context.close();
  }

  // --- Internal methods ---

  /**
   * Fade gain to 0 over _microFadeDuration, then call callback.
   * Uses Web Audio scheduled ramps for sample-accurate timing.
   * @param {() => void} callback - Called after fade completes
   */
  _fadeOut(callback) {
    this._cancelFadeOut();
    const now = this._context.currentTime;
    const gain = this._gainNode.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + this._microFadeDuration);
    this._pendingFadeOut = setTimeout(() => {
      this._pendingFadeOut = null;
      callback();
      // Restore gain to volume level (ready for next play/fade-in)
      gain.cancelScheduledValues(this._context.currentTime);
      gain.setValueAtTime(this._volume, this._context.currentTime);
    }, this._microFadeDuration * 1000 + 1);
  }

  /**
   * Fade gain from 0 to _volume over _microFadeDuration.
   */
  _fadeIn() {
    const now = this._context.currentTime;
    const gain = this._gainNode.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(this._volume, now + this._microFadeDuration);
  }

  /**
   * Cancel any pending fade-out and restore gain immediately.
   */
  _cancelFadeOut() {
    if (this._pendingFadeOut) {
      clearTimeout(this._pendingFadeOut);
      this._pendingFadeOut = null;
      const gain = this._gainNode.gain;
      gain.cancelScheduledValues(this._context.currentTime);
      gain.setValueAtTime(this._volume, this._context.currentTime);
    }
  }

  /** Compute where the source will be at now + lookahead, with loop wrapping. */
  _futurePosition(lookahead) {
    const pos = this.currentTime + lookahead;
    const loopDur = this._loopEnd - this._loopStart;
    if (loopDur <= 0) return this.currentTime;
    if (pos >= this._loopEnd) {
      return this._loopStart + ((pos - this._loopStart) % loopDur);
    }
    return pos;
  }

  /** Pre-create a source + gain node for one track, wired into the graph but not started. */
  _prepareSource(trackIndex) {
    const buffer = this._buffers[trackIndex];
    if (!buffer) return null;
    const sourceGain = this._context.createGain();
    sourceGain.gain.value = 1;
    sourceGain.connect(this._gainNode);
    const source = new AudioBufferSourceNode(this._context, {
      buffer,
      loop: true,
      loopStart: this._loopStart,
      loopEnd: this._loopEnd,
    });
    source.connect(sourceGain);
    return { source, sourceGain };
  }

  /** Pre-create sources for all tracks (called at loadBuffers time). */
  _prepareAllSources() {
    this._destroyReadySources();
    this._readySources = this._buffers.map((_, i) => this._prepareSource(i));
  }

  /** Disconnect and discard all pre-created ready sources. */
  _destroyReadySources() {
    for (const ready of this._readySources) {
      if (ready) {
        ready.source.disconnect();
        ready.sourceGain.disconnect();
      }
    }
    this._readySources = [];
  }

  _startSource(fromTime, gainValue = 1) {
    const buffer = this._buffers[this._selectedTrack];
    if (!buffer) return;

    // Destroy pre-created ready source for this track (avoid duplicate graph nodes)
    const ready = this._readySources[this._selectedTrack];
    if (ready) {
      ready.source.disconnect();
      ready.sourceGain.disconnect();
      this._readySources[this._selectedTrack] = null;
    }

    const sourceGain = this._context.createGain();
    sourceGain.gain.value = gainValue;
    sourceGain.connect(this._gainNode);

    const source = new AudioBufferSourceNode(this._context, {
      buffer,
      loop: true,
      loopStart: this._loopStart,
      loopEnd: this._loopEnd,
    });
    source.connect(sourceGain);
    source.start(0, fromTime);

    this._activeSource = source;
    this._activeSourceGain = sourceGain;
    this._playStartTime = this._context.currentTime;
    this._playOffset = fromTime;
  }

  /** Disconnect source + its gain node from graph before stopping — prevents pops. */
  _silenceAndStopSource() {
    if (!this._activeSource) return;
    const track = this._selectedTrack;
    this._activeSource.disconnect();
    try { this._activeSource.stop(); } catch { /* */ }
    if (this._activeSourceGain) {
      this._activeSourceGain.disconnect();
    }
    this._activeSource = null;
    this._activeSourceGain = null;
    // Re-prepare ready source for the stopped track
    if (track >= 0 && track < this._buffers.length
        && this._readySources.length > 0 && !this._readySources[track]) {
      this._readySources[track] = this._prepareSource(track);
    }
  }

  _setTransportState(state) {
    this._transportState = state;
    this._notify();
  }

  _startAnimation() {
    if (this._animFrameId) return; // Already running
    const animate = () => {
      this._currentTimeRef.current = this.currentTime;
      this._animFrameId = requestAnimationFrame(animate);
    };
    this._animFrameId = requestAnimationFrame(animate);
  }

  _stopAnimation() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }
}
