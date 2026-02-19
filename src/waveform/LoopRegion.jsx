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
 * @param {{ current: boolean }} props.dragActiveRef - Shared ref to suppress click-to-seek during drags
 */
const LoopRegion = React.memo(function LoopRegion({
  loopRegion,
  duration,
  width,
  height,
  onLoopRegionChange,
  timeToX,
  dragActiveRef,
}) {
  const draggingRef = useRef(null); // 'start' | 'end' | null
  const svgRectRef = useRef(null);

  // Refs so the mousemove handler always reads current values (no stale closures)
  const loopRegionRef = useRef(loopRegion);
  loopRegionRef.current = loopRegion;
  const onChangeRef = useRef(onLoopRegionChange);
  onChangeRef.current = onLoopRegionChange;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const widthRef = useRef(width);
  widthRef.current = width;

  // Shared drag logic for both mouse and touch events
  const startDrag = useCallback(
    (handle, startClientX, svgEl, isTouch) => {
      draggingRef.current = handle;
      dragActiveRef.current = true;

      if (svgEl) {
        svgRectRef.current = svgEl.getBoundingClientRect();
      }

      const handleMove = (moveEvent) => {
        if (!draggingRef.current || !svgRectRef.current) return;
        if (isTouch) moveEvent.preventDefault(); // prevent page scroll
        const clientX = isTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const x = clientX - svgRectRef.current.left;
        const dur = durationRef.current;
        const w = widthRef.current;
        const time = Math.max(0, Math.min(w > 0 ? (x / w) * dur : 0, dur));
        const region = loopRegionRef.current;
        const onChange = onChangeRef.current;

        const MIN_LOOP = 0.5; // minimum loop duration in seconds

        if (draggingRef.current === 'start') {
          let newStart = Math.max(0, time);
          let newEnd = region[1];
          // If start reaches end, push end along
          if (newStart >= newEnd - MIN_LOOP) {
            newStart = Math.min(newStart, dur - MIN_LOOP);
            newEnd = Math.min(newStart + MIN_LOOP, dur);
          }
          onChange(newStart, newEnd);
        } else {
          let newStart = region[0];
          let newEnd = Math.min(dur, time);
          // If end reaches start, push start along
          if (newEnd <= newStart + MIN_LOOP) {
            newEnd = Math.max(newEnd, MIN_LOOP);
            newStart = Math.max(newEnd - MIN_LOOP, 0);
          }
          onChange(newStart, newEnd);
        }
      };

      const handleEnd = () => {
        draggingRef.current = null;
        // Clear drag flag after a microtask so the click event (which fires
        // synchronously after mouseup) still sees dragActiveRef=true
        setTimeout(() => { dragActiveRef.current = false; }, 0);
        if (isTouch) {
          window.removeEventListener('touchmove', handleMove);
          window.removeEventListener('touchend', handleEnd);
          window.removeEventListener('touchcancel', handleEnd);
        } else {
          window.removeEventListener('mousemove', handleMove);
          window.removeEventListener('mouseup', handleEnd);
        }
      };

      if (isTouch) {
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleEnd);
        window.addEventListener('touchcancel', handleEnd);
      } else {
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
      }
    },
    []
  );

  const handleMouseDown = useCallback(
    (handle) => (e) => {
      e.stopPropagation();
      e.preventDefault();
      startDrag(handle, e.clientX, e.target.closest('svg'), false);
    },
    [startDrag]
  );

  const handleTouchStart = useCallback(
    (handle) => (e) => {
      e.stopPropagation();
      startDrag(handle, e.touches[0].clientX, e.target.closest('svg'), true);
    },
    [startDrag]
  );

  const xToTime = useCallback(
    (x) => {
      if (width <= 0) return 0;
      return (x / width) * duration;
    },
    [width, duration]
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
        onTouchStart={handleTouchStart('start')}
        style={{ cursor: 'ew-resize', touchAction: 'none' }}
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
        onTouchStart={handleTouchStart('end')}
        style={{ cursor: 'ew-resize', touchAction: 'none' }}
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
