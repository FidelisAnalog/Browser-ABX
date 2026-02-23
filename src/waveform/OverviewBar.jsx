/**
 * OverviewBar — minimap waveform positioned above the main waveform.
 * Shows the entire audio file at low resolution with a highlighted
 * viewport rectangle indicating the currently visible zoom region.
 *
 * Interactions:
 * - Drag the viewport rectangle to pan
 * - Drag edges of the viewport to adjust zoom
 * - Click outside the viewport to recenter on that position
 */

import React, { useMemo, useRef, useCallback, useEffect, useState, useId } from 'react';
import { Box } from '@mui/material';
import { downsampleRange } from './generateWaveform';

const OVERVIEW_HEIGHT = 30;
const PLAYHEAD_COLOR = '#d32f2f';
const PLAYHEAD_WIDTH = 1.5;
const WAVEFORM_COLOR = '#90a4ae';
const WAVEFORM_ACTIVE_COLOR = '#1976d2';
const BG_COLOR = '#eceff1';
const VIEWPORT_BORDER = '#1976d2';
const HANDLE_WIDTH = 6; // px hit area on viewport edges
const CURSOR_COLOR = '#f57c00';
const CURSOR_OPACITY = 0.45;

/**
 * @param {object} props
 * @param {Float32Array} props.averaged - Pre-averaged sample data
 * @param {number} props.duration - Total duration in seconds
 * @param {number} props.viewStart - Start of visible range in seconds
 * @param {number} props.viewEnd - End of visible range in seconds
 * @param {(start: number, end: number) => void} props.onViewChange - Callback to update view range
 * @param {{ current: number }} props.currentTimeRef - Ref containing current playback position
 * @param {[number, number]} props.loopRegion - [start, end] loop cursors in seconds
 * @param {() => void} props.onGestureStart - Called when a drag gesture begins
 * @param {() => void} props.onGestureEnd - Called when a drag gesture ends
 */
const OverviewBar = React.memo(function OverviewBar({
  averaged,
  duration,
  viewStart,
  viewEnd,
  onViewChange,
  currentTimeRef,
  loopRegion,
  onGestureStart,
  onGestureEnd,
}) {
  const clipId = useId();
  const containerRef = useRef(null);
  const playheadRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const draggingRef = useRef(null); // 'pan' | 'left' | 'right' | null
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const containerWidthRef = useRef(containerWidth);
  containerWidthRef.current = containerWidth;
  const dragStartRef = useRef({ x: 0, viewStart: 0, viewEnd: 0 });

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Self-animating playhead — reads timeRef each frame, updates DOM directly
  useEffect(() => {
    if (!currentTimeRef) return;
    let rafId = null;
    let lastX = -1;
    const animate = () => {
      if (playheadRef.current) {
        const dur = durationRef.current;
        const w = containerWidthRef.current;
        const x = dur > 0 && w > 0 ? (currentTimeRef.current / dur) * w : 0;
        if (x !== lastX) {
          playheadRef.current.setAttribute('x1', x);
          playheadRef.current.setAttribute('x2', x);
          lastX = x;
        }
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [currentTimeRef]);

  // Generate overview waveform data (full file, low resolution)
  const waveformData = useMemo(
    () => downsampleRange(averaged, Math.max(1, Math.floor(containerWidth))),
    [averaged, containerWidth]
  );

  // Build SVG path
  const waveformPath = useMemo(() => {
    if (waveformData.length === 0 || containerWidth <= 0) return '';

    const midY = OVERVIEW_HEIGHT / 2;
    const scale = OVERVIEW_HEIGHT / 2;
    const barWidth = containerWidth / waveformData.length;

    let upper = `M 0 ${midY}`;
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * barWidth;
      const y = midY - waveformData[i].max * scale;
      upper += ` L ${x} ${y}`;
    }
    upper += ` L ${containerWidth} ${midY}`;

    let lower = '';
    for (let i = waveformData.length - 1; i >= 0; i--) {
      const x = i * barWidth;
      const y = midY - waveformData[i].min * scale;
      lower += ` L ${x} ${y}`;
    }

    return upper + lower + ' Z';
  }, [waveformData, containerWidth]);

  // Viewport rectangle position
  const vpLeft = duration > 0 ? (viewStart / duration) * containerWidth : 0;
  const vpRight = duration > 0 ? (viewEnd / duration) * containerWidth : containerWidth;
  const vpWidth = vpRight - vpLeft;

  // Detect zoom for viewport overlay visibility
  const isZoomed = viewStart > 0.001 || viewEnd < duration - 0.001;

  // Convert x pixel to time
  const xToTime = (x) => duration > 0 ? Math.max(0, Math.min((x / containerWidth) * duration, duration)) : 0;

  // --- Pointer handlers ---

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    if (onGestureStart) onGestureStart();
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Determine what was clicked
    if (Math.abs(x - vpLeft) <= HANDLE_WIDTH) {
      draggingRef.current = 'left';
    } else if (Math.abs(x - vpRight) <= HANDLE_WIDTH) {
      draggingRef.current = 'right';
    } else if (x >= vpLeft && x <= vpRight) {
      draggingRef.current = 'pan';
    } else {
      // Click outside viewport — recenter
      const clickTime = xToTime(x);
      const viewDur = viewEnd - viewStart;
      let newStart = clickTime - viewDur / 2;
      let newEnd = clickTime + viewDur / 2;
      if (newStart < 0) { newStart = 0; newEnd = viewDur; }
      if (newEnd > duration) { newEnd = duration; newStart = Math.max(0, duration - viewDur); }
      onViewChange(newStart, newEnd);
      // Start panning from the recentered position
      draggingRef.current = 'pan';
      dragStartRef.current = { x, viewStart: newStart, viewEnd: newEnd };
      return;
    }

    dragStartRef.current = { x, viewStart, viewEnd };
  };

  const updateCursor = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let cursor = 'pointer';
    if (draggingRef.current === 'left' || draggingRef.current === 'right') {
      cursor = 'col-resize';
    } else if (draggingRef.current === 'pan') {
      cursor = 'grabbing';
    } else if (Math.abs(x - vpLeft) <= HANDLE_WIDTH || Math.abs(x - vpRight) <= HANDLE_WIDTH) {
      cursor = 'col-resize';
    } else if (x >= vpLeft && x <= vpRight) {
      cursor = 'grab';
    }
    containerRef.current.style.cursor = cursor;
  };

  const handlePointerMove = (e) => {
    updateCursor(e);
    if (!draggingRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dx = x - dragStartRef.current.x;
    const dTime = (dx / containerWidth) * duration;
    const origStart = dragStartRef.current.viewStart;
    const origEnd = dragStartRef.current.viewEnd;
    const origDur = origEnd - origStart;

    if (draggingRef.current === 'pan') {
      let newStart = origStart + dTime;
      let newEnd = origEnd + dTime;
      if (newStart < 0) { newStart = 0; newEnd = origDur; }
      if (newEnd > duration) { newEnd = duration; newStart = Math.max(0, duration - origDur); }
      onViewChange(newStart, newEnd);
    } else if (draggingRef.current === 'left') {
      let newStart = Math.max(0, origStart + dTime);
      if (newStart > origEnd) {
        // Crossed over — swap to dragging right edge, reset drag origin
        draggingRef.current = 'right';
        dragStartRef.current = { x, viewStart: origEnd, viewEnd: Math.min(duration, newStart) };
        onViewChange(origEnd, Math.min(duration, newStart));
      } else {
        onViewChange(newStart, origEnd);
      }
    } else if (draggingRef.current === 'right') {
      let newEnd = Math.min(duration, origEnd + dTime);
      if (newEnd < origStart) {
        // Crossed over — swap to dragging left edge, reset drag origin
        draggingRef.current = 'left';
        dragStartRef.current = { x, viewStart: Math.max(0, newEnd), viewEnd: origStart };
        onViewChange(Math.max(0, newEnd), origStart);
      } else {
        onViewChange(origStart, newEnd);
      }
    }
  };

  const handlePointerUp = (e) => {
    draggingRef.current = null;
    if (onGestureEnd) onGestureEnd();
    updateCursor(e);
  };

  return (
    <Box
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      sx={{
        width: '100%',
        position: 'relative',
        userSelect: 'none',
        borderRadius: '4px 4px 0 0',
        border: '1px solid #e0e0e0',
        borderBottom: 'none',
        overflow: 'hidden',
        minHeight: OVERVIEW_HEIGHT,
        touchAction: 'none',
      }}
    >
      {containerWidth > 0 && (
        <svg
          width={containerWidth}
          height={OVERVIEW_HEIGHT}
          style={{ display: 'block' }}
        >
          {/* Background */}
          <rect x={0} y={0} width={containerWidth} height={OVERVIEW_HEIGHT} fill={BG_COLOR} />

          {/* Waveform — grey base */}
          <path d={waveformPath} fill={WAVEFORM_COLOR} opacity={0.6} />

          {/* Waveform — active region in blue (clipped to viewport) */}
          {isZoomed && <>
            <defs>
              <clipPath id={clipId}>
                <rect x={vpLeft} y={0} width={vpWidth} height={OVERVIEW_HEIGHT} />
              </clipPath>
            </defs>
            <path d={waveformPath} fill={WAVEFORM_ACTIVE_COLOR} opacity={0.7} clipPath={`url(#${clipId})`} />

            {/* Edge handles (visual indicators) */}
            <line x1={vpLeft} y1={0} x2={vpLeft} y2={OVERVIEW_HEIGHT} stroke={VIEWPORT_BORDER} strokeWidth={2} />
            <line x1={vpRight} y1={0} x2={vpRight} y2={OVERVIEW_HEIGHT} stroke={VIEWPORT_BORDER} strokeWidth={2} />
          </>}

          {/* Loop cursor markers (display-only) */}
          {loopRegion && !(loopRegion[0] <= 0.001 && loopRegion[1] >= duration - 0.001) && <>
            <line
              x1={(loopRegion[0] / duration) * containerWidth}
              y1={0}
              x2={(loopRegion[0] / duration) * containerWidth}
              y2={OVERVIEW_HEIGHT}
              stroke={CURSOR_COLOR}
              strokeWidth={1.5}
              opacity={CURSOR_OPACITY}
              pointerEvents="none"
            />
            <line
              x1={(loopRegion[1] / duration) * containerWidth}
              y1={0}
              x2={(loopRegion[1] / duration) * containerWidth}
              y2={OVERVIEW_HEIGHT}
              stroke={CURSOR_COLOR}
              strokeWidth={1.5}
              opacity={CURSOR_OPACITY}
              pointerEvents="none"
            />
          </>}

          {/* Playhead */}
          <line
            ref={playheadRef}
            x1={0} y1={0} x2={0} y2={OVERVIEW_HEIGHT}
            stroke={PLAYHEAD_COLOR}
            strokeWidth={PLAYHEAD_WIDTH}
            pointerEvents="none"
          />
        </svg>
      )}
    </Box>
  );
});

export default OverviewBar;
