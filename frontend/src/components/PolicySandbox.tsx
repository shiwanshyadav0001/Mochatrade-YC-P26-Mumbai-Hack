import React, { useState } from 'react'
import { api } from '../api'
import { soundManager } from '../audio'
import type { Policy, PolicySimulationResult } from '../types'

interface PolicySandboxProps {
  policy?: Policy
  onSavePolicy: (policy: Policy) => void
  userRole: string
}

const riskLabels: Record<string, string> = {
  identity: 'IDENTITY / GEO PROFILE',
  behaviour: 'TRADING BEHAVIOUR & LEVERAGE',
  money: 'DEPOSIT DEVIATION',
  device: 'DEVICE FINGERPRINT NOVELTY',
  network: 'DATACENTER / ASN ANOMALY',
  wallet: 'FRESH WITHDRAWAL WALLET',
  relationships: 'SHARED INFRASTRUCTURE RING',
  velocity: 'TRANSACTION VELOCITY BURST',
  sequence: 'MULTI-STEP KILL CHAIN',
  anomaly: 'STATISTICAL Z-SCORE OUTLIER',
}

export function PolicySandbox({ policy, onSavePolicy, userRole }: PolicySandboxProps) {
  const [candidate, setCandidate] = useState<Policy>(
    policy || {
      version: '2026.09-v2.0',
      weights: {},
      action_sensitivity: {},
      velocity_thresholds: {},
      trust_bands: { allow: 90, monitor: 70, verify: 45, restrict: 20 },
    }
  )
  const [simulation, setSimulation] = useState<PolicySimulationResult | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleWeightChange = (key: string, val: number) => {
    setCandidate(prev => ({
      ...prev,
      weights: { ...prev.weights, [key]: val },
    }))
  }

  const handleSensitivityChange = (key: string, val: number) => {
    setCandidate(prev => ({
      ...prev,
      action_sensitivity: { ...prev.action_sensitivity, [key]: val },
    }))
  }

  const runSimulation = async () => {
    setIsSimulating(true)
    try {
      soundManager.playEventTick()
      const res = await api.send<PolicySimulationResult>('POST', '/policy/simulate', candidate)
      setSimulation(res)
      soundManager.playSuccess()
    } catch (err) {
      console.error('Simulation failed:', err)
    } finally {
      setIsSimulating(false)
    }
  }

  const handleCommit = () => {
    if (userRole !== 'ADMIN') {
      alert('Only administrators can commit policy updates to the live risk engine.')
      return
    }
    onSavePolicy(candidate)
    soundManager.playSuccess()
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 3000)
  }

  const handleRevert = () => {
    if (policy) {
      setCandidate(JSON.parse(JSON.stringify(policy)))
      setSimulation(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Control Header */}
      <div className="panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              POLICY ENGINE // ACTIVE VERSION: {policy?.version || '2026.09-v2.0'}
            </div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
              Mathematical Sensitivity & Weight Configuration
            </h2>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleRevert}>
              REVERT BASELINE
            </button>
            <button
              className="btn btn-secondary"
              disabled={isSimulating}
              onClick={runSimulation}
            >
              {isSimulating ? 'SIMULATING...' : 'RUN HISTORICAL SIMULATION (50 EVENTS)'}
            </button>
            <button
              className="btn btn-primary"
              disabled={userRole !== 'ADMIN'}
              onClick={handleCommit}
            >
              {savedSuccess ? 'COMMITTED TO OS' : 'COMMIT TO LIVE ENGINE'}
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Weights & Sensitivity */}
      <div className="grid-12">
        <div className="col-6">
          <div className="panel">
            <div className="panel-header">
              <h3>Dimensional Risk Weights (%)</h3>
              <span className="panel-meta">NORMALIZED MULTI-VECTOR CONTRIBUTION</span>
            </div>
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(candidate.weights || {}).map(([key, val]) => (
                <div
                  key={key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr 50px',
                    alignItems: 'center',
                    gap: 12,
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: 6,
                  }}
                >
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {riskLabels[key] || key}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={val}
                    onChange={e => handleWeightChange(key, Number(e.target.value))}
                    style={{ accentColor: 'var(--accent-cobalt)', height: 4 }}
                  />
                  <span className="mono" style={{ fontSize: 11, textAlign: 'right', fontWeight: 600 }}>
                    {val}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-6">
          <div className="panel">
            <div className="panel-header">
              <h3>Action Sensitivity Matrix</h3>
              <span className="panel-meta">INTERVENTION SEVERITY (0-100)</span>
            </div>
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(candidate.action_sensitivity || {}).map(([key, val]) => (
                <div
                  key={key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr 50px',
                    alignItems: 'center',
                    gap: 12,
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: 6,
                  }}
                >
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {key.replace(/_/g, ' ')}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={val}
                    onChange={e => handleSensitivityChange(key, Number(e.target.value))}
                    style={{ accentColor: 'var(--accent-cobalt)', height: 4 }}
                  />
                  <span className="mono" style={{ fontSize: 11, textAlign: 'right', fontWeight: 600 }}>
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Simulation Results Comparator */}
      {simulation && (
        <div className="panel">
          <div className="panel-header">
            <h3>Pre-Commit Simulation Outcome</h3>
            <span className="panel-meta">
              EVALUATED {simulation.evaluated_events} EVENTS // LATENCY IMPACT: +{simulation.estimated_latency_delta_ms}MS
            </span>
          </div>

          <div style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
              {['ALLOW', 'MONITOR', 'VERIFY', 'RESTRICT'].map(status => {
                const curr = simulation.current_distribution[status] || 0
                const sim = simulation.simulated_distribution[status] || 0
                const delta = sim - curr

                return (
                  <div
                    key={status}
                    style={{
                      background: 'var(--bg-surface-0)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 4,
                      padding: 10,
                    }}
                  >
                    <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                      <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {curr}
                      </span>
                      <span className="mono" style={{ color: 'var(--text-dim)' }}>→</span>
                      <strong className="mono" style={{ fontSize: 18, color: '#fff' }}>
                        {sim}
                      </strong>
                    </div>
                    <div className="mono" style={{ fontSize: 9, color: delta === 0 ? 'var(--text-dim)' : delta > 0 ? 'var(--state-critical)' : 'var(--state-normal)', marginTop: 4 }}>
                      {delta === 0 ? 'NO DELTA' : delta > 0 ? `+${delta} EVENTS` : `${delta} EVENTS`}
                    </div>
                  </div>
                )
              })}
            </div>

            {simulation.divergences.length > 0 ? (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>DECISION ID</th>
                      <th>TRADER</th>
                      <th>ACTION</th>
                      <th>TRUST SCORE</th>
                      <th>CURRENT POLICY</th>
                      <th>SIMULATED OUTCOME</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.divergences.map(div => (
                      <tr key={div.decision_id}>
                        <td className="mono">{div.decision_id}</td>
                        <td className="mono">#{div.trader_id}</td>
                        <td>{div.action}</td>
                        <td className="mono">{Math.round(div.trust_score)} / 100</td>
                        <td><span className={`status-pill ${div.current.toLowerCase()}`}>{div.current}</span></td>
                        <td><span className={`status-pill ${div.simulated.toLowerCase()}`}>{div.simulated}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mono" style={{ fontSize: 11, color: 'var(--state-normal)', textAlign: 'center', padding: 8 }}>
                ZERO TRANSACTION BEHAVIOURAL DIVERGENCE DETECTED ON THIS SAMPLE
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
