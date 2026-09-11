# NETRA Feature Inventory & Status Matrix

> **Legend:**  
> `[x]` = Implemented & Functional  
> `[~]` = Partially Functional / Integration-Ready  
> `[?]` = Simulated / Demo Logic Only  
> `[ ]` = Missing / Not Implemented  
> `[!]` = Broken / Failing Contract  

---

## 1. Core Intelligence & Decision Pipeline
- [x] Event Ingestion REST API (`POST /api/events` and `GET /api/events`)
- [x] Pydantic Schema Validation (15 Event Types)
- [x] Trader Profile Directory (106 Seeded Identities with persistent behavioral profiles)
- [x] Proportional Decision Matrix (`ALLOW`, `MONITOR`, `VERIFY`, `RESTRICT`, `BLOCK`)
- [x] Pre-Commit Policy Simulator (`POST /api/policy/simulate`)
- [x] Step-Up Identity Verification (`POST /api/traders/{id}/step-up`)
- [x] Temporal Sequence Anomaly Engine (Timestamp-aware sequence kill chains in `SequenceEngine` with subsecond ordering)
- [x] Entity Relationship Linkage (Multi-hop set expansion & normalized target entities)
- [x] Explainability Dossier Generator (Contextual action-, policy-, and amount-aware SOP recommendations)
- [x] Organic Continuous Trust Degradation (Organic evidence-based scoring; hardcoded bypass removed)
- [x] Adaptive Rolling Baselines (`BaselineEngine`: mean, stdev, sample count, z-scores, circadian norms)
- [x] Baseline Poisoning Protection (`is_trusted_for_learning` guards preventing unverified attacks from learning)
- [x] Trader Individual Baseline Reset (`POST /api/traders/{id}/baseline/reset`)
- [x] Scenario State Isolation (Clean state purge in `_isolate_scenario_trader` preventing scenario cross-contamination)
- [x] Temporal Sliding Window Engine (`TemporalWindowEngine`: 5m, 15m, 1h, 24h, 7d rolling velocity & burst analysis)
- [x] Operational Action Enforcement Gateway (`ActionEnforcementService` with `POST /api/actions/evaluate` and attached to `ingest`)
- [x] Operational Risk Events Feed (`GET /api/risk-events` filtering by severity, category, trader)
- [~] Action Enforcement Webhooks (Simulated gateway layer; outbound HTTP webhooks integration-ready)
- [x] Machine Learning / Behavioral Anomaly Engine (Unsupervised scikit-learn Isolation Forest with 12D feature vectors, 0-100 normalized score, real graph degree, and poisoning protection)
- [x] Behavioral Anomaly Status & Trader APIs (`GET /api/anomaly/status`, `GET /api/traders/{id}/anomaly`)
- [x] Continuous Trust Recovery Function (Proportional step-up identity restoration with safe baseline promotion)
- [x] UI/Backend Data Consistency (Context-aware decision binding to selected trader)
- [x] Multi-Trader Quick Switcher (Live Monitor switcher supporting all 106 concurrent traders)

---

## 2. Graph & Relationship Intelligence
- [x] Dynamic Graph Link Generation from Events (`graph_links` table with edge deduplication & evidence accumulation)
- [x] Fraud Ring Shared Infrastructure Seeding (Traders #7102–#7105 sharing device, IP, and wallet)
- [x] Interactive SVG Topology Graph Component (With real entity/trader forensic inspection)
- [x] Multi-Hop Entity Relationship Traversal (1-hop, 2-hop, 3-hop BFS with cycle protection and shortest paths)
- [x] Configurable Relationship Strength (Wallet: 0.95, Device: 0.80, IP: 0.45)
- [x] Automated Community / Cluster Detection (Connected components with suspicious cluster identification)
- [x] System-Wide Graph Topology & Multi-Trader Cluster API (`GET /api/graph/system`)
- [x] Structured Graph Risk Signals (`SHARED_INFRASTRUCTURE_CLUSTER`, `SHARED_WALLET_CLUSTER`, `SHARED_DEVICE_CLUSTER`, `COORDINATED_ACTIVITY`)
- [x] Graph Intelligence Deep Traversal API (`GET /api/traders/{id}/graph/intelligence`)
- [?] Topology Graph Auto-Layout (Uses static polar circle trigonometric formulas)
- [ ] Force-Directed Graph Layout Algorithm
- [ ] Real Graph Database Engine (Neo4j driver & Cypher queries unintegrated; SQLite active)

---

## 3. Case Management & Human Investigation
- [x] Automatic Case Generation upon `RESTRICT` Decision
- [x] Manual Case Creation (`POST /api/cases`)
- [x] Case Status Lifecycle (`OPEN`, `INVESTIGATING`, `ESCALATED`, `RESOLVED`, `FALSE_POSITIVE`)
- [x] Timestamped Investigator Notes Log
- [x] Comprehensive Case Dossier Export (`GET /api/cases/{id}/dossier`)
- [x] Interactive Case Forensic Evidence Drawer (`inspectCase` in UI)
- [x] Step-Up Trust Auto-Resolution of Open Cases
- [ ] Case Assignment Routing Rules
- [ ] Multi-Analyst Real-time Collaboration

---

## 4. Audit & Forensic Integrity
- [x] Centralized Operational Audit Log Table (`audit_log`)
- [x] Complete Decision History Logging
- [x] Audit Vault CSV Export (With SHA-256 hash chain lineage)
- [x] Audit Vault Log Viewer in Console (With cryptographic SHA-256 hash link display)
- [x] Cryptographic SHA-256 Hash Chaining (`previous_hash` + deterministic canonical JSON payload)
- [x] Tamper-Evident Chain Verification Endpoint (`GET /api/audit/verify`)
- [x] UI Audit Chain Verification Controls (Interactive verification status badge & alerting)
- [x] Unified Causal Provenance Engine (Deterministic `event_id` ↔ `decision_id` ↔ `audit_id` ↔ `audit_hash` SHA-256 linkage persisted in SQLite and in-memory engine)
- [x] Single Audit Record Verification Endpoint (`GET /api/audit/{audit_id}` with live SHA-256 pre-image recalculation)
- [x] Inline Cryptographic Proof Inspector (Inspect deterministic UTF-8 canonical pre-image, previous hash link, and SHA-256 proof directly in Live Monitor)
- [x] 360-Degree Forensic Deep-Link Engine (Bidirectional navigation across surfaces: Live Event ↔ Exact Decision ↔ Evidence Dossier ↔ Cryptographic Audit Vault ↔ Risk Incident ↔ Case Workbench ↔ Scenario Lab)
- [x] Truthful Event-to-Decision Fallback (Explicitly labels "NO EVENT-SPECIFIC DECISION // TELEMETRY CONFORMS TO BASELINE WITHOUT ACTIVE INTERVENTION" rather than silently displaying an unrelated decision)
- [x] Cryptographic Provenance in Evidence Custody (Authentic SHA-256 block hash, record identifier, verification status, and direct vault jump)
- [x] 9-Stage Grounded Causal Reasoning Pipeline (`01 EVENT → 02 CONTEXT → 03 SIGNALS → 04 BASELINE → 05 TOPOLOGY → 06 TRUST IMPACT → 07 POLICY → 08 ACTION → 09 AUDIT`)
- [ ] Merkle Tree Batch Decision Root Proofs

---

## 5. Console & UI Capabilities
- [x] High-Density Institutional Operations Console (React 19 + TypeScript + Vite)
- [x] Institutional Product Identity Reset (Pure technical engine identity; clean relocation of hackathon/team metadata)
- [x] 9-Stage Continuous Intelligence Loop Indicator (`EVENT → CONTEXT → SIGNALS → BASELINE → TOPOLOGY → TRUST IMPACT → POLICY → ACTION → AUDIT`)
- [x] Truthful Multi-State Telemetry Stream Status (Discriminates `CONNECTED`, `CONNECTING`, `RECONNECTING`, `DISCONNECTED`, `ERROR` with REST sync truthfulness)
- [x] Executive Operational Command Surface (Real-time fleet threat level, ingestion health, and instant operational dispatches)
- [x] Real-time Server-Sent Events (SSE) Telemetry Stream (`/api/stream`)
- [x] Interactive Command Palette (`Ctrl+K`)
- [x] Web Audio API Acoustic Telemetry Synthesizer (Zero asset dependencies)
- [x] Slide-Out Evidence Dossier Drawer with 3 Tabbed Views
- [x] Interactive Policy Calibration Sliders
- [x] Telemetry CSV Exporters (Events, Traders, Audit)
- [x] SVG Trust Trajectory Line Chart
- [x] Truthful Analytics & Execution Profiling (Evaluated against ground-truth threat controls; `perf_counter` pipeline timing)
- [x] Tamper-Evident SHA-256 Audit Verification UI
- [x] Traders Action Sensitivity & Enforcement Simulator (`POST /api/actions/evaluate`)
- [x] Operational Population & Enforcement Telemetry Dashboard (Population tiers, enforcement distribution, cluster stats)
- [x] Unified Risk Incidents Feed Toggle (`/api/risk-events` vs all events)
- [x] System-Wide Infrastructure Graph & Detected Cluster Cards View Toggle
- [x] Dynamic Sequence Trace Visualizer (Driven by trader timeline)
- [x] Dual-Contract Risk Events Grid (Backward-compatible handling of both structured and legacy risk payloads)
- [x] Interactive Attack Scenario Replay (8 first-class scenarios including ATTACK_SURGE, FLAGSHIP, TRAVEL, FRAUD_RING, TAKEOVER, NORMAL_ACTIVITY, LEVERAGE_SPIKE, HIGH_VALUE with auto-focus trader synchronization)
- [x] Baseline Topology Entity Hydration & Edge Persistence (Seed primary device, IP, wallet for #7842 and fleet, persisted in SQLite)
- [x] Multi-Breakpoint Institutional Responsive Design (1440px, 1280px, 1080px, 900px, 768px with touch-scroll tables and adaptive KPI grid)

---

## 6. Security, Authentication & Infrastructure
- [x] SQLite WAL Mode Persistent Database (`netra.db`)
- [x] Transactional Rollback on Database Failure
- [x] Server-Side Role-Based Authorization (`require_role(...)` enforcement on privileged endpoints)
- [x] Multi-Role Authentication Suite (`ADMIN`, `RISK_ANALYST`, `INVESTIGATOR`, `VIEWER` verified across all 9 endpoint groups)
- [x] Typed Frontend API Error Layer (`ApiError` with 401 automatic session retry, 403 permission reporting, and network error handling)
- [x] Environment-Driven CORS Security (Configurable `ALLOWED_ORIGINS` with secure localhost fallback)
- [x] Safe Database Schema Migration (Automated column alteration in `init_db()`)
- [x] JWT Authentication & Server-Side RBAC (HMAC-SHA256 bearer tokens, PBKDF2-SHA256 credential hashing, role-based route enforcement)
- [x] Deterministic 10-Scenario Generation Engine (All 10 scenarios and institutional aliases producing structured payloads)
- [x] Automated Single-Event Causal Propagation Integration Test (`backend/test_single_event_propagation.py`)
- [x] Truthful Empty & Degraded States Across All 10 Console Screens
- [ ] Ingestion API Rate Limiting
- [ ] PostgreSQL Docker Container Connection (Unconnected; SQLite active)
- [ ] Neo4j Docker Container Connection (Unconnected; SQLite active)

---

## 7. Project & Attribution Context

- **Platform**: NETRA — Continuous Trader Trust Intelligence Engine
- **Hackathon Context**: Mochatrade YC P26 Mumbai Hackathon (Target domain: US equity perpetual futures with INR rails)
- **Engineering Team**: Bosch Coders

