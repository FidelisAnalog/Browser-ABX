/**
 * WAV (RIFF) parser — extracts raw PCM samples from WAV files.
 * Bypasses browser's decodeAudioData() for a controlled decode pipeline.
 *
 * Supports: PCM int16, int24, int32, float32
 * Returns: { sampleRate, bitDepth, channels, samples: Float32Array[] }
 */

const RIFF_HEADER = 0x52494646; // "RIFF"
const WAVE_FORMAT = 0x57415645; // "WAVE"
const FMT_CHUNK = 0x666d7420;  // "fmt "
const DATA_CHUNK = 0x64617461; // "data"

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

/**
 * Parse a WAV file from an ArrayBuffer into raw Float32 channel data.
 * @param {ArrayBuffer} buffer - Raw file bytes
 * @returns {{ sampleRate: number, bitDepth: number, channels: number, sampleCount: number, samples: Float32Array[] }}
 */
export function decodeWav(buffer) {
  const view = new DataView(buffer);

  // Validate RIFF header
  if (view.getUint32(0, false) !== RIFF_HEADER) {
    throw new Error('Not a WAV file: missing RIFF header');
  }
  if (view.getUint32(8, false) !== WAVE_FORMAT) {
    throw new Error('Not a WAV file: missing WAVE format identifier');
  }

  // Find fmt chunk
  let offset = 12;
  let fmtFound = false;
  let audioFormat, channels, sampleRate, bitDepth;

  while (offset < buffer.byteLength - 8) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === FMT_CHUNK) {
      audioFormat = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      // skip byteRate (4) and blockAlign (2)
      bitDepth = view.getUint16(offset + 22, true);

      // Handle WAVE_FORMAT_EXTENSIBLE — actual format is in the SubFormat GUID
      if (audioFormat === FORMAT_EXTENSIBLE && chunkSize >= 26) {
        // cbSize is at offset+24 (2 bytes), validBitsPerSample at offset+26 (2 bytes)
        // dwChannelMask at offset+28 (4 bytes), SubFormat GUID starts at offset+32
        audioFormat = view.getUint16(offset + 32, true); // First 2 bytes of SubFormat GUID
      }

      fmtFound = true;
    }

    if (chunkId === DATA_CHUNK) {
      if (!fmtFound) {
        throw new Error('WAV file has data chunk before fmt chunk');
      }

      if (audioFormat !== FORMAT_PCM && audioFormat !== FORMAT_FLOAT) {
        throw new Error(`Unsupported WAV format: ${audioFormat}. Only PCM (1) and IEEE Float (3) are supported.`);
      }

      const dataStart = offset + 8;
      const bytesPerSample = bitDepth / 8;
      const sampleCount = Math.floor(chunkSize / (bytesPerSample * channels));

      // Allocate output channels
      const samples = [];
      for (let ch = 0; ch < channels; ch++) {
        samples.push(new Float32Array(sampleCount));
      }

      // Read interleaved samples and deinterleave into per-channel Float32Arrays
      let pos = dataStart;
      for (let i = 0; i < sampleCount; i++) {
        for (let ch = 0; ch < channels; ch++) {
          samples[ch][i] = readSample(view, pos, bitDepth, audioFormat);
          pos += bytesPerSample;
        }
      }

      return { sampleRate, bitDepth, channels, sampleCount, samples };
    }

    // Skip to next chunk (chunks are word-aligned)
    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset += 1;
  }

  throw new Error('WAV file has no data chunk');
}

/**
 * Read a single sample and normalize to Float32 range [-1.0, 1.0]
 */
function readSample(view, offset, bitDepth, audioFormat) {
  if (audioFormat === FORMAT_FLOAT) {
    if (bitDepth === 32) {
      return view.getFloat32(offset, true);
    }
    if (bitDepth === 64) {
      return view.getFloat64(offset, true);
    }
    throw new Error(`Unsupported float bit depth: ${bitDepth}`);
  }

  // Integer PCM
  switch (bitDepth) {
    case 16: {
      const val = view.getInt16(offset, true);
      return val / 32768;
    }
    case 24: {
      // 24-bit is stored as 3 bytes, little-endian, signed
      const b0 = view.getUint8(offset);
      const b1 = view.getUint8(offset + 1);
      const b2 = view.getUint8(offset + 2);
      let val = (b2 << 16) | (b1 << 8) | b0;
      if (val >= 0x800000) val -= 0x1000000; // Sign extend
      return val / 8388608;
    }
    case 32: {
      const val = view.getInt32(offset, true);
      return val / 2147483648;
    }
    case 8: {
      // 8-bit WAV is unsigned, 128 = silence
      const val = view.getUint8(offset);
      return (val - 128) / 128;
    }
    default:
      throw new Error(`Unsupported PCM bit depth: ${bitDepth}`);
  }
}

/**
 * Check if an ArrayBuffer is a WAV file by examining the magic bytes.
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
export function isWav(buffer) {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  return view.getUint32(0, false) === RIFF_HEADER && view.getUint32(8, false) === WAVE_FORMAT;
}
