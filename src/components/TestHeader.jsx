/**
 * TestHeader — shared header for test screens.
 * Renders test name, optional description, and divider.
 * Types that need custom header behavior (e.g., Staircase familiarization)
 * render their own header instead of using this.
 */

import { Box, Divider, Typography } from '@mui/material';

export default function TestHeader({ name, description }) {
  return (
    <>
      <Box mb={4}>
        <Typography variant="h5" textAlign="center">
          {name}
        </Typography>
        {description && (
          <Box mt={2}>
            <Typography textAlign="center">{description}</Typography>
          </Box>
        )}
      </Box>
      <Divider />
    </>
  );
}
