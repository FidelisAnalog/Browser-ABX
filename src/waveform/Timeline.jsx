/**
 * Timeline ruler — time markings along the bottom of the waveform.
 * Rendered as part of the waveform SVG.
 */

import React, { useMemo } from 'react';

const TICK_COLOR = '#757575';
const TEXT_COLOR = '#616161';
const BG_COLOR = '#eeeeee';
const FONT_SIZE = 10;

/**
 * Format seconds as M:SS or M:SS.m depending on duration.
 * @param {number} seconds
 * @param {boolean} showTenths - Show tenths of seconds
 * @returns {string}
 */
function formatTime(seconds, showTenths = false) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (showTenths) {
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  }
  return `${mins}:${Math.floor(secs).toString().padStart(2, '0')}`;
}

/**
 * Choose an appropriate tick interval based on duration and available width.
 * @param {number} duration - Total duration in seconds
 * @param {number} width - Available width in pixels
 * @returns {number} Interval in seconds
 */
function chooseInterval(duration, width) {
  const minPixelsPerTick = 60;
  const maxTicks = Math.floor(width / minPixelsPerTick);
  const idealInterval = duration / maxTicks;

  // Snap to nice intervals
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const c of candidates) {
    if (c >= idealInterval) return c;
  }
  return candidates[candidates.length - 1];
}

/**
 * @param {object} props
 * @param {number} props.duration - Total duration in seconds
 * @param {number} props.width - Width in pixels
 * @param {number} props.y - Y offset (top of timeline area)
 * @param {number} props.height - Height of timeline area
 */
export default function Timeline({ duration, width, y, height }) {
  const ticks = useMemo(() => {
    if (duration <= 0 || width <= 0) return [];

    const interval = chooseInterval(duration, width);
    const showTenths = interval < 1;
    const result = [];

    for (let t = 0; t <= duration; t += interval) {
      const x = (t / duration) * width;
      result.push({
        x,
        label: formatTime(t, showTenths),
        isMajor: true,
      });
    }

    return result;
  }, [duration, width]);

  return (
    <g>
      {/* Background */}
      <rect x={0} y={y} width={width} height={height} fill={BG_COLOR} />

      {/* Ticks and labels */}
      {ticks.map((tick, i) => (
        <g key={i}>
          <line
            x1={tick.x}
            y1={y}
            x2={tick.x}
            y2={y + 5}
            stroke={TICK_COLOR}
            strokeWidth={1}
          />
          <text
            x={tick.x + 3}
            y={y + height - 3}
            fill={TEXT_COLOR}
            fontSize={FONT_SIZE}
            fontFamily="monospace"
          >
            {tick.label}
          </text>
        </g>
      ))}
    </g>
  );
}
