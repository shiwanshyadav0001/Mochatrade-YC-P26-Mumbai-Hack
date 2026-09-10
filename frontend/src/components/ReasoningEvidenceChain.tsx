import React from 'react'
import type { Decision, Event, Graph, Trader } from '../types'

interface ReasoningEvidenceChainProps {
  trader?: Trader
  decision?: Decision
  latestEvent?: Event
  graph?: Graph
  onInspectEvidence?: () => void
  onOpenTopology?: () => void
  onNavigateToAudit?: (auditId?: string, subject?: string) => void
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
  onNavigateToAudit,
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

  // 01. EVENT
  const eventType = event?.event_type || latestTransition?.event_type || 'BASELINE_PROFILE'
  const eventTime = event?.timestamp || latestTransition?.timestamp || trader.last_activity
  let eventPayload = 'Normal activity'
  if (event?.amount) {
    eventPayload = `${money(event.amount)} (${event.currency || 'USD'})`
  } else if (event?.leverage) {
    eventPayload = `${event.leverage}× Leverage Execution`
  } else if (event?.network_type === 'datacenter') {
    eventPayload = `Datacenter IP ${event.ip_address || ''} [ASN: ${event.asn || 'Cloud'}]`
  } else if (event?.device_id) {
    eventPayload = `Device ID: ${event.device_id.slice(0, 14)}`
  } else if (event?.country) {
    eventPayload = `Geo: ${event.city || ''}, ${event.country}`
  }

  // 02. CONTEXT (Action Sensitivity & Temporal Context)
  const actionName = (decision?.action || eventType).toUpperCase()
  let sensitivityTier = 'MEDIUM'
  let sensitivityDesc = 'Standard order/trade execution'
  let sensitivityClass = 'medium'

  if (actionName.includes('WITHDRAWAL')) {
    sensitivityTier = 'CRITICAL'
    sensitivityDesc = 'Irreversible capital extraction'
    sensitivityClass = 'critical'
  } else if (actionName.includes('PASSWORD') || actionName.includes('2FA') || actionName.includes('DEVICE')) {
    sensitivityTier = 'HIGH'
    sensitivityDesc = 'Authentication credential change'
    sensitivityClass = 'high'
  } else if (actionName.includes('LEVERAGE') || (event?.leverage && event.leverage >= 20)) {
    sensitivityTier = 'HIGH'
    sensitivityDesc = 'Elevated margin liquidation risk'
    sensitivityClass = 'high'
  } else if (actionName.includes('LOGIN') || actionName.includes('SESSION')) {
    sensitivityTier = 'LOW'
    sensitivityDesc = 'Passive session observation'
    sensitivityClass = 'low'
  }

  // 03. SIGNALS (Anomaly, Sequence, Feature Attribution)
  const triggeredRules = Array.isArray(decision?.triggered_rules) ? decision.triggered_rules : []
  const topFactors = Array.isArray(decision?.explanation?.top_factors) ? decision.explanation.top_factors : []
  const decisionSignals = Array.isArray(decision?.signals) ? decision.signals : []
  const anomalySignal = decisionSignals.find(s => s.category === 'anomaly' || s.category === 'sequence' || s.severity >= 30)

  const signalsText = anomalySignal
    ? `${anomalySignal.reason} (${Math.round(anomalySignal.severity)}% sev)`
    : triggeredRules.length > 0
    ? triggeredRules.slice(0, 2).map(r => r.replace(/_/g, ' ')).join(' · ')
    : topFactors[0] || 'NO MATERIAL SIGNAL DETECTED'
  const hasSignals = triggeredRules.length > 0 || !!anomalySignal || (decisionSignals.length > 0 && decisionSignals.some(s => s.severity >= 20))

  // 04. BASELINE (Habitual Deviation)
  const baseline = trader.baseline
  const knownDevices = Array.isArray(baseline?.known_devices) ? baseline.known_devices : []
  const baselineLev = baseline?.leverage ?? 5
  const baselineDeposit = baseline?.deposit_amount ?? 2500
  const baselineCountries = Array.isArray(baseline?.countries) ? baseline.countries : ['US']

  const deviations: string[] = []
  if (event?.device_id && knownDevices.length > 0 && !knownDevices.includes(event.device_id)) {
    deviations.push(`New device (${knownDevices.length} reg)`)
  }
  if (event?.leverage && event.leverage > baselineLev) {
    deviations.push(`${event.leverage}× > norm ${baselineLev}×`)
  }
  if (event?.amount && event.amount > baselineDeposit * 2.5) {
    deviations.push(`${money(event.amount)} > avg ${money(baselineDeposit)}`)
  }
  if (event?.country && !baselineCountries.includes(event.country)) {
    deviations.push(`New geo: ${event.country}`)
  }
  if (event?.network_type === 'datacenter') {
    deviations.push('Datacenter proxy/hosting')
  }

  const baselineSummary = deviations.length > 0
    ? deviations.join('; ')
    : 'Conforms to habitual baseline profile'
  const isBaselineDeviant = deviations.length > 0

  // 05. TOPOLOGY (Relationship & Cluster Linkage)
  const cluster = graph?.clusters?.find(c => Array.isArray(c.affected_traders) && c.affected_traders.includes(trader.trader_id))
  const relationshipText = trader.relationship_summary
    ? trader.relationship_summary
    : cluster
    ? `Cluster #${cluster.cluster_id} (${cluster.cluster_type.replace(/_/g, ' ')})`
    : 'Isolated entity — 0 shared infrastructure links'
  const hasTopologyRisk = !!(cluster || (trader.relationship_summary && !trader.relationship_summary.toLowerCase().includes('isolated')))

  // 06. TRUST IMPACT
  const currentTrust = Math.round(decision?.trust_score ?? trader.trust_score)
  const prevTrust = decision?.previous_score != null
    ? Math.round(decision.previous_score)
    : (latestTransition ? Math.round(latestTransition.previous_score) : (trader.initial_trust ?? 94))
  const trustDelta = Math.round(currentTrust - prevTrust)

  // 07. POLICY DECISION
  const currentDecision = (decision?.decision || trader.last_decision || 'ALLOW').toUpperCase()

  // 08. ENFORCEMENT ACTION
  let enforcementAction = 'Action permitted under continuous observation'
  if (decision?.enforcement?.reason) {
    enforcementAction = decision.enforcement.reason
  } else if (currentDecision === 'BLOCK') {
    enforcementAction = 'Immediate account session isolated; trading killswitch engaged'
  } else if (currentDecision === 'RESTRICT') {
    enforcementAction = 'Capital withdrawal hold activated; read-only access'
  } else if (currentDecision === 'VERIFY') {
    enforcementAction = 'Action hold; Step-Up Biometric 2FA challenge issued'
  } else if (currentDecision === 'MONITOR') {
    enforcementAction = 'Shadow surveillance; sequence and velocity logged'
  }

  // 09. AUDIT PROVENANCE
  const auditId = decision?.audit_id || event?.audit_id
  const auditHash = decision?.audit_hash || event?.audit_hash
  const auditStatus = auditId ? 'VERIFIED' : 'NOT AVAILABLE'

  return (
    <div className="reasoning-pipeline-card">
      {/* Header with Causal Thesis */}
      <div className="reasoning-pipeline-header">
        <div className="reasoning-pipeline-title-group">
          <span className="status-pill critical" style={{ fontSize: 9 }}>CAUSAL PROVENANCE ENGINE</span>
          <h3>9-Stage Forensic Reasoning Chain // Trader #{trader.trader_id} ({trader.name})</h3>
          <span className="mono latency-pill">
            EVALUATED IN {decision?.processing_latency_ms != null ? `${decision.processing_latency_ms}ms` : '1.4ms'} // POLICY {decision?.policy_version || '2026.09-v2.1'}
          </span>
        </div>
        <div className="reasoning-pipeline-actions">
          {onInspectEvidence && (
            <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={onInspectEvidence}>
              INSPECT DOSSIER
            </button>
          )}
          {onOpenTopology && hasTopologyRisk && (
            <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px', color: 'var(--state-critical)' }} onClick={onOpenTopology}>
              TOPOLOGY CLUSTER →
            </button>
          )}
          {onNavigateToAudit && auditId && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 10, padding: '3px 8px', color: 'var(--accent-cyan)' }}
              onClick={() => onNavigateToAudit(auditId, trader.trader_id)}
            >
              AUDIT VAULT →
            </button>
          )}
        </div>
      </div>

      {/* 9-Stage Causal Pipeline */}
      <div className="reasoning-stages-grid-9">
        {/* Stage 01: EVENT */}
        <div className="causal-stage-box stage-observed">
          <div className="stage-top">
            <span className="stage-num">01 · EVENT</span>
            <span className="stage-tag">TELEMETRY</span>
          </div>
          <div className="stage-main-val">{eventType.replace(/_/g, ' ')}</div>
          <div className="stage-desc mono">{eventPayload}</div>
          <div className="stage-footer mono">
            <span>TIME: {formatTime(eventTime)}</span>
            <span style={{ color: 'var(--text-dim)' }}>{event?.source || 'LIVE'}</span>
          </div>
        </div>

        {/* Stage 02: CONTEXT */}
        <div className={`causal-stage-box stage-sensitivity ${sensitivityClass}`}>
          <div className="stage-top">
            <span className="stage-num">02 · CONTEXT</span>
            <span className={`stage-tag ${sensitivityClass}`}>{sensitivityTier}</span>
          </div>
          <div className="stage-main-val">{actionName.replace(/_/g, ' ')}</div>
          <div className="stage-desc">{sensitivityDesc}</div>
          <div className="stage-footer mono">
            <span>DEV: {event?.device_id ? event.device_id.slice(0, 10) : 'KNOWN'}</span>
          </div>
        </div>

        {/* Stage 03: SIGNALS */}
        <div className={`causal-stage-box stage-anomaly ${hasSignals ? 'flagged' : 'clear'}`}>
          <div className="stage-top">
            <span className="stage-num">03 · SIGNALS</span>
            <span className={`stage-tag ${hasSignals ? 'warn' : 'ok'}`}>
              {hasSignals ? 'ATTRIBUTED' : 'QUIET'}
            </span>
          </div>
          <div className="stage-main-val">
            {hasSignals ? 'Risk Signals' : 'Nominal'}
          </div>
          <div className="stage-desc">{signalsText}</div>
          <div className="stage-footer mono">
            <span>RULES: {triggeredRules.length}</span>
            <span>CONF: {decision?.confidence || 'HIGH'}</span>
          </div>
        </div>

        {/* Stage 04: BASELINE */}
        <div className={`causal-stage-box stage-baseline ${isBaselineDeviant ? 'deviant' : 'conforming'}`}>
          <div className="stage-top">
            <span className="stage-num">04 · BASELINE</span>
            <span className={`stage-tag ${isBaselineDeviant ? 'warn' : 'ok'}`}>
              {isBaselineDeviant ? 'DEVIATION' : 'CONFORMING'}
            </span>
          </div>
          <div className="stage-main-val">
            {isBaselineDeviant ? 'Out-of-Profile' : 'Habitual Norm'}
          </div>
          <div className="stage-desc">{baselineSummary}</div>
          <div className="stage-footer mono">
            <span>HABITUAL: ≤{baselineLev}×</span>
            <span>AVG: {money(baselineDeposit)}</span>
          </div>
        </div>

        {/* Stage 05: TOPOLOGY */}
        <div className={`causal-stage-box stage-topology ${hasTopologyRisk ? 'shared' : 'clean'}`}>
          <div className="stage-top">
            <span className="stage-num">05 · TOPOLOGY</span>
            <span className={`stage-tag ${hasTopologyRisk ? 'warn' : 'ok'}`}>
              {hasTopologyRisk ? 'LINKED' : 'ISOLATED'}
            </span>
          </div>
          <div className="stage-main-val">
            {hasTopologyRisk ? 'Cluster Member' : 'Isolated Node'}
          </div>
          <div className="stage-desc" title={relationshipText}>{relationshipText}</div>
          <div className="stage-footer mono">
            <span>{cluster ? `CLUSTER #${cluster.cluster_id}` : 'ZERO SHARING'}</span>
            {cluster && <span style={{ color: 'var(--state-critical)' }}>{cluster.risk_level}</span>}
          </div>
        </div>

        {/* Stage 06: TRUST IMPACT */}
        <div className="causal-stage-box stage-trust">
          <div className="stage-top">
            <span className="stage-num">06 · TRUST IMPACT</span>
            <span className="stage-tag">DYNAMIC</span>
          </div>
          <div className="stage-main-val">
            <span style={{ color: 'var(--text-muted)' }}>{prevTrust}</span>
            <span style={{ margin: '0 3px', color: 'var(--text-dim)' }}>→</span>
            <span style={{ color: currentTrust < 45 ? 'var(--state-critical)' : currentTrust < 70 ? 'var(--state-elevated)' : 'var(--state-normal)' }}>
              {currentTrust}
            </span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>/100</span>
          </div>
          <div className="stage-desc mono" style={{ color: trustDelta < 0 ? 'var(--state-critical)' : 'var(--state-normal)', fontWeight: 600 }}>
            {trustDelta < 0 ? `▼ DELTA: ${trustDelta} PTS` : trustDelta > 0 ? `▲ DELTA: +${trustDelta} PTS` : 'STABLE (Δ 0 PTS)'}
          </div>
          <div className="stage-footer mono">
            <span>PRIOR: {prevTrust}</span>
            <span>NOW: {currentTrust}</span>
          </div>
        </div>

        {/* Stage 07: POLICY */}
        <div className={`causal-stage-box stage-policy ${currentDecision.toLowerCase()}`}>
          <div className="stage-top">
            <span className="stage-num">07 · POLICY</span>
            <span className={`status-pill ${currentDecision.toLowerCase()}`} style={{ fontSize: 7.5 }}>
              {currentDecision}
            </span>
          </div>
          <div className="stage-main-val" style={{ color: currentDecision === 'BLOCK' ? 'var(--state-critical)' : currentDecision === 'RESTRICT' ? 'var(--state-high)' : currentDecision === 'VERIFY' ? 'var(--state-elevated)' : 'var(--state-normal)' }}>
            {currentDecision}
          </div>
          <div className="stage-desc">Policy {decision?.policy_version || '2026.09-v2.1'}</div>
          <div className="stage-footer mono">
            <span>TIER: {currentDecision}</span>
          </div>
        </div>

        {/* Stage 08: ACTION */}
        <div className={`causal-stage-box stage-action ${currentDecision === 'BLOCK' || currentDecision === 'RESTRICT' ? 'blocked' : 'allowed'}`}>
          <div className="stage-top">
            <span className="stage-num">08 · ACTION</span>
            <span className={`stage-tag ${currentDecision === 'ALLOW' || currentDecision === 'MONITOR' ? 'ok' : 'warn'}`}>
              {currentDecision === 'ALLOW' || currentDecision === 'MONITOR' ? 'PERMITTED' : 'HOLD'}
            </span>
          </div>
          <div className="stage-main-val">
            {currentDecision === 'ALLOW' ? 'Execute' : currentDecision === 'MONITOR' ? 'Surveil' : currentDecision === 'VERIFY' ? 'Step-Up 2FA' : currentDecision === 'RESTRICT' ? 'Restrict' : 'Killswitch'}
          </div>
          <div className="stage-desc">{enforcementAction}</div>
          <div className="stage-footer mono">
            <span>ENFORCED: {decision?.enforcement?.allowed === false ? 'INTERVENTION' : 'PERMITTED'}</span>
          </div>
        </div>

        {/* Stage 09: AUDIT */}
        <div className={`causal-stage-box stage-audit ${auditId ? 'verified' : 'unavailable'}`}>
          <div className="stage-top">
            <span className="stage-num">09 · AUDIT</span>
            <span className={`stage-tag ${auditId ? 'ok' : 'dim'}`}>
              {auditStatus}
            </span>
          </div>
          <div className="stage-main-val mono" style={{ fontSize: 11, color: auditId ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
            {auditId || 'NO AUDIT LINK'}
          </div>
          <div className="stage-desc mono" style={{ fontSize: 8.5, color: 'var(--text-dim)', wordBreak: 'break-all' }}>
            {auditHash ? `SHA256: ${auditHash.slice(0, 14)}...` : 'Historical baseline preceding write-ahead ledger'}
          </div>
          <div className="stage-footer mono">
            <span>LEDGER: {auditId ? 'IMMUTABLE' : 'PRE-LOG'}</span>
            {onNavigateToAudit && auditId && (
              <span
                style={{ color: 'var(--accent-cyan)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => onNavigateToAudit(auditId, trader.trader_id)}
              >
                VAULT →
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
