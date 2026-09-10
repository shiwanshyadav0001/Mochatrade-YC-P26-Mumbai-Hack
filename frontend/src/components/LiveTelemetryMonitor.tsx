import React, { useMemo, useState } from 'react'
import type { ActionEvaluationResult, Analytics, Decision, Event, Graph, Trader } from '../types'
import { InteractiveGraph } from './InteractiveGraph'
import { ReasoningEvidenceChain } from './ReasoningEvidenceChain'

interface LiveTelemetryMonitorProps {
  events: Event[]
  decisions: Decision[]
  traders: Trader[]
  selectedId: string
  selected: Trader | undefined
  latestDecision: Decision | undefined
  connected: boolean
  analytics: Analytics | undefined
  autoFocus: boolean
  recentEventIds: string[]
  lastEventTime: string | null
  graph: Graph | undefined
  onSelectTrader: (id: string) => void
  onToggleAutoFocus: (val: boolean) => void
  onInspectEvent: (event: Event) => void
  onInspectDecision: (decision: Decision) => void
  onInspectTrader: (trader: Trader) => void
  onCreateCase: () => void
  onStepUp: (traderId: string) => void
  onNavigateView: (view: any) => void
  onReconnectStream: () => void
  onExportCSV: () => void
  onEvaluateAction?: (action: string) => void
  evaluatingAction?: boolean
  actionEvalResult?: ActionEvaluationResult | null
}

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'

const money = (value?: number) =>
  value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

const riskLabels: Record<string, string> = {
  identity: 'Identity Profile',
  behaviour: 'Trading Behaviour',
  money: 'Deposit Deviation',
  device: 'Device Novelty',
  network: 'Datacenter / ASN',
  wallet: 'Destination Wallet',
  relationships: 'Shared Infrastructure',
  velocity: 'Velocity Surge',
  sequence: 'Kill Chain Sequence',
  anomaly: 'Statistical Outlier',
}

function analyzeEventBaseline(ev: Event, t?: Trader) {
  if (!t || !t.baseline) {
    return {
      isNormal: true,
      summary: 'Establishing baseline norms (insufficient history)',
      deviationBadge: 'BASELINE FORMING',
      severity: 'normal' as const,
      details: [] as string[],
    }
  }

  const baseline = t.baseline
  const deviations: string[] = []
  let severity: 'normal' | 'elevated' | 'high' | 'critical' = 'normal'

  // Amount comparison
  if (ev.amount != null && baseline.deposit_amount) {
    const ratio = ev.amount / baseline.deposit_amount
    if (ratio >= 8) {
      deviations.push(`Amount $${ev.amount.toLocaleString()} is ${ratio.toFixed(1)}× baseline max ($${baseline.deposit_amount.toLocaleString()})`)
      severity = 'critical'
    } else if (ratio >= 2.5) {
      deviations.push(`Amount $${ev.amount.toLocaleString()} is ${ratio.toFixed(1)}× baseline ($${baseline.deposit_amount.toLocaleString()})`)
      severity = 'elevated'
    }
  }

  // Leverage comparison
  if (ev.leverage != null && baseline.leverage) {
    const levRatio = ev.leverage / baseline.leverage
    if (levRatio >= 4) {
      deviations.push(`Leverage ${ev.leverage}× exceeds baseline norm ${baseline.leverage}× by ${levRatio.toFixed(1)}×`)
      if (severity !== 'critical') severity = 'high'
    }
  }

  // Device check
  if (ev.device_id && baseline.known_devices && baseline.known_devices.length > 0) {
    const isKnown = baseline.known_devices.includes(ev.device_id)
    if (!isKnown) {
      deviations.push(`Hardware ID ${ev.device_id} not in ${baseline.known_devices.length} registered hardware profile(s)`)
      if (severity === 'normal') severity = 'elevated'
    }
  }

  // Network / Datacenter check
  if (ev.network_type === 'datacenter') {
    deviations.push(`Datacenter hosting facility / proxy ASN detected (${ev.ip_address || 'Anonymizer'})`)
    severity = 'critical'
  }

  // Country check
  if (ev.country && baseline.countries && baseline.countries.length > 0) {
    const isKnownCountry = baseline.countries.includes(ev.country)
    if (!isKnownCountry) {
      deviations.push(`Geographic origin ${ev.country} novel relative to registered locations (${baseline.countries.join(', ')})`)
      if (severity !== 'critical') severity = 'high'
    }
  }

  // Wallet check
  if (ev.wallet_address && baseline.known_wallets && baseline.known_wallets.length > 0) {
    const isKnownWallet = baseline.known_wallets.includes(ev.wallet_address)
    if (!isKnownWallet) {
      deviations.push(`Fresh unlinked destination wallet: ${ev.wallet_address}`)
      if (severity !== 'critical') severity = 'high'
    }
  }

  const isNormal = deviations.length === 0
  const summary = isNormal
    ? 'Within standard behavioral envelope for this trader profile'
    : deviations[0]

  const deviationBadge = isNormal
    ? 'WITHIN BASELINE NORMS'
    : severity === 'critical'
    ? 'CRITICAL BASELINE DEVIATION'
    : severity === 'high'
    ? 'SIGNIFICANT ANOMALY'
    : 'ELEVATED CONTEXT'

  return {
    isNormal,
    summary,
    deviationBadge,
    severity,
    details: deviations,
  }
}

function getCausalChain(ev: Event, trader?: Trader, decision?: Decision) {
  const baselineAnalysis = analyzeEventBaseline(ev, trader)

  // 1. WHAT JUST HAPPENED?
  let whatHappened = `${ev.event_type.replace(/_/g, ' ')}`
  if (ev.amount != null) whatHappened += ` of $${ev.amount.toLocaleString()} ${ev.currency || 'USD'}`
  if (ev.leverage != null) whatHappened += ` with ${ev.leverage}× leverage`
  if (ev.device_id) whatHappened += ` on hardware [${ev.device_id}]`
  if (ev.ip_address) whatHappened += ` from IP ${ev.ip_address} (${ev.network_type || 'residential'})`
  if (ev.country) whatHappened += ` in ${ev.country}`
  if (ev.wallet_address) whatHappened += ` targeting destination ${ev.wallet_address}`

  // 2. WHO DID IT?
  const whoDidIt = trader
    ? `Trader #${trader.trader_id} (${trader.name}) — ${trader.segment || 'PRO TRADER'}, ${trader.event_count || 0} telemetry events recorded`
    : `Trader #${ev.trader_id}`

  // 3. IS IT NORMAL FOR THEM?
  const isNormalForThem = baselineAnalysis.summary

  // 4. WHAT CHANGED?
  const currentScore = decision ? Math.round(decision.trust_score) : (trader ? Math.round(trader.trust_score) : 94)
  const prevScore = decision?.previous_score != null ? Math.round(decision.previous_score) : (trader?.initial_trust ?? 94)
  const delta = currentScore - prevScore
  const whatChanged = decision
    ? `Continuous Trust Score shifted ${prevScore} → ${currentScore}/100 (${delta < 0 ? `▼ ${delta}` : delta > 0 ? `▲ +${delta}` : 'Δ 0'} pts). Risk status: ${decision.risk_level}. Policy outcome: ${decision.decision}.`
    : `Current trust score at ${currentScore}/100.`

  // 5. WHY DOES IT MATTER?
  let whyItMatters = decision?.explanation?.summary || ''
  if (decision?.triggered_rules && decision.triggered_rules.length > 0) {
    whyItMatters += ` Triggered policies: ${decision.triggered_rules.join(', ')}.`
  }
  if (!whyItMatters) {
    whyItMatters = baselineAnalysis.isNormal
      ? 'Routine activity within acceptable bounds. Behavioral baselines and velocity parameters are fully preserved.'
      : `Anomalous pattern identified: ${baselineAnalysis.details.join('; ')}.`
  }

  // 6. WHAT SHOULD OPERATOR DO NEXT?
  const recommendation = decision?.explanation?.recommendation || (
    decision?.decision === 'BLOCK'
      ? 'High confidence threat. Block transaction execution immediately, freeze trader session, and escalate incident case.'
      : decision?.decision === 'RESTRICT'
      ? 'Place withdrawal on policy hold. Require step-up biometric re-authentication prior to funds release.'
      : decision?.decision === 'VERIFY'
      ? 'Issue step-up verification challenge to re-authenticate trader credentials and establish continuous trust.'
      : decision?.decision === 'MONITOR'
      ? 'Maintain elevated telemetry observation. Review adjacent cluster activity.'
      : 'Maintain standard passive continuous monitoring.'
  )

  return {
    whatHappened,
    whoDidIt,
    isNormalForThem,
    whatChanged,
    whyItMatters,
    recommendation,
    baselineAnalysis,
    delta,
    currentScore,
    prevScore,
  }
}

export function LiveTelemetryMonitor({
  events,
  decisions,
  traders,
  selectedId,
  selected,
  latestDecision,
  connected,
  analytics,
  autoFocus,
  recentEventIds,
  lastEventTime,
  graph,
  onSelectTrader,
  onToggleAutoFocus,
  onInspectEvent,
  onInspectDecision,
  onInspectTrader,
  onCreateCase,
  onStepUp,
  onNavigateView,
  onReconnectStream,
  onExportCSV,
  onEvaluateAction,
  evaluatingAction,
  actionEvalResult,
}: LiveTelemetryMonitorProps) {
  // Local Filtering and Scoping State
  const [scope, setScope] = useState<'FLEET' | 'FOCUSED'>('FLEET')
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)

  // Fleet Population Metrics
  const populationStats = useMemo(() => {
    const total = traders.length || 106
    const trusted = traders.filter(t => t.trust_score >= 70).length
    const monitored = traders.filter(t => t.trust_score >= 45 && t.trust_score < 70).length
    const critical = traders.filter(t => t.trust_score < 45).length
    return { total, trusted, monitored, critical }
  }, [traders])

  // Dynamic Focus Candidates
  const dynamicFocusTraders = useMemo(() => {
    const primary = traders.find(t => t.trader_id === '7842')
    const degraded = traders
      .filter(t => t.trader_id !== '7842' && t.trust_score < 70)
      .sort((a, b) => a.trust_score - b.trust_score)
    const others = traders.filter(t => t.trader_id !== '7842' && t.trust_score >= 70)
    const list: Trader[] = []
    if (primary) list.push(primary)
    list.push(...degraded)
    return list.concat(others).slice(0, 6)
  }, [traders])

  // Filtered Events Feed
  const filteredEvents = useMemo(() => {
    const sourceList = events.length ? events : selected?.recent_events || []
    return sourceList.filter(ev => {
      // Scope filter
      if (scope === 'FOCUSED' && ev.trader_id !== selectedId) return false

      // Event type filter
      if (eventTypeFilter !== 'ALL' && ev.event_type !== eventTypeFilter) return false

      // Free text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTrader = ev.trader_id.includes(q)
        const matchType = ev.event_type.toLowerCase().includes(q)
        const matchDevice = (ev.device_id || '').toLowerCase().includes(q)
        const matchIp = (ev.ip_address || '').includes(q)
        const matchSource = (ev.source || '').toLowerCase().includes(q)
        if (!matchTrader && !matchType && !matchDevice && !matchIp && !matchSource) return false
      }

      return true
    })
  }, [events, selected, scope, selectedId, eventTypeFilter, searchQuery])

  // Count events belonging to currently focused trader
  const focusedTraderEventCount = useMemo(() => {
    return events.filter(e => e.trader_id === selectedId).length
  }, [events, selectedId])

  // Check if newest event belongs to focused trader
  const isLatestEventForFocused = useMemo(() => {
    if (!events.length) return false
    return events[0].trader_id === selectedId && recentEventIds.includes(events[0].event_id)
  }, [events, selectedId, recentEventIds])

  // Trader Lookup Map
  const traderMap = useMemo(() => {
    const map = new Map<string, Trader>()
    traders.forEach(t => map.set(t.trader_id, t))
    return map
  }, [traders])

  // Decision Lookup Map
  const decisionMap = useMemo(() => {
    const map = new Map<string, Decision>()
    decisions.forEach(d => {
      if (d.event_id) map.set(d.event_id, d)
      if (!map.has(`T_${d.trader_id}`)) map.set(`T_${d.trader_id}`, d)
    })
    return map
  }, [decisions])

  const getPriority = (ev: Event): 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'MONITOR' | 'NORMAL' => {
    if (
      ev.risk_relevance === 'critical' ||
      ev.network_type === 'datacenter' ||
      (ev.amount !== undefined && ev.amount >= 50000)
    ) {
      return 'CRITICAL'
    }
    if (
      ev.risk_relevance === 'high' ||
      (ev.leverage !== undefined && ev.leverage >= 50) ||
      ev.source === 'account-takeover' ||
      ev.source === 'fraud-ring'
    ) {
      return 'HIGH'
    }
    if (ev.event_type === 'NEW_DEVICE' || ev.source === 'legitimate-travel') {
      return 'ELEVATED'
    }
    if (ev.event_type === 'IP_CHANGE') {
      return 'MONITOR'
    }
    return 'NORMAL'
  }

  return (
    <div className="grid-12">
      {/* TIER 1: GLOBAL SYSTEM TELEMETRY RIBBON */}
      <div className="col-12">
        <div className="live-telemetry-ribbon" style={{ borderLeft: '3px solid var(--accent-cobalt)' }}>
          <div className="telemetry-metric-group">
            <div className="telemetry-metric-item">
              <span className="telemetry-metric-label">STREAM CONNECTION</span>
              <div className="telemetry-metric-value">
                <span className={`stream-status-dot ${connected ? 'dot-live' : 'dot-offline'}`} />
                <span style={{ color: connected ? 'var(--state-normal)' : 'var(--state-critical)', fontWeight: 700 }}>
                  {connected ? 'LIVE // SSE STREAM ACTIVE' : 'DISCONNECTED // STANDBY'}
                </span>
                {!connected && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '1px 6px', fontSize: 9, marginLeft: 6 }}
                    onClick={onReconnectStream}
                  >
                    RECONNECT
                  </button>
                )}
              </div>
            </div>

            <div className="telemetry-metric-item">
              <span className="telemetry-metric-label">STREAM VELOCITY</span>
              <div className="telemetry-metric-value mono">
                {events.length} EVENTS INGESTED
              </div>
            </div>

            <div className="telemetry-metric-item">
              <span className="telemetry-metric-label">EVALUATION LATENCY</span>
              <div className="telemetry-metric-value mono" style={{ color: '#38bdf8' }}>
                {analytics?.latency_metrics?.average_ms != null ? analytics.latency_metrics.average_ms.toFixed(2) : '0.42'} ms
              </div>
            </div>

            <div className="telemetry-metric-item">
              <span className="telemetry-metric-label">FLEET THREAT POSTURE</span>
              <div className="telemetry-metric-value mono">
                <span style={{ color: 'var(--state-critical)', fontWeight: 700 }}>{populationStats.critical} CRIT</span>
                <span style={{ color: 'var(--border-medium)' }}>/</span>
                <span style={{ color: 'var(--state-elevated)', fontWeight: 600 }}>{populationStats.monitored} ELEV</span>
                <span style={{ color: 'var(--border-medium)' }}>/</span>
                <span style={{ color: 'var(--state-normal)' }}>{populationStats.trusted} TRUSTED</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="telemetry-metric-item" style={{ alignItems: 'flex-end' }}>
              <span className="telemetry-metric-label">FOCUS TRACKING MODE</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {autoFocus ? (
                  <>
                    <span className="focus-mode-badge badge-auto">
                      ● AUTO-TRACKING INGESTION
                    </span>
                    <button
                      className="focus-mode-toggle-btn"
                      title="Lock current trader focus to prevent auto-switching on new events"
                      onClick={() => onToggleAutoFocus(false)}
                    >
                      LOCK FOCUS
                    </button>
                  </>
                ) : (
                  <>
                    <span className="focus-mode-badge badge-locked">
                      ○ OPERATOR LOCKED // #{selectedId}
                    </span>
                    <button
                      className="focus-mode-toggle-btn"
                      style={{ borderColor: 'var(--accent-cobalt)', color: '#60a5fa' }}
                      title="Resume automatic tracking of incoming telemetry stream"
                      onClick={() => onToggleAutoFocus(true)}
                    >
                      RESUME AUTO-FOLLOW
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="telemetry-metric-item" style={{ alignItems: 'flex-end', borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12 }}>
              <span className="telemetry-metric-label">LAST INGESTION</span>
              <div className="telemetry-metric-value mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {formatTime(lastEventTime || events[0]?.timestamp)}
              </div>
            </div>
          </div>
        </div>

        {/* TIER 2: FOCUSED TRADER TELEMETRY HUD & DYNAMIC SELECTOR */}
        <div className="dynamic-focus-bar" style={{ borderLeft: '3px solid #38bdf8' }}>
          <div className="live-trader-chips">
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4, fontWeight: 700 }}>
              DYNAMIC FOCUS:
            </span>
            {dynamicFocusTraders.map(t => {
              const isCrit = t.trust_score < 45
              const isMon = t.trust_score < 70
              const scoreColor = t.trust_score >= 80 ? 'var(--state-normal)' : isCrit ? 'var(--state-critical)' : isMon ? 'var(--state-elevated)' : '#38bdf8'
              const isCurrent = selectedId === t.trader_id
              return (
                <button
                  key={t.trader_id}
                  className={`live-trader-chip ${isCurrent ? 'active' : ''} ${isCrit ? 'chip-critical' : ''}`}
                  onClick={() => {
                    onSelectTrader(t.trader_id)
                    onToggleAutoFocus(false)
                  }}
                >
                  <span>#{t.trader_id} {t.name.split(' ')[0]}</span>
                  <span style={{ color: scoreColor, fontWeight: 700 }}>
                    {Math.round(t.trust_score)}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isLatestEventForFocused && (
              <span className="mono" style={{ fontSize: 9, color: '#38bdf8', animation: 'sse-pulse 1.5s infinite' }}>
                ⚡ NEW TELEMETRY FOR #{selectedId}
              </span>
            )}
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>ALL TRADERS ({traders.length}):</span>
            <select
              value={selectedId}
              onChange={e => {
                onSelectTrader(e.target.value)
                onToggleAutoFocus(false)
              }}
              style={{
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 3,
                padding: '3px 8px',
                color: '#fff',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {traders.map(t => (
                <option key={t.trader_id} value={t.trader_id}>
                  #{t.trader_id} - {t.name} ({Math.round(t.trust_score)}/100, {t.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* FOCUSED TRADER LIVE STATUS BANNER */}
        {selected && (
          <div
            style={{
              background: 'var(--bg-surface-1)',
              border: '1px solid var(--border-subtle)',
              borderLeft: `3px solid ${selected.trust_score < 45 ? 'var(--state-critical)' : selected.trust_score < 70 ? 'var(--state-elevated)' : 'var(--state-normal)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '8px 14px',
              marginBottom: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>FOCUSED SUBJECT</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong className="mono" style={{ fontSize: 13, color: '#fff' }}>
                    #{selected.trader_id} {selected.name}
                  </strong>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    [{selected.segment || 'PRO TRADER'}]
                  </span>
                </div>
              </div>

              <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12 }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>BASELINE NORMS</span>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-primary)' }}>
                  MAX DEP: {money(selected.baseline?.deposit_amount || 2000)} │ LEV: {selected.baseline?.leverage || 5}× │ DEVS: {selected.baseline?.known_devices?.length || 1} │ GEO: {selected.baseline?.countries?.join(', ') || 'US'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>FOCUSED INGESTION</span>
                <div className="mono" style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>
                  {focusedTraderEventCount} EVENTS IN WINDOW
                </div>
              </div>

              <div style={{ textAlign: 'right', borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12 }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>CURRENT TRUST</span>
                <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: selected.trust_score < 45 ? 'var(--state-critical)' : selected.trust_score < 70 ? 'var(--state-elevated)' : 'var(--state-normal)' }}>
                  {Math.round(selected.trust_score)}
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>/100</span>
                  <span style={{ fontSize: 10, marginLeft: 6, textTransform: 'uppercase' }}>({selected.status})</span>
                </div>
              </div>

              <button
                className="btn btn-secondary"
                style={{ fontSize: 9, padding: '3px 8px' }}
                onClick={() => onInspectTrader(selected)}
              >
                VIEW FULL DOSSIER →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LEFT COLUMN (8 COLS): Streaming Ingestion Feed with Baseline Reasoning & 6-Stage Causal Link */}
      <div className="col-8">
        <div className="panel">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3>Streaming Ingestion & Causal Intelligence Feed</h3>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                ({filteredEvents.length} OF {events.length} EVENTS)
              </span>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Scope Switcher: All Fleet vs Focused Trader */}
              <div style={{ display: 'flex', background: 'var(--bg-surface-0)', borderRadius: 3, border: '1px solid var(--border-subtle)', padding: 1 }}>
                <button
                  className={`btn ${scope === 'FLEET' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 9, padding: '2px 8px', borderRadius: 2 }}
                  onClick={() => setScope('FLEET')}
                >
                  ALL FLEET
                </button>
                <button
                  className={`btn ${scope === 'FOCUSED' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 9, padding: '2px 8px', borderRadius: 2 }}
                  onClick={() => setScope('FOCUSED')}
                  title={`Show only events for trader #${selectedId}`}
                >
                  #{selectedId} ONLY
                </button>
              </div>

              <input
                type="text"
                placeholder="Search IP/Device/ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 3,
                  padding: '2px 8px',
                  color: '#fff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  width: 130,
                }}
              />

              <select
                value={eventTypeFilter}
                onChange={e => setEventTypeFilter(e.target.value)}
                style={{
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 3,
                  padding: '2px 6px',
                  color: '#fff',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <option value="ALL">ALL TYPES</option>
                <option value="LOGIN">LOGIN</option>
                <option value="NEW_DEVICE">NEW_DEVICE</option>
                <option value="IP_CHANGE">IP_CHANGE</option>
                <option value="DEPOSIT">DEPOSIT</option>
                <option value="LEVERAGE_CHANGE">LEVERAGE_CHANGE</option>
                <option value="WITHDRAWAL">WITHDRAWAL</option>
              </select>

              <button className="btn btn-secondary" style={{ fontSize: 9 }} onClick={onExportCSV}>
                CSV
              </button>
            </div>
          </div>

          <div className="table-container" style={{ maxHeight: 560, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 75 }}>PRIORITY</th>
                  <th style={{ width: 80 }}>TIME (UTC)</th>
                  <th style={{ width: 85 }}>TRADER</th>
                  <th style={{ width: 100 }}>EVENT TYPE</th>
                  <th>TELEMETRY CONTEXT &amp; BASELINE COMPARISON</th>
                  <th style={{ width: 75 }}>SOURCE</th>
                  <th style={{ width: 110 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      NO INGESTION EVENTS MATCHING CURRENT FILTERS
                    </td>
                  </tr>
                ) : (
                  filteredEvents.slice(0, 50).map(ev => {
                    const priority = getPriority(ev)
                    const isNew = recentEventIds.includes(ev.event_id)
                    const isFocusedTrader = ev.trader_id === selectedId
                    const trader = traderMap.get(ev.trader_id)
                    const decision = decisionMap.get(ev.event_id) || (isFocusedTrader ? latestDecision : undefined)
                    const causal = getCausalChain(ev, trader, decision)
                    const isExpanded = expandedEventId === ev.event_id

                    return (
                      <React.Fragment key={ev.event_id}>
                        <tr
                          className={`${isNew ? 'live-event-new-row' : ''} ${isFocusedTrader ? 'live-row-focused-trader' : ''}`}
                          style={{
                            borderLeft: isFocusedTrader ? '3px solid var(--accent-cobalt)' : '3px solid transparent',
                            background: isExpanded ? 'rgba(37, 99, 235, 0.08)' : undefined,
                          }}
                        >
                          <td>
                            <span className={`priority-pill priority-${priority.toLowerCase()}`}>
                              {priority}
                            </span>
                          </td>
                          <td className="mono" style={{ fontSize: 10 }}>
                            {formatTime(ev.timestamp)}
                          </td>
                          <td className="mono">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button
                                className="btn btn-secondary"
                                style={{
                                  padding: '1px 5px',
                                  fontSize: 10,
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: isFocusedTrader ? 700 : 400,
                                  color: isFocusedTrader ? '#60a5fa' : 'inherit',
                                  borderColor: isFocusedTrader ? 'var(--accent-cobalt)' : 'var(--border-subtle)',
                                }}
                                title="Click to focus this trader"
                                onClick={() => {
                                  onSelectTrader(ev.trader_id)
                                  onToggleAutoFocus(false)
                                }}
                              >
                                #{ev.trader_id}
                              </button>
                              {isFocusedTrader && (
                                <span className="status-pill active" style={{ fontSize: 7, padding: '0 3px' }}>
                                  FOCUS
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 11 }}>
                              {ev.event_type.replace(/_/g, ' ')}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div className="mono" style={{ fontSize: 10 }}>
                                {ev.amount ? (
                                  <strong style={{ color: '#fff' }}>{money(ev.amount)}</strong>
                                ) : ev.leverage ? (
                                  <strong style={{ color: '#fff' }}>{ev.leverage}× LEVERAGE</strong>
                                ) : ev.network_type === 'datacenter' ? (
                                  <span style={{ color: 'var(--state-critical)', fontWeight: 600 }}>DATACENTER IP ({ev.ip_address})</span>
                                ) : (
                                  <span>{ev.country || ev.device_id || 'SYSTEM EVAL'}</span>
                                )}
                              </div>
                              {/* Inline Baseline Comparison */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}>
                                <span
                                  className="mono"
                                  style={{
                                    color: causal.baselineAnalysis.isNormal ? 'var(--state-normal)' : causal.baselineAnalysis.severity === 'critical' ? 'var(--state-critical)' : 'var(--state-elevated)',
                                    fontWeight: causal.baselineAnalysis.isNormal ? 400 : 600,
                                  }}
                                >
                                  {causal.baselineAnalysis.isNormal ? '● NORMAL' : `▲ ${causal.baselineAnalysis.deviationBadge}`}
                                </span>
                                <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                                  {causal.baselineAnalysis.summary}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`status-pill ${ev.source === 'seed' ? 'normal' : ev.source === 'flagship' ? 'critical' : ev.source === 'fraud-ring' ? 'high' : ev.source === 'account-takeover' ? 'high' : 'elevated'}`} style={{ fontSize: 9 }}>
                              {(ev.source || 'LIVE').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn btn-secondary"
                                style={{
                                  padding: '2px 6px',
                                  fontSize: 9,
                                  background: isExpanded ? 'var(--accent-cobalt)' : undefined,
                                  color: isExpanded ? '#fff' : undefined,
                                }}
                                title="Expand Causal Intelligence reasoning for this event"
                                onClick={() => setExpandedEventId(isExpanded ? null : ev.event_id)}
                              >
                                {isExpanded ? 'CLOSE' : 'EXPLAIN'}
                              </button>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '2px 6px', fontSize: 9 }}
                                onClick={() => onInspectEvent(ev)}
                                title="Open full event raw telemetry"
                              >
                                INSPECT
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* INLINE EXPANDED CAUSAL INTELLIGENCE CARD (THE 6 QUESTIONS) */}
                        {isExpanded && (
                          <tr className="live-expanded-causal-row">
                            <td colSpan={7} style={{ padding: 0, background: 'var(--bg-surface-0)' }}>
                              <div
                                style={{
                                  padding: '14px 18px',
                                  borderLeft: '3px solid var(--accent-cobalt)',
                                  borderBottom: '1px solid var(--border-medium)',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa' }}>
                                      EVENT → INTELLIGENCE CAUSAL LINK // {ev.event_id}
                                    </span>
                                    <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                                      INGESTED: {formatTime(ev.timestamp)}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    {ev.trader_id !== selectedId && (
                                      <button
                                        className="btn btn-primary"
                                        style={{ fontSize: 9, padding: '2px 8px' }}
                                        onClick={() => {
                                          onSelectTrader(ev.trader_id)
                                          onToggleAutoFocus(false)
                                        }}
                                      >
                                        FOCUS TRADER #{ev.trader_id}
                                      </button>
                                    )}
                                    <button
                                      className="btn btn-secondary"
                                      style={{ fontSize: 9, padding: '2px 8px' }}
                                      onClick={() => setExpandedEventId(null)}
                                    >
                                      COLLAPSE
                                    </button>
                                  </div>
                                </div>

                                {/* THE 6-STAGE CAUSAL GRID */}
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: 10,
                                    marginBottom: 10,
                                  }}
                                >
                                  {/* Q1: WHAT JUST HAPPENED? */}
                                  <div style={{ background: 'var(--bg-surface-1)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                                    <div className="mono" style={{ fontSize: 8.5, color: '#38bdf8', fontWeight: 700, marginBottom: 4 }}>
                                      1. WHAT JUST HAPPENED?
                                    </div>
                                    <div style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>
                                      {causal.whatHappened}
                                    </div>
                                    <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
                                      SOURCE: {ev.source || 'LIVE'} │ ASSET: {ev.asset || 'USD'}
                                    </div>
                                  </div>

                                  {/* Q2: WHO DID IT? */}
                                  <div style={{ background: 'var(--bg-surface-1)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                                    <div className="mono" style={{ fontSize: 8.5, color: '#38bdf8', fontWeight: 700, marginBottom: 4 }}>
                                      2. WHO DID IT?
                                    </div>
                                    <div style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>
                                      {causal.whoDidIt}
                                    </div>
                                    <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
                                      STATUS: {trader?.status || 'UNKNOWN'} │ INITIAL TRUST: {trader?.initial_trust ?? 94}
                                    </div>
                                  </div>

                                  {/* Q3: IS IT NORMAL FOR THEM? */}
                                  <div style={{ background: 'var(--bg-surface-1)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                                    <div className="mono" style={{ fontSize: 8.5, color: causal.baselineAnalysis.isNormal ? 'var(--state-normal)' : 'var(--state-critical)', fontWeight: 700, marginBottom: 4 }}>
                                      3. IS IT NORMAL FOR THEM?
                                    </div>
                                    <div style={{ fontSize: 11, color: causal.baselineAnalysis.isNormal ? 'var(--state-normal)' : '#fbbf24', fontWeight: 600 }}>
                                      {causal.isNormalForThem}
                                    </div>
                                    {causal.baselineAnalysis.details.length > 1 && (
                                      <div className="mono" style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                                        Additional anomalies: {causal.baselineAnalysis.details.slice(1).join('; ')}
                                      </div>
                                    )}
                                  </div>

                                  {/* Q4: WHAT CHANGED? */}
                                  <div style={{ background: 'var(--bg-surface-1)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                                    <div className="mono" style={{ fontSize: 8.5, color: '#38bdf8', fontWeight: 700, marginBottom: 4 }}>
                                      4. WHAT CHANGED?
                                    </div>
                                    <div style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>
                                      {causal.whatChanged}
                                    </div>
                                    <div className="mono" style={{ fontSize: 9, color: causal.delta < 0 ? 'var(--state-critical)' : 'var(--state-normal)', marginTop: 4 }}>
                                      TRUST IMPACT: {causal.delta < 0 ? `▼ ${causal.delta} PTS DROP` : 'NO ADVERSE IMPACT'}
                                    </div>
                                  </div>

                                  {/* Q5: WHY DOES IT MATTER? */}
                                  <div style={{ background: 'var(--bg-surface-1)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                                    <div className="mono" style={{ fontSize: 8.5, color: '#38bdf8', fontWeight: 700, marginBottom: 4 }}>
                                      5. WHY DOES IT MATTER?
                                    </div>
                                    <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
                                      {causal.whyItMatters}
                                    </div>
                                  </div>

                                  {/* Q6: WHAT SHOULD OPERATOR DO NEXT? */}
                                  <div style={{ background: 'var(--bg-surface-1)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                                    <div className="mono" style={{ fontSize: 8.5, color: 'var(--state-elevated)', fontWeight: 700, marginBottom: 4 }}>
                                      6. WHAT SHOULD OPERATOR DO NEXT?
                                    </div>
                                    <div style={{ fontSize: 10.5, color: '#fff', fontWeight: 600 }}>
                                      {causal.recommendation}
                                    </div>
                                  </div>
                                </div>

                                {/* QUICK OPERATOR ACTIONS */}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>OPERATOR PROTOCOL:</span>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: 9, padding: '2px 8px' }}
                                    onClick={() => onStepUp(ev.trader_id)}
                                  >
                                    TRIGGER STEP-UP CHALLENGE
                                  </button>
                                  <button
                                    className="btn btn-outline-danger"
                                    style={{ fontSize: 9, padding: '2px 8px' }}
                                    onClick={onCreateCase}
                                  >
                                    OPEN CASE WORKBENCH
                                  </button>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: 9, padding: '2px 8px' }}
                                    onClick={() => onNavigateView('RELATIONSHIP GRAPH')}
                                  >
                                    INSPECT IN GRAPH TOPOLOGY
                                  </button>
                                  {decision && (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ fontSize: 9, padding: '2px 8px' }}
                                      onClick={() => onInspectDecision(decision)}
                                    >
                                      VIEW AUDIT EVIDENCE →
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DIMENSIONAL EXPOSURE BREAKDOWN FOR FOCUSED TRADER */}
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3>Dimensional Risk Profile // Trader #{selectedId}</h3>
              <span className="panel-meta">LIVE MULTI-VECTOR RISK EVALUATION</span>
            </div>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              UPDATED REAL-TIME PER EVENT
            </span>
          </div>
          <div className="dimension-matrix">
            {Object.entries(selected?.risk_dimensions || {}).map(([key, value]) => (
              <div className="dimension-matrix-row" key={key}>
                <span className="dimension-name">{riskLabels[key] || key}</span>
                <span className="dimension-score mono">{Math.round(value)}</span>
                <div className="dimension-bar-track">
                  <div
                    className={`dimension-bar-fill ${value > 70 ? 'danger' : ''}`}
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN (4 COLS): Active Focus Dossier, Decision Panel, Reasoning Chain & Topology */}
      <div className="col-4">
        {/* Active Focus Dossier Card */}
        {selected && (
          <div className="live-focus-card">
            <div className="live-focus-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    #{selected.trader_id} {selected.name}
                  </span>
                  <span className={`status-pill ${selected.status.toLowerCase()}`}>
                    {selected.status}
                  </span>
                </div>
                <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                  {selected.segment || 'PRO TRADER'} // BASELINE TRUST: {selected.initial_trust ?? 94}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: selected.trust_score >= 80 ? 'var(--state-normal)' : selected.trust_score < 45 ? 'var(--state-critical)' : 'var(--state-elevated)' }}>
                  {Math.round(selected.trust_score)}
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>/100</span>
                </div>
                <span className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>TRUST SCORE</span>
              </div>
            </div>
            <div className="live-focus-body">
              <div className="live-focus-row">
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>KNOWN DEVICES:</span>
                <span className="mono" style={{ fontSize: 10, color: '#fff' }}>
                  {selected.baseline?.known_devices?.length ?? 1} REGISTERED
                </span>
              </div>
              <div className="live-focus-row">
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>LOGIN HOURS:</span>
                <span className="mono" style={{ fontSize: 10, color: '#fff' }}>
                  {selected.baseline?.normal_login_hours?.length ? `${selected.baseline.normal_login_hours.join(', ')} UTC` : '09-17 UTC'}
                </span>
              </div>
              <div className="live-focus-row">
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>GEOGRAPHY:</span>
                <span className="mono" style={{ fontSize: 10, color: '#fff' }}>
                  {selected.baseline?.countries?.join(', ') || 'US, UK'}
                </span>
              </div>
              <div className="live-focus-row">
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>MAX TYPICAL DEP:</span>
                <span className="mono" style={{ fontSize: 10, color: '#fff' }}>
                  {money(selected.baseline?.deposit_amount || 2000)}
                </span>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                  {selected.event_count} EVENTS OBSERVED
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '2px 8px', fontSize: 9 }}
                  onClick={() => onInspectTrader(selected)}
                >
                  FULL DOSSIER →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Persistent Decision Panel with Graduated Policy Ladder */}
        {latestDecision ? (
          <div className={`decision-panel ${latestDecision.risk_level.toLowerCase()}`}>
            <div className="decision-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>NETRA DECISION</span>
                {selected && (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                    #{selected.trader_id} ({selected.segment})
                  </span>
                )}
              </div>
              <span className="mono">{latestDecision.decision_id}</span>
            </div>

            <div className="decision-core-block">
              <div className="trust-display">
                <div className="trust-score-row">
                  <strong>{Math.round(latestDecision.trust_score)}</strong>
                  <span>/ 100</span>
                </div>
                {(() => {
                  const prevDecisionScore = latestDecision.previous_score != null ? Math.round(latestDecision.previous_score) : (selected?.initial_trust ?? 94)
                  const decDelta = Math.round(latestDecision.trust_score - prevDecisionScore)
                  return (
                    <div
                      className="mono"
                      style={{
                        fontSize: 8.5,
                        marginTop: 1,
                        color: decDelta < 0 ? 'var(--state-critical)' : 'var(--state-normal)',
                        fontWeight: 600,
                      }}
                    >
                      PREV: {prevDecisionScore} ({decDelta < 0 ? `▼ ${decDelta}` : `▲ +${decDelta}`} PTS)
                    </div>
                  )
                })()}
                <span className="trust-label">CONTINUOUS TRUST</span>
              </div>

              <div className="decision-outcome">
                <span className={`decision-text ${latestDecision.decision.toLowerCase()}`}>
                  {latestDecision.decision}
                </span>
                <span className="decision-action-sub">{latestDecision.action.replace(/_/g, ' ')}</span>
                <span className={`status-pill ${latestDecision.risk_level.toLowerCase()}`}>{latestDecision.risk_level}</span>
              </div>
            </div>

            {/* Core Policy Formula Header */}
            <div style={{ padding: '6px 14px', background: 'var(--bg-surface-0)', borderBottom: '1px solid var(--border-subtle)', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
              CORE FORMULA: RISK SEVERITY × ACTION SENSITIVITY = INTERVENTION
            </div>

            {/* Quick Action Sensitivity Evaluation Controls */}
            {onEvaluateAction && (
              <div className="decision-eval-quick-row">
                <span className="mono" style={{ fontSize: 8.5, color: 'var(--text-dim)', alignSelf: 'center' }}>TEST SENSITIVITY:</span>
                <button
                  className="eval-quick-btn"
                  disabled={evaluatingAction}
                  onClick={() => onEvaluateAction('WITHDRAWAL')}
                  title="Simulate immediate $50k withdrawal attempt"
                >
                  $50k WITHDRAWAL
                </button>
                <button
                  className="eval-quick-btn"
                  disabled={evaluatingAction}
                  onClick={() => onEvaluateAction('50X_LEVERAGE')}
                  title="Simulate 50x leverage margin order"
                >
                  50× LEV
                </button>
                <button
                  className="eval-quick-btn"
                  disabled={evaluatingAction}
                  onClick={() => onEvaluateAction('ORDER_PLACED')}
                  title="Simulate standard trading order"
                >
                  TRADE
                </button>
              </div>
            )}

            {/* Action Evaluation Result Banner */}
            {actionEvalResult && actionEvalResult.trader_id === (selected?.trader_id || latestDecision.trader_id) && (
              <div
                style={{
                  padding: '5px 12px',
                  background: actionEvalResult.allowed ? 'var(--state-normal-bg)' : 'var(--state-critical-bg)',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span style={{ color: actionEvalResult.allowed ? 'var(--state-normal)' : 'var(--state-critical)', fontWeight: 600 }}>
                  {actionEvalResult.action}: {actionEvalResult.decision} ({actionEvalResult.allowed ? 'PERMITTED' : 'HOLD'})
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{actionEvalResult.reason}</span>
              </div>
            )}

            {/* Graduated Policy Ladder */}
            <div className="policy-ladder">
              <div className={`ladder-step ${latestDecision.decision === 'ALLOW' ? 'active allow' : ''}`}>
                <span>ALLOW</span>
                <small>Normal activity permitted</small>
              </div>
              <div className={`ladder-step ${latestDecision.decision === 'MONITOR' ? 'active monitor' : ''}`}>
                <span>MONITOR</span>
                <small>Observe elevated context</small>
              </div>
              <div className={`ladder-step ${latestDecision.decision === 'VERIFY' ? 'active verify' : ''}`}>
                <span>VERIFY</span>
                <small>Step-up 2FA / biometric</small>
              </div>
              <div className={`ladder-step ${latestDecision.decision === 'RESTRICT' ? 'active restrict' : ''}`}>
                <span>RESTRICT</span>
                <small>Action hold (withdrawal pause)</small>
              </div>
              <div className={`ladder-step ${latestDecision.decision === 'BLOCK' ? 'active restrict' : ''}`}>
                <span>BLOCK</span>
                <small>Critical halt / session isolated</small>
              </div>
            </div>

            <div className="decision-telemetry-grid">
              <div className="decision-telemetry-cell">
                <span>CONFIDENCE:</span>
                <strong>{latestDecision.confidence}</strong>
              </div>
              <div className="decision-telemetry-cell">
                <span>EVAL LATENCY:</span>
                <strong>{latestDecision.processing_latency_ms}ms</strong>
              </div>
              <div className="decision-telemetry-cell">
                <span>POLICY:</span>
                <strong>{latestDecision.policy_version}</strong>
              </div>
            </div>

            <div className="decision-contributors-block">
              <div className="contributors-label">Top Risk Contributors:</div>
              <div className="contributors-list">
                {latestDecision.explanation.top_factors.slice(0, 5).map((factor, idx) => (
                  <div key={idx} className="contributor-row">
                    <span className="contributor-bullet">•</span>
                    <span>{factor}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="decision-recommendation-note">
              <b>SOP RECOMMENDATION:</b> {latestDecision.explanation.recommendation}
            </div>

            <div className="decision-actions-row">
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onInspectDecision(latestDecision)}>
                VIEW EVIDENCE
              </button>
              <button className="btn btn-outline-danger" style={{ flex: 1 }} onClick={onCreateCase}>
                OPEN CASE
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => selected && onStepUp(selected.trader_id)}>
                STEP-UP
              </button>
            </div>
          </div>
        ) : (
          <div className="decision-panel">
            <div className="decision-panel-head">
              <span>NETRA DECISION // ACTIVE MONITORING</span>
            </div>
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
              Observing incoming events against trader individual baselines. Inject an event or run a scenario.
            </div>
          </div>
        )}

        {/* Causal Reasoning Chain */}
        <div style={{ marginTop: 12 }}>
          <ReasoningEvidenceChain
            trader={selected}
            decision={latestDecision}
            latestEvent={events.find(e => e.trader_id === selectedId) || selected?.recent_events?.[0]}
            graph={graph}
            onInspectEvidence={() => latestDecision && onInspectDecision(latestDecision)}
            onOpenTopology={() => onNavigateView('RELATIONSHIP GRAPH')}
          />
        </div>

        {/* Live Topology Linkage Preview */}
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-header">
            <h3>Live Topology Linkage Preview</h3>
            <span className="panel-meta">{graph?.nodes.length ?? 0} NODES</span>
          </div>
          <div style={{ height: 240 }}>
            <InteractiveGraph
              graph={graph}
              selectedNodeId={selected ? `TRADER-${selected.trader_id}` : undefined}
              onSelectNode={id => {
                if (id.startsWith('TRADER-')) {
                  const tid = id.replace('TRADER-', '')
                  onSelectTrader(tid)
                  onToggleAutoFocus(false)
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
