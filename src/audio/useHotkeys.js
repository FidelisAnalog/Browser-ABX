/**
 * useHotkeys — keyboard shortcuts for test screens.
 *
 * Space: play/pause toggle
 * A, B, C, ...: select corresponding track
 * X: select X track (ABX only)
 * Left Arrow: jump back 2 seconds
 * Enter: submit answer
 */

import { useEffect, useRef } from 'react';

const JUMP_BACK_SECONDS = 2;

/**
 * @param {object} params
 * @param {import('./audioEngine').AudioEngine|null} params.engine
 * @param {number} params.trackCount - Total number of tracks
 * @param {number|null} [params.xTrackIndex] - Index of X track (ABX only), null otherwise
 * @param {(index: number) => void} params.onTrackSelect
 * @param {() => void} params.onSubmit
 */
export function useHotkeys({ engine, trackCount, xTrackIndex = null, onTrackSelect, onSubmit }) {
  const onTrackSelectRef = useRef(onTrackSelect);
  const onSubmitRef = useRef(onSubmit);
  onTrackSelectRef.current = onTrackSelect;
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    if (!engine) return;

    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) {
        return;
      }
      if (e.target.getAttribute('role') === 'slider') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      // Space — play/pause toggle
      if (key === ' ') {
        e.preventDefault();
        const state = engine.getTransportState();
        if (state === 'playing') {
          engine.pause();
        } else {
          engine.play();
        }
        return;
      }

      // Enter — submit
      if (key === 'Enter') {
        e.preventDefault();
        onSubmitRef.current();
        return;
      }

      // Left arrow — jump back
      if (key === 'ArrowLeft') {
        e.preventDefault();
        const loopRegion = engine.getLoopRegion();
        const pos = engine.currentTime;
        engine.seek(Math.max(loopRegion[0], pos - JUMP_BACK_SECONDS));
        return;
      }

      // Letter keys — track selection
      const upper = key.toUpperCase();
      if (upper.length === 1 && upper >= 'A' && upper <= 'Z') {
        if (upper === 'X' && xTrackIndex !== null) {
          e.preventDefault();
          onTrackSelectRef.current(xTrackIndex);
          return;
        }
        const index = upper.charCodeAt(0) - 65;
        const maxLetterIndex = xTrackIndex !== null ? trackCount - 1 : trackCount;
        if (index >= 0 && index < maxLetterIndex) {
          e.preventDefault();
          onTrackSelectRef.current(index);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [engine, trackCount, xTrackIndex]);
}
