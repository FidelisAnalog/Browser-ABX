/**
 * Audio loader — fetches audio files, detects format, decodes via custom pipeline,
 * validates consistency, and loads into AudioBuffers.
 *
 * Bypasses browser's decodeAudioData() entirely.
 */

import { decodeWav, isWav } from './decodeWav';
import { decodeFlac, isFlac } from './decodeFlac';

/**
 * Decoded audio metadata + raw samples, uniform across WAV and FLAC.
 * @typedef {{ sampleRate: number, bitDepth: number, channels: number, sampleCount: number, samples: Float32Array[] }} DecodedAudio
 */

/**
 * Fetch and decode a single audio file.
 * @param {string} url - URL to WAV or FLAC file
 * @returns {Promise<DecodedAudio>}
 */
export async function fetchAndDecode(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${url} (${response.status} ${response.statusText})`);
  }

  const buffer = await response.arrayBuffer();

  if (isWav(buffer)) {
    return decodeWav(buffer);
  }
  if (isFlac(buffer)) {
    return decodeFlac(buffer);
  }

  throw new Error(`Unsupported audio format for: ${url}. Only WAV and FLAC are supported.`);
}

/**
 * Load multiple audio files, decode them, and validate consistency.
 * All files in a test must have the same sample rate, channel count, and sample count.
 *
 * @param {string[]} urls - Array of audio file URLs
 * @param {(loaded: number, total: number) => void} [onProgress] - Progress callback
 * @returns {Promise<{ decoded: DecodedAudio[], sampleRate: number, channels: number, sampleCount: number }>}
 */
export async function loadAndValidate(urls, onProgress) {
  const decoded = [];
  for (let i = 0; i < urls.length; i++) {
    decoded.push(await fetchAndDecode(urls[i]));
    if (onProgress) onProgress(i + 1, urls.length);
  }

  if (decoded.length === 0) {
    throw new Error('No audio files to load');
  }

  // Validate consistency
  const { sampleRate, channels, sampleCount } = decoded[0];

  for (let i = 1; i < decoded.length; i++) {
    const d = decoded[i];
    if (d.sampleRate !== sampleRate) {
      throw new Error(
        `Sample rate mismatch: "${urls[0]}" is ${sampleRate}Hz but "${urls[i]}" is ${d.sampleRate}Hz. All files must have the same sample rate.`
      );
    }
    if (d.channels !== channels) {
      throw new Error(
        `Channel count mismatch: "${urls[0]}" has ${channels} channel(s) but "${urls[i]}" has ${d.channels}. All files must have the same channel count.`
      );
    }
    if (d.sampleCount !== sampleCount) {
      throw new Error(
        `Sample count mismatch: "${urls[0]}" has ${sampleCount} samples but "${urls[i]}" has ${d.sampleCount}. All files must be the same length.`
      );
    }
  }

  return { decoded, sampleRate, channels, sampleCount };
}

/**
 * Create an AudioBuffer from decoded audio data.
 * @param {AudioContext} audioContext
 * @param {DecodedAudio} decoded
 * @returns {AudioBuffer}
 */
export function createAudioBuffer(audioContext, decoded) {
  const buffer = audioContext.createBuffer(
    decoded.channels,
    decoded.sampleCount,
    decoded.sampleRate
  );
  for (let ch = 0; ch < decoded.channels; ch++) {
    buffer.copyToChannel(decoded.samples[ch], ch);
  }
  return buffer;
}
