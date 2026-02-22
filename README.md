# Browser ABX

Double-blind audio listening tests in your browser.

[Live instance](https://fidelisanalog.github.io/Browser-ABX/) · [License](LICENSE)

Browser ABX is a static site — host it anywhere: GitHub Pages, Vercel, Netlify, or any static file server.

## Features

- **Five test methods** — AB, ABX, ABXY, Triangle, 2AFC Same-Different
- **Custom lossless audio pipeline** — WAV and FLAC decoded in-app, not by the browser
- **YAML configuration** — define tests, host audio anywhere, share the URL
- **Shareable result URLs** — encoded in the link, no server required
- **Statistical analysis** — binomial p-values, confusion matrices, signal detection theory (d')

## Quick Start

1. Create a YAML config file:

```yaml
name: My Listening Test
welcome:
  description: "Compare two audio samples."
options:
  - name: Sample A
    audioUrl: https://example.com/sample-a.wav
  - name: Sample B
    audioUrl: https://example.com/sample-b.wav
tests:
  - name: ABX Identification
    testType: ABX
    options:
      - Sample A
      - Sample B
    repeat: 10
```

2. Host the config file anywhere accessible via HTTPS.

3. Launch the test:

```
https://fidelisanalog.github.io/Browser-ABX/?test=https://yoursite.com/config.yml
```

**Requirements:**
- Audio files must be **WAV or FLAC** (lossless only — no MP3, AAC, or OGG)
- All audio files in a test must match **sample rate, channel count, and duration**
- Audio files must be served with **CORS headers** (`Access-Control-Allow-Origin`)
- Dropbox share links are automatically converted to direct download URLs

## Test Methods

### AB — Preference

Present 2 or more options in shuffled order. The listener picks a preference. There is no correct answer. Options are reshuffled every iteration. Does not support confidence ratings.

### ABX — Identification

A and B are labeled references. X is a hidden copy of either A or B. The listener identifies which reference X matches. Binary forced choice with a 50% chance rate. A confusion matrix shows correct-vs-selected identification patterns. Supports +C confidence ratings.

### ABXY — Extended Identification

Same as ABX, but adds a fourth track Y. X matches one reference, Y matches the other. This gives more comparison opportunities per iteration (X vs Y, X vs A, Y vs B, etc.). Uses the same statistical model as ABX — binary choice, 50% chance rate. Supports +C confidence ratings.

### Triangle — Odd-One-Out

Three tracks are presented: two are the same, one is different. The listener identifies the odd one out. Chance rate is 1/3 (33%). Supports +C confidence ratings.

### 2AFC-SD — Same-Different

Each trial presents a pair of audio intervals. The pair is either "same" (AA or BB) or "different" (AB or BA). The listener responds "same" or "different." Chance rate is 50%.

When `balanced: true` (the default), trial types use blocked randomization per ITU-R: groups of 4 trial types (AA, AB, BA, BB), shuffled within each block. This ensures equal representation of all pair types.

Analyzed using signal detection theory — see [Statistical Methods](#statistical-methods). Supports +C confidence ratings.

### Confidence Ratings (+C)

Append `+C` to any supported test type (e.g., `ABX+C`, `Triangle+C`, `2AFC-SD+C`). After selecting an answer, the listener rates their confidence:

- **Sure** — confident in the answer
- **Somewhat sure** — leaning but not certain
- **Guessing** — no perceived difference

Results break down accuracy by confidence level, helping distinguish lucky guesses from genuine perception.

## Configuration Reference

### Top-Level Keys

| Key | Required | Description |
|-----|----------|-------------|
| `name` | Yes | Test name, shown in the header |
| `options` | Yes | Array of audio options (see below) |
| `tests` | Yes | Array of test definitions (see below) |
| `welcome` | No | Welcome screen configuration |
| `welcome.description` | No | Markdown text shown before the test starts |
| `welcome.form` | No | Array of form fields collected before starting |
| `results` | No | Results screen configuration |
| `results.description` | No | Markdown text shown on the results page |
| `email` | No | Contact email |

### Options

| Key | Required | Description |
|-----|----------|-------------|
| `name` | Yes | Unique identifier, referenced by tests |
| `audioUrl` | Yes | URL to a WAV or FLAC file |
| `tag` | No | Group label for cross-test aggregation |

### Tests

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `name` | Yes | — | Test name |
| `testType` | Yes | — | `AB`, `ABX`, `ABX+C`, `ABXY`, `ABXY+C`, `Triangle`, `Triangle+C`, `2AFC-SD`, or `2AFC-SD+C` |
| `options` | Yes | — | Array of option names (must match defined options) |
| `repeat` | No | `10` | Number of iterations |
| `description` | No | — | Instructions shown during the test |
| `crossfade` | No | `false` | Enable crossfade on track switches |
| `crossfadeDuration` | No | `5` | Crossfade duration in milliseconds |
| `showProgress` | No | `false` | Show progress bar with per-iteration results |
| `balanced` | No | `true` | 2AFC-SD only: use ITU-R blocked randomization |

### Welcome Form Fields

Collect participant information before the test starts:

```yaml
welcome:
  description: |
    # Welcome
    Please use headphones in a quiet environment.
  form:
    - name: Age
      inputType: number
    - name: Headphone Type
      inputType: select
      options:
        - Over-ear
        - On-ear
        - In-ear
        - Speakers
```

### Full Example

```yaml
name: Demo Listening Test
welcome:
  description: |
    # Welcome to the Demo Listening Test

    This test will compare audio samples to determine if you can reliably
    identify differences between them.

    Please use headphones in a quiet environment for best results.
  form:
    - name: Age
      inputType: number
    - name: Headphone Type
      inputType: select
      options:
        - Over-ear
        - On-ear
        - In-ear
        - Speakers

results:
  description: |
    Thank you for completing the listening test! Your results are shown below.

options:
  - name: Lossless
    audioUrl: https://example.com/lossless.flac
    tag: Lossless
  - name: 320kbps
    audioUrl: https://example.com/320kbps.flac
    tag: Lossy
  - name: 128kbps
    audioUrl: https://example.com/128kbps.flac
    tag: Lossy

tests:
  - name: "Lossless vs 320kbps"
    testType: ABX
    description: "Can you identify which is X?"
    options:
      - Lossless
      - 320kbps
    repeat: 10

  - name: "Lossless vs 128kbps"
    testType: ABX+C
    description: "Can you identify which is X?"
    options:
      - Lossless
      - 128kbps
    repeat: 10

  - name: "Preference: All Bitrates"
    testType: AB
    description: "Which do you prefer?"
    options:
      - Lossless
      - 320kbps
      - 128kbps
    repeat: 5
```

### YAML Gotcha: Hash Characters

In YAML, a space followed by `#` starts an inline comment. This means:

```yaml
- name: DBTF #3    # Parsed as "DBTF" — the #3 is silently discarded!
- name: "DBTF #3"  # Correct — quotes preserve the full name
```

If option names contain `#`, wrap them in quotes. Browser ABX detects duplicate names caused by this and shows an error with a hint.

### Cloud Storage Links

**Dropbox:** Share links (`www.dropbox.com/...`) are automatically converted to direct download URLs (`dl.dropboxusercontent.com/...?dl=1`). Just paste the Dropbox share link as your `audioUrl`.

**Other hosts:** Use any direct-download HTTPS URL. The file must be served with CORS headers.

## Audio Pipeline

The audio pipeline is designed around one principle: **both tracks in a comparison must traverse an identical signal chain.** Bit-perfect playback is ideal, but what matters for valid blind testing is that any processing artifacts affect both options equally.

### Why Lossless Only

Browser ABX accepts only WAV and FLAC. Lossy codecs (MP3, AAC, OGG) introduce encoding artifacts that vary by encoder, bitrate, and codec version. If the goal is to compare two recordings, the decode step must not introduce its own differences.

### Why Custom Decoders

The Web Audio API provides `decodeAudioData()`, but its behavior varies across browsers:

- Resampling algorithms differ (Chrome uses linear interpolation, Firefox uses sinc)
- Some browsers apply normalization to decoded audio
- Format support is inconsistent (Safari does not decode FLAC via `decodeAudioData()`)
- Bit depth handling varies
- Error reporting is inconsistent

For blind testing, deterministic decoding is essential. Browser ABX uses:

- **WAV:** A custom RIFF/WAVE parser supporting 8, 16, 24, and 32-bit PCM, 32 and 64-bit IEEE float, and WAVE_FORMAT_EXTENSIBLE headers
- **FLAC:** A WebAssembly-based decoder (`@wasm-audio-decoders/flac`) for native-speed lossless decompression

Both decoders produce the same output: per-channel Float32 arrays normalized to [-1.0, 1.0], which is the Web Audio API's native internal format. No dithering is applied — it's unnecessary because both tracks go through the same path.

### Sample Rate Handling

The engine probes the system's hardware sample rate, then creates an AudioContext at the source file's sample rate. Three outcomes are possible:

1. **Hardware matches source rate** — ideal, bit-perfect output path
2. **Context matches source but hardware differs** — an info banner is shown, but test validity is unaffected because both tracks share the same output path
3. **Browser ignores the requested rate** — a warning is shown; the browser resamples internally using its own algorithm

In all three cases, both tracks undergo identical processing. The comparison remains valid.

### Caching

Audio is decoded once per unique URL. Decoded Float32 sample data is cached in memory. Each test iteration creates lightweight AudioBuffer wrappers from the cached data without re-decoding. This keeps iteration transitions fast, even with large files.

### Validation

All audio files in a test must have identical sample rate, channel count, and sample count (duration). This is enforced at load time. Mismatches produce clear error messages naming the conflicting files and the specific mismatch.

### Crossfade

Track switching can optionally use crossfading — linear gain ramps through temporary GainNodes. The default duration is 5 milliseconds.

- Below 2ms: risks audible clicks on low-frequency content
- 5ms: good default for most material
- Above 50ms: the crossfade itself becomes audible
- Useful for time-offset signals (e.g., different vinyl captures of the same master) where instantaneous switching causes phase cancellation

Configure per test with `crossfade: true` and optionally `crossfadeDuration` (in milliseconds).

### Transport

Pause uses `playbackRate = 0` rather than `AudioContext.suspend()`. This keeps the context clock running so resume is synchronous with no hardware re-acquisition delay. Seeking while playing overlaps the new source before stopping the old one to avoid audible gaps.

## Statistical Methods

### Binomial Test

Used for ABX, ABXY, Triangle, and 2AFC-SD. Computes a one-tailed p-value: the probability of achieving k or more correct answers out of n trials by chance alone. Calculated in log-space to avoid factorial overflow.

Chance rates: 1/2 for ABX, ABXY, and 2AFC-SD; 1/3 for Triangle.

A low p-value (typically < 0.05) suggests the listener can reliably distinguish the options.

### Multinomial Test

Used for AB preference tests with 3 or more options. Computes the probability of the observed preference distribution under a uniform (no preference) null hypothesis.

### Confusion Matrix

ABX and ABXY tests display a confusion matrix — a grid showing how often each reference was the correct answer (rows) versus which reference the listener selected (columns). Diagonal cells represent correct identifications.

### Signal Detection Theory (2AFC-SD)

2AFC Same-Different tests are analyzed using signal detection theory:

- **Hit rate** — proportion of "different" pairs correctly identified as different
- **False alarm rate** — proportion of "same" pairs incorrectly called different
- **d' (d-prime)** — sensitivity index: d' = z(hit rate) - z(false alarm rate)
- **Criterion c** — response bias: c = -0.5 × [z(hit rate) + z(false alarm rate)]

**Hautus (1995) log-linear correction** is applied: 0.5 is added to hit and false alarm counts, and 1 is added to the totals. This prevents infinite d' values when hit rate is 100% or false alarm rate is 0%.

The inverse normal CDF (z-score) uses the **Abramowitz & Stegun formula 26.2.23** rational approximation, accurate to approximately 4.5 × 10⁻⁴.

**Interpreting d':**

| d' | Interpretation |
|----|---------------|
| ≤ 0.5 | No reliable discrimination |
| 0.5 – 1.0 | Weak discrimination |
| 1.0 – 2.0 | Possible moderate discrimination |
| ≥ 2.0 | Strong discrimination |

**Interpreting criterion c:**

| c | Interpretation |
|---|---------------|
| ≈ 0 | Neutral — no response bias |
| < 0 | Biased toward "different" |
| > 0 | Biased toward "same" |

### Tag Aggregation

Options sharing the same `tag` value have their results aggregated across tests. For AB tests, preference counts are summed. For identification tests, correct and incorrect counts are pooled and a combined p-value is computed.

## Sharing Results

When a test is completed, results can be shared via URL. The result data is encoded as a compact base64url string (RFC 4648 §5) in the `results` query parameter:

```
https://fidelisanalog.github.io/Browser-ABX/?test=<config-url>&results=<encoded>
```

The encoded data contains aggregate statistics only — not per-iteration details. Recipients can view the results by opening the link; Browser ABX loads the config, decodes the results, and displays the statistics. No server is required.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| A, B, C… | Select corresponding track |
| X, Y | Select mystery track (ABX, ABXY) |
| ← Left Arrow | Jump back 2 seconds |
| Enter | Submit answer |

Shortcuts are disabled when a text input or slider is focused.

## Development

```bash
git clone https://github.com/FidelisAnalog/Browser-ABX.git
cd Browser-ABX
npm ci
npm run dev       # Dev server at localhost:5173
npm test          # Run test suite
npm run build     # Production build to dist/
```

**Stack:** React 18, Material UI 6, Vite 6, Vitest 3. No backend.

**Deployment:** GitHub Pages via GitHub Actions on push to `main`. Any static hosting service works.

**Console access:** The audio engine is exposed as `window.__engine` for runtime inspection and tuning:

```js
__engine._crossfadeDuration = 0.003  // 3ms crossfade
__engine.getSampleRateInfo()         // Check sample rates
```

**Project structure:**

```
src/
  audio/        Audio engine, WAV/FLAC decoders, loader, hotkeys
  components/   React components — test screens, results, stats display
  stats/        Statistical calculations
  utils/        Config parser, share encoding, test type registry
  waveform/     Waveform visualization
dist/           Build output and example configs
```

## Standards and References

- **ITU-R** — Balanced blocked randomization for 2AFC-SD trial sequences
- **Hautus, M.J. (1995)** — Log-linear correction for d' and criterion c computation
- **Abramowitz & Stegun, formula 26.2.23** — Rational approximation for the inverse normal CDF
- **Green, D.M. & Swets, J.A. (1966)** — *Signal Detection Theory and Psychophysics*

## License

MIT License. Copyright (c) 2026 John P. Jones III. See [LICENSE](LICENSE) for details.
