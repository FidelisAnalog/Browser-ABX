/**
 * Playhead — thin vertical line indicating current playback position.
 * Self-animating: reads from a time ref and updates its own DOM element
 * directly via requestAnimationFrame, bypassing React re-renders.
 */

import React, { useRef, useEffect, useCallback } from 'react';

const PLAYHEAD_COLOR = '#d32f2f';
const PLAYHEAD_WIDTH = 1.5;

/**
 * @param {object} props
 * @param {{ current: number }} props.timeRef - Ref containing current time in seconds
 * @param {(time: number) => number} props.timeToX - Converts time to x pixel position
 * @param {boolean} props.playing - Whether playback is active (controls animation loop)
 * @param {number} props.height - Height of the waveform area
 */
export default function Playhead({ timeRef, timeToX, playing, height }) {
  const lineRef = useRef(null);
  const rafRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (lineRef.current && timeRef) {
      const x = timeToX(timeRef.current);
      lineRef.current.setAttribute('x1', x);
      lineRef.current.setAttribute('x2', x);
    }
  }, [timeRef, timeToX]);

  useEffect(() => {
    if (playing) {
      const animate = () => {
        updatePosition();
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    } else {
      // When not playing, update once to show current position
      updatePosition();
    }
  }, [playing, updatePosition]);

  // Also update when timeToX changes (e.g., container resize)
  useEffect(() => {
    if (!playing) updatePosition();
  }, [timeToX, playing, updatePosition]);

  return (
    <line
      ref={lineRef}
      x1={0}
      y1={0}
      x2={0}
      y2={height}
      stroke={PLAYHEAD_COLOR}
      strokeWidth={PLAYHEAD_WIDTH}
      pointerEvents="none"
    />
  );
}
