# Embedding via iframe & postMessage

Browser-ABX can be embedded in an iframe and controlled entirely via `postMessage`. The parent page sends a test configuration as JSON; the app runs the test and posts events (including results) back to the parent. No server endpoints are involved.

## Hosting

Point your iframe at `https://acidtest.io`. There is no need to self-host the SPA.

| URL | Purpose |
|---|---|
| `https://acidtest.io` | Production |
| `https://acidtest.io/test` | Staging / internal testing |
| `https://acidtest.io/preview` | Preview builds for external review |

## iframe Styling

```html
<iframe src="https://acidtest.io/" scrolling="no"
  style="border:none; width:100%; height:auto; min-height:700px;"></iframe>
```

| Property | Why |
|---|---|
| `border:none` | Removes the default iframe border. |
| `scrolling="no"` | Prevents a scrollbar inside the iframe. The parent page's scrollbar handles everything. |
| `height:auto; min-height:700px` | `height:auto` prevents the iframe from stretching beyond the content (no gap below). `min-height:700px` ensures enough room for the test screen. Use the `acidtest:resize` event to dynamically adjust the iframe height as content changes. |

For a seamless appearance, set the iframe's `background` to match your page background. Our dark theme uses `#121212` and light theme uses `#fff`.

## Safari Audio Cleanup

Safari can retain stale audio pipeline state from a previous iframe across page navigations and reloads. This can cause audio playback to be delayed by several hundred milliseconds relative to the visual playhead. To prevent this, destroy the iframe when the user navigates away:

```html
<script>
window.addEventListener('pagehide', function() {
  var iframe = document.querySelector('iframe[src*="acidtest.io"]');
  if (iframe) iframe.src = 'about:blank';
});
</script>
```

This forces Safari to tear down the audio context cleanly. When the user returns, the iframe reloads fresh. This only affects Safari — Chrome and Firefox are not affected.

## Handshake

1. Parent creates an iframe pointing at `https://acidtest.io` (no query params)
2. App detects it's inside an iframe (`window.parent !== window`)
3. App posts `acidtest:ready` to parent
4. Parent receives `acidtest:ready`, posts `acidtest:config` with the test config and options
5. App validates the config, loads audio, and runs the test
6. App posts progress and completion events back to parent

## Parent → App: `acidtest:config`

```js
iframe.contentWindow.postMessage({
  type: 'acidtest:config',
  config: { /* test config — see below */ },
  options: {
    postResults: true,   // include results/stats in acidtest:completed (default: true)
    skipWelcome: false,   // skip welcome screen, auto-start when audio is ready (default: false)
    skipResults: false,   // skip results screen, emit acidtest:completed and show "Test complete" (default: false)
    theme: 'system',     // 'light', 'dark', or 'system' (default: 'system')
  }
}, '*');
```

### Embed Options

| Option | Type | Default | Description |
|---|---|---|---|
| `postResults` | boolean | `true` | When `true`, `acidtest:completed` includes `results`, `stats`, `shareUrl`, and `form`. When `false`, `acidtest:completed` is empty. |
| `skipWelcome` | boolean | `false` | Skip the welcome screen. The test auto-starts as soon as audio is loaded. No welcome form data is collected. |
| `skipResults` | boolean | `false` | Skip the results screen. The app shows a minimal "Test complete" message instead of the full results view. Use this when the parent handles result display. |
| `theme` | string | `'system'` | Color scheme: `'light'`, `'dark'`, or `'system'` (follows OS preference). Can be changed live via `acidtest:theme`. |

## Config JSON Structure

The config object is the same structure as the YAML config, but as JSON. The app runs it through the same normalization and validation.

```json
{
  "name": "My Listening Test",
  "welcome": {
    "description": "Markdown text shown on the welcome screen.",
    "form": [
      { "name": "Age", "inputType": "number" },
      { "name": "Headphone Type", "inputType": "select", "options": ["Over-ear", "In-ear"] }
    ]
  },
  "results": {
    "description": "Markdown text shown on the results screen."
  },
  "options": [
    { "name": "Sample A", "audioUrl": "https://example.com/a.flac", "tag": "Lossless" },
    { "name": "Sample B", "audioUrl": "https://example.com/b.flac", "tag": "Lossy" }
  ],
  "tests": [
    {
      "name": "ABX: A vs B",
      "testType": "ABX",
      "description": "Select the option which is the same as X.",
      "options": ["Sample A", "Sample B"],
      "repeat": 10,
      "crossfade": true,
      "showProgress": true
    }
  ]
}
```

### Top-Level Fields

| Field | Required | Description |
|---|---|---|
| `name` | yes | Test name. Shown in the page title. |
| `welcome` | no | Welcome screen config. Omit to show a default welcome screen with no form. |
| `welcome.description` | no | Markdown content for the welcome screen. |
| `welcome.form` | no | Array of form fields shown before the test starts. Each field has `name`, `inputType` (`text`, `number`, `select`), and `options` (for select). Collected data is included in `acidtest:started` and `acidtest:completed` events. |
| `results` | no | Results screen config. |
| `results.description` | no | Markdown content shown above the results. |
| `options` | yes | Array of audio options. Each option has a unique `name`, an `audioUrl`, and an optional `tag`. |
| `tests` | yes | Array of tests to run sequentially. |

### Option Fields

| Field | Required | Description |
|---|---|---|
| `name` | yes | Unique display name for this option. Tests reference options by name. |
| `audioUrl` | yes | URL to the audio file (WAV or FLAC only). Dropbox share links are auto-converted to direct download URLs. |
| `tag` | no | Category label (e.g., `"Lossless"`, `"Lossy"`). Used in results display. |

### Test Fields

| Field | Required | Default | Description |
|---|---|---|---|
| `name` | yes | | Display name for this test. |
| `testType` | yes | | Test methodology. See test types below. |
| `description` | no | `null` | Instructions shown during the test. |
| `options` | yes | | Array of option names (strings) referencing top-level `options` by name. |
| `repeat` | no | `10` | Number of trials. Max 50. Not used by staircase tests. |
| `crossfade` | no | *(user choice)* | `true` forces crossfade on, `false` forces it off, omit to let the user toggle. |
| `crossfadeDuration` | no | | Crossfade duration in milliseconds. |
| `showProgress` | no | `false` | Show running accuracy during the test (ABX, Triangle, etc.). |
| `balanced` | no | `true` | For 2AFC-SD: use balanced trial sequences (blocked randomization). |

### Test Types

| `testType` | Description | Options Required |
|---|---|---|
| `AB` | Preference test — which do you prefer? | 2+ |
| `ABX` | Identification — which option matches X? | 2+ |
| `ABX+C` | ABX with confidence rating | 2+ |
| `ABXY` | Double-blind identification — match X and Y | exactly 2 |
| `ABXY+C` | ABXY with confidence rating | exactly 2 |
| `Triangle` | Odd-one-out — which sample is different? | 2 |
| `Triangle+C` | Triangle with confidence rating | 2 |
| `2AFC-SD` | Same/different discrimination | 2 |
| `2AFC-SD+C` | 2AFC-SD with confidence rating | 2 |
| `2AFC-Staircase` | Adaptive staircase threshold test | 5+ |

The `+C` suffix adds confidence buttons (sure / somewhat sure / guessing) to each trial. Confidence values are included in the results data.

Staircase tests use a `staircase` config object instead of `repeat`. See the main YAML documentation for staircase-specific fields.

## Parent → App: `acidtest:theme`

Change the color scheme at any time after config is sent. Useful for syncing with the parent page's own theme toggle.

```js
iframe.contentWindow.postMessage({ type: 'acidtest:theme', theme: 'dark' }, '*');
```

Valid values: `'light'`, `'dark'`, `'system'`.

## App → Parent: Events

All events are posted to `window.parent` via `postMessage`. Each message has a `type` field prefixed with `acidtest:`.

### `acidtest:ready`

Fired when the iframe has loaded and is waiting for config.

```json
{ "type": "acidtest:ready" }
```

**Action required:** Send `acidtest:config` to the iframe in response.

### `acidtest:error`

Fired if config validation fails.

```json
{ "type": "acidtest:error", "error": "Config must have a \"name\" field" }
```

### `acidtest:loading`

Fired during audio download. May fire many times.

```json
{ "type": "acidtest:loading", "loaded": 3, "total": 5 }
```

`loaded` and `total` are file counts, not bytes.

### `acidtest:started`

Fired when the welcome form is submitted and the test begins. If `skipWelcome` is `true`, `form` is `{}`.

```json
{ "type": "acidtest:started", "form": { "Age": "30", "Headphone Type": "Over-ear" } }
```

### `acidtest:progress`

Fired after each trial is submitted.

```json
{
  "type": "acidtest:progress",
  "testIndex": 0,
  "testName": "ABX: A vs B",
  "trialIndex": 4,
  "totalTests": 2,
  "totalTrials": 10,
  "isCorrect": true
}
```

`trialIndex` is 0-based (the trial that was just completed). `totalTrials` is `null` for adaptive tests (staircase) since the total isn't known in advance. `isCorrect` is `true`/`false` for tests with a correct answer, or `null` for preference tests (AB).

### `acidtest:completed`

Fired when all tests are finished. Payload depends on `postResults`.

With `postResults: false`:

```json
{ "type": "acidtest:completed" }
```

With `postResults: true`, the message includes `results`, `stats`, `shareUrl`, and `form`:

```json
{
  "type": "acidtest:completed",
  "results": [ /* per-test iteration data — see below */ ],
  "stats": [ /* per-test computed statistics (p-values, matrices, etc.) */ ],
  "shareUrl": "https://...",
  "form": { "Age": "30" }
}
```

`shareUrl` is a self-contained URL that renders the results page without the parent.

#### Results payload

Each entry in the `results` array describes one test. The `options` map shows which position label (A, B, ...) corresponds to which config option name (the shuffled assignment for that test run). Iteration data uses `{ label, name }` objects so the consumer can use either.

**ABX / ABXY / Triangle:**

```json
{
  "name": "ABX: A vs B",
  "testType": "ABX",
  "options": { "A": "FLAC", "B": "MP3 320k" },
  "iterations": [
    {
      "selected":      { "label": "B", "name": "MP3 320k" },
      "correctAnswer": { "label": "A", "name": "FLAC" },
      "isCorrect": false,
      "confidence": "sure",
      "durationMs": 4230
    }
  ]
}
```

`confidence` is only present for `+C` variants (ABX+C, Triangle+C, etc.).

**AB (preference):**

```json
{
  "name": "Preference: A vs B",
  "testType": "AB",
  "options": { "A": "FLAC", "B": "MP3 320k" },
  "iterations": [
    {
      "selected": { "label": "A", "name": "FLAC" },
      "durationMs": 3100
    }
  ]
}
```

No `correctAnswer` or `isCorrect` — preference tests have no right answer.

**2AFC-SD (same/different):**

```json
{
  "name": "Same or Different?",
  "testType": "2AFC-SD",
  "options": { "A": "FLAC", "B": "MP3 320k" },
  "iterations": [
    {
      "response": "same",
      "pairType": "different",
      "isCorrect": false,
      "confidence": "somewhat",
      "durationMs": 5200
    }
  ]
}
```

`response` is what the user chose, `pairType` is the actual pair composition.

**2AFC-Staircase:**

```json
{
  "name": "Threshold Test",
  "testType": "2AFC-Staircase",
  "options": { "A": "Reference", "B": "Level 1", "C": "Level 2" },
  "iterations": [
    { "level": 5, "correct": true, "durationMs": 2800 },
    { "level": 5, "correct": true, "durationMs": 3100 },
    { "level": 4, "correct": false, "durationMs": 2600 }
  ],
  "finalState": { /* adaptive algorithm state at convergence */ }
}
```

`level` is the 1-based index into the non-reference options. `finalState` contains the full staircase algorithm state for custom threshold computation.

## Minimal Integration Example

```html
<!DOCTYPE html>
<html>
<head><title>My Test</title></head>
<body>
  <iframe id="testFrame" src="https://acidtest.io/" scrolling="no"
    style="border:none; width:100%; height:auto; min-height:700px;"></iframe>
  <script>
    const config = {
      name: "Quick Test",
      options: [
        { name: "A", audioUrl: "https://example.com/a.flac" },
        { name: "B", audioUrl: "https://example.com/b.flac" }
      ],
      tests: [
        { name: "A vs B", testType: "ABX", options: ["A", "B"], repeat: 5 }
      ]
    };

    window.addEventListener('message', (e) => {
      if (e.data?.type === 'acidtest:ready') {
        document.getElementById('testFrame').contentWindow.postMessage({
          type: 'acidtest:config',
          config: config,
          options: { postResults: true, skipWelcome: true, skipResults: true }
        }, '*');
      }

      if (e.data?.type === 'acidtest:completed') {
        console.log('Results:', e.data.results);
        console.log('Stats:', e.data.stats);
        // Navigate to your own results page, POST to your backend, etc.
      }

      if (e.data?.type === 'acidtest:progress') {
        console.log(`Trial ${e.data.trialIndex + 1}/${e.data.totalTrials} of test ${e.data.testIndex + 1}/${e.data.totalTests}`);
      }
    });
  </script>
</body>
</html>
```

### `acidtest:resize`

Fired when the app's content height changes. Use this to dynamically resize the iframe container so no scrollbar is needed inside the iframe.

```json
{ "type": "acidtest:resize", "height": 755 }
```

`height` is the content height in pixels. Update the iframe's container height to match:

```js
window.addEventListener('message', (e) => {
  if (e.data?.type === 'acidtest:resize' && e.data.height) {
    iframe.style.height = e.data.height + 'px';
  }
});
```

## Abandonment Tracking

The app does not track abandonment directly. The parent should monitor `acidtest:progress` events to know the current position. If `acidtest:completed` never arrives, the parent can infer the test was abandoned. Since the iframe shares the parent's tab lifecycle, closing the tab ends both.

## Working Example

A full test harness with config editor, option checkboxes, and event log is included in the build:

**Live:** [embed-test.html](https://acidtest.io/embed-test.html)

Source: `public/embed-test.html`

> **Note:** The embed test page must be served over HTTP — it will not work opened directly from the filesystem (`file://`) because browsers block cross-origin iframe creation from `file://` pages.
