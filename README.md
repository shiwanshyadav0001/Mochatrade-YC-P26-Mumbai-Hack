# NETRA — Continuous Trader Trust Intelligence Engine

NETRA is an institutional trust and risk intelligence engine designed for trading venues and exchanges. It answers one critical operational question: **"Does this action make sense for this trader, right now?"**

Traditional risk management evaluates transactions in isolation (`event → rule → alert`). NETRA evaluates the holistic lifecycle:
`events → individual baseline → temporal sequence → entity graph → behavioral anomaly (ML) → continuous trust (0–100) → proportional intervention → cryptographic audit trail`.

---

## Architecture & Pipeline

```text
Incoming Event Stream
   │
   ├── 1. Validation & Normalization (Pydantic / FastAPI)
   ├── 2. Individual Baseline Deviation (Velocity, Leverage, Volatility, Circadian - BaselineEngine)
   ├── 3. Graph Entity Links & Cluster Discovery (Shared IP, Device, Wallet - GraphIntelligenceEngine)
   ├── 4. Sequence Anomaly Analysis (Attack Vector / Account Takeover Kill Chains - SequenceEngine)
   ├── 5. Behavioral Anomaly Detection (Unsupervised Scikit-Learn Isolation Forest - BehavioralAnomalyService)
   ├── 6. Continuous Trust State Transition (0–100 Bayesian Decay & Recovery - NetraEngine)
   ├── 7. Action-Proportional Decision Matrix (ALLOW | MONITOR | VERIFY | RESTRICT | BLOCK - ActionEnforcementService)
   └── 8. Forensic Audit & Evidence Dossier (Tamper-Evident SHA-256 Hash Chain + Case Lifecycle - audit_chain)
   │
   ▼
Real-time SSE Stream (`/api/stream`) → Institutional React/TypeScript Operations Console
```

---

## Key Capabilities

- **Contextual Ingestion**: High-throughput REST ingestion (`POST /api/events`, `GET /api/events`) with Pydantic schema validation and real-time Server-Sent Events (`GET /api/stream`).
- **Dynamic Individual Baselines**: Evaluates activity against each trader's 30-day adaptive baseline rather than rigid universal thresholds (`BaselineEngine` with z-scores and baseline poisoning protection).
- **Multi-Hop Topology Graph**: Uncovers collusive fraud rings and multi-account clusters linked via shared devices, IP subnets, or deposit/withdrawal wallet addresses (`GraphIntelligenceEngine` with cycle-protected BFS and shortest paths).
- **Behavioral Anomaly Engine**: Unsupervised machine learning (`BehavioralAnomalyService` with Scikit-learn Isolation Forest, 12D feature vectors, and training contamination guards).
- **Proportional Interventions**: Enforces graduated risk mitigation (`ALLOW`, `MONITOR`, `VERIFY` via step-up 2FA/biometric challenge, `RESTRICT` on sensitive withdrawal channels, or authoritative `BLOCK` via `ActionEnforcementService`).
- **Forensic Explainability**: Every score transition and decision outputs a structured evidence breakdown, triggered heuristics, and tamper-evident SHA-256 chained audit records (`audit_chain`).
- **Live Policy Matrix**: Real-time sensitivity calibration and signal weight adjustments with pre-commit policy simulation (`POST /api/policy/simulate`).

---

## Current Implementation & Verification Status

> **Status Terminology:**
> - `[✓]` Implemented and verified by automated test suites
> - `[~]` Partially implemented / external integration-ready
> - `[SIM]` Simulation / demo logic active by design
> - `[ ]` Planned / missing in current milestone
> - `[!]` Broken / failing contract

| Capability Area | Status | Operational Detail |
| :--- | :---: | :--- |
| **Real-Time Event Ingestion & Normalization** | `[✓]` | Pydantic v2 schemas, 15 validated event types, sub-millisecond dispatch |
| **Adaptive Rolling Baselines & Poisoning Guard** | `[✓]` | Individualized $\mu \pm 3\sigma$ bounds, zero-poisoning learning filter |
| **Temporal Sliding Windows & Kill Chains** | `[✓]` | 5m/15m/1h/24h/7d rolling velocity counters and multi-step sequence detection |
| **Multi-Hop Topology Graph Intelligence** | `[✓]` | Multi-hop BFS traversal, shared hardware/IP/wallet cluster detection |
| **Unsupervised ML Behavioral Anomaly Engine** | `[✓]` | Scikit-Learn Isolation Forest with 12D feature vectors and score normalization |
| **Continuous Trust State Trajectory (0–100)** | `[✓]` | Organic evidence-based trust scoring without synthetic bypasses |
| **Graduated Action Enforcement Gateway** | `[✓]` | Proportional gating (`ALLOW` → `MONITOR` → `VERIFY` → `RESTRICT` → `BLOCK`) |
| **Tamper-Evident SHA-256 Audit Vault** | `[✓]` | Cryptographic hash chaining with live pre-image verification |
| **Forensic Case Workbench & Triage** | `[✓]` | Automated case escalation, chronological notes log, dossier exports |
| **Cross-Screen Deterministic Scenario Lab** | `[✓]` | 8 interactive scenarios (`ATTACK_SURGE`, `FLAGSHIP`, etc.) with fleet auto-focus |
| **Multi-Role RBAC Authentication** | `[✓]` | JWT HMAC-SHA256 bearer tokens, PBKDF2 hashing, 4-role permission enforcement |
| **Action Enforcement Webhooks** | `[~]` | Local gateway layer operational; outbound HTTP webhooks integration-ready |
| **Topology Graph Layout Physics** | `[SIM]` | Polar-trigonometric deterministic layout active; dynamic D3 force simulation planned |
| **Scale-Out Graph & Relational Backends** | `[ ]` | SQLite WAL mode active in production runtime; Neo4j/Postgres blueprints container-ready |

---

## Project Structure

```text
├── backend/
│   ├── main.py                # FastAPI REST endpoints, SSE feed, and actor auth
│   ├── engine.py              # Core trust scoring, risk signal aggregation, and baseline logic
│   ├── auth.py                # JWT HMAC-SHA256 authentication and PBKDF2 credential hashing
│   ├── baseline.py            # Adaptive behavioral baselines, z-scores, and poisoning protection
│   ├── temporal.py            # Temporal sliding windows, velocity surges, and sequence kill chains
│   ├── enforcement.py         # Operational action enforcement gateway (ALLOW..BLOCK)
│   ├── graph_intelligence.py  # Multi-hop BFS graph traversal, shortest paths, and cluster detection
│   ├── anomaly_model.py       # Unsupervised Scikit-Learn Isolation Forest anomaly service
│   ├── audit_chain.py         # Tamper-evident SHA-256 cryptographic audit chaining & verification
│   ├── models.py              # SQLAlchemy database schema and Pydantic entity models
│   ├── database.py            # SQLite connection pooling with WAL mode and auto-migration
│   ├── test_engine.py         # Test suite: trust decay, baselines, temporal windows, and analytics
│   ├── test_api.py            # Test suite: REST API contracts, RBAC, scenarios, and graph endpoints
│   ├── test_auth.py           # Test suite: JWT tokens, password hashing, and 4-role RBAC permissions
│   ├── test_single_event_propagation.py # Integration test: 9-stage causal loop and scenario generation
│   └── requirements.txt       # Python dependencies (FastAPI, SQLAlchemy, Scikit-learn, etc.)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Operations console, live telemetry, and views
│   │   ├── api.ts             # Strongly-typed API client with JWT bearer support
│   │   ├── types.ts           # Unified TypeScript interfaces and risk event contracts
│   │   ├── styles.css         # Institutional high-density dark theme design system
│   │   ├── audio.ts           # Auditory feedback synthesizer for telemetry events
│   │   └── components/        # Evidence Drawer, Topology Graph, Policy Sandbox, Scenario Replay, Error Boundary
│   └── package.json           # Frontend dependencies (React 19, Vite, Lucide)
│
├── docker-compose.yml         # Container orchestration (Backend, Frontend, Postgres blueprint, Neo4j blueprint)
└── README.md
```

---

## Quickstart (Local Development)

### 1. Backend Service

Configure authentication before starting the API. The server-side role enforcement uses signed JWT Bearer tokens; the signing key and user/role store can be supplied through environment variables (or rely on institutional dev defaults):

```powershell
$env:NETRA_JWT_SECRET = "replace-with-a-long-random-secret"
$env:NETRA_AUTH_USERS_JSON = '{"admin":{"role":"ADMIN","password_hash":"<pbkdf2-hash>"}}'
```

Generate a password hash with:

```powershell
Push-Location backend
py -3.12 -c "from auth import hash_password; print(hash_password('replace-with-password'))"
Pop-Location
```

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
- Login: `POST /api/auth/login`
- Interactive API docs (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### 2. Frontend Console

```powershell
cd frontend
npm install
npm run dev
```
- Set `VITE_NETRA_ADMIN_USERNAME` and `VITE_NETRA_ADMIN_PASSWORD` before `npm run dev`; add matching `VITE_NETRA_RISK_ANALYST_*`, `VITE_NETRA_INVESTIGATOR_*`, and `VITE_NETRA_VIEWER_*` values for the role selector.
- Web console: [http://localhost:5173](http://localhost:5173)
- Authentication uses signed JWT Bearer tokens acquired via `POST /api/auth/login`; credentials and roles are verified server-side.

---

## Running Test Suite

Execute the full automated backend test suite (78 tests covering engine algorithms, APIs, auth, graph traversal, ML anomaly models, and single-event causal loop propagation):

```powershell
cd backend
python -m pytest -q
```

Or run specific suites:
```powershell
python -m pytest test_engine.py -q
python -m pytest test_api.py -q
python -m pytest test_auth.py -q
python -m pytest test_single_event_propagation.py -q
```

---

## Docker Deployment

To launch the containerized stack:

```powershell
docker compose up --build
```
- Web Console: [http://localhost:8080](http://localhost:8080)
- API Service: [http://localhost:8000](http://localhost:8000)
- Neo4j Community (Port 7474/7687) — configured in docker-compose.yml as a future scale-out blueprint; active runtime persistence uses SQLite WAL mode.
- PostgreSQL 16 (Port 5432) — configured in docker-compose.yml as a future scale-out blueprint; active runtime persistence uses SQLite WAL mode.

---

## Interactive Scenario Walkthrough

The platform includes simulated vectors to test real-time detection in the console:

1. **Account Takeover Surge (`Trader #7842 - Maya Chen`)**:
   - Injects a multi-step attack: *Known Device Login → New Device Registration → Datacenter IP Switch → $25,000 High-Velocity Deposit → 50× Leverage Shift → Fresh Crypto Withdrawal*.
   - Watch trust score drop organically (`94.0 → 84.8 → 70.0 → 49.5 → 23.1 → 0.0`) through structured evidence accumulation until an authoritative `BLOCK` fires specifically on the withdrawal.
2. **Legitimate Cross-Border Travel (`Trader #7842 - Maya Chen`)**:
   - Injects an isolated geographic change (Singapore residential ISP) without anomalous behavioral follow-ups. Demonstrates how contextual baselines retain trusted standing (`MONITOR` at ~80.3 trust) and avoid false-positive account freezes.
3. **Collusive Fraud Ring (`Traders #7102–#7105`)**:
   - Demonstrates multi-entity cluster detection in the **Topology Graph** through shared hardware fingerprints, proxy IPs, and common withdrawal wallet infrastructure.
4. **Step-Up Trust Restoration**:
   - Initiate a biometric / hardware key verification to restore degraded trust back to normal standing and safely promote verified devices into the baseline.

---

## Project & Team Context

- **Technical Product**: NETRA — Continuous Trader Trust Intelligence Engine
- **Hackathon Context**: Developed for the Mochatrade YC P26 Mumbai Hackathon challenge (protecting perpetual futures venues, instant INR rails, and retail traders against account takeovers, collusion, and coordinated sweeps).
- **Engineering Team**: Bosch Coders

