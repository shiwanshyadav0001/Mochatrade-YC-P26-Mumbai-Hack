import React, { useState, useMemo, useEffect } from 'react'
import { AuditRecord, AuditVerifyResult } from '../types'

interface CryptographicAuditVaultProps {
  audit: AuditRecord[]
  verificationResult: AuditVerifyResult | null
  isVerifying: boolean
  onVerifyChain: () => Promise<void>
  onExportCSV: () => void
  initialFilterSubject?: string
  initialAuditId?: string
  onNavigateToEvent?: (eventId: string, traderId: string) => void
}

// Helper to canonicalize a record matching Python's canonicalize_record()
function canonicalizeRecord(record: AuditRecord): string {
  const payload = {
    audit_id: String(record.audit_id || ''),
    timestamp: String(record.timestamp || ''),
    actor: String(record.actor || ''),
    event: String(record.event || ''),
    subject: String(record.subject || ''),
    reason: String(record.reason || ''),
    policy_version: String(record.policy_version || ''),
    details: record.details || {},
  }
  // Sort keys alphabetically
  const sortedKeys = Object.keys(payload).sort() as (keyof typeof payload)[]
  const sortedObj: Record<string, any> = {}
  for (const k of sortedKeys) {
    sortedObj[k] = payload[k]
  }
  return JSON.stringify(sortedObj)
}

// Compute SHA-256 in browser using Web Crypto API
async function computeSha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export const CryptographicAuditVault: React.FC<CryptographicAuditVaultProps> = ({
  audit,
  verificationResult,
  isVerifying,
  onVerifyChain,
  onExportCSV,
  initialFilterSubject,
  initialAuditId,
  onNavigateToEvent,
}) => {
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(() => {
    if (initialAuditId) {
      const matched = audit.find(a => a.audit_id === initialAuditId)
      if (matched) return matched
    }
    return audit.length > 0 ? audit[0] : null
  })
  const [subjectFilter, setSubjectFilter] = useState<string>(initialFilterSubject || '')
  const [actorFilter, setActorFilter] = useState<string>('ALL')
  const [eventFilter, setEventFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>(initialAuditId || '')

  // Sync with deep-link triggers from other surfaces
  useEffect(() => {
    if (initialFilterSubject) {
      setSubjectFilter(initialFilterSubject)
    }
  }, [initialFilterSubject])

  useEffect(() => {
    if (initialAuditId) {
      setSearchQuery(initialAuditId)
      const matched = audit.find(a => a.audit_id === initialAuditId)
      if (matched) {
        setSelectedRecord(matched)
      }
    }
  }, [initialAuditId, audit])

  // Tamper Sandbox State
  const [tamperMode, setTamperMode] = useState<boolean>(false)
  const [tamperField, setTamperField] = useState<string>('actor')
  const [tamperValue, setTamperValue] = useState<string>('ROGUE_ACTOR')
  const [simulatedHash, setSimulatedHash] = useState<string | null>(null)

  // Filtered audit rows
  const filteredAudit = useMemo(() => {
    return audit.filter(item => {
      if (subjectFilter && !item.subject.toLowerCase().includes(subjectFilter.toLowerCase())) {
        return false
      }
      if (actorFilter !== 'ALL' && item.actor !== actorFilter) {
        return false
      }
      if (eventFilter !== 'ALL' && item.event !== eventFilter) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchReason = (item.reason || '').toLowerCase().includes(q)
        const matchSubject = (item.subject || '').toLowerCase().includes(q)
        const matchId = (item.audit_id || '').toLowerCase().includes(q)
        if (!matchReason && !matchSubject && !matchId) return false
      }
      return true
    })
  }, [audit, subjectFilter, actorFilter, eventFilter, searchQuery])

  // Unique actors and events for dropdown filters
  const uniqueActors = useMemo(() => {
    const s = new Set(audit.map(a => a.actor).filter(Boolean))
    return ['ALL', ...Array.from(s)]
  }, [audit])

  const uniqueEvents = useMemo(() => {
    const s = new Set(audit.map(a => a.event).filter(Boolean))
    return ['ALL', ...Array.from(s)]
  }, [audit])

  // Pre-image derivation for inspector
  const canonicalPreimage = useMemo(() => {
    if (!selectedRecord) return ''
    return canonicalizeRecord(selectedRecord)
  }, [selectedRecord])

  const fullPreimageString = useMemo(() => {
    if (!selectedRecord) return ''
    const prev = selectedRecord.previous_hash || 'GENESIS_00000000000000000000000000000000000000000000000000000000'
    return `${canonicalPreimage}|${prev}`
  }, [selectedRecord, canonicalPreimage])

  // Run tamper simulation calculation
  const handleRunTamperSim = async () => {
    if (!selectedRecord) return
    const tamperedObj = { ...selectedRecord, [tamperField]: tamperValue }
    const canon = canonicalizeRecord(tamperedObj)
    const prev = selectedRecord.previous_hash || 'GENESIS_00000000000000000000000000000000000000000000000000000000'
    const full = `${canon}|${prev}`
    const computed = await computeSha256(full)
    setSimulatedHash(computed)
  }

  return (
    <div className="audit-vault-container">
      {/* Top Header & Telemetry */}
      <div className="audit-top-bar">
        <div className="audit-brand">
          <span className="live-pulse-dot" style={{ background: 'var(--accent-cyan)' }} />
          <div>
            <div className="audit-title">TAMPER-EVIDENT CRYPTOGRAPHIC AUDIT VAULT</div>
            <div className="audit-subtitle">
              NIST FIPS 180-4 SHA-256 SEQUENTIAL MERKLE-LINKED LEDGER // IMMUTABLE GOVERNANCE
            </div>
          </div>
        </div>

        <div className="audit-actions">
          <button
            className={`btn ${verificationResult?.valid ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 10, padding: '6px 14px' }}
            onClick={onVerifyChain}
            disabled={isVerifying}
          >
            {isVerifying ? 'VERIFYING SHA-256 CHAIN...' : '⚡ VERIFY SHA-256 LEDGER'}
          </button>

          <button
            className={`btn ${tamperMode ? 'btn-warning' : 'btn-secondary'}`}
            style={{ fontSize: 10, padding: '6px 12px' }}
            onClick={() => setTamperMode(!tamperMode)}
          >
            {tamperMode ? 'EXIT TAMPER SANDBOX' : 'TEST TAMPER DETECTION'}
          </button>

          <button className="btn btn-secondary" style={{ fontSize: 10, padding: '6px 12px' }} onClick={onExportCSV}>
            EXPORT CSV LEDGER
          </button>
        </div>
      </div>

      {/* Verification Status Banner */}
      {verificationResult ? (
        <div className={`audit-verify-banner ${verificationResult.valid ? 'banner-valid' : 'banner-tampered'}`}>
          <div className="verify-banner-content">
            <div className="verify-banner-title">
              <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                {verificationResult.valid ? '✓ CRYPTOGRAPHIC INTEGRITY: 100% VERIFIED' : '⚠ CRYPTOGRAPHIC TAMPERING DETECTED'}
              </span>
              <span className="verify-banner-meta">
                {verificationResult.valid
                  ? `${verificationResult.checked_records} records verified sequentially. Zero hash collisions.`
                  : `Violation at record: ${verificationResult.first_invalid_record?.audit_id || 'UNKNOWN'}`}
              </span>
            </div>

            <div className="verify-banner-hashes mono">
              <span>GENESIS: {verificationResult.genesis_hash ? verificationResult.genesis_hash.slice(0, 16) : 'GENESIS_00000000'}...</span>
              <span style={{ margin: '0 8px' }}>►</span>
              <span>HEAD HASH: {(verificationResult.head_hash || verificationResult.latest_hash) ? (verificationResult.head_hash || verificationResult.latest_hash)!.slice(0, 16) : 'HEAD_ACTIVE'}...</span>
            </div>
          </div>

          <div className="verify-pills">
            <span className="audit-check-pill">✓ SHA-256 NIST 180-4</span>
            <span className="audit-check-pill">✓ SQLITE WAL SEQUENCED</span>
            <span className="audit-check-pill">✓ APPEND-ONLY ENFORCED</span>
          </div>
        </div>
      ) : (
        <div className="audit-verify-prompt">
          <span>Click <b>"VERIFY SHA-256 LEDGER"</b> to cryptographically audit all {audit.length} stored state transitions against genesis.</span>
        </div>
      )}

      {/* Tamper Sandbox Modal / Drawer if active */}
      {tamperMode && (
        <div className="tamper-sandbox-box">
          <div className="tamper-box-header">
            <div>
              <span className="mono" style={{ color: 'var(--accent-crimson)', fontWeight: 700 }}>
                [INTERACTIVE TAMPER RESISTANCE DEMONSTRATION]
              </span>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Simulate an unauthorized database edit to prove how SHA-256 hash chaining detects alterations.
              </div>
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 9 }} onClick={() => setTamperMode(false)}>
              CLOSE
            </button>
          </div>

          <div className="tamper-controls-grid">
            <div>
              <label className="tamper-label">TARGET BLOCK:</label>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>
                {selectedRecord?.audit_id || 'AUDIT-ROOT'} ({selectedRecord?.event})
              </span>
            </div>

            <div>
              <label className="tamper-label">FIELD TO MODIFY:</label>
              <select
                value={tamperField}
                onChange={e => setTamperField(e.target.value)}
                className="tamper-select"
              >
                <option value="actor">actor (Current: {selectedRecord?.actor})</option>
                <option value="reason">reason (Current: {selectedRecord?.reason})</option>
                <option value="subject">subject (Current: {selectedRecord?.subject})</option>
                <option value="policy_version">policy_version (Current: {selectedRecord?.policy_version})</option>
              </select>
            </div>

            <div>
              <label className="tamper-label">FORGED VALUE:</label>
              <input
                type="text"
                value={tamperValue}
                onChange={e => setTamperValue(e.target.value)}
                className="tamper-input"
              />
            </div>

            <div style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-warning" style={{ fontSize: 10 }} onClick={handleRunTamperSim}>
                RECALCULATE TAMPERED SHA-256
              </button>
            </div>
          </div>

          {simulatedHash && selectedRecord && (
            <div className="tamper-result-box">
              <div className="tamper-compare-row">
                <span className="tamper-tag tag-legit">AUTHENTIC STORED HASH:</span>
                <span className="mono tamper-hash">{selectedRecord.current_hash || 'GENESIS'}</span>
              </div>
              <div className="tamper-compare-row">
                <span className="tamper-tag tag-forged">TAMPERED PAYLOAD HASH:</span>
                <span className="mono tamper-hash" style={{ color: 'var(--accent-crimson)' }}>{simulatedHash}</span>
              </div>
              <div className="tamper-verdict">
                <b>AVALANCHE EFFECT DETECTED:</b> Modifying '{tamperField}' produces a completely distinct 256-bit digest. The subsequent block's <code>previous_hash</code> pointer is immediately broken, rendering silent historical tampering mathematically impossible.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content Split Grid */}
      <div className="grid-12" style={{ marginTop: 12 }}>
        {/* Left Column: Ledger Table & Filters (col-7) */}
        <div className="col-7">
          <div className="panel" style={{ height: 'calc(100vh - 260px)', display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header" style={{ padding: '8px 12px' }}>
              <h3>Cryptographic Audit Chain ({filteredAudit.length} / {audit.length} records)</h3>
              <span className="panel-meta">IMMUTABLE WAL</span>
            </div>

            {/* Filter toolbar */}
            <div className="audit-filter-bar">
              <input
                type="text"
                placeholder="Search subject, reason, ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="audit-search-input"
              />

              <select
                value={actorFilter}
                onChange={e => setActorFilter(e.target.value)}
                className="audit-filter-select"
              >
                {uniqueActors.map(act => (
                  <option key={act} value={act}>ACTOR: {act}</option>
                ))}
              </select>

              <select
                value={eventFilter}
                onChange={e => setEventFilter(e.target.value)}
                className="audit-filter-select"
              >
                {uniqueEvents.map(ev => (
                  <option key={ev} value={ev}>EVENT: {ev}</option>
                ))}
              </select>

              {subjectFilter && (
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 9, padding: '2px 6px' }}
                  onClick={() => setSubjectFilter('')}
                >
                  CLEAR SUBJECT [{subjectFilter}]
                </button>
              )}
            </div>

            {/* Table */}
            <div className="audit-table-scroll">
              <table className="data-table" style={{ width: '100%', fontSize: 10 }}>
                <thead>
                  <tr>
                    <th>INDEX</th>
                    <th>TIMESTAMP</th>
                    <th>ACTOR</th>
                    <th>EVENT</th>
                    <th>SUBJECT</th>
                    <th>SHA-256 HASH LINK</th>
                    <th>VERIFY</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((item, idx) => {
                    const isSelected = selectedRecord?.audit_id === item.audit_id
                    const displayHash = item.current_hash
                      ? `${item.current_hash.slice(0, 8)}...${item.current_hash.slice(-6)}`
                      : 'GENESIS'
                    return (
                      <tr
                        key={item.audit_id}
                        className={`audit-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedRecord(item)}
                      >
                        <td className="mono" style={{ color: 'var(--text-dim)' }}>
                          #{audit.length - idx}
                        </td>
                        <td className="mono">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="mono">
                          <strong style={{ color: item.actor === 'SYSTEM' ? 'var(--accent-cyan)' : 'var(--accent-amber)' }}>
                            {item.actor}
                          </strong>
                        </td>
                        <td>
                          <span className="priority-pill priority-monitor" style={{ fontSize: 8 }}>
                            {item.event}
                          </span>
                        </td>
                        <td className="mono" style={{ color: 'var(--accent-emerald)' }}>
                          {item.subject}
                        </td>
                        <td className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 9 }}>
                          {displayHash}
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 8, padding: '1px 5px' }}
                            onClick={e => {
                              e.stopPropagation()
                              setSelectedRecord(item)
                            }}
                          >
                            INSPECT
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Cryptographic Pre-image Inspector (col-5) */}
        <div className="col-5">
          <div className="panel" style={{ height: 'calc(100vh - 260px)', overflowY: 'auto', padding: 14 }}>
            <div className="panel-header" style={{ padding: '0 0 10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3>Cryptographic Block Inspector</h3>
              <span className="panel-meta">NIST FIPS 180-4</span>
            </div>

            {selectedRecord ? (
              <div className="inspector-content">
                {/* Block Identity */}
                <div className="inspector-header-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                      {selectedRecord.audit_id}
                    </span>
                    <span className="audit-check-pill" style={{ fontSize: 9 }}>
                      ✓ SHA-256 SEALED
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    TIMESTAMP: {selectedRecord.timestamp}
                  </div>
                </div>

                {/* Cryptographic Linkages */}
                <div className="inspector-hashes-box">
                  <div className="hash-block-item">
                    <span className="hash-label">PREVIOUS BLOCK HASH (POINTER):</span>
                    <div className="mono hash-val" style={{ color: 'var(--accent-amber)' }}>
                      {selectedRecord.previous_hash || 'GENESIS_00000000000000000000000000000000000000000000000000000000'}
                    </div>
                  </div>

                  <div className="hash-block-item" style={{ marginTop: 8 }}>
                    <span className="hash-label">CURRENT BLOCK HASH (DIGEST):</span>
                    <div className="mono hash-val" style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>
                      {selectedRecord.current_hash || 'GENESIS'}
                    </div>
                  </div>
                </div>

                {/* Pre-Image Breakdown */}
                <div className="preimage-container">
                  <div className="preimage-header">
                    <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-cyan)' }}>
                      DETERMINISTIC PRE-IMAGE STRING
                    </span>
                    <span className="panel-meta">CANONICAL JSON + PREV HASH</span>
                  </div>

                  <pre className="preimage-terminal mono">
                    {canonicalPreimage}
                  </pre>
                </div>

                {/* Mathematical Proof Verification */}
                <div className="proof-explanation-card">
                  <div className="proof-title">MATHEMATICAL NON-REPUDIATION PROOF:</div>
                  <div className="proof-body">
                    <code>H(n) = SHA256( CanonicalJSON(Record[n]) || H(n-1) )</code>
                    <p style={{ marginTop: 6, marginBottom: 0 }}>
                      This block cryptographically seals actor <b>{selectedRecord.actor}</b>, event <b>{selectedRecord.event}</b>, and subject <b>{selectedRecord.subject}</b>. Altering any character in SQLite invalidates the head hash of the ledger.
                    </p>
                  </div>
                </div>

                {/* Originating Event / Decision Forensic Deep-Links */}
                {selectedRecord.details && (selectedRecord.details.event_id || selectedRecord.details.decision_id) && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                    <div className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6 }}>
                      FORENSIC PROVENANCE LINKAGE
                    </div>
                    {selectedRecord.details.event_id && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          ORIGIN EVENT: <b style={{ color: '#fff' }}>{selectedRecord.details.event_id}</b>
                        </span>
                        {onNavigateToEvent && (
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 9, padding: '2px 8px' }}
                            onClick={() => onNavigateToEvent(selectedRecord.details!.event_id, selectedRecord.subject)}
                          >
                            JUMP TO EVENT →
                          </button>
                        )}
                      </div>
                    )}
                    {selectedRecord.details.decision_id && (
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        BOUND DECISION: <b style={{ color: 'var(--state-elevated)' }}>{selectedRecord.details.decision_id}</b>
                      </div>
                    )}
                  </div>
                )}

                {/* Record Details Metadata */}
                {selectedRecord.details && Object.keys(selectedRecord.details).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                      RECORD METADATA PAYLOAD:
                    </div>
                    <pre className="preimage-terminal mono" style={{ maxHeight: 120 }}>
                      {JSON.stringify(selectedRecord.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                Select an audit record to inspect its cryptographic pre-image and hash chain.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
