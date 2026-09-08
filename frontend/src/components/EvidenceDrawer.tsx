import React, { useState } from 'react'
import type { Decision, Event, Trader } from '../types'

interface EvidenceDrawerProps {
  isOpen: boolean
  onClose: () => void
  data: {
    event?: Event
    decision?: Decision
    trader?: Trader
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

  const { event, decision, trader } = data
  const traderId = event?.trader_id || decision?.trader_id || trader?.trader_id || 'UNKNOWN'

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
              FORENSIC DOSSIER // TRADER #{traderId}
            </span>
            <div className="drawer-title">
              {event?.event_type || decision?.action || `PROFILE-INSPECT-${traderId}`}
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
              {decision && (
                <div className="drawer-card">
                  <div className="drawer-card-title">NETRA EVALUATION OUTCOME</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span className={`status-pill ${decision.risk_level.toLowerCase()}`}>
                        {decision.decision} // {decision.risk_level}
                      </span>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                        CONFIDENCE: {decision.confidence} | LATENCY: {decision.processing_latency_ms}ms
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
                    {decision.explanation.recommendation}
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
                      <td className="mono ip-address"><b>{event?.ip_address || '198.18.0.14'}</b></td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--text-muted)' }}>NETWORK CATEGORY</td>
                      <td>
                        <span className={`status-pill ${event?.network_type === 'datacenter' ? 'critical' : 'normal'}`}>
                          {event?.network_type ? event.network_type.toUpperCase() : 'RESIDENTIAL'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--text-muted)' }}>GEO LOCATION</td>
                      <td>{event?.city ? `${event.city}, ${event.country}` : 'Mumbai, IN'}</td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--text-muted)' }}>DEVICE FINGERPRINT</td>
                      <td className="mono">{event?.device_id || 'DEV-7842-PRIMARY'}</td>
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
