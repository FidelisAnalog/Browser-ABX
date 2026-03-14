/**
 * Branding rules engine.
 * Pure logic — takes screen name + embed state, returns what to show in each slot.
 * Layout interprets the output; this module never renders anything.
 *
 * @param {string} screen - Current screen ('landing'|'shared-results'|'loading'|'welcome'|'test'|'results'|'error')
 * @param {boolean} isEmbedded - Whether running inside an iframe
 * @returns {{ header: object|null, footer: object|null }}
 */
export function getBranding(screen, isEmbedded) {
  return {
    header: null, // Reserved for future branding

    footer: isEmbedded && (screen === 'test' || screen === 'results')
      ? { type: 'attribution', url: 'https://acidtest.io', text: 'acidtest.io' }
      : null,
  };
}
