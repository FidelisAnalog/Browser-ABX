/**
 * TestPanel — minimal card frame for test screens.
 * Renders Paper wrapping children + AudioControls below.
 * Type-specific content (track selector, answer area, progress, step info)
 * lives in the type's own component, rendered as children.
 */

import { Box, Paper } from '@mui/material';
import AudioControls from './AudioControls';

export default function TestPanel({ engine, channelData, crossfadeForced, children }) {
  return (
    <Box display="flex" flexDirection="column" gap={1.5}>
      <Paper>
        {children}
      </Paper>
      <AudioControls
        engine={engine}
        channelData={channelData}
        crossfadeForced={crossfadeForced}
      />
    </Box>
  );
}
