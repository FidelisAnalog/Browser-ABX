/**
 * Event emitter — sends structured postMessage events to the opener or parent window.
 * Fires when the app was opened by another window (iframe, window.open, etc.).
 * Harmless when standalone — the check prevents self-posting.
 */

/** The window that opened us, if any (iframe parent or window.open opener) */
const targetWindow =
  window.parent !== window ? window.parent :
  window.opener ?? null;

/**
 * Emit a postMessage event to the window that opened us.
 * @param {string} type - Event type (e.g. 'acidtest:ready', 'acidtest:progress')
 * @param {object} [data] - Event payload
 */
export function emitEvent(type, data = {}) {
  if (targetWindow) {
    targetWindow.postMessage({ type, ...data }, '*');
  }
}
