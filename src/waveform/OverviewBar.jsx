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

import React, { useMemo, useRef, useEffect, useState, useCallback, useId } from 'react';
import { Box, useTheme } from '@mui/material';
import { downsampleRange, buildEnvelopePath, isFullRange, isViewZoomed } from './generateWaveform';

const OVERVIEW_HEIGHT = 30;
const PLAYHEAD_WIDTH = 1.5;
const HANDLE_WIDTH = 20; // px hit area on viewport edges
const CURSOR_WIDTH = 6;  // px cursor zone for mouse (narrower than hit area)

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
  const theme = useTheme();
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

  // Refs so pointer handlers always read current values (no stale closures)
  const viewStartRef = useRef(viewStart);
  viewStartRef.current = viewStart;
  const viewEndRef = useRef(viewEnd);
  viewEndRef.current = viewEnd;
  const vpLeftRef = useRef(0);
  const vpRightRef = useRef(0);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const onGestureStartRef = useRef(onGestureStart);
  onGestureStartRef.current = onGestureStart;
  const onGestureEndRef = useRef(onGestureEnd);
  onGestureEndRef.current = onGestureEnd;

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
  const waveformPath = useMemo(
    () => buildEnvelopePath(waveformData, containerWidth, OVERVIEW_HEIGHT),
    [waveformData, containerWidth]
  );

  // Viewport rectangle position
  const vpLeft = duration > 0 ? (viewStart / duration) * containerWidth : 0;
  const vpRight = duration > 0 ? (viewEnd / duration) * containerWidth : containerWidth;
  const vpWidth = vpRight - vpLeft;
  vpLeftRef.current = vpLeft;
  vpRightRef.current = vpRight;

  // Detect zoom for viewport overlay visibility
  const isZoomed = isViewZoomed(viewStart, viewEnd, duration);

  // Convert x pixel to time
  const xToTime = useCallback(
    (x) => duration > 0 ? Math.max(0, Math.min((x / containerWidth) * duration, duration)) : 0,
    [duration, containerWidth]
  );

  // --- Pointer handlers ---

  const updateCursor = useCallback((e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const vl = vpLeftRef.current;
    const vr = vpRightRef.current;
    let cursor = 'pointer';
    if (draggingRef.current === 'left' || draggingRef.current === 'right') {
      cursor = 'col-resize';
    } else if (draggingRef.current === 'pan') {
      cursor = 'grabbing';
    } else if (Math.abs(x - vl) <= CURSOR_WIDTH || Math.abs(x - vr) <= CURSOR_WIDTH) {
      cursor = 'col-resize';
    } else if (x >= vl && x <= vr) {
      cursor = 'grab';
    }
    containerRef.current.style.cursor = cursor;
  }, []);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    if (onGestureStartRef.current) onGestureStartRef.current();
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dur = durationRef.current;
    const w = containerWidthRef.current;
    const vl = vpLeftRef.current;
    const vr = vpRightRef.current;
    const vs = viewStartRef.current;
    const ve = viewEndRef.current;

    // Determine what was clicked — narrow hit zone for mouse, wide for touch
    const hitWidth = e.pointerType === 'mouse' ? CURSOR_WIDTH : HANDLE_WIDTH;
    if (Math.abs(x - vl) <= hitWidth) {
      draggingRef.current = 'left';
    } else if (Math.abs(x - vr) <= hitWidth) {
      draggingRef.current = 'right';
    } else if (x >= vl && x <= vr) {
      draggingRef.current = 'pan';
    } else {
      // Click/tap outside viewport — recenter
      const clickTime = dur > 0 ? Math.max(0, Math.min((x / w) * dur, dur)) : 0;
      const viewDur = ve - vs;
      let newStart = clickTime - viewDur / 2;
      let newEnd = clickTime + viewDur / 2;
      if (newStart < 0) { newStart = 0; newEnd = viewDur; }
      if (newEnd > dur) { newEnd = dur; newStart = Math.max(0, dur - viewDur); }
      onViewChangeRef.current(newStart, newEnd);
      // Start panning from the recentered position
      draggingRef.current = 'pan';
      dragStartRef.current = { x, viewStart: newStart, viewEnd: newEnd };
      return;
    }

    dragStartRef.current = { x, viewStart: vs, viewEnd: ve };
  }, []);

  const handlePointerMove = useCallback((e) => {
    updateCursor(e);
    if (!draggingRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dx = x - dragStartRef.current.x;
    const dur = durationRef.current;
    const w = containerWidthRef.current;
    const dTime = (dx / w) * dur;
    const origStart = dragStartRef.current.viewStart;
    const origEnd = dragStartRef.current.viewEnd;
    const origDur = origEnd - origStart;
    const onChange = onViewChangeRef.current;

    if (draggingRef.current === 'pan') {
      let newStart = origStart + dTime;
      let newEnd = origEnd + dTime;
      if (newStart < 0) { newStart = 0; newEnd = origDur; }
      if (newEnd > dur) { newEnd = dur; newStart = Math.max(0, dur - origDur); }
      onChange(newStart, newEnd);
    } else if (draggingRef.current === 'left') {
      let newStart = Math.max(0, origStart + dTime);
      if (newStart > origEnd) {
        draggingRef.current = 'right';
        dragStartRef.current = { x, viewStart: origEnd, viewEnd: Math.min(dur, newStart) };
        onChange(origEnd, Math.min(dur, newStart));
      } else {
        onChange(newStart, origEnd);
      }
    } else if (draggingRef.current === 'right') {
      let newEnd = Math.min(dur, origEnd + dTime);
      if (newEnd < origStart) {
        draggingRef.current = 'left';
        dragStartRef.current = { x, viewStart: Math.max(0, newEnd), viewEnd: origStart };
        onChange(Math.max(0, newEnd), origStart);
      } else {
        onChange(origStart, newEnd);
      }
    }
  }, [updateCursor]);

  const handlePointerUp = useCallback((e) => {
    draggingRef.current = null;
    if (onGestureEndRef.current) onGestureEndRef.current();
    updateCursor(e);
  }, [updateCursor]);


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
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
        borderRadius: '4px 4px 0 0',
        border: `1px solid ${theme.palette.waveform.border}`,
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
          <rect x={0} y={0} width={containerWidth} height={OVERVIEW_HEIGHT} fill={theme.palette.waveform.overviewBackground} />

          {/* Waveform — grey base */}
          <path d={waveformPath} fill={theme.palette.waveform.overviewFill} opacity={0.6} />

          {/* Waveform — active region in blue (clipped to viewport) */}
          {isZoomed && <>
            <defs>
              <clipPath id={clipId}>
                <rect x={vpLeft} y={0} width={vpWidth} height={OVERVIEW_HEIGHT} />
              </clipPath>
            </defs>
            <path d={waveformPath} fill={theme.palette.waveform.overviewActiveFill} opacity={0.7} clipPath={`url(#${clipId})`} />

            {/* Edge handles (visual indicators) */}
            <line x1={vpLeft} y1={0} x2={vpLeft} y2={OVERVIEW_HEIGHT} stroke={theme.palette.waveform.overviewActiveFill} strokeWidth={2} />
            <line x1={vpRight} y1={0} x2={vpRight} y2={OVERVIEW_HEIGHT} stroke={theme.palette.waveform.overviewActiveFill} strokeWidth={2} />
          </>}

          {/* Loop region highlight (display-only) */}
          {loopRegion && !isFullRange(loopRegion[0], loopRegion[1], duration) && (() => {
            const loopStartX = (loopRegion[0] / duration) * containerWidth;
            const loopEndX = (loopRegion[1] / duration) * containerWidth;
            return <>
              <rect
                x={loopStartX}
                y={0}
                width={Math.max(0, loopEndX - loopStartX)}
                height={OVERVIEW_HEIGHT}
                fill={theme.palette.waveform.loopRegion}
                pointerEvents="none"
              />
              <line
                x1={loopStartX} y1={0} x2={loopStartX} y2={OVERVIEW_HEIGHT}
                stroke={theme.palette.waveform.loopHandle}
                strokeWidth={1.5}
                pointerEvents="none"
              />
              <line
                x1={loopEndX} y1={0} x2={loopEndX} y2={OVERVIEW_HEIGHT}
                stroke={theme.palette.waveform.loopHandle}
                strokeWidth={1.5}
                pointerEvents="none"
              />
            </>;
          })()}

          {/* Playhead */}
          <line
            ref={playheadRef}
            x1={0} y1={0} x2={0} y2={OVERVIEW_HEIGHT}
            stroke={theme.palette.waveform.playhead}
            strokeWidth={PLAYHEAD_WIDTH}
            pointerEvents="none"
          />
        </svg>
      )}
    </Box>
  );
});

export default OverviewBar;
