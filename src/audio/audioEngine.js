/**
 * Audio engine — manages AudioContext, playback, transport controls, track switching,
 * loop region, seeking, and audio ducking.
 *
 * This is a plain JS class (not React) for testability and separation of concerns.
 * The React hook (useAudioEngine) wraps this for component integration.
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
    this._loopEnd = 0;         // 0 = full duration (set after buffers loaded)

    // Ducking
    this._duckingEnabled = false;
    this._duckDuration = 0.005; // 5ms default

    // Callbacks
    this._onStateChange = null;
  }

  /** @returns {SampleRateInfo} */
  get sampleRateInfo() {
    return {
      hardwareRate: this._hardwareRate,
      contextRate: this._contextRate,
      sourceRate: this._sourceRate,
      rateMatch: this._contextRate === this._sourceRate,
      hardwareMatch: this._hardwareRate === this._sourceRate,
    };
  }

  /** @returns {AudioContext} */
  get context() {
    return this._context;
  }

  /** @returns {TransportState} */
  get transportState() {
    return this._transportState;
  }

  /** @returns {number} Selected track index */
  get selectedTrack() {
    return this._selectedTrack;
  }

  /** @returns {number} Duration of audio in seconds */
  get duration() {
    if (this._buffers.length === 0) return 0;
    return this._buffers[0].duration;
  }

  /** @returns {number} Current playback position in seconds */
  get currentTime() {
    if (this._transportState === 'stopped') {
      return this._loopStart;
    }
    if (this._transportState === 'paused') {
      return this._playOffset;
    }
    // Playing — calculate current position
    // _playOffset is the buffer position where playback started
    // elapsed is wall-clock time since then
    const elapsed = this._context.currentTime - this._playStartTime;
    const loopDuration = this._loopEnd - this._loopStart;
    if (loopDuration <= 0) return this._playOffset;

    // Position = start offset + elapsed, wrapped within loop region
    const rawPosition = this._playOffset + elapsed;
    // How far past loop start (accounting for starting mid-loop)
    const intoLoop = rawPosition - this._loopStart;
    return this._loopStart + ((intoLoop % loopDuration) + loopDuration) % loopDuration;
  }

  /** @param {(state: TransportState) => void} cb */
  set onStateChange(cb) {
    this._onStateChange = cb;
  }

  /**
   * Load AudioBuffers for all tracks.
   * @param {AudioBuffer[]} buffers
   */
  loadBuffers(buffers) {
    this._buffers = buffers;
    this._loopStart = 0;
    this._loopEnd = this.duration;
  }

  /**
   * Set volume (0.0 to 1.0).
   * @param {number} volume
   */
  setVolume(volume) {
    this._gainNode.gain.value = volume;
  }

  /**
   * Set loop region.
   * @param {number} start - Start time in seconds
   * @param {number} end - End time in seconds
   */
  setLoopRegion(start, end) {
    this._loopStart = start;
    this._loopEnd = end;

    // If playing, update the active source node's loop points
    if (this._activeSource) {
      this._activeSource.loopStart = start;
      this._activeSource.loopEnd = end;
    }
  }

  /**
   * Enable/disable audio ducking on track switches.
   * @param {boolean} enabled
   */
  setDucking(enabled) {
    this._duckingEnabled = enabled;
  }

  /**
   * Set duck duration in seconds.
   * @param {number} duration
   */
  setDuckDuration(duration) {
    this._duckDuration = duration;
  }

  /**
   * Select a track (A=0, B=1, X=2, etc.) — switches audio source.
   * If playing, performs seamless switch (with optional ducking).
   * @param {number} index - Track index
   */
  selectTrack(index) {
    if (index < 0 || index >= this._buffers.length) return;

    const wasPlaying = this._transportState === 'playing';
    const prevTrack = this._selectedTrack;
    this._selectedTrack = index;

    if (wasPlaying && prevTrack !== index) {
      const position = this.currentTime;
      this._stopSource();

      if (this._duckingEnabled) {
        // Duck: ramp to 0, switch, ramp back
        const now = this._context.currentTime;
        this._duckGainNode.gain.cancelScheduledValues(now);
        this._duckGainNode.gain.setValueAtTime(1, now);
        this._duckGainNode.gain.linearRampToValueAtTime(0, now + this._duckDuration);
        this._duckGainNode.gain.linearRampToValueAtTime(1, now + this._duckDuration * 2);

        // Start new source after duck-down completes
        setTimeout(() => {
          if (this._transportState === 'playing') {
            this._startSource(position);
          }
        }, this._duckDuration * 1000);
      } else {
        // Immediate switch
        this._startSource(position);
      }
    }
  }

  /**
   * Play — start or resume playback.
   */
  play() {
    // Resume AudioContext if suspended (browser autoplay policy)
    if (this._context.state === 'suspended') {
      this._context.resume();
    }

    if (this._buffers.length === 0) return;

    if (this._transportState === 'playing') return;

    const position =
      this._transportState === 'paused' ? this._playOffset : this._loopStart;

    this._startSource(position);
    this._setTransportState('playing');
  }

  /**
   * Pause — hold current position.
   */
  pause() {
    if (this._transportState !== 'playing') return;

    this._playOffset = this.currentTime;
    this._stopSource();
    this._setTransportState('paused');
  }

  /**
   * Stop — reset to loop start.
   */
  stop() {
    this._stopSource();
    this._playOffset = this._loopStart;
    this._setTransportState('stopped');
  }

  /**
   * Seek to a specific position.
   * @param {number} time - Position in seconds
   */
  seek(time) {
    const clampedTime = Math.max(this._loopStart, Math.min(time, this._loopEnd));

    if (this._transportState === 'playing') {
      this._stopSource();
      this._startSource(clampedTime);
    } else {
      this._playOffset = clampedTime;
      if (this._transportState === 'stopped') {
        this._setTransportState('paused');
      }
    }
  }

  /**
   * Clean up resources.
   */
  destroy() {
    this._stopSource();
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
    if (this._onStateChange) {
      this._onStateChange(state);
    }
  }
}
