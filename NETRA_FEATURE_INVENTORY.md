# NETRA Feature Inventory & Status Matrix

> **Legend:**  
> `[x]` = Implemented & Functional  
> `[~]` = Partially Functional  
> `[?]` = Simulated / Demo Logic Only  
> `[ ]` = Missing / Not Implemented  
> `[!]` = Broken / Failing Contract  

---

## 1. Core Intelligence & Decision Pipeline
- [x] Event Ingestion REST API (`POST /api/events`)
- [x] Pydantic Schema Validation (15 Event Types)
- [x] Trader Profile Directory (105 Seeded Identities)
- [x] Proportional Decision Matrix (`ALLOW`, `MONITOR`, `VERIFY`, `RESTRICT`)
- [x] Pre-Commit Policy Simulator (`POST /api/policy/simulate`)
- [x] Step-Up Identity Verification (`POST /api/traders/{id}/step-up`)
- [~] Temporal Sequence Anomaly Engine (Only evaluates 1 hardcoded sequence)
- [~] Entity Relationship Linkage (Multi-hop set expansion)
- [~] Explainability Dossier Generator (Deterministic rule label formatting)
- [?] Flagship Continuous Trust Degradation (Hardcoded score deduction constants)
- [?] Trader Baselines (Static JSON dictionaries; non-adaptive)
- [?] Machine Learning / AI Engine (Zero ML/LLM models; pure rule heuristics)
- [ ] Adaptive Rolling Baselines (Continuous mean/variance/percentiles)
- [ ] Statistical Anomaly Detection (Z-scores, Isolation Forest, clustering)
- [ ] Continuous Time-Decay & Recovery Function
- [ ] Action Enforcement Webhooks (Outbound trade venue callbacks)
- [!] Multi-Sequence Pattern Evaluator (`/api/sequences` defined but not executed)

---

## 2. Graph & Relationship Intelligence
- [x] Dynamic Graph Link Generation from Events (`graph_links` table)
- [x] Fraud Ring Shared Infrastructure Seeding (Traders #7102–#7105)
- [x] Interactive SVG Topology Graph Component
- [~] Multi-Hop Entity Relationship Traversal (2-hop Python BFS)
- [?] Topology Graph Auto-Layout (Uses static polar circle trigonometric formulas)
- [ ] Force-Directed Graph Layout Algorithm
- [ ] Real Graph Database Engine (Neo4j driver & Cypher queries)
- [ ] Automated Community / Cluster Detection

---

## 3. Case Management & Human Investigation
- [x] Automatic Case Generation upon `RESTRICT` Decision
- [x] Manual Case Creation (`POST /api/cases`)
- [x] Case Status Lifecycle (`OPEN`, `INVESTIGATING`, `ESCALATED`, `RESOLVED`, `FALSE_POSITIVE`)
- [x] Timestamped Investigator Notes Log
- [x] Comprehensive Case Dossier Export (`GET /api/cases/{id}/dossier`)
- [x] Step-Up Trust Auto-Resolution of Open Cases
- [ ] Case Assignment Routing Rules
- [ ] Multi-Analyst Real-time Collaboration

---

## 4. Audit & Forensic Integrity
- [x] Centralized Operational Audit Log Table (`audit_log`)
- [x] Complete Decision History Logging
- [x] Audit Vault CSV Export
- [~] Audit Vault Log Viewer in Console
- [?] Immutable Audit Vault (Plain mutable SQLite table; no cryptographic proofs)
- [ ] Cryptographic SHA-256 Hash Chaining (`prev_hash`)
- [ ] Merkle Tree Decision Proofs
- [ ] Tamper Detection Verification Endpoint

---

## 5. Console & UI Capabilities
- [x] High-Density Institutional Operations Console (React 19 + TypeScript + Vite)
- [x] Real-time Server-Sent Events (SSE) Telemetry Stream (`/api/stream`)
- [x] Interactive Command Palette (`Ctrl+K`)
- [x] Web Audio API Acoustic Telemetry Synthesizer (Zero asset dependencies)
- [x] Slide-Out Evidence Dossier Drawer with 3 Tabbed Views
- [x] Interactive Policy Calibration Sliders
- [x] Telemetry CSV Exporters (Events, Traders, Audit)
- [~] SVG Trust Trajectory Line Chart
- [?] Overview Sequence Breakdown Cards (Hardcoded titles & scores in JSX)
- [?] Analytics Precision & Recall Display (Hardcoded `94.2%` & `91.5%` strings)

---

## 6. Security, Authentication & Infrastructure
- [x] SQLite WAL Mode Persistent Database (`netra.db`)
- [x] Transactional Rollback on Database Failure
- [?] Role-Based Access Control (Simulated via client-supplied `X-Actor-Role` header)
- [ ] Real Authentication (JWT, Passwords, Session Cookies, OAuth)
- [ ] Ingestion API Rate Limiting
- [ ] Strict CORS Configuration
- [ ] Database Schema Migration Tooling (Alembic)
- [!] PostgreSQL Docker Container Connection (Unconnected; missing DB URL & driver)
- [!] Neo4j Docker Container Connection (Unconnected; zero code integration)
