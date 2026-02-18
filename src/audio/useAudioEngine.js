/**
 * React hook wrapping AudioEngine for component integration.
 * Manages engine lifecycle, state synchronization, and playhead animation.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioEngine } from './audioEngine';
import { loadAndValidate, createAudioBuffer } from './audioLoader';

/**
 * @param {object} options
 * @param {string[]} options.urls - Audio file URLs for this test
 * @param {boolean} [options.duckingForced] - If true, ducking is locked on
 * @param {number} [options.duckDuration] - Duck duration in ms (default 5)
 * @returns {object} Engine state and control functions
 */
export function useAudioEngine({ urls, duckingForced = false, duckDuration = 5 }) {
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
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState(null);

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

  // Initialize engine and load audio
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        // Decode all audio files
        const { decoded, sampleRate, channels, sampleCount } = await loadAndValidate(
          urls,
          (loaded, total) => {
            if (!cancelled) setLoadProgress({ loaded, total });
          }
        );

        if (cancelled) return;

        // Create engine at source sample rate
        const engine = new AudioEngine(sampleRate);
        engine.onStateChange = (state) => {
          if (!cancelled) setTransportState(state);
        };

        // Create AudioBuffers
        const buffers = decoded.map((d) => createAudioBuffer(engine.context, d));
        engine.loadBuffers(buffers);

        // Apply initial settings
        engine.setVolume(volume);
        engine.setDucking(duckingForced || duckingEnabled);
        engine.setDuckDuration(duckDuration / 1000);

        engineRef.current = engine;

        if (!cancelled) {
          setSampleRateInfo(engine.sampleRateInfo);
          setDuration(engine.duration);
          setLoopRegion([0, engine.duration]);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      stopAnimation();
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [urls]); // Re-initialize only when URLs change

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
    loading,
    loadProgress,
    error,

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
  };
}
