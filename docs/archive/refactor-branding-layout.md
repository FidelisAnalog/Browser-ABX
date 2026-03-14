# Refactor: Branding, Layout, and Component Responsibilities

## Problem

Architecture has grown organically. Concerns are scattered and coupled:

- **TestRunner** is a monolith — owns config loading, audio init, test sequencing, results collection, staircase logic, AND renders five different screens (loading, welcome, test, results, skipResults). Screen knowledge is trapped inside it.
- **App.jsx** is half-router, half-postMessage handler, with branding jammed in because there's nowhere else for it.
- **Embed concerns** (`isEmbedded`, `minHeight` conditionals) are scattered across TestRunner, Welcome, SharedResults with inline checks.
- **Branding** (footer, future header/logos) has no home. Currently hacked into App.jsx with a negative margin, collides with loading spinners, shows on screens where it shouldn't.
- **View sizing** is inconsistent — `minHeight: 100vh` for standalone, conditionally removed for embedded, but no consistent container height across screens.

## Current State (uncommitted on lucid-roentgen)

- `src/utils/embed.js` — new file, exports `isEmbedded` (iframe detection). Good, keep this.
- `src/utils/events.js` — `emitEvent` now posts to `window.parent` or `window.opener`. Good, keep this.
- `src/App.jsx` — postMessage listener gated on `!configUrl && !shareParam` instead of `isEmbedded`. Content routing uses `postMessageConfig`/`postMessageError` state. Good separation of postMessage from embed. Footer still inline and broken on loading screens.
- TestRunner, Welcome, SharedResults — `minHeight` conditionally removed when embedded. Works but is scattered.

## Architecture Goals

### 1. Separate screen routing from test orchestration

TestRunner should be the test state machine and active test renderer. It should NOT own:
- Config loading spinners
- Welcome screen rendering
- Results screen rendering
- Screen transition decisions

Screen knowledge should live at a level where BrandingLayout can access it without callbacks.

### 2. BrandingLayout component

Structural layout wrapper: header slot, content area, footer slot.

- Receives `screen` identifier (loading, welcome, test, results, landing, error, shared-results)
- Consults branding rules to decide what to render in each slot
- Owns container sizing (standalone vs embedded)
- Replaces all scattered `minHeight` conditionals with one structural decision
- App.jsx renders `<BrandingLayout screen={screen}>{content}</BrandingLayout>`

### 3. Centralized branding rules

Pure logic module (`src/utils/branding.js` or similar) that takes inputs and returns what branding to show:

**Inputs:**
- `screen` — which screen is active
- `isEmbedded` — iframe detection
- Future: config-driven branding (logos, custom text)
- Future: standalone branding

**Outputs:**
- `header` — what to render in header slot (null = nothing)
- `footer` — what to render in footer slot (null = nothing)
- `sizing` — container sizing rules

**Known rules:**
- Footer ("powered by acidtest.io"): show on test + results screens when embedded. Never on loading.
- Header: TBD, but architecture should support it.
- Standalone branding: TBD, but same system.
- Config-driven branding: TBD, same system.

### 4. Consistent view sizing

All screens should occupy consistent container dimensions. No jumping between screens. BrandingLayout owns this — one place, not per-component conditionals.

### 5. postMessage is not an embed concern

postMessage listener should fire whenever there's no URL-provided config (`!configUrl && !shareParam`), regardless of `isEmbedded`. This is already done in the current uncommitted changes.

`emitEvent` should post to `window.parent` or `window.opener` (whoever opened us). Also already done.

`isEmbedded` (iframe detection) is strictly a presentation concern — branding, sizing. Not gating postMessage.

## Suggested Approach

1. **Extract screen routing from TestRunner** — TestRunner exposes its phase (or is split so that loading/welcome/results are separate concerns). App or an intermediate orchestrator knows the current screen.

2. **Create BrandingLayout** — structural flex column wrapper. Header, content (`flex: 1`), footer. Sizing rules from branding logic. Content components render inside it without knowing about branding.

3. **Create branding rules module** — centralized logic, no rendering. BrandingLayout calls it.

4. **Remove scattered embed conditionals** — no more `isEmbedded ? undefined : '100vh'` in individual components. BrandingLayout handles sizing.

5. **Remove footer from App.jsx** — it moves into BrandingLayout.

## What to keep from current changes

- `src/utils/embed.js` — keep as-is
- `src/utils/events.js` — keep the `targetWindow` (parent/opener) approach
- `src/App.jsx` — keep the postMessage decoupling from `isEmbedded`, keep renamed state (`postMessageConfig` etc.)
- Revert the scattered `minHeight` conditionals in TestRunner/Welcome/SharedResults — those will be replaced by BrandingLayout

## Open Questions

- How far to decompose TestRunner? Just extract screen routing, or fully separate config loading, audio init, etc.?
- Should BrandingLayout also own the Container/maxWidth that individual screens currently set? Would give more consistent width control for embedded.
- What standalone branding will look like — same slots, different content?
