/**
 * CircleButton — positioned circular button for A/B/X track selection.
 * Supports absolute positioning within a circular layout.
 */

import React from 'react';
import { Button } from '@mui/material';

/**
 * @param {object} props
 * @param {string} props.top - CSS top position
 * @param {string} props.left - CSS left position
 * @param {number} [props.diameter] - Button diameter in px (default 64)
 * @param {'primary' | 'secondary' | 'black'} [props.color] - Button color
 * @param {React.ReactNode} props.children
 * @param {() => void} props.onClick
 */
export default function CircleButton({
  top,
  left,
  diameter = 64,
  color = 'secondary',
  children,
  onClick,
  ...rest
}) {
  const isBlack = color === 'black';

  return (
    <Button
      variant="contained"
      color={isBlack ? 'inherit' : color}
      onClick={onClick}
      sx={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        width: diameter,
        height: diameter,
        minWidth: diameter,
        borderRadius: '50%',
        fontSize: '1.2rem',
        fontWeight: 'bold',
        ...(isBlack && {
          backgroundColor: '#424242',
          color: '#fff',
          '&:hover': { backgroundColor: '#616161' },
        }),
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}
