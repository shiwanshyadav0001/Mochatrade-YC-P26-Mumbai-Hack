import React from 'react'
import type { Decision, Event, Graph, Trader } from '../types'

interface ReasoningEvidenceChainProps {
  trader?: Trader
  decision?: Decision
  latestEvent?: Event
  graph?: Graph
  onInspectEvidence?: () => void
  onOpenTopology?: () => void
}

const money = (val?: number) =>
  val !== undefined
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
    : '—'

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'

export function ReasoningEvidenceChain({
  trader,
  decision,
  latestEvent,
  graph,
  onInspectEvidence,
  onOpenTopology,
}: ReasoningEvidenceChainProps) {
  if (!trader) {
    return (
      <div className="reasoning-pipeline-card">
        <div className="reasoning-pipeline-empty">
          SELECT A TRADER TO RECONSTRUCT CAUSAL EVIDENCE CHAIN
        </div>
      </div>
    )
  }

  // Determine latest event
  const event = latestEvent || trader.recent_events?.[0]
  const latestTransition = trader.timeline && trader.timeline.length > 0 ? trader.timeline[trader.timeline.length - 1] : undefined

  // 1. Observed Signal
  const eventType = event?.event_type || latestTransition?.event_type || 'BASELINE_PROFILE'
  const eventTime = event?.timestamp || latestTransition?.timestamp || trader.last_activity
  let eventPayload = 'Normal activity'
  if (event?.amount) {
    eventPayload = `${money(event.amount)} (${event.currency || 'USDT'})`
  } else if (event?.leverage) {
    eventPayload = `${event.leverage}× Leverage Execution`
  } else if (event?.network_type === 'datacenter') {
    eventPayload = `Datacenter IP ${event.ip_address || ''} [ASN: ${event.asn || 'Cloud'}]`
  } else if (event?.device_id) {
    eventPayload = `Device ID: ${event.device_id.slice(0, 14)}`
  } else if (event?.country) {
    eventPayload = `Geo: ${event.city || ''}, ${event.country}`
  }

  // 2. Individual Baseline Deviation
  const baseline = trader.baseline
  const knownDevices = baseline?.known_devices || []
  const baselineLev = baseline?.leverage ?? 5
  const baselineDeposit = baseline?.deposit_amount ?? 2500
  const baselineCountries = baseline?.countries || ['US']

  const deviations: string[] = []
  if (event?.device_id && knownDevices.length > 0 && !knownDevices.includes(event.device_id)) {
    deviations.push(`Device not recognized (${knownDevices.length} known)`)
  }
  if (event?.leverage && event.leverage > baselineLev) {
    deviations.push(`${event.leverage}× lev > baseline max ${baselineLev}×`)
  }
  if (event?.amount && event.amount > baselineDeposit * 3) {
    deviations.push(`${money(event.amount)} exceeds habitual ${money(baselineDeposit)}`)
  }
  if (event?.country && !baselineCountries.includes(event.country)) {
    deviations.push(`New geo: ${event.country} (baseline: ${baselineCountries.join(', ')})`)
  }
  if (event?.network_type === 'datacenter') {
    deviations.push('Datacenter proxy / VPN network type')
  }

  const baselineSummary = deviations.length > 0
    ? deviations.join('; ')
    : 'All parameters conform to individual habitual baseline'
  const isBaselineDeviant = deviations.length > 0

  // 3. Action Sensitivity & Sequence Context
  const actionName = (decision?.action || eventType).toUpperCase()
  let sensitivityTier = 'MEDIUM SENSITIVITY'
  let sensitivityDesc = 'Standard order/trade execution'
  let sensitivityClass = 'medium'

  if (actionName.includes('WITHDRAWAL')) {
    sensitivityTier = 'CRITICAL SENSITIVITY'
    sensitivityDesc = 'Direct irreversible capital extraction'
    sensitivityClass = 'critical'
  } else if (actionName.includes('PASSWORD') || actionName.includes('2FA') || actionName.includes('DEVICE')) {
    sensitivityTier = 'HIGH SENSITIVITY'
    sensitivityDesc = 'Authentication credential modification'
    sensitivityClass = 'high'
  } else if (actionName.includes('LEVERAGE') || (event?.leverage && event.leverage >= 20)) {
    sensitivityTier = 'HIGH SENSITIVITY'
    sensitivityDesc = 'High margin liquidation risk'
    sensitivityClass = 'high'
  } else if (actionName.includes('LOGIN') || actionName.includes('SESSION')) {
    sensitivityTier = 'LOW SENSITIVITY'
    sensitivityDesc = 'Passive session observation'
    sensitivityClass = 'low'
  }

  // 4. Relationship & Topology
  const cluster = graph?.clusters?.find(c => c.affected_traders.includes(trader.trader_id))
  const relationshipText = trader.relationship_summary
    ? trader.relationship_summary
    : cluster
    ? `Member of Cluster #${cluster.cluster_id} (${cluster.cluster_type.replace(/_/g, ' ')})`
    : 'Isolated entity — zero cross-account infrastructure sharing'
  const hasTopologyRisk = !!(cluster || (trader.relationship_summary && !trader.relationship_summary.toLowerCase().includes('isolated')))

  // 5. Anomaly Signals & Rules
  const triggeredRules = decision?.triggered_rules || []
  const topFactors = decision?.explanation.top_factors || []
  const anomalyText = triggeredRules.length > 0
    ? triggeredRules.slice(0, 2).map(r => r.replace(/_/g, ' ')).join(' · ')
    : topFactors[0] || 'Statistical anomaly score within normal threshold'
  const isAnomalous = triggeredRules.length > 0 || (trader.anomaly_score != null && trader.anomaly_score > 0.5)

  // 6. Continuous Trust Impact
  const currentTrust = Math.round(decision?.trust_score ?? trader.trust_score)
  const prevTrust = latestTransition ? Math.round(latestTransition.previous_score) : (trader.initial_trust ?? 94)
  const trustDelta = latestTransition ? Math.round(latestTransition.delta) : (currentTrust - prevTrust)

  // 7. Policy Intervention
  const currentDecision = (decision?.decision || trader.last_decision || 'ALLOW').toUpperCase()
  let enforcementAction = 'Permit action under continuous monitoring'
  if (currentDecision === 'BLOCK') {
    enforcementAction = 'Immediate account killswitch engaged'
  } else if (currentDecision === 'RESTRICT') {
    enforcementAction = 'Withdrawal hold activated; capital preserved'
  } else if (currentDecision === 'VERIFY') {
    enforcementAction = 'Hold action; challenge with Step-Up Biometric 2FA'
  } else if (currentDecision === 'MONITOR') {
    enforcementAction = 'Shadow audit; record event sequence context'
  }

  return (
    <div className="reasoning-pipeline-card">
      {/* Header with Causal Thesis */}
      <div className="reasoning-pipeline-header">
        <div className="reasoning-pipeline-title-group">
          <span className="status-pill critical" style={{ fontSize: 9 }}>CAUSAL REASONING CHAIN</span>
          <h3>Why NETRA Decided This // Trader #{trader.trader_id} ({trader.name})</h3>
          <span className="mono latency-pill">
            EVALUATED IN {decision?.processing_latency_ms != null ? `${decision.processing_latency_ms}ms` : '1.4ms'} // POLICY {decision?.policy_version || 'v2.4-STRICT'}
          </span>
        </div>
        <div className="reasoning-pipeline-actions">
          {onInspectEvidence && (
            <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={onInspectEvidence}>
              INSPECT EVIDENCE DOSSIER
            </button>
          )}
          {onOpenTopology && hasTopologyRisk && (
            <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px', color: 'var(--state-critical)' }} onClick={onOpenTopology}>
              VIEW TOPOLOGY CLUSTER →
            </button>
          )}
        </div>
      </div>

      {/* 7-Stage Causal Pipeline */}
      <div className="reasoning-stages-grid">
        {/* Stage 1: Observed Event */}
        <div className="causal-stage-box stage-observed">
          <div className="stage-top">
            <span className="stage-num">01 · OBSERVED</span>
            <span className="stage-tag">EVENT</span>
          </div>
          <div className="stage-main-val">{eventType.replace(/_/g, ' ')}</div>
          <div className="stage-desc mono">{eventPayload}</div>
          <div className="stage-footer mono">
            <span>TIME: {formatTime(eventTime)}</span>
            <span style={{ color: 'var(--text-dim)' }}>{event?.source || 'LIVE'}</span>
          </div>
        </div>

        <div className="causal-arrow">→</div>

        {/* Stage 2: Individual Baseline Deviation */}
        <div className={`causal-stage-box stage-baseline ${isBaselineDeviant ? 'deviant' : 'conforming'}`}>
          <div className="stage-top">
            <span className="stage-num">02 · BASELINE</span>
            <span className={`stage-tag ${isBaselineDeviant ? 'warn' : 'ok'}`}>
              {isBaselineDeviant ? 'DEVIATION' : 'CONFORMING'}
            </span>
          </div>
          <div className="stage-main-val">
            {isBaselineDeviant ? 'Out-of-Profile' : 'Habitual Baseline'}
          </div>
          <div className="stage-desc">{baselineSummary}</div>
          <div className="stage-footer mono">
            <span>HABITUAL LEV: ≤{baselineLev}×</span>
            <span>AVG: {money(baselineDeposit)}</span>
          </div>
        </div>

        <div className="causal-arrow">→</div>

        {/* Stage 3: Action Sensitivity */}
        <div className={`causal-stage-box stage-sensitivity ${sensitivityClass}`}>
          <div className="stage-top">
            <span className="stage-num">03 · SENSITIVITY</span>
            <span className={`stage-tag ${sensitivityClass}`}>{sensitivityTier.split(' ')[0]}</span>
          </div>
          <div className="stage-main-val">{actionName.replace(/_/g, ' ')}</div>
          <div className="stage-desc">{sensitivityDesc}</div>
          <div className="stage-footer mono">
            <span>FORMULA: RISK × SENSITIVITY</span>
          </div>
        </div>

        <div className="causal-arrow">→</div>

        {/* Stage 4: Relationship & Topology */}
        <div className={`causal-stage-box stage-topology ${hasTopologyRisk ? 'shared' : 'clean'}`}>
          <div className="stage-top">
            <span className="stage-num">04 · TOPOLOGY</span>
            <span className={`stage-tag ${hasTopologyRisk ? 'warn' : 'ok'}`}>
              {hasTopologyRisk ? 'CORRELATED' : 'ISOLATED'}
            </span>
          </div>
          <div className="stage-main-val">
            {hasTopologyRisk ? 'Shared Entity' : 'Clean Topology'}
          </div>
          <div className="stage-desc" title={relationshipText}>{relationshipText}</div>
          <div className="stage-footer mono">
            <span>{cluster ? `CLUSTER #${cluster.cluster_id}` : 'ZERO SHARING'}</span>
            {cluster && <span style={{ color: 'var(--state-critical)' }}>RISK: {cluster.risk_level}</span>}
          </div>
        </div>

        <div className="causal-arrow">→</div>

        {/* Stage 5: Anomaly Signals */}
        <div className={`causal-stage-box stage-anomaly ${isAnomalous ? 'flagged' : 'clear'}`}>
          <div className="stage-top">
            <span className="stage-num">05 · ANOMALY</span>
            <span className={`stage-tag ${isAnomalous ? 'warn' : 'ok'}`}>
              {isAnomalous ? 'TRIGGERED' : 'QUIET'}
            </span>
          </div>
          <div className="stage-main-val">
            {isAnomalous ? 'Multi-Signal Surge' : 'Normal Variance'}
          </div>
          <div className="stage-desc">{anomalyText}</div>
          <div className="stage-footer mono">
            <span>RULES: {triggeredRules.length}</span>
            <span>CONF: {decision?.confidence || 'HIGH'}</span>
          </div>
        </div>

        <div className="causal-arrow">→</div>

        {/* Stage 6: Continuous Trust Transition */}
        <div className="causal-stage-box stage-trust">
          <div className="stage-top">
            <span className="stage-num">06 · TRUST IMPACT</span>
            <span className="stage-tag">DYNAMIC</span>
          </div>
          <div className="stage-main-val">
            <span style={{ color: 'var(--text-muted)' }}>{prevTrust}</span>
            <span style={{ margin: '0 4px', color: 'var(--text-dim)' }}>→</span>
            <span style={{ color: currentTrust < 45 ? 'var(--state-critical)' : currentTrust < 70 ? 'var(--state-elevated)' : 'var(--state-normal)' }}>
              {currentTrust}
            </span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>/100</span>
          </div>
          <div className="stage-desc mono" style={{ color: trustDelta < 0 ? 'var(--state-critical)' : 'var(--state-normal)', fontWeight: 600 }}>
            {trustDelta < 0 ? `▼ DELTA: ${trustDelta} PTS` : trustDelta > 0 ? `▲ DELTA: +${trustDelta} PTS` : 'STABLE (Δ 0 PTS)'}
          </div>
          <div className="stage-footer mono">
            <span>INITIAL: {trader.initial_trust ?? 94}</span>
            <span>CURRENT: {currentTrust}</span>
          </div>
        </div>

        <div className="causal-arrow">→</div>

        {/* Stage 7: Policy Intervention */}
        <div className={`causal-stage-box stage-policy ${currentDecision.toLowerCase()}`}>
          <div className="stage-top">
            <span className="stage-num">07 · POLICY</span>
            <span className={`status-pill ${currentDecision.toLowerCase()}`} style={{ fontSize: 8 }}>
              {currentDecision}
            </span>
          </div>
          <div className="stage-main-val" style={{ color: currentDecision === 'BLOCK' ? 'var(--state-critical)' : currentDecision === 'RESTRICT' ? 'var(--state-high)' : currentDecision === 'VERIFY' ? 'var(--state-elevated)' : 'var(--state-normal)' }}>
            {currentDecision}
          </div>
          <div className="stage-desc">{enforcementAction}</div>
          <div className="stage-footer mono">
            <span>REC: {decision?.explanation.recommendation ? decision.explanation.recommendation.slice(0, 18) + '...' : 'SOP Standard'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
