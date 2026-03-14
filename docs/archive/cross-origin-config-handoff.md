# Cross-Origin Config Handoff (Generator → Browser-ABX)

## Problem

A separate generator/chooser app (e.g. `myhi.fi` or `docs.myhi.fi`) lets users pick files and test types, then needs to launch Browser-ABX (`abx.myhi.fi`) with that config. Different origins, so no shared localStorage or BroadcastChannel. Config is too large for URL encoding.

## Solution: `window.postMessage`

Cross-origin, no size limit, no server, built-in browser API.

## Flow

1. User configures test in the generator app
2. Generator calls `window.open('https://abx.myhi.fi/')`
3. Browser-ABX loads, posts a "ready" message back to `window.opener`
4. Generator receives "ready", posts the config object via `postMessage`
5. Browser-ABX validates the origin, receives config, launches test

## Notes

- Browser-ABX must validate `event.origin` against an allowed list before accepting the config
- Generator holds the `window.open()` reference to post to; Browser-ABX uses `window.opener` to signal readiness
- No downloads, no file sharing, no user interaction beyond clicking "start test"
- YAML config path still exists for forum-shared pre-built tests; this is for the automated "compare these now" use case
