/**
 * Selector hooks for AudioEngine state.
 * Each hook subscribes to a specific slice of engine state via useSyncExternalStore.
 * Components only re-render when the slice they subscribe to changes.
 *
 * All hooks accept engine as null (before audio is loaded) and return safe defaults.
 */

import { useSyncExternalStore, useMemo } from 'react';

const EMPTY_LOOP = Object.freeze([0, 0]);
const noop = () => () => {};

/** @param {import('./audioEngine').AudioEngine|null} engine */
export function useTransportState(engine) {
  const sub = useMemo(() => engine ? engine.subscribe.bind(engine) : noop, [engine]);
  const snap = useMemo(() => engine ? engine.getTransportState.bind(engine) : () => 'stopped', [engine]);
  return useSyncExternalStore(sub, snap);
}

/** @param {import('./audioEngine').AudioEngine|null} engine */
export function useSelectedTrack(engine) {
  const sub = useMemo(() => engine ? engine.subscribe.bind(engine) : noop, [engine]);
  const snap = useMemo(() => engine ? engine.getSelectedTrack.bind(engine) : () => 0, [engine]);
  return useSyncExternalStore(sub, snap);
}

/** @param {import('./audioEngine').AudioEngine|null} engine */
export function useDuration(engine) {
  const sub = useMemo(() => engine ? engine.subscribe.bind(engine) : noop, [engine]);
  const snap = useMemo(() => engine ? engine.getDuration.bind(engine) : () => 0, [engine]);
  return useSyncExternalStore(sub, snap);
}

/** @param {import('./audioEngine').AudioEngine|null} engine */
export function useLoopRegion(engine) {
  const sub = useMemo(() => engine ? engine.subscribe.bind(engine) : noop, [engine]);
  const snap = useMemo(() => engine ? engine.getLoopRegion.bind(engine) : () => EMPTY_LOOP, [engine]);
  return useSyncExternalStore(sub, snap);
}

/** @param {import('./audioEngine').AudioEngine|null} engine */
export function useVolume(engine) {
  const sub = useMemo(() => engine ? engine.subscribe.bind(engine) : noop, [engine]);
  const snap = useMemo(() => engine ? engine.getVolume.bind(engine) : () => 0.5, [engine]);
  return useSyncExternalStore(sub, snap);
}

/** @param {import('./audioEngine').AudioEngine|null} engine */
export function useDuckingEnabled(engine) {
  const sub = useMemo(() => engine ? engine.subscribe.bind(engine) : noop, [engine]);
  const snap = useMemo(() => engine ? engine.getDuckingEnabled.bind(engine) : () => false, [engine]);
  return useSyncExternalStore(sub, snap);
}
