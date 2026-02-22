/**
 * Timeline ruler — time markings along the bottom of the waveform.
 * Rendered as part of the waveform SVG.
 * Adapts tick intervals to the visible time range (supports zoom).
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
 * Choose an appropriate tick interval based on visible duration and available width.
 * @param {number} visibleDuration - Visible time range in seconds
 * @param {number} width - Available width in pixels
 * @returns {number} Interval in seconds
 */
function chooseInterval(visibleDuration, width) {
  const minPixelsPerTick = 60;
  const maxTicks = Math.floor(width / minPixelsPerTick);
  const idealInterval = visibleDuration / maxTicks;

  // Snap to nice intervals
  const candidates = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const c of candidates) {
    if (c >= idealInterval) return c;
  }
  return candidates[candidates.length - 1];
}

/**
 * @param {object} props
 * @param {number} props.viewStart - Start of visible range in seconds
 * @param {number} props.viewEnd - End of visible range in seconds
 * @param {number} props.duration - Total duration in seconds
 * @param {number} props.width - Width in pixels
 * @param {number} props.y - Y offset (top of timeline area)
 * @param {number} props.height - Height of timeline area
 */
export default function Timeline({ viewStart, viewEnd, duration, width, y, height }) {
  const ticks = useMemo(() => {
    const visibleDuration = viewEnd - viewStart;
    if (visibleDuration <= 0 || width <= 0) return [];

    const interval = chooseInterval(visibleDuration, width);
    const showTenths = interval < 1;
    const result = [];

    // Start at the first tick >= viewStart, aligned to interval grid
    const firstTick = Math.ceil(viewStart / interval) * interval;

    for (let t = firstTick; t <= viewEnd + interval * 0.001; t += interval) {
      // Convert time to x using zoomed transform
      const x = ((t - viewStart) / visibleDuration) * width;
      if (x < -1 || x > width + 1) continue;
      result.push({
        x,
        label: formatTime(t, showTenths),
        isMajor: true,
      });
    }

    return result;
  }, [viewStart, viewEnd, width]);

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
