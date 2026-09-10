import React, { useState, useMemo, useEffect } from 'react'
import { api } from '../api'
import { soundManager } from '../audio'
import type { Policy, PolicySimulationResult, Trader, Decision, UserRole } from '../types'

interface PolicyMatrixSimulatorProps {
  policy?: Policy
  onSavePolicy: (policy: Policy) => Promise<void> | void
  userRole: UserRole | string
  onInspectTrader?: (trader: Trader) => void
  onInspectEvidence?: (decision?: Decision, event?: any, trader?: Trader) => void
  allTraders?: Trader[]
  allDecisions?: Decision[]
}

const riskLabels: Record<string, string> = {
  identity: 'IDENTITY / GEO PROFILE',
  behaviour: 'TRADING BEHAVIOUR & LEVERAGE',
  money: 'DEPOSIT DEVIATION',
  device: 'DEVICE NOVELTY & HARDWARE',
  network: 'DATACENTER / PROXY ASN',
  wallet: 'FRESH CRYPTO WALLET',
  relationships: 'SHARED INFRASTRUCTURE RING',
  velocity: 'TRANSACTION VELOCITY BURST',
  sequence: 'MULTI-STEP KILL CHAIN',
  anomaly: 'STATISTICAL ML OUTLIER',
}

const actionDescriptions: Record<string, string> = {
  WITHDRAWAL: 'Funds extraction to bank or external crypto address',
  CHANGE_API_KEY: 'Programmatic trading key generation / modification',
  NEW_WALLET: 'Registering new unwhitelisted destination address',
  CHANGE_2FA: 'Multi-factor authentication hardware/software update',
  CHANGE_PASSWORD: 'Account credential rotation',
  LEVERAGED_TRADE: 'High-multiplier derivative exposure (>10x)',
  TRADE: 'Standard spot execution within balance limits',
  DEPOSIT: 'Capital injection from external source',
  LOGIN: 'Session initiation from web or mobile endpoint',
  PROFILE_VIEW: 'Passive account telemetry and portfolio viewing',
}

const tierRank: Record<string, number> = {
  ALLOW: 1,
  MONITOR: 2,
  VERIFY: 3,
  RESTRICT: 4,
  BLOCK: 5,
}

export const PolicyMatrixSimulator: React.FC<PolicyMatrixSimulatorProps> = ({
  policy,
  onSavePolicy,
  userRole,
  onInspectTrader,
  onInspectEvidence,
  allTraders = [],
  allDecisions = [],
}) => {
  // Candidate policy state
  const [candidate, setCandidate] = useState<Policy>(() => {
    return (
      policy || {
        version: '2026.09-v2.0',
        weights: {
          identity: 10,
          behaviour: 15,
          money: 15,
          device: 10,
          network: 10,
          wallet: 10,
          relationships: 10,
          velocity: 5,
          sequence: 10,
          anomaly: 5,
        },
        action_sensitivity: {
          PROFILE_VIEW: 10,
          LOGIN: 30,
          TRADE: 50,
          LEVERAGED_TRADE: 70,
          DEPOSIT: 50,
          WITHDRAWAL: 95,
          CHANGE_PASSWORD: 85,
          CHANGE_2FA: 85,
          CHANGE_API_KEY: 95,
          NEW_WALLET: 90,
        },
        velocity_thresholds: { events_per_hour: 12, wallet_changes_24h: 2 },
        trust_bands: { allow: 90, monitor: 70, verify: 45, restrict: 20, block: 15 },
      }
    )
  })

  // Sync candidate when policy prop updates
  useEffect(() => {
    if (policy) {
      setCandidate(JSON.parse(JSON.stringify(policy)))
    }
  }, [policy])

  const [activePreset, setActivePreset] = useState<'BASELINE' | 'LOCKDOWN' | 'TRAVEL' | 'CUSTOM'>('BASELINE')
  const [simulation, setSimulation] = useState<PolicySimulationResult | null>(null)
  const [isSimulating, setIsSimulating] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const [divergenceFilter, setDivergenceFilter] = useState<'ALL' | 'TIGHTENED' | 'RELAXED'>('ALL')
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false)

  // Candidate updates
  const handleWeightChange = (key: string, val: number) => {
    setActivePreset('CUSTOM')
    setCandidate(prev => ({
      ...prev,
      weights: { ...prev.weights, [key]: Math.max(0, Math.min(100, val)) },
    }))
  }

  const handleSensitivityChange = (key: string, val: number) => {
    setActivePreset('CUSTOM')
    setCandidate(prev => ({
      ...prev,
      action_sensitivity: { ...prev.action_sensitivity, [key]: Math.max(0, Math.min(100, val)) },
    }))
  }

  const handleBandChange = (key: string, val: number) => {
    setActivePreset('CUSTOM')
    setCandidate(prev => ({
      ...prev,
      trust_bands: { ...prev.trust_bands, [key]: Math.max(0, Math.min(100, val)) },
    }))
  }

  const handleVelocityChange = (key: string, val: number) => {
    setActivePreset('CUSTOM')
    setCandidate(prev => ({
      ...prev,
      velocity_thresholds: { ...prev.velocity_thresholds, [key]: Math.max(1, val) },
    }))
  }

  // Presets
  const applyPreset = (preset: 'BASELINE' | 'LOCKDOWN' | 'TRAVEL') => {
    setActivePreset(preset)
    soundManager.playEventTick()
    if (preset === 'BASELINE') {
      if (policy) {
        setCandidate(JSON.parse(JSON.stringify(policy)))
      }
      setSaveNotice('RESTORED ACTIVE DEPLOYED BASELINE POLICY.')
    } else if (preset === 'LOCKDOWN') {
      setCandidate(prev => ({
        ...prev,
        trust_bands: { allow: 95, monitor: 80, verify: 60, restrict: 35, block: 25 },
        action_sensitivity: {
          ...prev.action_sensitivity,
          WITHDRAWAL: 100,
          CHANGE_PASSWORD: 95,
          CHANGE_2FA: 95,
          CHANGE_API_KEY: 100,
          NEW_WALLET: 98,
          LEVERAGED_TRADE: 85,
          TRADE: 65,
          DEPOSIT: 60,
        },
        velocity_thresholds: { events_per_hour: 6, wallet_changes_24h: 1 },
      }))
      setSaveNotice('APPLIED PRESET: HIGH-SECURITY PROTOCOL LOCKDOWN.')
    } else if (preset === 'TRAVEL') {
      setCandidate(prev => ({
        ...prev,
        trust_bands: { allow: 85, monitor: 65, verify: 40, restrict: 20, block: 10 },
        action_sensitivity: {
          ...prev.action_sensitivity,
          WITHDRAWAL: 85,
          LOGIN: 20,
          PROFILE_VIEW: 10,
          TRADE: 45,
          DEPOSIT: 40,
        },
        velocity_thresholds: { events_per_hour: 24, wallet_changes_24h: 3 },
      }))
      setSaveNotice('APPLIED PRESET: TRAVEL & HIGH-VOLUME EXPEDITION.')
    }
    setTimeout(() => setSaveNotice(null), 4000)
  }

  // Simulation Execution
  const runSimulation = async () => {
    setIsSimulating(true)
    setErrorNotice(null)
    try {
      soundManager.playEventTick()
      const res = await api.send<PolicySimulationResult>('POST', '/policy/simulate', candidate)
      setSimulation(res)
      soundManager.playSuccess()
      setSaveNotice(`SIMULATION COMPLETE: ${res.evaluated_events} HISTORICAL DECISIONS EVALUATED.`)
      setTimeout(() => setSaveNotice(null), 4000)
    } catch (err: any) {
      console.error('Simulation error:', err)
      setErrorNotice(err.message || 'Counterfactual simulation failed to execute.')
    } finally {
      setIsSimulating(false)
    }
  }

  // Commit Execution (Admin only)
  const handleCommitConfirm = async () => {
    setShowConfirmModal(false)
    if (userRole !== 'ADMIN') {
      setErrorNotice('Only administrators can commit policy updates to the live risk engine.')
      return
    }
    setIsSaving(true)
    try {
      await onSavePolicy(candidate)
      soundManager.playSuccess()
      setSaveNotice(`POLICY VERSION COMMITTED AND SEALED IN SHA-256 AUDIT LEDGER.`)
      setTimeout(() => setSaveNotice(null), 4000)
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to commit policy.')
    } finally {
      setIsSaving(false)
    }
  }

  // Derived Simulation Metrics
  const simulationMetrics = useMemo(() => {
    if (!simulation) return null

    const divergences = simulation.divergences || []
    const affectedTraders = new Set(divergences.map(d => d.trader_id))
    
    // Directional transition counts
    const transitionCounts: Record<string, number> = {}
    let netPostureShift = 0
    let tightenedCount = 0
    let relaxedCount = 0

    divergences.forEach(d => {
      const key = `${d.current} → ${d.simulated}`
      transitionCounts[key] = (transitionCounts[key] || 0) + 1
      const delta = (tierRank[d.simulated] || 0) - (tierRank[d.current] || 0)
      netPostureShift += delta
      if (delta > 0) tightenedCount++
      if (delta < 0) relaxedCount++
    })

    // Plain English executive explanation
    let postureText = 'NEUTRAL / BALANCED SHIFT'
    let postureSummary = 'Decisions remain balanced with negligible net enforcement posture change.'
    if (netPostureShift > 0) {
      postureText = `STRINGENCY INCREASED (+${netPostureShift} TIER SHIFT)`
      postureSummary = `Candidate policy increases risk enforcement stringency across ${affectedTraders.size} trader accounts (${tightenedCount} escalations vs ${relaxedCount} relaxations).`
    } else if (netPostureShift < 0) {
      postureText = `STRINGENCY RELAXED (${netPostureShift} TIER SHIFT)`
      postureSummary = `Candidate policy lowers intervention friction, reclassifying ${relaxedCount} transactions toward more permissive enforcement tiers across ${affectedTraders.size} traders.`
    }

    return {
      affectedTradersCount: affectedTraders.size,
      totalDivergences: simulation.total_divergences,
      netPostureShift,
      postureText,
      postureSummary,
      tightenedCount,
      relaxedCount,
      transitionCounts,
    }
  }, [simulation])

  // Filtered Divergence Rows
  const filteredDivergences = useMemo(() => {
    if (!simulation) return []
    return (simulation.divergences || []).filter(div => {
      const delta = (tierRank[div.simulated] || 0) - (tierRank[div.current] || 0)
      if (divergenceFilter === 'TIGHTENED') return delta > 0
      if (divergenceFilter === 'RELAXED') return delta < 0
      return true
    })
  }, [simulation, divergenceFilter])

  return (
    <div className="policy-matrix-container">
      {/* Top Header & Telemetry Bar */}
      <div className="policy-top-bar">
        <div className="policy-brand">
          <span className="live-pulse-dot" style={{ background: 'var(--accent-cobalt)' }} />
          <div>
            <div className="policy-title">POLICY MATRIX & COUNTERFACTUAL SIMULATOR</div>
            <div className="policy-subtitle">
              INSTITUTIONAL RISK POSTURE // RE-EVALUATE 50 HISTORICAL DECISIONS PRE-COMMIT
            </div>
          </div>
        </div>

        <div className="policy-header-controls">
          {/* Preset Selector */}
          <div className="preset-pill-group">
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginRight: 4 }}>
              PRESETS:
            </span>
            <button
              className={`preset-pill ${activePreset === 'BASELINE' ? 'active' : ''}`}
              onClick={() => applyPreset('BASELINE')}
            >
              BASELINE
            </button>
            <button
              className={`preset-pill ${activePreset === 'LOCKDOWN' ? 'active' : ''}`}
              onClick={() => applyPreset('LOCKDOWN')}
            >
              LOCKDOWN
            </button>
            <button
              className={`preset-pill ${activePreset === 'TRAVEL' ? 'active' : ''}`}
              onClick={() => applyPreset('TRAVEL')}
            >
              TRAVEL
            </button>
          </div>

          <button
            className="btn btn-secondary"
            style={{ fontSize: 10, padding: '5px 10px' }}
            onClick={() => applyPreset('BASELINE')}
          >
            REVERT
          </button>

          <button
            className="btn btn-warning"
            style={{ fontSize: 10, padding: '5px 12px' }}
            onClick={runSimulation}
            disabled={isSimulating}
          >
            {isSimulating ? 'SIMULATING...' : '⚡ RUN SIMULATION'}
          </button>

          <button
            className="btn btn-primary"
            style={{ fontSize: 10, padding: '5px 12px' }}
            onClick={() => setShowConfirmModal(true)}
            disabled={userRole !== 'ADMIN' || isSaving}
            title={userRole !== 'ADMIN' ? 'Admin role required to commit policy updates' : 'Commit policy to live engine'}
          >
            {isSaving ? 'COMMITTING...' : 'COMMIT TO LIVE ENGINE'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveNotice && (
        <div className="policy-notice-banner notice-success">
          <span className="mono" style={{ fontWeight: 700 }}>SYSTEM ACK:</span>
          <span>{saveNotice}</span>
        </div>
      )}

      {errorNotice && (
        <div className="policy-notice-banner notice-error">
          <span className="mono" style={{ fontWeight: 700 }}>ERROR:</span>
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="policy-modal-overlay">
          <div className="policy-modal-content">
            <div className="modal-title mono">CONFIRM LIVE ENGINE POLICY UPDATE</div>
            <p style={{ fontSize: 11, color: 'var(--text-primary)', margin: '10px 0' }}>
              You are about to commit candidate policy parameters to the live NETRA risk engine.
              This action will be permanently recorded and chained into the <b>SHA-256 Audit Vault</b> and broadcast to all active trader sessions.
            </p>
            <div style={{ background: 'var(--bg-surface-2)', padding: 10, borderRadius: 4, fontSize: 10, marginBottom: 14 }}>
              <div className="mono">TARGET VERSION: {candidate.version || '2026.09-v2.0'}</div>
              <div className="mono">ROLE AUTHORIZATION: {userRole}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>
                CANCEL
              </button>
              <button className="btn btn-primary" onClick={handleCommitConfirm}>
                CONFIRM & COMMIT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Dual-Column Matrix Layout */}
      <div className="grid-12" style={{ marginTop: 12 }}>
        {/* Left Column: Trust Bands & Velocity Thresholds (col-5) */}
        <div className="col-5">
          <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
            <div className="panel-header" style={{ padding: '0 0 8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3>Trust Enforcement Bands</h3>
              <span className="panel-meta">SCORE THRESHOLDS (0–100)</span>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Defines minimum continuous trust score required for each platform enforcement tier.
            </div>

            {/* Trust Bands Sliders */}
            <div className="trust-bands-editor">
              {['allow', 'monitor', 'verify', 'restrict', 'block'].map(bandKey => {
                const val = candidate.trust_bands?.[bandKey] ?? 50
                const baseVal = policy?.trust_bands?.[bandKey] ?? 50
                const delta = val - baseVal
                const pillClass = bandKey.toLowerCase()

                return (
                  <div key={bandKey} className="band-edit-row">
                    <div className="band-row-head">
                      <span className={`status-pill ${pillClass}`} style={{ fontSize: 9 }}>
                        {bandKey.toUpperCase()}
                      </span>
                      <span className="mono band-delta">
                        BASELINE: {baseVal} | CANDIDATE: <b style={{ color: '#fff' }}>{val}</b>
                        {delta !== 0 && (
                          <span style={{ color: delta > 0 ? 'var(--accent-crimson)' : 'var(--accent-emerald)', marginLeft: 6 }}>
                            ({delta > 0 ? `+${delta}` : delta})
                          </span>
                        )}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={val}
                        onChange={e => handleBandChange(bandKey, Number(e.target.value))}
                        className="policy-slider"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={val}
                        onChange={e => handleBandChange(bandKey, Number(e.target.value))}
                        className="policy-num-input mono"
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Velocity Burst Thresholds */}
            <div className="panel-header" style={{ padding: '8px 0 6px 0', borderBottom: '1px solid var(--border-subtle)', marginTop: 8 }}>
              <h3>Velocity & Burst Limits</h3>
              <span className="panel-meta">TEMPORAL RATE LIMITS</span>
            </div>

            <div className="velocity-controls-grid">
              <div className="velocity-item">
                <span className="velocity-label mono">MAX EVENTS / HOUR:</span>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={candidate.velocity_thresholds?.events_per_hour ?? 12}
                  onChange={e => handleVelocityChange('events_per_hour', Number(e.target.value))}
                  className="policy-num-input mono"
                />
              </div>

              <div className="velocity-item">
                <span className="velocity-label mono">WALLET CHANGES / 24H:</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={candidate.velocity_thresholds?.wallet_changes_24h ?? 2}
                  onChange={e => handleVelocityChange('wallet_changes_24h', Number(e.target.value))}
                  className="policy-num-input mono"
                />
              </div>
            </div>

            {/* Dimensional Risk Weights Accordion / Compact List */}
            <div className="panel-header" style={{ padding: '8px 0 6px 0', borderBottom: '1px solid var(--border-subtle)', marginTop: 8 }}>
              <h3>Multi-Factor Penalty Weights (%)</h3>
              <span className="panel-meta">CONTRIBUTION RATIO</span>
            </div>

            <div className="risk-weights-compact-list">
              {Object.entries(candidate.weights || {}).map(([key, val]) => {
                const baseVal = policy?.weights?.[key] ?? val
                return (
                  <div key={key} className="weight-compact-row">
                    <span className="mono weight-key-label" title={riskLabels[key] || key}>
                      {key.toUpperCase()}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={val}
                      onChange={e => handleWeightChange(key, Number(e.target.value))}
                      className="policy-slider-mini"
                    />
                    <span className="mono weight-val-label">
                      {val}% {val !== baseVal && <span style={{ color: 'var(--accent-amber)' }}>*</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Action Sensitivity Matrix (col-7) */}
        <div className="col-7">
          <div className="panel" style={{ height: '100%', padding: 12, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header" style={{ padding: '0 0 8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3>Action Sensitivity Matrix</h3>
              <span className="panel-meta">INTERVENTION SEVERITY (0–100)</span>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
              Higher sensitivity causes platform interventions (`STEP_UP_MFA`, `RESTRICT`, `BLOCK`) to trigger at higher trust scores.
            </div>

            {/* Actions Grid */}
            <div className="action-sensitivity-scroll">
              {Object.entries(candidate.action_sensitivity || {}).map(([actionKey, val]) => {
                const baseVal = policy?.action_sensitivity?.[actionKey] ?? val
                const delta = val - baseVal
                const isCritical = val >= 85

                return (
                  <div key={actionKey} className="action-sensitivity-card">
                    <div className="action-card-top">
                      <div>
                        <span className="mono action-name-tag" style={{ color: isCritical ? 'var(--accent-crimson)' : '#fff' }}>
                          {actionKey}
                        </span>
                        <div className="action-desc-text">
                          {actionDescriptions[actionKey] || 'Platform transaction action'}
                        </div>
                      </div>

                      <div className="action-values-box mono">
                        <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                          BASE: {baseVal}
                        </span>
                        <span className="mono action-curr-val" style={{ color: isCritical ? 'var(--accent-crimson)' : 'var(--accent-cyan)' }}>
                          {val}
                        </span>
                        {delta !== 0 && (
                          <span
                            className="mono"
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: delta > 0 ? 'var(--accent-crimson)' : 'var(--accent-emerald)',
                            }}
                          >
                            ({delta > 0 ? `+${delta}` : delta})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="action-slider-row">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={val}
                        onChange={e => handleSensitivityChange(actionKey, Number(e.target.value))}
                        className="policy-slider"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={val}
                        onChange={e => handleSensitivityChange(actionKey, Number(e.target.value))}
                        className="policy-num-input mono"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Simulation Results & Counterfactual Impact Section */}
      <div style={{ marginTop: 14 }}>
        {simulation ? (
          <div className="panel simulation-results-panel">
            {/* Simulation Header */}
            <div className="panel-header" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="live-pulse-dot" style={{ background: 'var(--accent-emerald)' }} />
                <h3>Counterfactual Simulation Outcome</h3>
              </div>
              <span className="panel-meta">
                SAMPLE: {simulation.evaluated_events} RECENT DECISIONS // LATENCY DELTA: +{simulation.estimated_latency_delta_ms}MS
              </span>
            </div>

            <div style={{ padding: 14 }}>
              {/* Executive KPI Cards */}
              <div className="grid-12" style={{ marginBottom: 14 }}>
                <div className="col-3">
                  <div className="sim-kpi-card">
                    <span className="sim-kpi-label mono">EVALUATED EVENTS</span>
                    <span className="sim-kpi-val mono">{simulation.evaluated_events}</span>
                    <span className="sim-kpi-meta">Historical decisions sample</span>
                  </div>
                </div>

                <div className="col-3">
                  <div className="sim-kpi-card">
                    <span className="sim-kpi-label mono">DECISIONS RECLASSIFIED</span>
                    <span className="sim-kpi-val mono" style={{ color: simulation.total_divergences > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                      {simulation.total_divergences}
                    </span>
                    <span className="sim-kpi-meta">
                      {simulation.evaluated_events > 0
                        ? `${Math.round((simulation.total_divergences / simulation.evaluated_events) * 100)}% divergence rate`
                        : '0% divergence'}
                    </span>
                  </div>
                </div>

                <div className="col-3">
                  <div className="sim-kpi-card">
                    <span className="sim-kpi-label mono">AFFECTED TRADERS</span>
                    <span className="sim-kpi-val mono" style={{ color: 'var(--accent-cyan)' }}>
                      {simulationMetrics?.affectedTradersCount || 0}
                    </span>
                    <span className="sim-kpi-meta">Unique accounts impacted</span>
                  </div>
                </div>

                <div className="col-3">
                  <div className="sim-kpi-card">
                    <span className="sim-kpi-label mono">NET ENFORCEMENT POSTURE</span>
                    <span
                      className="sim-kpi-val mono"
                      style={{
                        fontSize: 13,
                        color:
                          (simulationMetrics?.netPostureShift || 0) > 0
                            ? 'var(--accent-crimson)'
                            : (simulationMetrics?.netPostureShift || 0) < 0
                            ? 'var(--accent-emerald)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {simulationMetrics?.postureText}
                    </span>
                    <span className="sim-kpi-meta">
                      {simulationMetrics?.tightenedCount || 0} tightened / {simulationMetrics?.relaxedCount || 0} relaxed
                    </span>
                  </div>
                </div>
              </div>

              {/* 10-Second Plain-English Synthesis Banner */}
              <div className="policy-synthesis-banner">
                <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                  EXECUTIVE IMPACT ANALYSIS:
                </span>
                <span style={{ marginLeft: 8 }}>{simulationMetrics?.postureSummary}</span>
              </div>

              {/* Distribution Delta Comparator Bars */}
              <div className="distribution-bars-container">
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
                  ENFORCEMENT TIER POPULATION SHIFT (CURRENT VS. COUNTERFACTUAL):
                </div>

                <div className="grid-12">
                  {['ALLOW', 'MONITOR', 'VERIFY', 'RESTRICT', 'BLOCK'].map(tier => {
                    const curr = simulation.current_distribution[tier] || 0
                    const sim = simulation.simulated_distribution[tier] || 0
                    const delta = sim - curr
                    const pillClass = tier.toLowerCase()

                    return (
                      <div key={tier} className="col-2" style={{ width: '20%' }}>
                        <div className="tier-dist-box">
                          <span className={`status-pill ${pillClass}`}>{tier}</span>
                          <div className="tier-numbers-row mono">
                            <span style={{ color: 'var(--text-muted)' }}>{curr}</span>
                            <span style={{ color: 'var(--text-dim)' }}>→</span>
                            <span style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>{sim}</span>
                          </div>
                          <div
                            className="mono tier-delta-pill"
                            style={{
                              color: delta === 0 ? 'var(--text-dim)' : delta > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                            }}
                          >
                            {delta === 0 ? 'NO DELTA' : delta > 0 ? `+${delta} EVENTS` : `${delta} EVENTS`}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Directional Transition Pills */}
              {simulationMetrics && Object.keys(simulationMetrics.transitionCounts).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                    OBSERVED CLASSIFICATION MIGRATIONS:
                  </div>
                  <div className="transition-pills-row">
                    {Object.entries(simulationMetrics.transitionCounts).map(([transKey, count]) => (
                      <div key={transKey} className="transition-badge mono">
                        <span className="trans-path">{transKey}</span>
                        <span className="trans-count">{count} {count === 1 ? 'event' : 'events'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Divergence Detail Table */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                    DECISION RECLASSIFICATION DRILL-DOWN ({filteredDivergences.length})
                  </div>

                  <div className="divergence-filter-btns">
                    <button
                      className={`div-filter-btn ${divergenceFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setDivergenceFilter('ALL')}
                    >
                      ALL ({simulation.divergences?.length || 0})
                    </button>
                    <button
                      className={`div-filter-btn ${divergenceFilter === 'TIGHTENED' ? 'active' : ''}`}
                      onClick={() => setDivergenceFilter('TIGHTENED')}
                    >
                      TIGHTENED ({simulationMetrics?.tightenedCount || 0})
                    </button>
                    <button
                      className={`div-filter-btn ${divergenceFilter === 'RELAXED' ? 'active' : ''}`}
                      onClick={() => setDivergenceFilter('RELAXED')}
                    >
                      RELAXED ({simulationMetrics?.relaxedCount || 0})
                    </button>
                  </div>
                </div>

                {filteredDivergences.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                    {simulation.total_divergences === 0
                      ? '✓ ZERO TRANSACTION DIVERGENCE: Current and candidate policies produce identical decisions across this sample.'
                      : 'No decisions match active divergence filter.'}
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="data-table" style={{ width: '100%', fontSize: 10 }}>
                      <thead>
                        <tr>
                          <th>DECISION ID</th>
                          <th>TRADER</th>
                          <th>ACTION</th>
                          <th>TRUST STANDING</th>
                          <th>CURRENT POLICY</th>
                          <th>COUNTERFACTUAL</th>
                          <th>IMPACT</th>
                          <th>DRILL-DOWN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDivergences.map(div => {
                          const delta = (tierRank[div.simulated] || 0) - (tierRank[div.current] || 0)
                          const matchedTrader = allTraders.find(t => t.trader_id === div.trader_id)
                          const matchedDecision = allDecisions.find(d => d.decision_id === div.decision_id)

                          return (
                            <tr key={div.decision_id}>
                              <td className="mono" style={{ color: 'var(--text-dim)' }}>
                                {div.decision_id}
                              </td>
                              <td className="mono">
                                <strong style={{ color: 'var(--accent-cyan)' }}>#{div.trader_id}</strong>
                              </td>
                              <td className="mono">{div.action}</td>
                              <td className="mono">
                                <span style={{ color: div.trust_score < 45 ? 'var(--accent-crimson)' : 'var(--accent-amber)' }}>
                                  {Math.round(div.trust_score)} / 100
                                </span>
                              </td>
                              <td>
                                <span className={`status-pill ${div.current.toLowerCase()}`}>
                                  {div.current}
                                </span>
                              </td>
                              <td>
                                <span className={`status-pill ${div.simulated.toLowerCase()}`}>
                                  {div.simulated}
                                </span>
                              </td>
                              <td>
                                <span
                                  className="mono"
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: delta > 0 ? 'var(--accent-crimson)' : 'var(--accent-emerald)',
                                  }}
                                >
                                  {delta > 0 ? `▲ TIGHTENED (+${delta})` : `▼ RELAXED (${delta})`}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  {matchedTrader && onInspectTrader && (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ fontSize: 8, padding: '2px 5px' }}
                                      onClick={() => onInspectTrader(matchedTrader)}
                                    >
                                      TRADER
                                    </button>
                                  )}
                                  {onInspectEvidence && (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ fontSize: 8, padding: '2px 5px' }}
                                      onClick={() => onInspectEvidence(matchedDecision, undefined, matchedTrader)}
                                    >
                                      EVIDENCE
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="panel" style={{ padding: 24, textAlign: 'center', border: '1px dashed var(--border-subtle)' }}>
            <div className="mono" style={{ fontSize: 13, color: '#fff', marginBottom: 6 }}>
              READY TO SIMULATE COUNTERFACTUAL POLICY
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 600, margin: '0 auto 14px auto' }}>
              Adjust candidate sensitivity, weights, or trust bands above, then click <b>"RUN SIMULATION"</b> to test the policy against historical platform decisions without modifying live production state.
            </p>
            <button className="btn btn-warning" style={{ fontSize: 11, padding: '8px 18px' }} onClick={runSimulation} disabled={isSimulating}>
              {isSimulating ? 'SIMULATING...' : '⚡ RUN HISTORICAL SIMULATION (LAST 50 DECISIONS)'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
