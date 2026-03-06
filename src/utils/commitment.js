/**
 * Anti-cheat commitment utility — SHA-256 hash-based answer commitment.
 *
 * At iteration setup: createCommitment() hashes all possible answers with a
 * random token. The correct answer is identified only by its hash.
 * At submit time: verifyAnswer() does a synchronous map lookup to check
 * the user's selection against the stored commitment.
 *
 * This prevents answer exposure in React DevTools — state contains only
 * opaque hashes, not the correct answer.
 */

/**
 * Convert an ArrayBuffer to a hex string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash of a string.
 * @param {string} input
 * @returns {Promise<string>} Hex-encoded hash
 */
async function sha256(input) {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return bufferToHex(hash);
}

/**
 * Create a hash commitment for a trial's correct answer.
 *
 * Generates a random token and hashes every possible answer with it.
 * The correct answer is identified only by which hash matches correctHash.
 *
 * @param {string} correctAnswerId - The correct answer identifier
 * @param {string[]} allAnswerIds - All possible answer identifiers
 * @returns {Promise<{ answerHashes: Map<string, string>, correctHash: string }>}
 */
export async function createCommitment(correctAnswerId, allAnswerIds) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(16));
  const token = bufferToHex(tokenBytes);

  const answerHashes = new Map();
  for (const id of allAnswerIds) {
    answerHashes.set(id, await sha256(token + '|' + id));
  }

  const correctHash = answerHashes.get(correctAnswerId);
  if (!correctHash) {
    throw new Error(`correctAnswerId "${correctAnswerId}" not found in allAnswerIds`);
  }

  return { answerHashes, correctHash };
}

/**
 * Verify a user's answer against a commitment.
 * Synchronous — all hashes were pre-computed by createCommitment().
 *
 * @param {Map<string, string>} answerHashes - Pre-computed hash map
 * @param {string} selectedId - The user's selected answer identifier
 * @param {string} correctHash - The correct answer's hash
 * @returns {boolean} Whether the selected answer is correct
 */
export function verifyAnswer(answerHashes, selectedId, correctHash) {
  return answerHashes.get(selectedId) === correctHash;
}

/**
 * Derive the correct answer ID from a commitment (post-submission only).
 * @param {Map<string,string>} answerHashes
 * @param {string} correctHash
 * @returns {string|null}
 */
export function deriveCorrectId(answerHashes, correctHash) {
  for (const [id, hash] of answerHashes) {
    if (hash === correctHash) return id;
  }
  return null;
}
