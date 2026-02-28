/**
 * SVG waveform display component with zoom and pan.
 * Renders a static composite waveform as a mirrored amplitude envelope.
 * Handles click-to-seek, cursor drag, and zoom/pan interaction.
 *
 * Zoom model: viewStart/viewEnd in seconds define the visible time range.
 * When viewStart=0 and viewEnd=duration, the full file is visible (1x zoom).
 * timeToX converts time→pixels using the visible range; everything downstream
 * (playhead, loop handles, timeline, seek) uses timeToX and works automatically.
 *
 * Cursor drag uses HTML div overlays with the Pointer Events API
 * (not SVG elements) so hit areas work reliably on touch devices
 * including at the edges of the waveform.
 */

import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { averageChannels, downsampleRange } from './generateWaveform';
import LoopRegion from './LoopRegion';
import Playhead from './Playhead';
import Timeline from './Timeline';
import OverviewBar from './OverviewBar';

const WAVEFORM_HEIGHT = 120;
const TIMELINE_HEIGHT = 24;
const TOTAL_HEIGHT = WAVEFORM_HEIGHT + TIMELINE_HEIGHT;
const WAVEFORM_COLOR = '#1976d2';
const WAVEFORM_BG = '#f5f5f5';

// Handle hit area: 44px total, biased outward from the loop region.
// Start handle extends left, end handle extends right.
const HIT_OUTWARD = 40;  // px extending away from loop region
const HIT_INWARD = 4;    // px extending into loop region
const MIN_LOOP = 0.5;    // minimum loop duration in seconds

// Zoom constraints
const MIN_VIEW_DURATION = 0.05;  // 50ms minimum visible range
const MAX_ZOOM_RATIO = 1000;     // max zoom = duration / 1000
const ZOOM_FACTOR = 0.008;       // zoom sensitivity for wheel events
const PAN_FACTOR = 0.25;         // pan by 25% of view width per Shift+scroll step

/**
 * @param {object} props
 * @param {Float32Array[]} props.channelData - Channel 0 data from each track (for composite)
 * @param {number} props.duration - Total duration in seconds
 * @param {{ current: number }} props.currentTimeRef - Ref containing current playback position
 * @param {[number, number]} props.loopRegion - [start, end] in seconds
 * @param {(time: number) => void} props.onSeek - Seek callback
 * @param {(start: number, end: number) => void} props.onLoopRegionChange - Loop region change callback
 */
const Waveform = React.memo(function Waveform({
  channelData,
  duration,
  currentTimeRef,
  loopRegion,
  onSeek,
  onLoopRegionChange,
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const dragActiveRef = useRef(false);
  const draggingRef = useRef(null); // 'start' | 'end' | null
  const containerRectRef = useRef(null);
  const panDragRef = useRef({ startX: null, moved: false });
  const scrollRef = useRef(null);
  const scrollCausedViewChangeRef = useRef(false);
  const scrollEndTimerRef = useRef(null);

  // Refs so pointer handlers always read current values (no stale closures)
  const loopRegionRef = useRef(loopRegion);
  loopRegionRef.current = loopRegion;
  const onChangeRef = useRef(onLoopRegionChange);
  onChangeRef.current = onLoopRegionChange;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  // --- Zoom state ---
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(duration);
  const viewStartRef = useRef(viewStart);
  viewStartRef.current = viewStart;
  const viewEndRef = useRef(viewEnd);
  viewEndRef.current = viewEnd;

  // --- Playhead follow state ---
  const followActiveRef = useRef(false);
  const gestureActiveRef = useRef(false);

  // Reset zoom when duration changes (new test loaded)
  useEffect(() => {
    setViewStart(0);
    setViewEnd(duration);
  }, [duration]);


  // Measure container width — start at 0 so the SVG is not rendered until
  // the ResizeObserver fires with the real width (avoids a width-flash).
  const [containerWidth, setContainerWidth] = useState(0);
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

  const widthRef = useRef(containerWidth);
  widthRef.current = containerWidth;

  // --- Waveform data pipeline (two-phase for zoom) ---

  // Phase 1: Average channels once per test load (expensive O(n))
  const averaged = useMemo(
    () => averageChannels(channelData),
    [channelData]
  );

  // Phase 2: Downsample visible range (fast, runs per zoom/pan)
  const waveformData = useMemo(() => {
    if (averaged.length === 0 || containerWidth <= 0 || duration <= 0) return [];
    const sr = averaged.length / duration;
    const startSample = Math.floor(viewStart * sr);
    const endSample = Math.min(Math.ceil(viewEnd * sr), averaged.length);
    return downsampleRange(averaged, Math.max(1, Math.floor(containerWidth)), startSample, endSample);
  }, [averaged, containerWidth, viewStart, viewEnd, duration]);

  // Build SVG path for the waveform envelope
  const waveformPath = useMemo(() => {
    if (waveformData.length === 0) return '';

    const midY = WAVEFORM_HEIGHT / 2;
    const scale = WAVEFORM_HEIGHT / 2;
    const barWidth = containerWidth / waveformData.length;

    // Upper envelope (max values, left to right)
    let upper = `M 0 ${midY}`;
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * barWidth;
      const y = midY - waveformData[i].max * scale;
      upper += ` L ${x} ${y}`;
    }
    upper += ` L ${containerWidth} ${midY}`;

    // Lower envelope (min values, right to left)
    let lower = '';
    for (let i = waveformData.length - 1; i >= 0; i--) {
      const x = i * barWidth;
      const y = midY - waveformData[i].min * scale;
      lower += ` L ${x} ${y}`;
    }

    return upper + lower + ' Z';
  }, [waveformData, containerWidth]);

  // --- Coordinate transforms (zoom-aware) ---

  const timeToX = useCallback(
    (time) => {
      const viewDur = viewEnd - viewStart;
      if (viewDur <= 0) return 0;
      return ((time - viewStart) / viewDur) * containerWidth;
    },
    [viewStart, viewEnd, containerWidth]
  );

  const xToTime = useCallback(
    (x) => {
      const viewDur = viewEnd - viewStart;
      if (containerWidth <= 0) return viewStart;
      return viewStart + (x / containerWidth) * viewDur;
    },
    [viewStart, viewEnd, containerWidth]
  );

  // Store timeToX in a ref for the Playhead rAF loop
  const timeToXRef = useRef(timeToX);
  timeToXRef.current = timeToX;

  // Stable ref-based timeToX for Playhead (avoids re-creating on every zoom)
  const timeToXForPlayhead = useCallback(
    (time) => timeToXRef.current(time),
    []
  );

  // --- User-initiated viewport changes ---
  // All user zoom/pan goes through setUserView. Disengages follow immediately,
  // then re-engages only if playhead is in the new bounds AND no gesture is active.
  // The rAF follow loop uses setViewStart/setViewEnd directly to avoid triggering this.
  const setUserView = useCallback((newStart, newEnd) => {
    followActiveRef.current = false;
    setViewStart(newStart);
    setViewEnd(newEnd);
    if (!gestureActiveRef.current) {
      const pos = currentTimeRef ? currentTimeRef.current : 0;
      followActiveRef.current = (pos >= newStart && pos <= newEnd);
    }
  }, [currentTimeRef]);

  // Called at gesture end to evaluate whether to re-engage follow
  const checkFollowEngage = useCallback(() => {
    const pos = currentTimeRef ? currentTimeRef.current : 0;
    const vs = viewStartRef.current;
    const ve = viewEndRef.current;
    followActiveRef.current = (pos >= vs && pos <= ve);
  }, [currentTimeRef]);

  // --- Zoom helpers ---

  const applyZoom = useCallback((delta, centerX) => {
    const dur = durationRef.current;
    if (dur <= 0) return;

    const vs = viewStartRef.current;
    const ve = viewEndRef.current;
    const viewDur = ve - vs;
    const w = widthRef.current;

    // Zoom center in time
    const centerTime = w > 0 ? vs + (centerX / w) * viewDur : (vs + ve) / 2;

    // Scale factor — positive delta = zoom out (larger view), negative = zoom in (smaller view)
    const scale = Math.exp(delta * ZOOM_FACTOR);
    const newViewDur = Math.max(MIN_VIEW_DURATION, Math.min(dur, viewDur * scale));

    // Maintain center position ratio
    const ratio = w > 0 ? centerX / w : 0.5;
    let newStart = centerTime - newViewDur * ratio;
    let newEnd = centerTime + newViewDur * (1 - ratio);

    // Clamp to [0, duration]
    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(newViewDur, dur);
    }
    if (newEnd > dur) {
      newEnd = dur;
      newStart = Math.max(0, dur - newViewDur);
    }

    setUserView(newStart, newEnd);
  }, [setUserView]);

  const applyPan = useCallback((deltaFraction) => {
    const dur = durationRef.current;
    const vs = viewStartRef.current;
    const ve = viewEndRef.current;
    const viewDur = ve - vs;
    const shift = viewDur * deltaFraction;

    let newStart = vs + shift;
    let newEnd = ve + shift;

    if (newStart < 0) {
      newStart = 0;
      newEnd = viewDur;
    }
    if (newEnd > dur) {
      newEnd = dur;
      newStart = Math.max(0, dur - viewDur);
    }

    setUserView(newStart, newEnd);
  }, [setUserView]);

  const resetZoom = useCallback(() => {
    setUserView(0, durationRef.current);
  }, [setUserView]);

  // Expose zoom controls via ref for external use (overview bar)
  const zoomControlsRef = useRef({ applyZoom, applyPan, resetZoom, setViewStart, setViewEnd });
  zoomControlsRef.current = { applyZoom, applyPan, resetZoom, setViewStart, setViewEnd };

  // --- Playhead follow (iZotope RX-style) ---
  // Follow is opt-in: engages when user pans/zooms viewport to include the
  // playhead, or when playback starts with playhead in view. Disengages when
  // user moves viewport away. Playhead drifting into viewport on its own
  // does NOT engage follow. When engaged, pages forward on right-edge exit
  // and snaps on left-edge exit (loop wrap).

  useEffect(() => {
    if (!currentTimeRef) return;
    let rafId = null;
    let lastPos = currentTimeRef.current;
    let wasMoving = false;

    const checkFollow = () => {
      const vs = viewStartRef.current;
      const ve = viewEndRef.current;
      const dur = durationRef.current;
      const viewDur = ve - vs;
      const isZoomed = vs > 0.001 || ve < dur - 0.001;
      const pos = currentTimeRef.current;
      const isMoving = Math.abs(pos - lastPos) > 0.0001;

      // Detect playback start — engage follow if playhead is in view
      if (isMoving && !wasMoving && isZoomed) {
        if (pos >= vs && pos <= ve) {
          followActiveRef.current = true;
        }
      }

      wasMoving = isMoving;
      lastPos = pos;

      if (followActiveRef.current && isMoving && isZoomed) {
        if (pos > ve) {
          // Playhead past right edge — page forward
          let newStart = ve;
          let newEnd = ve + viewDur;
          if (newEnd > dur) { newEnd = dur; newStart = Math.max(0, dur - viewDur); }
          setViewStart(newStart);
          setViewEnd(newEnd);
        } else if (pos < vs) {
          // Playhead past left edge (loop wrap) — snap to show playhead
          let newStart = pos;
          let newEnd = pos + viewDur;
          if (newEnd > dur) { newEnd = dur; newStart = Math.max(0, dur - viewDur); }
          if (newStart < 0) { newStart = 0; newEnd = Math.min(viewDur, dur); }
          setViewStart(newStart);
          setViewEnd(newEnd);
        }
      }

      rafId = requestAnimationFrame(checkFollow);
    };

    rafId = requestAnimationFrame(checkFollow);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [currentTimeRef]);

  // --- Keyboard zoom shortcuts ---

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      if (e.target.getAttribute('role') === 'slider') return;

      // +/= — zoom in (centered on playhead)
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const pos = currentTimeRef ? currentTimeRef.current : 0;
        const centerX = timeToXRef.current(pos);
        applyZoom(-30, centerX); // negative delta = zoom in
        return;
      }

      // - — zoom out (centered on playhead)
      if (e.key === '-') {
        e.preventDefault();
        const pos = currentTimeRef ? currentTimeRef.current : 0;
        const centerX = timeToXRef.current(pos);
        applyZoom(30, centerX); // positive delta = zoom out
        return;
      }

      // 0 — reset zoom
      if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        resetZoom();
        return;
      }

      // Shift+Left/Right — pan
      if (e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        applyPan(-PAN_FACTOR);
        return;
      }
      if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        applyPan(PAN_FACTOR);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [applyZoom, applyPan, resetZoom]);

  // --- Wheel event handler (zoom + pan) ---

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let gestureEndTimer = null;
    let lastGestureScale = 1;

    const startWheelGesture = () => {
      gestureActiveRef.current = true;
      if (gestureEndTimer) clearTimeout(gestureEndTimer);
      gestureEndTimer = setTimeout(() => {
        gestureActiveRef.current = false;
        checkFollowEngage();
      }, 150);
    };

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+scroll or trackpad pinch → zoom
        e.preventDefault();
        startWheelGesture();
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        applyZoom(e.deltaY, x);
      } else if (e.shiftKey) {
        // Shift+scroll → horizontal pan (proportional to scroll amount)
        e.preventDefault();
        startWheelGesture();
        const delta = e.deltaX || e.deltaY;
        // Trackpad fires small deltas (1-10px); scale to fraction of view width
        applyPan(delta / 500);
      } else {
        // No modifier — horizontal scroll pans waveform when zoomed
        const vs = viewStartRef.current;
        const ve = viewEndRef.current;
        const dur = durationRef.current;
        const isZoomed = vs > 0.001 || ve < dur - 0.001;
        if (isZoomed && Math.abs(e.deltaX) > 1) {
          e.preventDefault();
          startWheelGesture();
          applyPan(e.deltaX / 500);
        }
        // Otherwise let page scroll naturally
      }
    };

    // Safari gesture events for trackpad pinch
    const handleGestureStart = (e) => {
      e.preventDefault();
      lastGestureScale = e.scale;
    };

    const handleGestureChange = (e) => {
      e.preventDefault();
      startWheelGesture();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // Use incremental scale change, not cumulative offset from 1
      const delta = -(e.scale - lastGestureScale) * 100;
      lastGestureScale = e.scale;
      applyZoom(delta, x);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('gesturestart', handleGestureStart, { passive: false });
    el.addEventListener('gesturechange', handleGestureChange, { passive: false });

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('gesturestart', handleGestureStart);
      el.removeEventListener('gesturechange', handleGestureChange);
      if (gestureEndTimer) clearTimeout(gestureEndTimer);
    };
  }, [applyZoom, applyPan, checkFollowEngage]);

  // --- Touch pinch-to-zoom ---

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let initialDistance = 0;
    let initialViewStart = 0;
    let initialViewEnd = 0;
    let pinchActive = false;

    const getDistance = (t1, t2) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const getMidX = (t1, t2, rect) =>
      ((t1.clientX + t2.clientX) / 2) - rect.left;

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchActive = true;
        gestureActiveRef.current = true;
        initialDistance = getDistance(e.touches[0], e.touches[1]);
        initialViewStart = viewStartRef.current;
        initialViewEnd = viewEndRef.current;
      }
    };

    const handleTouchMove = (e) => {
      if (!pinchActive || e.touches.length !== 2) return;
      const newDist = getDistance(e.touches[0], e.touches[1]);
      const scale = initialDistance / newDist; // >1 = zoom out, <1 = zoom in
      const rect = el.getBoundingClientRect();
      const midX = getMidX(e.touches[0], e.touches[1], rect);
      const dur = durationRef.current;
      const w = widthRef.current;

      const initialViewDur = initialViewEnd - initialViewStart;
      const newViewDur = Math.max(MIN_VIEW_DURATION, Math.min(dur, initialViewDur * scale));
      const centerTime = w > 0
        ? initialViewStart + (midX / w) * initialViewDur
        : (initialViewStart + initialViewEnd) / 2;

      const ratio = w > 0 ? midX / w : 0.5;
      let newStart = centerTime - newViewDur * ratio;
      let newEnd = centerTime + newViewDur * (1 - ratio);

      if (newStart < 0) { newStart = 0; newEnd = Math.min(newViewDur, dur); }
      if (newEnd > dur) { newEnd = dur; newStart = Math.max(0, dur - newViewDur); }

      setUserView(newStart, newEnd);
    };

    const handleTouchEnd = () => {
      pinchActive = false;
      gestureActiveRef.current = false;
      checkFollowEngage();
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [setUserView, checkFollowEngage]);

  // --- Native scroll → view sync (touch pan with iOS momentum) ---

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let gestureEndTimer = null;

    const handleScroll = () => {
      const dur = durationRef.current;
      const vs = viewStartRef.current;
      const ve = viewEndRef.current;
      const viewDur = ve - vs;
      const w = widthRef.current;
      if (dur <= 0 || w <= 0 || viewDur >= dur - 0.001) return;

      const spacerW = w * (dur / viewDur);
      const maxScroll = spacerW - w;
      if (maxScroll <= 0) return;

      const scrollLeft = el.scrollLeft;
      const newStart = (scrollLeft / maxScroll) * (dur - viewDur);
      const newEnd = newStart + viewDur;

      scrollCausedViewChangeRef.current = true;
      gestureActiveRef.current = true;
      if (gestureEndTimer) clearTimeout(gestureEndTimer);
      gestureEndTimer = setTimeout(() => {
        gestureActiveRef.current = false;
        checkFollowEngage();
      }, 150);

      setUserView(
        Math.max(0, Math.min(newStart, dur - viewDur)),
        Math.max(viewDur, Math.min(newEnd, dur))
      );
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (gestureEndTimer) clearTimeout(gestureEndTimer);
    };
  }, [setUserView, checkFollowEngage]);

  // --- View → scroll sync (zoom, seek, playhead follow update scroll position) ---

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (scrollCausedViewChangeRef.current) {
      scrollCausedViewChangeRef.current = false;
      return;
    }
    const dur = duration;
    const viewDur = viewEnd - viewStart;
    const w = containerWidth;
    if (dur <= 0 || w <= 0 || viewDur >= dur - 0.001) {
      el.scrollLeft = 0;
      return;
    }
    const spacerW = w * (dur / viewDur);
    const maxScroll = spacerW - w;
    el.scrollLeft = (viewStart / (dur - viewDur)) * maxScroll;
  }, [viewStart, viewEnd, duration, containerWidth]);

  // --- Double-click to reset zoom ---

  const handleDoubleClick = useCallback(() => {
    resetZoom();
  }, [resetZoom]);

  // --- Waveform pointer handlers: click-to-seek ---

  const handleWaveformPointerDown = useCallback(
    (e) => {
      if (dragActiveRef.current) return;
      if (!svgRef.current || duration <= 0) return;
      // Don't capture pointer for touch — let browser handle native scroll
      if (e.pointerType !== 'touch') {
        e.target.setPointerCapture(e.pointerId);
      }
      const rect = svgRef.current.getBoundingClientRect();
      panDragRef.current = {
        startX: e.clientX - rect.left,
        moved: false,
      };
    },
    [duration]
  );

  const handleWaveformPointerMove = useCallback(
    (e) => {
      const pd = panDragRef.current;
      if (pd.startX == null) return;
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (!pd.moved && Math.abs(x - pd.startX) > 3) {
        pd.moved = true;
      }
    },
    []
  );

  const handleWaveformPointerUp = useCallback(
    (e) => {
      const pd = panDragRef.current;
      if (pd.startX == null) return;
      if (!pd.moved) {
        // No movement — click/tap-to-seek
        if (!svgRef.current || duration <= 0) return;
        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = xToTime(x);
        const [loopStart, loopEnd] = loopRegionRef.current;
        const isFullRange = loopStart <= 0.001 && loopEnd >= duration - 0.001;
        if (!isFullRange && (time < loopStart || time > loopEnd)) return;
        onSeek(time);
        followActiveRef.current = true;
      }
      pd.startX = null;
    },
    [duration, onSeek, xToTime]
  );

  const handleWaveformPointerCancel = useCallback(() => {
    panDragRef.current.startX = null;
  }, []);

  // --- Pointer event drag handlers for cursor handles ---

  const handlePointerDown = useCallback(
    (handle) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.target.setPointerCapture(e.pointerId);
      draggingRef.current = handle;
      dragActiveRef.current = true;
      containerRectRef.current = containerRef.current?.getBoundingClientRect();
    },
    []
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!draggingRef.current || !containerRectRef.current) return;
      const x = e.clientX - containerRectRef.current.left;
      const dur = durationRef.current;
      const w = widthRef.current;

      // Convert pixel to time using zoom-aware transform
      const vs = viewStartRef.current;
      const ve = viewEndRef.current;
      const viewDur = ve - vs;
      const time = Math.max(0, Math.min(w > 0 ? vs + (x / w) * viewDur : 0, dur));

      const region = loopRegionRef.current;
      const onChange = onChangeRef.current;

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
    },
    []
  );

  const handlePointerUp = useCallback(
    () => {
      draggingRef.current = null;
      // Clear drag flag after a microtask so the click event (which fires
      // synchronously after pointerup) still sees dragActiveRef=true
      setTimeout(() => { dragActiveRef.current = false; }, 0);
    },
    []
  );

  // Computed handle positions
  const startX = timeToX(loopRegion[0]);
  const endX = timeToX(loopRegion[1]);

  // Detect if zoomed for UI hints
  const isZoomed = viewStart > 0.001 || viewEnd < duration - 0.001;

  // Spacer width for native scroll — proportional to zoom ratio
  const viewDur = viewEnd - viewStart;
  const spacerWidth = isZoomed && viewDur > 0
    ? containerWidth * (duration / viewDur)
    : containerWidth;

  // Overview bar view change handler
  const handleViewChange = useCallback((newStart, newEnd) => {
    setUserView(newStart, newEnd);
  }, [setUserView]);

  // Overview bar gesture callbacks
  const handleOverviewGestureStart = useCallback(() => {
    gestureActiveRef.current = true;
  }, []);
  const handleOverviewGestureEnd = useCallback(() => {
    gestureActiveRef.current = false;
    checkFollowEngage();
  }, [checkFollowEngage]);

  return (
    <>
    {/* Overview bar — only visible when zoomed */}
    <OverviewBar
      averaged={averaged}
      duration={duration}
      viewStart={viewStart}
      viewEnd={viewEnd}
      onViewChange={handleViewChange}
      currentTimeRef={currentTimeRef}
      loopRegion={loopRegion}
      onGestureStart={handleOverviewGestureStart}
      onGestureEnd={handleOverviewGestureEnd}
    />
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        position: 'relative',
        userSelect: 'none',
        overscrollBehaviorX: 'none',
        cursor: 'pointer',
        borderRadius: 1,
        border: '1px solid #e0e0e0',
        overflow: 'clip',
        // Reserve space so layout doesn't jump when SVG appears
        minHeight: TOTAL_HEIGHT,
      }}
    >
      {containerWidth > 0 && <>
      {/* Scrollable wrapper — provides native touch momentum on iOS */}
      <Box
        ref={scrollRef}
        sx={{
          width: '100%',
          height: TOTAL_HEIGHT,
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <div style={{ width: spacerWidth, height: TOTAL_HEIGHT }}>
          <svg
            ref={svgRef}
            width={containerWidth}
            height={TOTAL_HEIGHT}
            onPointerDown={handleWaveformPointerDown}
            onPointerMove={handleWaveformPointerMove}
            onPointerUp={handleWaveformPointerUp}
            onPointerCancel={handleWaveformPointerCancel}
            onDoubleClick={handleDoubleClick}
            style={{ display: 'block', position: 'sticky', left: 0 }}
          >
            {/* Background */}
            <rect x={0} y={0} width={containerWidth} height={WAVEFORM_HEIGHT} fill={WAVEFORM_BG} />

            {/* Loop region visuals (shading, lines, triangles — no interaction) */}
            <LoopRegion
              loopRegion={loopRegion}
              duration={duration}
              width={containerWidth}
              height={WAVEFORM_HEIGHT}
              timeToX={timeToX}
            />

            {/* Waveform */}
            <path d={waveformPath} fill={WAVEFORM_COLOR} opacity={0.7} />

            {/* Center line */}
            <line
              x1={0}
              y1={WAVEFORM_HEIGHT / 2}
              x2={containerWidth}
              y2={WAVEFORM_HEIGHT / 2}
              stroke="#bdbdbd"
              strokeWidth={0.5}
            />

            {/* Playhead */}
            <Playhead
              timeRef={currentTimeRef}
              timeToX={timeToXForPlayhead}
              height={WAVEFORM_HEIGHT}
            />

            {/* Timeline */}
            <Timeline
              viewStart={viewStart}
              viewEnd={viewEnd}
              duration={duration}
              width={containerWidth}
              y={WAVEFORM_HEIGHT}
              height={TIMELINE_HEIGHT}
            />
          </svg>
        </div>
      </Box>

      {/* Handle overlays — OUTSIDE scroll wrapper, positioned in containerRef */}
      <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: WAVEFORM_HEIGHT,
          pointerEvents: 'none',
          overflow: 'visible',
        }}>
          {/* Start handle hit area — biased left (outward) */}
          <div
            onPointerDown={handlePointerDown('start')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              position: 'absolute',
              left: startX - HIT_OUTWARD,
              width: HIT_OUTWARD + HIT_INWARD,
              height: '100%',
              cursor: 'col-resize',
              touchAction: 'none',
              pointerEvents: 'auto',
            }}
          />
          {/* End handle hit area — biased right (outward) */}
          <div
            onPointerDown={handlePointerDown('end')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              position: 'absolute',
              left: endX - HIT_INWARD,
              width: HIT_OUTWARD + HIT_INWARD,
              height: '100%',
              cursor: 'col-resize',
              touchAction: 'none',
              pointerEvents: 'auto',
            }}
          />
        </div>

      </>}
    </Box>
    </>
  );
});

export default Waveform;
