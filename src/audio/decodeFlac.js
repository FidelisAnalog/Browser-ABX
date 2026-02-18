/**
 * FLAC decoder — wraps @wasm-audio-decoders/flac for controlled decode.
 * Bypasses browser's decodeAudioData() for a clean pipeline.
 *
 * Returns the same shape as decodeWav for a uniform interface.
 */

import { FLACDecoder } from '@wasm-audio-decoders/flac';

const FLAC_MAGIC = 0x664c6143; // "fLaC"

/**
 * Decode a FLAC file from an ArrayBuffer into raw Float32 channel data.
 * @param {ArrayBuffer} buffer - Raw file bytes
 * @returns {Promise<{ sampleRate: number, bitDepth: number, channels: number, sampleCount: number, samples: Float32Array[] }>}
 */
export async function decodeFlac(buffer) {
  const decoder = new FLACDecoder();
  await decoder.ready;

  try {
    const result = await decoder.decodeFile(new Uint8Array(buffer));

    if (result.errors.length > 0) {
      const messages = result.errors.map((e) => e.message).join('; ');
      throw new Error(`FLAC decode errors: ${messages}`);
    }

    if (result.samplesDecoded === 0) {
      throw new Error('FLAC file decoded zero samples');
    }

    return {
      sampleRate: result.sampleRate,
      bitDepth: result.bitDepth,
      channels: result.channelData.length,
      sampleCount: result.samplesDecoded,
      samples: result.channelData,
    };
  } finally {
    decoder.free();
  }
}

/**
 * Check if an ArrayBuffer is a FLAC file by examining the magic bytes.
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
export function isFlac(buffer) {
  if (buffer.byteLength < 4) return false;
  const view = new DataView(buffer);
  return view.getUint32(0, false) === FLAC_MAGIC;
}
