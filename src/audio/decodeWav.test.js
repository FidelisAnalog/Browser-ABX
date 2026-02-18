import { describe, it, expect } from 'vitest';
import { decodeWav, isWav } from './decodeWav';

/**
 * Helper: build a minimal WAV file as an ArrayBuffer.
 * Generates a simple sine wave for testing.
 */
function createWavBuffer({
  sampleRate = 44100,
  bitDepth = 16,
  channels = 1,
  sampleCount = 100,
  audioFormat = 1, // PCM
} = {}) {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataSize = sampleCount * blockAlign;

  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // File size - 8
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Chunk size
  view.setUint16(20, audioFormat, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // Byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write samples: simple ramp from -1 to +1
  let offset = 44;
  for (let i = 0; i < sampleCount; i++) {
    const value = (i / (sampleCount - 1)) * 2 - 1; // -1 to +1
    for (let ch = 0; ch < channels; ch++) {
      writeSample(view, offset, value, bitDepth);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function writeSample(view, offset, value, bitDepth) {
  switch (bitDepth) {
    case 16: {
      const clamped = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, Math.round(clamped * 32767), true);
      break;
    }
    case 24: {
      const clamped = Math.max(-1, Math.min(1, value));
      const intVal = Math.round(clamped * 8388607);
      view.setUint8(offset, intVal & 0xff);
      view.setUint8(offset + 1, (intVal >> 8) & 0xff);
      view.setUint8(offset + 2, (intVal >> 16) & 0xff);
      break;
    }
    case 32: {
      const clamped = Math.max(-1, Math.min(1, value));
      view.setInt32(offset, Math.round(clamped * 2147483647), true);
      break;
    }
    case 8: {
      const clamped = Math.max(-1, Math.min(1, value));
      view.setUint8(offset, Math.round(clamped * 127 + 128));
      break;
    }
  }
}

/**
 * Helper: create a float32 WAV buffer
 */
function createFloat32WavBuffer({ sampleRate = 44100, channels = 1, sampleCount = 100 } = {}) {
  const bitDepth = 32;
  const bytesPerSample = 4;
  const blockAlign = channels * bytesPerSample;
  const dataSize = sampleCount * blockAlign;

  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < sampleCount; i++) {
    const value = (i / (sampleCount - 1)) * 2 - 1;
    for (let ch = 0; ch < channels; ch++) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
  }

  return buffer;
}

// --- Tests ---

describe('isWav', () => {
  it('returns true for valid WAV buffer', () => {
    const buffer = createWavBuffer();
    expect(isWav(buffer)).toBe(true);
  });

  it('returns false for non-WAV buffer', () => {
    const buffer = new ArrayBuffer(12);
    expect(isWav(buffer)).toBe(false);
  });

  it('returns false for buffer too small', () => {
    const buffer = new ArrayBuffer(4);
    expect(isWav(buffer)).toBe(false);
  });

  it('returns false for FLAC magic bytes', () => {
    const buffer = new ArrayBuffer(12);
    const view = new DataView(buffer);
    writeString(view, 0, 'fLaC');
    expect(isWav(buffer)).toBe(false);
  });
});

describe('decodeWav', () => {
  describe('16-bit PCM', () => {
    it('decodes mono 44100Hz', () => {
      const buffer = createWavBuffer({ sampleRate: 44100, bitDepth: 16, channels: 1, sampleCount: 100 });
      const result = decodeWav(buffer);

      expect(result.sampleRate).toBe(44100);
      expect(result.bitDepth).toBe(16);
      expect(result.channels).toBe(1);
      expect(result.sampleCount).toBe(100);
      expect(result.samples).toHaveLength(1);
      expect(result.samples[0]).toBeInstanceOf(Float32Array);
      expect(result.samples[0]).toHaveLength(100);
    });

    it('decodes stereo 48000Hz', () => {
      const buffer = createWavBuffer({ sampleRate: 48000, bitDepth: 16, channels: 2, sampleCount: 200 });
      const result = decodeWav(buffer);

      expect(result.sampleRate).toBe(48000);
      expect(result.channels).toBe(2);
      expect(result.sampleCount).toBe(200);
      expect(result.samples).toHaveLength(2);
      expect(result.samples[0]).toHaveLength(200);
      expect(result.samples[1]).toHaveLength(200);
    });

    it('produces values in [-1, 1] range', () => {
      const buffer = createWavBuffer({ sampleCount: 1000 });
      const result = decodeWav(buffer);

      for (const sample of result.samples[0]) {
        expect(sample).toBeGreaterThanOrEqual(-1);
        expect(sample).toBeLessThanOrEqual(1);
      }
    });

    it('first sample is approximately -1, last is approximately +1', () => {
      const buffer = createWavBuffer({ sampleCount: 1000 });
      const result = decodeWav(buffer);

      expect(result.samples[0][0]).toBeCloseTo(-1, 2);
      expect(result.samples[0][999]).toBeCloseTo(1, 2);
    });
  });

  describe('24-bit PCM', () => {
    it('decodes mono 96000Hz', () => {
      const buffer = createWavBuffer({ sampleRate: 96000, bitDepth: 24, channels: 1, sampleCount: 100 });
      const result = decodeWav(buffer);

      expect(result.sampleRate).toBe(96000);
      expect(result.bitDepth).toBe(24);
      expect(result.channels).toBe(1);
      expect(result.sampleCount).toBe(100);
    });

    it('produces values in [-1, 1] range', () => {
      const buffer = createWavBuffer({ bitDepth: 24, sampleCount: 1000 });
      const result = decodeWav(buffer);

      for (const sample of result.samples[0]) {
        expect(sample).toBeGreaterThanOrEqual(-1);
        expect(sample).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('32-bit integer PCM', () => {
    it('decodes correctly', () => {
      const buffer = createWavBuffer({ bitDepth: 32, sampleCount: 100 });
      const result = decodeWav(buffer);

      expect(result.bitDepth).toBe(32);
      expect(result.sampleCount).toBe(100);
      expect(result.samples[0][0]).toBeCloseTo(-1, 2);
      expect(result.samples[0][99]).toBeCloseTo(1, 2);
    });
  });

  describe('32-bit float', () => {
    it('decodes IEEE float format', () => {
      const buffer = createFloat32WavBuffer({ sampleCount: 100 });
      const result = decodeWav(buffer);

      expect(result.bitDepth).toBe(32);
      expect(result.sampleCount).toBe(100);
      expect(result.samples[0][0]).toBeCloseTo(-1, 5);
      expect(result.samples[0][99]).toBeCloseTo(1, 5);
    });
  });

  describe('8-bit PCM', () => {
    it('decodes unsigned 8-bit', () => {
      const buffer = createWavBuffer({ bitDepth: 8, sampleCount: 100 });
      const result = decodeWav(buffer);

      expect(result.bitDepth).toBe(8);
      expect(result.sampleCount).toBe(100);
    });
  });

  describe('various sample rates', () => {
    for (const rate of [44100, 48000, 96000, 192000]) {
      it(`decodes ${rate}Hz`, () => {
        const buffer = createWavBuffer({ sampleRate: rate, sampleCount: 50 });
        const result = decodeWav(buffer);
        expect(result.sampleRate).toBe(rate);
      });
    }
  });

  describe('error handling', () => {
    it('throws for non-WAV data', () => {
      const buffer = new ArrayBuffer(100);
      expect(() => decodeWav(buffer)).toThrow('Not a WAV file');
    });

    it('throws for WAV with no data chunk', () => {
      const buffer = new ArrayBuffer(44);
      const view = new DataView(buffer);
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36, true);
      writeString(view, 8, 'WAVE');
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 44100, true);
      view.setUint32(28, 88200, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      // No data chunk follows

      expect(() => decodeWav(buffer)).toThrow('no data chunk');
    });
  });

  describe('stereo deinterleaving', () => {
    it('correctly separates left and right channels', () => {
      // Create a stereo file where left = ramp up, right = ramp down
      const sampleCount = 50;
      const channels = 2;
      const bitDepth = 16;
      const bytesPerSample = 2;
      const blockAlign = channels * bytesPerSample;
      const dataSize = sampleCount * blockAlign;

      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeString(view, 8, 'WAVE');
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channels, true);
      view.setUint32(24, 44100, true);
      view.setUint32(28, 44100 * blockAlign, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitDepth, true);
      writeString(view, 36, 'data');
      view.setUint32(40, dataSize, true);

      let offset = 44;
      for (let i = 0; i < sampleCount; i++) {
        const left = (i / (sampleCount - 1)) * 2 - 1;  // -1 to +1
        const right = 1 - (i / (sampleCount - 1)) * 2;  // +1 to -1
        view.setInt16(offset, Math.round(left * 32767), true);
        offset += 2;
        view.setInt16(offset, Math.round(right * 32767), true);
        offset += 2;
      }

      const result = decodeWav(buffer);

      // Left channel ramps up
      expect(result.samples[0][0]).toBeCloseTo(-1, 2);
      expect(result.samples[0][49]).toBeCloseTo(1, 2);

      // Right channel ramps down
      expect(result.samples[1][0]).toBeCloseTo(1, 2);
      expect(result.samples[1][49]).toBeCloseTo(-1, 2);
    });
  });
});
