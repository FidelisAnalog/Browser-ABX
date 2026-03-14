/**
 * useAppEvents — boundary adapter.
 * Single owner of ALL outbound postMessage events.
 *
 * State-driven events (observed):
 * - acidtest:ready — on mount
 * - acidtest:resize — when contentHeight changes (DOM measurement from Layout)
 *
 * Lifecycle events (received via onTestEvent callback):
 * - acidtest:loading — audio load progress
 * - acidtest:started — test started
 * - acidtest:progress — trial completed
 * - acidtest:completed — all tests finished
 * - acidtest:error — config or audio errors
 */

import { useEffect, useCallback, useRef } from 'react';
import { emitEvent } from '../utils/events';

/**
 * @param {object} params
 * @param {number|null} params.contentHeight - Layout content height (from Layout callback)
 * @returns {{ onTestEvent: (type: string, data: object) => void }}
 */
export function useAppEvents({ contentHeight }) {
  // Emit acidtest:ready on mount
  const readyEmittedRef = useRef(false);
  useEffect(() => {
    if (!readyEmittedRef.current) {
      readyEmittedRef.current = true;
      emitEvent('acidtest:ready');
    }
  }, []);

  // Emit acidtest:resize when content height changes
  useEffect(() => {
    if (contentHeight != null) {
      emitEvent('acidtest:resize', { height: contentHeight });
    }
  }, [contentHeight]);

  /**
   * Callback for app lifecycle events.
   * Maps internal event names to acidtest: postMessage events.
   */
  const onTestEvent = useCallback((type, data) => {
    emitEvent(`acidtest:${type}`, data);
  }, []);

  return { onTestEvent };
}
