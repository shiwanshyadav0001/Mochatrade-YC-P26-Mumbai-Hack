# NETRA Project Audit

> **Audit Date:** September 10, 2026  
> **Auditor:** Antigravity AI  
> **Phase:** Phase 0 — Comprehensive Forensic Read-Only Technical Audit  
> **Scope:** Repository `Mochatrade-YC-P26-Mumbai-Hack` (Backend, Frontend, Database, Configuration, Documentation)

---

## 1. Executive Summary

NETRA is designed as an institutional **Contextual Trader Trust Intelligence Engine** for trading venues (specifically targeted for Mochatrade, a Y Combinator-backed perpetual futures venue allowing Indian retail traders to trade US stocks/derivatives in INR). Its architectural thesis is to shift risk mitigation from rigid, isolated transaction alerts (`event → rule → alert`) to holistic lifecycle intelligence (`events → individual baseline → temporal sequence → entity graph → continuous trust [0–100] → proportional intervention → forensic audit`).

**Current Architecture & Status (Updated Day 2 — September 10, 2026):**
The project has evolved through Day 1 and Day 2 from an initial heuristic prototype into an operational **Temporal, Behavioral, and Cryptographic Trust Intelligence System**:
- **Organic Trust Progression:** The hardcoded flagship bypass (`94 -> 82 -> 61 -> 48 -> 31 -> 14`) has been completely removed. Scores and decisions emerge organically from structured `RiskSignal` generation, anti-double-counting aggregation, and cross-dimensional synergy.
- **Adaptive Behavioral Baselines:** Replaced static JSON dictionaries with `BaselineEngine` and `AdaptiveTraderProfile`. Tracks running numeric distributions (mean, standard deviation, sample count, min, max), calculates bounded z-scores ($z = (x - \mu)/\sigma$), circadian login hour norms, and enforces baseline poisoning protection (`is_trusted_for_learning`).
- **Temporal Sliding Windows & Sequences:** Built `TemporalWindowEngine` (rolling velocity across 5m, 15m, 1h, 24h, and 7d horizons + burst surge detection) and `SequenceEngine` (timestamp-aware kill chain matching with elapsed-time tracking).
- **Operational Action Enforcement:** Built `ActionEnforcementService` evaluating actions (`LOGIN`, `TRADE`, `LEVERAGED_TRADE`, `DEPOSIT`, `WITHDRAWAL`, credential changes) against policy thresholds, current trust, and active case restrictions, returning real `ALLOW`, `MONITOR`, `VERIFY`, `RESTRICT`, and `BLOCK` gateway states.
- **Tamper-Evident SHA-256 Audit Ledger:** All audit records are cryptographically chained (`previous_hash` + deterministic canonical JSON payload SHA-256 hashing). Built `verify_audit_chain()` and UI verification to detect tampering, deletion, or reordering.
- **Server-Side Authorization & CORS:** Implemented server-side RBAC dependencies (`require_role`) protecting sensitive administrative and analyst operations (policy mutations, simulation execution, case notes) from spoofing, paired with environment-driven CORS configuration.
- **Truthful Analytics:** Replaced hardcoded static precision/recall strings (`94.2%` / `91.5%`) with live empirical evaluation against ground-truth threat controls (TP, TN, FP, FN, precision, recall, FPR) and relabeled telemetry as `perf_counter` pipeline execution timing.

**Honest Limitations & Unimplemented Systems:**
- **No Neo4j or PostgreSQL in Runtime:** Despite `docker-compose.yml` declaring PostgreSQL 16 and Neo4j 5, the active backend connects strictly to SQLite with WAL mode (`sqlite:///./netra.db`). Schema changes are safely migrated in SQLite.
- **No Deep ML / LLM Models:** Risk scoring is based on statistical behavioral distributions (z-scores, historical sample quantiles) and deterministic contextual aggregation. No Scikit-learn Isolation Forest, neural networks, or LLMs are active in runtime.
- **Simulated Action Execution Gateway:** The action enforcement layer is an internal gateway (`ActionEnforcementService`). Real venue webhook/API dispatching to external exchange order books is integration-ready but not connected to live external infrastructure.

---

## 2. What This Project Currently Does

1. **Seeds 105 Synthetic Trader Profiles:** Generates 105 traders with initial trust scores (between 61 and 97; Trader #7842 seeded at 94.0) and 22 historical trades each.
2. **Ingests Events via REST (`POST /api/events`):** Validates 15 event types using Pydantic, extracts multi-factor features, updates in-memory and SQLite state, and broadcasts via Server-Sent Events (`GET /api/stream`).
3. **Calculates Continuous Contextual Trust Score (0–100):** Aggregates risk signals across 10 dimensions (`identity`, `behaviour`, `money`, `device`, `network`, `wallet`, `relationships`, `velocity`, `sequence`, `anomaly`) using sub-additive anti-double-counting and cross-dimensional compounding.
4. **Calculates Adaptive Baseline Statistics:** Evaluates live amounts and leverage against trader historical distributions using sample-guarded z-scores and circadian activity windows.
5. **Protects Baselines from Poisoning:** Blocks suspicious, unverified, or high-risk events from polluting the historical learning profile until verified by step-up challenges.
6. **Analyzes Multi-Horizon Velocity & Sequences:** Tracks rolling event frequencies across 5m, 15m, 1h, 24h, and 7d sliding windows and matches timestamp-ordered kill chains.
7. **Enforces Operational Action Decisions:** Evaluates simulated venue actions (`LOGIN`, `TRADE`, `LEVERAGED_TRADE`, `DEPOSIT`, `WITHDRAWAL`) returning `ALLOW`, `MONITOR`, `VERIFY`, `RESTRICT`, or `BLOCK`.
8. **Cryptographically Chains Audit Trail:** Generates SHA-256 hash chains across all audit transitions and provides on-demand verification (`GET /api/audit/verify`) to detect log tampering.
9. **Automatically Spawns Cases & Step-Up Triage:** Automatically creates cases upon restrictive decisions and auto-resolves them upon successful biometric/2FA verification (`POST /api/traders/{id}/step-up`), safely promoting verified devices into baseline.
10. **Simulates Executable Threat Scenarios:** Provides one-click execution of Flagship Takeover, Legitimate Cross-Border Travel, Fraud Ring Sweep, and Hostile Credential Takeover with live evidence and explanation.
11. **Renders High-Density Operations Console:** Dark-theme React 19 console with 10 operational views, audio telemetry, topology graph, pre-commit policy simulator, and command palette (`Ctrl+K`).
12. **Server-Side Authorization & CORS:** Enforces `ADMIN`, `RISK_ANALYST`, `INVESTIGATOR`, and `VIEWER` roles server-side on privileged REST endpoints.


## 3. Architecture

### As-Discovered Actual Architecture

```text
               INSTITUTIONAL REACT CONSOLE (Vite / TypeScript / Web Audio)
                                   │
               ┌───────────────────┴───────────────────┐
               ▼                                       ▼
     REST API Client (Fetch)              EventSource SSE (/api/stream)
     [X-Actor-Role Header]                             ▲
               │                                       │ (Async Broadcast)
               ▼                                       │
     FastAPI Service (backend/main.py) ────────────────┤
               │
               ▼
     NetraEngine (backend/engine.py)
       ├── Pydantic Event Validation
       ├── Individual Baseline Matching (Static Dict Lookup)
       ├── Rule Heuristics & Sequence Checker (List Slice)
       ├── Point Deduction Trust Math (prior - impact)
       ├── Decision Ladder (ALLOW | MONITOR | VERIFY | RESTRICT)
       ├── Case Generation & Graph Entity Linking
       └── In-Memory State Cache (dict / list)
               │
               ▼
     SQLAlchemy Session (backend/database.py)
               │
               ▼
     SQLite with WAL Mode (./netra.db)
     [traders, events, decisions, cases, audit_log, policies, graph_links]

─────────────────────────────────────────────────────────────────────────────
UNCONNECTED / DORMANT INFRASTRUCTURE (Present in docker-compose, Unused in Code):
  - PostgreSQL 16 (Port 5432) — Not connected; no psycopg2 driver
  - Neo4j 5 (Ports 7474, 7687) — Not connected; no neo4j driver
```

---

## 4. Repository Structure

```text
Mochatrade-YC-P26-Mumbai-Hack/
├── .env.example              # Example environment variables (NETRA_ENV, POSTGRES_*, NEO4J_*)
├── .gitignore                # Ignores node_modules, .venv, *.db, *.pyc
├── docker-compose.yml        # Docker config for backend, frontend, postgres, neo4j
├── Mochatrade.md             # Business briefing on Mochatrade YC P26 perpetuals platform
├── README.md                 # System overview, quickstart, scenario walkthrough
├── backend/
│   ├── Dockerfile            # Python 3.13-slim image, uvicorn entrypoint
│   ├── database.py           # SQLAlchemy SQLite engine setup (WAL mode)
│   ├── engine.py             # 1,149 lines: NetraEngine class, heuristics, seeding, state
│   ├── main.py               # 455 lines: FastAPI routes, SSE broadcaster, header RBAC
│   ├── models.py             # 206 lines: SQLAlchemy models (Trader, Event, Decision, Case, etc.)
│   ├── requirements.txt      # fastapi, uvicorn, pydantic, pytest, sqlalchemy
│   ├── test_api.py           # 98 lines: 6 API input validation & error tests
│   └── test_engine.py        # 73 lines: 6 engine tests (flagship, travel, ring, step-up, etc.)
└── frontend/
    ├── Dockerfile            # Multi-stage build (Node 24 Alpine -> Nginx 1.27 Alpine)
    ├── index.html            # SPA entry point with Google Fonts (IBM Plex Mono, Inter)
    ├── nginx.conf            # Nginx reverse proxy for /api/ to backend:8000
    ├── package.json          # react, react-dom, typescript, vite, lucide-react, canvas-confetti
    ├── package-lock.json     # Locked dependency graph
    ├── tsconfig.json         # TypeScript configuration
    ├── tsconfig.node.json    # Vite node environment config
    ├── vite.config.ts        # Vite config with /api proxy to http://127.0.0.1:8000
    └── src/
        ├── api.ts            # Typed fetch client injecting X-Actor-Role headers
        ├── App.tsx           # 1,844 lines: Complete 10-view operational console
        ├── audio.ts          # 100 lines: Zero-dependency Web Audio API synthesizer
        ├── main.tsx          # React DOM render entrypoint
        ├── styles.css        # 1,027 lines: High-density Bloomberg/Palantir dark theme
        ├── types.ts          # Shared TypeScript interfaces (Trader, Decision, Case, etc.)
        ├── vite-env.d.ts     # Vite client types
        └── components/
            ├── CommandPalette.tsx   # Ctrl+K modal for quick navigation & scenarios
            ├── EvidenceDrawer.tsx   # Slide-out forensic drawer with 3 tabbed views
            ├── InteractiveGraph.tsx # Custom SVG entity topology graph with pan/zoom
            └── PolicySandbox.tsx    # Weight & sensitivity calibration + simulation
```

---

## 5. Frontend Audit

The frontend is a single high-density React application (`App.tsx` + 4 modular components).

### Screen-by-Screen Forensic Table

| Screen / View | Code | Purpose | Backend Connected? | Real Data? | Functional? | Missing / Broken / Hardcoded Aspects |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **01 Overview** | `OVERVIEW` | Telemetry cockpit, sequence visualizer, trust trajectory chart, critical traders | Yes | Partially | 🟡 Partial | Top 6 sequence cards ("Known Device" to "New Withdrawal") have hardcoded labels and trust numbers in JSX (`App.tsx:583-603`). Trust line chart is custom SVG. |
| **02 Live Monitor** | `LIVE MONITOR` | Real-time streaming event table, active decision card, dimensional exposure | Yes | Yes | 🟢 Functional | Receives real SSE events. Filter by type, search IP/device, CSV export works. Persistent decision panel updates dynamically. |
| **03 Traders** | `TRADERS` | Searchable directory of 105 traders, baseline inspector, profile viewer | Yes | Yes | 🟢 Functional | Displays baseline JSON from DB, allows triggering step-up verification and initializing cases directly. |
| **04 Risk Events** | `RISK EVENTS` | Log of high/critical relevance events, forensic inspection trigger | Yes | Yes | 🟢 Functional | Table filter and search work. Clicking "INSPECT" opens the Evidence Drawer. |
| **05 Topology Graph** | `RELATIONSHIP GRAPH` | Visual representation of entities (traders, devices, IPs, wallets) | Yes | Partially | 🟠 Simulated | Backend returns real links from `graph_links` table, but node coordinates are hardcoded polar/trigonometric formulas in `InteractiveGraph.tsx:41-57` rather than a force-directed graph algorithm. |
| **06 Cases & Triage** | `CASES` | Case management queue, status transitions, investigation notes | Yes | Yes | 🟢 Functional | Full CRUD works: status changes, investigator notes, case creation, and JSON dossier export. |
| **07 Policy Matrix** | `POLICIES` | Sensitivity sliders, dimensional risk weights, pre-commit simulator | Yes | Yes | 🟢 Functional | Sliders update local state. "Run Simulation" tests candidate policy against 50 decisions. "Commit" calls `PUT /api/policies`. |
| **08 Scenario Lab** | `SIMULATOR` | One-click execution of 4 attack/behavioral scenarios | Yes | Yes | 🟢 Functional | Calls `POST /api/simulator/run`. Updates live state and broadcasts events across SSE. |
| **09 Audit Vault** | `AUDIT` | Historical log of events, decisions, policy updates, cases | Yes | Yes | 🟡 Partial | Displays real records from `AuditModel`, but labeled "Tamper-Evident Immutable Vault" despite having zero cryptographic proofs. |
| **10 Analytics** | `ANALYTICS` | Trust distribution, rule frequency, hardware latency | Yes | Partially | 🟠 Simulated | Trust distribution and rule counts are real. However, "Detection Precision" (`94.2%`) and "Recall Rate" (`91.5%`) are hardcoded directly in JSX (`App.tsx:1516-1520`). |

### Component Forensic Summary

1. **Evidence Drawer (`EvidenceDrawer.tsx`):** Fully functional slide-out drawer with 3 tabs (`Contextual Evidence`, `Raw Normalized Ingestion JSON`, `Lineage & Step-Up`). Copies formatted JSON to clipboard.
2. **Interactive Graph (`InteractiveGraph.tsx`):** Functional SVG canvas with dragging, pan, zoom, entity type filters, and node selection. Layout uses a static polar circle formula.
3. **Policy Sandbox (`PolicySandbox.tsx`):** Functional sliders for 10 risk weights and 10 action sensitivities. Replays historical decisions against candidate rules.
4. **Command Palette (`CommandPalette.tsx`):** Functional keyboard-driven (`Ctrl+K`) modal with fuzzy search across views, scenarios, and trader IDs.
5. **Audio Synthesizer (`audio.ts`):** High quality, zero-asset sound generator using the browser's native `AudioContext` (`playEventTick`, `playThreatAlert`, `playSuccess`). Persists mute setting in `localStorage`.

---

## 6. Backend Audit

### 6.1 Event Ingestion
- **Supported Event Types:** 15 types (`LOGIN`, `LOGOUT`, `NEW_DEVICE`, `DEVICE_CHANGE`, `IP_CHANGE`, `GEO_CHANGE`, `DEPOSIT`, `TRADE`, `LEVERAGE_CHANGE`, `WITHDRAWAL`, `NEW_WALLET`, `PASSWORD_CHANGE`, `2FA_CHANGE`, `KYC_CHANGE`, `API_KEY_CHANGE`).
- **Validation:** Enforced via Pydantic `EventInput` schema. Validates regex on `trader_id` (`^\d+$`), bounds on leverage (`0..500`), positive amount (`>= 0`), and uppercase event type.
- **Deduplication:** Not implemented. Re-submitting the same event creates a duplicate record with a fresh UUID.
- **Persistence:** Synchronously written to SQLite via SQLAlchemy. If DB write fails, engine rolls back in-memory changes (`test_event_persistence_failure_restores_memory` validates this).

### 6.2 Baseline Engine
- **Values Stored:** Static dictionary per trader:
  `deposit_amount`, `leverage` (default 3), `countries` (e.g. `["IN"]`), `cities` (e.g. `["Mumbai"]`), `known_devices`, `normal_login_hours`, `known_wallets`, `transaction_velocity_per_hour` (default 3).
- **Calculation:** Initial values are randomly assigned during seeding from a fixed list (`[1200, 1800, 2500, 3000, 4200]`).
- **Adaptability:** **Non-adaptive.** Baselines do NOT update over time or adjust to trader habits, with one exception: if an event is of type `LOGIN`, a new `device_id` is appended to `known_devices`.
- **Statistical Methods:** Zero standard deviation, z-score, percentile ranking, or outlier filters.

### 6.3 Context Engine
- **Time Windows:** Evaluates transactions occurring within a 1-hour window (`datetime.now(UTC) - timedelta(hours=1)`).
- **Velocity:** If `>= 12` events occur within the hour, adds 72.0 to velocity risk.
- **Sequence Matching:** Checks for linear sub-sequence match against `["NEW_DEVICE", "IP_CHANGE", "DEPOSIT", "LEVERAGE_CHANGE", "WITHDRAWAL"]`. If `>= 2` match, calculates completion percentage.
- **Limitation:** Only looks for this one exact hardcoded attack sequence. Other sequences (e.g., credential takeover, flash collusion) are defined in `/api/sequences` endpoint but **never evaluated in the engine**.

### 6.4 Relationship Engine
- **Entities:** `TRADER`, `DEVICE`, `IP`, `WALLET`.
- **Storage:** Relational table `graph_links` (columns: `id`, `source`, `target`, `link_type`, `evidence_json`).
- **Graph Traversal:** 2-hop breadth-first expansion implemented via Python set operations on in-memory link lists.
- **Neo4j Status:** **Unused.** No Neo4j connection, Cypher query, or driver exists.
- **Clustering:** Fraud ring `#7102–#7105` is pre-seeded with links to `DEV-RING-X`, `IP-RING-X`, and `WALLET-RING-X`. Dynamic link creation occurs during event ingestion if `device_id`, `ip_address`, or `wallet_address` is provided.

### 6.5 Trust Engine
- **Formula:** Deterministic subtraction:
  $$\text{new\_trust} = \text{clamp}(\text{prior} - \text{impact}, 0.0, 100.0)$$
- **Impact Calculation:**
  - In Flagship mode: Looks up fixed number from `EVENT_IMPACTS` dict (`NEW_DEVICE`: 12, `IP_CHANGE`: 21, `DEPOSIT`: 13, `LEVERAGE_CHANGE`: 17, `WITHDRAWAL`: 17).
  - In Standard mode: Multiplies base impact by a risk modifier:
    $$\text{risk\_mod} = 1.0 + \left(\frac{\text{weighted\_risk}}{50.0}\right) \times \left(\frac{\text{action\_sensitivity}}{50.0}\right)$$
  - Favorable action: If weighted risk $< 5.0$ and action is `TRADE` or `LOGIN`, trust recovers by $+1.5$.
- **Recovery:** Step-up verification adds a flat $+35.0$ points and dampens all dimensional risks by $70\%$.
- **Decay:** No temporal time-decay function (trust does not naturally decay or recover over time without explicit events).

### 6.6 Policy Engine
- **Configured Bands:**
  - Trust $\ge 90$: `ALLOW`
  - Trust $\ge 70$: `MONITOR`
  - Trust $\ge 45$: `VERIFY` (if sensitivity $\ge 70$) else `MONITOR`
  - Trust $\ge 20$: `RESTRICT` (if sensitivity $\ge 70$) else `VERIFY`
  - Trust $< 20$: `RESTRICT` (if sensitivity $\ge 90$) else `VERIFY`
- **Simulation:** Real and working. `POST /api/policy/simulate` re-evaluates the last 50 decisions with a candidate policy and returns divergence diffs.

### 6.7 Explanation Engine
- **Mechanism:** Assembles natural language templates combining evidence labels and sequence completion percentages:
  `"Trust moved from {prior} to {new_trust} after {event_type}. Multiple contextual deviations occurred in rapid succession."`
- **Output:** Returns summary, top factors list, SOP recommendation, and evidence array.
- **Reproducibility:** High, because the underlying rules are completely deterministic.

### 6.8 Case Engine
- **Trigger:** Automatically creates a case when decision is `RESTRICT` and no active case exists for that trader.
- **Management:** Full lifecycle support (`OPEN`, `INVESTIGATING`, `ESCALATED`, `RESOLVED`, `FALSE_POSITIVE`).
- **Notes:** Timestamped investigator notes appended to `notes_json`.

### 6.9 Audit Engine
- **Storage:** Persisted to `audit_log` table in SQLite.
- **Fields:** `audit_id`, `timestamp`, `actor`, `event`, `subject`, `reason`, `policy_version`, `details_json`.
- **Integrity:** **No cryptographic hashing.** No `previous_hash`, no SHA-256 chain, no digital signatures.

---

## 7. Database Forensic Audit

| Technology | Exists in Repo? | Configured? | Actually Used? | Purpose / Findings |
| :--- | :---: | :---: | :---: | :--- |
| **SQLite (WAL Mode)** | Yes | Yes | **YES (Primary)** | Configured as default in `backend/database.py` (`sqlite:///./netra.db`). All models persist here. |
| **PostgreSQL 16** | Yes (Docker) | Partial (Docker only) | **NO** | Defined in `docker-compose.yml`. Backend service does NOT pass `DATABASE_URL` to point to it, and `psycopg2` driver is not in `requirements.txt`. |
| **Neo4j 5** | Yes (Docker) | Partial (Docker only) | **NO** | Container spun up on ports 7474/7687, but zero lines of Python or TypeScript reference or connect to it. |

### Schema & Tables Forensic

All tables are defined in `backend/models.py`:
1. `traders`: PK `trader_id`. Columns: `name`, `segment`, `trust_score`, `initial_trust`, `status`, `baseline_json`, `risk_dimensions_json`, `last_decision`, `last_event_at`, `relationship_summary`, `event_count`.
2. `events`: PK `event_id`. Indexed: `timestamp`, `trader_id`, `event_type`, `device_id`, `ip_address`, `wallet_address`.
3. `decisions`: PK `decision_id`. Indexed: `timestamp`, `trader_id`. Stores explanation, rules, policy version, and latency.
4. `cases`: PK `case_id`. Indexed: `trader_id`. Stores severity, status, notes JSON, evidence JSON, resolution.
5. `audit_log`: PK `audit_id`. Indexed: `timestamp`, `subject`. Stores actor, event, reason, details JSON.
6. `policies`: PK `id`. Stores `version`, `config_json`.
7. `graph_links`: PK `id`. Indexed: `source`, `target`. Stores link `source`, `target`, `link_type`, `evidence_json`.

**Database Migration Framework:** None. No Alembic configuration exists. Database initialization relies purely on `Base.metadata.create_all(bind=engine)`.

---

## 8. API Audit

| Method | Endpoint | Purpose | Auth Required | Real Logic? | DB Backed? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| `GET` | `/api/health` | Service health & telemetry stats | None | Yes | Yes | 🟢 Functional |
| `POST` | `/api/events` | Ingest and score operational event | Role: `ADMIN`, `RISK_ANALYST` (Header spoofable) | Yes | Yes | 🟢 Functional |
| `GET` | `/api/traders` | List all managed traders | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/traders/{id}` | Get detailed trader profile & baseline | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/traders/{id}/risk` | Get trader risk dimensions | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/traders/{id}/timeline` | Get trust score history | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/traders/{id}/events` | Get trader event history | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/traders/{id}/graph` | Get entity topology subgraph | None | Yes | Yes | 🟢 Functional |
| `POST` | `/api/traders/{id}/step-up` | Execute 2FA biometric restoration | Role: `ADMIN`, `RISK_ANALYST`, `INVESTIGATOR` | Yes | Yes | 🟢 Functional |
| `GET` | `/api/risk-events` | List high/critical relevance events | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/decisions` | List all historical decisions | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/decisions/{id}` | Get specific decision dossier | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/cases` | List investigation cases | None | Yes | Yes | 🟢 Functional |
| `POST` | `/api/cases` | Create formal investigation case | Role: `ADMIN`, `RISK_ANALYST`, `INVESTIGATOR` | Yes | Yes | 🟢 Functional |
| `GET` | `/api/cases/{id}` | Get single case with audit & graph | None | Yes | Yes | 🟢 Functional |
| `PATCH`| `/api/cases/{id}` | Update case status, assignee, note | Role: `ADMIN`, `RISK_ANALYST`, `INVESTIGATOR` | Yes | Yes | 🟢 Functional |
| `GET` | `/api/cases/{id}/dossier` | Export comprehensive legal dossier | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/audit` | List immutable audit log entries | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/policies` | Get active policy parameters | None | Yes | Yes | 🟢 Functional |
| `PUT` | `/api/policies` | Update policy weights & bands | Role: `ADMIN` (Header spoofable) | Yes | Yes | 🟢 Functional |
| `POST` | `/api/policy/simulate` | Test candidate policy against history | Role: `ADMIN`, `RISK_ANALYST` | Yes | Yes | 🟢 Functional |
| `GET` | `/api/search` | Search traders, events, cases | None | Yes | Yes | 🟢 Functional |
| `GET` | `/api/sequences` | List defined attack sequences | None | Static list | No | 🟠 Simulated |
| `POST` | `/api/simulator/step` | Ingest single scenario step | Role: `ADMIN`, `RISK_ANALYST` | Yes | Yes | 🟢 Functional |
| `POST` | `/api/simulator/run` | Launch async multi-event scenario | Role: `ADMIN`, `RISK_ANALYST` | Yes | Yes | 🟢 Functional |
| `POST` | `/api/simulator/reset` | Wipe DB and re-seed 105 traders | Role: `ADMIN` | Yes | Yes | 🟢 Functional |
| `GET` | `/api/analytics` | Summary metrics & latency profiling | None | Partially hardcoded | Yes | 🟡 Partial |
| `GET` | `/api/stream` | Server-Sent Events real-time stream | None | Yes | In-memory Queue | 🟢 Functional |

---

## 9. Authentication & RBAC Audit

### Implementation Analysis
Authentication is **completely simulated**. In `backend/main.py:21-40`:
```python
def get_current_actor(
    x_actor_id: str | None = Header(default="analyst-01"),
    x_actor_role: str | None = Header(default="RISK_ANALYST"),
) -> dict[str, str]:
    role = (x_actor_role or "RISK_ANALYST").upper()
    if role not in ROLES:
        role = "RISK_ANALYST"
    return {"actor_id": x_actor_id or "analyst-01", "role": role}
```

### Security Implications
- **No Credentials:** There are no passwords, no password hashes (bcrypt/argon2), no API keys, and no JWT/OAuth tokens.
- **Client-Controlled Roles:** The client UI literally provides a dropdown (`ADMIN`, `RISK_ANALYST`, `INVESTIGATOR`, `VIEWER`) in the top navigation bar. Changing the dropdown changes the HTTP header sent with subsequent requests.
- **Spoofing:** Any client, curl script, or malicious user can pass `X-Actor-Role: ADMIN` and `X-Actor-Id: root` to gain full access to modify policies (`PUT /api/policies`), reset the entire database (`POST /api/simulator/reset`), or alter case dispositions.

---

## 10. AI / ML Forensic Audit

A comprehensive search of the repository for machine learning libraries and keywords was conducted:
- `sklearn` / `scikit-learn`: **0 matches**
- `tensorflow`: **0 matches**
- `torch` / `pytorch`: **0 matches**
- `xgboost` / `lightgbm`: **0 matches**
- `numpy`: **0 matches**
- `scipy`: **0 matches**
- Model files (`.pkl`, `.onnx`, `.pt`, `.h5`, `.joblib`): **0 files**
- Vector embeddings: **0 matches**
- LLM API calls (`openai`, `anthropic`, `google-generativeai`, `groq`): **0 matches**

### Classification by Subsystem

| Intelligence Component | Advertised Category | Actual Reality | Classification |
| :--- | :--- | :--- | :--- |
| **Trust Score Calculation** | "Bayesian continuous trust decay" | Deterministic point deduction with clamp | **Heuristic Rule Engine** |
| **Baseline Anomaly** | "Statistical deviation & outlier model" | Direct ratio comparison ($amount / baseline$) | **Static Threshold Rule** |
| **Sequence Analysis** | "Markov / sequence anomaly detection" | String matching against 1 linear list | **Heuristic Rule** |
| **Clustering** | "Graph cluster & community discovery" | Hardcoded entity links for traders #7102–#7105 | **Hardcoded Rule Heuristic** |
| **Decision Formulation** | "Contextual decision intelligence" | Nested if/else thresholds on trust & sensitivity | **Deterministic Rule Matrix** |
| **Performance Claims** | "94.2% precision, 91.5% recall" | Hardcoded string literals in JSX and Python dict | **Simulated Marketing Metric** |

---

## 11. Demo Scenario Audit

### 11.1 Flagship Attack Scenario (`Trader #7842`)

The flagship demonstration injects 6 sequential events against Trader #7842 (Maya Chen, baseline deposit $3,000, leverage 3×):

| Step | Injected Event Type | Telemetry Context | Trust Transition | Deducted Points | Decision Outcome | Triggered Heuristics |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | `LOGIN` | Known MacBook (`DEV-7842-PRIMARY`), Mumbai residential IP | $94.0 \rightarrow 94.0$ | $0$ | `ALLOW` | None (Within baseline) |
| 2 | `NEW_DEVICE` | Unseen Mobile (`DEV-7842-NEW`), Mumbai IP | $94.0 \rightarrow 82.0$ | $-12$ | `MONITOR` | `DEVICE_NOT_IN_BASELINE` |
| 3 | `IP_CHANGE` | Datacenter IP (`198.18.0.14`), Hosting ASN | $82.0 \rightarrow 61.0$ | $-21$ | `MONITOR` | `DATACENTER_NETWORK` |
| 4 | `DEPOSIT` | \$25,000 USDT (8.3× baseline of \$3,000) | $61.0 \rightarrow 48.0$ | $-13$ | `VERIFY` | `AMOUNT_OUTSIDE_INDIVIDUAL_BASELINE` |
| 5 | `LEVERAGE_CHANGE` | 50× Leverage on BTC Perp (16.7× baseline) | $48.0 \rightarrow 31.0$ | $-17$ | `VERIFY` | `LEVERAGE_OUTSIDE_BASELINE` |
| 6 | `WITHDRAWAL` | \$24,000 to fresh crypto wallet (`WALLET-7842-FRESH`) | $31.0 \rightarrow 14.0$ | $-17$ | `RESTRICT` | `FRESH_WITHDRAWAL_WALLET`, `RAPID_SUSPICIOUS_WITHDRAWAL_SEQUENCE` |

**Forensic Finding on Flagship Progression:**
The numbers `94 → 82 → 61 → 48 → 31 → 14` are governed by `backend/engine.py:551-554`:
```python
if event.metadata.get("flagship"):
    impact = EVENT_IMPACTS[event_type]
    if event_type == "LOGIN":
        impact = 0.0
```
where `EVENT_IMPACTS = {"NEW_DEVICE": 12, "IP_CHANGE": 21, "DEPOSIT": 13, "LEVERAGE_CHANGE": 17, "WITHDRAWAL": 17}`.
These impacts were hardcoded specifically so that the test `assert trust == [94.0, 82.0, 61.0, 48.0, 31.0, 14.0]` passes and the demo matches the README narrative precisely.

### 11.2 Legitimate Travel Scenario (`Trader #7842`)
- **Progression:** `LOGIN` in Singapore (`DEV-7842-TRAVEL`) $\rightarrow$ Normal deposit (\$2,800) $\rightarrow$ Normal trade (\$1,200, 3× leverage).
- **Outcome:** Trust remains $\ge 70.0$, decision is `MONITOR` or `VERIFY`, account is **not restricted**. Demonstrates contextual tolerance for isolated location deviations.

### 11.3 Collusive Fraud Ring Scenario (`Traders #7102–#7105`)
- **Progression:** Simultaneous withdrawal attempts from 4 distinct accounts sharing hardware fingerprint `DEV-RING-X`, IP `IP-RING-X`, and destination wallet `WALLET-RING-X`.
- **Outcome:** Triggers rule `SHARED_INFRASTRUCTURE_CLUSTER`. Displays cluster node in topology graph.

---

## 12. Analytics Audit

| Metric Displayed | Location | Value Displayed | Real Calculation? | True Underlying Source |
| :--- | :--- | :---: | :---: | :--- |
| **Detection Precision** | Analytics View (`App.tsx:1516`) | `94.2%` | **NO** | Hardcoded string in JSX (`<b>94.2%</b>`). |
| **Recall Rate** | Analytics View (`App.tsx:1520`) | `91.5%` | **NO** | Hardcoded string in JSX (`<b>91.5%</b>`). |
| **False Positive Rate** | Analytics API (`engine.py:1141`) | `0.05` | **NO** | Hardcoded float in `demo_metrics` dictionary. |
| **Detection Rate** | Analytics API (`engine.py:1142`) | `0.93` | **NO** | Hardcoded float in `demo_metrics` dictionary. |
| **Average Trust** | Overview Topbar & Analytics | Dynamic ($\sim 80.4$) | **YES** | Calculated via `statistics.mean()` over all 105 trader trust scores. |
| **Latency (p50, p95, Mean)** | Topbar & Analytics View | Dynamic ($2.5 - 9.8$ ms) | **YES** | Profiled per decision using `time.perf_counter_ns()`. |
| **Trust Distribution** | Analytics View | Dynamic histogram | **YES** | Bucket counts calculated across active trader scores. |
| **Top Triggered Rules** | Analytics View | Dynamic list | **YES** | `collections.Counter` over rules triggered in historical decisions. |

---

## 13. Testing Audit

The test suite was executed via `pytest`:
- **Command:** `python -m pytest test_engine.py test_api.py -v`
- **Results:** **12 passed in 2.06s** (0 failed, 0 skipped, 0 warnings).

### Test Breakdown

1. `test_engine.py::test_flagship_is_contextual_and_proportional`: Verifies exact trust sequence `[94.0, 82.0, 61.0, 48.0, 31.0, 14.0]` and final `RESTRICT` decision.
2. `test_engine.py::test_travel_is_not_blocked_for_an_isolated_geo_change`: Verifies travel does not cause `RESTRICT` and trust remains $\ge 70.0$.
3. `test_engine.py::test_shared_ring_produces_relationship_evidence`: Verifies fraud ring triggers `SHARED_INFRASTRUCTURE_CLUSTER` rule and relationship evidence.
4. `test_engine.py::test_step_up_verification_restores_trust`: Verifies step-up verification adds $+35$ points (recovering score from 14.0 to 49.0).
5. `test_engine.py::test_policy_simulation_detects_impact`: Verifies pre-commit policy simulation calculates divergence counts.
6. `test_engine.py::test_universal_search`: Verifies universal search finds trader by ID.
7. `test_api.py::test_event_input_rejects_missing_trader_id`: Verifies Pydantic rejection when `trader_id` is omitted.
8. `test_api.py::test_event_input_rejects_malformed_trader_id`: Verifies regex rejection on non-numeric trader IDs.
9. `test_api.py::test_post_event_returns_404_for_unknown_trader`: Verifies 404 when unknown trader ID is submitted.
10. `test_api.py::test_post_event_accepts_existing_trader`: Verifies event ingestion returns 200 for valid trader.
11. `test_api.py::test_event_persistence_failure_restores_memory`: Verifies transactional rollback of in-memory state if database write fails.
12. `test_api.py::test_post_event_returns_500_for_database_failure`: Verifies API returns 500 when database session raises an error.

**Assessment:** The existing tests are well-written for verifying the **current implementation's contracts**, but they reinforce the simulated numbers (e.g. testing for exact hardcoded values `94, 82, 61, 48, 31, 14`). There are no frontend component tests or end-to-end browser tests.

---

## 14. Security Findings

1. **Client-Controlled Authorization (High Risk):** The system trusts the `X-Actor-Role` header from any incoming request without authentication tokens or signature verification. An attacker or client can elevate themselves to `ADMIN` at will.
2. **Permissive CORS (Medium Risk):** FastAPI CORS middleware is configured with `allow_origins=["*"]`, allowing cross-origin requests from any site.
3. **Unauthenticated Streaming Endpoint (Medium Risk):** `GET /api/stream` accepts connections from any client without role validation, broadcasting real-time operational risk decisions and trader activities.
4. **No Rate Limiting (Medium Risk):** Neither the FastAPI backend nor Nginx implements rate limiting on `/api/events`, leaving the ingestion pipeline vulnerable to event flooding.
5. **No Hash-Chaining or Audit Immutability (Medium Risk):** Despite marketing claims of an "Immutable Audit Vault", audit records are standard rows in a local SQLite file without cryptographic hashes or signatures, meaning records can be modified or deleted directly in the database without detection.
6. **Insecure Docker Defaults (Low Risk):** Hardcoded passwords (`netra_demo_only`) in `docker-compose.yml`.

---

## 15. Performance Findings

1. **Synchronous In-Memory Duplication:** The backend keeps an entire duplicate copy of the database in memory (`self.traders`, `self.events`, `self.decisions`, etc.). As event volume grows into hundreds of thousands, memory usage will balloon and restart load times will degrade.
2. **Linear Scans on Event Slices:** Endpoints like `trader_events` perform in-memory list comprehensions over `self.events` rather than indexed SQL queries.
3. **SSE Queue Discard on Backpressure:** When client queues fill up (`QueueFull`), the subscriber queue is dropped from the active set.
4. **Trigonometric SVG Rendering:** While lightweight for 20 nodes, calculating trigonometry on every render pass in `InteractiveGraph.tsx` will degrade at $\ge 100$ nodes.

---

## 16. Implemented Features (🟢 FULLY FUNCTIONAL)

- Pydantic-validated REST event ingestion (`POST /api/events`).
- Transactional database persistence to SQLite with automatic rollback on error.
- Server-Sent Events (SSE) real-time streaming pipeline (`/api/stream`).
- Proportional graduated decision ladder (`ALLOW`, `MONITOR`, `VERIFY`, `RESTRICT`).
- Automated case generation upon `RESTRICT` decision.
- Full Case Management lifecycle (`OPEN`, `INVESTIGATING`, `ESCALATED`, `RESOLVED`, `FALSE_POSITIVE`) with investigator notes.
- Step-Up 2FA/Biometric verification endpoint that restores trust score and auto-resolves open cases.
- Pre-Commit Policy Simulator evaluating candidate parameters against historical decisions.
- Universal search across traders, events, and cases (`/api/search`).
- Web Audio API real-time acoustic telemetry without external sound files.
- Command Palette (`Ctrl+K`) for rapid navigation and scenario execution.
- CSV and JSON dossier export utilities for cases, events, and audit records.

---

## 17. Partial Features (🟡 PARTIALLY FUNCTIONAL)

- **Audit System:** Logs all operations and exports CSV, but lacks cryptographic hashing, Merkle proofs, or tamper-evident guarantees.
- **Context Engine:** Evaluates 1-hour velocity and sequence matching, but only matches against one single hardcoded sequence.
- **Topology Link Graph:** Traverses multi-hop entity relationships and displays links in UI, but uses a static polar circle layout instead of a force-directed graph algorithm.
- **Overview Dashboard:** Live updates and interactive controls, but sequence cards display hardcoded step titles and scores.

---

## 18. Simulated Features (🟠 SIMULATED / DEMO LOGIC)

- **Flagship Score Progression:** The `94 → 82 → 61 → 48 → 31 → 14` trust degradation is governed by hardcoded point subtractions triggered by `metadata.flagship = True`.
- **AI / ML Telemetry:** Precision (`94.2%`), recall (`91.5%`), and Bayesian decay are hardcoded labels and static values.
- **Role-Based Access Control (RBAC):** Role enforcement is simulated via spoofable HTTP headers selected by a UI dropdown.
- **Trader Baselines:** Baselines are pre-generated static dictionaries that do not learn or adapt to ongoing trading behavior.
- **PostgreSQL & Neo4j Support:** Present in `docker-compose.yml` and `README.md`, but completely uncoupled and unused by the application.

---

## 19. Missing Features (🔴 NOT IMPLEMENTED)

- **Real Machine Learning / Anomaly Detection:** No statistical models (isolation forest, clustering, autoencoders, or z-score estimators) for continuous anomaly scoring.
- **Adaptive Dynamic Baselines:** No background worker or mathematical algorithm updating rolling 30-day trader baselines from event streams.
- **Real Graph Database Integration:** No connection to Neo4j or persistent graph query layer (e.g. Cypher queries for multi-hop fraud ring discovery).
- **Genuine Authentication Layer:** No user accounts, passwords, JWT tokens, session cookies, or OAuth2 integration.
- **Cryptographic Audit Ledger:** No SHA-256 block hashing, hash chain (`prev_hash`), or digital signatures for decision verification.
- **Automated Action Enforcement:** No webhook or outbound API integration back into the trading venue engine to actually halt a withdrawal or enforce leverage caps.
- **Database Migrations:** No Alembic setup for schema evolutions.

---

## 20. Broken Features (⚠️ BROKEN / FAILING)

- **Sequence Pattern Customization:** `/api/sequences` returns three configured sequences (`SEQ-RAPID-WITHDRAWAL`, `SEQ-CREDENTIAL-TAKEOVER`, `SEQ-FLASH-COLLUSION`), but the engine only ever evaluates `SEQ-RAPID-WITHDRAWAL`. The other sequences never fire.
- **Docker Compose Production Backend Connection:** Running `docker compose up` starts Postgres and Neo4j, but the backend container defaults to local SQLite because no `DATABASE_URL` environment variable is passed, and required DB drivers are missing from `requirements.txt`.

---

## 21. Gap Analysis

| Intended Capability | Current Implementation | Status | Gap | Priority |
| :--- | :--- | :---: | :--- | :---: |
| **Individual Baseline** | Static JSON dictionary seeded on init; non-adaptive | 🟠 Simulated | Needs dynamic rolling computation (mean, variance, percentiles) from historical events | **P1** |
| **Temporal Context** | 1-hour window event count + 1 sequence check | 🟡 Partial | Needs generalized multi-sequence matcher and velocity windows (1h, 24h, 7d) | **P1** |
| **Relationship Graph** | In-memory 2-hop BFS on SQLite `graph_links` | 🟡 Partial | Needs force-directed graph UI and real graph clustering algorithms | **P2** |
| **Dynamic Trust** | Point deduction ($prior - impact$) clamped 0–100 | 🟡 Partial | Needs mathematical decay over time and adaptive risk scoring | **P1** |
| **Action Sensitivity** | Dictionary lookup with sensitivity weights | 🟢 Functional | Expand to cover full derivatives lifecycle (margin calls, order cancels) | **P2** |
| **Policy Engine** | Sensitivity $\times$ Risk matrix with simulation | 🟢 Functional | Needs multi-policy version archiving and conditional policy branching | **P2** |
| **Forensic Explainability** | Formats triggered rules and evidence labels into text | 🟢 Functional | Connect directly to statistical feature importance | **P1** |
| **Audit Immutability** | Plain SQLite `audit_log` table | 🟡 Partial | Needs cryptographic SHA-256 hash chaining (`prev_hash`) | **P2** |
| **Action Enforcement** | Decision outputted to SSE and REST response | 🟡 Partial | Needs outbound webhooks to trade venue to enforce withdrawal holds | **P1** |
| **Machine Learning / AI** | None (Rule engine with hardcoded precision claims) | 🔴 Missing | Implement unsupervised anomaly detection or isolation forest | **P3** |
| **Authentication / RBAC** | Spoofable client HTTP header `X-Actor-Role` | 🟠 Simulated | Implement real JWT authentication with secure cookies/tokens | **P2** |

---

## 22. Recommended Roadmap

### Phase 1: Engine Integrity & Genuine Dynamic Scoring (P0 & P1)
1. Replace hardcoded flagship score deductions with generalized, mathematically grounded risk algorithms.
2. Implement dynamic, rolling individual baselines (adaptive mean, standard deviation, and quantile bounds).
3. Activate multi-sequence evaluation (ATO sequences, flash collusion, rapid withdrawal).
4. Connect real outbound enforcement webhooks/callbacks.

### Phase 2: Cryptographic Audit & Graph Refinement (P2)
1. Implement SHA-256 hash chaining on the audit log to make it genuinely tamper-evident.
2. Upgrade the topology graph UI from static polar coordinates to a real force-directed layout (e.g., using lightweight force simulation).
3. Introduce real JWT-based authentication for analyst and admin roles.

### Phase 3: Applied Statistical Machine Learning (P3)
1. Add an unsupervised anomaly detection module (e.g. Scikit-learn Isolation Forest or Local Outlier Factor) to evaluate high-dimensional feature deviations.
2. Replace hardcoded demo precision/recall metrics with an automated benchmark evaluation script running against historical test data.

### Phase 4: Production Hardening & Polish (P4)
1. Configure real PostgreSQL connectivity via asyncpg/SQLAlchemy.
2. Clean up hardcoded JSX strings in the Overview and Analytics screens.
3. Add full unit and integration test coverage for adaptive baselines and sequence detection.

---

## 23. Work Prioritization (P0–P4)

### P0 — MUST FIX (Integrity & Reality)
- Remove hardcoded `flagship` shortcut in `engine.py` that forces exact scores `94, 82, 61, 48, 31, 14`.
- Ensure all scenarios calculate trust organically through consistent mathematical logic.
- Fix broken sequence evaluator so that all sequence definitions in `/api/sequences` are evaluated.
- Fix docker-compose / database configuration mismatch.

### P1 — HIGH VALUE (Core NETRA Intelligence)
- Implement adaptive individual baselines that update from event streams.
- Implement time-based trust decay and gradual natural recovery.
- Provide real outbound enforcement action dispatching (simulating venue withdrawal lock / step-up challenge).

### P2 — IMPORTANT (Security & Operations)
- Add SHA-256 hash-chaining to audit entries (`prev_hash` + payload hash).
- Implement real JWT/token authentication instead of arbitrary `X-Actor-Role` headers.
- Implement a true force-directed graph layout algorithm in `InteractiveGraph.tsx`.

### P3 — ADVANCED (AI / ML)
- Integrate lightweight statistical anomaly models (e.g. z-score matrix, Scikit-learn Isolation Forest).
- Generate empirically measured precision/recall metrics from evaluated datasets.

### P4 — POLISH (UI & Cleanup)
- Replace hardcoded cards in Overview view with dynamic data from the active scenario.
- Connect PostgreSQL driver in backend Docker container.
- Clean up unused Neo4j declarations in `docker-compose.yml` if not utilized.

---

## 24. Exact Next Steps

Wait for explicit approval and instruction before beginning Phase 1. When authorized:
1. Review Phase 1 scope with the user.
5. Update the frontend Overview and Analytics screens to reflect real dynamically computed telemetry.

---

## 25. Day 3 Architecture Addendum: Real Graph Intelligence & Behavioral Anomaly Detection

### 25.1 Real Graph Intelligence (`backend/graph_intelligence.py`)
- **Multi-Hop Traversal:** Breadth-first graph traversal engine supporting configurable depth (1, 2, 3 hops) with strict visited-set cycle protection.
- **Configurable Relationship Strength:**
  - Destination Crypto Wallet (`WITHDREW_TO`): `0.95` (highest coupling).
  - Hardware Device (`USED_DEVICE`): `0.80` (strong coupling).
  - IP Address (`LOGGED_FROM`): `0.45` (moderate coupling).
- **Shortest Path Discovery:** Breadth-first shortest path computation between arbitrary network entities with path depth, nodes, edges, and aggregate path strength.
- **Algorithmic Connected Components & Suspicious Clusters:** Connected components identified across network topology. Clusters classified as suspicious only when corroborated by shared high-strength infrastructure (devices, wallets) or low trust standings (< 60.0), avoiding naive over-penalization of benign shared IP infrastructure.
- **Structured Graph Risk Signals:** Generates `SHARED_INFRASTRUCTURE_CLUSTER`, `SHARED_WALLET_CLUSTER`, `SHARED_DEVICE_CLUSTER`, `SHARED_IP_CLUSTER`, `MULTI_HOP_SUSPICIOUS_CONNECTION`, and `COORDINATED_ACTIVITY`.

### 25.2 Real Behavioral Anomaly Detection (`backend/anomaly_model.py`)
- **Algorithm:** Unsupervised `IsolationForest` (`n_estimators=100`, `contamination=0.05`, `random_state=42`) from `scikit-learn`.
- **Deterministic 12-Dimensional Feature Vector:**
  1. `deposit_zscore`: Z-score deviation of deposit amount against baseline.
  2. `withdrawal_zscore`: Z-score deviation of withdrawal amount against baseline.
  3. `leverage_zscore`: Z-score deviation of leverage against baseline.
  4. `trade_size_zscore`: Z-score deviation of trade size against baseline.
  5. `velocity_1h_ratio`: 1h event velocity relative to baseline per hour.
  6. `sensitive_actions_1h`: Sensitive action count in 1h window.
  7. `burst_ratio`: Temporal acceleration ratio from sliding window.
  8. `device_novelty`: 1.0 if unseen device, 0.0 if known.
  9. `network_novelty`: 1.0 if datacenter/vpn/unseen IP, 0.0 if known.
  10. `wallet_novelty`: 1.0 if destination wallet is new, 0.0 if known.
  11. `circadian_anomaly`: 1.0 if action outside normal login hours, 0.0 if normal.
  12. `graph_degree`: Connected infrastructure links for the trader.
- **Training Data Safety:** Only events with verified trust standing (`trust_score >= 70.0`, `ALLOW`/`MONITOR` decisions, non-attack data) enter the training population. Contaminated and blocked events are strictly excluded.
- **Normalized Anomaly Score (0–100):** Continuous mapping of Isolation Forest `decision_function(X)` via linear boundary projection (`clamp((0.14 - decision_function) / 0.32 * 100, 0, 100)`).
- **Feature-Level Explainability:** Pinpoints individual metric deviations ($z > 1.2\sigma$) for human-auditable reasoning.
- **Failure-Safe Operation:** Returns explicit `INSUFFICIENT_DATA` or `FAILED` state without fabricating ML scores or crashing event ingestion.

### 25.3 Trust Engine Integration & Anti-Double-Counting
- Excised all hardcoded fraud ring checks.
- Graph and ML signals feed into dimensional risk categories (`relationships`, `behaviour`).
- Peak severity combination with category weights and sublinear compounding prevents multiple compounding penalties for the same underlying factor.
- ML strictly informs trust assessment and is prohibited from independently enforcing direct `BLOCK` actions.
