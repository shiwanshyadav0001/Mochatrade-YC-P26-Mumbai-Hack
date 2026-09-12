import React, { useState } from 'react'
import type { OptInProtocol, SecurityProtocol } from '../types'

interface SecurityProtocolCenterProps {
  protocols: SecurityProtocol[]
  optInProtocols?: OptInProtocol[]
  onTriggerProtocol: (protocolId: string, traderId: string) => void
  onToggleOptInProtocol?: (protocolId: string, enabled: boolean, traderId: string) => Promise<void> | void
  onSelectTrader: (traderId: string) => void
  onNavigateToView: (view: any, traderId?: string) => void
  currentTraderId?: string
}

export function SecurityProtocolCenter({
  protocols,
  optInProtocols = [],
  onTriggerProtocol,
  onToggleOptInProtocol,
  onSelectTrader,
  onNavigateToView,
  currentTraderId = '7842',
}: SecurityProtocolCenterProps) {
  const [targetTraderId, setTargetTraderId] = useState(currentTraderId)
  const [selectedProtocolId, setSelectedProtocolId] = useState<string>('P-01')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const selectedProto = protocols.find(p => p.protocol_id === selectedProtocolId) || protocols[0]

  const handleToggle = async (protocolId: string, currentEnrolled: boolean) => {
    if (!onToggleOptInProtocol) return
    setTogglingId(protocolId)
    try {
      await onToggleOptInProtocol(protocolId, !currentEnrolled, targetTraderId)
    } finally {
      setTogglingId(null)
    }
  }

  // Count active opt-in protocols for current trader
  const activeOptInCount = optInProtocols.filter(p => p.enrolled).length

  return (
    <div className="protocol-center-view">
      {/* Header Banner */}
      <div className="overview-command-surface" style={{ marginBottom: 16 }}>
        <div className="command-surface-identity">
          <div className="command-system-kicker mono">SECURITY PROTOCOL FRAMEWORK // POLICY MATRIX & TRADER HARDENING</div>
          <h1 className="command-system-title">SECURITY PROTOCOL CENTER</h1>
          <div className="command-system-posture-bar">
            <span className="command-system-status-indicator">
              <span className="status-dot active" />
              <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>
                4 AUTONOMOUS PROTOCOLS ARMED
              </span>
            </span>
            <span className="command-posture-badge mono" style={{
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              borderColor: 'rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span className="status-dot" style={{ background: '#38bdf8' }} />
              {activeOptInCount} OPT-IN TRADER HARDENING PROTOCOL{activeOptInCount !== 1 ? 'S' : ''} ACTIVE
            </span>
            <span className="command-posture-badge mono" style={{
              background: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--state-normal)',
              borderColor: 'var(--state-normal-border)'
            }}>
              ACTION-SENSITIVE INTERVENTION MATRIX ACTIVE
            </span>
          </div>
        </div>

        <div className="command-quick-actions">
          <button
            className="btn btn-primary"
            onClick={() => onTriggerProtocol(selectedProtocolId, targetTraderId)}
            title="Dispatch selected security protocol to target account"
          >
            DISPATCH {selectedProtocolId} (#{targetTraderId})
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onNavigateToView('OBSERVATORY', targetTraderId)}
          >
            OBSERVATORY WATCHLIST →
          </button>
        </div>
      </div>

      {/* VOLUNTARY SECURITY PROTOCOL ENROLLMENT PANEL */}
      <div className="panel" style={{ marginBottom: 20, border: '1px solid rgba(56, 189, 248, 0.3)', background: 'linear-gradient(180deg, rgba(14, 165, 233, 0.05) 0%, rgba(10, 15, 29, 0.95) 100%)' }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, color: '#38bdf8', letterSpacing: '0.08em', fontWeight: 700 }}>
              TRADER-DIRECTED HARDENING // SESSION OPT-IN ENROLLMENT
            </div>
            <h3 style={{ margin: '2px 0 0 0', fontSize: 14, color: '#fff' }}>
              Voluntary Security Protocol Enrollment
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              TARGET ACCOUNT:
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {['7842', '9021', '4410'].map(id => (
                <button
                  key={id}
                  className={`btn ${targetTraderId === id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 9.5, padding: '3px 8px' }}
                  onClick={() => {
                    setTargetTraderId(id)
                    onSelectTrader(id)
                  }}
                >
                  #{id}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Custom Trader ID..."
              value={targetTraderId}
              onChange={e => {
                setTargetTraderId(e.target.value)
                onSelectTrader(e.target.value)
              }}
              style={{
                background: 'var(--bg-surface-0)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                color: '#fff',
                padding: '3px 8px',
                fontSize: 10,
                width: 90,
                textAlign: 'center',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '14px 16px' }}>
          {/* Concept Differentiator Callout */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 'var(--radius-xs)',
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
              marginTop: 2,
            }}>
              🛡️
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                  NETRA PHILOSOPHY: CONTINUOUS PARTICIPATORY DEFENSE
                </span>
                <span className="mono" style={{ fontSize: 9, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                  CRYPTOGRAPHIC MERKLE AUDIT VAULT SEALED
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong style={{ color: '#fff' }}>NETRA doesn't merely monitor the trader.</strong> Traditional platforms authenticate a user once and enforce static rules. NETRA allows the trader to actively choose stronger, personalized protection for sensitive withdrawals, high-volume deviations, and novel device sessions.
                <span style={{ color: '#e2e8f0', display: 'block', marginTop: 4 }}>
                  <em>Critical Distinction:</em> Opt-in protections are voluntary trader preferences that require in-line biometric verification even when the trust score is high, operating in tandem with NETRA's autonomous Bayesian risk enforcement (P-01 to P-04).
                </span>
              </p>
            </div>
          </div>

          {/* 3 Opt-In Protocol Cards */}
          <div className="grid-12" style={{ gap: 12 }}>
            {optInProtocols.map(opt => {
              const isToggling = togglingId === opt.protocol_id
              const isEnrolled = opt.enrolled

              return (
                <div
                  key={opt.protocol_id}
                  className="col-4"
                  style={{
                    background: isEnrolled ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-surface-0)',
                    border: `1px solid ${isEnrolled ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-xs)',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isEnrolled ? '0 0 15px rgba(16, 185, 129, 0.08)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div>
                    {/* Card Header: Protocol ID & Current Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span className="mono" style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 3,
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                      }}>
                        {opt.protocol_id} // OPT-IN
                      </span>

                      <span className="mono" style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 3,
                        background: isEnrolled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.1)',
                        color: isEnrolled ? 'var(--state-normal)' : 'var(--text-dim)',
                        border: `1px solid ${isEnrolled ? 'rgba(16, 185, 129, 0.5)' : 'var(--border-subtle)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}>
                        <span className={`status-dot ${isEnrolled ? 'active' : ''}`} style={{ width: 6, height: 6 }} />
                        {isEnrolled ? 'ENROLLED // ACTIVE' : 'INACTIVE // OFF'}
                      </span>
                    </div>

                    {/* Protocol Name */}
                    <h4 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#fff', lineHeight: 1.3 }}>
                      {opt.name}
                    </h4>

                    {/* Description */}
                    <p style={{ margin: '0 0 10px 0', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {opt.description}
                    </p>

                    {/* Protection Rule */}
                    <div style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 3,
                      padding: '6px 8px',
                      marginBottom: 10,
                    }}>
                      <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>
                        ENFORCEMENT BEHAVIOR:
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: isEnrolled ? 'var(--state-normal)' : '#94a3b8' }}>
                        {opt.protection_rule}
                      </div>
                    </div>

                    {/* Threat Mitigated */}
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', marginBottom: 12 }}>
                      <span>THREAT TARGET: </span>
                      <strong style={{ color: '#e2e8f0' }}>{opt.threat_mitigated}</strong>
                    </div>
                  </div>

                  {/* Toggle Action Footer */}
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                      AUDIT: <span style={{ color: '#38bdf8' }}>SEALED</span>
                    </div>

                    <button
                      className={`btn ${isEnrolled ? 'btn-secondary' : 'btn-primary'}`}
                      style={{
                        fontSize: 9.5,
                        padding: '5px 12px',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        borderColor: isEnrolled ? 'rgba(239, 68, 68, 0.4)' : undefined,
                        color: isEnrolled ? '#f87171' : undefined,
                      }}
                      disabled={isToggling || (!opt.can_disable && isEnrolled)}
                      onClick={() => handleToggle(opt.protocol_id, isEnrolled)}
                    >
                      {isToggling ? 'COMMITTING...' : isEnrolled ? 'REVOKE PROTECTION' : 'ENABLE PROTECTION'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* AUTONOMOUS RISK PROTOCOLS HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            AUTONOMOUS RISK INTERCEPTION MATRIX
          </div>
          <h3 style={{ margin: 0, fontSize: 14, color: '#fff' }}>
            Baseline Autonomous Security Protocols (P-01 through P-04)
          </h3>
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          TRIGGERED DYNAMICALLY BY BAYESIAN RISK SIGNALS
        </span>
      </div>

      {/* 4 Protocol Summary Cards */}
      <div className="grid-12" style={{ marginBottom: 16 }}>
        {protocols.map(p => {
          const isSelected = p.protocol_id === selectedProtocolId
          const badgeColor =
            p.protocol_id === 'P-03' ? 'var(--state-critical)' :
            p.protocol_id === 'P-02' ? 'var(--state-high)' :
            p.protocol_id === 'P-04' ? '#60a5fa' : 'var(--accent-blue)'

          return (
            <div
              key={p.protocol_id}
              className={`col-3 exec-kpi-card ${isSelected ? 'active' : ''}`}
              onClick={() => setSelectedProtocolId(p.protocol_id)}
              style={{
                cursor: 'pointer',
                borderLeft: `4px solid ${badgeColor}`,
                transition: 'all 0.15s ease',
              }}
            >
              <div className="kpi-head">
                <span className="kpi-label mono">{p.protocol_id}</span>
                <span className="status-pill normal" style={{ fontSize: 8 }}>{p.status}</span>
              </div>
              <div style={{ marginTop: 6, marginBottom: 6 }}>
                <h4 style={{ margin: 0, fontSize: 13, color: '#fff' }}>{p.name}</h4>
              </div>
              <div className="kpi-sub-meta mono" style={{ fontSize: 9 }}>
                <span>ENFORCEMENT: <strong style={{ color: badgeColor }}>{p.enforcement_action}</strong></span>
              </div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
                ACTIVE TRIGGERS: <strong style={{ color: '#fff' }}>{p.active_triggers_count || 0} ACCOUNTS</strong>
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected Protocol Deep Dive & Action Sensitivity Rules */}
      {selectedProto && (
        <div className="grid-12">
          {/* Left 7 Cols: Protocol Specification & Trigger Conditions */}
          <div className="col-7">
            <div className="panel">
              <div className="panel-header">
                <h3>{selectedProto.protocol_id} — {selectedProto.name}</h3>
                <span className="panel-meta">ACTION-PROPORTIONAL SPECIFICATION</span>
              </div>

              <div style={{ padding: '14px 16px' }}>
                <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 0, marginBottom: 14 }}>
                  {selectedProto.description}
                </p>

                <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <div style={{ padding: '8px 10px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                    <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: 9 }}>TRIGGER CONDITIONS:</span>
                    <strong style={{ fontSize: 10, color: '#fff', display: 'block', marginTop: 3 }}>
                      {selectedProto.trigger_conditions}
                    </strong>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                    <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: 9 }}>REQUIRED RESPONSE:</span>
                    <strong style={{ fontSize: 10, color: 'var(--state-normal)', display: 'block', marginTop: 3 }}>
                      {selectedProto.required_response}
                    </strong>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                    <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: 9 }}>ESCALATION BEHAVIOR:</span>
                    <strong style={{ fontSize: 10, color: 'var(--state-high)', display: 'block', marginTop: 3 }}>
                      {selectedProto.escalation_behavior}
                    </strong>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                    <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: 9 }}>RECOVERY BEHAVIOR:</span>
                    <strong style={{ fontSize: 10, color: '#60a5fa', display: 'block', marginTop: 3 }}>
                      {selectedProto.recovery_behavior}
                    </strong>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
                    APPLICABLE ANOMALY CATEGORIES:
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selectedProto.applicable_categories.map(cat => (
                      <span key={cat} className="status-pill guarded" style={{ fontSize: 9 }}>
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
                    PROTECTED ACTION SCOPE:
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selectedProto.target_actions.map(act => (
                      <span key={act} className="mono" style={{ fontSize: 9, padding: '3px 7px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 3, color: '#fff' }}>
                        {act}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Live Active Matching Accounts */}
          <div className="col-5">
            <div className="panel">
              <div className="panel-header">
                <h3>Active Matching Accounts ({selectedProto.affected_traders?.length || 0})</h3>
                <span className="panel-meta">FLEET SESSIONS TRIGGERING {selectedProto.protocol_id}</span>
              </div>

              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder="Trader ID to dispatch..."
                    value={targetTraderId}
                    onChange={e => setTargetTraderId(e.target.value)}
                    style={{
                      background: 'var(--bg-surface-0)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      color: '#fff',
                      padding: '4px 8px',
                      fontSize: 10,
                      width: 140,
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 9, padding: '4px 10px' }}
                    onClick={() => onTriggerProtocol(selectedProto.protocol_id, targetTraderId)}
                  >
                    TRIGGER PROTOCOL
                  </button>
                </div>

                <div className="table-container" style={{ maxHeight: 380 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>TRADER</th>
                        <th>TRUST</th>
                        <th>OPERATIONAL STATE</th>
                        <th>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!selectedProto.affected_traders || selectedProto.affected_traders.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-dim)' }}>
                            No fleet accounts currently triggering this protocol.
                          </td>
                        </tr>
                      ) : (
                        selectedProto.affected_traders.map(t => (
                          <tr key={t.trader_id} onClick={() => onSelectTrader(t.trader_id)} style={{ cursor: 'pointer' }}>
                            <td className="mono"><b>#{t.trader_id}</b> ({t.name})</td>
                            <td className="mono">
                              <b style={{ color: t.trust_score < 40 ? 'var(--state-critical)' : 'var(--state-high)' }}>
                                {Math.round(t.trust_score)}/100
                              </b>
                            </td>
                            <td>
                              <span className="status-pill elevated" style={{ fontSize: 8 }}>
                                {t.operational_state}
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: 8.5, padding: '1px 6px' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onNavigateToView('OBSERVATORY', t.trader_id)
                                }}
                              >
                                INSPECT
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
