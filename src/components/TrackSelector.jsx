/**
 * TrackSelector — A/B/X circular buttons arranged in an unbiased circular layout.
 * Selection only — no play/stop behavior. Switching tracks while playing
 * continues from the same position.
 */

import React from 'react';
import { Box } from '@mui/material';
import CircleButton from './CircleButton';

const BUTTON_DIAMETER = 64;
const BUTTON_SPACING = 24;

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
 * @param {number} props.trackCount - Number of tracks (typically 2 or 3)
 * @param {number} props.selectedTrack - Currently selected track index
 * @param {(index: number) => void} props.onSelect
 * @param {number|null} [props.xTrackIndex] - Index of X track (for ABX tests, null for AB)
 */
export default function TrackSelector({
  trackCount,
  selectedTrack,
  onSelect,
  xTrackIndex = null,
}) {
  const buttons = [];
  const layoutCount = xTrackIndex !== null ? trackCount - 1 : trackCount;

  for (let i = 0; i < trackCount; i++) {
    const isX = i === xTrackIndex;
    const isSelected = i === selectedTrack;

    let position;
    if (isX) {
      // X goes to center
      position = { top: '50%', left: '50%' };
    } else {
      // Regular buttons in circle (adjust index for layout if X is present)
      const layoutIndex = xTrackIndex !== null && i > xTrackIndex ? i - 1 : i;
      const minRadius = xTrackIndex !== null ? BUTTON_DIAMETER + BUTTON_SPACING : 0;
      position = circlePosition(layoutIndex, layoutCount, BUTTON_DIAMETER, BUTTON_SPACING, minRadius);
    }

    let color;
    if (isSelected) {
      color = 'primary';
    } else if (isX) {
      color = 'black';
    } else {
      color = 'secondary';
    }

    const label = isX ? 'X' : getLabel(xTrackIndex !== null && i > xTrackIndex ? i - 1 : i);

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
