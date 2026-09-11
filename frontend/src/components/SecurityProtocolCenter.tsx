import React, { useState } from 'react'
import type { SecurityProtocol } from '../types'

interface SecurityProtocolCenterProps {
  protocols: SecurityProtocol[]
  onTriggerProtocol: (protocolId: string, traderId: string) => void
  onSelectTrader: (traderId: string) => void
  onNavigateToView: (view: any, traderId?: string) => void
}

export function SecurityProtocolCenter({
  protocols,
  onTriggerProtocol,
  onSelectTrader,
  onNavigateToView,
}: SecurityProtocolCenterProps) {
  const [targetTraderId, setTargetTraderId] = useState('7842')
  const [selectedProtocolId, setSelectedProtocolId] = useState<string>('P-01')

  const selectedProto = protocols.find(p => p.protocol_id === selectedProtocolId) || protocols[0]

  return (
    <div className="protocol-center-view">
      {/* Header Banner */}
      <div className="overview-command-surface" style={{ marginBottom: 16 }}>
        <div className="command-surface-identity">
          <div className="command-system-kicker mono">SECURITY PROTOCOL FRAMEWORK // POLICY MATRIX v2.4</div>
          <h1 className="command-system-title">SECURITY PROTOCOL CENTER</h1>
          <div className="command-system-posture-bar">
            <span className="command-system-status-indicator">
              <span className="status-dot active" />
              <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>
                4 AUTONOMOUS PROTOCOLS ARMED
              </span>
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
