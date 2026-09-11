# NETRA Feature Inventory & Status Matrix

> **Legend:**
> - `[✓]` = Implemented & Verified
> - `[~]` = Partially Implemented / Integrated
> - `[SIM]` = Simulation / Demo
> - `[ ]` = Planned / Missing
> - `[!]` = Broken / Failing Contract

---

## 1. Core Intelligence & Decision Pipeline
- [✓] Event Ingestion REST API (`POST /api/events` and `GET /api/events`)
- [✓] Pydantic Schema Validation (15 Event Types)
- [✓] Trader Profile Directory (106 Seeded Identities with persistent behavioral profiles)
- [✓] Proportional Decision Matrix (`ALLOW`, `MONITOR`, `VERIFY`, `RESTRICT`, `BLOCK`)
- [✓] Pre-Commit Policy Simulator (`POST /api/policy/simulate`)
- [✓] Step-Up Identity Verification (`POST /api/traders/{id}/step-up`)
- [✓] Temporal Sequence Anomaly Engine (Timestamp-aware sequence kill chains in `SequenceEngine` with subsecond ordering)
- [✓] Entity Relationship Linkage (Multi-hop set expansion & normalized target entities)
- [✓] Explainability Dossier Generator (Contextual action-, policy-, and amount-aware SOP recommendations)
- [✓] Structured Causal Explanation Engine (`primary_drivers` decomposition, `what_changed` timeline, and authoritative `evidence_basis` cross-surface linkage)
- [✓] Deterministic Counterfactual Sensitivity Simulation (`POST /api/counterfactual/simulate` evaluating hypothetical factor removal on trust and policy without mutating state)
- [✓] Organic Continuous Trust Degradation (Organic evidence-based scoring; hardcoded bypass removed)
- [✓] Adaptive Rolling Baselines (`BaselineEngine`: mean, stdev, sample count, z-scores, circadian norms)
- [✓] Baseline Poisoning Protection (`is_trusted_for_learning` guards preventing unverified attacks from learning)
- [✓] Trader Individual Baseline Reset (`POST /api/traders/{id}/baseline/reset`)
- [✓] Scenario State Isolation (Clean state purge in `_isolate_scenario_trader` preventing scenario cross-contamination)
- [✓] Temporal Sliding Window Engine (`TemporalWindowEngine`: 5m, 15m, 1h, 24h, 7d rolling velocity & burst analysis)
- [✓] Operational Action Enforcement Gateway (`ActionEnforcementService` with `POST /api/actions/evaluate` and attached to `ingest`)
- [✓] Operational Risk Events Feed (`GET /api/risk-events` filtering by severity, category, trader)
- [~] Action Enforcement Webhooks (Simulated gateway layer; outbound HTTP webhooks integration-ready)
- [✓] Machine Learning / Behavioral Anomaly Engine (Unsupervised scikit-learn Isolation Forest with 12D feature vectors, 0-100 normalized score, real graph degree, and poisoning protection)
- [✓] Behavioral Anomaly Status & Trader APIs (`GET /api/anomaly/status`, `GET /api/traders/{id}/anomaly`)
- [✓] Structured Behavioral Anomaly Taxonomy (`ANOMALY_TAXONOMY` and `StructuredAnomaly` across 5 core risk domains)
- [✓] Trader Baseline Confidence Metric (`baseline_confidence`: `LOW` / `MEDIUM` / `HIGH` based on sample count)
- [✓] Session Risk State Architecture (`SESSION_RISK_STATES` tracking `SESSION_NORMAL` through `SESSION_TERMINATED`)
- [✓] Contextual Step-Up Verification Challenge & Validation (`POST /api/verify/step-up` with automated termination on repeated failures)
- [✓] Operator Decision Override with Cryptographic Audit Provenance (`POST /api/decisions/{id}/override`)
- [✓] Session Termination & Enforcement Lockdown (`POST /api/sessions/{id}/terminate`)
- [✓] Continuous Trust Recovery Function (Proportional step-up identity restoration with safe baseline promotion)
- [✓] UI/Backend Data Consistency (Context-aware decision binding to selected trader)
- [✓] Multi-Trader Quick Switcher (Live Monitor switcher supporting all 106 concurrent traders)

---

## 2. Graph & Relationship Intelligence
- [✓] Dynamic Graph Link Generation from Events (`graph_links` table with edge deduplication & evidence accumulation)
- [✓] Fraud Ring Shared Infrastructure Seeding (Traders #7102–#7105 sharing device, IP, and wallet)
- [✓] Interactive SVG Topology Graph Component (With real entity/trader forensic inspection)
- [✓] Multi-Hop Entity Relationship Traversal (1-hop, 2-hop, 3-hop BFS with cycle protection and shortest paths)
- [✓] Configurable Relationship Strength (Wallet: 0.95, Device: 0.80, IP: 0.45)
- [✓] Automated Community / Cluster Detection (Connected components with suspicious cluster identification)
- [✓] System-Wide Graph Topology & Multi-Trader Cluster API (`GET /api/graph/system`)
- [✓] Structured Graph Risk Signals (`SHARED_INFRASTRUCTURE_CLUSTER`, `SHARED_WALLET_CLUSTER`, `SHARED_DEVICE_CLUSTER`, `COORDINATED_ACTIVITY`)
- [✓] Graph Intelligence Deep Traversal API (`GET /api/traders/{id}/graph/intelligence`)
- [SIM] Topology Graph Auto-Layout (Uses static polar circle trigonometric formulas)
- [ ] Force-Directed Graph Layout Algorithm
- [ ] Real Graph Database Engine (Neo4j driver & Cypher queries unintegrated; SQLite active)

---

## 3. Case Management & Human Investigation
- [✓] Automatic Case Generation upon `RESTRICT` Decision
- [✓] Manual Case Creation (`POST /api/cases`)
- [✓] Case Status Lifecycle (`OPEN`, `INVESTIGATING`, `ESCALATED`, `RESOLVED`, `FALSE_POSITIVE`)
- [✓] Timestamped Investigator Notes Log
- [✓] Comprehensive Case Dossier Export (`GET /api/cases/{id}/dossier`)
- [✓] Interactive Case Forensic Evidence Drawer (`inspectCase` in UI)
- [✓] Step-Up Trust Auto-Resolution of Open Cases
- [✓] Truthful Incident vs Baseline Delta Comparator (Authentic event metrics without fake placeholder deltas)
- [ ] Case Assignment Routing Rules
- [ ] Multi-Analyst Real-time Collaboration

---

## 4. Audit & Forensic Integrity
- [✓] Centralized Operational Audit Log Table (`audit_log`)
- [✓] Complete Decision History Logging
- [✓] Audit Vault CSV Export (With SHA-256 hash chain lineage)
- [✓] Audit Vault Log Viewer in Console (With cryptographic SHA-256 hash link display)
- [✓] Cryptographic SHA-256 Hash Chaining (`previous_hash` + deterministic canonical JSON payload)
- [✓] Tamper-Evident Chain Verification Endpoint (`GET /api/audit/verify`)
- [✓] UI Audit Chain Verification Controls (Interactive verification status badge & alerting)
- [✓] Unified Causal Provenance Engine (Deterministic `event_id` ↔ `decision_id` ↔ `audit_id` ↔ `audit_hash` SHA-256 linkage persisted in SQLite and in-memory engine)
- [✓] Single Audit Record Verification Endpoint (`GET /api/audit/{audit_id}` with live SHA-256 pre-image recalculation)
- [✓] Inline Cryptographic Proof Inspector (Inspect deterministic UTF-8 canonical pre-image, previous hash link, and SHA-256 proof directly in Live Monitor)
- [✓] 360-Degree Forensic Deep-Link Engine (Bidirectional navigation across surfaces: Live Event ↔ Exact Decision ↔ Evidence Dossier ↔ Cryptographic Audit Vault ↔ Risk Incident ↔ Case Workbench ↔ Scenario Lab)
- [✓] Truthful Event-to-Decision Fallback (Explicitly labels "NO EVENT-SPECIFIC DECISION // TELEMETRY CONFORMS TO BASELINE WITHOUT ACTIVE INTERVENTION" rather than silently displaying an unrelated decision)
- [✓] Cryptographic Provenance in Evidence Custody (Authentic SHA-256 block hash, record identifier, verification status, and direct vault jump)
- [✓] 9-Stage Grounded Causal Reasoning Pipeline (`01 EVENT → 02 CONTEXT → 03 SIGNALS → 04 BASELINE → 05 TOPOLOGY → 06 TRUST IMPACT → 07 POLICY → 08 ACTION → 09 AUDIT`)
- [ ] Merkle Tree Batch Decision Root Proofs

---

## 5. Console & UI Capabilities
- [✓] High-Density Institutional Operations Console (React 19 + TypeScript + Vite)
- [✓] Institutional Product Identity Reset (Pure technical engine identity; clean relocation of hackathon/team metadata)
- [✓] 9-Stage Continuous Intelligence Loop Indicator (`EVENT → CONTEXT → SIGNALS → BASELINE → TOPOLOGY → TRUST IMPACT → POLICY → ACTION → AUDIT`)
- [✓] Truthful Multi-State Telemetry Stream Status (Discriminates `CONNECTED`, `CONNECTING`, `RECONNECTING`, `DISCONNECTED`, `ERROR` with REST sync truthfulness)
- [✓] Executive Operational Command Surface (Real-time fleet threat level, ingestion health, and instant operational dispatches)
- [✓] Real-time Server-Sent Events (SSE) Telemetry Stream (`/api/stream`)
- [✓] Interactive Command Palette (`Ctrl+K`)
- [✓] Web Audio API Acoustic Telemetry Synthesizer (Zero asset dependencies)
- [✓] Slide-Out Evidence Dossier Drawer with 3 Tabbed Views
- [✓] First-Class Trader Behavioral Profile in Evidence Drawer (ML anomaly, adaptive metrics, and direct action shortcuts)
- [✓] Interactive Policy Calibration Sliders
- [✓] Telemetry CSV Exporters (Events, Traders, Audit)
- [✓] SVG Trust Trajectory Line Chart with Authentic Baseline Envelopes
- [✓] Truthful Analytics & Execution Profiling (Evaluated against ground-truth threat controls; `perf_counter` pipeline timing)
- [✓] Tamper-Evident SHA-256 Audit Verification UI
- [✓] Traders Action Sensitivity & Enforcement Simulator (`POST /api/actions/evaluate`)
- [✓] Operational Population & Enforcement Telemetry Dashboard (Population tiers, enforcement distribution, cluster stats)
- [✓] Unified Risk Incidents Feed Toggle (`/api/risk-events` vs all events)
- [✓] System-Wide Infrastructure Graph & Detected Cluster Cards View Toggle
- [✓] Dynamic Sequence Trace Visualizer (Driven by trader timeline)
- [✓] Dual-Contract Risk Events Grid (Backward-compatible handling of both structured and legacy risk payloads)
- [✓] Interactive Attack Scenario Replay (8 first-class scenarios including ATTACK_SURGE, FLAGSHIP, TRAVEL, FRAUD_RING, TAKEOVER, NORMAL_ACTIVITY, LEVERAGE_SPIKE, HIGH_VALUE with auto-focus trader synchronization)
- [✓] Baseline Topology Entity Hydration & Edge Persistence (Seed primary device, IP, wallet for #7842 and fleet, persisted in SQLite)
- [✓] Multi-Breakpoint Institutional Responsive Design (1440px, 1280px, 1080px, 900px, 768px with touch-scroll tables and adaptive KPI grid)
- [✓] Cross-Screen Operational Integration (Traders → Live Monitor, Relationship Graph, Baseline Reset, Step-Up)
- [✓] Zero Mock/Fake Telemetry Fallbacks (All counters, threats, baseline metrics, and envelopes are strictly data-driven)

---

## 6. Security, Authentication & Infrastructure
- [✓] SQLite WAL Mode Persistent Database (`netra.db`)
- [✓] Transactional Rollback on Database Failure
- [✓] Server-Side Role-Based Authorization (`require_role(...)` enforcement on privileged endpoints)
- [✓] Multi-Role Authentication Suite (`ADMIN`, `RISK_ANALYST`, `INVESTIGATOR`, `VIEWER` verified across all 9 endpoint groups)
- [✓] Typed Frontend API Error Layer (`ApiError` with 401 automatic session retry, 403 permission reporting, and network error handling)
- [✓] Environment-Driven CORS Security (Configurable `ALLOWED_ORIGINS` with secure localhost fallback)
- [✓] Safe Database Schema Migration (Automated column alteration in `init_db()`)
- [✓] JWT Authentication & Server-Side RBAC (HMAC-SHA256 bearer tokens, PBKDF2-SHA256 credential hashing, role-based route enforcement)
- [✓] Deterministic 10-Scenario Generation Engine (All 10 scenarios and institutional aliases producing structured payloads)
- [✓] Automated Single-Event Causal Propagation Integration Test (`backend/test_single_event_propagation.py`)
- [✓] Truthful Empty & Degraded States Across All 10 Console Screens
- [ ] Ingestion API Rate Limiting
- [ ] PostgreSQL Docker Container Connection (Unconnected; SQLite active)
- [ ] Neo4j Docker Container Connection (Unconnected; SQLite active)

---

## 7. Project & Attribution Context

- **Platform**: NETRA — Continuous Trader Trust Intelligence Engine
- **Hackathon Context**: Mochatrade YC P26 Mumbai Hackathon (Target domain: US equity perpetual futures with INR rails)
- **Engineering Team**: Bosch Coders

