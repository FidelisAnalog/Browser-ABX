/**
 * Embed event emitter — sends structured postMessage events to the parent window.
 * Only fires when the app is embedded in an iframe (window.parent !== window).
 * Harmless when not embedded — the check prevents self-posting.
 */

/**
 * Emit a postMessage event to the parent window.
 * @param {string} type - Event type (e.g. 'acidtest:ready', 'acidtest:progress')
 * @param {object} [data] - Event payload
 */
export function emitEvent(type, data = {}) {
  if (window.parent !== window) {
    window.parent.postMessage({ type, ...data }, '*');
  }
}
