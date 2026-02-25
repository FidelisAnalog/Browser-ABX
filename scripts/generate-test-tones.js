#!/usr/bin/env node
/**
 * Generate 6 test WAV files for staircase testing.
 * All files play a continuous 440Hz base tone for the full duration.
 * - Reference: just the base tone, nothing else
 * - Level 1: base tone + 1 high beep (880Hz) overlaid
 * - Level 2: base tone + 2 high beeps
 * - Level 3: base tone + 3 high beeps
 * - Level 4: base tone + 4 high beeps
 * - Level 5: base tone + 5 high beeps
 *
 * The beeps are short 880Hz bursts on top of the steady 440Hz.
 * You always hear audio. The beep count tells you the file index.
 *
 * All files: 44100 Hz, 16-bit mono, 3 seconds
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'test-audio');
mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 44100;
const DURATION = 3.0;
const BASE_FREQ = 440;
const BEEP_FREQ = 880;
const BASE_AMP = 0.5;
const BEEP_AMP = 0.4;
const BEEP_ON = 0.15;   // 150ms beep
const BEEP_OFF = 0.15;  // 150ms gap between beeps

const totalSamples = Math.round(SAMPLE_RATE * DURATION);

function generateSamples(beepCount) {
  const samples = new Float32Array(totalSamples);

  // Continuous base tone in every file
  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = BASE_AMP * Math.sin(2 * Math.PI * BASE_FREQ * t);
  }

  if (beepCount > 0) {
    // Center the beep pattern in the file
    const patternDuration = beepCount * BEEP_ON + (beepCount - 1) * BEEP_OFF;
    const patternStart = (DURATION - patternDuration) / 2;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / SAMPLE_RATE;
      const relT = t - patternStart;

      if (relT < 0 || relT >= patternDuration) continue;

      const cycleLen = BEEP_ON + BEEP_OFF;
      const cyclePos = relT % cycleLen;

      if (cyclePos < BEEP_ON) {
        // Add beep on top of base tone
        samples[i] += BEEP_AMP * Math.sin(2 * Math.PI * BEEP_FREQ * t);
      }
    }
  }

  return samples;
}

function writeWav(filename, samples) {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const numChannels = 1;
  const dataSize = numSamples * bytesPerSample * numChannels;
  const fileSize = 44 + dataSize;

  const buffer = Buffer.alloc(fileSize);
  let offset = 0;

  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;
  buffer.writeUInt32LE(SAMPLE_RATE * numChannels * bytesPerSample, offset); offset += 4;
  buffer.writeUInt16LE(numChannels * bytesPerSample, offset); offset += 2;
  buffer.writeUInt16LE(bytesPerSample * 8, offset); offset += 2;

  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  for (let i = 0; i < numSamples; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    const intVal = Math.round(val * 32767);
    buffer.writeInt16LE(intVal, offset);
    offset += 2;
  }

  writeFileSync(join(outDir, filename), buffer);
}

console.log('Generating staircase test tones...');
const names = [
  { file: 'reference', label: '440Hz steady (reference)' },
  { file: 'level-1',   label: '440Hz + 1 beep' },
  { file: 'level-2',   label: '440Hz + 2 beeps' },
  { file: 'level-3',   label: '440Hz + 3 beeps' },
  { file: 'level-4',   label: '440Hz + 4 beeps' },
  { file: 'level-5',   label: '440Hz + 5 beeps' },
];

for (let i = 0; i < names.length; i++) {
  const samples = generateSamples(i);
  writeWav(`${names[i].file}.wav`, samples);
  console.log(`  ${names[i].file}.wav  ${names[i].label}`);
}
console.log(`\nDone. Files written to public/test-audio/`);
