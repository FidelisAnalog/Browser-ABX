/**
 * Layout — structural wrapper for all screens.
 * Flex column with header slot, content area, and footer slot.
 * Owns all sizing (standalone vs embedded) so consuming components don't need to.
 * Emits acidtest:resize postMessage when embedded so parent can adjust iframe height.
 */

import { useRef, useEffect } from 'react';
import { Box, Container, Link, Typography } from '@mui/material';
import { isEmbedded } from '../utils/embed';
import { getBranding } from '../utils/branding';
import { emitEvent } from '../utils/events';

/** Consistent min-height for embedded mode — prevents jarring jumps between screens */
const EMBEDDED_MIN_HEIGHT = 700;

export default function Layout({ screen, children }) {
  const rootRef = useRef(null);
  const lastHeightRef = useRef(0);
  const branding = getBranding(screen, isEmbedded);

  // Emit acidtest:resize when content height changes (embedded only).
  // Deduplicated (skip if height unchanged) and coalesced via rAF
  // so multiple layout reflows within one frame produce a single event.
  useEffect(() => {
    if (!isEmbedded || !rootRef.current) return;

    let frameId = 0;

    const emitResize = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const height = rootRef.current?.scrollHeight;
        if (height && height !== lastHeightRef.current) {
          lastHeightRef.current = height;
          emitEvent('acidtest:resize', { height });
        }
      });
    };

    emitResize();

    const observer = new ResizeObserver(emitResize);
    observer.observe(rootRef.current);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [screen]);

  return (
    <Box
      ref={rootRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: isEmbedded ? `${EMBEDDED_MIN_HEIGHT}px` : '100dvh',
      }}
    >
      {/* Header slot — reserved for future branding */}
      {branding.header && (
        <Box>{/* header content will go here */}</Box>
      )}

      {/* Content area — grows to fill available space */}
      <Container
        maxWidth="md"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          py: 2,
        }}
      >
        {children}

        {/* Footer slot — attribution when branding rules say so */}
        {branding.footer && (
          <Box textAlign="center">
            <Typography variant="caption" color="text.secondary">
              powered by{' '}
              <Link
                href={`https://${branding.footer.text}`}
                target="_blank"
                rel="noopener"
                color="inherit"
                underline="hover"
              >
                {branding.footer.text}
              </Link>
            </Typography>
          </Box>
        )}
      </Container>
    </Box>
  );
}
