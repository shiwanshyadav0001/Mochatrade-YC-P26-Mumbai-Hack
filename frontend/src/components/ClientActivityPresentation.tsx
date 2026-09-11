import React, { useState } from 'react'
import type { Event, Trader } from '../types'

interface ClientActivityPresentationProps {
  latestEvents: Event[]
  selectedTrader?: Trader
  onInjectSyntheticEvent?: (eventType: string, amount?: number) => void
}

export function ClientActivityPresentation({
  latestEvents,
  selectedTrader,
  onInjectSyntheticEvent,
}: ClientActivityPresentationProps) {
  const [videoSrc, setVideoSrc] = useState<string>('')
  const [videoError, setVideoError] = useState(false)
  const [simulatingAppAction, setSimulatingAppAction] = useState(false)

  const handleSimulate = (type: string, amount?: number) => {
    if (onInjectSyntheticEvent) {
      setSimulatingAppAction(true)
      onInjectSyntheticEvent(type, amount)
      setTimeout(() => setSimulatingAppAction(false), 500)
    }
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Client Trading Application Activity</h3>
          <span className="panel-meta">EXTERNAL TRADING & AUTHENTICATION ACTIVITY PROTECTED BY NETRA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="status-dot active" />
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>
            INGESTION GATEWAY CONNECTED
          </span>
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        <div className="grid-12" style={{ gap: 12 }}>
          {/* Left 7 Cols: Video / Interactive Telemetry Display Area */}
          <div className="col-7">
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 220,
                background: 'linear-gradient(135deg, #090d16 0%, #0d1527 100%)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {videoSrc && !videoError ? (
                <video
                  src={videoSrc}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={() => setVideoError(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 20px', maxWidth: 440 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', marginBottom: 8 }}>
                    <span className="status-dot active" style={{ width: 6, height: 6 }} />
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--accent-blue)', fontWeight: 600 }}>
                      EXTERNAL CLIENT PLATFORM SURVEILLANCE
                    </span>
                  </div>

                  <h4 style={{ margin: '4px 0 6px', fontSize: 13.5, color: '#fff', fontWeight: 600 }}>
                    Mochatrade Institutional Exchange Gateway
                  </h4>

                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Visual representation of trader authentication & order flow. External transactions feed directly into NETRA Continuous Trust Intelligence.
                  </p>

                  <div className="mono" style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8, fontSize: 9 }}>
                    <span style={{ padding: '2px 6px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 3 }}>
                      ACTIVE CLIENT: #{selectedTrader?.trader_id || '7842'}
                    </span>
                    <span style={{ padding: '2px 6px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 3 }}>
                      SESSION: {selectedTrader?.session_risk_state || 'SESSION_NORMAL'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right 5 Cols: Real-time Ingestion Stream from Protected App */}
          <div className="col-5">
            <div style={{ height: 220, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', fontWeight: 600 }}>
                  REAL-TIME CLIENT EVENT PIPELINE:
                </span>
                <span className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>
                  SSE SYNCED
                </span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', padding: '6px 8px' }}>
                {latestEvents.slice(0, 5).map(evt => (
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
                      <span className="mono" style={{ fontWeight: 700, color: '#fff' }}>
                        {evt.event_type}
                      </span>
                      <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: 8.5 }}>
                        #{evt.trader_id} · {evt.amount ? `$${evt.amount.toLocaleString()}` : evt.device_id || evt.ip_address || 'Conforming'}
                      </span>
                    </div>
                    <span className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>
                      {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action Simulation Quick Bar */}
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 8.5, padding: '3px' }}
                  onClick={() => handleSimulate('TRADE', 2500)}
                  disabled={simulatingAppAction}
                >
                  NORMAL TRADE
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 8.5, padding: '3px' }}
                  onClick={() => handleSimulate('LEVERAGE_CHANGE', 50)}
                  disabled={simulatingAppAction}
                >
                  50x LEVERAGE
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 8.5, padding: '3px' }}
                  onClick={() => handleSimulate('WITHDRAWAL', 25000)}
                  disabled={simulatingAppAction}
                >
                  $25K WITHDRAWAL
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
