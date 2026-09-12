import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { soundManager } from '../audio'
import type { ActionSensitivityResult, Trader, Event } from '../types'

interface ActionSensitivitySimulatorProps {
  traderId: string
  traders: Trader[]
  events: Event[]
  onRefreshAll?: () => Promise<void>
}

const money = (v?: number) => v !== undefined ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v) : '—'

function trustColor(trust: number) {
  if (trust >= 90) return 'var(--state-normal)'
  if (trust >= 70) return 'var(--state-normal)'
  if (trust >= 45) return 'var(--state-elevated)'
  if (trust >= 20) return 'var(--state-high)'
  return 'var(--state-critical)'
}

export function ActionSensitivitySimulator({ traderId, traders, events }: ActionSensitivitySimulatorProps) {
  const trader = useMemo(() => traders.find(t => t.trader_id === traderId) || traders[0], [traders, traderId])
  const baseEvent = useMemo(() => {
    if (!trader) return null
    const tEvents = events.filter(e => e.trader_id === trader.trader_id)
    if (tEvents.length) return tEvents[0]
    // synthetic base from trader baseline
    return {
      event_id: `EV-BASE-${trader.trader_id}`,
      trader_id: trader.trader_id,
      event_type: 'TRADE',
      amount: trader.baseline?.deposit_amount || 2500,
      leverage: trader.baseline?.leverage || 3,
      device_id: trader.baseline?.known_devices?.[0] || `DEV-${trader.trader_id}-PRIMARY`,
      ip_address: '203.0.113.22',
      network_type: 'residential',
      wallet_address: trader.baseline?.known_wallets?.[0] || undefined,
      asset: 'BTC',
      country: 'IN',
    } as unknown as Event
  }, [trader, events])

  const [amount, setAmount] = useState<number>(baseEvent?.amount || 2500)
  const [leverage, setLeverage] = useState<number>(baseEvent?.leverage || 3)
  const [deviceId, setDeviceId] = useState<string>(baseEvent?.device_id || '')
  const [networkType, setNetworkType] = useState<string>(baseEvent?.network_type || 'residential')
  const [walletAddress, setWalletAddress] = useState<string>(baseEvent?.wallet_address || '')
  const [eventType, setEventType] = useState<string>(baseEvent?.event_type || 'TRADE')
  const [asset, setAsset] = useState<string>(baseEvent?.asset || 'BTC')

  const [result, setResult] = useState<ActionSensitivityResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (baseEvent) {
      setAmount(baseEvent.amount || 2500)
      setLeverage(baseEvent.leverage || 3)
      setDeviceId(baseEvent.device_id || '')
      setNetworkType(baseEvent.network_type || 'residential')
      setWalletAddress(baseEvent.wallet_address || '')
      setEventType(baseEvent.event_type || 'TRADE')
      setAsset(baseEvent.asset || 'BTC')
      setResult(null)
      setError(null)
    }
  }, [traderId, baseEvent?.event_id])

  const runSimulation = async () => {
    if (!trader || !baseEvent) return
    setLoading(true)
    setError(null)
    try {
      soundManager.playEventTick()
      const payload = {
        trader_id: trader.trader_id,
        base_event: {
          event_id: baseEvent.event_id,
          event_type: baseEvent.event_type,
          amount: baseEvent.amount,
          leverage: baseEvent.leverage,
          device_id: baseEvent.device_id,
          ip_address: baseEvent.ip_address,
          network_type: baseEvent.network_type,
          wallet_address: baseEvent.wallet_address,
          asset: baseEvent.asset,
          country: (baseEvent as unknown as Record<string, unknown>).country || 'IN',
        },
        modifications: {
          amount,
          leverage,
          device_id: deviceId || undefined,
          network_type: networkType,
          wallet_address: walletAddress || undefined,
          event_type: eventType,
          asset,
        },
      }
      const res = await api.send<ActionSensitivityResult>('POST', '/simulate/action-sensitivity', payload)
      setResult(res)
      soundManager.playSuccess()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { detail?: string })?.detail || 'Simulation failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const resetToBaseline = () => {
    if (!baseEvent || !trader) return
    setAmount(baseEvent.amount || trader.baseline?.deposit_amount || 2500)
    setLeverage(baseEvent.leverage || trader.baseline?.leverage || 3)
    setDeviceId(baseEvent.device_id || trader.baseline?.known_devices?.[0] || '')
    setNetworkType(baseEvent.network_type || 'residential')
    setWalletAddress(baseEvent.wallet_address || '')
    setEventType(baseEvent.event_type || 'TRADE')
    setAsset(baseEvent.asset || 'BTC')
    setResult(null)
    setError(null)
  }

  if (!trader) {
    return <div className="panel" style={{ padding: 16 }}><span className="mono" style={{ color: 'var(--text-dim)' }}>Select a trader to run sensitivity simulation.</span></div>
  }

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Action Sensitivity Simulator
            <span className="status-pill" style={{ fontSize: 8, background: 'rgba(56,189,248,0.12)', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.25)' }}>COUNTERFACTUAL</span>
            <span className="status-pill" style={{ fontSize: 8, background: 'rgba(16,185,129,0.12)', color: 'var(--state-normal)', borderColor: 'rgba(16,185,129,0.25)' }}>SIDE-EFFECT FREE</span>
          </h3>
          <span className="panel-meta">TRADER #{trader.trader_id} • WHAT IF THIS ACTION WERE DIFFERENT?</span>
        </div>
        <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'right' }}>
          <div>ENGINE: NETRA TRUST • ENFORCEMENT • PROTOCOLS</div>
          <div style={{ color: 'var(--state-normal)' }}>NO MUTATION • NO AUDIT WRITE</div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* Current → Controls → Simulated flow */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'start', marginBottom: 16 }}>
          {/* CURRENT STATE */}
          <div style={{ padding: 12, background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6 }}>CURRENT STATE • REAL ENGINE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>TRUST SCORE</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: trustColor(trader.trust_score) }}>{trader.trust_score.toFixed(1)}<span style={{ fontSize: 10, color: 'var(--text-dim)' }}> /100</span></div>
                <div className={`status-pill ${trader.status.toLowerCase()}`} style={{ fontSize: 8, marginTop: 2 }}>{trader.status}</div>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>SESSION STATE</div>
                <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0' }}>{trader.session_risk_state || 'SESSION_NORMAL'}</div>
                <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>{trader.last_decision || 'ALLOW'}</div>
              </div>
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 8, padding: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 3 }}>
              <div>BASE EVENT: <b style={{ color: '#fff' }}>{baseEvent?.event_type}</b> {money(baseEvent?.amount)} {baseEvent?.leverage ? `@ ${baseEvent.leverage}x` : ''}</div>
              <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>{baseEvent?.device_id} • {baseEvent?.ip_address} ({baseEvent?.network_type}) {baseEvent?.wallet_address ? `• ${baseEvent.wallet_address}` : ''}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 24 }}>
            <span className="mono" style={{ fontSize: 14, color: 'var(--text-dim)' }}>→</span>
          </div>

          {/* SIMULATED RESULT PREVIEW */}
          <div style={{ padding: 12, background: result ? 'rgba(56,189,248,0.06)' : 'var(--bg-surface-0)', border: `1px solid ${result ? 'rgba(56,189,248,0.30)' : 'var(--border-subtle)'}`, borderRadius: 6, minHeight: 110 }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6 }}>SIMULATED RESULT • COUNTERFACTUAL</div>
            {!result ? (
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: '18px 0' }}>Adjust scenario controls below and run simulation.<br/><span style={{ fontSize: 9 }}>Current → Simulated will appear here.</span></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>PROJECTED TRUST</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: trustColor(result.simulated.trust_score) }}>{result.simulated.trust_score.toFixed(1)}<span style={{ fontSize: 10, color: 'var(--text-dim)' }}> /100</span></div>
                  <div className="mono" style={{ fontSize: 9, color: result.delta.trust_change < 0 ? 'var(--state-critical)' : result.delta.trust_change > 0 ? 'var(--state-normal)' : 'var(--text-dim)', fontWeight: 700 }}>{result.delta.trust_change > 0 ? '+' : ''}{result.delta.trust_change.toFixed(1)} Δ</div>
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>PROJECTED DECISION</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <span className={`status-pill ${result.current.decision.toLowerCase()}`} style={{ fontSize: 8 }}>{result.current.decision}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>→</span>
                    <span className={`status-pill ${result.simulated.decision.toLowerCase()}`} style={{ fontSize: 9, border: result.delta.decision_changed ? '1px solid rgba(255,255,255,0.3)' : undefined }}>{result.simulated.decision}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>{result.delta.policy_transition}</div>
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>SESSION STATE</div>
                  <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: '#e2e8f0' }}>{result.simulated.session_state}</div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>{result.delta.session_transition}</div>
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>RISK SCORE</div>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: result.simulated.risk_score > result.current.risk_score ? 'var(--state-critical)' : 'var(--state-normal)' }}>{result.simulated.risk_score.toFixed(1)}<span style={{ fontSize: 9, color: 'var(--text-dim)' }}> ({result.delta.risk_change > 0 ? '+' : ''}{result.delta.risk_change.toFixed(1)})</span></div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
                    {result.simulated.active_protocols.length ? result.simulated.active_protocols.map(p => (
                      <span key={p} className="mono" style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, background: p==='P-03'?'rgba(239,68,68,0.18)':'rgba(59,130,246,0.15)', border: '1px solid var(--border-subtle)', color: p==='P-03'?'var(--state-critical)':'#60a5fa' }}>{p}</span>
                    )) : <span className="mono" style={{ fontSize: 7, color: 'var(--text-dim)' }}>NO PROTOCOL</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SCENARIO CONTROLS */}
        <div style={{ padding: 12, background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 6, marginBottom: 12 }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 8 }}>SCENARIO CONTROLS • MODIFY ONLY EXISTING ARCHITECTURE PARAMETERS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <label className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              EVENT TYPE
              <select value={eventType} onChange={e => setEventType(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '5px 6px', color: '#fff', fontSize: 11 }}>
                <option value="TRADE">TRADE</option>
                <option value="DEPOSIT">DEPOSIT</option>
                <option value="WITHDRAWAL">WITHDRAWAL</option>
                <option value="LEVERAGE_CHANGE">LEVERAGE_CHANGE</option>
                <option value="NEW_DEVICE">NEW_DEVICE</option>
                <option value="LOGIN">LOGIN</option>
              </select>
            </label>
            <label className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              AMOUNT (USD) — modifies money/behaviour signals
              <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '5px 6px', color: '#fff', fontSize: 11 }} />
            </label>
            <label className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              LEVERAGE (x) — triggers leverage deviation
              <input type="number" value={leverage} onChange={e => setLeverage(Number(e.target.value))} min={1} max={100} style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '5px 6px', color: '#fff', fontSize: 11 }} />
            </label>
            <label className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              ASSET
              <select value={asset} onChange={e => setAsset(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '5px 6px', color: '#fff', fontSize: 11 }}>
                <option value="BTC">BTC</option><option value="ETH">ETH</option><option value="SOL">SOL</option><option value="USDT">USDT</option>
              </select>
            </label>
            <label className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              DEVICE ID — known vs novel
              <input type="text" value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="DEV-7842-PRIMARY or DEV-UNKNOWN" style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '5px 6px', color: '#fff', fontSize: 11 }} />
            </label>
            <label className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              NETWORK TYPE — residential vs datacenter
              <select value={networkType} onChange={e => setNetworkType(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '5px 6px', color: '#fff', fontSize: 11 }}>
                <option value="residential">residential</option><option value="mobile">mobile</option><option value="datacenter">datacenter</option><option value="vpn">vpn</option>
              </select>
            </label>
            <label className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              WALLET ADDRESS — known vs fresh
              <input type="text" value={walletAddress} onChange={e => setWalletAddress(e.target.value)} placeholder="WALLET-... or leave empty" style={{ display: 'block', width: '100%', marginTop: 3, background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '5px 6px', color: '#fff', fontSize: 11 }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={runSimulation} disabled={loading} style={{ fontSize: 10, padding: '6px 14px', fontWeight: 700 }}>
              {loading ? 'SIMULATING...' : '⚡ RUN COUNTERFACTUAL SIMULATION'}
            </button>
            <button className="btn btn-secondary" onClick={resetToBaseline} style={{ fontSize: 10, padding: '6px 12px' }}>RESET TO BASELINE</button>
            <span className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', alignSelf: 'center' }}>Simulation reuses NetraEngine risk aggregation + enforcement; no DB write, no audit, no observatory mutation.</span>
          </div>
          {error && <div className="mono" style={{ fontSize: 10, color: 'var(--state-critical)', marginTop: 8 }}>{error}</div>}
        </div>

        {/* EXPLAINABILITY */}
        {result && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12 }}>
            <div style={{ padding: 12, background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6 }}>WHY THE RESULT DIFFERS • ACTUAL NETRA SIGNALS</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>{result.explainability.why}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--state-critical)', fontWeight: 700 }}>NEW SIGNALS (+)</div>
                  {result.explainability.new_signals.length ? result.explainability.new_signals.map((s, i) => (
                    <div key={i} className="mono" style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '3px 6px', background: 'rgba(239,68,68,0.08)', borderRadius: 2, marginTop: 3, border: '1px solid rgba(239,68,68,0.2)' }}>{s.category} → {s.reason.slice(0, 70)}</div>
                  )) : <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3 }}>None</div>}
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--state-normal)', fontWeight: 700 }}>MITIGATED SIGNALS (−)</div>
                  {result.explainability.mitigated_signals.length ? result.explainability.mitigated_signals.map((s, i) => (
                    <div key={i} className="mono" style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '3px 6px', background: 'rgba(16,185,129,0.08)', borderRadius: 2, marginTop: 3, border: '1px solid rgba(16,185,129,0.2)' }}>{s.category} → {s.reason.slice(0, 70)}</div>
                  )) : <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3 }}>None</div>}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 8 }}>{result.methodological_note}</div>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6 }}>SIGNAL COMPARISON</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>CURRENT SIGNALS ({result.current.signals.length})</div>
                  {result.current.signals.slice(0, 4).map((s, i) => (
                    <div key={i} style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '2px 0', borderBottom: '1px solid var(--border-subtle)' }}>{s.category}: {s.severity.toFixed(0)}/100</div>
                  ))}
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>SIMULATED SIGNALS ({result.simulated.signals.length})</div>
                  {result.simulated.signals.slice(0, 4).map((s, i) => (
                    <div key={i} style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '2px 0', borderBottom: '1px solid var(--border-subtle)' }}>{s.category}: {s.severity.toFixed(0)}/100</div>
                  ))}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 8 }}>Modifications: {Object.entries(result.explainability.modifications_applied).map(([k, v]) => `${k}=${String(v).slice(0, 20)}`).join(' • ') || 'none'}</div>
              <div className="mono" style={{ fontSize: 8, color: 'var(--state-normal)', marginTop: 4, background: 'rgba(16,185,129,0.08)', padding: '4px 6px', borderRadius: 2, border: '1px solid rgba(16,185,129,0.2)' }}>{result.notice}</div>
            </div>
          </div>
        )}

        {!result && (
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', padding: 8, border: '1px dashed var(--border-subtle)', borderRadius: 3 }}>
            Operator insight: Increase <b style={{ color: '#fff' }}>Amount</b> or <b style={{ color: '#fff' }}>Leverage</b> → watch behavioural deviation trust decay and session move MONITORED → VERIFICATION_REQUIRED. Switch <b style={{ color: '#fff' }}>Network</b> to datacenter or <b style={{ color: '#fff' }}>Device</b> to unknown → identity signal appears.
          </div>
        )}
      </div>
    </div>
  )
}
