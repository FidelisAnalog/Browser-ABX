/**
 * TrackSelector — A/B/X/Y circular buttons arranged in an unbiased circular layout.
 * Selection only — no play/stop behavior. Switching tracks while playing
 * continues from the same position.
 *
 * xTrackIndex accepts a single number (ABX: one mystery track in center) or
 * an array (ABXY: all buttons on circle, no center grouping).
 */

import React from 'react';
import { Box } from '@mui/material';
import CircleButton from './CircleButton';

const BUTTON_DIAMETER = 64;
const BUTTON_SPACING = 24;
const MYSTERY_LABELS = 'XYZ';

/**
 * Calculate position for a button in a circular layout.
 * @param {number} i - Button index
 * @param {number} n - Total number of buttons
 * @param {number} diameter
 * @param {number} spacing
 * @returns {{ top: string, left: string }}
 */
function circlePosition(i, n, diameter, spacing, minRadius = 0) {
  let alpha0;
  switch (n) {
    case 2:
      alpha0 = Math.PI;
      break;
    case 3:
      alpha0 = Math.PI / 2 + (Math.PI * 2) / 3 / 2;
      break;
    case 4:
      // A(left/9), X(top/12), B(right/3), Y(bottom/6)
      alpha0 = Math.PI;
      break;
    case 5:
      alpha0 = Math.PI / 2 + (Math.PI * 2) / 5;
      break;
    default:
      alpha0 = Math.PI;
  }

  const r = Math.max(minRadius, ((spacing + diameter) / 2) / Math.sin(Math.PI / n));
  const angle = alpha0 - (Math.PI * 2 / n) * i;
  const top = `calc(50% - ${Math.sin(angle) * r}px)`;
  const left = `calc(50% + ${Math.cos(angle) * r}px)`;
  return { top, left };
}

/**
 * Get letter label for a track index (A, B, C, ...)
 * @param {number} index
 * @returns {string}
 */
function getLabel(index) {
  return String.fromCharCode(65 + index); // A=65
}

/**
 * @param {object} props
 * @param {number} props.trackCount - Number of tracks (typically 2, 3, or 4)
 * @param {number} props.selectedTrack - Currently selected track index
 * @param {(index: number) => void} props.onSelect
 * @param {number|number[]|null} [props.xTrackIndex] - Index(es) of mystery tracks (null for AB)
 */
export default function TrackSelector({
  trackCount,
  selectedTrack,
  onSelect,
  xTrackIndex = null,
}) {
  // Normalize to array of mystery indices
  const mysteryIndices = xTrackIndex === null ? []
    : Array.isArray(xTrackIndex) ? xTrackIndex
    : [xTrackIndex];

  const buttons = [];

  if (mysteryIndices.length > 1) {
    // Multiple mystery tracks (ABXY): all buttons on circle, interleaved.
    // Circle order: A(9/left), X(12/top), B(3/right), Y(6/bottom)
    // Track indices: A=0, B=1, X=2, Y=3
    // Circle positions: 0→A, 1→X, 2→B, 3→Y
    const circleOrder = [];
    const regularIndices = [];
    for (let i = 0; i < trackCount; i++) {
      if (mysteryIndices.indexOf(i) < 0) regularIndices.push(i);
    }
    // Interleave: regular[0], mystery[0], regular[1], mystery[1], ...
    const maxLen = Math.max(regularIndices.length, mysteryIndices.length);
    for (let j = 0; j < maxLen; j++) {
      if (j < regularIndices.length) circleOrder.push(regularIndices[j]);
      if (j < mysteryIndices.length) circleOrder.push(mysteryIndices[j]);
    }

    for (let ci = 0; ci < circleOrder.length; ci++) {
      const i = circleOrder[ci];
      const isMystery = mysteryIndices.indexOf(i) >= 0;
      const isSelected = i === selectedTrack;
      const position = circlePosition(ci, circleOrder.length, BUTTON_DIAMETER, BUTTON_SPACING);

      let color;
      if (isSelected) {
        color = 'primary';
      } else if (isMystery) {
        color = 'black';
      } else {
        color = 'secondary';
      }

      let label;
      if (isMystery) {
        label = MYSTERY_LABELS[mysteryIndices.indexOf(i)];
      } else {
        const belowCount = mysteryIndices.filter((m) => m < i).length;
        label = getLabel(i - belowCount);
      }

      buttons.push(
        <CircleButton
          key={i}
          top={position.top}
          left={position.left}
          diameter={BUTTON_DIAMETER}
          color={color}
          onClick={() => onSelect(i)}
        >
          {label}
        </CircleButton>
      );
    }
  } else {
    // Single mystery track (ABX/Triangle) or no mystery (AB):
    // mystery in center, regular buttons on circle — existing behavior
    const layoutCount = trackCount - mysteryIndices.length;

    for (let i = 0; i < trackCount; i++) {
      const isMystery = mysteryIndices.indexOf(i) >= 0;
      const isSelected = i === selectedTrack;

      let position;
      if (isMystery) {
        position = { top: '50%', left: '50%' };
      } else {
        const layoutIndex = xTrackIndex !== null && i > xTrackIndex ? i - 1 : i;
        const minRadius = mysteryIndices.length > 0 ? BUTTON_DIAMETER + BUTTON_SPACING : 0;
        position = circlePosition(layoutIndex, layoutCount, BUTTON_DIAMETER, BUTTON_SPACING, minRadius);
      }

      let color;
      if (isSelected) {
        color = 'primary';
      } else if (isMystery) {
        color = 'black';
      } else {
        color = 'secondary';
      }

      const label = isMystery ? 'X' : getLabel(xTrackIndex !== null && i > xTrackIndex ? i - 1 : i);

      buttons.push(
        <CircleButton
          key={i}
          top={position.top}
          left={position.left}
          diameter={BUTTON_DIAMETER}
          color={color}
          onClick={() => onSelect(i)}
        >
          {label}
        </CircleButton>
      );
    }
  }

  return (
    <Box
      display="flex"
      justifyContent="center"
      sx={{
        position: 'relative',
        width: '100%',
        minHeight: 200,
      }}
    >
      {buttons}
    </Box>
  );
}
