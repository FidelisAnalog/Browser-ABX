/**
 * Audio engine — manages AudioContext, playback, transport controls, track switching,
 * loop region, seeking, audio ducking, volume persistence, and playhead animation.
 *
 * This is a plain JS class that acts as an external store for React components.
 * Components subscribe to state slices via useSyncExternalStore (see useEngineState.js).
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
    this._context = new AudioContext({ sampleRate });
    this._contextRate = this._context.sampleRate;

    // Gain node for volume control
    this._gainNode = this._context.createGain();
    this._gainNode.connect(this._context.destination);

    // Duck gain node — separate from volume so ducking doesn't affect the volume slider
    this._duckGainNode = this._context.createGain();
    this._duckGainNode.connect(this._gainNode);

    // State
    this._buffers = [];        // AudioBuffer per track
    this._activeSource = null; // Currently playing AudioBufferSourceNode
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

    // Ducking
    this._duckingEnabled = false;
    this._duckingForced = false;
    this._duckDuration = 0.005; // 5ms default

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
  getDuckingEnabled() { return this._duckingEnabled; }

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
    const elapsed = this._context.currentTime - this._playStartTime;
    const loopDuration = this._loopEnd - this._loopStart;
    if (loopDuration <= 0) return this._playOffset;

    const rawPosition = this._playOffset + elapsed;
    const intoLoop = rawPosition - this._loopStart;
    return this._loopStart + ((intoLoop % loopDuration) + loopDuration) % loopDuration;
  }

  // --- Audio loading ---

  /**
   * Load AudioBuffers for all tracks.
   * Stops playback, resets transport. Preserves loop region if duration is unchanged.
   * @param {AudioBuffer[]} buffers
   */
  loadBuffers(buffers) {
    this._stopAnimation();
    this._stopSource();
    // Ensure context is running (may be suspended from pause)
    if (this._context.state === 'suspended') {
      this._context.resume();
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
    this._loopStart = start;
    this._loopEnd = end;
    this._loopRegionSnapshot = [start, end];

    if (this._activeSource) {
      this._activeSource.loopStart = start;
      this._activeSource.loopEnd = end;
    }
    this._notify();
  }

  // --- Ducking ---

  /**
   * Enable/disable audio ducking on track switches.
   * Ignored when ducking is forced by config.
   * @param {boolean} enabled
   */
  setDucking(enabled) {
    if (this._duckingForced) return;
    this._duckingEnabled = enabled;
    this._notify();
  }

  /**
   * Lock ducking on/off based on test config.
   * @param {boolean} forced
   */
  setDuckingForced(forced) {
    this._duckingForced = forced;
    if (forced) {
      this._duckingEnabled = true;
    }
    this._notify();
  }

  /**
   * Set duck duration in seconds.
   * @param {number} duration
   */
  setDuckDuration(duration) {
    this._duckDuration = duration;
  }

  // --- Track selection ---

  /**
   * Select a track (A=0, B=1, X=2, etc.) — switches audio source.
   * If playing, performs seamless switch (with optional ducking).
   * Eagerly resumes AudioContext on user gesture.
   * @param {number} index
   */
  selectTrack(index) {
    if (index < 0 || index >= this._buffers.length) return;

    // Eagerly resume context on user gesture so play() is instant
    if (this._transportState !== 'paused') {
      this.resumeContext();
    }

    const wasPlaying = this._transportState === 'playing';
    const prevTrack = this._selectedTrack;
    this._selectedTrack = index;
    this._notify();

    if (wasPlaying && prevTrack !== index) {
      const position = this.currentTime;
      this._stopSource();

      if (this._duckingEnabled) {
        const now = this._context.currentTime;
        this._duckGainNode.gain.cancelScheduledValues(now);
        this._duckGainNode.gain.setValueAtTime(1, now);
        this._duckGainNode.gain.linearRampToValueAtTime(0, now + this._duckDuration);
        this._duckGainNode.gain.linearRampToValueAtTime(1, now + this._duckDuration * 2);

        setTimeout(() => {
          if (this._transportState === 'playing') {
            this._startSource(position);
          }
        }, this._duckDuration * 1000);
      } else {
        this._startSource(position);
      }
    }
  }

  // --- Context resume ---

  /**
   * Eagerly resume the AudioContext. Call on any user gesture.
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
   * If paused, resumes the frozen AudioContext (no source recreation).
   * If stopped, creates a new source and starts from loop start.
   */
  play() {
    if (this._buffers.length === 0) return;
    if (this._transportState === 'playing') return;

    if (this._transportState === 'paused' && this._activeSource) {
      // Resume from pause — just unfreeze the context, no new source needed
      this._setTransportState('playing');
      this._startAnimation();
      this._context.resume();
    } else {
      // Start from stopped (or paused without a source, e.g. after seek-while-paused)
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
  }

  /**
   * Pause — freeze the AudioContext, keeping the source node alive.
   * Resume via play() unfreezes instantly with no source recreation.
   */
  pause() {
    if (this._transportState !== 'playing') return;

    this._playOffset = this.currentTime;
    this._currentTimeRef.current = this._playOffset;
    this._stopAnimation();
    // Suspend freezes the audio graph — source stays alive for instant resume
    this._context.suspend();
    this._setTransportState('paused');
  }

  /**
   * Stop — destroy source and reset to loop start.
   */
  stop() {
    const wasPaused = this._transportState === 'paused';
    this._stopSource();
    this._stopAnimation();
    this._playOffset = this._loopStart;
    this._currentTimeRef.current = this._loopStart;
    this._setTransportState('stopped');
    // If context was suspended (from pause), resume it so it's ready for next play
    if (wasPaused) {
      this._context.resume();
    }
  }

  /**
   * Seek to a specific position.
   * @param {number} time
   */
  seek(time) {
    const clampedTime = Math.max(this._loopStart, Math.min(time, this._loopEnd));

    if (this._transportState === 'playing') {
      // Must recreate source at new position
      this._stopSource();
      this._startSource(clampedTime);
      this._currentTimeRef.current = clampedTime;
    } else if (this._transportState === 'paused') {
      // Destroy old source, create new one at new position, re-suspend
      this._stopSource();
      // Resume context briefly to allow source creation, then re-suspend
      this._context.resume().then(() => {
        if (this._transportState === 'paused') {
          this._startSource(clampedTime);
          this._playOffset = clampedTime;
          this._playStartTime = this._context.currentTime;
          this._context.suspend();
        }
      });
      this._playOffset = clampedTime;
      this._currentTimeRef.current = clampedTime;
    } else {
      // Stopped
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
    this._stopSource();
    clearTimeout(this._volumePersistTimer);
    this._subscribers.clear();
    this._context.close();
  }

  // --- Internal methods ---

  _startSource(fromTime) {
    const buffer = this._buffers[this._selectedTrack];
    if (!buffer) return;

    const source = new AudioBufferSourceNode(this._context, {
      buffer,
      loop: true,
      loopStart: this._loopStart,
      loopEnd: this._loopEnd,
    });
    source.connect(this._duckGainNode);
    source.start(0, fromTime);

    this._activeSource = source;
    this._playStartTime = this._context.currentTime;
    this._playOffset = fromTime;
  }

  _stopSource() {
    if (this._activeSource) {
      try {
        this._activeSource.stop();
      } catch {
        // Source may not have been started
      }
      this._activeSource.disconnect();
      this._activeSource = null;
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
