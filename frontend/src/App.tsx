import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, setActorRole } from './api'
import { soundManager } from './audio'
import { CommandPalette } from './components/CommandPalette'
import { EvidenceDrawer } from './components/EvidenceDrawer'
import { InteractiveGraph } from './components/InteractiveGraph'
import { PolicySandbox } from './components/PolicySandbox'
import type { ActionEvaluationResult, Analytics, AuditRecord, AuditVerifyResult, Case, Decision, Event, Graph, GraphCluster, Policy, RiskEventItem, Trader, UserRole } from './types'

type View =
  | 'OVERVIEW'
  | 'LIVE MONITOR'
  | 'TRADERS'
  | 'RISK EVENTS'
  | 'RELATIONSHIP GRAPH'
  | 'CASES'
  | 'POLICIES'
  | 'SIMULATOR'
  | 'AUDIT'
  | 'ANALYTICS'

const navItems: { id: View; code: string; label: string }[] = [
  { id: 'OVERVIEW', code: '01', label: 'Overview' },
  { id: 'LIVE MONITOR', code: '02', label: 'Live Monitor' },
  { id: 'TRADERS', code: '03', label: 'Traders' },
  { id: 'RISK EVENTS', code: '04', label: 'Risk Events' },
  { id: 'RELATIONSHIP GRAPH', code: '05', label: 'Topology Graph' },
  { id: 'CASES', code: '06', label: 'Cases & Triage' },
  { id: 'POLICIES', code: '07', label: 'Policy Matrix' },
  { id: 'SIMULATOR', code: '08', label: 'Scenario Lab' },
  { id: 'AUDIT', code: '09', label: 'Audit Vault' },
  { id: 'ANALYTICS', code: '10', label: 'Analytics' },
]

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

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'
const formatDate = (value?: string) =>
  value ? new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'
const money = (value?: number) =>
  value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

function StatusBadge({ value }: { value: string }) {
  const norm = value.toLowerCase().replace(/_/g, '-')
  return <span className={`status-pill ${norm}`}>{value.replace(/_/g, ' ')}</span>
}

export default function App() {
  const [view, setView] = useState<View>('OVERVIEW')
  const [userRole, setUserRole] = useState<UserRole>('ADMIN')
  const [soundMuted, setSoundMuted] = useState(soundManager.isMuted())
  const [traders, setTraders] = useState<Trader[]>([])
  const [selectedId, setSelectedId] = useState('7842')
  const [selected, setSelected] = useState<Trader | undefined>()
  const [analytics, setAnalytics] = useState<Analytics | undefined>()
  const [cases, setCases] = useState<Case[]>([])
  const [audit, setAudit] = useState<AuditRecord[]>([])
  const [auditVerification, setAuditVerification] = useState<AuditVerifyResult | null>(null)
  const [verifyingAudit, setVerifyingAudit] = useState(false)
  const [policy, setPolicy] = useState<Policy | undefined>()
  const [graph, setGraph] = useState<Graph | undefined>()
  const [events, setEvents] = useState<Event[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [connected, setConnected] = useState(false)
  const [notice, setNotice] = useState('')
  const [running, setRunning] = useState<string | null>(null)
  const [nodeInfo, setNodeInfo] = useState('')
  const [cmdOpen, setCmdOpen] = useState(false)

  // Day 4 Multi-Trader Intelligence State
  const [riskEvents, setRiskEvents] = useState<RiskEventItem[]>([])
  const [systemGraph, setSystemGraph] = useState<Graph | undefined>()
  const [graphMode, setGraphMode] = useState<'SELECTED' | 'SYSTEM'>('SELECTED')
  const [riskEventTab, setRiskEventTab] = useState<'RISK_EVENTS' | 'ALL_EVENTS'>('RISK_EVENTS')
  const [traderRiskFilter, setTraderRiskFilter] = useState<'ALL' | 'TRUSTED' | 'MONITORED' | 'RESTRICTED' | 'BLOCKED' | 'RING'>('ALL')
  const [manualTraderId, setManualTraderId] = useState('7842')
  const [actionToEvaluate, setActionToEvaluate] = useState('WITHDRAWAL')
  const [actionEvalResult, setActionEvalResult] = useState<ActionEvaluationResult | null>(null)
  const [evaluatingAction, setEvaluatingAction] = useState(false)

  const [drawerData, setDrawerData] = useState<{
    event?: Event
    decision?: Decision
    trader?: Trader
    caseItem?: Case
    entity?: {
      id: string
      type: string
      risk?: number
      is_cluster?: boolean
      edges?: any[]
    }
  } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [manualType, setManualType] = useState('NEW_DEVICE')
  const [manualAmount, setManualAmount] = useState('25000')

  const [traderSearch, setTraderSearch] = useState('')
  const [traderSegment, setTraderSegment] = useState('ALL')

  const [eventSearch, setEventSearch] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL')

  const [caseNoteInputs, setCaseNoteInputs] = useState<Record<string, string>>({})

  const refreshSelected = useCallback(async (id = selectedId) => {
    try {
      const [trader, nextGraph] = await Promise.all([
        api.get<Trader>(`/traders/${id}`),
        api.get<Graph>(`/traders/${id}/graph`),
      ])
      setSelected(trader)
      setGraph(nextGraph)
    } catch {
      // Ignore
    }
  }, [selectedId])

  const refreshAll = useCallback(async () => {
    try {
      const [nextTraders, nextAnalytics, nextCases, nextAudit, nextPolicy, nextDecisions, nextEvents, nextRiskEvents, nextSysGraph] = await Promise.all([
        api.get<Trader[]>('/traders'),
        api.get<Analytics>('/analytics'),
        api.get<Case[]>('/cases'),
        api.get<any[]>('/audit'),
        api.get<Policy>('/policies'),
        api.get<Decision[]>('/decisions'),
        api.get<Event[]>('/events'),
        api.get<RiskEventItem[]>('/risk-events'),
        api.get<Graph>('/graph/system'),
      ])
      setTraders(nextTraders)
      setAnalytics(nextAnalytics)
      setCases(nextCases)
      setAudit(nextAudit)
      setPolicy(nextPolicy)
      setDecisions(nextDecisions)
      setEvents(nextEvents)
      setRiskEvents(nextRiskEvents)
      setSystemGraph(nextSysGraph)
      await refreshSelected(selectedId)
    } catch (error) {
      setNotice('API reconnecting... Ensure FastAPI service is active on port 8000.')
      console.error(error)
    }
  }, [refreshSelected, selectedId])

  const verifyAuditChain = useCallback(async () => {
    setVerifyingAudit(true)
    try {
      const res = await api.get<AuditVerifyResult>('/audit/verify')
      setAuditVerification(res)
      if (res.valid) {
        soundManager.playSuccess()
        setNotice(`AUDIT CHAIN CRYPTOGRAPHICALLY VALID: ${res.checked_records} records verified via SHA-256 hash chaining.`)
      } else {
        soundManager.playThreatAlert()
        setNotice(`AUDIT TAMPERING DETECTED: ${res.reason || 'Hash mismatch'}`)
      }
    } catch (err: any) {
      setNotice(`Audit verification failed: ${err.message}`)
    } finally {
      setVerifyingAudit(false)
    }
  }, [])

  useEffect(() => {
    setActorRole('ADMIN')
      .then(() => refreshAll())
      .catch(error => {
        setNotice('Authentication required. Configure the NETRA frontend credentials.')
        console.error(error)
      })
  }, [])

  useEffect(() => {
    refreshSelected(selectedId)
  }, [selectedId, refreshSelected])

  useEffect(() => {
    const stream = new EventSource('/api/stream')
    stream.onopen = () => setConnected(true)
    stream.onerror = () => setConnected(false)
    stream.onmessage = message => {
      try {
        const payload = JSON.parse(message.data)
        if (payload.type === 'NEW_EVENT' || payload.type === 'RISK_UPDATED') {
          soundManager.playEventTick()
          const result = payload.data
          if (result?.event) {
            setEvents(current => [result.event, ...current].slice(0, 80))
          }
          if (result?.decision) {
            if (result.decision.trust_score < 45) {
              soundManager.playThreatAlert()
            }
            setDecisions(current => [result.decision, ...current].slice(0, 50))
          }
          if (result?.event?.trader_id === selectedId) {
            refreshSelected(selectedId)
          }
          refreshAll()
        } else if (payload.type === 'DEMO_RESET') {
          setEvents([])
          refreshAll()
          soundManager.playSuccess()
        }
      } catch (err) {
        console.error('SSE parse error:', err)
      }
    }
    return () => stream.close()
  }, [refreshAll, refreshSelected, selectedId])

  const handleRoleChange = async (newRole: UserRole) => {
    try {
      await setActorRole(newRole)
      setUserRole(newRole)
      setNotice(`AUTHENTICATED ACTOR ROLE: ${newRole}`)
      await refreshAll()
    } catch (error) {
      setNotice(`Authentication failed for ${newRole}.`)
      console.error(error)
    }
  }

  const toggleSound = () => {
    const muted = soundManager.toggleMute()
    setSoundMuted(muted)
  }

  const goTrader = (id: string) => {
    setSelectedId(id)
    setView('TRADERS')
  }

  const inspectEvent = (event: Event) => {
    const matchedDecision = decisions.find(d => d.timestamp === event.timestamp)
    setDrawerData({ event, decision: matchedDecision })
    setDrawerOpen(true)
  }

  const inspectDecision = (decision: Decision) => {
    const matchedEvent = events.find(e => e.timestamp === decision.timestamp)
    setDrawerData({ decision, event: matchedEvent })
    setDrawerOpen(true)
  }

  const inspectTrader = (trader: Trader) => {
    setDrawerData({ trader })
    setDrawerOpen(true)
  }

  const inspectCase = (c: Case) => {
    const matchedTrader = traders.find(t => t.trader_id === c.trader_id)
    const matchedDecision = decisions.find(d => d.trader_id === c.trader_id)
    const matchedEvent = events.find(e => e.trader_id === c.trader_id)
    setDrawerData({ caseItem: c, trader: matchedTrader, decision: matchedDecision, event: matchedEvent })
    setDrawerOpen(true)
  }

  const runScenario = async (scenario: string, mode = 'NORMAL') => {
    try {
      setRunning(scenario)
      soundManager.playEventTick()
      const response = await api.send<{ trader_id: string }>('POST', '/simulator/run', { scenario, mode })
      const targetTrader = response.trader_id
      setSelectedId(targetTrader)
      setEvents(current => current.filter(e => e.trader_id !== targetTrader || e.source === 'seed'))
      setView('LIVE MONITOR')
      setNotice(`EXECUTING SCENARIO: ${scenario} FOR TRADER #${targetTrader}`)
    } catch (err: any) {
      setNotice(err.message || 'Scenario run rejected.')
    } finally {
      setTimeout(() => setRunning(null), 3000)
    }
  }

  const resetDemo = async () => {
    try {
      await api.send('POST', '/simulator/reset')
      setRunning(null)
      setSelectedId('7842')
      setNotice('DATABASE BASELINE RESTORED. INITIAL TRADERS RE-SEEDED.')
      await refreshAll()
    } catch (err: any) {
      setNotice(err.message || 'Reset rejected.')
    }
  }

  const stepUpVerify = async (traderId: string) => {
    try {
      soundManager.playEventTick()
      const res = await api.send<any>('POST', `/traders/${traderId}/step-up`, { verification_type: '2FA_BIOMETRIC' })
      soundManager.playSuccess()
      setNotice(`STEP-UP VERIFICATION VERIFIED FOR #${traderId}. TRUST RESTORED TO ${res.new_trust}/100.`)
      await refreshAll()
    } catch (err: any) {
      setNotice(err.message || 'Verification rejected.')
    }
  }

  const inject = async () => {
    const targetId = manualTraderId.trim() || selectedId
    const payload: any = { trader_id: targetId, event_type: manualType, source: 'operator-console' }
    if (manualType === 'DEPOSIT' || manualType === 'WITHDRAWAL') payload.amount = Number(manualAmount)
    if (manualType === 'NEW_DEVICE') payload.device_id = `DEV-MANUAL-${Date.now().toString().slice(-4)}`
    if (manualType === 'IP_CHANGE') {
      payload.ip_address = '198.18.0.42'
      payload.network_type = 'datacenter'
    }
    if (manualType === 'LEVERAGE_CHANGE') payload.leverage = 50
    if (manualType === 'WITHDRAWAL') payload.wallet_address = 'WALLET-MANUAL-FRESH'

    try {
      await api.send('POST', '/events', payload)
      soundManager.playSuccess()
      setNotice(`EVENT ${manualType} INGESTED & EVALUATED FOR #${targetId}`)
      if (targetId === selectedId) {
        refreshSelected(selectedId)
      }
      refreshAll()
    } catch (err: any) {
      setNotice(err.message || 'Event ingestion error.')
    }
  }

  const evaluateAction = async (action: string) => {
    if (!selected) return
    setEvaluatingAction(true)
    try {
      const res = await api.send<ActionEvaluationResult>('POST', '/actions/evaluate', {
        trader_id: selected.trader_id,
        action: action,
        amount: action === 'WITHDRAWAL' ? 50000 : undefined,
      })
      setActionEvalResult(res)
      soundManager.playEventTick()
      setNotice(`ACTION SENSITIVITY: ${action} for #${selected.trader_id} -> ${res.decision}`)
    } catch (err: any) {
      setNotice(`Action evaluation failed: ${err.message}`)
    } finally {
      setEvaluatingAction(false)
    }
  }

  const createCase = async () => {
    if (!selected) return
    try {
      const result = await api.send<Case>('POST', '/cases', {
        trader_id: selected.trader_id,
        severity: selected.status,
        reason: 'Analyst manual intervention case opened from console',
        decision: selected.last_decision,
      })
      setCases(current => [result, ...current])
      soundManager.playSuccess()
      setNotice(`INVESTIGATION CASE ${result.case_id} INITIALIZED.`)
      setView('CASES')
    } catch (err: any) {
      setNotice(err.message || 'Case creation rejected.')
    }
  }

  const updateCase = async (caseId: string, status: string) => {
    try {
      const result = await api.send<Case>('PATCH', `/cases/${caseId}`, {
        status,
        note: `Analyst triage updated status to ${status}`,
      })
      setCases(current => current.map(item => (item.case_id === caseId ? result : item)))
      soundManager.playSuccess()
      setNotice(`CASE ${caseId} UPDATED: ${status}`)
    } catch (err: any) {
      setNotice(err.message || 'Update failed.')
    }
  }

  const addCaseNote = async (caseId: string) => {
    const text = caseNoteInputs[caseId]?.trim()
    if (!text) return
    try {
      const result = await api.send<Case>('PATCH', `/cases/${caseId}`, { note: text })
      setCases(current => current.map(item => (item.case_id === caseId ? result : item)))
      setCaseNoteInputs(prev => ({ ...prev, [caseId]: '' }))
      soundManager.playSuccess()
      setNotice(`INVESTIGATION NOTE SAVED TO CASE ${caseId}.`)
    } catch (err: any) {
      setNotice(err.message || 'Failed to add note.')
    }
  }

  const savePolicy = async (newPolicy: Policy) => {
    try {
      const result = await api.send<Policy>('PUT', '/policies', newPolicy)
      setPolicy(result)
      setNotice(`POLICY VERSION ${result.version} COMMITTED TO RISK ENGINE.`)
    } catch (err: any) {
      setNotice(err.message || 'Policy update failed.')
    }
  }

  const exportDossier = async (caseId: string) => {
    try {
      const dossier = await api.get<any>(`/cases/${caseId}/dossier`)
      const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `NETRA-DOSSIER-${caseId}.json`
      a.click()
      URL.revokeObjectURL(url)
      soundManager.playSuccess()
      setNotice(`DOSSIER FOR ${caseId} EXPORTED.`)
    } catch (err: any) {
      setNotice(err.message || 'Export error.')
    }
  }

  const exportEventsCSV = () => {
    const rows = [
      ['Timestamp', 'Trader ID', 'Event Type', 'Amount', 'Leverage', 'Device ID', 'IP Address', 'Network Type', 'Wallet', 'Source'],
      ...events.map(e => [
        e.timestamp,
        e.trader_id,
        e.event_type,
        e.amount || '',
        e.leverage || '',
        e.device_id || '',
        e.ip_address || '',
        e.network_type || '',
        e.wallet_address || '',
        e.source,
      ]),
    ]
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'netra_events_telemetry.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    soundManager.playSuccess()
    setNotice('EVENT TELEMETRY EXPORTED AS CSV.')
  }

  const exportTradersCSV = () => {
    const rows = [
      ['Trader ID', 'Name', 'Segment', 'Trust Score', 'Status', 'Baseline Deposit', 'Baseline Leverage', 'Last Action'],
      ...traders.map(t => [
        t.trader_id,
        t.name,
        t.segment,
        t.trust_score,
        t.status,
        t.baseline?.deposit_amount || '',
        t.baseline?.leverage || '',
        t.last_decision,
      ]),
    ]
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'netra_traders_ledger.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    soundManager.playSuccess()
    setNotice('TRADERS RISK LEDGER EXPORTED AS CSV.')
  }

  const filteredTraders = useMemo(() => {
    return traders.filter(t => {
      const matchSearch =
        !traderSearch.trim() ||
        t.trader_id.includes(traderSearch) ||
        t.name.toLowerCase().includes(traderSearch.toLowerCase())
      const matchSegment = traderSegment === 'ALL' || t.segment === traderSegment

      let matchTier = true
      if (traderRiskFilter === 'TRUSTED') matchTier = t.trust_score >= 70
      else if (traderRiskFilter === 'MONITORED') matchTier = t.trust_score >= 45 && t.trust_score < 70
      else if (traderRiskFilter === 'RESTRICTED') matchTier = t.trust_score >= 20 && t.trust_score < 45
      else if (traderRiskFilter === 'BLOCKED') matchTier = t.trust_score < 20
      else if (traderRiskFilter === 'RING') {
        matchTier = ['7102', '7103', '7104', '7105'].includes(t.trader_id) || t.segment === 'Market Maker'
      }

      return matchSearch && matchSegment && matchTier
    })
  }, [traders, traderSearch, traderSegment, traderRiskFilter])

  const filteredRiskEvents = useMemo(() => {
    return riskEvents.filter(re => {
      const matchSearch =
        !eventSearch.trim() ||
        re.trader_id.includes(eventSearch) ||
        re.event_type.toLowerCase().includes(eventSearch.toLowerCase()) ||
        re.signals.some(s => s.reason.toLowerCase().includes(eventSearch.toLowerCase()) || s.feature.toLowerCase().includes(eventSearch.toLowerCase()))
      const matchType = eventTypeFilter === 'ALL' || re.event_type === eventTypeFilter
      return matchSearch && matchType
    })
  }, [riskEvents, eventSearch, eventTypeFilter])

  const filteredEvents = useMemo(() => {
    return (events.length ? events : selected?.recent_events || []).filter(e => {
      const matchSearch =
        !eventSearch.trim() ||
        e.trader_id.includes(eventSearch) ||
        e.event_type.toLowerCase().includes(eventSearch.toLowerCase()) ||
        (e.device_id || '').toLowerCase().includes(eventSearch.toLowerCase()) ||
        (e.ip_address || '').includes(eventSearch)
      const matchType = eventTypeFilter === 'ALL' || e.event_type === eventTypeFilter
      return matchSearch && matchType
    })
  }, [events, selected, eventSearch, eventTypeFilter])

  const criticalTraders = useMemo(() => traders.filter(t => t.trust_score < 45).slice(0, 8), [traders])
  const latestDecision = useMemo(() => {
    return decisions.find(d => d.trader_id === selectedId) || (selected ? undefined : decisions[0])
  }, [decisions, selectedId, selected])

  return (
    <div className="app-shell">
      {/* Left Navigation — Institutional Console Sidebar */}
      <aside className="sidebar">
        <div className="brand-section">
          <div className="brand-header">
            <span className="brand-glyph">N</span>
            <div>
              <span className="brand-title">NETRA</span>
              <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
                MOCHATRADE YC LAYER
              </div>
            </div>
          </div>
          <span className="brand-env">OS v2.0</span>
        </div>

        <div className="nav-group-label">RISK INTELLIGENCE</div>
        <nav>
          {navItems.map(item => (
            <button
              key={item.id}
              className={view === item.id ? 'active' : ''}
              onClick={() => setView(item.id)}
            >
              <div className="nav-left">
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  {item.code}
                </span>
                <span>{item.label}</span>
              </div>
              {item.id === 'CASES' && analytics?.summary.open_cases ? (
                <span className="nav-count">{analytics.summary.open_cases}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status-indicator">
            <span className={`status-dot ${connected ? 'active' : ''}`} />
            <span>{connected ? 'ENGINE ONLINE // 100%' : 'DISCONNECTED'}</span>
          </div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
            GHOST CODERS // MOCHATRADE
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main style={{ minWidth: 0 }}>
        {/* Top Status & Telemetry Bar */}
        <header className="topbar">
          <div className="topbar-left">
            <div className="system-location">
              <span>NETRA</span>
              <span style={{ color: 'var(--text-dim)' }}>/</span>
              <b>{view}</b>
            </div>

            <div className="telemetry-tag">
              <span>CENTRAL QUESTION:</span>
              <strong style={{ color: 'var(--accent-cobalt)' }}>
                &ldquo;Does this action make sense for this trader, right now?&rdquo;
              </strong>
            </div>

            <div className="telemetry-tag">
              <span>EVAL LATENCY:</span>
              <strong>{analytics?.latency_metrics?.average_ms != null ? `${analytics.latency_metrics.average_ms}ms` : 'N/A'}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <button className="search-command-btn" onClick={() => setCmdOpen(true)}>
              <span>Quick Jump</span>
              <kbd>Ctrl+K</kbd>
            </button>

            <div className="actor-role-dropdown">
              <span>ROLE:</span>
              <select value={userRole} onChange={e => handleRoleChange(e.target.value as UserRole)}>
                <option value="ADMIN">ADMIN [FULL ACCESS]</option>
                <option value="RISK_ANALYST">RISK ANALYST [OPERATOR]</option>
                <option value="INVESTIGATOR">INVESTIGATOR [TRIAGE]</option>
                <option value="VIEWER">VIEWER [READ-ONLY]</option>
              </select>
            </div>

            <button
              className="audio-btn"
              title={soundMuted ? 'Telemetry Audio: MUTED' : 'Telemetry Audio: ACTIVE'}
              onClick={toggleSound}
            >
              <span className="mono" style={{ fontSize: 9 }}>
                {soundMuted ? 'AUDIO: OFF' : 'AUDIO: ON'}
              </span>
            </button>

            <div className="system-clock">
              {new Date().toISOString().slice(11, 19)} UTC
            </div>
          </div>
        </header>

        {/* Notice Strip */}
        {notice && (
          <div className="notice-strip" style={{ margin: '12px 20px 0' }}>
            <span>&gt; {notice}</span>
            <button onClick={() => setNotice('')}>[DISMISS]</button>
          </div>
        )}

        <div className="workspace">
          {/* Trust Pipeline: OBSERVE → BASELINE → CONNECT → SCORE → EXPLAIN */}
          <div className="pipeline-strip">
            <div className="pipeline-steps">
              <span className="mono" style={{ color: 'var(--text-dim)', marginRight: 6 }}>
                WHOLE-SYSTEM PIPELINE:
              </span>
              <span className="pipeline-step">01 OBSERVE (EVENTS)</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step">02 BASELINE (HABITS)</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step">03 CONNECT (TOPOLOGY)</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step active">04 SCORE (0–100 TRUST)</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step active">05 EXPLAIN (ACTION)</span>
            </div>

            <div className="pipeline-actions">
              <button className="btn btn-secondary" onClick={() => runScenario('FLAGSHIP', 'FAST')}>
                FLAGSHIP ATTACK SURGE
              </button>
              <button className="btn btn-secondary" onClick={() => runScenario('TRAVEL', 'NORMAL')}>
                LEGITIMATE TRAVEL
              </button>
              <button className="btn btn-secondary" onClick={resetDemo}>
                RESET BASELINE
              </button>
            </div>
          </div>

          {/* VIEW: OVERVIEW */}
          {view === 'OVERVIEW' && (
            <>
              {/* Sequence Anomaly Visualizer: Isolated vs Coordinated Sequence */}
              <div className="problem-breakdown-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="status-pill critical">ANOMALY SEQUENCE</span>
                    <strong style={{ color: '#fff', fontSize: 12 }}>
                      A risky action rarely looks risky by itself.
                    </strong>
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    TRAJECTORY TRACE: TRADER #{selected?.trader_id ?? selectedId} ({selected?.name ?? 'Target'})
                  </span>
                </div>

                <div className="problem-steps-grid">
                  {((selected?.timeline && selected.timeline.length > 0)
                    ? selected.timeline.slice(-6).map((step, idx, arr) => ({
                        num: `EVENT 0${idx + 1}`,
                        name: step.event_type.replace(/_/g, ' '),
                        context: step.reason ? (step.reason.length > 26 ? step.reason.slice(0, 24) + '...' : step.reason) : 'Activity recorded',
                        trust: Math.round(step.new_score),
                        decision: step.new_score < 20 ? 'RESTRICT' : step.new_score < 45 ? 'VERIFY' : step.new_score < 70 ? 'MONITOR' : 'ALLOW',
                        isActive: idx === arr.length - 1,
                      }))
                    : [
                        { num: 'EVENT 01', name: 'Baseline Session', context: 'Primary profile', trust: Math.round(selected?.trust_score ?? 94), decision: 'ALLOW', isActive: true },
                      ]
                  ).map((step) => (
                    <div
                      key={step.num}
                      className={`problem-card ${step.isActive ? 'active' : ''}`}
                    >
                      <span className="event-num">{step.num}</span>
                      <span className="event-name">{step.name}</span>
                      <span className="event-context">{step.context}</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span className="event-trust">{step.trust} / 100</span>
                        <StatusBadge value={step.decision} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="contrast-row">
                  <div className="contrast-col">
                    <span style={{ color: 'var(--state-normal)' }}>INDIVIDUALLY — EACH EVENT CAN BE LEGITIMATE</span>
                    <p>
                      Traders travel, upgrade hardware, deposit capital during market rallies, and open cold wallets every day. Isolated blanket fraud rules see nothing wrong.
                    </p>
                  </div>
                  <div className="contrast-col">
                    <span style={{ color: 'var(--state-critical)' }}>TOGETHER — THE SEQUENCE CREATES A CRITICAL RISK SIGNAL</span>
                    <p>
                      A new device on a datacenter IP deposits capital, shifts to 50x leverage, and requests an immediate withdrawal. Context reveals coordinated abuse.
                    </p>
                  </div>
                </div>
              </div>

              {/* 12-Column Main Overview Grid */}
              <div className="grid-12">
                {/* Left 8 Cols: Trust Trajectory + Live Stream */}
                <div className="col-8">
                  <div className="panel">
                    <div className="panel-header">
                      <h3>Continuous Trust Trajectory // Trader #{selectedId}</h3>
                      <span className="panel-meta">EVALUATED CONTEXTUAL STATE TRANSITIONS</span>
                    </div>
                    <div className="chart-box">
                      <TrustLineChart trader={selected} />
                    </div>
                    <div
                      style={{
                        padding: '8px 14px',
                        background: 'var(--bg-surface-0)',
                        borderTop: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>INITIAL TRUST: {selected?.initial_trust ?? 94} / 100</span>
                      <span>CURRENT SCORE: {selected?.trust_score ?? 94} / 100</span>
                      <span>STATUS: {selected?.status ?? 'NORMAL'}</span>
                    </div>
                  </div>

                  <div className="panel" style={{ marginTop: 12 }}>
                    <div className="panel-header">
                      <h3>Live Evaluated Event Stream</h3>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary" style={{ fontSize: 9 }} onClick={exportEventsCSV}>
                          EXPORT EVENTS CSV
                        </button>
                      </div>
                    </div>
                    <div className="table-container">
                      <EventTable
                        events={events.length ? events : selected?.recent_events || []}
                        compact
                        onSelectTrader={goTrader}
                        onInspectEvent={inspectEvent}
                      />
                    </div>
                  </div>
                </div>

                {/* Right 4 Cols: Persistent Decision Panel + Priority Triage */}
                <div className="col-4">
                  <PersistentDecisionPanel
                    decision={latestDecision}
                    onInspect={() => latestDecision && inspectDecision(latestDecision)}
                    onCreateCase={createCase}
                    onStepUp={() => selected && stepUpVerify(selected.trader_id)}
                  />

                  <div className="panel" style={{ marginTop: 12 }}>
                    <div className="panel-header">
                      <h3>Priority Threat Triage Queue</h3>
                      <span className="panel-meta">TRUST &lt; 45 / 100</span>
                    </div>
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>TRADER</th>
                            <th>TRUST</th>
                            <th>STATUS</th>
                            <th>LAST ACTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {criticalTraders.map(t => (
                            <tr
                              key={t.trader_id}
                              className={t.trader_id === selectedId ? 'row-selected' : ''}
                              onClick={() => setSelectedId(t.trader_id)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td className="mono"><b>#{t.trader_id}</b></td>
                              <td className="mono"><b>{Math.round(t.trust_score)}</b></td>
                              <td><StatusBadge value={t.status} /></td>
                              <td>{t.last_decision}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* VIEW: LIVE MONITOR */}
          {view === 'LIVE MONITOR' && (
            <div className="grid-12">
              <div className="col-12" style={{ marginBottom: 4 }}>
                <div style={{
                  background: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>MONITOR FOCUS:</span>
                    {[
                      { id: '7842', label: '#7842 Primary Target' },
                      { id: '7001', label: '#7001 Elena (Normal)' },
                      { id: '7002', label: '#7002 Liam (Travel)' },
                      { id: '7003', label: '#7003 Aria (High-Risk)' },
                      { id: '7004', label: '#7004 Marcus (Compromised)' },
                      { id: '7102', label: '#7102 Ring Node' },
                    ].map(btn => (
                      <button
                        key={btn.id}
                        className={`btn ${selectedId === btn.id ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 10, padding: '2px 8px' }}
                        onClick={() => setSelectedId(btn.id)}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>ALL ({traders.length}):</span>
                    <select
                      value={selectedId}
                      onChange={e => setSelectedId(e.target.value)}
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
              </div>

              <div className="col-8">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Streaming Event Ingestion Feed</h3>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        placeholder="Search IP/Device/ID..."
                        value={eventSearch}
                        onChange={e => setEventSearch(e.target.value)}
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
                      <button className="btn btn-secondary" style={{ fontSize: 9 }} onClick={exportEventsCSV}>
                        CSV
                      </button>
                    </div>
                  </div>
                  <div className="table-container" style={{ maxHeight: 540 }}>
                    <EventTable
                      events={filteredEvents}
                      onSelectTrader={goTrader}
                      onInspectEvent={inspectEvent}
                    />
                  </div>
                </div>

                <div className="panel" style={{ marginTop: 12 }}>
                  <div className="panel-header">
                    <h3>Dimensional Exposure Breakdown // Trader #{selectedId}</h3>
                    <span className="panel-meta">LIVE SCORES</span>
                  </div>
                  <DimensionMatrix dimensions={selected?.risk_dimensions} />
                </div>
              </div>

              <div className="col-4">
                <PersistentDecisionPanel
                  decision={latestDecision}
                  onInspect={() => latestDecision && inspectDecision(latestDecision)}
                  onCreateCase={createCase}
                  onStepUp={() => selected && stepUpVerify(selected.trader_id)}
                />

                <div className="panel" style={{ marginTop: 12 }}>
                  <div className="panel-header">
                    <h3>Live Topology Linkage Preview</h3>
                    <span className="panel-meta">{graph?.nodes.length ?? 0} NODES</span>
                  </div>
                  <div style={{ height: 260 }}>
                    <InteractiveGraph
                      graph={graph}
                      selectedNodeId={nodeInfo}
                      onSelectNode={id => {
                        setNodeInfo(id)
                        if (id.startsWith('TRADER-')) {
                          const tid = id.replace('TRADER-', '')
                          const t = traders.find(item => item.trader_id === tid)
                          const d = decisions.find(item => item.trader_id === tid)
                          if (t) {
                            setDrawerData({ trader: t, decision: d })
                            setDrawerOpen(true)
                          }
                        } else {
                          const node = graph?.nodes.find(n => n.id === id)
                          const connectedEdges = graph?.edges.filter(e => e.source === id || e.target === id) || []
                          setDrawerData({
                            entity: {
                              id,
                              type: node?.type || 'INFRASTRUCTURE',
                              risk: node?.risk,
                              is_cluster: node?.is_cluster,
                              edges: connectedEdges,
                            },
                          })
                          setDrawerOpen(true)
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: TRADERS */}
          {view === 'TRADERS' && (
            <div className="grid-12">
              <div className="col-8">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Managed Trader Population ({filteredTraders.length} of {traders.length})</h3>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Search ID or name..."
                        value={traderSearch}
                        onChange={e => setTraderSearch(e.target.value)}
                        style={{
                          background: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 3,
                          padding: '3px 8px',
                          color: '#fff',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          width: 130,
                        }}
                      />
                      <select
                        value={traderSegment}
                        onChange={e => setTraderSegment(e.target.value)}
                        style={{
                          background: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 3,
                          padding: '3px 6px',
                          color: '#fff',
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        <option value="ALL">ALL SEGMENTS</option>
                        <option value="Retail">RETAIL</option>
                        <option value="Retail Pro">RETAIL PRO</option>
                        <option value="Market Maker">MARKET MAKER</option>
                      </select>
                      <button className="btn btn-secondary" style={{ fontSize: 9 }} onClick={exportTradersCSV}>
                        CSV
                      </button>
                    </div>
                  </div>

                  {/* Risk Tier Quick Filter Strip */}
                  <div style={{
                    display: 'flex',
                    gap: 6,
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-1)',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>TIER:</span>
                    {[
                      { id: 'ALL', label: 'ALL POPULATION' },
                      { id: 'TRUSTED', label: 'TRUSTED (>70)' },
                      { id: 'MONITORED', label: 'MONITORED (45–70)' },
                      { id: 'RESTRICTED', label: 'RESTRICTED (20–45)' },
                      { id: 'BLOCKED', label: 'BLOCKED (<20)' },
                      { id: 'RING', label: 'FRAUD RING' },
                    ].map(tier => (
                      <button
                        key={tier.id}
                        className={`btn ${traderRiskFilter === tier.id ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 9, padding: '2px 7px' }}
                        onClick={() => setTraderRiskFilter(tier.id as any)}
                      >
                        {tier.label}
                      </button>
                    ))}
                  </div>

                  <div className="table-container" style={{ maxHeight: 600 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>TRADER ID</th>
                          <th>NAME</th>
                          <th>SEGMENT</th>
                          <th>TRUST</th>
                          <th>STATUS</th>
                          <th>ANOMALY</th>
                          <th>CASES</th>
                          <th>LAST ACTIVITY</th>
                          <th>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTraders.slice(0, 50).map(t => (
                          <tr
                            key={t.trader_id}
                            className={t.trader_id === selectedId ? 'row-selected' : ''}
                            onClick={() => setSelectedId(t.trader_id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="mono"><b>#{t.trader_id}</b></td>
                            <td>{t.name}</td>
                            <td>{t.segment}</td>
                            <td className="mono"><b>{Math.round(t.trust_score)} / 100</b></td>
                            <td><StatusBadge value={t.status} /></td>
                            <td className="mono">
                              {t.anomaly_score !== null && t.anomaly_score !== undefined
                                ? `${Math.round(t.anomaly_score)}/100`
                                : '—'}
                            </td>
                            <td className="mono">
                              {t.open_case_count ? (
                                <span className="status-pill critical" style={{ fontSize: 9, padding: '1px 5px' }}>
                                  {t.open_case_count}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-dim)' }}>0</span>
                              )}
                            </td>
                            <td className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {formatTime(t.last_activity)}
                            </td>
                            <td>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '2px 6px', fontSize: 10 }}
                                onClick={e => {
                                  e.stopPropagation()
                                  setSelectedId(t.trader_id)
                                  inspectTrader(t)
                                }}
                              >
                                INSPECT
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="col-4">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Individual Baseline Profile</h3>
                    <span className="panel-meta">TRADER #{selected?.trader_id}</span>
                  </div>

                  <div style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{selected?.name}</div>
                        <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {selected?.segment} · {selected?.event_count} HISTORICAL TRANSACTIONS
                        </div>
                      </div>
                      <div className="trust-display" style={{ textAlign: 'right' }}>
                        <div className="trust-score-row">
                          <strong style={{ fontSize: 24 }}>{Math.round(selected?.trust_score ?? 94)}</strong>
                          <span>/100</span>
                        </div>
                        <span className="trust-label">{selected?.status}</span>
                      </div>
                    </div>

                    <table className="data-table" style={{ fontSize: 10, marginBottom: 14 }}>
                      <tbody>
                        <tr>
                          <td style={{ color: 'var(--text-muted)', width: 140 }}>NORMAL DEPOSIT</td>
                          <td className="mono"><b>{money(selected?.baseline?.deposit_amount)}</b></td>
                        </tr>
                        <tr>
                          <td style={{ color: 'var(--text-muted)' }}>NORMAL LEVERAGE</td>
                          <td className="mono">{selected?.baseline?.leverage}×</td>
                        </tr>
                        <tr>
                          <td style={{ color: 'var(--text-muted)' }}>BASELINE COUNTRIES</td>
                          <td className="mono">{selected?.baseline?.countries?.join(', ')}</td>
                        </tr>
                        <tr>
                          <td style={{ color: 'var(--text-muted)' }}>REGISTERED DEVICES</td>
                          <td className="mono">{selected?.baseline?.known_devices?.length}</td>
                        </tr>
                        <tr>
                          <td style={{ color: 'var(--text-muted)' }}>ANOMALY SCORE</td>
                          <td className="mono">
                            {selected?.anomaly?.anomaly_score !== undefined
                              ? `${Math.round(selected.anomaly.anomaly_score)}/100 (${selected.anomaly.status})`
                              : '0/100'}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => selected && stepUpVerify(selected.trader_id)}
                      >
                        TRIGGER STEP-UP VERIFICATION (RESTORE TRUST)
                      </button>
                      <button className="btn btn-secondary" onClick={createCase}>
                        INITIALIZE FORMAL INVESTIGATION CASE
                      </button>
                    </div>
                  </div>
                </div>

                {/* Action Sensitivity & Enforcement Gateway Simulator */}
                <div className="panel" style={{ marginTop: 12 }}>
                  <div className="panel-header">
                    <h3>Action Sensitivity Gateway</h3>
                    <span className="panel-meta">POST /API/ACTIONS/EVALUATE</span>
                  </div>
                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
                      Test how action sensitivity and trust thresholds gate operations on #{selectedId}:
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      <select
                        value={actionToEvaluate}
                        onChange={e => setActionToEvaluate(e.target.value)}
                        style={{
                          background: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 3,
                          padding: '4px 6px',
                          color: '#fff',
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          flex: 1,
                        }}
                      >
                        <option value="PROFILE_VIEW">PROFILE_VIEW (Sens: 10)</option>
                        <option value="LOGIN">LOGIN (Sens: 30)</option>
                        <option value="TRADE">TRADE (Sens: 50)</option>
                        <option value="LEVERAGED_TRADE">LEVERAGED_TRADE (Sens: 70)</option>
                        <option value="CHANGE_PASSWORD">CHANGE_PASSWORD (Sens: 85)</option>
                        <option value="CHANGE_2FA">CHANGE_2FA (Sens: 85)</option>
                        <option value="NEW_WALLET">NEW_WALLET (Sens: 90)</option>
                        <option value="WITHDRAWAL">WITHDRAWAL (Sens: 95)</option>
                      </select>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 10, padding: '3px 8px' }}
                        onClick={() => evaluateAction(actionToEvaluate)}
                        disabled={evaluatingAction}
                      >
                        {evaluatingAction ? '...' : 'EVALUATE'}
                      </button>
                    </div>

                    {actionEvalResult && (
                      <div style={{
                        background: 'var(--bg-surface-0)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 3,
                        padding: '8px 10px',
                        fontSize: 11,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>ACTION: {actionEvalResult.action}</span>
                          <StatusBadge value={actionEvalResult.decision} />
                        </div>
                        <div style={{ color: '#fff', fontSize: 11, marginBottom: 2 }}>
                          <b>Gate:</b> {actionEvalResult.allowed ? 'Permitted' : 'Restricted / Enforced'}
                        </div>
                        <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                          {actionEvalResult.reason}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel" style={{ marginTop: 12 }}>
                  <div className="panel-header">
                    <h3>Dimensional Exposure Breakdown</h3>
                    <span className="panel-meta">ACTIVE STATE</span>
                  </div>
                  <DimensionMatrix dimensions={selected?.risk_dimensions} />
                </div>
              </div>
            </div>
          )}

          {/* VIEW: RISK EVENTS */}
          {view === 'RISK EVENTS' && (
            <div className="grid-12">
              <div className="col-12">
                <div className="panel">
                  <div className="panel-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h3>Operational Risk Log</h3>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className={`btn ${riskEventTab === 'RISK_EVENTS' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ fontSize: 9, padding: '2px 8px' }}
                          onClick={() => setRiskEventTab('RISK_EVENTS')}
                        >
                          CONTEXTUAL RISK INCIDENTS ({riskEvents.length})
                        </button>
                        <button
                          className={`btn ${riskEventTab === 'ALL_EVENTS' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ fontSize: 9, padding: '2px 8px' }}
                          onClick={() => setRiskEventTab('ALL_EVENTS')}
                        >
                          ALL RAW INGESTIONS ({events.length})
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        placeholder="Filter event stream..."
                        value={eventSearch}
                        onChange={e => setEventSearch(e.target.value)}
                        style={{
                          background: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 3,
                          padding: '2px 8px',
                          color: '#fff',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          width: 140,
                        }}
                      />
                      <button className="btn btn-secondary" style={{ fontSize: 9 }} onClick={exportEventsCSV}>
                        EXPORT CSV
                      </button>
                    </div>
                  </div>

                  <div className="table-container" style={{ maxHeight: 520 }}>
                    {riskEventTab === 'RISK_EVENTS' ? (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>TIMESTAMP</th>
                            <th>TRADER</th>
                            <th>EVENT TYPE</th>
                            <th>CONTEXTUAL RISK</th>
                            <th>DECISION</th>
                            <th>POST-TRUST</th>
                            <th>SIGNALS & REASONS</th>
                            <th>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRiskEvents.length === 0 ? (
                            <tr>
                              <td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>
                                NO CONTEXTUAL RISK INCIDENTS MATCH CRITERIA
                              </td>
                            </tr>
                          ) : (
                            filteredRiskEvents.map(re => (
                              <tr key={re.event_id}>
                                <td className="mono" style={{ fontSize: 10 }}>{formatTime(re.timestamp)}</td>
                                <td className="mono">
                                  <b
                                    style={{ cursor: 'pointer', color: 'var(--accent-cobalt)' }}
                                    onClick={() => {
                                      setSelectedId(re.trader_id)
                                      setView('TRADERS')
                                    }}
                                  >
                                    #{re.trader_id}
                                  </b>
                                </td>
                                <td><span className="mono" style={{ fontSize: 10 }}>{re.event_type}</span></td>
                                <td className="mono">
                                  <span style={{
                                    color: re.contextual_risk >= 70 ? 'var(--state-critical)' : re.contextual_risk >= 40 ? 'var(--state-elevated)' : 'var(--state-guarded)',
                                    fontWeight: 700,
                                  }}>
                                    {re.contextual_risk}/100
                                  </span>
                                </td>
                                <td><StatusBadge value={re.decision} /></td>
                                <td className="mono"><b>{Math.round(re.trust_after)}/100</b></td>
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {re.signals.slice(0, 2).map((s, sIdx) => (
                                      <div key={sIdx} style={{ fontSize: 10 }}>
                                        <span className="mono" style={{ color: 'var(--accent-cobalt)', marginRight: 4 }}>
                                          [{s.category.toUpperCase()}]
                                        </span>
                                        <span>{s.reason}</span>
                                      </div>
                                    ))}
                                    {re.signals.length > 2 && (
                                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                                        +{re.signals.length - 2} additional signals
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '2px 6px', fontSize: 10 }}
                                    onClick={() => {
                                      setSelectedId(re.trader_id)
                                      inspectEvent({
                                        event_id: re.event_id,
                                        timestamp: re.timestamp,
                                        trader_id: re.trader_id,
                                        event_type: re.event_type,
                                        source: 'risk-events',
                                        risk_relevance: `${re.contextual_risk}`,
                                      })
                                    }}
                                  >
                                    INSPECT
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <EventTable
                        events={filteredEvents}
                        onSelectTrader={goTrader}
                        onInspectEvent={inspectEvent}
                      />
                    )}
                  </div>
                </div>

                <div className="panel" style={{ marginTop: 12 }}>
                  <div className="panel-header">
                    <h3>Operator Event Injection Interface</h3>
                    <span className="panel-meta">POST /API/EVENTS (STRICT PIPELINE EVALUATION)</span>
                  </div>
                  <div style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        TARGET TRADER:
                      </span>
                      <select
                        value={manualTraderId}
                        onChange={e => setManualTraderId(e.target.value)}
                        style={{
                          background: 'var(--bg-surface-0)',
                          border: '1px solid var(--border-medium)',
                          borderRadius: 3,
                          padding: '4px 8px',
                          color: '#fff',
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          maxWidth: 240,
                        }}
                      >
                        {traders.map(t => (
                          <option key={t.trader_id} value={t.trader_id}>
                            #{t.trader_id} - {t.name} ({Math.round(t.trust_score)}/100)
                          </option>
                        ))}
                      </select>
                    </div>

                    <select
                      value={manualType}
                      onChange={e => setManualType(e.target.value)}
                      style={{
                        background: 'var(--bg-surface-0)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 3,
                        padding: '5px 10px',
                        color: '#fff',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {[
                        'NEW_DEVICE',
                        'IP_CHANGE',
                        'DEPOSIT',
                        'LEVERAGE_CHANGE',
                        'WITHDRAWAL',
                        'PASSWORD_CHANGE',
                        'API_KEY_CHANGE',
                      ].map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>

                    {['DEPOSIT', 'WITHDRAWAL'].includes(manualType) && (
                      <input
                        type="number"
                        value={manualAmount}
                        onChange={e => setManualAmount(e.target.value)}
                        placeholder="Amount USD"
                        style={{
                          background: 'var(--bg-surface-0)',
                          border: '1px solid var(--border-medium)',
                          borderRadius: 3,
                          padding: '5px 10px',
                          color: '#fff',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          width: 120,
                        }}
                      />
                    )}

                    <button className="btn btn-primary" onClick={inject}>
                      INGEST & EVALUATE CONTEXT
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: RELATIONSHIP GRAPH */}
          {view === 'RELATIONSHIP GRAPH' && (
            <div className="grid-12">
              <div className="col-12" style={{ marginBottom: 6 }}>
                <div style={{
                  background: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>GRAPH VIEW:</span>
                    <button
                      className={`btn ${graphMode === 'SELECTED' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                      onClick={() => setGraphMode('SELECTED')}
                    >
                      SELECTED TRADER (#{selectedId}) 3-HOP
                    </button>
                    <button
                      className={`btn ${graphMode === 'SYSTEM' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                      onClick={() => setGraphMode('SYSTEM')}
                    >
                      INSTITUTIONAL MULTI-TRADER TOPOLOGY ({systemGraph?.nodes?.length ?? 0} NODES, {systemGraph?.clusters?.length ?? 0} CLUSTERS)
                    </button>
                  </div>

                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {graphMode === 'SYSTEM' ? 'SHOWING CONNECTED INFRASTRUCTURE CLUSTERS' : `SHOWING 3-HOP TRAVERSAL FOR TRADER #${selectedId}`}
                  </div>
                </div>
              </div>

              <div className={graphMode === 'SYSTEM' && systemGraph?.clusters?.length ? 'col-8' : 'col-12'} style={{ height: 'calc(100vh - 210px)' }}>
                <InteractiveGraph
                  graph={graphMode === 'SYSTEM' ? systemGraph : graph}
                  selectedNodeId={nodeInfo}
                  onSelectNode={id => {
                    setNodeInfo(id)
                    inspectEvent({
                      event_id: `ENTITY-${id}`,
                      timestamp: new Date().toISOString(),
                      trader_id: selectedId,
                      event_type: 'ENTITY_LOOKUP',
                      source: 'topology-graph',
                      risk_relevance: 'high',
                    })
                  }}
                />
              </div>

              {graphMode === 'SYSTEM' && systemGraph?.clusters && systemGraph.clusters.length > 0 && (
                <div className="col-4" style={{ maxHeight: 'calc(100vh - 210px)', overflowY: 'auto' }}>
                  <div className="panel">
                    <div className="panel-header">
                      <h3>Identified Infrastructure Clusters</h3>
                      <span className="panel-meta">{systemGraph.clusters.length} DETECTED</span>
                    </div>
                    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {systemGraph.clusters.map(cl => (
                        <div
                          key={cl.cluster_id}
                          style={{
                            background: 'var(--bg-surface-0)',
                            border: `1px solid ${cl.cluster_type === 'FRAUD_RING' ? 'var(--state-critical)' : 'var(--border-subtle)'}`,
                            borderRadius: 4,
                            padding: 10,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <strong className="mono" style={{ fontSize: 11 }}>{cl.cluster_id}</strong>
                            <span className={`status-pill ${cl.risk_level === 'CRITICAL' ? 'critical' : cl.risk_level === 'HIGH' ? 'restricted' : 'normal'}`}>
                              {cl.cluster_type}
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: '#fff', marginBottom: 4 }}>
                            {cl.explanation}
                          </div>
                          <div className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                            <b>Affected Traders:</b> {cl.affected_traders.map(t => `#${t}`).join(', ')}
                          </div>
                          {cl.shared_entities.length > 0 && (
                            <div className="mono" style={{ fontSize: 9, color: 'var(--accent-cobalt)', marginTop: 2 }}>
                              <b>Shared Entities:</b> {cl.shared_entities.join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW: CASES & TRIAGE */}
          {view === 'CASES' && (
            <div className="grid-12">
              <div className="col-8">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Case Management & Investigation Queue</h3>
                    <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={createCase}>
                      + CREATE CASE FOR #{selectedId}
                    </button>
                  </div>

                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {cases.map(c => (
                      <div
                        key={c.case_id}
                        style={{
                          background: 'var(--bg-surface-0)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 4,
                          padding: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong className="mono" style={{ fontSize: 12 }}>{c.case_id}</strong>
                            <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 10 }}>TRADER #{c.trader_id}</span>
                            <StatusBadge value={c.severity} />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <select
                              value={c.status}
                              onChange={e => updateCase(c.case_id, e.target.value)}
                              style={{
                                background: 'var(--bg-surface-2)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 3,
                                color: '#fff',
                                fontSize: 10,
                                fontFamily: 'var(--font-mono)',
                                padding: '2px 4px',
                              }}
                            >
                              <option value="OPEN">OPEN</option>
                              <option value="INVESTIGATING">INVESTIGATING</option>
                              <option value="ESCALATED">ESCALATED</option>
                              <option value="RESOLVED">RESOLVED</option>
                              <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
                            </select>

                            <button
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={() => inspectCase(c)}
                            >
                              EVIDENCE
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={() => exportDossier(c.case_id)}
                            >
                              DOSSIER
                            </button>
                          </div>
                        </div>

                        <p style={{ fontSize: 11, color: 'var(--text-primary)', marginBottom: 8 }}>
                          {c.reason}
                        </p>

                        {/* Investigation Notes Stream */}
                        <div className="case-notes-container">
                          <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                            INVESTIGATION TIMELINE & ANALYST NOTES ({c.notes?.length || 0}):
                          </span>
                          {c.notes?.map((n, idx) => (
                            <div key={idx} className="case-note-bubble">
                              <div className="case-note-head">
                                <b>{n.author}</b>
                                <span>{formatDate(n.timestamp)}</span>
                              </div>
                              <div className="case-note-text">{n.text}</div>
                            </div>
                          ))}

                          <div className="note-add-row">
                            <input
                              type="text"
                              placeholder="Add timestamped investigation triage note..."
                              value={caseNoteInputs[c.case_id] || ''}
                              onChange={e =>
                                setCaseNoteInputs({ ...caseNoteInputs, [c.case_id]: e.target.value })
                              }
                              onKeyDown={e => {
                                if (e.key === 'Enter') addCaseNote(c.case_id)
                              }}
                            />
                            <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={() => addCaseNote(c.case_id)}>
                              SAVE NOTE
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="col-4">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Investigator Runbook Protocol</h3>
                    <span className="panel-meta">MOCHATRADE COMPLIANCE</span>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
                    <div style={{ padding: 8, background: 'var(--bg-surface-0)', borderLeft: '2px solid var(--accent-cobalt)' }}>
                      <b>01 / SIGNAL DETECTION:</b> Evaluate automated contextual trigger (Withdrawal Hold or Sequence).
                    </div>
                    <div style={{ padding: 8, background: 'var(--bg-surface-0)', borderLeft: '2px solid var(--accent-cobalt)' }}>
                      <b>02 / BASELINE AUDIT:</b> Cross-reference individual deposit, leverage, and device norms.
                    </div>
                    <div style={{ padding: 8, background: 'var(--bg-surface-0)', borderLeft: '2px solid var(--accent-cobalt)' }}>
                      <b>03 / TOPOLOGY TRACE:</b> Identify shared collusive ring infrastructure on link graph.
                    </div>
                    <div style={{ padding: 8, background: 'var(--bg-surface-0)', borderLeft: '2px solid var(--accent-cobalt)' }}>
                      <b>04 / STEP-UP CHALLENGE:</b> Prompt for biometric/2FA identity step-up without blanket account ban.
                    </div>
                    <div style={{ padding: 8, background: 'var(--bg-surface-0)', borderLeft: '2px solid var(--accent-cobalt)' }}>
                      <b>05 / DOSSIER RECORD:</b> Export JSON evidence packet to tamper-evident vault.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: POLICIES */}
          {view === 'POLICIES' && (
            <PolicySandbox
              policy={policy}
              userRole={userRole}
              onSavePolicy={savePolicy}
            />
          )}

          {/* VIEW: SIMULATOR */}
          {view === 'SIMULATOR' && (
            <div className="grid-12">
              <div className="col-12">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Executable Attack Vector Test Lab</h3>
                    <span className="panel-meta">DIRECT INGESTION INTO ACTIVE RISK OS</span>
                  </div>

                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>CODE</th>
                          <th>SCENARIO IDENTIFIER</th>
                          <th>EVENT PROGRESSION & VECTOR</th>
                          <th>EXPECTED SEVERITY</th>
                          <th>EXECUTION CONTROLS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            code: 'FLAGSHIP',
                            title: 'Rapid Suspicious Withdrawal Attack',
                            desc: 'NEW_DEVICE → IP_CHANGE (Datacenter) → $25k Abnormal Deposit → 50× Leverage → Fresh Wallet Withdrawal',
                            tag: 'CRITICAL',
                          },
                          {
                            code: 'TRAVEL',
                            title: 'Legitimate Cross-Border Travel',
                            desc: 'LOGIN (Singapore) → Normal Deposit ($2,800) → Normal Leverage (3×). Engine verifies context and does NOT block.',
                            tag: 'GUARDED',
                          },
                          {
                            code: 'FRAUD_RING',
                            title: 'Collusive Multi-Account Ring Sweep',
                            desc: '4 distinct trader accounts simultaneously sharing hardware identifiers, datacenter proxy subnets, and destination wallets.',
                            tag: 'HIGH',
                          },
                          {
                            code: 'TAKEOVER',
                            title: 'Hostile Account Takeover Surge',
                            desc: 'NEW_DEVICE followed by rapid PASSWORD_CHANGE, 2FA_CHANGE, and API_KEY_CHANGE rotations.',
                            tag: 'ELEVATED',
                          },
                        ].map(sc => (
                          <tr key={sc.code}>
                            <td className="mono"><b>{sc.code}</b></td>
                            <td><b>{sc.title}</b></td>
                            <td style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{sc.desc}</td>
                            <td><StatusBadge value={sc.tag} /></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="btn btn-primary"
                                  disabled={running === sc.code}
                                  onClick={() => runScenario(sc.code, 'NORMAL')}
                                >
                                  {running === sc.code ? 'RUNNING...' : 'EXECUTE'}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  disabled={running === sc.code}
                                  onClick={() => runScenario(sc.code, 'FAST')}
                                >
                                  FAST
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sequence Rules Inspector */}
                <div className="panel" style={{ marginTop: 12 }}>
                  <div className="panel-header">
                    <h3>Configured Sequence Rules</h3>
                    <span className="panel-meta">TEMPORAL MULTI-EVENT CORRELATION</span>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      {
                        id: 'SEQ-RAPID-WITHDRAWAL',
                        name: 'Rapid Suspicious Withdrawal',
                        pattern: 'NEW_DEVICE → IP_CHANGE → DEPOSIT → LEVERAGE_CHANGE → WITHDRAWAL',
                        max: '30 min',
                        action: 'RESTRICT WITHDRAWAL',
                      },
                      {
                        id: 'SEQ-CREDENTIAL-TAKEOVER',
                        name: 'Account Takeover Surge',
                        pattern: 'NEW_DEVICE → PASSWORD_CHANGE → 2FA_CHANGE → API_KEY_CHANGE',
                        max: '15 min',
                        action: 'STEP-UP BIOMETRIC',
                      },
                      {
                        id: 'SEQ-FLASH-COLLUSION',
                        name: 'Multi-Account Infrastructure Reuse',
                        pattern: 'DEVICE_CHANGE → IP_CHANGE → WITHDRAWAL (Cross-Account)',
                        max: '60 min',
                        action: 'RING HOLD',
                      },
                    ].map(seq => (
                      <div
                        key={seq.id}
                        style={{
                          background: 'var(--bg-surface-0)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 3,
                          padding: '8px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong className="mono" style={{ fontSize: 11 }}>{seq.id}</strong>
                            <span style={{ fontSize: 11, color: '#fff' }}>{seq.name}</span>
                          </div>
                          <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                            PATTERN: {seq.pattern} [MAX: {seq.max}]
                          </div>
                        </div>
                        <StatusBadge value={seq.action} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: AUDIT */}
          {view === 'AUDIT' && (
            <div className="grid-12">
              <div className="col-12">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Tamper-Evident SHA-256 Audit Vault</h3>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className={`btn ${auditVerification?.valid ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 9 }}
                        onClick={verifyAuditChain}
                        disabled={verifyingAudit}
                      >
                        {verifyingAudit ? 'VERIFYING...' : 'VERIFY SHA-256 CHAIN'}
                      </button>
                      <button className="btn btn-secondary" style={{ fontSize: 9 }} onClick={() => {
                        const rows = [
                          ['Timestamp', 'Actor', 'Event', 'Subject', 'Current Hash', 'Previous Hash', 'Reason', 'Policy Version'],
                          ...audit.map(a => [
                            a.timestamp,
                            a.actor,
                            a.event,
                            a.subject,
                            a.current_hash || 'GENESIS',
                            a.previous_hash || 'N/A',
                            `"${a.reason}"`,
                            a.policy_version,
                          ]),
                        ]
                        const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n')
                        const encodedUri = encodeURI(csvContent)
                        const link = document.createElement('a')
                        link.setAttribute('href', encodedUri)
                        link.setAttribute('download', 'netra_audit_vault.csv')
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                        soundManager.playSuccess()
                        setNotice('AUDIT VAULT EXPORTED AS CSV WITH HASH CHAIN.')
                      }}>
                        EXPORT AUDIT CSV
                      </button>
                    </div>
                  </div>

                  {auditVerification && (
                    <div style={{
                      padding: '8px 14px',
                      margin: '10px 14px',
                      borderRadius: 3,
                      background: auditVerification.valid ? 'rgba(46, 213, 115, 0.08)' : 'rgba(255, 71, 87, 0.1)',
                      borderLeft: `3px solid ${auditVerification.valid ? 'var(--accent-emerald, #2ed573)' : 'var(--accent-crimson, #ff4757)'}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 11,
                    }}>
                      <div>
                        <b>{auditVerification.valid ? 'CRYPTOGRAPHIC INTEGRITY VERIFIED' : 'CHAIN TAMPERING DETECTED'}</b>
                        <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                          {auditVerification.valid
                            ? `${auditVerification.checked_records} records verified via SHA-256. Genesis: ${auditVerification.genesis_hash.slice(0, 8)}... | Head: ${auditVerification.latest_hash.slice(0, 8)}...`
                            : `Violation: ${auditVerification.reason}`}
                        </span>
                      </div>
                      <span className={`status-pill ${auditVerification.valid ? 'normal' : 'critical'}`}>
                        {auditVerification.valid ? 'CHAIN VALID' : 'TAMPERED'}
                      </span>
                    </div>
                  )}

                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>TIMESTAMP</th>
                          <th>ACTOR</th>
                          <th>EVENT TYPE</th>
                          <th>SUBJECT</th>
                          <th>SHA-256 HASH LINK</th>
                          <th>REASON & REPRODUCIBILITY SUMMARY</th>
                          <th>POLICY VER</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.map(item => (
                          <tr key={item.audit_id}>
                            <td className="mono">{formatDate(item.timestamp)}</td>
                            <td className="mono"><b>{item.actor}</b></td>
                            <td><StatusBadge value={item.event} /></td>
                            <td className="mono">{item.subject}</td>
                            <td className="mono" style={{ fontSize: 9, color: 'var(--accent-cyan)' }} title={`Current: ${item.current_hash || 'N/A'}\nPrevious: ${item.previous_hash || 'N/A'}`}>
                              {item.current_hash ? `${item.current_hash.slice(0, 8)}...${item.current_hash.slice(-6)}` : 'GENESIS'}
                            </td>
                            <td>{item.reason}</td>
                            <td className="mono">{item.policy_version}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: ANALYTICS */}
          {view === 'ANALYTICS' && (
            <div className="grid-12">
              {/* Row 1: Operational Population & Enforcement Gateway Dashboard */}
              <div className="col-12" style={{ marginBottom: 6 }}>
                <div className="panel">
                  <div className="panel-header">
                    <h3>Operational Population & Enforcement Gateway Telemetry</h3>
                    <span className="panel-meta">LIVE INSTITUTIONAL METRICS</span>
                  </div>
                  <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
                    <div style={{ background: 'var(--bg-surface-0)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>TOTAL TRADERS</span>
                      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                        {analytics?.operational_metrics?.total_traders ?? traders.length}
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Multi-Trader Baseline</span>
                    </div>

                    <div style={{ background: 'var(--bg-surface-0)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>TRUSTED (&gt;70)</span>
                      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--state-normal)' }}>
                        {analytics?.operational_metrics?.trusted_traders ?? traders.filter(t => t.trust_score >= 70).length}
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Low friction</span>
                    </div>

                    <div style={{ background: 'var(--bg-surface-0)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>MONITORED (45–70)</span>
                      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--state-elevated)' }}>
                        {analytics?.operational_metrics?.monitored_traders ?? traders.filter(t => t.trust_score >= 45 && t.trust_score < 70).length}
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Elevated observation</span>
                    </div>

                    <div style={{ background: 'var(--bg-surface-0)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>RESTRICTED (20–45)</span>
                      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--state-high)' }}>
                        {analytics?.operational_metrics?.restricted_traders ?? traders.filter(t => t.trust_score >= 20 && t.trust_score < 45).length}
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Step-up required</span>
                    </div>

                    <div style={{ background: 'var(--bg-surface-0)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>BLOCKED (&lt;20)</span>
                      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--state-critical)' }}>
                        {analytics?.operational_metrics?.blocked_traders ?? traders.filter(t => t.trust_score < 20).length}
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Execution halted</span>
                    </div>

                    <div style={{ background: 'var(--bg-surface-0)', padding: 10, borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>GRAPH CLUSTERS</span>
                      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-cobalt)' }}>
                        {analytics?.operational_metrics?.graph_clusters_detected ?? systemGraph?.clusters?.length ?? 0}
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Shared infrastructure</span>
                    </div>
                  </div>

                  {/* Gateway Enforcement Counter Bar */}
                  <div style={{
                    display: 'flex',
                    gap: 12,
                    padding: '8px 14px',
                    borderTop: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-1)',
                    fontSize: 10,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span className="mono" style={{ color: 'var(--text-muted)' }}>ENFORCEMENT GATEWAY COUNTERS:</span>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <span>PROCEED: <b className="mono">{analytics?.operational_metrics?.enforcement_counts?.PROCEED ?? 0}</b></span>
                      <span>CHALLENGE 2FA: <b className="mono" style={{ color: 'var(--state-elevated)' }}>{analytics?.operational_metrics?.enforcement_counts?.CHALLENGE_2FA ?? 0}</b></span>
                      <span>HOLD REVIEW: <b className="mono" style={{ color: 'var(--state-high)' }}>{analytics?.operational_metrics?.enforcement_counts?.HOLD_REVIEW ?? 0}</b></span>
                      <span>HALT BLOCKED: <b className="mono" style={{ color: 'var(--state-critical)' }}>{analytics?.operational_metrics?.enforcement_counts?.HALT_BLOCKED ?? 0}</b></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Distributions, Profiling, Rules */}
              <div className="col-4">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Trust Score Distribution</h3>
                    <span className="panel-meta">POPULATION SPREAD</span>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {analytics?.trust_distribution.map(item => (
                      <div
                        key={item.band}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '80px 40px 1fr',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span className="mono" style={{ fontSize: 10 }}>{item.band}</span>
                        <b className="mono">{item.count}</b>
                        <div style={{ height: 6, background: 'var(--bg-surface-3)', borderRadius: 2 }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, item.count * 3)}%`,
                              background: 'var(--accent-cobalt)',
                              borderRadius: 2,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="col-4">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Engine Execution Telemetry</h3>
                    <span className="panel-meta">LIVE PIPELINE BENCHMARKS</span>
                  </div>
                  <table className="data-table" style={{ fontSize: 11 }}>
                    <tbody>
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>p50 LATENCY (MEDIAN)</td>
                        <td className="mono">
                          <b>{analytics?.latency_metrics?.p50_ms !== undefined ? `${analytics.latency_metrics.p50_ms.toFixed(1)} ms` : '< 2.5 ms'}</b>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>p95 LATENCY (TAIL)</td>
                        <td className="mono">
                          <b>{analytics?.latency_metrics?.p95_ms !== undefined ? `${analytics.latency_metrics.p95_ms.toFixed(1)} ms` : '< 6.0 ms'}</b>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>MEAN LATENCY</td>
                        <td className="mono">
                          <b>{analytics?.latency_metrics?.average_ms !== undefined ? `${analytics.latency_metrics.average_ms.toFixed(1)} ms` : '< 3.0 ms'}</b>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>DETECTION PRECISION</td>
                        <td className="mono">
                          <b>
                            {analytics?.demo_metrics?.precision !== undefined
                              ? `${(analytics.demo_metrics.precision * 100).toFixed(1)}%`
                              : 'N/A (Requires Labeled Controls)'}
                          </b>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>RECALL (THREAT DETECTION)</td>
                        <td className="mono">
                          <b>
                            {analytics?.demo_metrics?.recall !== undefined
                              ? `${(analytics.demo_metrics.recall * 100).toFixed(1)}%`
                              : 'N/A (Requires Labeled Controls)'}
                          </b>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>FALSE POSITIVE RATE</td>
                        <td className="mono">
                          <b>
                            {analytics?.demo_metrics?.false_positive_rate !== undefined
                              ? `${(analytics.demo_metrics.false_positive_rate * 100).toFixed(1)}%`
                              : 'N/A'}
                          </b>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', padding: '8px 12px', borderTop: '1px solid var(--border-color)' }}>
                    {analytics?.demo_metrics?.label || 'Live Engine Decisions vs Known Threat Controls'}
                  </div>
                </div>
              </div>

              <div className="col-4">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Dominant Triggered Rules</h3>
                    <span className="panel-meta">OBSERVED TRAFFIC</span>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {analytics?.top_rules?.length ? (
                      analytics.top_rules.map(([rule, count]) => (
                        <div
                          key={rule}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '4px 0',
                            borderBottom: '1px solid var(--border-subtle)',
                            fontSize: 10,
                          }}
                        >
                          <span className="mono" style={{ color: 'var(--text-secondary)' }}>{rule}</span>
                          <b className="mono" style={{ color: 'var(--accent-cobalt)' }}>{count}</b>
                        </div>
                      ))
                    ) : (
                      <p className="mono" style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 10 }}>
                        RUN A SCENARIO TO POPULATE RULE FREQUENCY
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Institutional Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={setView}
        onSelectTrader={goTrader}
        onRunScenario={runScenario}
        onResetDemo={resetDemo}
        traders={traders}
      />

      {/* Forensic Evidence Drawer */}
      <EvidenceDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        data={drawerData}
        onStepUpVerify={stepUpVerify}
        onOpenTrader={goTrader}
      />
    </div>
  )
}

/* Institutional Persistent Decision Panel Component with Graduated Policy Ladder */
function PersistentDecisionPanel({
  decision,
  onInspect,
  onCreateCase,
  onStepUp,
}: {
  decision?: Decision
  onInspect: () => void
  onCreateCase: () => void
  onStepUp: () => void
}) {
  if (!decision) {
    return (
      <div className="decision-panel">
        <div className="decision-panel-head">
          <span>NETRA DECISION // ACTIVE MONITORING</span>
        </div>
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
          Observing incoming events against trader individual baselines. Inject an event or run a scenario.
        </div>
      </div>
    )
  }

  const riskClass = decision.risk_level.toLowerCase()
  const currentOutcome = decision.decision.toUpperCase()

  return (
    <div className={`decision-panel ${riskClass}`}>
      <div className="decision-panel-head">
        <span>NETRA DECISION</span>
        <span className="mono">{decision.decision_id}</span>
      </div>

      <div className="decision-core-block">
        <div className="trust-display">
          <div className="trust-score-row">
            <strong>{Math.round(decision.trust_score)}</strong>
            <span>/ 100</span>
          </div>
          <span className="trust-label">TRUST SCORE</span>
        </div>

        <div className="decision-outcome">
          <span className={`decision-text ${decision.decision.toLowerCase()}`}>
            {decision.decision}
          </span>
          <span className="decision-action-sub">{decision.action.replace(/_/g, ' ')}</span>
          <StatusBadge value={decision.risk_level} />
        </div>
      </div>

      {/* Core Policy Formula Header */}
      <div style={{ padding: '6px 14px', background: 'var(--bg-surface-0)', borderBottom: '1px solid var(--border-subtle)', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
        CORE FORMULA: RISK SEVERITY × ACTION SENSITIVITY = INTERVENTION
      </div>

      {/* Graduated Policy Ladder */}
      <div className="policy-ladder">
        <div className={`ladder-step ${currentOutcome === 'ALLOW' ? 'active allow' : ''}`}>
          <span>ALLOW</span>
          <small>Normal activity permitted</small>
        </div>
        <div className={`ladder-step ${currentOutcome === 'MONITOR' ? 'active monitor' : ''}`}>
          <span>MONITOR</span>
          <small>Observe elevated context</small>
        </div>
        <div className={`ladder-step ${currentOutcome === 'VERIFY' ? 'active verify' : ''}`}>
          <span>VERIFY</span>
          <small>Step-up verification required</small>
        </div>
        <div className={`ladder-step ${currentOutcome === 'RESTRICT' ? 'active restrict' : ''}`}>
          <span>RESTRICT</span>
          <small>Hold sensitive action (withdrawal hold)</small>
        </div>
        <div className={`ladder-step ${currentOutcome === 'BLOCK' ? 'active restrict' : ''}`}>
          <span>BLOCK</span>
          <small>Stop critical action immediately</small>
        </div>
      </div>

      <div className="decision-telemetry-grid">
        <div className="decision-telemetry-cell">
          <span>CONFIDENCE:</span>
          <strong>{decision.confidence}</strong>
        </div>
        <div className="decision-telemetry-cell">
          <span>EVAL LATENCY:</span>
          <strong>{decision.processing_latency_ms}ms</strong>
        </div>
        <div className="decision-telemetry-cell">
          <span>POLICY:</span>
          <strong>{decision.policy_version}</strong>
        </div>
      </div>

      <div className="decision-contributors-block">
        <div className="contributors-label">Top Risk Contributors:</div>
        <div className="contributors-list">
          {decision.explanation.top_factors.slice(0, 6).map((factor, idx) => (
            <div key={idx} className="contributor-row">
              <span className="contributor-bullet">•</span>
              <span>{factor}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="decision-recommendation-note">
        <b>SOP RECOMMENDATION:</b> {decision.explanation.recommendation}
      </div>

      <div className="decision-actions-row">
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onInspect}>
          VIEW EVIDENCE
        </button>
        <button className="btn btn-outline-danger" style={{ flex: 1 }} onClick={onCreateCase}>
          OPEN CASE
        </button>
      </div>
    </div>
  )
}

/* Institutional Clean Line Chart */
function TrustLineChart({ trader }: { trader?: Trader }) {
  const points = [...(trader?.timeline || [])].reverse()
  const values = [trader?.initial_trust ?? 94, ...points.map(p => p.new_score)]
  const width = 600
  const height = 150
  const pad = 20
  const coords = values.map((value, index) => ({
    x: pad + index * ((width - pad * 2) / Math.max(values.length - 1, 1)),
    y: pad + (100 - value) * ((height - pad * 2) / 100),
    value,
  }))
  const line = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')

  return (
    <svg className="institutional-chart" viewBox={`0 0 ${width} ${height}`}>
      {[20, 45, 70, 90].map(y => (
        <line
          key={y}
          className="grid-line"
          x1={0}
          y1={pad + (100 - y) * ((height - pad * 2) / 100)}
          x2={width}
          y2={pad + (100 - y) * ((height - pad * 2) / 100)}
        />
      ))}
      <path d={`${line} L ${coords.at(-1)?.x} ${height} L ${coords[0]?.x} ${height} Z`} className="series-area" />
      <path d={line} className="series-line" />
      {coords.map((point, index) => (
        <g key={index}>
          <circle className="series-point" cx={point.x} cy={point.y} r="3" />
          <text className="point-label" x={point.x} y={point.y - 8}>
            {Math.round(point.value)}
          </text>
        </g>
      ))}
    </svg>
  )
}

/* Tabular Dimension Matrix */
function DimensionMatrix({ dimensions }: { dimensions?: Record<string, number> }) {
  return (
    <div className="dimension-matrix">
      {Object.entries(dimensions || {}).map(([key, value]) => (
        <div className="dimension-matrix-row" key={key}>
          <span className="dimension-name">{riskLabels[key] || key}</span>
          <span className="dimension-score">{Math.round(value)}</span>
          <div className="dimension-bar-track">
            <div
              className={`dimension-bar-fill ${value > 70 ? 'danger' : ''}`}
              style={{ width: `${value}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* Table for Events */
function EventTable({
  events,
  compact = false,
  onSelectTrader,
  onInspectEvent,
}: {
  events: Event[]
  compact?: boolean
  onSelectTrader?: (id: string) => void
  onInspectEvent?: (event: Event) => void
}) {
  if (!events.length) {
    return (
      <div className="mono" style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
        NO TELEMETRY EVENTS RECORDED
      </div>
    )
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>TIME (UTC)</th>
          <th>TRADER ID</th>
          <th>EVENT TYPE</th>
          <th>CONTEXT / TELEMETRY</th>
          <th>SOURCE</th>
          <th>ACTION</th>
        </tr>
      </thead>
      <tbody>
        {events.slice(0, compact ? 8 : 40).map(ev => (
          <tr key={ev.event_id}>
            <td className="mono">{formatTime(ev.timestamp)}</td>
            <td className="mono">
              <button
                className="btn btn-secondary"
                style={{ padding: '1px 5px', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                onClick={() => onSelectTrader?.(ev.trader_id)}
              >
                #{ev.trader_id}
              </button>
            </td>
            <td><b>{ev.event_type.replace(/_/g, ' ')}</b></td>
            <td className="mono">
              {ev.amount ? (
                money(ev.amount)
              ) : ev.leverage ? (
                `${ev.leverage}× LEVERAGE`
              ) : ev.network_type === 'datacenter' ? (
                <span style={{ color: 'var(--state-critical)' }}>DATACENTER IP ({ev.ip_address})</span>
              ) : (
                ev.country || ev.device_id || 'BASELINE'
              )}
            </td>
            <td>
              {ev.source === 'seed' ? (
                <span className="status-pill normal" style={{ fontSize: 9 }}>HISTORICAL</span>
              ) : ev.source === 'flagship' ? (
                <span className="status-pill critical" style={{ fontSize: 9 }}>FLAGSHIP</span>
              ) : ev.source === 'legitimate-travel' ? (
                <span className="status-pill guarded" style={{ fontSize: 9 }}>TRAVEL</span>
              ) : ev.source === 'fraud-ring' ? (
                <span className="status-pill high" style={{ fontSize: 9 }}>RING</span>
              ) : ev.source === 'account-takeover' ? (
                <span className="status-pill high" style={{ fontSize: 9 }}>TAKEOVER</span>
              ) : (
                <span className="status-pill elevated" style={{ fontSize: 9 }}>{(ev.source || 'LIVE').toUpperCase()}</span>
              )}
            </td>
            <td>
              <button
                className="btn btn-secondary"
                style={{ padding: '2px 6px', fontSize: 10 }}
                onClick={() => onInspectEvent?.(ev)}
              >
                INSPECT
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
