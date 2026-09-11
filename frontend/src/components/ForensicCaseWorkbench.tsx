import React, { useState, useMemo } from 'react'
import { Case, Trader, Decision, Event, AuditRecord, UserRole } from '../types'

interface ForensicCaseWorkbenchProps {
  cases: Case[]
  traders: Trader[]
  selectedTrader?: Trader | null
  decisions: Decision[]
  events: Event[]
  auditRecords: AuditRecord[]
  userRole: UserRole
  initialCaseId?: string
  onUpdateCase: (caseId: string, status: string, note?: string) => Promise<void>
  onCreateCase: () => Promise<void>
  onAddCaseNote: (caseId: string, note: string) => Promise<void>
  onExportDossier: (caseId: string) => Promise<void>
  onStepUpVerify: (traderId: string) => Promise<void>
  onResetBaseline: (traderId: string) => Promise<void>
  onInspectTrader: (trader: Trader) => void
  onInspectEvidence: (decision?: Decision, event?: Event, trader?: Trader) => void
  onNavigateToAudit?: (auditId?: string, subjectId?: string) => void
  onNavigateToEvent?: (eventId: string, traderId: string) => void
}

export const ForensicCaseWorkbench: React.FC<ForensicCaseWorkbenchProps> = ({
  cases,
  traders,
  selectedTrader,
  decisions,
  events,
  auditRecords,
  userRole,
  initialCaseId,
  onUpdateCase,
  onCreateCase,
  onAddCaseNote,
  onExportDossier,
  onStepUpVerify,
  onResetBaseline,
  onInspectTrader,
  onInspectEvidence,
  onNavigateToAudit,
  onNavigateToEvent,
}) => {
  const [selectedCaseId, setSelectedCaseId] = useState<string>(() => {
    if (initialCaseId && cases.some(c => c.case_id === initialCaseId)) return initialCaseId
    return cases.length > 0 ? cases[0].case_id : ''
  })

  React.useEffect(() => {
    if (initialCaseId && cases.some(c => c.case_id === initialCaseId)) {
      setSelectedCaseId(initialCaseId)
    }
  }, [initialCaseId, cases])
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [severityFilter, setSeverityFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [noteInput, setNoteInput] = useState<string>('')
  const [submittingNote, setSubmittingNote] = useState<boolean>(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  // Filtered cases
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
      if (severityFilter !== 'ALL' && c.severity !== severityFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchId = c.case_id.toLowerCase().includes(q)
        const matchTrader = c.trader_id.toLowerCase().includes(q)
        const matchReason = (c.reason || '').toLowerCase().includes(q)
        if (!matchId && !matchTrader && !matchReason) return false
      }
      return true
    })
  }, [cases, statusFilter, severityFilter, searchQuery])

  // Active case object
  const activeCase = useMemo(() => {
    return cases.find(c => c.case_id === selectedCaseId) || filteredCases[0] || cases[0] || null
  }, [cases, selectedCaseId, filteredCases])

  // Matched trader, decision, event, and audit
  const activeTrader = useMemo(() => {
    if (!activeCase) return selectedTrader
    return traders.find(t => t.trader_id === activeCase.trader_id) || selectedTrader
  }, [activeCase, traders, selectedTrader])

  const activeDecision = useMemo(() => {
    if (!activeCase) return null
    return decisions.find(d => d.trader_id === activeCase.trader_id) || null
  }, [activeCase, decisions])

  const activeEvent = useMemo(() => {
    if (!activeCase) return null
    return events.find(e => e.trader_id === activeCase.trader_id) || null
  }, [activeCase, events])

  const relatedAudits = useMemo(() => {
    if (!activeCase) return []
    return auditRecords.filter(
      a => a.subject === activeCase.trader_id || a.details?.case_id === activeCase.case_id
    ).slice(0, 5)
  }, [activeCase, auditRecords])

  const handleAddNote = async () => {
    if (!activeCase || !noteInput.trim() || submittingNote) return
    try {
      setSubmittingNote(true)
      await onAddCaseNote(activeCase.case_id, noteInput.trim())
      setNoteInput('')
      setActionNotice('INVESTIGATION NOTE RECORDED IN CASE FILE.')
      setTimeout(() => setActionNotice(null), 3500)
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!activeCase) return
    await onUpdateCase(activeCase.case_id, newStatus)
    setActionNotice(`CASE ${activeCase.case_id} STATUS UPDATED TO ${newStatus}.`)
    setTimeout(() => setActionNotice(null), 3500)
  }

  const handleStepUp = async () => {
    if (!activeCase) return
    await onStepUpVerify(activeCase.trader_id)
    setActionNotice(`STEP-UP BIOMETRIC / MFA CHALLENGE DISPATCHED TO TRADER #${activeCase.trader_id}.`)
    setTimeout(() => setActionNotice(null), 4000)
  }

  const handleResetBaseline = async () => {
    if (!activeCase) return
    await onResetBaseline(activeCase.trader_id)
    setActionNotice(`BEHAVIORAL BASELINE RESET FOR TRADER #${activeCase.trader_id}. RE-BOOTSTRAPPING INITIALIZED.`)
    setTimeout(() => setActionNotice(null), 4000)
  }

  // Baseline extraction
  const baseline = activeTrader?.baseline
  const normDeposit = baseline?.deposit_amount ? `$${baseline.deposit_amount.toLocaleString()}` : '—'
  const normLeverage = baseline?.leverage ? `${baseline.leverage}x` : '—'
  const normCountries = baseline?.countries?.length ? baseline.countries.join(', ') : '—'
  const normDevices = baseline?.known_devices?.length ? `${baseline.known_devices.length} registered` : '1 registered'
  const normHours = baseline?.normal_login_hours?.length
    ? `UTC ${String(Math.min(...baseline.normal_login_hours)).padStart(2, '0')}:00 – ${String(Math.max(...baseline.normal_login_hours)).padStart(2, '0')}:00`
    : 'UTC 08:00 – 20:00'

  return (
    <div className="forensic-workbench-container">
      {/* Top Banner & Telemetry bar */}
      <div className="workbench-top-bar">
        <div className="workbench-brand">
          <span className="live-pulse-dot" style={{ background: 'var(--accent-amber)' }} />
          <div>
            <div className="workbench-title">CASES & FORENSIC TRIAGE WORKBENCH</div>
            <div className="workbench-subtitle">OPERATOR REMEDIATION // INVESTIGATOR EVIDENCE COCKPIT</div>
          </div>
        </div>

        <div className="workbench-metrics">
          <div className="workbench-metric-item">
            <span className="metric-label">TOTAL CASES</span>
            <span className="metric-val mono">{cases.length}</span>
          </div>
          <div className="workbench-metric-item">
            <span className="metric-label">OPEN TRIAGE</span>
            <span className="metric-val mono" style={{ color: 'var(--accent-amber)' }}>
              {cases.filter(c => c.status === 'OPEN' || c.status === 'INVESTIGATING').length}
            </span>
          </div>
          <div className="workbench-metric-item">
            <span className="metric-label">ESCALATED</span>
            <span className="metric-val mono" style={{ color: 'var(--accent-crimson)' }}>
              {cases.filter(c => c.status === 'ESCALATED').length}
            </span>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 10, padding: '4px 10px' }} onClick={onCreateCase}>
            + CREATE CASE FOR #{selectedTrader?.trader_id || '7842'}
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="workbench-notice-banner">
          <span className="mono" style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>SYSTEM ACK:</span>
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="grid-12" style={{ marginTop: 12 }}>
        {/* Left Column: Master Case Queue */}
        <div className="col-4">
          <div className="panel" style={{ height: 'calc(100vh - 210px)', display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header" style={{ padding: '8px 12px' }}>
              <h3>Investigation Queue ({filteredCases.length})</h3>
              <span className="panel-meta">REAL-TIME</span>
            </div>

            {/* Filter controls */}
            <div className="case-queue-controls">
              <input
                type="text"
                placeholder="Filter by ID, Trader, Reason..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="case-search-input"
              />

              <div className="case-filter-pills">
                {['ALL', 'OPEN', 'INVESTIGATING', 'ESCALATED', 'RESOLVED'].map(st => (
                  <button
                    key={st}
                    className={`case-pill-btn ${statusFilter === st ? 'active' : ''}`}
                    onClick={() => setStatusFilter(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Case List */}
            <div className="case-list-scroll">
              {filteredCases.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  {cases.length === 0
                    ? 'NO ACTIVE FORENSIC CASES IN QUEUE — CASES ARE AUTOMATICALLY ESCALATED ON CRITICAL/RESTRICTED TRUST DEVIATIONS OR INITIATED VIA "INITIALIZE CASE"'
                    : 'NO FORENSIC CASES MATCHING ACTIVE FILTER CRITERIA'}
                </div>
              ) : (
                filteredCases.map(c => {
                  const isSelected = activeCase?.case_id === c.case_id
                  const isCritical = c.severity === 'CRITICAL' || c.severity === 'HIGH'
                  return (
                    <div
                      key={c.case_id}
                      className={`case-queue-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedCaseId(c.case_id)}
                    >
                      <div className="case-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className="status-dot"
                            style={{
                              background:
                                c.status === 'RESOLVED'
                                  ? 'var(--accent-emerald)'
                                  : isCritical
                                  ? 'var(--accent-crimson)'
                                  : 'var(--accent-amber)',
                            }}
                          />
                          <span className="case-card-id mono">{c.case_id}</span>
                        </div>
                        <span className={`status-pill ${c.status.toLowerCase()}`}>{c.status}</span>
                      </div>

                      <div className="case-card-meta">
                        <span className="mono" style={{ color: 'var(--accent-cyan)' }}>
                          TRADER #{c.trader_id}
                        </span>
                        <span className={`priority-pill priority-${c.severity.toLowerCase()}`}>
                          {c.severity}
                        </span>
                        <span className="mono" style={{ color: 'var(--text-muted)' }}>
                          TRUST: {c.trust_score ?? 50}
                        </span>
                      </div>

                      <div className="case-card-reason">
                        {c.reason || 'Automated contextual risk anomaly detected.'}
                      </div>

                      <div className="case-card-footer">
                        <span>{new Date(c.created_at).toLocaleTimeString()}</span>
                        <span>{c.notes?.length || 0} notes</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Active Forensic Case Cockpit */}
        <div className="col-8">
          {activeCase ? (
            <div className="panel" style={{ height: 'calc(100vh - 210px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: 14 }}>
              {/* Cockpit Header Card */}
              <div className="cockpit-header-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h2 className="mono" style={{ margin: 0, fontSize: 16, color: '#fff' }}>
                        {activeCase.case_id}
                      </h2>
                      <span className={`priority-pill priority-${activeCase.severity.toLowerCase()}`}>
                        {activeCase.severity}
                      </span>
                      <span className={`status-pill ${activeCase.status.toLowerCase()}`}>
                        {activeCase.status}
                      </span>
                    </div>
                    <div className="cockpit-submeta">
                      <span>SUBJECT: <strong className="mono" style={{ color: 'var(--accent-cyan)' }}>TRADER #{activeCase.trader_id}</strong></span>
                      <span>•</span>
                      <span>ASSIGNED: <strong className="mono">{activeCase.assigned_to || 'ACTOR-RISK-01'}</strong></span>
                      <span>•</span>
                      <span>OPENED: {new Date(activeCase.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {/* Status dropdown */}
                    <select
                      value={activeCase.status}
                      onChange={e => handleStatusChange(e.target.value)}
                      className="case-status-select"
                    >
                      <option value="OPEN">STATUS: OPEN</option>
                      <option value="INVESTIGATING">STATUS: INVESTIGATING</option>
                      <option value="ESCALATED">STATUS: ESCALATED</option>
                      <option value="RESOLVED">STATUS: RESOLVED</option>
                      <option value="FALSE_POSITIVE">STATUS: FALSE_POSITIVE</option>
                    </select>

                    {activeEvent && onNavigateToEvent && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 9, padding: '4px 8px', color: 'var(--accent-amber)' }}
                        onClick={() => onNavigateToEvent(activeEvent.event_id, activeCase.trader_id)}
                        title="View trigger event in Live Telemetry Monitor"
                      >
                        VIEW EVENT ⚡
                      </button>
                    )}
                    {onNavigateToAudit && (activeDecision?.audit_id || activeEvent?.audit_id || relatedAudits[0]?.audit_id) && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 9, padding: '4px 8px', color: 'var(--accent-cyan)' }}
                        onClick={() => onNavigateToAudit(activeDecision?.audit_id || activeEvent?.audit_id || relatedAudits[0]?.audit_id, activeCase.trader_id)}
                        title="Inspect cryptographic proof in Audit Vault"
                      >
                        AUDIT VAULT 🔍
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 9, padding: '4px 8px' }}
                      onClick={() => onExportDossier(activeCase.case_id)}
                      title="Download verifiable cryptographic JSON dossier"
                    >
                      EXPORT DOSSIER
                    </button>
                    {activeTrader && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 9, padding: '4px 8px' }}
                        onClick={() => onInspectTrader(activeTrader)}
                      >
                        TRADER PROFILE
                      </button>
                    )}
                  </div>
                </div>

                {/* Incident Cause Callout */}
                <div className="incident-callout-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="incident-callout-label">INCIDENT TRIGGER &amp; ROOT CAUSE</div>
                    {activeEvent?.event_id && (
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                        TRIGGER EVENT: <b style={{ color: '#fff' }}>{activeEvent.event_id}</b>
                      </span>
                    )}
                  </div>
                  <div className="incident-callout-text">{activeCase.reason}</div>
                  {activeDecision && (
                    <div className="incident-decision-tag">
                      <span>POLICY ENFORCEMENT: <strong>{activeDecision.decision}</strong></span>
                      <span style={{ margin: '0 8px' }}>|</span>
                      <span>CURRENT TRUST: <strong className="mono" style={{ color: activeDecision.trust_score < 40 ? 'var(--accent-crimson)' : 'var(--accent-amber)' }}>{activeDecision.trust_score} / 100</strong></span>
                      <span style={{ margin: '0 8px' }}>|</span>
                      <span>RULES TRIGGERED: {activeDecision.triggered_rules?.join(', ') || 'N/A'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Baseline vs. Disputed Comparator */}
              <div className="baseline-comparator-card">
                <div className="comparator-title">
                  <span>FORENSIC DELTA: INDIVIDUAL BASELINE VS. DISPUTED EVENT</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    PROFILE ID: TRADER-{activeCase.trader_id}
                  </span>
                </div>

                <div className="grid-12" style={{ marginTop: 8 }}>
                  {/* Left: Normal Baseline */}
                  <div className="col-6">
                    <div className="baseline-side-box baseline-normal">
                      <div className="side-box-head">
                        <span className="mono" style={{ color: 'var(--accent-emerald)' }}>✓ ESTABLISHED BASELINE NORMS</span>
                        <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>HISTORICAL EMA</span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">TYPICAL DEPOSIT:</span>
                        <span className="delta-value mono">{normDeposit}</span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">MAX LEVERAGE NORM:</span>
                        <span className="delta-value mono">{normLeverage}</span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">KNOWN GEOGRAPHIES:</span>
                        <span className="delta-value mono">{normCountries}</span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">HARDWARE FOOTPRINT:</span>
                        <span className="delta-value mono">{normDevices}</span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">NORMAL HOURS:</span>
                        <span className="delta-value mono">{normHours}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Disputed Event */}
                  <div className="col-6">
                    <div className="baseline-side-box baseline-disputed">
                      <div className="side-box-head">
                        <span className="mono" style={{ color: 'var(--accent-crimson)' }}>⚠ DISPUTED INCIDENT METRICS</span>
                        <span className="mono" style={{ fontSize: 9, color: 'var(--accent-crimson)' }}>ANOMALOUS DELTA</span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">EVENT TYPE:</span>
                        <span className="delta-value mono" style={{ color: '#fff' }}>
                          {activeEvent?.event_type || activeCase?.reason?.split(' ')[0] || 'SECURITY_INCIDENT'}
                        </span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">AMOUNT:</span>
                        <span className="delta-value mono" style={{ color: activeEvent?.amount ? 'var(--accent-crimson)' : 'var(--text-secondary)', fontWeight: activeEvent?.amount ? 700 : 400 }}>
                          {activeEvent?.amount ? `$${activeEvent.amount.toLocaleString()} (DEVIATION)` : 'N/A (NON-MONETARY)'}
                        </span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">LEVERAGE:</span>
                        <span className="delta-value mono" style={{ color: activeEvent?.leverage ? 'var(--accent-crimson)' : 'var(--text-secondary)' }}>
                          {activeEvent?.leverage ? `${activeEvent.leverage}x` : 'STANDARD'}
                        </span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">IP / LOCATION:</span>
                        <span className="delta-value mono">
                          {activeEvent?.ip_address ? `${activeEvent.ip_address} (${activeEvent.city ? `${activeEvent.city}, ` : ''}${activeEvent.country || ''}${activeEvent.network_type ? ` ${activeEvent.network_type.toUpperCase()}` : ''})` : 'ORIGIN IP UNMODIFIED'}
                        </span>
                      </div>
                      <div className="delta-row">
                        <span className="delta-label">HARDWARE / DEVICE:</span>
                        <span className="delta-value mono" style={{ color: activeEvent?.device_id ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
                          {activeEvent?.device_id || 'KNOWN REGISTERED HARDWARE'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Operator Remediation Action Bar */}
              <div className="remediation-action-bar">
                <div className="remediation-title">
                  <span>DIRECT OPERATOR REMEDIATIONS & POLICY CONTROLS</span>
                  <span className="panel-meta">ROLE: {userRole}</span>
                </div>

                <div className="remediation-buttons">
                  <button
                    className="btn btn-warning"
                    style={{ fontSize: 10, padding: '6px 12px' }}
                    onClick={handleStepUp}
                    title="Prompt trader for 2FA / Biometric verification without blanket account suspension"
                  >
                    STEP-UP 2FA CHALLENGE
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 10, padding: '6px 12px' }}
                    onClick={handleResetBaseline}
                    title="Reset behavioral baseline profile if account was recovered from legitimate travel"
                  >
                    RESET BEHAVIORAL BASELINE
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 10, padding: '6px 12px', borderColor: 'var(--accent-crimson)' }}
                    onClick={() => handleStatusChange('ESCALATED')}
                  >
                    ESCALATE TO SENIOR RISK
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 10, padding: '6px 12px', borderColor: 'var(--accent-emerald)' }}
                    onClick={() => handleStatusChange('RESOLVED')}
                  >
                    RESOLVE CASE
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 10, padding: '6px 12px' }}
                    onClick={() => handleStatusChange('FALSE_POSITIVE')}
                  >
                    MARK FALSE POSITIVE
                  </button>

                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 10, padding: '6px 12px' }}
                    onClick={() => onInspectEvidence(activeDecision || undefined, activeEvent || undefined, activeTrader || undefined)}
                  >
                    OPEN EVIDENCE CHAIN
                  </button>

                  {activeEvent?.event_id && onNavigateToEvent && (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '6px 12px', color: 'var(--accent-cyan)' }}
                      onClick={() => onNavigateToEvent(activeEvent.event_id, activeCase.trader_id)}
                      title="Navigate directly to this event in Live Telemetry Monitor"
                    >
                      LOCATE IN LIVE TELEMETRY →
                    </button>
                  )}
                </div>
              </div>

              {/* Split: Notes Stream & Cryptographic Audit Seal */}
              <div className="grid-12">
                {/* Notes Stream */}
                <div className="col-7">
                  <div className="case-notes-panel">
                    <div className="notes-panel-header">
                      <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>
                        INVESTIGATION TIMELINE & ANALYST LOG ({activeCase.notes?.length || 0})
                      </span>
                      <span className="panel-meta">IMMUTABLE CHRONOLOGY</span>
                    </div>

                    <div className="notes-list-box">
                      {(!activeCase.notes || activeCase.notes.length === 0) ? (
                        <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>
                          No investigator notes recorded yet. Add triage findings below.
                        </div>
                      ) : (
                        activeCase.notes.map((n, idx) => (
                          <div key={idx} className="case-note-item">
                            <div className="note-item-meta">
                              <span className="note-author mono">{n.author}</span>
                              <span className="note-time">{new Date(n.timestamp).toLocaleString()}</span>
                            </div>
                            <div className="note-item-text">{n.text}</div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="note-input-row">
                      <input
                        type="text"
                        placeholder="Add timestamped investigator triage note..."
                        value={noteInput}
                        onChange={e => setNoteInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddNote()
                        }}
                        className="note-input-field"
                      />
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 10, padding: '6px 12px' }}
                        onClick={handleAddNote}
                        disabled={submittingNote || !noteInput.trim()}
                      >
                        {submittingNote ? 'SAVING...' : 'SAVE NOTE'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cryptographic Audit Anchor */}
                <div className="col-5">
                  <div className="audit-anchor-panel">
                    <div className="audit-anchor-header">
                      <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-cyan)' }}>
                        SHA-256 AUDIT VAULT ANCHOR
                      </span>
                      {onNavigateToAudit && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 8, padding: '2px 6px' }}
                          onClick={() => onNavigateToAudit(undefined, activeCase.trader_id)}
                        >
                          VIEW VAULT →
                        </button>
                      )}
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
                      Every action taken on this case is cryptographically hashed and chained into the SQLite WAL tamper-resistant ledger.
                    </div>

                    <div className="audit-anchor-list">
                      {relatedAudits.length === 0 ? (
                        <div style={{ padding: 10, fontSize: 10, color: 'var(--text-dim)' }}>
                          No audit ledger entries recorded for Trader #{activeCase.trader_id} yet.
                        </div>
                      ) : (
                        relatedAudits.map(item => (
                          <div
                            key={item.audit_id}
                            className="audit-anchor-item"
                            style={{ cursor: onNavigateToAudit ? 'pointer' : 'default' }}
                            onClick={() => onNavigateToAudit?.(item.audit_id, activeCase.trader_id)}
                            title="Click to inspect this exact record in Cryptographic Audit Vault"
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span className="mono" style={{ color: 'var(--accent-amber)', fontSize: 9 }}>
                                {item.event}
                              </span>
                              <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                                {new Date(item.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="mono" style={{ fontSize: 9, color: 'var(--accent-cyan)', marginTop: 2 }}>
                              HASH: {item.current_hash ? `${item.current_hash.slice(0, 10)}...${item.current_hash.slice(-8)}` : 'GENESIS'}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-primary)', marginTop: 2 }}>
                              {item.reason}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel" style={{ height: 'calc(100vh - 210px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <p>No active case selected.</p>
                <button className="btn btn-primary" onClick={onCreateCase}>
                  + CREATE NEW CASE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
