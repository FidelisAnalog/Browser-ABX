/**
 * Loop region overlay with draggable handles.
 * Audacity/DAW-style: shaded band over the waveform with bracket handles on edges.
 * Rendered as part of the waveform SVG.
 */

import React, { useRef, useCallback } from 'react';

const REGION_COLOR = 'rgba(255, 152, 0, 0.15)';
const HANDLE_COLOR = '#f57c00';
const HANDLE_WIDTH = 6;
const HANDLE_TRIANGLE_SIZE = 8;

/**
 * @param {object} props
 * @param {[number, number]} props.loopRegion - [start, end] in seconds
 * @param {number} props.duration - Total duration in seconds
 * @param {number} props.width - SVG width in pixels
 * @param {number} props.height - Waveform height in pixels
 * @param {(start: number, end: number) => void} props.onLoopRegionChange
 * @param {(time: number) => number} props.timeToX - Convert time to x position
 */
const LoopRegion = React.memo(function LoopRegion({
  loopRegion,
  duration,
  width,
  height,
  onLoopRegionChange,
  timeToX,
}) {
  const draggingRef = useRef(null); // 'start' | 'end' | null
  const svgRectRef = useRef(null);

  const xToTime = useCallback(
    (x) => {
      if (width <= 0) return 0;
      return (x / width) * duration;
    },
    [width, duration]
  );

  const handleMouseDown = useCallback(
    (handle) => (e) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = handle;

      // Get SVG bounding rect for mouse position calculation
      const svgEl = e.target.closest('svg');
      if (svgEl) {
        svgRectRef.current = svgEl.getBoundingClientRect();
      }

      const handleMouseMove = (moveEvent) => {
        if (!draggingRef.current || !svgRectRef.current) return;
        const x = moveEvent.clientX - svgRectRef.current.left;
        const time = Math.max(0, Math.min(xToTime(x), duration));

        if (draggingRef.current === 'start') {
          const newStart = Math.min(time, loopRegion[1] - 0.01);
          onLoopRegionChange(Math.max(0, newStart), loopRegion[1]);
        } else {
          const newEnd = Math.max(time, loopRegion[0] + 0.01);
          onLoopRegionChange(loopRegion[0], Math.min(duration, newEnd));
        }
      };

      const handleMouseUp = () => {
        draggingRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [duration, loopRegion, onLoopRegionChange, xToTime]
  );

  const startX = timeToX(loopRegion[0]);
  const endX = timeToX(loopRegion[1]);
  const regionWidth = endX - startX;

  // If loop covers the full duration, don't render the handles (no loop set)
  const isFullRange = loopRegion[0] <= 0.001 && loopRegion[1] >= duration - 0.001;

  return (
    <g>
      {/* Dimmed areas outside loop region */}
      {!isFullRange && (
        <>
          <rect
            x={0}
            y={0}
            width={startX}
            height={height}
            fill="rgba(0,0,0,0.15)"
          />
          <rect
            x={endX}
            y={0}
            width={width - endX}
            height={height}
            fill="rgba(0,0,0,0.15)"
          />
        </>
      )}

      {/* Loop region highlight */}
      {!isFullRange && (
        <rect
          x={startX}
          y={0}
          width={regionWidth}
          height={height}
          fill={REGION_COLOR}
        />
      )}

      {/* Start handle */}
      <g
        onMouseDown={handleMouseDown('start')}
        style={{ cursor: 'ew-resize' }}
      >
        {/* Hit area (wider than visual) */}
        <rect
          x={startX - HANDLE_WIDTH}
          y={0}
          width={HANDLE_WIDTH * 2}
          height={height}
          fill="transparent"
        />
        {/* Visual handle line */}
        <line
          x1={startX}
          y1={0}
          x2={startX}
          y2={height}
          stroke={HANDLE_COLOR}
          strokeWidth={2}
        />
        {/* Top triangle */}
        <polygon
          points={`${startX},0 ${startX + HANDLE_TRIANGLE_SIZE},0 ${startX},${HANDLE_TRIANGLE_SIZE}`}
          fill={HANDLE_COLOR}
        />
        {/* Bottom triangle */}
        <polygon
          points={`${startX},${height} ${startX + HANDLE_TRIANGLE_SIZE},${height} ${startX},${height - HANDLE_TRIANGLE_SIZE}`}
          fill={HANDLE_COLOR}
        />
      </g>

      {/* End handle */}
      <g
        onMouseDown={handleMouseDown('end')}
        style={{ cursor: 'ew-resize' }}
      >
        {/* Hit area */}
        <rect
          x={endX - HANDLE_WIDTH}
          y={0}
          width={HANDLE_WIDTH * 2}
          height={height}
          fill="transparent"
        />
        {/* Visual handle line */}
        <line
          x1={endX}
          y1={0}
          x2={endX}
          y2={height}
          stroke={HANDLE_COLOR}
          strokeWidth={2}
        />
        {/* Top triangle */}
        <polygon
          points={`${endX},0 ${endX - HANDLE_TRIANGLE_SIZE},0 ${endX},${HANDLE_TRIANGLE_SIZE}`}
          fill={HANDLE_COLOR}
        />
        {/* Bottom triangle */}
        <polygon
          points={`${endX},${height} ${endX - HANDLE_TRIANGLE_SIZE},${height} ${endX},${height - HANDLE_TRIANGLE_SIZE}`}
          fill={HANDLE_COLOR}
        />
      </g>
    </g>
  );
});

export default LoopRegion;
