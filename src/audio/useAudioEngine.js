/**
 * React hook wrapping AudioEngine for component integration.
 * Manages engine lifecycle, state synchronization, and playhead animation.
 *
 * The engine is created once from pre-loaded audio data (decoded externally by TestRunner).
 * Track buffers can be swapped via loadBuffers() without recreating the engine.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioEngine } from './audioEngine';

/**
 * @param {object} options
 * @param {number|null} options.sampleRate - Source sample rate (from decoded audio), null if not yet loaded
 * @param {boolean} [options.duckingForced] - If true, ducking is locked on
 * @param {number} [options.duckDuration] - Duck duration in ms (default 5)
 * @returns {object} Engine state and control functions
 */
export function useAudioEngine({ sampleRate, duckingForced = false, duckDuration = 5 }) {
  const engineRef = useRef(null);
  const animFrameRef = useRef(null);

  // State exposed to React
  const [transportState, setTransportState] = useState('stopped');
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopRegion, setLoopRegion] = useState([0, 0]);
  const [volume, setVolumeState] = useState(() => {
    const stored = localStorage.getItem('abx-volume');
    return stored !== null ? parseFloat(stored) : 0.5;
  });
  const [duckingEnabled, setDuckingEnabledState] = useState(duckingForced);
  const [sampleRateInfo, setSampleRateInfo] = useState(null);

  // Playhead animation loop
  const startAnimation = useCallback(() => {
    const animate = () => {
      if (engineRef.current) {
        setCurrentTime(engineRef.current.currentTime);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Create engine once when sampleRate is available
  useEffect(() => {
    if (!sampleRate) return;

    const engine = new AudioEngine(sampleRate);
    engine.onStateChange = (state) => {
      setTransportState(state);
    };

    engine.setVolume(volume);
    engine.setDucking(duckingForced || duckingEnabled);
    engine.setDuckDuration(duckDuration / 1000);

    engineRef.current = engine;
    setSampleRateInfo(engine.sampleRateInfo);

    return () => {
      stopAnimation();
      engine.destroy();
      engineRef.current = null;
    };
  }, [sampleRate]); // Only recreate engine if sample rate changes

  // Update ducking settings when forced/duration props change
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setDucking(duckingForced || duckingEnabled);
    engineRef.current.setDuckDuration(duckDuration / 1000);
  }, [duckingForced, duckDuration]);

  /**
   * Load AudioBuffers into the engine for the current test iteration.
   * Stops any current playback and resets transport.
   * @param {AudioBuffer[]} buffers
   */
  const loadBuffers = useCallback((buffers) => {
    if (!engineRef.current) return;
    stopAnimation();
    engineRef.current.stop();
    engineRef.current.loadBuffers(buffers);
    const dur = engineRef.current.duration;
    setDuration(dur);
    setLoopRegion([0, dur]);
    setCurrentTime(0);
    setSelectedTrack(0);
    setTransportState('stopped');
  }, [stopAnimation]);

  /**
   * Get the AudioContext (needed to create AudioBuffers externally).
   * @returns {AudioContext|null}
   */
  const getContext = useCallback(() => {
    return engineRef.current?.context || null;
  }, []);

  // Control functions
  const play = useCallback(() => {
    engineRef.current?.play();
    startAnimation();
  }, [startAnimation]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    stopAnimation();
    if (engineRef.current) {
      setCurrentTime(engineRef.current.currentTime);
    }
  }, [stopAnimation]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    stopAnimation();
    if (engineRef.current) {
      setCurrentTime(engineRef.current.currentTime);
    }
  }, [stopAnimation]);

  const seek = useCallback((time) => {
    engineRef.current?.seek(time);
    if (engineRef.current) {
      setCurrentTime(engineRef.current.currentTime);
    }
  }, []);

  const selectTrack = useCallback((index) => {
    engineRef.current?.selectTrack(index);
    setSelectedTrack(index);
  }, []);

  const setVolume = useCallback((vol) => {
    engineRef.current?.setVolume(vol);
    setVolumeState(vol);
    // Debounce localStorage write
    clearTimeout(setVolume._timer);
    setVolume._timer = setTimeout(() => {
      localStorage.setItem('abx-volume', vol);
    }, 500);
  }, []);

  const setLoopStart = useCallback((start) => {
    const end = loopRegion[1];
    const clamped = Math.max(0, Math.min(start, end));
    engineRef.current?.setLoopRegion(clamped, end);
    setLoopRegion([clamped, end]);
  }, [loopRegion]);

  const setLoopEnd = useCallback((end) => {
    const start = loopRegion[0];
    const clamped = Math.max(start, Math.min(end, duration));
    engineRef.current?.setLoopRegion(start, clamped);
    setLoopRegion([start, clamped]);
  }, [loopRegion, duration]);

  const setLoopRegionBoth = useCallback((start, end) => {
    engineRef.current?.setLoopRegion(start, end);
    setLoopRegion([start, end]);
  }, []);

  const setDuckingEnabled = useCallback((enabled) => {
    if (duckingForced) return; // Can't toggle when forced
    engineRef.current?.setDucking(enabled);
    setDuckingEnabledState(enabled);
  }, [duckingForced]);

  return {
    // State
    transportState,
    selectedTrack,
    currentTime,
    duration,
    loopRegion,
    volume,
    duckingEnabled,
    duckingForced,
    sampleRateInfo,

    // Controls
    play,
    pause,
    stop,
    seek,
    selectTrack,
    setVolume,
    setLoopStart,
    setLoopEnd,
    setLoopRegion: setLoopRegionBoth,
    setDuckingEnabled,
    loadBuffers,
    getContext,
  };
}
