/**
 * Waveform blank bug stress test.
 *
 * Launches Puppeteer against the embed-test page on preview,
 * sends config, waits for audio to load, then runs realistic interaction
 * sequences (multi-step zoom, pan at depth, theme changes at various zoom
 * levels, mouse wheel zoom, drag-to-pan) looking for the [WAVEFORM BLANK]
 * console warning.
 *
 * Usage:  node scripts/waveform-stress.mjs [--url URL] [--rounds N]
 */

import puppeteer from 'puppeteer';

const DEFAULT_URL = 'https://acidtest.io/preview/embed-test.html';
const DEFAULT_ROUNDS = 5000;

const args = process.argv.slice(2);
const url = args.find((_, i) => args[i - 1] === '--url') || DEFAULT_URL;
const rounds = parseInt(args.find((_, i) => args[i - 1] === '--rounds') || DEFAULT_ROUNDS, 10);

const THEMES = ['light', 'dark', 'system'];

async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--window-size=1200,900'],
  });

  const page = await browser.newPage();

  const blanks = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[WAVEFORM BLANK]')) {
      blanks.push({ round: currentRound, action: currentAction, text });
      console.log(`\n  BLANK DETECTED on round ${currentRound} (${currentAction})`);
      console.log(`   ${text}\n`);
    }
  });

  let currentRound = 0;
  let currentAction = '';
  let zoomLevel = 0;

  console.log(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2' });

  await page.click('#skipWelcome');

  console.log('Sending config...');
  await page.click('.btn');

  console.log('Waiting for audio to load...');
  await page.waitForFunction(() => {
    const log = document.getElementById('log');
    return log && log.textContent.includes('acidtest:started');
  }, { timeout: 120000 });

  const iframeHandle = await page.$('iframe');
  const frame = await iframeHandle.contentFrame();

  frame.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[WAVEFORM BLANK]')) {
      blanks.push({ round: currentRound, action: currentAction, text });
      console.log(`\n  BLANK DETECTED (iframe) on round ${currentRound} (${currentAction})`);
      console.log(`   ${text}\n`);
    }
  });

  await iframeHandle.click();
  await sleep(200);

  // Find the waveform SVG bounding box inside the iframe
  const getWaveformBox = async () => {
    const box = await frame.evaluate(() => {
      const svg = document.querySelector('svg');
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (!box) return null;
    const iframeBox = await iframeHandle.boundingBox();
    return {
      x: iframeBox.x + box.x,
      y: iframeBox.y + box.y,
      width: box.width,
      height: box.height,
    };
  };

  // Mouse drag-to-pan (click and drag horizontally on waveform)
  const dragPan = async (direction) => {
    const box = await getWaveformBox();
    if (!box) return;
    const startX = direction === 'left' ? box.x + box.width * 0.3 : box.x + box.width * 0.7;
    const endX = direction === 'left' ? box.x + box.width * 0.7 : box.x + box.width * 0.3;
    const cy = box.y + box.height / 2;
    await page.mouse.move(startX, cy);
    await page.mouse.down();
    const steps = 6 + Math.floor(Math.random() * 6);
    for (let s = 1; s <= steps; s++) {
      const x = startX + (endX - startX) * (s / steps);
      await page.mouse.move(x, cy);
      await sleep(16);
    }
    await page.mouse.up();
    // Re-focus iframe for keyboard events
    await iframeHandle.click();
  };

  // Keyboard helpers
  const key = (k) => page.keyboard.press(k);
  const shiftKey = async (k) => {
    await page.keyboard.down('Shift');
    await page.keyboard.press(k);
    await page.keyboard.up('Shift');
  };

  const zoomIn = async () => { await key('Equal'); zoomLevel = Math.min(zoomLevel + 1, 20); };
  const zoomOut = async () => { await key('Minus'); zoomLevel = Math.max(zoomLevel - 1, 0); };
  const zoomReset = async () => { await key('Digit0'); zoomLevel = 0; };
  const panLeft = () => shiftKey('ArrowLeft');
  const panRight = () => shiftKey('ArrowRight');
  const themeToggle = async () => {
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
    await page.select('#themeSelect', theme);
    await page.click('.btn-sm');
    await iframeHandle.click();
  };
  const themeKey = async () => {
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('KeyT');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
  };

  const sequences = [
    // Zoom in deep, look around, zoom back out
    async () => {
      const depth = 2 + Math.floor(Math.random() * 6);
      for (let j = 0; j < depth; j++) { await zoomIn(); await sleep(80 + Math.random() * 150); }
      await sleep(200 + Math.random() * 300);
      const pans = 1 + Math.floor(Math.random() * 4);
      for (let j = 0; j < pans; j++) {
        await (Math.random() > 0.5 ? panLeft() : panRight());
        await sleep(80 + Math.random() * 150);
      }
      await sleep(200 + Math.random() * 300);
      for (let j = 0; j < depth; j++) { await zoomOut(); await sleep(80 + Math.random() * 150); }
      return `zoom-explore (${depth} deep, ${pans} pans)`;
    },

    // Zoom in, change theme while zoomed, then reset
    async () => {
      const depth = 1 + Math.floor(Math.random() * 5);
      for (let j = 0; j < depth; j++) { await zoomIn(); await sleep(80 + Math.random() * 150); }
      await sleep(150 + Math.random() * 200);
      await themeToggle();
      await sleep(200 + Math.random() * 400);
      await zoomReset();
      return `zoom-theme-reset (${depth} deep)`;
    },

    // Quick theme toggle at current zoom level (via postMessage)
    async () => {
      await themeToggle();
      return `theme-toggle (zoom=${zoomLevel})`;
    },

    // Quick theme toggle via keyboard shortcut
    async () => {
      await themeKey();
      return `theme-key (zoom=${zoomLevel})`;
    },

    // Rapid zoom in/out jitter (like scroll wheel wobble)
    async () => {
      const jitters = 3 + Math.floor(Math.random() * 5);
      for (let j = 0; j < jitters; j++) {
        await (Math.random() > 0.5 ? zoomIn() : zoomOut());
        await sleep(40 + Math.random() * 80);
      }
      return `zoom-jitter (${jitters}x)`;
    },

    // Zoom reset from whatever depth
    async () => {
      const was = zoomLevel;
      await zoomReset();
      return `zoom-reset (was=${was})`;
    },

    // Keyboard pan around at current zoom
    async () => {
      if (zoomLevel === 0) {
        const depth = 1 + Math.floor(Math.random() * 3);
        for (let j = 0; j < depth; j++) { await zoomIn(); await sleep(80 + Math.random() * 100); }
      }
      const pans = 2 + Math.floor(Math.random() * 6);
      const dir = Math.random() > 0.5 ? 'right' : 'left';
      for (let j = 0; j < pans; j++) {
        await (dir === 'right' ? panRight() : panLeft());
        await sleep(60 + Math.random() * 120);
      }
      return `pan-${dir} (${pans}x, zoom=${zoomLevel})`;
    },

    // Theme change then immediate zoom reset (exact repro scenario)
    async () => {
      await themeToggle();
      await sleep(100 + Math.random() * 200);
      await zoomReset();
      return 'theme-then-reset';
    },

    // Zoom reset then immediate theme change
    async () => {
      if (zoomLevel === 0) {
        const depth = 2 + Math.floor(Math.random() * 4);
        for (let j = 0; j < depth; j++) { await zoomIn(); await sleep(60 + Math.random() * 80); }
        await sleep(100);
      }
      await zoomReset();
      await sleep(100 + Math.random() * 200);
      await themeToggle();
      return 'reset-then-theme';
    },

    // Deep zoom, pan to edge, theme toggle
    async () => {
      const depth = 4 + Math.floor(Math.random() * 6);
      for (let j = 0; j < depth; j++) { await zoomIn(); await sleep(50 + Math.random() * 80); }
      const pans = 5 + Math.floor(Math.random() * 10);
      for (let j = 0; j < pans; j++) { await panRight(); await sleep(40 + Math.random() * 60); }
      await sleep(200);
      await themeToggle();
      await sleep(300);
      await zoomReset();
      return `deep-pan-theme (${depth} deep, ${pans} pans)`;
    },

    // Double theme toggle rapidly
    async () => {
      await themeToggle();
      await sleep(100 + Math.random() * 200);
      await themeToggle();
      return `double-theme (zoom=${zoomLevel})`;
    },

    // Drag-to-pan at current zoom
    async () => {
      if (zoomLevel === 0) {
        const depth = 2 + Math.floor(Math.random() * 3);
        for (let j = 0; j < depth; j++) { await zoomIn(); await sleep(60 + Math.random() * 80); }
      }
      const dir = Math.random() > 0.5 ? 'left' : 'right';
      await dragPan(dir);
      return `drag-pan-${dir} (zoom=${zoomLevel})`;
    },

    // Keyboard zoom + drag pan combo
    async () => {
      const depth = 2 + Math.floor(Math.random() * 4);
      for (let j = 0; j < depth; j++) { await zoomIn(); await sleep(60 + Math.random() * 80); }
      await sleep(100);
      const drags = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < drags; j++) {
        await dragPan(Math.random() > 0.5 ? 'left' : 'right');
        await sleep(100 + Math.random() * 200);
      }
      await zoomReset();
      return `kb-drag-reset (${depth} deep, ${drags} drags)`;
    },
  ];

  console.log(`Starting ${rounds} sequences...\n`);

  for (let i = 0; i < rounds; i++) {
    currentRound = i + 1;

    if (i % 50 === 0) {
      console.log(`Seq ${i + 1}/${rounds} — blanks: ${blanks.length}, zoom: ${zoomLevel}`);
    }

    try {
      const seq = sequences[Math.floor(Math.random() * sequences.length)];
      currentAction = await seq();
    } catch (err) {
      console.log(`  [warn] failed: ${err.message}`);
    }

    // Pause between sequences (150-500ms)
    await sleep(150 + Math.random() * 350);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done. ${rounds} sequences completed.`);
  console.log(`Blanks detected: ${blanks.length}`);
  if (blanks.length > 0) {
    console.log('\nAll blank events:');
    blanks.forEach((b, i) => {
      console.log(`  ${i + 1}. Seq ${b.round} (${b.action}): ${b.text}`);
    });
  }
  console.log(`${'='.repeat(50)}\n`);

  await browser.close();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
