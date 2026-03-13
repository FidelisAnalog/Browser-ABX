/**
 * Layout — structural wrapper for all screens.
 * Flex column with header slot, content area, and footer slot.
 * Owns all sizing (standalone vs embedded) so consuming components don't need to.
 * Reports content height to parent via onContentHeight callback (embedded only).
 */

import { useRef, useEffect } from 'react';
import { Box, Container, Link, Typography } from '@mui/material';
import { isEmbedded } from '../utils/embed';
import { getBranding } from '../utils/branding';

/** Consistent min-height for embedded mode — prevents jarring jumps between screens */
const EMBEDDED_MIN_HEIGHT = 755;

export default function Layout({ screen, children, onContentHeight }) {
  const rootRef = useRef(null);
  const lastHeightRef = useRef(0);
  const branding = getBranding(screen, isEmbedded);

  // Report content height when it changes (embedded only).
  // Deduplicated (skip if height unchanged) and coalesced via rAF
  // so multiple layout reflows within one frame produce a single event.
  useEffect(() => {
    if (!isEmbedded || !rootRef.current) return;

    let frameId = 0;

    const reportHeight = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const height = rootRef.current?.scrollHeight;
        if (height && height !== lastHeightRef.current) {
          lastHeightRef.current = height;
          onContentHeight?.(height);
        }
      });
    };

    reportHeight();

    const observer = new ResizeObserver(reportHeight);
    observer.observe(rootRef.current);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [screen, onContentHeight]);

  return (
    <Box
      ref={rootRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: isEmbedded ? `${EMBEDDED_MIN_HEIGHT}px` : '100dvh',
      }}
    >
      {/* Test deploy indicator — remove before merging to main */}
      <Typography variant="body1" sx={{ textAlign: 'center', py: 1, bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 'bold' }}>
        2a-1
      </Typography>

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
