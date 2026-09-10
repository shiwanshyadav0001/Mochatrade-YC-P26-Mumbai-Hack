# NETRA Change Log

## Phase 0: Project Audit (September 10, 2026)

> **Phase 0 was READ-ONLY. No product functionality was intentionally modified.**

### Audit Activities
- Complete forensic code inspection across `backend/` and `frontend/`.
- Executed existing automated backend test suite (`python -m pytest test_engine.py test_api.py -v`) — all 12 tests passed without modification.
- Evaluated runtime database architecture, Docker configuration, API routing, authentication mechanics, and mathematical algorithms.
- Inspected frontend views, custom SVG layouts, Web Audio telemetry synthesizer, and state management.

### Unavoidable Environment-Only Artifacts
- Running `pytest` generated standard transient pytest cache files in `backend/.pytest_cache/` and local SQLite session file `backend/netra.db` (both are excluded by `.gitignore`).
- No dependencies were added, updated, or removed.
- No source code or configuration files were modified.

### Artifacts Created
- `NETRA_PROJECT_AUDIT.md`: 33-section comprehensive technical and forensic audit report.
- `NETRA_FEATURE_INVENTORY.md`: Granular machine-readable capability status matrix.
- `NETRA_CHANGELOG.md`: Phase 0 audit log record.

---

## Day 1: Trust Intelligence Foundation (September 10, 2026)

### Objective
Replace the hardcoded flagship trust-score bypass with genuine contextual risk intelligence and anti-double-counting aggregation while preserving all existing console and API contracts.

### Key Architectural Changes
1. **Removed Hardcoded Flagship Trajectory:** Removed hardcoded point-deductions (`94 -> 82 -> 61 -> 48 -> 31 -> 14`) triggered by `metadata.flagship`.
2. **Contextual Risk Intelligence:** Implemented structured `RiskSignal` generation with severity, feature weight, contribution, and contextual synergy.
3. **Anti-Double-Counting:** Grouped signals by dimensional category and bounded total dimensional impact.
4. **Action Sensitivity Mapping:** Sensitive actions (e.g. `WITHDRAWAL`) evaluate proportional risk against policy thresholds.

---

## Day 2: Temporal Intelligence, Adaptive Baseline, Action Enforcement, Tamper-Evident Audit & Security Hardening (September 10, 2026)

### Objective
Advance NETRA from a contextual rule-based trust engine to a temporal, behavioral, and operational trust intelligence system with:
1. Adaptive behavioral baselines with baseline poisoning protection (`BaselineEngine`).
2. Multi-horizon temporal sliding windows and velocity burst detection (`TemporalWindowEngine`).
3. Timestamp-aware kill chain sequence evaluation (`SequenceEngine`).
4. Operational action enforcement gateway with true `BLOCK` enforcement state (`ActionEnforcementService`).
5. Cryptographically linked SHA-256 tamper-evident audit ledger (`audit_chain`).
6. Server-side RBAC authorization hardening and environment-driven CORS security.
7. Truthful analytics and latency profiling based on ground-truth threat controls.

### Implementation Sections
- **Phase 2A — Adaptive Behavioral Baseline (`backend/baseline.py`):**
  - Implemented `BaselineEngine` and `AdaptiveTraderProfile` tracking numeric distributions (mean, median, standard deviation, sample count, min, max) for deposits, withdrawals, trade sizes, and leverage.
  - Implemented baseline poisoning protection (`is_trusted_for_learning`): only transactions with `ALLOW` decisions, trust score >= 70, or successful step-up verification are incorporated into learning profiles. Suspicious new devices, proxy IPs, abnormal deposits, and unverified credentials cannot poison the baseline.
  - Circadian / Time-of-Day baseline evaluation detecting out-of-hours activity as a contextual signal without single-factor blocking.
- **Phase 2B — Statistical Deviation Analysis (`backend/baseline.py`):**
  - Implemented bounded z-score calculations: $z = (x - \mu) / \sigma$ with safe guards for small sample counts ($N < 3$) and zero standard deviation ($\sigma = 0$).
  - Mapped statistical deviation to bounded 0–100 risk severity with clear distinction between statistical scoring and heuristic fallback.
- **Phase 2C — Temporal Sliding Window Engine (`backend/temporal.py`):**
  - Evaluates rolling velocity metrics across 5-minute, 15-minute, 1-hour, 24-hour, and 7-day windows using event timestamps.
  - Computes recency deltas (time since last login, trade, deposit, leverage change, sensitive action).
  - Detects velocity surges relative to trader baseline hourly transaction velocity.
- **Phase 2D — Sequence Intelligence (`backend/temporal.py`):**
  - Replaced naive existence checks with timestamp-ordered sequence evaluation matching kill chains:
    - `SEQ-RAPID-WITHDRAWAL`: `NEW_DEVICE -> IP_CHANGE -> ABNORMAL_DEPOSIT -> LEVERAGE_CHANGE -> WITHDRAWAL`
    - `SEQ-CREDENTIAL-TAKEOVER`: `NEW_DEVICE -> PASSWORD/2FA/API_KEY_CHANGE -> SENSITIVE_ACTION`
    - `SEQ-FLASH-COLLUSION`: Multi-account shared entity reuse within short temporal intervals
    - `SEQ-RAPID-DEPOSIT-DRAIN`: Deposit followed immediately by extraction
  - Injected as structured `RiskSignal` evidence into Day 1 aggregation pipeline with anti-double-counting deduplication.
- **Phase 2E — Operational Action Enforcement (`backend/enforcement.py`):**
  - Implemented `ActionEnforcementService` evaluating `(trader, action, policy, context, cases)`.
  - Supports full decision taxonomy: `ALLOW`, `MONITOR`, `VERIFY`, `RESTRICT`, and `BLOCK`.
  - `BLOCK` explicitly denies simulated actions with reason, preventing unauthorized execution.
  - Exposed via `POST /api/actions/evaluate`.
- **Phase 2F — Tamper-Evident SHA-256 Audit Chain (`backend/audit_chain.py`):**
  - Every audit log entry is canonically serialized (deterministic JSON with sorted keys) and cryptographically chained via SHA-256:
    `current_hash = SHA256(canonical_payload + previous_hash)`.
  - Implemented `verify_audit_chain()` detecting tampered records, broken links, record deletion, and out-of-order records.
  - Exposed via `GET /api/audit/verify` and integrated into UI Audit Vault.
- **Phase 2G — Security Hardening & Authorization (`backend/main.py`):**
  - Centralized actor extraction and implemented server-side RBAC dependency `require_role(...)`.
  - Privileged actions (`PUT /api/policies`, `POST /api/cases`, `POST /api/simulator/step`, `POST /api/simulator/run`, `POST /api/simulator/reset`) enforce `ADMIN` or `RISK_ANALYST` roles server-side; `VIEWER` is restricted to read-only access.
  - Environment-controlled CORS with secure localhost defaults for development.
- **Phase 2H — Truthful Analytics (`backend/engine.py`, `frontend/src/App.tsx`):**
  - Removed misleading static enterprise performance numbers (`precision = 94.2%`, `recall = 91.5%`).
  - Implemented live empirical evaluation comparing engine decisions against ground-truth threat controls (TP, TN, FP, FN, precision, recall, FPR, detection rate).
  - Relabeled latency profiling truthfully as `perf_counter` pipeline execution timing (signal extraction -> sequence -> aggregation -> decision).
- **Phase 2I — Frontend Integration (`frontend/src/App.tsx`, `frontend/src/types.ts`):**
  - Added interactive "VERIFY SHA-256 CHAIN" control with cryptographic verification banner.
  - Added SHA-256 hash link column and updated CSV export to include hash lineage.
  - Updated Analytics view to display live ground-truth precision/recall and execution profiling.

### Files Changed
- `backend/models.py`: Added `previous_hash` and `current_hash` columns to `AuditModel`.
- `backend/database.py`: Added safe automated SQLite table migration in `init_db()` to preserve existing database records.
- `backend/audit_chain.py`: [NEW] Deterministic SHA-256 hash chaining and chain verification.
- `backend/baseline.py`: [NEW] Adaptive trader behavioral profiles, z-scores, circadian checks, and poisoning protection.
- `backend/temporal.py`: [NEW] Temporal sliding window analysis and timestamp-ordered sequence detection.
- `backend/enforcement.py`: [NEW] Operational action enforcement gateway with policy-aware `BLOCK` state.
- `backend/engine.py`: Integrated baseline profiles, temporal window burst detection, sequence risk signals, action evaluation, and audit chaining.
- `backend/main.py`: Added endpoints (`POST /api/actions/evaluate`, `GET /api/audit/verify`, `GET /api/traders/{id}/baseline`), server-side RBAC, and environment-driven CORS.
- `backend/test_engine.py`: Expanded unit tests covering baselines, z-scores, poisoning protection, sliding windows, sequences, enforcement, audit chaining, and analytics truthfulness.
- `backend/test_api.py`: Added endpoint tests for action evaluation, audit verification, baseline inspection, and RBAC authorization enforcement.
- `frontend/src/types.ts`: Added `AuditRecord`, `AuditVerifyResult`, `ActionEvaluationResult` types.
- `frontend/src/App.tsx`: Exposed audit verification UI, SHA-256 hash links, and truthful execution profiling.

### API & Database Changes
- **Database Schema:** `audit_log` table altered with `previous_hash VARCHAR(64)` and `current_hash VARCHAR(64)`.
- **New Endpoints:**
  - `POST /api/actions/evaluate`: Evaluates action execution against policy and trust state (`ALLOW`, `MONITOR`, `VERIFY`, `RESTRICT`, `BLOCK`).
  - `GET /api/audit/verify`: Validates cryptographic SHA-256 integrity of audit log chain.
  - `GET /api/traders/{trader_id}/baseline`: Returns trader adaptive behavioral profile and statistics.
- **Modified Endpoints:**
  - `PUT /api/policies`: Protected with `require_role({"ADMIN"})`.
  - `POST /api/cases`: Protected with `require_role({"ADMIN", "RISK_ANALYST", "INVESTIGATOR"})`.
  - `PATCH /api/cases/{id}`: Protected with `require_role({"ADMIN", "RISK_ANALYST", "INVESTIGATOR"})`.
  - `POST /api/policy/simulate`: Protected with `require_role({"ADMIN", "RISK_ANALYST"})`.
  - `POST /api/simulator/step`, `POST /api/simulator/run`, `POST /api/simulator/reset`: Protected with `require_role(...)`.

### Test Results
- **Backend Test Suite:** 29 passed out of 29 (`python -m pytest test_engine.py test_api.py -v`).
- **Frontend Build:** Succeeded cleanly with 0 TypeScript/Vite errors (`npm run build`).
- **Flagship Scenario:** Trust score organically degrades from 94.0 -> 83.2 -> 65.8 -> 45.3 -> 18.9 -> 0.0, culminating in an enforced `BLOCK` on suspicious withdrawal.
- **Legitimate Travel:** Proportional trust retention (74.6 >= 70.0 `MONITOR` band), avoiding unwarranted `BLOCK` or account freeze.
- **Audit Verification:** Verified 100% cryptographic integrity across all chained records; detected tampering and out-of-order records.

### Limitations & Truthful Status
- **Persistence Layer:** SQLite with WAL mode remains the active persistence layer. PostgreSQL and Neo4j configurations remain demo-configured and unintegrated.
- **Trading Venue Integration:** Outbound action enforcement is a simulated gateway layer (`ActionEnforcementService`). Real venue webhook/API dispatching is integration-ready but not connected to live external exchange infrastructure.
- **Machine Learning:** All scoring utilizes statistical behavioral analysis (z-scores, dynamic distributions) and deterministic contextual aggregation. Deep learning / unsupervised ML (Isolation Forest, clustering) remains a future roadmap priority.

---

## Day 3: Real Graph Intelligence + Behavioral Anomaly Detection (September 10, 2026)

### Objective
Advance NETRA from a temporal and rule-based trust engine into a multi-layered intelligence platform by incorporating:
1. Genuine multi-hop graph intelligence (`backend/graph_intelligence.py`) with cycle protection, configurable relationship strength, and algorithmic cluster detection.
2. Unsupervised behavioral anomaly detection (`backend/anomaly_model.py`) using scikit-learn Isolation Forest with deterministic 12-dimensional feature extraction, training contamination protection, and explainable attribution.
3. Trust engine integration with anti-double-counting aggregation, ensuring ML acts strictly as an evidence source without independent direct-blocking authority.

### Key Architectural Changes
1. **Real Graph Intelligence Engine (`backend/graph_intelligence.py`):**
   - Implemented `GraphIntelligenceEngine` supporting breadth-first 1-hop, 2-hop, and 3-hop traversal with strict cycle protection.
   - Configurable relationship strengths: `WITHDREW_TO` (0.95), `USED_DEVICE` (0.80), `LOGGED_FROM` (0.45).
   - Breadth-first shortest path discovery between arbitrary network entities.
   - Algorithmic connected component detection and suspicious cluster classification based on shared high-strength infrastructure (wallets, hardware devices) and degraded trust states.
   - Structured graph risk signals (`SHARED_INFRASTRUCTURE_CLUSTER`, `SHARED_WALLET_CLUSTER`, `SHARED_DEVICE_CLUSTER`, `SHARED_IP_CLUSTER`, `MULTI_HOP_SUSPICIOUS_CONNECTION`, `COORDINATED_ACTIVITY`).
2. **Real Behavioral Anomaly Model (`backend/anomaly_model.py`):**
   - Implemented `BehavioralAnomalyService` wrapping `scikit-learn`'s `IsolationForest`.
   - Deterministic 12-dimensional feature vector: deposit z-score, withdrawal z-score, leverage z-score, trade size z-score, 1h velocity ratio, 1h sensitive action count, burst ratio, device novelty, network novelty, wallet novelty, circadian anomaly, and graph degree.
   - Training Data Contamination Protection: only transactions with verified trust standing (`trust_score >= 70.0`, `ALLOW`/`MONITOR` decisions, non-attack data) enter the training population.
   - Normalized 0–100 Anomaly Score via linear boundary projection of Isolation Forest `decision_function(X)`.
   - Feature-level explainability pinpointing specific metric deviations ($z > 1.2\sigma$).
   - Graceful fallback: returns `INSUFFICIENT_DATA` or `FAILED` without crashing event ingestion if training data is insufficient or model is uninitialized.
3. **Trust Engine Integration & Anti-Double-Counting (`backend/engine.py`):**
   - Excised all hardcoded fraud ring checks (`if event.trader_id in {"7102", "7103", ...}`). All relationship risk is computed dynamically from graph topology.
   - Integrated graph and ML anomaly signals into the `RiskSignal` contextual pipeline under categorized dimensions (`relationships`, `behaviour`), preventing multiple compounding penalties for the same underlying factor.
   - Preserved `GET /api/traders/{id}/graph` backward-compatible contract for frontend consumers.
4. **New API Endpoints (`backend/main.py`):**
   - `GET /api/traders/{trader_id}/graph/intelligence`: Returns deep graph traversal, paths, cluster details, and risk signals.
   - `GET /api/anomaly/status`: Returns operational status, sample counts, feature versions, and algorithm metadata.
   - `GET /api/traders/{trader_id}/anomaly`: Returns trader anomaly score, feature vector, top deviations, and explanations.

### Test Results
- **Backend Test Suite:** 45 passed out of 45 (`python -m pytest -v`).
- **Syntax Check:** `python -m compileall backend` compiled cleanly with 0 errors.
- **Frontend Build:** Succeeded cleanly with 0 TypeScript/Vite errors (`npm run build`).
- **Scenarios Verified at Runtime:**
  - `FLAGSHIP`: Progressive contextual degradation culminating in `BLOCK` on sensitive withdrawal.
  - `TRAVEL`: Normal activity in new geography retains trusted standing (`MONITOR`), avoiding false positive `BLOCK`.
  - `FRAUD_RING`: Dynamic cluster detection identifies 4 traders sharing hardware and destination wallet without hardcoded IDs.
  - `TAKEOVER`: Credential and device changes trigger graduated `RESTRICT` and `BLOCK`.
  - `STEP-UP`: Verification successfully restores trust.
  - `ACTION ENFORCEMENT`: Gateway states cleanly enforce proportional access.
  - `AUDIT CHAIN`: Cryptographic SHA-256 integrity verified across all ledger records.

---

## Pre-Day-4: Functional Reality Audit & Fix Pass (September 10, 2026)

### Objective
Conduct an end-to-end reality audit and forensic bug fix pass across the frontend and backend of the NETRA platform. Trace every value displayed in the UI back to actual backend state, eliminate demo bypasses and static hardcodings, fix cross-scenario state contamination, guarantee consistent trader views across tabs, and ensure all metrics, sequence evaluations, graph links, and audit rows are calculated from ground-truth data.

### Issues Identified & Root Causes
1. **Cross-Scenario Contamination:** `prepare_scenario("TRAVEL")` re-used trader 7842 without resetting historical flagship events, causing previous attack data to poison the adaptive baseline and event feed.
2. **Trader State Discrepancy Across Panels:** `App.tsx` calculated `latestDecision` as `decisions[0]`, binding the Live Monitor's Persistent Decision Panel to whichever trader had the newest global decision rather than the currently selected trader (e.g. showing trust = 6 for an attacker while viewing a legitimate trader with trust = 82).
3. **Missing `/api/events` Endpoint & Initialization Desync:** Frontend had no endpoint to retrieve existing ingested events upon page reload or trader change, leading to empty or partially populated event logs.
4. **No True Trader Baseline Reset Endpoint:** UI baseline reset only reset mock variables without wiping learned statistical distributions in `BaselineEngine`.
5. **Static Placeholders in Evidence Drawer:** `EvidenceDrawer.tsx` fell back to hardcoded strings (`198.18.0.14`, `DEV-7842-PRIMARY`, `Mumbai, IN`) when event metadata lacked them, mimicking fake evidence.
6. **Synthetic Fake Lookup on Graph Node Click:** Clicking graph nodes emitted synthetic `ENTITY_LOOKUP` events rather than inspecting actual node/edge intelligence.
7. **Graph Link Type Prefix Mismatch:** Link target strings lacked standard prefixes (`DEV-`, `WALLET-`, `IP-`), causing frontend filter tabs to misclassify node types.
8. **Static Threat Trader IDs in Analytics:** `threat_trader_ids` were hardcoded to `{"7102", "7103", "7104", "7105"}` in `engine.py`, and precision/recall had hardcoded fallback decimals (`0.95`, `0.92`, `0.04`).
9. **Artificial Latency Clamping:** Latency calculation in `engine.py` was artificially clamped using `max(2.5, elapsed_ms)` rather than reflecting actual execution time.
10. **Subsecond Sequence Ordering Flaw:** Chronological ordering in `temporal.py` dropped events with identical timestamps when `event_id` was absent.

### Fixes Applied
1. **Trader Scenario Isolation (`backend/engine.py`):** Added `_isolate_scenario_trader()` to safely purge non-seed scenario residue, reset transitions, clear old decisions, and rebuild baseline profiles purely from clean seed events.
2. **Dynamic Live Event Ingestion & Polling (`backend/main.py`, `frontend/src/App.tsx`):** Implemented `GET /api/events` with optional filtering by `trader_id` and limit. Integrated into `refreshAll()` and `handleIngestEvent()`.
3. **Backend Baseline Reset (`backend/engine.py`, `backend/main.py`, `frontend/src/App.tsx`):** Implemented `reset_trader_baseline(trader_id)` and endpoint `POST /api/traders/{trader_id}/baseline/reset`.
4. **Synchronized Multi-Tab State (`frontend/src/App.tsx`):** Fixed `latestDecision` selection logic to prioritize `decisions.find(d => d.trader_id === selectedId)`.
5. **Truthful Evidence Drawer (`frontend/src/components/EvidenceDrawer.tsx`):** Removed all fallback strings. Added first-class support for inspecting case records (`caseItem`) and graph topology entities (`entity`).
6. **Topology Forensics Inspection (`frontend/src/App.tsx`, `frontend/src/components/EvidenceDrawer.tsx`):** Replaced synthetic lookup events with genuine node forensics drawer display.
7. **Consistent Topology Normalization (`backend/engine.py`, `backend/graph_intelligence.py`):** Normalized graph target IDs with standard entity prefixes and mapped `DEV-` to `'DEVICE'`.
8. **Ground-Truth Analytics & Dynamic Threat IDs (`backend/engine.py`):** Derived threat traders dynamically from graph clusters, high-risk cases, and degraded trust. Returned `None` for precision/recall when insufficient labeled decisions exist.
9. **Raw Unmanipulated Latency & Truthful Labeling (`backend/engine.py`, `frontend/src/App.tsx`, `frontend/src/components/CommandPalette.tsx`):** Removed `max(2.5, elapsed_ms)` artificial floor; relabeled UI badges to accurately describe evaluation latency.
10. **Context-Aware Dynamic SOPs (`backend/engine.py`):** Enriched `_explain` to generate dynamic recommendations citing action types, financial sums, and policy version.
11. **Subsecond Sequence Handling (`backend/temporal.py`):** Refined timestamp sequence sorting to handle identical timestamps without event drop.
12. **Event Source Tagging (`frontend/src/App.tsx`):** Added clear visual badges distinguishing `HISTORICAL`, `FLAGSHIP`, `TRAVEL`, `RING`, `TAKEOVER`, and `LIVE` events.

### Verification & Test Suite
- **Backend Test Suite:** 54 passed out of 54 (`python -m pytest -v`), including 9 new regression tests covering baseline resets, travel isolation, ground-truth analytics, dynamic threat rings, and event retrieval contracts.
- **Syntax & Compilation:** `python -m compileall backend` compiled cleanly with 0 errors.
- **Frontend Build:** `npm run build` completed successfully with 0 TypeScript/Vite errors.
- **Runtime Verification:** Executed `scratch/runtime_reality_audit.py` with 12 distinct live HTTP API assertions passing against the running server.

---

## Day 4: Multi-Trader Operational Intelligence Recovery & Completion (September 10, 2026)

### Objective
Recover safely from interrupted state and finish Day 4 Multi-Trader Operational Intelligence. Expand NETRA from a single flagship trader demo into a fully functional concurrent multi-trader institutional trust intelligence platform operating across 106 distinct identities, with ground-truth population seeding, system-wide graph topology analysis, dynamic cluster detection, unified risk events telemetry, interactive action sensitivity simulation, and zero fake intelligence.

### Interruption Recovery & Root Cause Diagnostics
1. **AssertionError in `test_anti_double_counting_across_engines`:**
   - *Root Cause:* In `backend/engine.py`, `_action_for_event()` defaulted `NEW_DEVICE`, `IP_CHANGE`, and `GEO_CHANGE` to `"TRADE"` (action sensitivity 50) rather than `"LOGIN"` (action sensitivity 30). This caused contextual trust deduction to exceed the anti-double-counting test boundary.
   - *Fix:* Explicitly mapped authentication/device/IP events to action `"LOGIN"` with sensitivity 30.
2. **Missing Attribute `self.rng` in `NetraEngine` on Database Reload:**
   - *Root Cause:* In `backend/engine.py`, `self.rng = random.Random(7842)` was only initialized inside `reset()`. When the engine loaded existing records from `netra.db` via `load_or_seed()`, `reset()` was skipped and subsequent scenario trader allocations threw `AttributeError: 'NetraEngine' object has no attribute 'rng'`.
   - *Fix:* Initialized `self.rng` unconditionally in `NetraEngine.__init__()` and made segment assignment deterministic in `_new_trader()`.
3. **Graph Degree Explosion & Model Outlier False-Positives:**
   - *Root Cause:* In `_update_graph()`, edge objects with unique `event.event_id` in their evidence arrays were appended on every transaction without deduplication. Consequently, `graph_degree` ballooned from 2 to 20+. Because `BehavioralAnomalyService` was fitted with hardcoded `graph_degree=1`, normal trades were flagged as high-severity outliers (`UNSUPERVISED_BEHAVIORAL_ANOMALY`).
   - *Fix:* Implemented edge deduplication with evidence accumulation in `_update_graph()`, calculated distinct target degrees in `extract_feature_vector()` during both ingestion and training, and harmonized seed trade amounts to trader baselines.

### Architectural & Functional Changes
1. **Multi-Trader Population Seeding (`backend/engine.py`):**
   - Populated 106 distinct identities: `#7842` (Maya Chen), `#7001` (Elena Rostova - Normal), `#7002` (Liam Vance - Travel), `#7003` (Aria Thorne - High-Risk Leverage), `#7004` (Marcus Sterling - Hostile Takeover), `#7102–#7105` (Fraud Ring cluster), plus 98 background institutional market participants.
   - Seeded 22 days of realistic historical trades per trader to establish genuine statistical distributions.
2. **System-Wide Topology & Cluster Detection (`backend/graph_intelligence.py`, `backend/main.py`):**
   - Implemented `format_system_graph_response()` providing system-wide graph topology (`nodes`, `edges`, `clusters`).
   - Added endpoint `GET /api/graph/system` returning global infrastructure clusters with risk flags, shared entities, and affected traders.
3. **Contextual Risk Events Telemetry (`backend/engine.py`, `backend/main.py`):**
   - Implemented `get_risk_events(trader_id, category, min_severity, limit)` querying operational risk signals across all processed events.
   - Added endpoint `GET /api/risk-events` with query filtering.
4. **Action Enforcement Integration (`backend/engine.py`):**
   - Attached authoritative `ActionEnforcementService.evaluate_action()` directly to `ingest()` returns and `decision_record`, guaranteeing that decisions and enforcement actions (`ALLOWED`, `MONITORED`, `CHALLENGED`, `RESTRICTED`, `BLOCKED`) are emitted together.
5. **Operational Analytics Enrichment (`backend/engine.py`):**
   - Enriched `analytics()` with `operational_metrics`: population counts across risk tiers, enforcement counter breakdowns (`PROCEED`, `MONITOR`, `STEP_UP_CHALLENGE`, `HOLD_REVIEW`, `HALT_BLOCKED`), and infrastructure cluster counts.
   - Removed all `?? 3.8`, `?? 8.2`, `?? 4.1` static fallback constants.
6. **Frontend Multi-Trader Operations Console (`frontend/src/App.tsx`, `frontend/src/types.ts`):**
   - **Overview:** Dynamic sequence timeline visualizer driven by selected trader's actual event history.
   - **Live Monitor:** Added quick-switcher pill bar for representative traders (`#7842`, `#7001`, `#7002`, `#7003`, `#7004`, `#7102`) and dropdown supporting all 106 traders.
   - **Traders Tab:** Added risk tier filtering (`ALL`, `TRUSTED`, `MONITORED`, `RESTRICTED`, `BLOCKED`, `FRAUD RING`), metadata columns (`ANOMALY`, `CASES`, `LAST ACTIVITY`), and interactive Action Sensitivity & Enforcement Gateway simulator (`POST /api/actions/evaluate`).
   - **Risk Events Tab:** Added feed toggle between Contextual Risk Incidents (`/api/risk-events`) and Ingestion Stream (`/api/events`), plus interactive trader targeting.
   - **Topology Graph:** Added view toggle between Selected Trader Traversal and System-Wide Infrastructure Clusters with detected cluster cards.
   - **Analytics Tab:** Added Operational Population & Enforcement Gateway Telemetry panel.

### Test Results & Runtime Verification
- **Unit & Regression Tests:** 60 passed out of 60 (`python -m pytest -v` in 19.03s).
- **Compilation Check:** `python -m compileall backend` compiled cleanly with 0 errors.
- **Frontend Production Build:** `npm run build` succeeded cleanly in 171ms with 0 errors.
- **Live HTTP API Verification (`verify_day4_live.py`):** All 10 live checks passed against running server.
- **End-to-End Runtime Scenarios (`verify_scenarios_e2e.py`):**
  - **Scenario A (Normal Trader #7001):** Clean trade evaluated against baseline. 0 triggered rules, 0 risk signals, trust remains 94.0, decision `ALLOW`, enforcement `ALLOWED`.
  - **Scenario B (Legitimate Travel #7002):** Location change to Singapore evaluated in context. Trust remains healthy at 80.3 (`GUARDED`), decision `MONITOR`, withdrawal challenges rather than hard blocking.
  - **Scenario C (Flagship Attack #7842):** Full kill chain progression (`LOGIN` 94.0 -> `NEW_DEVICE` 84.8 -> `IP_CHANGE` 70.0 -> `LARGE_DEPOSIT` 49.5 -> `HIGH_LEVERAGE` 23.1 -> `WITHDRAWAL` 0.0). Progressive trust decay, kill chain sequence detected, final decision `BLOCK`, enforcement `BLOCKED`, persistent security case created, SHA-256 audit chain verified.
  - **Scenario D (Fraud Ring #7102-#7105):** Multi-trader cluster discovered from actual graph links sharing `DEV-RING-X`, `IP-RING-X`, `WALLET-RING-X` without hardcoded trader IDs.

### Known Limitations
1. SQLite WAL mode provides local persistence; production high-concurrency ingestion (>10k events/sec) will benefit from PostgreSQL / TimescaleDB.
2. Unsupervised Isolation Forest is a behavioral anomaly detector; production institutional deployment requires supervised threat calibration with historical labeled fraud datasets.
3. Graph intelligence currently runs an in-memory BFS engine on SQLite graph records; massive graphs (>1M nodes) will require Neo4j / Memgraph graph database engines.

---

## Hardening & Forensic Reconciliation Pass (September 11, 2026)

### Objective
Perform end-to-end forensic reconciliation of documentation against active source code, harden frontend-backend data contracts, eliminate crash hazards, and verify continuous test and build integrity without modifying core algorithms.

### Key Changes & Forensic Findings
1. **Cryptographic JWT Authentication Hardening (`backend/auth.py`, `backend/test_auth.py`):**
   - Verified active server-side authentication using HMAC-SHA256 bearer tokens, PBKDF2-SHA256 password hashing (310,000 iterations), token expiration, and role validation via `require_role(...)`.
   - Updated documentation to reflect active JWT enforcement and removed outdated claims that auth was deferred.
2. **Dual-Contract Risk Events Resilience (`backend/engine.py`, `frontend/src/App.tsx`, `frontend/src/types.ts`):**
   - Enriched backend `risk_events` emission to provide both primary fields (`severity`, `reason`, `resulting_trust`, `decision_impact`) and backward-compatible aliases (`contextual_risk`, `trust_after`, `decision`, `signals`).
   - Hardened `RiskEvents` table rendering in `App.tsx` with defensive optional chaining and fallback empty arrays, resolving the black-screen bug.
3. **UI Crash Protection (`frontend/src/components/ErrorBoundary.tsx`):**
   - Added class-based React `ErrorBoundary` wrapping core view components to prevent unexpected unhandled render exceptions from taking down the entire console.
4. **Scenario Identity Alignment (`frontend/src/components/ScenarioAttackReplay.tsx`):**
   - Aligned scenario replay display names to match backend ground-truth identities: `#7842` mapped to Maya Chen; `#7102` mapped to Kavita Reddy.
5. **Documentation & Feature Inventory Reconciliation:**
   - Updated `README.md` to truthfully reflect the 8-stage intelligence pipeline (including Scikit-Learn Isolation Forest and Action Enforcement Gateway), the complete 14-file backend architecture, and clean separation between NETRA as the platform, Bosch Coders as the engineering team, and Mochatrade YC P26 as the hackathon domain context.
   - Updated `NETRA_FEATURE_INVENTORY.md` to align every feature item against runtime code evidence using the standard status model.

### Test & Build Verification
- **Backend Test Suite:** 68 passed out of 68 (`python -m pytest` in 18.10s, 0 failures).
- **Frontend Production Build:** `npm run build` completed in 131ms with 0 errors.
- **Git State:** Preserved current development tree without destructive resets or rollbacks.


