import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { soundManager } from '../audio'
import type {
  ActionEvaluationResult,
  Decision,
  Event,
  Trader,
} from '../types'

interface ContinuousTradingSafetyProps {
  trader?: Trader
  allTraders: Trader[]
  decisions: Decision[]
  events: Event[]
  selectedId: string
  onSelectTrader?: (traderId: string) => void
  onNavigate?: (view: string, traderId?: string) => void
  onRefreshAll: () => Promise<void>
  onOpenStepUpModal?: (traderId: string) => void
  onOpenRecoveryModal?: (traderId: string) => void
}

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'

const money = (val?: number) =>
  val !== undefined
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
    : '—'

export function ContinuousTradingSafety({
  trader,
  allTraders,
  decisions,
  events,
  selectedId,
  onSelectTrader,
  onRefreshAll,
  onOpenStepUpModal,
  onOpenRecoveryModal,
}: ContinuousTradingSafetyProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [playSpeed, setPlaySpeed] = useState<'NORMAL' | 'FAST'>('NORMAL')
  const [isStepping, setIsStepping] = useState<boolean>(false)
  const [stepHistory, setStepHistory] = useState<Record<string, unknown>[]>([])
  const [demoNotice, setDemoNotice] = useState<string>('')
  const [actionEvalResult, setActionEvalResult] = useState<ActionEvaluationResult | null>(null)
  const [evaluatingAction, setEvaluatingAction] = useState<boolean>(false)

  const activeTrader = useMemo(() => {
    return allTraders.find(t => t.trader_id === selectedId) || trader
  }, [allTraders, selectedId, trader])

  const totalSteps = 8
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const executeStepForward = useCallback(async (): Promise<boolean> => {
    if (currentStepIndex >= totalSteps) {
      setIsPlaying(false)
      return false
    }
    setIsStepping(true)
    try {
      soundManager.playEventTick()
      const res = await api.send<Record<string, unknown>>('POST', '/simulator/step', { scenario: 'CONTINUOUS_TRADING' })
      setStepHistory(prev => [...prev.slice(0, currentStepIndex), res])
      const nextIndex = currentStepIndex + 1
      setCurrentStepIndex(nextIndex)

      const decision = res.decision as Decision | undefined
      if (decision?.trust_score !== undefined && decision.trust_score < 45) {
        soundManager.playThreatAlert()
      }

      const trustVal = (res as Record<string, unknown>).trust_score ?? decision?.trust_score ?? '—'
      const event = res.event as Event | undefined
      setDemoNotice(
        `STEP ${nextIndex}/${totalSteps}: ${event?.event_type || 'Event'} processed // Trust: ${trustVal}`
      )

      if (event?.trader_id && onSelectTrader) {
        onSelectTrader(event.trader_id)
      }

      await onRefreshAll()

      if ((res as Record<string, unknown>).complete || nextIndex >= totalSteps) {
        setIsPlaying(false)
        return false
      }
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Step execution failed.'
      setDemoNotice(msg)
      setIsPlaying(false)
      return false
    } finally {
      setIsStepping(false)
    }
  }, [currentStepIndex, totalSteps, onRefreshAll, onSelectTrader])

  const handlePrevStep = async () => {
    if (currentStepIndex <= 0 || isStepping) return
    setIsPlaying(false)
    if (timerRef.current) clearInterval(timerRef.current)

    setIsStepping(true)
    const targetStep = currentStepIndex - 1
    try {
      soundManager.playEventTick()
      await api.send('POST', '/simulator/reset')
      if (targetStep === 0) {
        setCurrentStepIndex(0)
        setStepHistory([])
        setDemoNotice('RESET TO BASELINE PROFILE (STEP 0)')
        await onRefreshAll()
        return
      }

      const newHistory: Record<string, unknown>[] = []
      for (let i = 0; i < targetStep; i++) {
        const res = await api.send<Record<string, unknown>>('POST', '/simulator/step', { scenario: 'CONTINUOUS_TRADING' })
        newHistory.push(res)
      }
      setStepHistory(newHistory)
      setCurrentStepIndex(targetStep)
      setDemoNotice(`ROLLED BACK TO STEP ${targetStep}/${totalSteps}`)
      await onRefreshAll()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rollback failed.'
      setDemoNotice(msg)
    } finally {
      setIsStepping(false)
    }
  }

  const handleReset = async () => {
    setIsPlaying(false)
    if (timerRef.current) clearInterval(timerRef.current)
    setIsStepping(true)
    try {
      soundManager.playSuccess()
      await api.send('POST', '/simulator/reset')
      setCurrentStepIndex(0)
      setStepHistory([])
      setActionEvalResult(null)
      setDemoNotice('SCENARIO RESET: Initial Trader Habitual Baseline Restored')
      await onRefreshAll()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed.'
      setDemoNotice(msg)
    } finally {
      setIsStepping(false)
    }
  }

  const evaluateCurrentAction = async (action: string, amount?: number) => {
    if (!activeTrader) return
    setEvaluatingAction(true)
    try {
      const res = await api.send<ActionEvaluationResult>('POST', '/actions/evaluate', {
        trader_id: activeTrader.trader_id,
        action: action,
        amount: amount,
      })
      setActionEvalResult(res)
      soundManager.playEventTick()
      setDemoNotice(`ACTION EVALUATION: ${action} for #${activeTrader.trader_id} -> ${res.decision}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Evaluation failed'
      setDemoNotice(`Action evaluation failed: ${msg}`)
    } finally {
      setEvaluatingAction(false)
    }
  }

  const handleStepUp = async () => {
    if (!activeTrader || !onOpenStepUpModal) return
    onOpenStepUpModal(activeTrader.trader_id)
  }

  const handleRecovery = async () => {
    if (!activeTrader || !onOpenRecoveryModal) return
    onOpenRecoveryModal(activeTrader.trader_id)
  }

  useEffect(() => {
    if (isPlaying) {
      const intervalMs = playSpeed === 'FAST' ? 700 : 1500
      timerRef.current = setInterval(async () => {
        const canContinue = await executeStepForward()
        if (!canContinue && timerRef.current) {
          clearInterval(timerRef.current)
        }
      }, intervalMs)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPlaying, playSpeed, executeStepForward])

  const activeStepResult = useMemo(() => {
    if (currentStepIndex === 0) return null
    return stepHistory[currentStepIndex - 1] || null
  }, [currentStepIndex, stepHistory])

  const activeEvent = (activeStepResult?.event as Event | undefined) || events.find(e => e.trader_id === '7842') || events[0]
  const activeDecision = (activeStepResult?.decision as Decision | undefined) || decisions.find(d => d.trader_id === '7842')
  const activeTrust = (activeStepResult?.trust_score as number | undefined) ?? activeDecision?.trust_score ?? activeTrader?.trust_score ?? 94.0
  const priorTrust = activeDecision?.previous_score ?? 94.0
  const trustDelta = Math.round((activeTrust - priorTrust) * 10) / 10
  const activeDecisionStr = activeDecision?.decision ?? 'ALLOW'

  const explanation = activeDecision?.explanation || {}
  const primaryDrivers = (explanation as { primary_drivers?: unknown[] }).primary_drivers || []
  const whatChanged = explanation.what_changed as Record<string, unknown> | undefined

  const trustColor = activeTrust < 25 ? 'var(--state-critical)' : activeTrust < 50 ? 'var(--state-high)' : activeTrust < 75 ? 'var(--state-elevated)' : 'var(--state-normal)'

  const decisionPillClass = (dec: string) => {
    switch (dec) {
      case 'ALLOW': return 'normal'
      case 'MONITOR': return 'guarded'
      case 'VERIFY': return 'elevated'
      case 'RESTRICT': return 'high'
      case 'BLOCK': return 'critical'
      default: return 'normal'
    }
  }

  const steps = [
    { step: 1, event_type: 'LOGIN', title: 'Session Initiation', severity: 'NORMAL' },
    { step: 2, event_type: 'TRADE', title: 'Normal Trade #1', severity: 'NORMAL' },
    { step: 3, event_type: 'TRADE', title: 'Normal Trade #2', severity: 'NORMAL' },
    { step: 4, event_type: 'TRADE', title: 'Normal Trade #3', severity: 'NORMAL' },
    { step: 5, event_type: 'LEVERAGE_CHANGE', title: 'Leverage Spike (25x)', severity: 'ELEVATED' },
    { step: 6, event_type: 'TRADE', title: 'High-Leverage Trade', severity: 'HIGH' },
    { step: 7, event_type: 'TRADE', title: 'Escalating Volume', severity: 'HIGH' },
    { step: 8, event_type: 'WITHDRAWAL', title: 'Withdrawal to Fresh Wallet', severity: 'CRITICAL' },
  ]

  return (
    <div className="continuous-trading-safety">
      <div className="demo-engine-header">
        <div className="demo-engine-title-group">
          <div className="demo-kicker mono">
            NETRA // CONTINUOUS TRUST INTELLIGENCE // CONTINUOUS TRADING SAFETY
          </div>
          <h2 className="demo-title">
            <span>CONTINUOUS TRADING SAFETY PROTOCOL</span>
            <span className="priority-pill priority-critical">LIVE SESSION</span>
          </h2>
          <div className="demo-thesis mono">
            Authentication establishes identity. Continuous trust evaluates every action in context.
          </div>
        </div>
        <div className="demo-engine-quick-controls">
          <button
            className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              if (isPlaying) {
                setIsPlaying(false)
              } else {
                if (currentStepIndex >= totalSteps) {
                  handleReset().then(() => setIsPlaying(true))
                } else {
                  setIsPlaying(true)
                }
              }
            }}
            disabled={isStepping}
            style={{ fontWeight: 700, padding: '8px 16px', letterSpacing: '0.5px' }}
          >
            {isPlaying ? '⏸ PAUSE DEMO' : '⚡ RUN CONTINUOUS TRADING DEMO'}
          </button>
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px',
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
              NETRA DIFFERENTIATOR
            </span>
            <span className="status-pill critical" style={{ fontSize: 8 }}>CONTINUOUS vs STATIC</span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Traditional exchanges authenticate once at login. NETRA continuously models dynamic trust decay, behavioral entropy, execution velocity, and network topology across ALL in-flight trading events.
          </p>
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', textAlign: 'right' }}>
          <div>TRUST ENGINE: ACTIVE</div>
          <div style={{ color: 'var(--state-normal)', fontWeight: 600 }}>100% OPERATIONAL FIDELITY</div>
        </div>
      </div>

      <div className="grid-12" style={{ marginBottom: 16 }}>
        <div className="col-7">
          <div className="panel">
            <div className="panel-header">
              <h3>ACTIVE TRADING SESSION</h3>
              <span className="panel-meta">TRADER #{activeTrader?.trader_id} • {activeTrader?.name} • {activeTrader?.segment}</span>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: '12px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>CURRENT TRUST</div>
                  <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: trustColor }}>
                    {activeTrust.toFixed(1)}
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}> / 100</div>
                </div>
                <div style={{ padding: '12px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>SESSION STATE</div>
                    <span className={`status-pill ${(activeTrader?.session_risk_state || 'SESSION_NORMAL').toLowerCase().replace(/_/g,'-')}`} style={{ fontSize: 10 }}>
                      {activeTrader?.session_risk_state || 'SESSION_NORMAL'}
                    </span>
                  </div>
                </div>
                <div style={{ padding: '12px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>LAST DECISION</div>
                    <span className={`status-pill ${decisionPillClass(activeDecisionStr)}`} style={{ fontSize: 10 }}>
                      {activeDecisionStr}
                    </span>
                  </div>
                </div>
                <div style={{ padding: '12px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>TRUST Δ THIS EVENT</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: trustDelta < 0 ? 'var(--state-critical)' : trustDelta > 0 ? 'var(--state-normal)' : 'var(--text-dim)' }}>
                      {trustDelta > 0 ? '+' : ''}{trustDelta.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>
                  TRUST TRAJECTORY — STEP-BY-STEP
                </div>
                <div className="demo-stepper-track" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                  {steps.map((stepDef, idx) => {
                    const stepNum = idx + 1
                    const isCompleted = stepNum < currentStepIndex
                    const isActive = stepNum === currentStepIndex
                    const stepData = stepHistory[idx] as Record<string, unknown> | undefined
                    const score = (stepData?.trust_score as number | undefined) ?? (stepData?.decision as Decision | undefined)?.trust_score
                    const dec = (stepData?.decision as Decision | undefined)?.decision

                    return (
                      <div
                        key={stepDef.step}
                        className={`demo-step-node ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
                        style={{ minWidth: 140, flexShrink: 0 }}
                      >
                        <div className="node-top">
                          <span className="mono" style={{ fontSize: 9 }}>STEP 0{stepNum}</span>
                          <span className={`priority-pill priority-${(dec || stepDef.severity).toLowerCase()}`} style={{ fontSize: 8 }}>
                            {dec || stepDef.severity}
                          </span>
                        </div>
                        <div className="node-type mono" style={{ fontSize: 10 }}>{stepDef.event_type}</div>
                        <div className="node-title" style={{ fontSize: 9 }}>{stepDef.title}</div>
                        <div className="node-score mono">
                          {score !== undefined ? `${Math.round(score as number)}/100` : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="demo-playback-bar">
                <div className="btn-group">
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 10, padding: '4px 10px' }}
                    disabled={currentStepIndex <= 0 || isStepping}
                    onClick={handlePrevStep}
                  >
                    ⏮ PREV
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 10, padding: '4px 10px' }}
                    disabled={currentStepIndex >= totalSteps || isStepping}
                    onClick={() => executeStepForward()}
                  >
                    {isStepping ? 'PROCESSING...' : '⏭ NEXT'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 10, padding: '4px 10px' }}
                    disabled={isStepping}
                    onClick={handleReset}
                  >
                    ↺ RESET
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>SPEED:</span>
                  <button
                    className={`ctrl-btn ${playSpeed === 'NORMAL' ? 'ctrl-play' : ''}`}
                    style={{ fontSize: 9, padding: '2px 8px' }}
                    onClick={() => setPlaySpeed('NORMAL')}
                  >
                    1.5s
                  </button>
                  <button
                    className={`ctrl-btn ${playSpeed === 'FAST' ? 'ctrl-play' : ''}`}
                    style={{ fontSize: 9, padding: '2px 8px' }}
                    onClick={() => setPlaySpeed('FAST')}
                  >
                    0.7s
                  </button>
                </div>
              </div>

              {demoNotice && (
                <div className="demo-notice mono" style={{ marginTop: 8 }}>
                  {demoNotice}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-5">
          <div className="panel" style={{ height: '100%', minHeight: 520, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header">
              <h3>LIVE ACTION EVALUATION</h3>
              <span className="panel-meta">REAL-TIME ENFORCEMENT GATEWAY</span>
            </div>
            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>
                  TEST ACTION AGAINST CURRENT TRUST STATE
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 9, padding: '6px 12px' }}
                    onClick={() => evaluateCurrentAction('TRADE', 2000)}
                    disabled={evaluatingAction}
                  >
                    TRADE $2K
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 9, padding: '6px 12px' }}
                    onClick={() => evaluateCurrentAction('TRADE', 15000)}
                    disabled={evaluatingAction}
                  >
                    TRADE $15K
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 9, padding: '6px 12px' }}
                    onClick={() => evaluateCurrentAction('LEVERAGE_CHANGE')}
                    disabled={evaluatingAction}
                  >
                    LEVERAGE 50x
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 9, padding: '6px 12px', fontWeight: 700 }}
                    onClick={() => evaluateCurrentAction('WITHDRAWAL', 25000)}
                    disabled={evaluatingAction}
                  >
                    WITHDRAW $25K
                  </button>
                </div>
              </div>

              {actionEvalResult && (
                <div style={{
                  padding: '16px',
                  background: 'var(--bg-surface-0)',
                  border: `1px solid ${actionEvalResult.decision === 'ALLOW' ? 'var(--state-normal)' : actionEvalResult.decision === 'MONITOR' ? 'var(--state-elevated)' : actionEvalResult.decision === 'VERIFY' ? 'var(--state-high)' : 'var(--state-critical)'}`,
                  borderRadius: 'var(--radius-xs)',
                  marginBottom: 16,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>ENFORCEMENT DECISION</div>
                      <span className={`status-pill ${decisionPillClass(actionEvalResult.decision)}`} style={{ fontSize: 12, fontWeight: 700 }}>
                        {actionEvalResult.decision}
                      </span>
                    </div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: trustColor }}>
                      {actionEvalResult.trust_score.toFixed(1)}/100
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {actionEvalResult.reason}
                  </div>
                  {actionEvalResult.requires_step_up && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                      <div className="mono" style={{ fontSize: 9, color: 'var(--accent-blue)', marginBottom: 8 }}>
                        ⚠ STEP-UP VERIFICATION REQUIRED
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 9, padding: '6px 12px' }}
                          onClick={handleStepUp}
                        >
                          INITIATE STEP-UP
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 9, padding: '6px 12px' }}
                          onClick={handleRecovery}
                        >
                          RECOVERY (P-04)
                        </button>
                      </div>
                    </div>
                  )}
                  {actionEvalResult.active_protocols && actionEvalResult.active_protocols.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>
                        ACTIVE PROTOCOLS:
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {actionEvalResult.active_protocols.map(p => (
                          <span
                            key={p}
                            className="mono"
                            style={{
                              fontSize: 8.5,
                              padding: '2px 6px',
                              borderRadius: 3,
                              background: p === 'P-03' ? 'rgba(239, 68, 68, 0.2)' : p === 'P-02' ? 'rgba(245, 158, 11, 0.2)' : p === 'P-04' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                              color: p === 'P-03' ? 'var(--state-critical)' : p === 'P-02' ? 'var(--state-high)' : p === 'P-04' ? '#60a5fa' : 'var(--state-normal)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {p}
                          </span>
                        ))}
                        {actionEvalResult.opt_in_protocol && (
                          <span
                            className="mono"
                            style={{
                              fontSize: 8.5,
                              padding: '2px 6px',
                              borderRadius: 3,
                              background: 'rgba(56, 189, 248, 0.2)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.4)',
                            }}
                          >
                            🛡️ {actionEvalResult.opt_in_protocol}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeEvent && (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', marginBottom: 8 }}>
                    CURRENT TELEMETRY EVENT
                  </div>
                  <div style={{
                    padding: '12px',
                    background: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: 10,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div><span style={{ color: 'var(--text-dim)' }}>EVENT ID:</span> <span className="mono">{activeEvent.event_id}</span></div>
                      <div><span style={{ color: 'var(--text-dim)' }}>TYPE:</span> <strong className="mono">{activeEvent.event_type}</strong></div>
                      <div><span style={{ color: 'var(--text-dim)' }}>AMOUNT:</span> <span className="mono">{money(activeEvent.amount)}</span></div>
                      <div><span style={{ color: 'var(--text-dim)' }}>LEVERAGE:</span> <span className="mono">{activeEvent.leverage ? `${activeEvent.leverage}x` : '—'}</span></div>
                      <div><span style={{ color: 'var(--text-dim)' }}>DEVICE:</span> <span className="mono">{activeEvent.device_id || '—'}</span></div>
                      <div><span style={{ color: 'var(--text-dim)' }}>IP:</span> <span className="mono">{activeEvent.ip_address || '—'}</span></div>
                      <div><span style={{ color: 'var(--text-dim)' }}>WALLET:</span> <span className="mono">{activeEvent.wallet_address || '—'}</span></div>
                      <div><span style={{ color: 'var(--text-dim)' }}>TIME:</span> <span className="mono">{formatTime(activeEvent.timestamp)}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {primaryDrivers.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', marginBottom: 8 }}>
                    PRIMARY RISK DRIVERS
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {primaryDrivers.slice(0, 4).map((driver: unknown, i: number) => {
                      const d = driver as { name: string; severity: number; reason: string }
                      return (
                      <div
                        key={i}
                        className="driver-card"
                        style={{
                          padding: '8px 10px',
                          background: 'var(--bg-surface-0)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          borderLeft: `3px solid ${d.severity > 60 ? 'var(--state-critical)' : d.severity > 30 ? 'var(--state-high)' : 'var(--state-normal)'}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="driver-name" style={{ fontSize: 10, fontWeight: 600 }}>{d.name}</span>
                          <span className="mono" style={{ fontSize: 9, color: d.severity > 60 ? 'var(--state-critical)' : d.severity > 30 ? 'var(--state-high)' : 'var(--text-dim)' }}>
                            {d.severity}/100
                          </span>
                        </div>
                        <div className="driver-reason" style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>{d.reason}</div>
                      </div>
                    )})}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeTrader && activeTrader.baseline && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <h3>BASELINE DEVIATION ANALYSIS</h3>
            <span className="panel-meta">HABITUAL BEHAVIOR vs CURRENT OBSERVATION</span>
          </div>
          <div style={{ padding: '16px' }}>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>DIMENSION</th>
                  <th>HABITUAL BASELINE</th>
                  <th>CURRENT OBSERVATION</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono" style={{ fontWeight: 600 }}>TRADE SIZE</td>
                  <td className="mono">~${(activeTrader.baseline.deposit_amount ?? 3000).toLocaleString()} (avg)</td>
                  <td className="mono" style={{ color: activeEvent?.amount && activeEvent.amount > 10000 ? 'var(--state-critical)' : '#fff' }}>
                    {money(activeEvent?.amount)}
                  </td>
                  <td className="mono">
                    {activeEvent?.amount && activeEvent.amount > 10000
                      ? `+${Math.round((activeEvent.amount / (activeTrader.baseline.deposit_amount || 3000) - 1) * 100)}% ANOMALOUS SURGE`
                      : 'WITHIN BASELINE'}
                  </td>
                </tr>
                <tr>
                  <td className="mono" style={{ fontWeight: 600 }}>LEVERAGE</td>
                  <td className="mono">{activeTrader.baseline.leverage || 3}x typical</td>
                  <td className="mono">{activeEvent?.leverage ? `${activeEvent.leverage}x` : '1x'}</td>
                  <td className="mono">
                    {activeEvent?.leverage && activeEvent.leverage > 20
                      ? 'DESTABILIZING VOLATILITY SURGE'
                      : 'WITHIN MARGIN BUFFER'}
                  </td>
                </tr>
                <tr>
                  <td className="mono" style={{ fontWeight: 600 }}>DEVICE</td>
                  <td className="mono">Known: {(activeTrader.baseline.known_devices || ['DEV-7842-PRIMARY']).join(', ')}</td>
                  <td className="mono">{activeEvent?.device_id || '—'}</td>
                  <td className="mono">
                    {activeEvent?.device_id && activeTrader.baseline.known_devices && !activeTrader.baseline.known_devices.includes(activeEvent.device_id)
                      ? 'UNRECOGNIZED HARDWARE'
                      : 'KNOWN HARDWARE'}
                  </td>
                </tr>
                <tr>
                  <td className="mono" style={{ fontWeight: 600 }}>NETWORK</td>
                  <td className="mono">Residential (IN)</td>
                  <td className="mono">{activeEvent?.ip_address || '—'} ({activeEvent?.network_type || 'residential'})</td>
                  <td className="mono">
                    {activeEvent?.network_type === 'datacenter'
                      ? 'DATACENTER PROXY DETECTED'
                      : 'RESIDENTIAL VERIFIED'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <h3>CAUSAL EVIDENCE CHAIN</h3>
          <span className="panel-meta">SHA-256 AUDIT VAULT • DECISION PROVENANCE</span>
        </div>
        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={{ padding: '12px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>LATEST DECISION</div>
            <div className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{activeDecision?.decision_id || '—'}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{activeDecision?.decision || '—'}</div>
          </div>
          <div style={{ padding: '12px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>AUDIT RECORD</div>
            <div className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{activeDecision?.audit_id || '—'}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{activeDecision?.audit_hash ? activeDecision.audit_hash.slice(0, 16) + '…' : '—'}</div>
          </div>
          <div style={{ padding: '12px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>EVENT</div>
            <div className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{activeEvent?.event_id || '—'}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{activeEvent?.audit_hash ? activeEvent.audit_hash.slice(0, 16) + '…' : '—'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
