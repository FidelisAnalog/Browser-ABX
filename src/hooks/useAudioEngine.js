/**
 * useAudioEngine — audio infrastructure hook.
 * Owns fetch, decode, engine creation, AudioBuffer map, engine facade, cleanup.
 * Knows nothing about tests, test types, or iterations.
 *
 * @param {string[]} audioUrls - Unique audio file URLs to load
 * @returns {{
 *   engineFacade: object|null,
 *   audioBufferMap: Map|null,
 *   audioInitialized: boolean,
 *   audioError: string|null,
 *   loadProgress: { loaded: number, total: number },
 *   sampleRateInfo: object|null,
 *   getChannelData: (test: object) => Float32Array[],
 *   loadBuffers: (bufferSources: object[]) => void,
 *   setCrossfadeConfig: (test: object|null) => void,
 * }}
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadAndValidate, createAudioBufferMap } from '../audio/audioLoader';
import { AudioEngine } from '../audio/audioEngine';
import { getTestType } from '../utils/testTypeRegistry';

export function useAudioEngine(audioUrls) {
  const [audioError, setAudioError] = useState(null);
  const [audioSampleRate, setAudioSampleRate] = useState(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });

  // Decoded audio cache: Map<url, DecodedAudio>
  const decodedCacheRef = useRef(new Map());
  // AudioBuffer cache: Map<url, AudioBuffer> — created once, reused every iteration
  const audioBufferMapRef = useRef(null);

  // Create engine once when sample rate is known (synchronous, deterministic)
  const engineRef = useRef(null);
  if (audioSampleRate && !engineRef.current) {
    engineRef.current = new AudioEngine(audioSampleRate);
    audioBufferMapRef.current = createAudioBufferMap(
      engineRef.current.context, decodedCacheRef.current
    );
  }
  const engine = engineRef.current;

  // Anti-cheat: facade hides engine internals (_buffers, _readySources) from React DevTools.
  // Components receive only public methods — no access to buffer identity for answer deduction.
  const engineFacade = useMemo(() => {
    if (!engine) return null;
    return {
      selectTrack: (i) => engine.selectTrack(i),
      play: () => engine.play(),
      pause: () => engine.pause(),
      stop: () => engine.stop(),
      seek: (t) => engine.seek(t),
      setVolume: (v) => engine.setVolume(v),
      setLoopRegion: (s, e) => engine.setLoopRegion(s, e),
      setCrossfade: (e) => engine.setCrossfade(e),
      resumeContext: () => engine.resumeContext(),
      subscribe: (cb) => engine.subscribe(cb),
      getTransportState: () => engine.getTransportState(),
      getSelectedTrack: () => engine.getSelectedTrack(),
      getDuration: () => engine.getDuration(),
      getVolume: () => engine.getVolume(),
      getLoopRegion: () => engine.getLoopRegion(),
      getCrossfadeEnabled: () => engine.getCrossfadeEnabled(),
      getSampleRateInfo: () => engine.getSampleRateInfo(),
      get currentTimeRef() { return engine.currentTimeRef; },
      get currentTime() { return engine.currentTime; },
      get context() { return engine.context; },
    };
  }, [engine]);

  // Cleanup engine on unmount (SPA navigation) and on page unload (full navigation).
  // React useEffect cleanup does NOT fire on full page navigation, so pagehide
  // is needed to ensure the AudioContext is closed and the audio thread stops.
  useEffect(() => {
    const cleanup = () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
    window.addEventListener('pagehide', cleanup);
    return () => {
      window.removeEventListener('pagehide', cleanup);
      cleanup();
    };
  }, []);

  // Load and decode all audio files once
  useEffect(() => {
    if (audioUrls.length === 0) return;
    const controller = new AbortController();

    loadAndValidate(audioUrls, (loaded, total) => {
      if (!controller.signal.aborted) {
        setLoadProgress({ loaded, total });
      }
    }, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        const cache = new Map();
        for (let i = 0; i < audioUrls.length; i++) {
          cache.set(audioUrls[i], data.decoded[i]);
        }
        decodedCacheRef.current = cache;
        setAudioSampleRate(data.sampleRate);
        setAudioInitialized(true);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (!controller.signal.aborted) setAudioError(err.message);
      });
    return () => { controller.abort(); };
  }, [audioUrls]);

  /**
   * Get channel 0 data for each option + extra waveform tracks.
   * Derived from decoded cache, not AudioBuffers.
   * @param {object} test - Test config object with options[] and testType
   * @returns {Float32Array[]}
   */
  const getChannelData = useCallback((test) => {
    const cache = decodedCacheRef.current;
    if (cache.size === 0) return [];
    const ch0 = test.options.map((opt) => {
      const decoded = cache.get(opt.audioUrl);
      return decoded ? decoded.samples[0] : new Float32Array(0);
    });
    const { entry } = getTestType(test.testType);
    for (let extra = 0; extra < entry.waveformExtraTracks; extra++) {
      if (ch0.length > 0) ch0.push(ch0[0]);
    }
    return ch0;
  }, []);

  /**
   * Look up pre-built AudioBuffers by URL and load into engine.
   * @param {object[]} bufferSources - Array of { audioUrl } objects
   */
  const loadBuffers = useCallback((bufferSources) => {
    if (!engineRef.current) return;
    const buffers = bufferSources.map((opt) =>
      audioBufferMapRef.current.get(opt.audioUrl)
    );
    engineRef.current.loadBuffers(buffers);
  }, []);

  /**
   * Apply crossfade settings from test config to the engine.
   * @param {object|null} test - Test config object (null clears settings)
   */
  const setCrossfadeConfig = useCallback((test) => {
    if (!engineRef.current) return;
    engineRef.current.setCrossfadeForced(test?.crossfade ?? null);
    if (test?.crossfadeDuration != null) {
      engineRef.current.setCrossfadeDuration(test.crossfadeDuration / 1000);
    }
  }, []);

  return {
    engineFacade,
    audioBufferMap: audioBufferMapRef.current,
    audioInitialized,
    audioError,
    loadProgress,
    sampleRateInfo: engine ? engine.getSampleRateInfo() : null,
    getChannelData,
    loadBuffers,
    setCrossfadeConfig,
  };
}
