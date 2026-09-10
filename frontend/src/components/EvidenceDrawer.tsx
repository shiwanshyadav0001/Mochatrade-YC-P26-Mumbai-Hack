import React, { useState } from 'react'
import type { Decision, Event, Trader } from '../types'

interface EvidenceDrawerProps {
  isOpen: boolean
  onClose: () => void
  data: {
    event?: Event
    decision?: Decision
    trader?: Trader
    caseItem?: any
    entity?: {
      id: string
      type: string
      risk?: number
      is_cluster?: boolean
      edges?: any[]
    }
  } | null
  onStepUpVerify?: (traderId: string) => void
  onOpenTrader?: (traderId: string) => void
}

export function EvidenceDrawer({
  isOpen,
  onClose,
  data,
  onStepUpVerify,
  onOpenTrader,
}: EvidenceDrawerProps) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'FORENSICS' | 'RAW_PAYLOAD' | 'CUSTODY'>('FORENSICS')

  if (!isOpen || !data) return null

  const { event, decision, trader, caseItem, entity } = data
  const traderId = event?.trader_id || decision?.trader_id || trader?.trader_id || caseItem?.trader_id || (entity ? entity.id : 'UNKNOWN')

  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="forensic-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {entity ? `GRAPH TOPOLOGY ENTITY // ${entity.type}` : `FORENSIC DOSSIER // TRADER #${traderId}`}
            </span>
            <div className="drawer-title">
              {event?.event_type || decision?.action || (caseItem ? `CASE-${caseItem.case_id}` : (entity ? entity.id : `PROFILE-${traderId}`))}
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: '2px 8px' }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="drawer-nav-tabs">
          <button
            className={`drawer-tab ${activeTab === 'FORENSICS' ? 'active' : ''}`}
            onClick={() => setActiveTab('FORENSICS')}
          >
            Contextual Evidence
          </button>
          <button
            className={`drawer-tab ${activeTab === 'RAW_PAYLOAD' ? 'active' : ''}`}
            onClick={() => setActiveTab('RAW_PAYLOAD')}
          >
            Raw Normalized Ingestion JSON
          </button>
          <button
            className={`drawer-tab ${activeTab === 'CUSTODY' ? 'active' : ''}`}
            onClick={() => setActiveTab('CUSTODY')}
          >
            Lineage & Step-Up
          </button>
        </div>

        <div className="drawer-content">
          {activeTab === 'FORENSICS' && (
            <>
              {/* Entity Node Inspection Card */}
              {entity && (
                <div className="drawer-card">
                  <div className="drawer-card-title">TOPOLOGY NODE RECORD</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{entity.id}</span>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        CATEGORY: {entity.type} {entity.is_cluster && '| MONITORED RISK CLUSTER'}
                      </div>
                    </div>
                    {entity.risk !== undefined && (
                      <span className={`status-pill ${entity.risk > 70 ? 'critical' : 'normal'}`}>
                        RISK: {entity.risk}/100
                      </span>
                    )}
                  </div>
                  {entity.edges && entity.edges.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>CONNECTED GRAPH EDGES:</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                        {entity.edges.map((edge: any, i: number) => (
                          <div key={i} className="mono" style={{ fontSize: 10, padding: '3px 6px', background: 'var(--bg-surface-0)', borderRadius: 2 }}>
                            {edge.source} → {edge.type} → {edge.target}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Case Record Card */}
              {caseItem && (
                <div className="drawer-card">
                  <div className="drawer-card-title">ATTACHED INVESTIGATION CASE</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className="mono"><b>{caseItem.case_id}</b></span>
                    <span className={`status-pill ${caseItem.status?.toLowerCase() || 'normal'}`}>{caseItem.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{caseItem.reason}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                    TRADER: #{caseItem.trader_id} | SEVERITY: {caseItem.severity} | CREATED: {caseItem.created_at}
                  </div>
                </div>
              )}

              {decision && (
                <div className="drawer-card">
                  <div className="drawer-card-title">NETRA EVALUATION OUTCOME</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span className={`status-pill ${decision.risk_level.toLowerCase()}`}>
                        {decision.decision} // {decision.risk_level}
                      </span>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                        CONFIDENCE: {decision.confidence} | EVAL LATENCY: {decision.processing_latency_ms}ms
                      </div>
                    </div>
                    <div className="trust-display" style={{ textAlign: 'right' }}>
                      <div className="trust-score-row">
                        <strong style={{ fontSize: 22 }}>{Math.round(decision.trust_score)}</strong>
                        <span>/100</span>
                      </div>
                      <span className="trust-label">TRUST SCORE</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-surface-0)', padding: 8, borderRadius: 3 }}>
                    <b>SOP:</b> {decision.explanation.recommendation}
                  </div>
                </div>
              )}

              {/* Top Contributors */}
              {decision?.explanation?.top_factors && (
                <div className="drawer-card">
                  <div className="drawer-card-title">PRIMARY RISK CONTRIBUTORS</div>
                  <div className="contributors-list">
                    {decision.explanation.top_factors.map((factor, idx) => (
                      <div key={idx} className="contributor-row">
                        <span className="contributor-bullet">0{idx + 1}</span>
                        <span>{factor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Network & Device Table */}
              <div className="drawer-card">
                <div className="drawer-card-title">INFRASTRUCTURE & CRYPTOGRAPHIC CONTEXT</div>
                <table className="data-table" style={{ fontSize: 10 }}>
                  <tbody>
                    <tr>
                      <td style={{ color: 'var(--text-muted)', width: 140 }}>IP ADDRESS</td>
                      <td className="mono ip-address">
                        <b>{event?.ip_address || (entity?.type === 'IP' ? entity.id.replace('IP-', '') : 'N/A')}</b>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--text-muted)' }}>NETWORK CATEGORY</td>
                      <td>
                        <span className={`status-pill ${event?.network_type === 'datacenter' ? 'critical' : (event?.ip_address ? 'normal' : 'elevated')}`}>
                          {event?.network_type ? event.network_type.toUpperCase() : (event?.ip_address ? 'RESIDENTIAL' : 'N/A')}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--text-muted)' }}>GEO LOCATION</td>
                      <td>{event?.city ? `${event.city}, ${event.country || ''}` : (event?.country || 'N/A')}</td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--text-muted)' }}>DEVICE FINGERPRINT</td>
                      <td className="mono">{event?.device_id || (entity?.type === 'DEVICE' ? entity.id : 'N/A')}</td>
                    </tr>
                    {event?.wallet_address && (
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>DESTINATION WALLET</td>
                        <td className="mono wallet-address">{event.wallet_address}</td>
                      </tr>
                    )}
                    {event?.amount !== undefined && (
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>TRANSACTION AMOUNT</td>
                        <td className="mono"><b>${event.amount.toLocaleString()} {event.currency || 'USD'}</b></td>
                      </tr>
                    )}
                    {event?.leverage !== undefined && (
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>APPLIED LEVERAGE</td>
                        <td className="mono">{event.leverage}×</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Triggered Rules */}
              {decision?.triggered_rules && decision.triggered_rules.length > 0 && (
                <div className="drawer-card">
                  <div className="drawer-card-title">TRIGGERED POLICY RULES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {decision.triggered_rules.map(rule => (
                      <span key={rule} className="status-pill high">
                        {rule}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'RAW_PAYLOAD' && (
            <div className="drawer-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="drawer-card-title" style={{ margin: 0 }}>
                  NORMALIZED INGESTION SCHEMA v2.0
                </span>
                <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 10 }} onClick={copyPayload}>
                  {copied ? 'COPIED TO CLIPBOARD' : 'COPY RAW JSON'}
                </button>
              </div>
              <pre className="raw-json-box">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}

          {activeTab === 'CUSTODY' && (
            <div className="drawer-card">
              <div className="drawer-card-title">AUDIT TRAIL & INTERVENTION MENU</div>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Every transaction transition is sealed in the SQLite write-ahead log with cryptographic actor attribution.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {onStepUpVerify && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      onStepUpVerify(traderId)
                      onClose()
                    }}
                  >
                    EXECUTE 2FA / STEP-UP VERIFICATION (RESTORE TRUST)
                  </button>
                )}
                {onOpenTrader && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      onOpenTrader(traderId)
                      onClose()
                    }}
                  >
                    OPEN TRADER #{traderId} BASELINE PROFILE
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
