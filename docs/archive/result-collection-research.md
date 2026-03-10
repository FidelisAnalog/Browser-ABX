# Result Collection: Authentication Research

## Problem

Browser-ABX is a static client-side app (GitHub Pages). We need to automatically POST test results to a collection server when a user finishes a test. No user interaction (no CAPTCHAs, no logins). No secrets in client JS or public YAML config files. Must be resistant to spam/abuse.

## Fundamental Constraint

In a static client-side app, there is no secret. Everything shipped to the browser is public. No open-source analytics or telemetry tool has solved this with cryptographic certainty.

## How Existing Tools Handle It

### Plausible / Umami / Matomo (Analytics)

- Client sends a public site identifier (domain name or UUID). No secret, no token, no cookie.
- Server filters abuse: known bot User-Agents, data center IP ranges, referrer spam lists, rate limiting.
- Endpoint is essentially wide open. Fake data CAN be submitted.
- Works because analytics data has low value to an attacker.

### Sentry (Error Reporting)

- Client uses a DSN containing a "public key" — explicitly documented as NOT a secret. Write-only access.
- Multi-layer server-side protection: Nginx edge filtering, Relay service validates DSNs, per-project rate limits and quotas, IP blocking, DSN rotation/revocation.
- Fake events CAN still be sent. Mitigated, not prevented.

## Approaches That Fit Our Constraints

### 1. Server-Issued Nonce (Best Fit)

1. App loads, requests a nonce: `GET /api/token` → `{ token: base64(timestamp.hmac), expires: 300s }`
2. Test completes, app submits: `POST /api/collect` with `{ results, token }`
3. Server validates: decodes token, recomputes HMAC with server-side secret, checks expiry, checks single-use.

- **No secret in client code or config.** Token is ephemeral.
- **HMAC secret stays on server.** Token can't be forged.
- **Single-use.** Replay is worthless.
- **Time-limited.** Stale tokens rejected.
- **Two HTTP requests per test** (get nonce at load, submit at end).
- Token endpoint itself protected by CORS + IP rate limiting.
- Attacker CAN request nonces programmatically (CORS bypassable outside browser), but each requires its own request and is rate-limited.

### 2. Proof-of-Work (ALTCHA)

1. Client requests a challenge from server.
2. Server generates: random salt + secret number + HMAC signature.
3. Client iterates SHA-256 hashes until it finds the solution (~1-2 sec of CPU time).
4. Client submits: solution + challenge + signature with results.
5. Server re-verifies hash and HMAC.

- **No secret in client.** HMAC secret is server-side.
- **No user interaction.** Computation is invisible.
- **Makes mass spam expensive.** Each fake submission costs real CPU time.
- **Single-use, time-limited challenges.**
- **MIT licensed, self-hostable** (https://github.com/altcha-org/altcha).
- Mobile devices solve more slowly (~2-4 sec).
- Determined attacker with GPU farms could still brute-force, but cost is real.

### 3. Invisible Browser Challenge (Cloudflare Turnstile)

- No user interaction. Runs proof-of-work + behavioral analysis + browser fingerprinting invisibly.
- Generates single-use token (5-min expiry) validated server-side.
- Public site key in client (not a secret by design). Secret key on server.
- Very effective, but **third-party dependency** and privacy implications.

### 4. CORS Origin Validation (Supplementary Layer Only)

- Server checks `Origin` header, only accepts requests from whitelisted origins.
- Browsers enforce Origin headers — can't be overridden by client JS.
- **Trivially bypassed outside a browser** (curl, Postman, etc.).
- Use as one layer, never sole protection.

## Supplementary Server-Side Measures

These apply regardless of which approach is chosen:

- **Rate limiting** per IP and per identifier
- **Payload shape validation** — reject anything that doesn't match expected result structure
- **Bot User-Agent filtering**
- **Data center IP range blocking** (AWS, GCP, Azure ranges are published)
- **Timing analysis** — reject submissions faster than humanly possible for the test duration
- **Honeypot fields** — hidden fields that humans ignore but bots fill

## Recommendation

**Nonce-based + CORS + rate limiting + payload validation** is the simplest approach that covers the requirements. No third-party dependencies, no client-side computation cost, no secrets exposed.

If spam becomes a real problem, layer proof-of-work (ALTCHA) on top — it's the only self-hosted approach that imposes a real cost per submission without user interaction.

## Config Impact

Minimal. The server URL either:
- Lives in the YAML config: `resultsServer: https://results.example.com`
- Or is hardcoded in the app for a centralized collection service

No tokens, keys, or secrets in the config.
