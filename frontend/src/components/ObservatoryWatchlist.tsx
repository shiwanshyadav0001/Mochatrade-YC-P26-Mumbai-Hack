import React, { useMemo, useState } from 'react'
import type { Event, ObservatoryOperationalState, ObservatoryRecord, SecurityProtocol } from '../types'

interface ObservatoryWatchlistProps {
  records: ObservatoryRecord[]
  protocols: SecurityProtocol[]
  selectedId: string
  events?: Event[]
  onSelectTrader: (traderId: string) => void
  onOpenStepUpModal: (traderId: string) => void
  onOpenRecoveryModal: (traderId: string) => void
  onTriggerProtocol: (protocolId: string, traderId: string) => void
  onNavigateToView: (view: any, traderId?: string) => void
}

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'

export function ObservatoryWatchlist({
  records,
  protocols,
  selectedId,
  events,
  onSelectTrader,
  onOpenStepUpModal,
  onOpenRecoveryModal,
  onTriggerProtocol,
  onNavigateToView,
}: ObservatoryWatchlistProps) {
  const [filterState, setFilterState] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProtocolToDispatch, setSelectedProtocolToDispatch] = useState<string>('P-01')

  const selectedRecord = useMemo(() => {
    return records.find(r => r.trader_id === selectedId) || records[0]
  }, [records, selectedId])

  const targetEvents = useMemo(() => {
    if (!events || !selectedRecord) return []
    return events.filter(e => e.trader_id === selectedRecord.trader_id)
  }, [events, selectedRecord])

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchState =
        filterState === 'ALL' ||
        (filterState === 'HIGH_ALERT' && r.operational_state === 'HIGH_ALERT') ||
        (filterState === 'RESTRICTED' && r.operational_state === 'RESTRICTED') ||
        (filterState === 'PROTOCOL_ACTIVE' && (r.operational_state === 'PROTOCOL_ACTIVE' || r.active_protocols.length > 0)) ||
        (filterState === 'MONITORING' && r.operational_state === 'MONITORING') ||
        (filterState === 'RECOVERY' && (r.operational_state === 'RECOVERY' || r.pending_recovery)) ||
        (filterState === 'RESOLVED' && r.operational_state === 'RESOLVED')

      const q = searchQuery.toLowerCase().trim()
      const matchSearch =
        !q ||
        r.trader_id.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.segment.toLowerCase().includes(q) ||
        r.session_risk_state.toLowerCase().includes(q) ||
        (r.ip_address && r.ip_address.toLowerCase().includes(q)) ||
        (r.device_id && r.device_id.toLowerCase().includes(q))

      return matchState && matchSearch
    })
  }, [records, filterState, searchQuery])

  // Counts for metric cards
  const stats = useMemo(() => {
    const total = records.length
    const highAlert = records.filter(r => r.operational_state === 'HIGH_ALERT').length
    const restricted = records.filter(r => r.operational_state === 'RESTRICTED' || r.session_risk_state === 'SESSION_RESTRICTED' || r.session_risk_state === 'SESSION_TERMINATED').length
    const protocolActive = records.filter(r => r.active_protocols.length > 0 || r.operational_state === 'PROTOCOL_ACTIVE').length
    const monitoring = records.filter(r => r.operational_state === 'MONITORING').length
    const recovery = records.filter(r => r.operational_state === 'RECOVERY' || r.pending_recovery).length
    return { total, highAlert, restricted, protocolActive, monitoring, recovery }
  }, [records])

  const getOperationalBadge = (state: ObservatoryOperationalState) => {
    switch (state) {
      case 'HIGH_ALERT':
        return <span className="status-pill critical" style={{ fontSize: 9, fontWeight: 700 }}>HIGH ALERT</span>
      case 'RESTRICTED':
        return <span className="status-pill critical" style={{ fontSize: 9, background: 'rgba(239, 68, 68, 0.2)' }}>RESTRICTED</span>
      case 'PROTOCOL_ACTIVE':
        return <span className="status-pill elevated" style={{ fontSize: 9, background: 'rgba(245, 158, 11, 0.2)' }}>PROTOCOL ACTIVE</span>
      case 'PROTOCOL_PENDING':
        return <span className="status-pill elevated" style={{ fontSize: 9 }}>PROTOCOL PENDING</span>
      case 'RECOVERY':
        return <span className="status-pill warning" style={{ fontSize: 9, background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>RECOVERY PENDING</span>
      case 'MONITORING':
        return <span className="status-pill guarded" style={{ fontSize: 9 }}>MONITORED</span>
      case 'RESOLVED':
        return <span className="status-pill normal" style={{ fontSize: 9 }}>RESOLVED</span>
      default:
        return <span className="status-pill normal" style={{ fontSize: 9 }}>{state}</span>
    }
  }

  return (
    <div className="observatory-view">
      {/* Header Operational Strip */}
      <div className="overview-command-surface" style={{ marginBottom: 16 }}>
        <div className="command-surface-identity">
          <div className="command-system-kicker mono">CONTINUOUS TRUST INTELLIGENCE // SURVEILLANCE OBSERVATORY</div>
          <h1 className="command-system-title">FLEET RISK OBSERVATORY</h1>
          <div className="command-system-posture-bar">
            <span className="command-system-status-indicator">
              <span className="status-dot active" />
              <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>
                DYNAMIC WATCHLIST ACTIVE
              </span>
            </span>
            <span className="command-posture-badge mono" style={{
              background: stats.highAlert > 0 ? 'rgba(220, 38, 38, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: stats.highAlert > 0 ? 'var(--state-critical)' : 'var(--state-normal)',
              borderColor: stats.highAlert > 0 ? 'var(--state-critical-border)' : 'var(--state-normal-border)'
            }}>
              SURVEILLANCE STATUS: {stats.highAlert > 0 ? `${stats.highAlert} HIGH-ALERT SESSIONS` : 'NOMINAL SURVEILLANCE'}
            </span>
            <span className="command-timestamp mono">
              SURVEILLANCE COHORT: {stats.total} ACCOUNTS
            </span>
          </div>
        </div>

        <div className="command-quick-actions">
          {selectedRecord && (
            <>
              <button
                className="btn btn-primary"
                onClick={() => onOpenStepUpModal(selectedRecord.trader_id)}
                title="Dispatch biometric/passkey verification challenge"
              >
                CHALLENGE STEP-UP ({selectedRecord.trader_id})
              </button>
              {selectedRecord.operational_state === 'RESTRICTED' || selectedRecord.pending_recovery || selectedRecord.trust_score < 40 ? (
                <button
                  className="btn btn-secondary"
                  style={{ borderColor: 'var(--accent-blue)', color: '#60a5fa' }}
                  onClick={() => onOpenRecoveryModal(selectedRecord.trader_id)}
                  title="Trigger Out-of-band Account Recovery Protocol (P-04)"
                >
                  P-04 RECOVERY FLOW
                </button>
              ) : null}
              <button
                className="btn btn-secondary"
                onClick={() => onNavigateToView('LIVE MONITOR', selectedRecord.trader_id)}
              >
                TELEMETRY STREAM →
              </button>
            </>
          )}
        </div>
      </div>

      {/* NETRA Operational Safety Differentiator Strip */}
      <div
        style={{
          padding: '10px 14px',
          background: 'linear-gradient(90deg, rgba(37, 99, 235, 0.12) 0%, rgba(13, 148, 136, 0.10) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 'var(--radius-xs)',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-blue)', letterSpacing: '0.05em' }}>
              NETRA CONTINUOUS TRUST SURVEILLANCE
            </span>
            <span className="status-pill active" style={{ fontSize: 8 }}>CONTINUOUS vs STATIC</span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Traditional exchanges evaluate trader legitimacy once during point-in-time KYC or session login. NETRA continuously models dynamic Bayesian trust decay, behavioral entropy, execution velocity, and network topology across all in-flight operational events.
          </p>
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', textAlign: 'right' }}>
          <div>SURVEILLANCE ENGINE: ACTIVE</div>
          <div style={{ color: 'var(--state-normal)', fontWeight: 600 }}>100% OPERATIONAL FIDELITY</div>
        </div>
      </div>

      {/* KPI Stats Banner */}
      <div className="exec-kpi-banner" style={{ marginBottom: 16 }}>
        <div
          className={`exec-kpi-card ${filterState === 'ALL' ? 'active' : ''}`}
          onClick={() => setFilterState('ALL')}
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-head">
            <span className="kpi-label">TOTAL SURVEILLANCE</span>
            <span className="status-pill normal" style={{ fontSize: 8 }}>ALL FLEET</span>
          </div>
          <div className="kpi-metric-row">
            <span className="kpi-value">{stats.total}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ACCOUNTS</span>
          </div>
          <div className="kpi-sub-meta mono">
            <span>100% ENGINE REAL-TIME</span>
          </div>
        </div>

        <div
          className={`exec-kpi-card kpi-threat-critical ${filterState === 'HIGH_ALERT' ? 'active' : ''}`}
          onClick={() => setFilterState('HIGH_ALERT')}
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-head">
            <span className="kpi-label">HIGH ALERT</span>
            <span className="status-pill critical" style={{ fontSize: 8 }}>PRIORITY 01</span>
          </div>
          <div className="kpi-metric-row">
            <span className="kpi-value" style={{ color: 'var(--state-critical)' }}>{stats.highAlert}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ELEVATED RISK</span>
          </div>
          <div className="kpi-sub-meta mono">
            <span style={{ color: 'var(--state-critical)' }}>TRUST &lt; 45 / 100</span>
          </div>
        </div>

        <div
          className={`exec-kpi-card kpi-accent-amber ${filterState === 'PROTOCOL_ACTIVE' ? 'active' : ''}`}
          onClick={() => setFilterState('PROTOCOL_ACTIVE')}
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-head">
            <span className="kpi-label">PROTOCOLS ACTIVE</span>
            <span className="status-pill elevated" style={{ fontSize: 8 }}>P-01 TO P-04</span>
          </div>
          <div className="kpi-metric-row">
            <span className="kpi-value">{stats.protocolActive}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ENFORCED</span>
          </div>
          <div className="kpi-sub-meta mono">
            <span>ACTION-PROPORTIONAL</span>
          </div>
        </div>

        <div
          className={`exec-kpi-card ${filterState === 'RESTRICTED' ? 'active' : ''}`}
          onClick={() => setFilterState('RESTRICTED')}
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-head">
            <span className="kpi-label">RESTRICTED SESSIONS</span>
            <span className="status-pill critical" style={{ fontSize: 8 }}>CONTAINED</span>
          </div>
          <div className="kpi-metric-row">
            <span className="kpi-value" style={{ color: '#f87171' }}>{stats.restricted}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>INTERVENED</span>
          </div>
          <div className="kpi-sub-meta mono">
            <span>REQUIRES CLEARANCE</span>
          </div>
        </div>

        <div
          className={`exec-kpi-card ${filterState === 'RECOVERY' ? 'active' : ''}`}
          onClick={() => setFilterState('RECOVERY')}
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-head">
            <span className="kpi-label">RECOVERY WORKFLOW</span>
            <span className="status-pill guarded" style={{ fontSize: 8, color: '#60a5fa' }}>OOB OTP / KYC</span>
          </div>
          <div className="kpi-metric-row">
            <span className="kpi-value" style={{ color: '#60a5fa' }}>{stats.recovery}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>PENDING</span>
          </div>
          <div className="kpi-sub-meta mono">
            <span>EVIDENTIARY RESTORATION</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Watchlist Table (8 Cols) + Selected Target Dossier (4 Cols) */}
      <div className="grid-12">
        {/* Left 8 Cols: Watchlist Table */}
        <div className="col-8">
          <div className="panel">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3>Active Surveillance Watchlist</h3>
                <span className="panel-meta">CONTINUOUS CONTEXTUAL ANOMALY & SESSION SURVEILLANCE</span>
              </div>

              {/* Filter Tabs & Search */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Filter trader, IP, device..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    background: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: '#fff',
                    padding: '4px 8px',
                    fontSize: 10,
                    width: 170,
                  }}
                />
              </div>
            </div>

            <div className="table-container" style={{ maxHeight: 540 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>TRADER / SESSION</th>
                    <th>NAME</th>
                    <th>TRUST SCORE</th>
                    <th>OPERATIONAL STATE</th>
                    <th>ACTIVE PROTOCOLS</th>
                    <th>LAST DECISION</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-dim)' }}>
                        No surveillance records match the active filter.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map(r => {
                      const isSelected = r.trader_id === selectedId
                      return (
                        <tr
                          key={r.trader_id}
                          className={isSelected ? 'row-selected' : ''}
                          onClick={() => onSelectTrader(r.trader_id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="mono">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className={`status-dot ${r.operational_state === 'HIGH_ALERT' ? 'connecting' : r.operational_state === 'RESTRICTED' ? 'offline' : 'active'}`} />
                              <b>#{r.trader_id}</b>
                            </div>
                            <span style={{ fontSize: 9, color: 'var(--text-dim)', display: 'block', marginTop: 2 }}>
                              {r.session_id}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{r.name}</span>
                            <span style={{ display: 'block', fontSize: 9, color: 'var(--text-dim)' }}>
                              {r.segment} · {r.country || 'IN'}
                            </span>
                          </td>
                          <td className="mono">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: r.trust_score < 25 ? 'var(--state-critical)' : r.trust_score < 50 ? 'var(--state-high)' : r.trust_score < 75 ? 'var(--state-elevated)' : 'var(--state-normal)',
                                }}
                              >
                                {Math.round(r.trust_score)}
                              </span>
                              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>/100</span>
                            </div>
                            <div className="risk-bar" style={{ width: 50, height: 3, marginTop: 3 }}>
                              <div
                                className="risk-bar-fill"
                                style={{
                                  width: `${r.trust_score}%`,
                                  background: r.trust_score < 25 ? 'var(--state-critical)' : r.trust_score < 50 ? 'var(--state-high)' : r.trust_score < 75 ? 'var(--state-elevated)' : 'var(--state-normal)',
                                }}
                              />
                            </div>
                          </td>
                          <td>{getOperationalBadge(r.operational_state)}</td>
                          <td>
                            {r.active_protocols.length > 0 ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {r.active_protocols.map(p => (
                                  <span
                                    key={p}
                                    className="mono"
                                    style={{
                                      fontSize: 8.5,
                                      padding: '2px 5px',
                                      borderRadius: 3,
                                      background: p === 'P-03' ? 'rgba(239, 68, 68, 0.2)' : p === 'P-02' ? 'rgba(245, 158, 11, 0.2)' : p === 'P-04' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                      color: p === 'P-03' ? 'var(--state-critical)' : p === 'P-02' ? 'var(--state-high)' : p === 'P-04' ? '#60a5fa' : 'var(--state-normal)',
                                      border: '1px solid var(--border-subtle)',
                                    }}
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>NONE</span>
                            )}
                          </td>
                          <td>
                            <span className={`status-pill ${r.last_decision?.toLowerCase() || 'allow'}`} style={{ fontSize: 8.5 }}>
                              {r.last_decision}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: 8.5, padding: '2px 5px' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onOpenStepUpModal(r.trader_id)
                                }}
                              >
                                VERIFY
                              </button>
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: 8.5, padding: '2px 5px' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onNavigateToView('LIVE MONITOR', r.trader_id)
                                }}
                              >
                                VIEW
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 4 Cols: Selected Account Operational Dossier */}
        <div className="col-4">
          <div className="panel">
            <div className="panel-header">
              <h3>Surveillance Dossier</h3>
              <span className="panel-meta">TARGET #{selectedRecord?.trader_id}</span>
            </div>

            {selectedRecord ? (
              <div style={{ padding: '12px 14px' }}>
                {/* Identity Summary Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#fff' }}>
                      {selectedRecord.name}
                    </h4>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      TRADER #{selectedRecord.trader_id} · {selectedRecord.segment}
                    </span>
                  </div>
                  <div>
                    {getOperationalBadge(selectedRecord.operational_state)}
                  </div>
                </div>

                {/* Trust Score Hero Block */}
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    marginBottom: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: 9.5, color: 'var(--text-dim)', display: 'block' }}>LIVE TRUST SCORE</span>
                    <strong
                      className="mono"
                      style={{
                        fontSize: 20,
                        color: selectedRecord.trust_score < 25 ? 'var(--state-critical)' : selectedRecord.trust_score < 50 ? 'var(--state-high)' : selectedRecord.trust_score < 75 ? 'var(--state-elevated)' : 'var(--state-normal)',
                      }}
                    >
                      {selectedRecord.trust_score.toFixed(1)}
                    </strong>
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)' }}> / 100</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', display: 'block' }}>SESSION RISK STATE</span>
                    <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: selectedRecord.session_risk_state.includes('RESTRICTED') || selectedRecord.session_risk_state.includes('TERMINATED') ? 'var(--state-critical)' : 'var(--text-primary)' }}>
                      {selectedRecord.session_risk_state}
                    </span>
                  </div>
                </div>

                {/* Telemetry & Device Footprint */}
                <div className="mono" style={{ fontSize: 9.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                  <div style={{ padding: '6px 8px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                    <span style={{ color: 'var(--text-dim)', display: 'block' }}>DEVICE FOOTPRINT:</span>
                    <strong style={{ color: '#fff' }}>{selectedRecord.device_id || 'DEV-PRIMARY'}</strong>
                  </div>
                  <div style={{ padding: '6px 8px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                    <span style={{ color: 'var(--text-dim)', display: 'block' }}>IP / NETWORK:</span>
                    <strong style={{ color: selectedRecord.network_type === 'datacenter' ? 'var(--state-critical)' : '#fff' }}>
                      {selectedRecord.ip_address || '203.0.113.22'} ({selectedRecord.network_type || 'res'})
                    </strong>
                  </div>
                  <div style={{ padding: '6px 8px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                    <span style={{ color: 'var(--text-dim)', display: 'block' }}>FAILED CHALLENGES:</span>
                    <strong style={{ color: selectedRecord.failed_verifications > 0 ? 'var(--state-critical)' : 'var(--state-normal)' }}>
                      {selectedRecord.failed_verifications} attempts
                    </strong>
                  </div>
                  <div style={{ padding: '6px 8px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                    <span style={{ color: 'var(--text-dim)', display: 'block' }}>SHARED INFRASTRUCTURE:</span>
                    <strong style={{ color: selectedRecord.shared_clusters_count > 0 ? 'var(--state-critical)' : 'var(--state-normal)' }}>
                      {selectedRecord.shared_clusters_count} clusters linked
                    </strong>
                  </div>
                </div>

                {/* Active Protocols List */}
                <div style={{ marginBottom: 12 }}>
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
                    TRIGGERED SECURITY PROTOCOLS:
                  </span>
                  {selectedRecord.protocol_details && selectedRecord.protocol_details.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedRecord.protocol_details.map(proto => (
                        <div
                          key={proto.protocol_id}
                          style={{
                            padding: '6px 8px',
                            background: 'var(--bg-surface-0)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-xs)',
                            borderLeft: `3px solid ${proto.protocol_id === 'P-03' ? 'var(--state-critical)' : proto.protocol_id === 'P-02' ? 'var(--state-high)' : proto.protocol_id === 'P-04' ? '#60a5fa' : 'var(--accent-blue)'}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong className="mono" style={{ fontSize: 10, color: '#fff' }}>
                              {proto.protocol_id} — {proto.name}
                            </strong>
                            <span className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>
                              {proto.enforcement_action}
                            </span>
                          </div>
                          <span style={{ fontSize: 9, color: 'var(--text-secondary)', display: 'block', marginTop: 2 }}>
                            {proto.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '6px 8px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', fontSize: 9.5, color: 'var(--text-dim)' }}>
                      No active protocol triggers. Session conforming to normal baseline.
                    </div>
                  )}
                </div>

                {/* Target Entity Activity Register & Continuing Operational Stream */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', fontWeight: 600 }}>
                      ENTITY ACTIVITY REGISTER // TELEMETRY:
                    </span>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 8.5, padding: '1px 6px' }}
                      onClick={() => onNavigateToView('OVERVIEW', selectedRecord.trader_id)}
                      title="View complete 7-stage causal reasoning chain for this trader"
                    >
                      WHY NETRA DECIDED →
                    </button>
                  </div>

                  <div
                    style={{
                      maxHeight: 160,
                      overflowY: 'auto',
                      background: 'var(--bg-surface-0)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '4px 6px',
                    }}
                  >
                    {targetEvents.length === 0 ? (
                      <div style={{ padding: '10px 8px', fontSize: 9.5, color: 'var(--text-dim)', textAlign: 'center' }}>
                        No anomalous events recorded. Account telemetry conforming to habitual baseline.
                      </div>
                    ) : (
                      targetEvents.slice(0, 5).map(evt => (
                        <div
                          key={evt.event_id}
                          style={{
                            padding: '5px 6px',
                            borderBottom: '1px solid var(--border-subtle)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 9.5,
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong className="mono" style={{ color: evt.event_type.includes('WITHDRAWAL') || evt.event_type.includes('FAIL') || evt.event_type.includes('BURST') || evt.event_type.includes('LEVERAGE') ? 'var(--state-critical)' : '#fff' }}>
                                {evt.event_type}
                              </strong>
                              {evt.amount && (
                                <span className="mono" style={{ color: 'var(--state-normal)', fontSize: 8.5 }}>
                                  ${evt.amount.toLocaleString()}
                                </span>
                              )}
                            </div>
                            <span style={{ color: 'var(--text-dim)', fontSize: 8.5, display: 'block', marginTop: 1 }}>
                              {evt.device_id || evt.ip_address || 'Conforming session footprint'}
                            </span>
                          </div>
                          <span className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>
                            {formatTime(evt.timestamp)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Dispatch Protocol Toolbar */}
                <div style={{ padding: '8px 10px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', marginBottom: 12 }}>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                    MANUAL PROTOCOL DISPATCH:
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={selectedProtocolToDispatch}
                      onChange={e => setSelectedProtocolToDispatch(e.target.value)}
                      style={{
                        background: 'var(--bg-surface-1)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        color: '#fff',
                        fontSize: 9.5,
                        flex: 1,
                        padding: '3px 6px',
                      }}
                    >
                      <option value="P-01">P-01: Identity Revalidation</option>
                      <option value="P-02">P-02: Sensitive Transaction Hold</option>
                      <option value="P-03">P-03: Session Containment & Revocation</option>
                      <option value="P-04">P-04: Secondary Account Recovery</option>
                    </select>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 9, padding: '3px 8px' }}
                      onClick={() => onTriggerProtocol(selectedProtocolToDispatch, selectedRecord.trader_id)}
                    >
                      DISPATCH
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 9.5, padding: '6px' }}
                    onClick={() => onOpenStepUpModal(selectedRecord.trader_id)}
                  >
                    STEP-UP CHALLENGE
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 9.5, padding: '6px' }}
                    onClick={() => onOpenRecoveryModal(selectedRecord.trader_id)}
                  >
                    RECOVERY (P-04)
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
                Select an account from the watchlist to view complete surveillance details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
