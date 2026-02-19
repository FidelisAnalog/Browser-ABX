/**
 * SVG waveform display component.
 * Renders a static composite waveform as a mirrored amplitude envelope.
 * Handles click-to-seek and cursor drag interaction.
 *
 * Cursor drag uses HTML div overlays with the Pointer Events API
 * (not SVG elements) so hit areas work reliably on touch devices
 * including at the edges of the waveform.
 */

import React, { useMemo, useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import { generateWaveformData } from './generateWaveform';
import LoopRegion from './LoopRegion';
import Playhead from './Playhead';
import Timeline from './Timeline';

const WAVEFORM_HEIGHT = 100;
const TIMELINE_HEIGHT = 20;
const TOTAL_HEIGHT = WAVEFORM_HEIGHT + TIMELINE_HEIGHT;
const WAVEFORM_COLOR = '#1976d2';
const WAVEFORM_BG = '#f5f5f5';

// Handle hit area: 44px total, biased outward from the loop region.
// Start handle extends left, end handle extends right.
const HIT_OUTWARD = 40;  // px extending away from loop region
const HIT_INWARD = 4;    // px extending into loop region
const MIN_LOOP = 0.5;    // minimum loop duration in seconds

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

  // Refs so pointer handlers always read current values (no stale closures)
  const loopRegionRef = useRef(loopRegion);
  loopRegionRef.current = loopRegion;
  const onChangeRef = useRef(onLoopRegionChange);
  onChangeRef.current = onLoopRegionChange;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  // Measure container width
  const [containerWidth, setContainerWidth] = React.useState(600);
  React.useEffect(() => {
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

  // Generate waveform data (recompute only when data or width changes)
  const waveformData = useMemo(
    () => generateWaveformData(channelData, Math.max(1, Math.floor(containerWidth))),
    [channelData, containerWidth]
  );

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

  // Click-to-seek handler — suppressed when a handle drag just ended
  const handleClick = useCallback(
    (e) => {
      if (dragActiveRef.current) return;
      if (!svgRef.current || duration <= 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const fraction = x / rect.width;
      const time = fraction * duration;
      onSeek(time);
    },
    [duration, onSeek]
  );

  // Convert time to x position
  const timeToX = useCallback(
    (time) => {
      if (duration <= 0) return 0;
      return (time / duration) * containerWidth;
    },
    [duration, containerWidth]
  );

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
      const time = Math.max(0, Math.min(w > 0 ? (x / w) * dur : 0, dur));
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
  const isFullRange = loopRegion[0] <= 0.001 && loopRegion[1] >= duration - 0.001;

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        position: 'relative',
        userSelect: 'none',
        cursor: 'pointer',
        borderRadius: 1,
        border: '1px solid #e0e0e0',
        overflow: 'visible',
      }}
    >
      <svg
        ref={svgRef}
        width={containerWidth}
        height={TOTAL_HEIGHT}
        onClick={handleClick}
        style={{ display: 'block', touchAction: 'none' }}
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
          timeToX={timeToX}
          height={WAVEFORM_HEIGHT}
        />

        {/* Timeline */}
        <Timeline
          duration={duration}
          width={containerWidth}
          y={WAVEFORM_HEIGHT}
          height={TIMELINE_HEIGHT}
        />
      </svg>

      {/* Handle overlays — always rendered so handles are grabbable even at full range */}
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
              cursor: 'ew-resize',
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
              cursor: 'ew-resize',
              touchAction: 'none',
              pointerEvents: 'auto',
            }}
          />
        </div>
    </Box>
  );
});

export default Waveform;
