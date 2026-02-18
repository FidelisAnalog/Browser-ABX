/**
 * Playhead — thin vertical line indicating current playback position.
 * Rendered as part of the waveform SVG.
 */

import React from 'react';

const PLAYHEAD_COLOR = '#d32f2f';
const PLAYHEAD_WIDTH = 1.5;

/**
 * @param {object} props
 * @param {number} props.x - X position in pixels
 * @param {number} props.height - Height of the waveform area
 */
export default function Playhead({ x, height }) {
  return (
    <line
      x1={x}
      y1={0}
      x2={x}
      y2={height}
      stroke={PLAYHEAD_COLOR}
      strokeWidth={PLAYHEAD_WIDTH}
      pointerEvents="none"
    />
  );
}
