/**
 * Audio engine — manages AudioContext, playback, transport controls, track switching,
 * loop region, seeking, crossfade, volume persistence, and playhead animation.
 *
 * This is a plain JS class that acts as an external store for React components.
 * Components subscribe to state slices via useSyncExternalStore (see useEngineState.js).
 *
 * Pause uses playbackRate=0 (not context.suspend) so the context clock keeps running
 * and resume is synchronous with no hardware re-acquisition cost.
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
    this._activeSourceDest = null; // Node the active source is connected to
    this._selectedTrack = 0;   // Index of selected A/B/X track
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

    // Crossfade
    this._crossfadeEnabled = false;
    this._crossfadeForced = false;
    this._crossfadeDuration = 0.005; // 5ms
    this._pendingCrossfadeCleanup = null;

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
    this._silenceAndStopSource();
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

    this._selectedTrack = 0;
    this._transportState = 'stopped';
    this._playOffset = this._loopStart;
    this._currentTimeRef.current = this._loopStart;
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
        // Out of bounds — must recreate source at new position
        const oldSource = this._activeSource;
        this._activeSource = null;
        this._startSource(start);
        if (oldSource) {
          oldSource.disconnect();
          try { oldSource.stop(); } catch { /* */ }
        }
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

    if (wasPlaying && prevTrack !== index) {
      const position = this.currentTime;

      if (this._crossfadeEnabled) {
        // Flush any in-flight crossfade cleanup before starting a new one
        if (this._pendingCrossfadeCleanup) {
          clearTimeout(this._pendingCrossfadeCleanup);
          this._pendingCrossfadeCleanup = null;
        }

        const dur = this._crossfadeDuration;
        const now = this._context.currentTime;

        // Fade out old source through a temporary gain node.
        // Connect new path before disconnecting old to avoid any gap.
        const oldSource = this._activeSource;
        const oldDest = this._activeSourceDest;
        const oldGain = this._context.createGain();
        oldGain.gain.value = 1;
        oldGain.connect(this._gainNode);
        oldSource.connect(oldGain);
        try { oldSource.disconnect(oldDest); } catch { /* rapid switch — already rerouted */ }
        oldGain.gain.linearRampToValueAtTime(0, now + dur);

        // Fade in new source through a temporary gain node
        const newGain = this._context.createGain();
        newGain.gain.value = 0;
        newGain.connect(this._gainNode);
        newGain.gain.linearRampToValueAtTime(1, now + dur);
        this._startSource(position, newGain);

        // Clean up after crossfade completes
        this._pendingCrossfadeCleanup = setTimeout(() => {
          this._pendingCrossfadeCleanup = null;
          oldGain.disconnect();
          try { oldSource.stop(); } catch { /* */ }
          oldSource.disconnect();
          // Reconnect active source directly to _gainNode (skip temporary gain)
          if (this._activeSource && this._activeSourceDest !== this._gainNode) {
            this._activeSource.disconnect();
            this._activeSource.connect(this._gainNode);
            this._activeSourceDest = this._gainNode;
          }
          newGain.disconnect();
        }, (dur + 0.01) * 1000);
      } else {
        // Instant switch: start new source before stopping old
        const oldSource = this._activeSource;
        this._activeSource = null;
        this._startSource(position);
        if (oldSource) {
          try { oldSource.stop(); } catch { /* */ }
          oldSource.disconnect();
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
   * Play — start or resume playback.
   * Creates a new source from the current position (paused) or loop start (stopped).
   */
  play() {
    if (this._buffers.length === 0) return;
    if (this._transportState === 'playing') return;

    const position =
      this._transportState === 'paused' ? this._playOffset : this._loopStart;

    if (this._context.state !== 'running') {
      this._setTransportState('playing');
      this._startAnimation();
      this.resumeContext().then(() => {
        if (this._transportState === 'playing') {
          this._startSource(position);
        }
      });
    } else {
      this._startSource(position);
      this._setTransportState('playing');
      this._startAnimation();
    }
  }

  /**
   * Pause — record position and discard the source.
   * No live source while paused means no pops on seek or stop.
   * Resume creates a fresh source (sub-millisecond).
   */
  pause() {
    if (this._transportState !== 'playing') return;

    this._playOffset = this.currentTime;
    this._currentTimeRef.current = this._playOffset;
    this._stopAnimation();

    // Silence then discard the source — no live node while paused
    this._silenceAndStopSource();
    this._setTransportState('paused');
  }

  /**
   * Stop — destroy source and reset to loop start.
   */
  stop() {
    this._silenceAndStopSource();
    this._stopAnimation();
    this._playOffset = this._loopStart;
    this._currentTimeRef.current = this._loopStart;
    this._setTransportState('stopped');
  }

  /**
   * Seek to a specific position.
   * While playing: overlaps new source before stopping old (gapless).
   * While paused/stopped: creates a paused source ready for instant resume.
   * @param {number} time
   */
  seek(time) {
    const clampedTime = Math.max(this._loopStart, Math.min(time, this._loopEnd));

    if (this._transportState === 'playing') {
      // Overlap: create new source at new position, then stop old
      const oldSource = this._activeSource;
      this._activeSource = null;
      this._startSource(clampedTime);
      if (oldSource) {
        try { oldSource.stop(); } catch { /* */ }
        oldSource.disconnect();
      }
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
    this._silenceAndStopSource();
    clearTimeout(this._volumePersistTimer);
    clearTimeout(this._pendingCrossfadeCleanup);
    this._subscribers.clear();
    this._context.close();
  }

  // --- Internal methods ---

  _startSource(fromTime, destinationNode) {
    const buffer = this._buffers[this._selectedTrack];
    if (!buffer) return;

    const dest = destinationNode || this._gainNode;
    const source = new AudioBufferSourceNode(this._context, {
      buffer,
      loop: true,
      loopStart: this._loopStart,
      loopEnd: this._loopEnd,
    });
    source.connect(dest);
    source.start(0, fromTime);

    this._activeSource = source;
    this._activeSourceDest = dest;
    this._playStartTime = this._context.currentTime;
    this._playOffset = fromTime;
  }

  /** Disconnect source from graph before stopping — prevents pops from abrupt cutoff. */
  _silenceAndStopSource() {
    if (!this._activeSource) return;
    // Disconnect source from the graph so .stop() can't pop
    this._activeSource.disconnect();
    try { this._activeSource.stop(); } catch { /* */ }
    this._activeSource = null;
    this._activeSourceDest = null;
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
