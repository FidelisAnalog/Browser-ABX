/**
 * Base64url encoding/decoding for binary data.
 * RFC 4648 §5 URL-safe variant (- and _ instead of + and /).
 * Safe to use directly in URL query parameters without percent-encoding.
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Encode Uint8Array to base64 string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;

    result += CHARS[b0 >> 2];
    result += CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? CHARS[b2 & 63] : '=';
  }
  return result;
}

/**
 * Decode base64 string to Uint8Array.
 * @param {string} str
 * @returns {Uint8Array}
 */
export function base64ToBytes(str) {
  // Remove padding
  const clean = str.replace(/=+$/, '');
  const bytes = [];

  const indexOf = (ch) => {
    const idx = CHARS.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base64url character: "${ch}"`);
    return idx;
  };

  for (let i = 0; i < clean.length; i += 4) {
    const b0 = indexOf(clean[i]);
    const b1 = i + 1 < clean.length ? indexOf(clean[i + 1]) : 0;
    const b2 = i + 2 < clean.length ? indexOf(clean[i + 2]) : 0;
    const b3 = i + 3 < clean.length ? indexOf(clean[i + 3]) : 0;

    bytes.push((b0 << 2) | (b1 >> 4));
    if (i + 2 < clean.length) bytes.push(((b1 & 15) << 4) | (b2 >> 2));
    if (i + 3 < clean.length) bytes.push(((b2 & 3) << 6) | b3);
  }

  return new Uint8Array(bytes);
}
