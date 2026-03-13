/**
 * Loop region overlay — SVG visuals only.
 * Audacity/DAW-style: shaded band over the waveform with bracket handles on edges.
 * Interaction (drag) is handled by HTML overlay divs in Waveform.jsx.
 */

import React from 'react';
import { useTheme } from '@mui/material';
import { isFullRange } from './generateWaveform';
const HANDLE_TRIANGLE_SIZE = 8;

/**
 * @param {object} props
 * @param {[number, number]} props.loopRegion - [start, end] in seconds
 * @param {number} props.duration - Total duration in seconds
 * @param {number} props.width - SVG width in pixels
 * @param {number} props.height - Waveform height in pixels
 * @param {(time: number) => number} props.timeToX - Convert time to x position
 */
const LoopRegion = React.memo(function LoopRegion({
  loopRegion,
  duration,
  width,
  height,
  timeToX,
}) {
  const theme = useTheme();
  const startX = timeToX(loopRegion[0]);
  const endX = timeToX(loopRegion[1]);
  const regionWidth = endX - startX;

  // If loop covers the full duration, don't render (no loop set)
  const fullRange = isFullRange(loopRegion[0], loopRegion[1], duration);

  return (
    <g>
      {/* Dimmed areas outside loop region */}
      {!fullRange && (
        <>
          <rect
            x={0}
            y={0}
            width={Math.max(0, startX)}
            height={height}
            fill={theme.palette.waveform.loopDim}
          />
          <rect
            x={endX}
            y={0}
            width={Math.max(0, width - endX)}
            height={height}
            fill={theme.palette.waveform.loopDim}
          />
        </>
      )}

      {/* Loop region highlight */}
      {!fullRange && (
        <rect
          x={startX}
          y={0}
          width={Math.max(0, regionWidth)}
          height={height}
          fill={theme.palette.waveform.loopRegion}
        />
      )}

      {/* Start handle — visual only */}
      <line
        x1={startX}
        y1={0}
        x2={startX}
        y2={height}
        stroke={theme.palette.waveform.loopHandle}
        strokeWidth={2}
        style={{ pointerEvents: 'none' }}
      />
      <polygon
        points={`${startX},0 ${startX + HANDLE_TRIANGLE_SIZE},0 ${startX},${HANDLE_TRIANGLE_SIZE}`}
        fill={theme.palette.waveform.loopHandle}
        style={{ pointerEvents: 'none' }}
      />
      <polygon
        points={`${startX},${height} ${startX + HANDLE_TRIANGLE_SIZE},${height} ${startX},${height - HANDLE_TRIANGLE_SIZE}`}
        fill={theme.palette.waveform.loopHandle}
        style={{ pointerEvents: 'none' }}
      />

      {/* End handle — visual only */}
      <line
        x1={endX}
        y1={0}
        x2={endX}
        y2={height}
        stroke={theme.palette.waveform.loopHandle}
        strokeWidth={2}
        style={{ pointerEvents: 'none' }}
      />
      <polygon
        points={`${endX},0 ${endX - HANDLE_TRIANGLE_SIZE},0 ${endX},${HANDLE_TRIANGLE_SIZE}`}
        fill={theme.palette.waveform.loopHandle}
        style={{ pointerEvents: 'none' }}
      />
      <polygon
        points={`${endX},${height} ${endX - HANDLE_TRIANGLE_SIZE},${height} ${endX},${height - HANDLE_TRIANGLE_SIZE}`}
        fill={theme.palette.waveform.loopHandle}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
});

export default LoopRegion;
