# NETRA — Continuous Trader Trust Intelligence Engine

NETRA is an institutional trust and risk intelligence engine designed for trading venues and exchanges. It answers one critical operational question: **"Does this action make sense for this trader, right now?"**

Traditional risk management evaluates transactions in isolation (`event → rule → alert`). NETRA evaluates the holistic lifecycle:
`events → individual baseline → sequence analysis → entity graph → continuous trust (0–100) → proportional intervention → forensic audit trail`.

---

## Architecture & Pipeline

```text
Incoming Event Stream
   │
   ├── 1. Validation & Normalization (Pydantic / FastAPI)
   ├── 2. Individual Baseline Deviation (Velocity, Leverage, Volatility, Geo)
   ├── 3. Graph Entity Links & Cluster Discovery (Shared IP, Device, Wallet)
   ├── 4. Sequence Anomaly Analysis (Attack Vector / Account Takeover Chains)
   ├── 5. Continuous Trust State Transition (0–100 Bayesian Decay & Recovery)
   ├── 6. Action-Proportional Decision Matrix (ALLOW | MONITOR | VERIFY | RESTRICT)
   └── 7. Forensic Audit & Evidence Dossier (Immutable Log + Case Lifecycle)
   │
   ▼
Real-time SSE Stream → Institutional React/TypeScript Operations Console
```

---

## Key Capabilities

- **Contextual Ingestion**: High-throughput REST ingestion (`POST /api/events`) with schema validation and real-time Server-Sent Events (`GET /api/stream`).
- **Dynamic Individual Baselines**: Evaluates activity against each trader's 30-day baseline rather than rigid universal thresholds (distinguishing legitimate high-net-worth volume from hostile surges).
- **Multi-Hop Topology Graph**: Uncovers collusive fraud rings and multi-account clusters linked via shared devices, IP subnets, or deposit/withdrawal wallet addresses.
- **Proportional Interventions**: Enforces graduated risk mitigation (`ALLOW`, `MONITOR`, `VERIFY` via step-up 2FA/biometric challenge, or granular `RESTRICT` on high-risk withdrawal channels while keeping read-only account access intact).
- **Forensic Explainability**: Every score transition and decision outputs a structured evidence breakdown, triggered heuristics, and tamper-evident audit records.
- **Live Policy Matrix**: Real-time sensitivity calibration and signal weight adjustments with pre-commit policy simulation.

---

## Project Structure

```text
├── backend/
│   ├── main.py             # FastAPI REST endpoints, SSE feed, and actor auth
│   ├── engine.py           # Core trust scoring, graph topology, and baseline logic
│   ├── models.py           # SQLAlchemy database schema and entity models
│   ├── database.py         # SQLite / PostgreSQL connection pooling and session management
│   ├── test_engine.py      # Automated test suite for trust decay and decisions
│   └── requirements.txt    # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Operations console, live telemetry, and views
│   │   ├── api.ts          # Strongly-typed API client
│   │   ├── styles.css      # Institutional high-density dark theme design system
│   │   ├── audio.ts        # Auditory feedback synthesizer for telemetry events
│   │   └── components/     # Evidence Drawer, Topology Graph, Policy Sandbox, Command Palette
│   └── package.json        # Frontend dependencies (React, Vite, Lucide)
│
├── docker-compose.yml      # Orchestration for Backend, Frontend, Postgres, and Neo4j
└── README.md
```

---

## Quickstart (Local Development)

### 1. Backend Service

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/health](http://localhost:8000/health)

### 2. Frontend Console

```powershell
cd frontend
npm install
npm run dev
```
- Web console: [http://localhost:5173](http://localhost:5173)

---

## Running Test Suite

Verify trust degradation, isolated location tolerance, and fraud ring clustering:

```powershell
cd backend
python -m pytest test_engine.py -q
```

---

## Docker Deployment

To launch the full containerized stack:

```powershell
docker compose up --build
```
- Web Console: [http://localhost:8080](http://localhost:8080)
- API Service: [http://localhost:8000](http://localhost:8000)
- Neo4j Browser: [http://localhost:7474](http://localhost:7474)

---

## Interactive Scenario Walkthrough

The platform includes simulated vectors to test real-time detection in the console:

1. **Account Takeover Surge (`Trader #7842`)**:
   - Injects a multi-step attack: *Known Device Login → New Device Registration → Datacenter IP Switch → $25,000 High-Velocity Deposit → 50× Leverage Shift → Fresh Crypto Withdrawal*.
   - Watch trust score drop dynamically (`94 → 82 → 61 → 48 → 31 → 14`) until a proportional `RESTRICT` fires specifically on the withdrawal.
2. **Legitimate Cross-Border Travel (`Trader #7842`)**:
   - Injects an isolated geographic change without anomalous behavioral follow-ups. Demonstrates how contextual baselines avoid false-positive account freezes.
3. **Collusive Fraud Ring (`Traders #7102–#7105`)**:
   - Demonstrates multi-entity cluster detection in the **Topology Graph** through shared hardware fingerprints and common wallet infrastructure.
4. **Step-Up Trust Restoration**:
   - Initiate a biometric / hardware key verification to restore degraded trust back to normal standing.
