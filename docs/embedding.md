# Embedding via iframe & postMessage

Browser-ABX can be embedded in an iframe and controlled entirely via `postMessage`. The parent page sends a test configuration as JSON; the app runs the test and posts events (including results) back to the parent. No server endpoints are involved.

## Hosting

Build the SPA (`npm run build`) and host the contents of `dist/` on your own server. The embed page loads the app in an iframe pointed at your hosted copy.

## Handshake

1. Parent creates an iframe pointing at the hosted app (no query params)
2. App detects it's inside an iframe (`window.parent !== window`)
3. App posts `dbt:ready` to parent
4. Parent receives `dbt:ready`, posts `dbt:config` with the test config and options
5. App validates the config, loads audio, and runs the test
6. App posts progress and completion events back to parent

## Parent → App: `dbt:config`

```js
iframe.contentWindow.postMessage({
  type: 'dbt:config',
  config: { /* test config — see below */ },
  options: {
    postResults: true,   // include results/stats in dbt:completed (default: true)
    skipWelcome: false,   // skip welcome screen, auto-start when audio is ready (default: false)
    skipResults: false,   // skip results screen, emit dbt:completed and show "Test complete" (default: false)
  }
}, '*');
```

### Embed Options

| Option | Type | Default | Description |
|---|---|---|---|
| `postResults` | boolean | `true` | When `true`, `dbt:completed` includes `results`, `stats`, `shareUrl`, and `form`. When `false`, `dbt:completed` is empty. |
| `skipWelcome` | boolean | `false` | Skip the welcome screen. The test auto-starts as soon as audio is loaded. No welcome form data is collected. |
| `skipResults` | boolean | `false` | Skip the results screen. The app shows a minimal "Test complete" message instead of the full results view. Use this when the parent handles result display. |

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
| `welcome.form` | no | Array of form fields shown before the test starts. Each field has `name`, `inputType` (`text`, `number`, `select`), and `options` (for select). Collected data is included in `dbt:started` and `dbt:completed` events. |
| `results` | no | Results screen config. |
| `results.description` | no | Markdown content shown above the results. |
| `options` | yes | Array of audio options. Each option has a unique `name`, an `audioUrl`, and an optional `tag`. |
| `tests` | yes | Array of tests to run sequentially. |

### Option Fields

| Field | Required | Description |
|---|---|---|
| `name` | yes | Unique display name for this option. Tests reference options by name. |
| `audioUrl` | yes | URL to the audio file (FLAC, WAV, MP3, etc.). Dropbox share links are auto-converted to direct download URLs. |
| `tag` | no | Category label (e.g., `"Lossless"`, `"Lossy"`). Used in results display. |

### Test Fields

| Field | Required | Default | Description |
|---|---|---|---|
| `name` | yes | | Display name for this test. |
| `testType` | yes | | Test methodology. See test types below. |
| `description` | no | `null` | Instructions shown during the test. |
| `options` | yes | | Array of option names (strings) referencing top-level `options` by name. |
| `repeat` | no | `10` | Number of trials. Max 50. Not used by staircase tests. |
| `crossfade` | no | `false` | Enable crossfade between options during playback switching. |
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

The `+C` suffix adds a confidence slider to each trial. Confidence values are included in the results data.

Staircase tests use a `staircase` config object instead of `repeat`. See the main YAML documentation for staircase-specific fields.

## App → Parent: Events

All events are posted to `window.parent` via `postMessage`. Each message has a `type` field prefixed with `dbt:`.

### `dbt:ready`

Fired when the iframe has loaded and is waiting for config.

```json
{ "type": "dbt:ready" }
```

**Action required:** Send `dbt:config` to the iframe in response.

### `dbt:error`

Fired if config validation fails.

```json
{ "type": "dbt:error", "error": "Config must have a \"name\" field" }
```

### `dbt:loading`

Fired during audio download. May fire many times.

```json
{ "type": "dbt:loading", "loaded": 3, "total": 5 }
```

`loaded` and `total` are file counts, not bytes.

### `dbt:started`

Fired when the welcome form is submitted and the test begins. If `skipWelcome` is `true`, `form` is `{}`.

```json
{ "type": "dbt:started", "form": { "Age": "30", "Headphone Type": "Over-ear" } }
```

### `dbt:progress`

Fired after each trial is submitted.

```json
{
  "type": "dbt:progress",
  "testIndex": 0,
  "testName": "ABX: A vs B",
  "trialIndex": 4,
  "totalTests": 2,
  "totalTrials": 10
}
```

`trialIndex` is 0-based (the trial that was just completed). `totalTrials` is `null` for adaptive tests (staircase) since the total isn't known in advance.

### `dbt:completed`

Fired when all tests are finished. Payload depends on `postResults`.

With `postResults: true`:

```json
{
  "type": "dbt:completed",
  "results": [ /* per-test result arrays */ ],
  "stats": [ /* per-test computed statistics */ ],
  "shareUrl": "https://...",
  "form": { "Age": "30" }
}
```

With `postResults: false`:

```json
{ "type": "dbt:completed" }
```

The `results` array contains one entry per test with the raw trial data. The `stats` array contains computed statistics (p-values, confusion matrices, etc.). The `shareUrl` is a self-contained URL that can render the results page without the parent.

## Minimal Integration Example

```html
<!DOCTYPE html>
<html>
<head><title>My Test</title></head>
<body>
  <iframe id="testFrame" src="https://your-host.com/path-to-app/" style="width:100%;height:80vh;border:none;"></iframe>
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
      if (e.data?.type === 'dbt:ready') {
        document.getElementById('testFrame').contentWindow.postMessage({
          type: 'dbt:config',
          config: config,
          options: { postResults: true, skipWelcome: true, skipResults: true }
        }, '*');
      }

      if (e.data?.type === 'dbt:completed') {
        console.log('Results:', e.data.results);
        console.log('Stats:', e.data.stats);
        // Navigate to your own results page, POST to your backend, etc.
      }

      if (e.data?.type === 'dbt:progress') {
        console.log(`Trial ${e.data.trialIndex + 1}/${e.data.totalTrials} of test ${e.data.testIndex + 1}/${e.data.totalTests}`);
      }
    });
  </script>
</body>
</html>
```

## Abandonment Tracking

The app does not track abandonment directly. The parent should monitor `dbt:progress` events to know the current position. If `dbt:completed` never arrives, the parent can infer the test was abandoned. Since the iframe shares the parent's tab lifecycle, closing the tab ends both.

## Working Example

A full test harness with config editor, option checkboxes, and event log is included in the build:

**Live:** [embed-test.html](https://code.myhi.fi/Browser-ABX/embed-test.html)

Source: `public/embed-test.html`

> **Note:** The embed test page must be served over HTTP — it will not work opened directly from the filesystem (`file://`) because browsers block cross-origin iframe creation from `file://` pages.
