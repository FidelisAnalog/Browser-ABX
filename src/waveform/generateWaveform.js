/**
 * Generates composite waveform data from multiple AudioBuffers.
 * Averages across all tracks to produce a single waveform that doesn't
 * reveal differences between test options (preserving blind test integrity).
 *
 * Returns an array of min/max pairs for rendering as an amplitude envelope.
 */

/**
 * Generate composite waveform data from multiple decoded audio tracks.
 * Averages the absolute amplitude across all tracks, then downsamples
 * to the requested number of display points.
 *
 * @param {Float32Array[]} channelDataArrays - Array of Float32Array per track (channel 0 from each)
 * @param {number} points - Number of display points (typically SVG width in pixels)
 * @returns {{ min: number, max: number }[]} Array of min/max pairs per display point
 */
export function generateWaveformData(channelDataArrays, points) {
  if (channelDataArrays.length === 0 || channelDataArrays[0].length === 0) {
    return [];
  }

  const sampleCount = channelDataArrays[0].length;
  const numTracks = channelDataArrays.length;

  // Average samples across all tracks
  const averaged = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (let t = 0; t < numTracks; t++) {
      sum += channelDataArrays[t][i];
    }
    averaged[i] = sum / numTracks;
  }

  // Downsample to display points
  const samplesPerPoint = sampleCount / points;
  const waveform = [];

  for (let p = 0; p < points; p++) {
    const start = Math.floor(p * samplesPerPoint);
    const end = Math.min(Math.floor((p + 1) * samplesPerPoint), sampleCount);

    let min = 0;
    let max = 0;

    for (let i = start; i < end; i++) {
      if (averaged[i] < min) min = averaged[i];
      if (averaged[i] > max) max = averaged[i];
    }

    waveform.push({ min, max });
  }

  return waveform;
}

/**
 * Extract channel 0 data from each AudioBuffer for waveform generation.
 * @param {AudioBuffer[]} buffers - Array of AudioBuffers (one per track)
 * @returns {Float32Array[]} Channel 0 data from each buffer
 */
export function extractChannel0(buffers) {
  return buffers.map((buffer) => buffer.getChannelData(0));
}
