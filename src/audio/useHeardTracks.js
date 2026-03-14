/**
 * useHeardTracks — tracks which audio tracks have been played during a trial.
 * Resets when resetKey changes (new iteration/trial).
 * Used by test components to guard submission until required tracks are heard.
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * @param {*} resetKey - Value that triggers reset (e.g., xOption, triplet, pair)
 * @returns {{ heardTracks: Set<number>, markHeard: (index: number) => void }}
 */
export function useHeardTracks(resetKey) {
  const [heardTracks, setHeardTracks] = useState(() => new Set());

  useEffect(() => {
    setHeardTracks(new Set());
  }, [resetKey]);

  const markHeard = useCallback((index) => {
    setHeardTracks(prev => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  return { heardTracks, markHeard };
}
