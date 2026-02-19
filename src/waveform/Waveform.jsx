/**
 * SVG waveform display component.
 * Renders a static composite waveform as a mirrored amplitude envelope.
 * Handles click-to-seek interaction on the waveform area.
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

/**
 * @param {object} props
 * @param {Float32Array[]} props.channelData - Channel 0 data from each track (for composite)
 * @param {number} props.duration - Total duration in seconds
 * @param {{ current: number }} props.currentTimeRef - Ref containing current playback position
 * @param {[number, number]} props.loopRegion - [start, end] in seconds
 * @param {string} props.transportState - 'stopped' | 'playing' | 'paused'
 * @param {(time: number) => void} props.onSeek - Seek callback
 * @param {(start: number, end: number) => void} props.onLoopRegionChange - Loop region change callback
 */
export default function Waveform({
  channelData,
  duration,
  currentTimeRef,
  loopRegion,
  transportState,
  onSeek,
  onLoopRegionChange,
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);

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

  // Click-to-seek handler
  const handleClick = useCallback(
    (e) => {
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

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        userSelect: 'none',
        cursor: 'pointer',
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid #e0e0e0',
      }}
    >
      <svg
        ref={svgRef}
        width={containerWidth}
        height={TOTAL_HEIGHT}
        onClick={handleClick}
        style={{ display: 'block' }}
      >
        {/* Background */}
        <rect x={0} y={0} width={containerWidth} height={WAVEFORM_HEIGHT} fill={WAVEFORM_BG} />

        {/* Loop region highlight */}
        <LoopRegion
          loopRegion={loopRegion}
          duration={duration}
          width={containerWidth}
          height={WAVEFORM_HEIGHT}
          onLoopRegionChange={onLoopRegionChange}
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
          playing={transportState === 'playing'}
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
    </Box>
  );
}
