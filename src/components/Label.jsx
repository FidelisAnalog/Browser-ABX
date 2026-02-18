/**
 * Label — colored inline badge for option/tag display.
 */

import React from 'react';
import { Box, useTheme } from '@mui/material';

/**
 * @param {object} props
 * @param {'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'} [props.color]
 * @param {React.ReactNode} props.children
 */
export default function Label({ color = 'secondary', children }) {
  const theme = useTheme();
  const bgColor = theme.palette[color]?.main || theme.palette.secondary.main;

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        backgroundColor: bgColor,
        color: '#fff',
        borderRadius: '4px',
        padding: '2px 8px',
        fontSize: '0.75rem',
        fontWeight: 'bold',
        lineHeight: 1.5,
      }}
    >
      {children}
    </Box>
  );
}
