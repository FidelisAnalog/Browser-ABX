/**
 * useAudioEngine — audio engine management hook.
 * Creates AudioEngine from decoded audio data, manages AudioBuffer map,
 * exposes facade, handles cleanup. No I/O — receives already-decoded data.
 *
 * @param {Map<string, DecodedAudio>|null} decodedCache - Decoded audio cache (url → DecodedAudio)
 * @param {number|null} sampleRate - Audio sample rate
 * @returns {{
 *   engineFacade: object|null,
 *   initialized: boolean,
 *   sampleRateInfo: object|null,
 *   loadBuffers: (bufferSources: object[]) => void,
 *   setCrossfadeConfig: (test: object|null) => void,
 * }}
 */

import { useMemo, useEffect, useCallback, useRef } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { createAudioBufferMap } from '../audio/audioLoader';

export function useAudioEngine(decodedCache, sampleRate) {
  const engineRef = useRef(null);
  const audioBufferMapRef = useRef(null);

  // Create engine once when decoded data is available (synchronous, deterministic)
  if (sampleRate && decodedCache && !engineRef.current) {
    engineRef.current = new AudioEngine(sampleRate);
    audioBufferMapRef.current = createAudioBufferMap(
      engineRef.current.context, decodedCache
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
    initialized: !!engine,
    sampleRateInfo: engine ? engine.getSampleRateInfo() : null,
    loadBuffers,
    setCrossfadeConfig,
  };
}
