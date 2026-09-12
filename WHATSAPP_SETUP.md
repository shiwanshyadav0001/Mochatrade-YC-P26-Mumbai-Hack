# NETRA WhatsApp Integration — Setup & Deployment

This document describes how to connect NETRA's Continuous Trust Intelligence to WhatsApp via the official Meta WhatsApp Business Cloud API. WhatsApp is an **additional** interface — the existing web dashboard (`Overview`, `Live Monitor`, `Observatory`, etc.) continues to work unchanged.

## Architecture

```
WhatsApp User
   ↓
Meta WhatsApp Cloud API (https://graph.facebook.com)
   ↓
NETRA WhatsApp Webhook  →  POST /api/whatsapp/webhook  (public HTTPS)
   ↓
NETRA API / Service Layer
   ↓
Existing NETRA Intelligence Engine (engine.ingest, evaluate_action, get_observatory, get_trader, get_protocols, verify_audit_chain)
   ↓
Trust / Risk / Policy / Protocol / Enforcement
   ↓
WhatsApp Response Formatter → Meta Cloud API → WhatsApp User
```

* No second risk engine. All demo flows call the same `NetraEngine` methods used by the web dashboard and reuse `SECURITY_PROTOCOLS`, `OPT_IN_PROTOCOLS`, `ActionEnforcementService`, `BaselineEngine`, `BehavioralAnomalyService`, etc.
* Webhook is mounted as FastAPI router at `/api/whatsapp` and included in `main.py` without modifying existing routes.

## Environment Variables

Set these in your hosting environment (`.env`, Docker, Render, Fly, Railway, etc.). **Never commit them.**

| Variable | Required | Example | Description |
|---|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Yes (for sending) | `EAAK...` | Permanent or temporary WhatsApp Cloud API token (System User or App token). |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | `123456789012345` | Phone number ID from WhatsApp > API Setup > Phone number ID. |
| `WHATSAPP_VERIFY_TOKEN` | Yes | `netra-verify-random-32-chars` | Random string you choose; must match the token you enter in Meta webhook configuration. Used for `GET` verification (`hub.verify_token`). |
| `WHATSAPP_APP_SECRET` | Recommended | `a1b2c3...` | App Secret from App Settings > Basic. Enables `X-Hub-Signature-256` HMAC verification (`sha256` of raw body). If empty, signature check is skipped (not recommended for production). |
| `WHATSAPP_API_VERSION` | No | `v21.0` | Graph API version. Defaults to `v21.0`. |
| `WHATSAPP_DEMO_TRADER_ID` | No | `7842` | Demo trader shown in WhatsApp risk flows. Defaults to `7842` (Maya Chen). |

Add to `.env.example` already documents these. Copy to `.env` locally:

```bash
WHATSAPP_ACCESS_TOKEN=EAA...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=netra-verify-token-please-change
WHATSAPP_APP_SECRET=your_app_secret
WHATSAPP_API_VERSION=v21.0
```

## Local Development (without Meta)

* If `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is empty, the webhook still accepts and processes messages, but sending is gracefully skipped (logged). This allows local testing and `pytest` without credentials.
* `GET /api/whatsapp/health` reports `configured: false` when not configured.

## Webhook Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/whatsapp/webhook` | None (Meta verification) | Handles `hub.mode=subscribe & hub.verify_token==WHATSAPP_VERIFY_TOKEN` → returns `hub.challenge`. |
| `POST` | `/api/whatsapp/webhook` | None (but validates `X-Hub-Signature-256` if `WHATSAPP_APP_SECRET` set) | Receives WhatsApp message payload, parses `from` and `text`/`interactive`, routes to NETRA demo flows, sends reply via Cloud API. Always returns `200` within 5s to avoid Meta retries. |
| `GET` | `/api/whatsapp/health` | None | Reports whether WhatsApp is `configured`, which env vars are present, API version, webhook URL. |
| `GET` | `/api/whatsapp/config` | None | Non-sensitive config prefix (first 4 chars of phone ID). |

All other NETRA endpoints remain under their existing `require_role` auth. WhatsApp webhook is intentionally public (Meta must reach it) but validates token + signature.

## Meta WhatsApp Business Cloud API Configuration

### Prerequisites

1. **Meta Developer Account** at https://developers.facebook.com
2. **Create App**: My Apps → Create App → Business → Enter app name `NETRA`
3. **Add Product**: WhatsApp → Set up
4. **Phone Number**: WhatsApp > API Setup shows a test phone number and Phone number ID. For production, add your own business phone.

### 1. Webhook URL

Your backend must be publicly reachable over **HTTPS** (required by Meta). Options:

* **Production deployment:** `https://your-domain.com/api/whatsapp/webhook`
  * If using `docker-compose` locally, expose via `ngrok` for testing: `ngrok http 8000` → `https://xxxx.ngrok-free.app/api/whatsapp/webhook`
  * If deploying to Render/Fly/Railway/Vercel, use the assigned HTTPS URL.

Set this URL in Meta:

**App Dashboard → WhatsApp → Configuration → Webhook → Edit**

* **Callback URL:** `https://your-domain.com/api/whatsapp/webhook`
* **Verify Token:** *exactly* the value of `WHATSAPP_VERIFY_TOKEN` in your backend env (e.g., `netra-verify-random-32-chars`)
* Click **Verify and Save** → Meta will send `GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` and expect the `hub.challenge` echo. The `GET` handler implements this.

### 2. Webhook Subscription (Subscribe to events)

After verifying, **Manage** (or `Webhook fields`) and subscribe to:

* `messages` — **required** (incoming user messages, delivery statuses)

Optionally (for completeness, but not required for demo):

* `message_deliveries`, `message_reads`, `message_echoes` are ignored gracefully (no user message → returns `200`).

### 3. Access Token

* **Temporary (24h, for testing):** WhatsApp > API Setup → Temporary access token → Copy → set as `WHATSAPP_ACCESS_TOKEN`.
* **Permanent (production):** Business Settings → System Users → Create System User → Add Asset (your WhatsApp App) with `whatsapp_business_messaging` permission → Generate Token → set as `WHATSAPP_ACCESS_TOKEN`.

### 4. Phone Number ID

WhatsApp > API Setup → **Phone number ID** (not the phone number itself) → set as `WHATSAPP_PHONE_NUMBER_ID`.

### 5. App Secret (for signature)

App Settings → Basic → **App Secret** → Show → set as `WHATSAPP_APP_SECRET`. This enables `X-Hub-Signature-256` verification in `POST /api/whatsapp/webhook`.

### 6. Recipient Number

For testing with the sandbox number, add recipient numbers:

WhatsApp > API Setup → **To** field → Manage phone number list → Add your personal WhatsApp number and accept the invite code.

For production with your own business number, any WhatsApp user can message you after you go live and complete business verification.

### 7. Required Permissions

* `whatsapp_business_messaging`
* `whatsapp_business_management` (if managing templates, not required for demo)

### Environment Variable Summary (for deployment)

```bash
WHATSAPP_ACCESS_TOKEN=<from Step 3>
WHATSAPP_PHONE_NUMBER_ID=<from Step 4>
WHATSAPP_VERIFY_TOKEN=<you chose in Step 1>
WHATSAPP_APP_SECRET=<from Step 5>
```

Do **not** commit these. Set them in your hosting provider's environment UI:

* **Render:** Dashboard → Service → Environment → Add
* **Fly.io:** `fly secrets set WHATSAPP_ACCESS_TOKEN=...`
* **Railway:** Variables
* **Docker Compose:** `.env` file (already wired in `docker-compose.yml`)

## Deployment

### Current Architecture (from `docker-compose.yml`)

* `backend` (FastAPI, `:8000`, `main:app`) — now includes WhatsApp router at `/api/whatsapp/*`
* `frontend` (Vite + Nginx, `:80` → `:8080`)
* `postgres` (not used by current SQLite engine, but available)
* `neo4j` (not used by current SQLite engine, but available)

The SQLite engine (`netra.db`) is file-based and persists via Docker volume if needed. The WhatsApp integration reuses this same engine; no second DB.

### Extending Existing Deployment

No new backend is needed. The existing `backend` service already serves WhatsApp after adding `whatsapp.py` and wiring in `main.py`.

**Docker Compose (already updated):**

`docker-compose.yml` now forwards WhatsApp env vars:

```yaml
environment:
  WHATSAPP_ACCESS_TOKEN: ${WHATSAPP_ACCESS_TOKEN:-}
  WHATSAPP_PHONE_NUMBER_ID: ${WHATSAPP_PHONE_NUMBER_ID:-}
  WHATSAPP_VERIFY_TOKEN: ${WHATSAPP_VERIFY_TOKEN:-}
  WHATSAPP_APP_SECRET: ${WHATSAPP_APP_SECRET:-}
```

Deploy as usual:

```bash
docker compose up --build -d
# or
docker-compose up --build -d
```

### Public HTTPS Requirement

Meta requires `https://`. Options:

* **Production domain + TLS:** Deploy behind a reverse proxy (Nginx, Traefik, Caddy) with Let's Encrypt.
* **Tunnelling for local demo/judging:** `ngrok http 8000` → use the `https://xxxx.ngrok-free.app/api/whatsapp/webhook` as webhook URL. For a stable judge demo, deploy to a host with a permanent HTTPS URL (Render, Fly, Railway).

### Health Check

After deployment, verify:

```bash
curl https://your-domain.com/api/whatsapp/health
# → {"status":"ok","configured":true,"has_access_token":true,...}

curl https://your-domain.com/api/health
# → existing NETRA health
```

## WhatsApp Demo Flow (User Perspective)

1. User sends **Hi** (or taps `Hello`) → NETRA replies with interactive list (or text fallback) of 9 actions.
2. User taps/replies **1** → Flagship Demo (real `engine.prepare_scenario("FLAGSHIP")` → `ingest` → progressive `EVENT → CONTEXT → SIGNALS → BASELINE → TRUST → POLICY → BLOCK → AUDIT`).
3. **2** → Attack Scenario (6-step kill-chain, `ATTACK_SURGE`).
4. **3** → Legitimate Travel (context-aware allow).
5. **4** → Reset Baseline (isolated reset).
6. **5** → Trader Risk (`#7842` `94→0`, `RESTRICTED`, risk drivers, protocols).
7. **6** → Trading Safety menu → user replies `Trade $2K`, `Trade $15K`, `Leverage 50x`, `Withdraw $25K` → `engine.evaluate_action` explains `ALLOW/VERIFY/RESTRICT/BLOCK`.
8. **7** → Observatory (fleet `HIGH_ALERT`, `RESTRICTED`, top trader).
9. **8** → Protocols (`P-01` to `P-04`, plus `OPT-01..03`).
10. **9** → Audit Trail (SHA-256 chain `valid`, head hash, last event).

All flows reuse `engine.ingest`, `evaluate_action`, `get_observatory`, `get_protocols`, `verify_audit_chain`, etc. No invented backend.

## Security

* **Webhook verification:** `GET` checks `hub.verify_token == WHATSAPP_VERIFY_TOKEN`.
* **Signature:** `POST` validates `X-Hub-Signature-256 == HMAC-SHA256(raw_body, WHATSAPP_APP_SECRET)` if secret is set; logs warning and returns `403` if invalid.
* **No secrets in Git:** `.env.example` documents variables without values; `.gitignore` already excludes `.env`, `*.db`.
* **Input validation:** `POST` body parsed safely, non-message events (status updates) return `200` without processing.
* **Rate limiting:** Relies on Meta's own throttling; for production, add FastAPI `slowapi` or reverse-proxy limit if needed.
* **Logging:** Incoming `from` and truncated text logged at `info`, full payload not logged; no token leakage.

## UX Notes

* All replies are concise, mobile-readable, structured with `*bold*` and `•` bullets. Emojis sparingly (`🛡️`, `🚨`, `👁️`, etc.).
* Interactive lists preferred (9 rows, 2 sections) → fallback to numbered text if Cloud API returns error (e.g., unconfigured).
* Flagship/Attack demos split into 3 sequential messages to stay under 4096 chars and remain readable.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Verification failed` on Meta save | `WHATSAPP_VERIFY_TOKEN` mismatch | Ensure env value equals Meta field exactly (no extra spaces). Check `GET /api/whatsapp/health` shows `has_verify_token: true`. |
| `Failed to send` in logs, user gets no reply | `WHATSAPP_ACCESS_TOKEN` or `PHONE_NUMBER_ID` wrong or expired (temporary token 24h) | Regenerate token, update env, restart backend. Check `GET /api/whatsapp/health` `configured: true`. |
| `Invalid signature` 403 | `WHATSAPP_APP_SECRET` mismatch or missing header | Ensure `App Secret` matches, or leave `WHATSAPP_APP_SECRET` empty to disable check (not recommended). |
| No reply but webhook shows `200` | Recipient not in allowed list (sandbox) | Add phone to WhatsApp > API Setup > To > Manage phone number list. |
| Webhook not reachable | Backend not public HTTPS | Use `ngrok` or deploy to HTTPS host. |

## Local Testing Without Meta

* Set `WHATSAPP_VERIFY_TOKEN` to any value and test verification:

```bash
curl "http://localhost:8000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=netra-verify-token-please-change&hub.challenge=1234"
# → 1234
```

* Simulate incoming message (bypassing Meta):

```bash
curl -X POST http://localhost:8000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object":"whatsapp_business_account",
    "entry":[{"changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"123"},"messages":[{"from":"919999999999","id":"wamid.test","timestamp":"123","type":"text","text":{"body":"Hi"}}]}}]}]
  }'
# Check logs for "WhatsApp incoming" and, if configured, an outbound call to graph.facebook.com.
```

* Run tests: `pytest backend -k whatsapp -v`

## Cost Note

Meta WhatsApp Business pricing is conversation-based (24h window). Sandbox is free. See https://developers.facebook.com/docs/whatsapp/pricing

