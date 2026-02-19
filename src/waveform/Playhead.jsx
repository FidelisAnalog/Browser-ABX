/**
 * Playhead — thin vertical line indicating current playback position.
 * Self-animating: reads from a time ref and updates its own DOM element
 * directly via requestAnimationFrame, bypassing React re-renders.
 *
 * Always runs its animation loop so seek/stop/pause updates are instant.
 */

import React, { useRef, useEffect } from 'react';

const PLAYHEAD_COLOR = '#d32f2f';
const PLAYHEAD_WIDTH = 1.5;

/**
 * @param {object} props
 * @param {{ current: number }} props.timeRef - Ref containing current time in seconds
 * @param {(time: number) => number} props.timeToX - Converts time to x pixel position
 * @param {number} props.height - Height of the waveform area
 */
export default function Playhead({ timeRef, timeToX, height }) {
  const lineRef = useRef(null);
  const rafRef = useRef(null);
  // Cache timeToX in a ref so the rAF loop always uses the latest without restarting
  const timeToXRef = useRef(timeToX);
  timeToXRef.current = timeToX;

  useEffect(() => {
    let lastX = -1;
    const animate = () => {
      if (lineRef.current && timeRef) {
        const x = timeToXRef.current(timeRef.current);
        // Only touch DOM if position actually changed
        if (x !== lastX) {
          lineRef.current.setAttribute('x1', x);
          lineRef.current.setAttribute('x2', x);
          lastX = x;
        }
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [timeRef]);

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
