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
  const [simulatingAppAction, setSimulatingAppAction] = useState(false)

  const handleSimulate = (type: string, amount?: number) => {
    if (onInjectSyntheticEvent) {
      setSimulatingAppAction(true)
      onInjectSyntheticEvent(type, amount)
      setTimeout(() => setSimulatingAppAction(false), 500)
    }
  }

  const traderId = selectedTrader?.trader_id || '7842'
  const traderName = selectedTrader?.name || 'Maya Chen'
  const trustScore = selectedTrader?.trust_score ?? 94
  const sessionRisk = selectedTrader?.session_risk_state || 'SESSION_NORMAL'
  const status = selectedTrader?.status || 'NORMAL'
  const baselineDeposit = selectedTrader?.baseline?.deposit_amount ?? 3000
  const baselineLeverage = selectedTrader?.baseline?.leverage ?? 5

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>NETRA Demonstration Market Operations Gateway</h3>
          <span className="panel-meta">SIMULATED VENUE ORDER FLOW & TELEMETRY INGESTION PIPELINE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="status-dot active" />
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>
            INGESTION GATEWAY: ACTIVE
          </span>
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        <div className="grid-12" style={{ gap: 12 }}>
          {/* Left 7 Cols: Demonstration Market Feed / Venue Operations Simulation */}
          <div className="col-7">
            <div
              style={{
                position: 'relative',
                width: '100%',
                minHeight: 220,
                background: 'linear-gradient(135deg, #090d16 0%, #0d1527 100%)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Header Strip */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="status-dot active" style={{ width: 6, height: 6 }} />
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--accent-blue)', fontWeight: 700 }}>
                      DEMONSTRATION MARKET FEED // VENUE SIMULATION
                    </span>
                  </div>
                  <span className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>
                    PERP FUTURES CLOB
                  </span>
                </div>

                {/* Simulated Ticker Strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 6,
                    marginBottom: 12,
                  }}
                >
                  {[
                    { symbol: 'AAPL-PERP', price: '$232.40', chg: '+1.2%', up: true },
                    { symbol: 'NVDA-PERP', price: '$119.85', chg: '-0.4%', up: false },
                    { symbol: 'TSLA-PERP', price: '$218.10', chg: '+2.8%', up: true },
                    { symbol: 'BTC-PERP', price: '$64,250', chg: '+0.8%', up: true },
                  ].map(ticker => (
                    <div
                      key={ticker.symbol}
                      style={{
                        padding: '4px 6px',
                        background: 'var(--bg-surface-0)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 3,
                        textAlign: 'center',
                      }}
                    >
                      <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>{ticker.symbol}</div>
                      <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{ticker.price}</div>
                      <div className="mono" style={{ fontSize: 8, color: ticker.up ? 'var(--state-normal)' : 'var(--state-critical)' }}>
                        {ticker.chg}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Active Client Context */}
                <div
                  style={{
                    padding: '8px 10px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 4,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                      #{traderId} — {traderName}
                    </div>
                    <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)', marginTop: 2 }}>
                      HABITUAL BASELINE: ${baselineDeposit.toLocaleString()} / {baselineLeverage}x
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 9, padding: '2px 6px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 3, color: trustScore >= 70 ? 'var(--state-normal)' : trustScore >= 45 ? 'var(--state-elevated)' : 'var(--state-critical)', fontWeight: 700 }}>
                      TRUST: {trustScore}/100
                    </span>
                    <span className="mono" style={{ fontSize: 9, padding: '2px 6px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 3, color: 'var(--text-secondary)' }}>
                      {sessionRisk}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Honesty Explainer */}
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
                <p className="mono" style={{ margin: 0, fontSize: 8.5, color: 'var(--text-dim)', lineHeight: 1.3 }}>
                  • DEMONSTRATION VENUE STREAM: Ingested order actions immediately feed NETRA's continuous Bayesian trust decay, behavioral anomaly models, and policy enforcement gateway.
                </p>
                <p className="mono" style={{ margin: '4px 0 0 0', fontSize: 8.5, color: '#93c5fd', lineHeight: 1.3 }}>
                  • CONTINUOUS TRUST DIFFERENTIATOR: Traditional platforms verify identity once at login. NETRA continuously gates high-sensitivity actions (withdrawals, 50x leverage) against individual contextual baselines.
                </p>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Real-time Ingestion Stream from Protected App */}
          <div className="col-5">
            <div style={{ minHeight: 220, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', fontWeight: 600 }}>
                  REAL-TIME CLIENT EVENT PIPELINE:
                </span>
                <span className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>
                  SSE SYNCED
                </span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 155, background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', padding: '6px 8px' }}>
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
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 8.5, padding: '4px 2px' }}
                  onClick={() => handleSimulate('TRADE', 2500)}
                  disabled={simulatingAppAction}
                  title="Inject habitual conforming order ($2,500)"
                >
                  HABITUAL
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 8.5, padding: '4px 2px' }}
                  onClick={() => handleSimulate('LEVERAGE_CHANGE', 50)}
                  disabled={simulatingAppAction}
                  title="Inject sudden speculative 50x leverage surge"
                >
                  50x LEV
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 8.5, padding: '4px 2px' }}
                  onClick={() => handleSimulate('IP_CHANGE')}
                  disabled={simulatingAppAction}
                  title="Inject unfamiliar datacenter IP address"
                >
                  DC IP
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 8.5, padding: '4px 2px', borderColor: 'var(--state-critical)' }}
                  onClick={() => handleSimulate('WITHDRAWAL', 25000)}
                  disabled={simulatingAppAction}
                  title="Inject anomalous $25,000 withdrawal request"
                >
                  $25K WD
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
