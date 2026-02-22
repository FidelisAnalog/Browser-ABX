/**
 * Generates composite waveform data from multiple AudioBuffers.
 * Averages across all tracks to produce a single waveform that doesn't
 * reveal differences between test options (preserving blind test integrity).
 *
 * Two-phase pipeline for zoom support:
 * 1. averageChannels() — O(n) averaging, runs once per test load
 * 2. downsampleRange() — fast min/max over a sample subset, runs per zoom/pan
 */

/**
 * Average samples across all tracks into a single Float32Array.
 * This is the expensive O(n) step — run once and cache the result.
 *
 * @param {Float32Array[]} channelDataArrays - Channel 0 data from each track
 * @returns {Float32Array} Averaged samples
 */
export function averageChannels(channelDataArrays) {
  if (channelDataArrays.length === 0 || channelDataArrays[0].length === 0) {
    return new Float32Array(0);
  }

  const sampleCount = channelDataArrays[0].length;
  const numTracks = channelDataArrays.length;
  const averaged = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (let t = 0; t < numTracks; t++) {
      sum += channelDataArrays[t][i];
    }
    averaged[i] = sum / numTracks;
  }

  return averaged;
}

/**
 * Downsample a range of the averaged data to display points.
 * Fast min/max scan over the visible sample range only.
 *
 * @param {Float32Array} averaged - Pre-averaged sample data (from averageChannels)
 * @param {number} points - Number of display points (typically container width in pixels)
 * @param {number} [startSample=0] - First sample index of visible range
 * @param {number} [endSample] - Last sample index of visible range (defaults to full length)
 * @returns {{ min: number, max: number }[]} Array of min/max pairs per display point
 */
export function downsampleRange(averaged, points, startSample = 0, endSample) {
  if (averaged.length === 0 || points <= 0) return [];

  const end = endSample !== undefined ? endSample : averaged.length;
  const rangeSamples = end - startSample;
  if (rangeSamples <= 0) return [];

  const samplesPerPoint = rangeSamples / points;
  const waveform = [];

  for (let p = 0; p < points; p++) {
    const s0 = startSample + Math.floor(p * samplesPerPoint);
    const s1 = Math.min(startSample + Math.floor((p + 1) * samplesPerPoint), end);

    let min = 0;
    let max = 0;

    for (let i = s0; i < s1; i++) {
      if (averaged[i] < min) min = averaged[i];
      if (averaged[i] > max) max = averaged[i];
    }

    waveform.push({ min, max });
  }

  return waveform;
}

/**
 * Legacy all-in-one function — averages and downsamples in one call.
 * Used by OverviewBar which always shows the full file.
 *
 * @param {Float32Array[]} channelDataArrays - Array of Float32Array per track
 * @param {number} points - Number of display points
 * @returns {{ min: number, max: number }[]} Array of min/max pairs per display point
 */
export function generateWaveformData(channelDataArrays, points) {
  const averaged = averageChannels(channelDataArrays);
  return downsampleRange(averaged, points);
}

/**
 * Extract channel 0 data from each AudioBuffer for waveform generation.
 * @param {AudioBuffer[]} buffers - Array of AudioBuffers (one per track)
 * @returns {Float32Array[]} Channel 0 data from each buffer
 */
export function extractChannel0(buffers) {
  return buffers.map((buffer) => buffer.getChannelData(0));
}
