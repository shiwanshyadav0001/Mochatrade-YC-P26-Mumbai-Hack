import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, setActorRole } from './api'
import { soundManager } from './audio'
import { CommandPalette } from './components/CommandPalette'
import { CryptographicAuditVault } from './components/CryptographicAuditVault'
import { ErrorBoundary } from './components/ErrorBoundary'
import { EvidenceDrawer } from './components/EvidenceDrawer'
import { ForensicCaseWorkbench } from './components/ForensicCaseWorkbench'
import { InteractiveGraph } from './components/InteractiveGraph'
import { LiveTelemetryMonitor } from './components/LiveTelemetryMonitor'
import { PolicyMatrixSimulator } from './components/PolicyMatrixSimulator'
import { ReasoningEvidenceChain } from './components/ReasoningEvidenceChain'
import { ScenarioAttackReplay } from './components/ScenarioAttackReplay'
import { TrustTrajectoryHero } from './components/TrustTrajectoryHero'
import { ObservatoryWatchlist } from './components/ObservatoryWatchlist'
import { SecurityProtocolCenter } from './components/SecurityProtocolCenter'
import { ClientActivityPresentation } from './components/ClientActivityPresentation'
import { StepUpVerificationModal } from './components/StepUpVerificationModal'
import { AccountRecoveryModal } from './components/AccountRecoveryModal'
import type { ActionEvaluationResult, Analytics, AuditRecord, AuditVerifyResult, Case, Decision, Event, Graph, GraphCluster, ObservatoryRecord, Policy, RecoveryRequestResponse, RiskEventItem, SecurityProtocol, StreamStatus, Trader, UserRole } from './types'

type View =
  | 'OVERVIEW'
  | 'LIVE MONITOR'
  | 'OBSERVATORY'
  | 'TRADERS'
  | 'RISK EVENTS'
  | 'RELATIONSHIP GRAPH'
  | 'PROTOCOLS'
  | 'CASES'
  | 'POLICIES'
  | 'SIMULATOR'
  | 'AUDIT'
  | 'ANALYTICS'

const navItems: { id: View; code: string; label: string }[] = [
  { id: 'OVERVIEW', code: '01', label: 'Overview' },
  { id: 'LIVE MONITOR', code: '02', label: 'Live Monitor' },
  { id: 'OBSERVATORY', code: '03', label: 'Observatory' },
  { id: 'TRADERS', code: '04', label: 'Traders' },
  { id: 'RISK EVENTS', code: '05', label: 'Risk Events' },
  { id: 'RELATIONSHIP GRAPH', code: '06', label: 'Topology Graph' },
  { id: 'PROTOCOLS', code: '07', label: 'Protocols' },
  { id: 'CASES', code: '08', label: 'Cases & Triage' },
  { id: 'POLICIES', code: '09', label: 'Policy Matrix' },
  { id: 'SIMULATOR', code: '10', label: 'Scenario Lab' },
  { id: 'AUDIT', code: '11', label: 'Audit Vault' },
  { id: 'ANALYTICS', code: '12', label: 'Analytics' },
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

function StatusBadge({ value }: { value?: string }) {
  const str = value || 'UNKNOWN'
  const norm = str.toLowerCase().replace(/_/g, '-')
  return <span className={`status-pill ${norm}`}>{str.replace(/_/g, ' ')}</span>
}

export default function App() {
  const [view, setView] = useState<View>('OVERVIEW')
  const [userRole, setUserRole] = useState<UserRole>('ADMIN')
  const [soundMuted, setSoundMuted] = useState(soundManager.isMuted())
  const [traders, setTraders] = useState<Trader[]>([])
  const [selectedId, setSelectedId] = useState('7842')
  const selectedIdRef = useRef(selectedId)
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])
  // Slice 1: Live Monitor Real-Time Telemetry & Dynamic Focus State
  const [autoFocus, setAutoFocus] = useState<boolean>(true)
  const autoFocusRef = useRef(autoFocus)
  useEffect(() => {
    autoFocusRef.current = autoFocus
  }, [autoFocus])
  const [recentEventIds, setRecentEventIds] = useState<string[]>([])
  const [lastEventTime, setLastEventTime] = useState<string | null>(null)
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
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('CONNECTING')
  const [notice, setNotice] = useState('')
  const [running, setRunning] = useState<string | null>(null)
  const [nodeInfo, setNodeInfo] = useState('')
  const [cmdOpen, setCmdOpen] = useState(false)

  // Observatory & Security Protocols State
  const [observatory, setObservatory] = useState<ObservatoryRecord[]>([])
  const [protocols, setProtocols] = useState<SecurityProtocol[]>([])
  const [stepUpModalOpen, setStepUpModalOpen] = useState(false)
  const [stepUpTraderId, setStepUpTraderId] = useState('7842')
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false)
  const [recoveryTraderId, setRecoveryTraderId] = useState('7842')

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
  const [traderSortField, setTraderSortField] = useState<'trust_score' | 'name' | 'trader_id' | 'anomaly_score' | 'open_case_count' | 'last_activity'>('trust_score')
  const [traderSortDir, setTraderSortDir] = useState<'asc' | 'desc'>('asc')

  const [eventSearch, setEventSearch] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL')
  const [riskSeverityFilter, setRiskSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'GUARDED'>('ALL')
  const [lastInjectionResult, setLastInjectionResult] = useState<{
    trader_id: string
    event_type: string
    event_id?: string
    decision: string
    trust_score: number
    delta?: number
    risk_level?: string
    rule_triggered?: string
    reasons?: string[]
    signals?: any[]
  } | null>(null)

  const [caseNoteInputs, setCaseNoteInputs] = useState<Record<string, string>>({})
  const [auditFilterSubject, setAuditFilterSubject] = useState<string>('')
  const [auditFocusId, setAuditFocusId] = useState<string>('')
  const [targetEventId, setTargetEventId] = useState<string | null>(null)

  const handleNavigateToAudit = useCallback((auditId?: string, subject?: string) => {
    if (auditId) setAuditFocusId(auditId)
    if (subject) setAuditFilterSubject(subject)
    setView('AUDIT')
  }, [])

  const handleNavigateToEvent = useCallback((eventId: string, traderId: string) => {
    if (traderId) {
      setSelectedId(traderId)
      selectedIdRef.current = traderId
    }
    if (eventId) {
      setTargetEventId(eventId)
    }
    setView('LIVE MONITOR')
  }, [])

  const refreshSelected = useCallback(async (id?: string) => {
    const targetId = id || selectedIdRef.current
    try {
      const [trader, nextGraph] = await Promise.all([
        api.get<Trader>(`/traders/${targetId}`),
        api.get<Graph>(`/traders/${targetId}/graph`),
      ])
      setSelected(trader)
      setGraph(nextGraph)
    } catch {
      // Ignore
    }
  }, [])

  const refreshAll = useCallback(async () => {
    try {
      const [nextTraders, nextAnalytics, nextCases, nextAudit, nextPolicy, nextDecisions, nextEvents, nextRiskEvents, nextSysGraph, nextObs, nextProtos] = await Promise.all([
        api.get<Trader[]>('/traders'),
        api.get<Analytics>('/analytics'),
        api.get<Case[]>('/cases'),
        api.get<any[]>('/audit'),
        api.get<Policy>('/policies'),
        api.get<Decision[]>('/decisions'),
        api.get<Event[]>('/events'),
        api.get<RiskEventItem[]>('/risk-events'),
        api.get<Graph>('/graph/system'),
        api.get<ObservatoryRecord[]>('/observatory').catch(() => []),
        api.get<SecurityProtocol[]>('/protocols').catch(() => []),
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
      setObservatory(nextObs)
      setProtocols(nextProtos)
      await refreshSelected(selectedIdRef.current)
    } catch (error: any) {
      const detail = error?.detail || error?.message || 'Connection error'
      if (error?.isAuthError) {
        setNotice(`AUTHENTICATION REQUIRED // Session expired. Re-authenticating role...`)
      } else if (error?.isForbidden) {
        setNotice(`AUTHORIZATION NOTICE // ${detail}`)
      } else {
        setNotice(`REST TELEMETRY SYNCHRONIZATION // ${detail}`)
      }
      console.warn('API sync status:', detail)
    }
  }, [refreshSelected])

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedRefreshAll = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }
    refreshTimeoutRef.current = setTimeout(() => {
      refreshAll()
    }, 450)
  }, [refreshAll])

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

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
    const savedRole = (sessionStorage.getItem('netra_actor_role') as UserRole) || 'ADMIN'
    setUserRole(savedRole)
    setActorRole(savedRole)
      .then(() => refreshAll())
      .catch((error: any) => {
        const msg = error?.detail || error?.message || 'Configure NETRA credentials'
        setNotice(`Session authentication: ${msg}`)
        console.error('Session auth error:', error)
      })
  }, [])

  useEffect(() => {
    refreshSelected(selectedId)
  }, [selectedId, refreshSelected])

  const streamRef = useRef<EventSource | null>(null)

  const connectStream = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.close()
      } catch {}
    }
    setStreamStatus('CONNECTING')
    const stream = new EventSource('/api/stream')
    streamRef.current = stream

    stream.onopen = () => {
      setConnected(true)
      setStreamStatus('CONNECTED')
      setNotice('REAL-TIME SSE TELEMETRY STREAM ESTABLISHED.')
    }

    stream.addEventListener('connected', () => {
      setConnected(true)
      setStreamStatus('CONNECTED')
    })

    stream.onerror = () => {
      if (stream.readyState === EventSource.CONNECTING) {
        setStreamStatus('RECONNECTING')
        setConnected(false)
      } else if (stream.readyState === EventSource.CLOSED) {
        setStreamStatus('DISCONNECTED')
        setConnected(false)
      } else {
        setStreamStatus('ERROR')
        setConnected(false)
      }
    }

    stream.onmessage = message => {
      try {
        setConnected(true)
        setStreamStatus('CONNECTED')
        const payload = JSON.parse(message.data)
        if (payload.type === 'NEW_EVENT' || payload.type === 'RISK_UPDATED') {
          soundManager.playEventTick()
          const result = payload.data
          if (result?.event) {
            setEvents(current => [result.event, ...current.filter(e => e.event_id !== result.event.event_id)].slice(0, 80))
            setLastEventTime(result.event.timestamp || new Date().toISOString())
            if (result.event.event_id) {
              setRecentEventIds(prev => [result.event.event_id, ...prev.slice(0, 8)])
              setTimeout(() => {
                setRecentEventIds(prev => prev.filter(id => id !== result.event.event_id))
              }, 4000)
            }
          }
          if (result?.decision) {
            if (result.decision.trust_score < 45) {
              soundManager.playThreatAlert()
            }
            setDecisions(current => [result.decision, ...current.filter(d => d.decision_id !== result.decision.decision_id)].slice(0, 50))
          }
          // Synchronously propagate audit record to audit vault
          if (result?.audit_record) {
            setAudit(current => [result.audit_record, ...current.filter(a => a.audit_id !== result.audit_record.audit_id)].slice(0, 100))
          }
          // Synchronously propagate case to cases & triage
          if (result?.case) {
            setCases(current => [result.case, ...current.filter(c => c.case_id !== result.case.case_id)])
          }
          // Synchronously propagate contextual risk events
          if (result?.risk_events && Array.isArray(result.risk_events) && result.risk_events.length > 0) {
            setRiskEvents(current => [
              ...result.risk_events,
              ...current.filter(r => !result.risk_events.some((nr: any) => nr.risk_id === r.risk_id)),
            ].slice(0, 100))
          }
          // Synchronously propagate updated trader to traders list
          if (result?.trader) {
            setTraders(current => current.map(t => t.trader_id === result.trader.trader_id ? result.trader : t))
          }
          // Synchronously propagate topology graph if related to selected or auto-focused trader
          const eventTraderId = result?.event?.trader_id
          if (result?.graph && (eventTraderId === selectedIdRef.current || autoFocusRef.current)) {
            setGraph(result.graph)
          }
          // Dynamic Auto Focus: automatically surface the active trader receiving telemetry
          if (autoFocusRef.current && eventTraderId) {
            setSelectedId(eventTraderId)
            if (result?.trader) {
              setSelected(result.trader)
            } else {
              refreshSelected(eventTraderId)
            }
          } else if (eventTraderId === selectedIdRef.current) {
            if (result?.trader) {
              setSelected(result.trader)
            } else {
              refreshSelected(selectedIdRef.current)
            }
          }
          debouncedRefreshAll()
        } else if (payload.type === 'GRAPH_UPDATED') {
          if (payload.data) {
            setGraph(payload.data)
          }
          debouncedRefreshAll()
        } else if (payload.type === 'CASE_CREATED' || payload.type === 'CASE_UPDATED') {
          if (payload.data) {
            setCases(current => [payload.data, ...current.filter(c => c.case_id !== payload.data.case_id)])
          }
          debouncedRefreshAll()
        } else if (
          payload.type === 'TRADER_UPDATED' ||
          payload.type === 'POLICY_UPDATED'
        ) {
          debouncedRefreshAll()
          refreshSelected(selectedIdRef.current)
        } else if (payload.type === 'DEMO_RESET') {
          refreshAll()
          soundManager.playSuccess()
        }
      } catch (err) {
        console.error('SSE parse error:', err)
      }
    }
  }, [refreshAll, refreshSelected, debouncedRefreshAll])

  useEffect(() => {
    connectStream()
    return () => {
      if (streamRef.current) {
        try {
          streamRef.current.close()
        } catch {}
      }
    }
  }, [connectStream])

  const handleRoleChange = async (newRole: UserRole) => {
    try {
      await setActorRole(newRole)
      setUserRole(newRole)
      setNotice(`AUTHENTICATED ACTOR ROLE: ${newRole}`)
    } catch (authError: any) {
      const msg = authError?.detail || authError?.message || 'Authentication error'
      setNotice(`Role transition to ${newRole} failed: ${msg}`)
      console.error('Role auth error:', authError)
      return
    }

    try {
      await refreshAll()
    } catch (refreshErr: any) {
      console.warn(`Data refresh after switching to ${newRole}:`, refreshErr)
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
    const matchedDecision = decisions.find(d => (event.event_id && d.event_id === event.event_id) || d.timestamp === event.timestamp || d.trader_id === event.trader_id)
    const matchedTrader = traders.find(t => t.trader_id === event.trader_id)
    setDrawerData({ event, decision: matchedDecision, trader: matchedTrader })
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
      setEvents(current => current.filter(e => e.trader_id !== targetTrader || (e.source && e.source.startsWith('seed'))))
      setView('LIVE MONITOR')
      setNotice(`EXECUTING SCENARIO: ${scenario} FOR TRADER #${targetTrader}`)
    } catch (err: any) {
      setNotice(err.message || 'Scenario run rejected.')
    } finally {
      setTimeout(() => setRunning(null), 3000)
    }
  }

  const stepScenario = async (scenario: string) => {
    try {
      soundManager.playEventTick()
      const res = await api.send<any>('POST', '/simulator/step', { scenario })
      if (res.event?.trader_id) {
        setSelectedId(res.event.trader_id)
      }
      setNotice(`STEPPED EVENT IN SCENARIO ${scenario}: ${res.event?.event_type || 'Event processed'} (${res.remaining ?? 0} remaining)`)
      await refreshAll()
    } catch (err: any) {
      setNotice(err.message || 'Step execution rejected.')
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

  const handleOpenStepUpModal = (traderId: string) => {
    setStepUpTraderId(traderId)
    setStepUpModalOpen(true)
  }

  const handleOpenRecoveryModal = (traderId: string) => {
    setRecoveryTraderId(traderId)
    setRecoveryModalOpen(true)
  }

  const handleStepUpVerify = async (
    traderId: string,
    verificationType: string = 'PASSKEY',
    status: 'SUCCESS' | 'FAILED' | 'UNAVAILABLE' | 'TIMEOUT' = 'SUCCESS',
  ) => {
    soundManager.playEventTick()
    try {
      const res = await api.send<any>('POST', '/verify/step-up', {
        trader_id: traderId,
        verification_type: verificationType,
        status: status,
      })
      if (status === 'SUCCESS') {
        soundManager.playSuccess()
        setNotice(`IDENTITY VERIFIED: #${traderId} via ${verificationType}. Trust re-evaluated to ${res.new_trust}/100.`)
      } else {
        soundManager.playThreatAlert()
        setNotice(`STEP-UP CHALLENGE [${status}]: #${traderId}. Session set to ${res.session_risk_state}.`)
      }
      await refreshAll()
    } catch (err: any) {
      setNotice(err.message || 'Verification challenge rejected.')
      throw err
    }
  }

  const stepUpVerify = async (traderId: string) => {
    handleOpenStepUpModal(traderId)
  }

  const handleRequestRecovery = async (traderId: string, channel: string): Promise<RecoveryRequestResponse> => {
    soundManager.playEventTick()
    try {
      const res = await api.send<RecoveryRequestResponse>('POST', '/recovery/request', {
        trader_id: traderId,
        channel: channel,
      })
      setNotice(`RECOVERY CHALLENGE DISPATCHED: #${traderId} via ${channel} (${res.masked_contact}).`)
      await refreshAll()
      return res
    } catch (err: any) {
      setNotice(err.message || 'Recovery request rejected.')
      throw err
    }
  }

  const handleVerifyRecovery = async (traderId: string, code: string): Promise<void> => {
    soundManager.playEventTick()
    try {
      const res = await api.send<any>('POST', '/recovery/verify', {
        trader_id: traderId,
        recovery_code: code,
      })
      if (res.verified) {
        soundManager.playSuccess()
        setNotice(`ACCOUNT RECOVERED: #${traderId}. Evidentiary trust restored to ${res.new_trust}/100.`)
      } else {
        soundManager.playThreatAlert()
        setNotice(`RECOVERY FAILED: #${traderId}. Invalid proof code.`)
      }
      await refreshAll()
    } catch (err: any) {
      setNotice(err.message || 'Recovery verification rejected.')
      throw err
    }
  }

  const handleTriggerProtocol = async (protocolId: string, traderId: string) => {
    soundManager.playEventTick()
    try {
      const res = await api.send<any>('POST', `/protocols/${protocolId}/trigger`, {
        trader_id: traderId,
      })
      soundManager.playSuccess()
      setNotice(`PROTOCOL ${protocolId} DISPATCHED FOR #${traderId} -> ${res.session_risk_state || res.status}`)
      await refreshAll()
    } catch (err: any) {
      setNotice(err.message || 'Protocol dispatch failed.')
    }
  }

  const handleInjectSyntheticEvent = async (eventType: string, amount?: number) => {
    const targetId = selectedId || '7842'
    const payload: any = {
      trader_id: targetId,
      event_type: eventType,
      source: 'client-trading-app',
    }
    if (amount) payload.amount = amount
    if (eventType === 'NEW_DEVICE') payload.device_id = `DEV-CLIENT-${Date.now().toString().slice(-4)}`
    if (eventType === 'IP_CHANGE') {
      payload.ip_address = '198.18.0.42'
      payload.network_type = 'datacenter'
    }
    if (eventType === 'LEVERAGE_CHANGE') payload.leverage = amount || 50
    if (eventType === 'WITHDRAWAL') {
      payload.amount = amount || 25000
      payload.wallet_address = 'WALLET-CLIENT-DEST'
    }

    try {
      soundManager.playEventTick()
      const res = await api.send<any>('POST', '/events', payload)
      soundManager.playSuccess()
      setNotice(`CLIENT TELEMETRY INGESTED: ${eventType} for #${targetId} -> Decision: ${res.decision?.decision || 'PROCESSED'}`)
      await refreshAll()
    } catch (err: any) {
      setNotice(err.message || 'Client event ingestion rejected.')
    }
  }

  const resetBaseline = async (traderId: string) => {
    try {
      soundManager.playEventTick()
      await api.send<any>('POST', `/traders/${traderId}/baseline/reset`)
      soundManager.playSuccess()
      setNotice(`BEHAVIORAL BASELINE RESET FOR TRADER #${traderId}. RE-BOOTSTRAPPING INITIALIZED.`)
      await refreshAll()
    } catch (err: any) {
      setNotice(err.message || 'Baseline reset rejected.')
    }
  }

  const exportAuditCSV = () => {
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
      const res = await api.send<any>('POST', '/events', payload)
      soundManager.playSuccess()
      setNotice(`EVENT ${manualType} INGESTED & EVALUATED FOR #${targetId}`)
      setLastInjectionResult({
        trader_id: targetId,
        event_type: manualType,
        event_id: res?.event_id || res?.event?.event_id,
        decision: res?.decision || res?.decision_impact || 'ALLOW',
        trust_score: res?.trust_score ?? res?.resulting_trust ?? 94,
        delta: res?.delta,
        risk_level: res?.risk_level || 'NORMAL',
        rule_triggered: res?.rule_triggered,
        reasons: res?.reasons || (res?.reason ? [res.reason] : []),
        signals: res?.signals || [],
      })
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

  const handleTraderSort = (field: 'trust_score' | 'name' | 'trader_id' | 'anomaly_score' | 'open_case_count' | 'last_activity') => {
    if (traderSortField === field) {
      setTraderSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setTraderSortField(field)
      setTraderSortDir(field === 'trust_score' ? 'asc' : 'desc')
    }
  }

  const filteredTraders = useMemo(() => {
    const list = traders.filter(t => {
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

    return list.sort((a, b) => {
      let diff = 0
      if (traderSortField === 'trust_score') diff = (a.trust_score ?? 0) - (b.trust_score ?? 0)
      else if (traderSortField === 'name') diff = (a.name || '').localeCompare(b.name || '')
      else if (traderSortField === 'trader_id') diff = Number(a.trader_id || 0) - Number(b.trader_id || 0)
      else if (traderSortField === 'anomaly_score') diff = (a.anomaly_score ?? 0) - (b.anomaly_score ?? 0)
      else if (traderSortField === 'open_case_count') diff = (a.open_case_count ?? 0) - (b.open_case_count ?? 0)
      else if (traderSortField === 'last_activity') {
        const timeA = a.last_activity ? new Date(a.last_activity).getTime() : 0
        const timeB = b.last_activity ? new Date(b.last_activity).getTime() : 0
        diff = timeA - timeB
      }
      return traderSortDir === 'asc' ? diff : -diff
    })
  }, [traders, traderSearch, traderSegment, traderRiskFilter, traderSortField, traderSortDir])

  const filteredRiskEvents = useMemo(() => {
    return riskEvents.filter(re => {
      const q = eventSearch.trim().toLowerCase()
      const matchSearch =
        !q ||
        re.trader_id.toLowerCase().includes(q) ||
        re.event_type.toLowerCase().includes(q) ||
        (re.reason && re.reason.toLowerCase().includes(q)) ||
        (re.category && re.category.toLowerCase().includes(q)) ||
        (re.feature && re.feature.toLowerCase().includes(q)) ||
        (re.signals && re.signals.some(s => s.reason?.toLowerCase().includes(q) || s.feature?.toLowerCase().includes(q)))
      const matchType = eventTypeFilter === 'ALL' || re.event_type === eventTypeFilter

      let matchSeverity = true
      const sev = re.severity ?? re.contextual_risk ?? 0
      if (riskSeverityFilter === 'CRITICAL') matchSeverity = sev >= 70
      else if (riskSeverityFilter === 'HIGH') matchSeverity = sev >= 40 && sev < 70
      else if (riskSeverityFilter === 'GUARDED') matchSeverity = sev < 40

      return matchSearch && matchType && matchSeverity
    })
  }, [riskEvents, eventSearch, eventTypeFilter, riskSeverityFilter])

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
  const dynamicFocusTraders = useMemo(() => {
    const primary = traders.find(t => t.trader_id === '7842')
    const degraded = traders
      .filter(t => t.trader_id !== '7842' && t.trust_score < 70)
      .sort((a, b) => a.trust_score - b.trust_score)
    const others = traders
      .filter(t => t.trader_id !== '7842' && t.trust_score >= 70)
    const list: Trader[] = []
    if (primary) list.push(primary)
    list.push(...degraded)
    return list.concat(others).slice(0, 6)
  }, [traders])
  const latestDecision = useMemo(() => {
    return decisions.find(d => d.trader_id === selectedId) || (selected ? undefined : decisions[0])
  }, [decisions, selectedId, selected])

  const populationStats = useMemo(() => {
    const total = traders.length
    const trusted = traders.filter(t => t.trust_score >= 70).length
    const monitored = traders.filter(t => t.trust_score >= 45 && t.trust_score < 70).length
    const critical = traders.filter(t => t.trust_score < 45).length
    const sorted = [...traders].sort((a, b) => a.trust_score - b.trust_score)
    const highestThreat = sorted.find(t => t.trust_score < 70) || null
    return { total, trusted, monitored, critical, highestThreat }
  }, [traders])

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
                CONTINUOUS TRUST INTELLIGENCE
              </div>
            </div>
          </div>
          <span className="brand-env">OS v2.0</span>
        </div>

        <div className="nav-group-label">OPERATOR WORKFLOW</div>
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
              ) : item.id === 'OVERVIEW' && populationStats.critical > 0 ? (
                <span className="nav-count" style={{ background: 'rgba(220, 38, 38, 0.15)', color: 'var(--state-critical)', borderColor: 'var(--state-critical-border)' }}>
                  {populationStats.critical}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status-indicator">
            <span className={`status-dot ${connected ? 'active' : streamStatus === 'CONNECTING' || streamStatus === 'RECONNECTING' ? 'connecting' : 'offline'}`} />
            <span>{connected ? 'ENGINE ONLINE // 100%' : streamStatus === 'RECONNECTING' ? 'RECONNECTING // AUTO' : streamStatus === 'CONNECTING' ? 'CONNECTING...' : 'ENGINE STANDBY'}</span>
          </div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
            NETRA TRUST ENGINE v2.0 // REST+SSE
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

            <div className="telemetry-tag topbar-secondary-tag" title="Central Product Thesis">
              <span>CENTRAL THESIS:</span>
              <strong style={{ color: 'var(--accent-cobalt)' }}>
                &ldquo;Does this action make sense for this trader, right now?&rdquo;
              </strong>
            </div>

            <div className="telemetry-tag" title="Real-time Population Surveillance">
              <span>POPULATION:</span>
              <strong className="mono" style={{ fontSize: 10.5 }}>
                {populationStats.total} TRADERS // <span style={{ color: 'var(--state-normal)' }}>{populationStats.trusted} TRUSTED</span> · <span style={{ color: 'var(--state-elevated)' }}>{populationStats.monitored} MONITORED</span> · <span style={{ color: 'var(--state-critical)' }}>{populationStats.critical} INTERVENED</span>
              </strong>
            </div>

            <div className="telemetry-tag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`status-dot ${connected ? 'active' : streamStatus === 'CONNECTING' || streamStatus === 'RECONNECTING' ? 'connecting' : 'offline'}`} />
              <span>{connected ? 'STREAM: LIVE' : streamStatus === 'RECONNECTING' ? 'STREAM: RECONNECTING' : streamStatus === 'CONNECTING' ? 'STREAM: CONNECTING' : 'STREAM: STANDBY'}</span>
            </div>

            <div className="telemetry-tag">
              <span>EVAL LATENCY:</span>
              <strong>{analytics?.latency_metrics?.average_ms != null ? `${analytics.latency_metrics.average_ms}ms` : '1.2ms'}</strong>
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
          {/* NETRA Continuous Intelligence Pipeline Strip */}
          <div className="pipeline-strip">
            <div className="pipeline-steps">
              <span className="mono" style={{ color: 'var(--text-dim)', marginRight: 4, fontWeight: 700 }}>
                INTELLIGENCE LOOP:
              </span>
              <span className="pipeline-step">01 EVENT</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step">02 CONTEXT</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step">03 SIGNALS</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step">04 BASELINE</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step">05 TOPOLOGY</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step active">06 TRUST IMPACT</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step active">07 POLICY</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step active">08 ACTION</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step">09 AUDIT</span>
            </div>

            <div className="pipeline-actions">
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', alignSelf: 'center', marginRight: 4 }}>
                SCENARIO DISPATCH:
              </span>
              <button
                className="btn btn-primary"
                onClick={() => runScenario('FLAGSHIP', 'NORMAL')}
                title="Execute canonical end-to-end attack: Account takeover, privilege escalation, datacenter withdrawal restriction, case creation and SHA-256 audit commitment"
              >
                RUN ATTACK SCENARIO
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => runScenario('TRAVEL', 'NORMAL')}
                title="Simulate verified cross-border access with baseline conformity"
              >
                LEGITIMATE TRAVEL
              </button>
              <button className="btn btn-secondary" onClick={resetDemo} title="Reset all trader baselines and clear telemetry buffer">
                RESET BASELINE
              </button>
            </div>
          </div>

          <ErrorBoundary fallbackTitle="NETRA OPERATIONS CONSOLE">
          {/* VIEW: OVERVIEW — EXECUTIVE COMMAND CENTER */}
          {view === 'OVERVIEW' && (
            <>
              {/* Executive Operational Command Surface */}
              <div className="overview-command-surface">
                <div className="command-surface-identity">
                  <div className="command-system-kicker mono">CONTINUOUS TRUST INTELLIGENCE // REAL-TIME FLEET SURVEILLANCE</div>
                  <h1 className="command-system-title">NETRA OPERATIONAL COMMAND</h1>
                  <div className="command-system-posture-bar">
                    <span className="command-system-status-indicator">
                      <span className={`status-dot ${connected ? 'active' : streamStatus === 'CONNECTING' || streamStatus === 'RECONNECTING' ? 'connecting' : 'offline'}`} />
                      <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.4px' }}>
                        {connected ? 'SURVEILLANCE ENGINE ACTIVE' : streamStatus === 'RECONNECTING' ? 'STREAM RECONNECTING' : streamStatus === 'CONNECTING' ? 'STREAM INITIALIZING' : 'REST SURVEILLANCE ACTIVE'}
                      </span>
                    </span>
                    <span className="command-posture-badge mono" style={{
                      background: populationStats.critical > 0 ? 'rgba(220, 38, 38, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                      color: populationStats.critical > 0 ? 'var(--state-critical)' : 'var(--state-normal)',
                      borderColor: populationStats.critical > 0 ? 'var(--state-critical-border)' : 'var(--state-normal-border)'
                    }}>
                      FLEET THREAT LEVEL: {populationStats.critical > 0 ? `${populationStats.critical} CRITICAL INTERVENTIONS` : 'NOMINAL // ELEVATED MONITORING'}
                    </span>
                    <span className="command-timestamp mono">
                      LAST TELEMETRY: {formatTime(lastEventTime || events[0]?.timestamp)}
                    </span>
                  </div>
                </div>

                <div className="command-quick-actions">
                  <button className="btn btn-primary" onClick={() => setView('LIVE MONITOR')}>
                    LIVE MONITOR →
                  </button>
                  <button className="btn btn-secondary" onClick={() => setView('CASES')}>
                    TRIAGE CASES ({cases.filter(c => c.status === 'OPEN').length})
                  </button>
                  <button className="btn btn-secondary" onClick={() => setCmdOpen(true)} title="Press Cmd+K / Ctrl+K">
                    QUICK DISPATCH (⌘K)
                  </button>
                </div>
              </div>

              {/* Executive Telemetry Mission Banner */}
              <div className="exec-kpi-banner">
                <div className="exec-kpi-card kpi-accent-blue">
                  <div className="kpi-head">
                    <span className="kpi-label">SURVEILLANCE POPULATION</span>
                    <span className="status-pill normal" style={{ fontSize: 8 }}>CONTINUOUS</span>
                  </div>
                  <div className="kpi-metric-row">
                    <span className="kpi-value">{populationStats.total}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ACTIVE TRADERS</span>
                  </div>
                  <div className="kpi-sub-meta mono">
                    <span style={{ color: 'var(--state-normal)' }}>{populationStats.trusted} TRUSTED</span>
                    <span style={{ color: 'var(--state-elevated)' }}>{populationStats.monitored} MONITORED</span>
                    <span style={{ color: 'var(--state-critical)' }}>{populationStats.critical} CRITICAL</span>
                  </div>
                </div>

                <div className={`exec-kpi-card ${populationStats.critical > 0 ? 'kpi-threat-critical' : populationStats.highestThreat ? 'kpi-accent-amber' : 'kpi-accent-emerald'}`}>
                  <div className="kpi-head">
                    <span className="kpi-label">HIGHEST-PRIORITY THREAT</span>
                    <span className={`status-pill ${populationStats.highestThreat ? 'critical' : 'normal'}`} style={{ fontSize: 8 }}>
                      {populationStats.highestThreat ? 'PRIORITY 01' : 'FLEET SECURE'}
                    </span>
                  </div>
                  <div className="kpi-metric-row">
                    <span className="kpi-value" style={{ color: populationStats.highestThreat ? 'var(--state-critical)' : 'var(--state-normal)' }}>
                      {populationStats.highestThreat ? `#${populationStats.highestThreat.trader_id}` : 'NONE'}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {populationStats.highestThreat ? `${Math.round(populationStats.highestThreat.trust_score)}/100` : 'ALL TRUSTED'}
                    </span>
                  </div>
                  <div className="kpi-sub-meta">
                    <span className="mono" style={{ fontSize: 9, color: populationStats.highestThreat ? 'var(--state-critical)' : 'var(--state-normal)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                      {populationStats.highestThreat ? `${populationStats.highestThreat.last_decision || 'FLAGGED'} // ${populationStats.highestThreat.name}` : 'Zero degraded fleet identities'}
                    </span>
                    {populationStats.highestThreat && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 8.5, padding: '1px 6px' }}
                          onClick={() => setSelectedId(populationStats.highestThreat!.trader_id)}
                        >
                          FOCUS TARGET
                        </button>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 8.5, padding: '1px 6px' }}
                          onClick={() => {
                            setSelectedId(populationStats.highestThreat!.trader_id)
                            setView('LIVE MONITOR')
                          }}
                        >
                          INVESTIGATE →
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="exec-kpi-card kpi-accent-emerald">
                  <div className="kpi-head">
                    <span className="kpi-label">INGESTION & PIPELINE HEALTH</span>
                    <span className="status-pill normal" style={{ fontSize: 8 }}>ONLINE 100%</span>
                  </div>
                  <div className="kpi-metric-row">
                    <span className="kpi-value">{analytics?.latency_metrics?.average_ms != null ? `${analytics.latency_metrics.average_ms}ms` : '1.2ms'}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>AVG LATENCY</span>
                  </div>
                  <div className="kpi-sub-meta mono">
                    <span>EVENTS: {events.length}</span>
                    <span style={{ color: 'var(--state-normal)' }}>SSE STREAM ACTIVE</span>
                  </div>
                </div>

                <div className="exec-kpi-card kpi-accent-amber">
                  <div className="kpi-head">
                    <span className="kpi-label">POLICY ENFORCEMENT STATE</span>
                    <span className="status-pill elevated" style={{ fontSize: 8 }}>STRICT v2.4</span>
                  </div>
                  <div className="kpi-metric-row">
                    <span className="kpi-value">{cases.filter(c => c.status === 'OPEN').length}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>OPEN CASES</span>
                  </div>
                  <div className="kpi-sub-meta mono">
                    <span>5-TIER GRADUATED LADDER</span>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 8.5, padding: '1px 6px' }}
                      onClick={() => setView('CASES')}
                    >
                      TRIAGE →
                    </button>
                  </div>
                </div>
              </div>

              {/* Client Platform Activity Gateway Presentation */}
              <ClientActivityPresentation
                latestEvents={events}
                selectedTrader={selected}
                onInjectSyntheticEvent={handleInjectSyntheticEvent}
              />

              {/* Primary Intelligence Area: Hero Trajectory + Persistent Decision Gateway */}
              <div className="grid-12">
                {/* Left 8 Cols: Continuous Trust Trajectory Hero */}
                <div className="col-8">
                  <TrustTrajectoryHero trader={selected} />
                </div>

                {/* Right 4 Cols: Persistent Decision & Action Gateway */}
                <div className="col-4">
                  <PersistentDecisionPanel
                    decision={latestDecision}
                    trader={selected}
                    onInspect={() => latestDecision && inspectDecision(latestDecision)}
                    onCreateCase={createCase}
                    onStepUp={() => selected && stepUpVerify(selected.trader_id)}
                    onEvaluateAction={evaluateAction}
                    evaluatingAction={evaluatingAction}
                    actionEvalResult={actionEvalResult}
                  />
                </div>
              </div>

              {/* Signature Component: Why NETRA Decided This (7-Stage Causal Reasoning Chain) */}
              <ReasoningEvidenceChain
                trader={selected}
                decision={latestDecision}
                latestEvent={events[0]}
                graph={graph}
                onInspectEvidence={() => latestDecision && inspectDecision(latestDecision)}
                onOpenTopology={() => setView('RELATIONSHIP GRAPH')}
                onNavigateToAudit={handleNavigateToAudit}
                onNavigateToCase={(caseId) => {
                  setView('CASES')
                }}
                onNavigateToEvent={handleNavigateToEvent}
              />

              {/* Operational & Contextual Layer */}
              <div className="grid-12">
                {/* Left 5 Cols: Relationship & Topology Context */}
                <div className="col-5">
                  <div className="panel">
                    <div className="panel-header">
                      <h3>Relationship & Topology Context</h3>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 9, padding: '2px 6px' }}
                        onClick={() => setView('RELATIONSHIP GRAPH')}
                      >
                        EXPLORE FULL GRAPH →
                      </button>
                    </div>
                    <div style={{ padding: '10px 14px' }}>
                      <div className="mono" style={{ fontSize: 11, marginBottom: 8, color: '#fff', fontWeight: 600 }}>
                        TARGET ENTITY: TRADER #{selected?.trader_id ?? selectedId} ({selected?.name ?? 'Target'})
                      </div>
                      <div
                        style={{
                          padding: '8px 10px',
                          background: 'var(--bg-surface-0)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          fontSize: 10,
                          lineHeight: 1.4,
                          marginBottom: 8,
                          color: selected?.relationship_summary && !selected.relationship_summary.toLowerCase().includes('isolated') ? 'var(--state-critical)' : 'var(--text-secondary)',
                        }}
                      >
                        <strong>TOPOLOGY STATUS: </strong>
                        {selected?.relationship_summary || 'Isolated trader node — zero cross-account infrastructure sharing recorded.'}
                      </div>

                      <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 9.5 }}>
                        <div style={{ padding: '6px 8px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                          <span style={{ color: 'var(--text-dim)', display: 'block' }}>KNOWN DEVICES:</span>
                          <strong>{selected?.baseline?.known_devices?.length || 2} registered</strong>
                        </div>
                        <div style={{ padding: '6px 8px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                          <span style={{ color: 'var(--text-dim)', display: 'block' }}>KNOWN WALLETS:</span>
                          <strong>{selected?.baseline?.known_wallets?.length || 1} whitelisted</strong>
                        </div>
                        <div style={{ padding: '6px 8px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                          <span style={{ color: 'var(--text-dim)', display: 'block' }}>NETWORK ASN:</span>
                          <strong>{selected?.baseline?.countries?.join(', ') || '—'}</strong>
                        </div>
                        <div style={{ padding: '6px 8px', background: 'var(--bg-surface-0)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)' }}>
                          <span style={{ color: 'var(--text-dim)', display: 'block' }}>SHARED CLUSTERS:</span>
                          <strong style={{ color: graph?.clusters && graph.clusters.length > 0 ? 'var(--state-critical)' : 'var(--state-normal)' }}>
                            {graph?.clusters?.filter(c => c.affected_traders.includes(selectedId)).length || 0} active
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right 7 Cols: Priority Threat Triage Queue */}
                <div className="col-7">
                  <div className="panel">
                    <div className="panel-header">
                      <h3>Priority Threat Triage Queue</h3>
                      <span className="panel-meta">TRUST &lt; 45 / 100 — REQUIRES INTERVENTION</span>
                    </div>
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>TRADER</th>
                            <th>NAME</th>
                            <th>TRUST</th>
                            <th>STATUS</th>
                            <th>LAST DECISION</th>
                            <th>ACTION</th>
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
                              <td>{t.name}</td>
                              <td className="mono">
                                <b style={{ color: t.trust_score < 20 ? 'var(--state-critical)' : 'var(--state-high)' }}>
                                  {Math.round(t.trust_score)} / 100
                                </b>
                              </td>
                              <td><StatusBadge value={t.status} /></td>
                              <td><span className="mono">{t.last_decision}</span></td>
                              <td>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '1px 6px', fontSize: 9 }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedId(t.trader_id)
                                  }}
                                >
                                  FOCUS
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom: Live Evaluated Event Stream */}
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panel-header">
                  <h3>Live Evaluated Telemetry Stream</h3>
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
            </>
          )}

          {/* VIEW: LIVE MONITOR */}
          {view === 'LIVE MONITOR' && (
            <LiveTelemetryMonitor
              events={events}
              decisions={decisions}
              traders={traders}
              selectedId={selectedId}
              selected={selected}
              latestDecision={latestDecision}
              connected={connected}
              streamStatus={streamStatus}
              analytics={analytics}
              autoFocus={autoFocus}
              recentEventIds={recentEventIds}
              lastEventTime={lastEventTime}
              graph={graph}
              onSelectTrader={id => {
                setSelectedId(id)
                setAutoFocus(false)
              }}
              onToggleAutoFocus={setAutoFocus}
              onInspectEvent={inspectEvent}
              onInspectDecision={inspectDecision}
              onInspectTrader={inspectTrader}
              onCreateCase={createCase}
              onStepUp={stepUpVerify}
              onNavigateView={setView}
              onReconnectStream={connectStream}
              onExportCSV={exportEventsCSV}
              onEvaluateAction={evaluateAction}
              evaluatingAction={evaluatingAction}
              actionEvalResult={actionEvalResult}
              onNavigateToAudit={handleNavigateToAudit}
              targetEventId={targetEventId}
            />
          )}

          {/* VIEW: OBSERVATORY */}
          {view === 'OBSERVATORY' && (
            <ObservatoryWatchlist
              records={observatory}
              protocols={protocols}
              selectedId={selectedId}
              onSelectTrader={id => {
                setSelectedId(id)
                refreshSelected(id)
              }}
              onOpenStepUpModal={handleOpenStepUpModal}
              onOpenRecoveryModal={handleOpenRecoveryModal}
              onTriggerProtocol={handleTriggerProtocol}
              onNavigateToView={(v, id) => {
                if (id) {
                  setSelectedId(id)
                  refreshSelected(id)
                }
                setView(v)
              }}
            />
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
                          <th style={{ cursor: 'pointer' }} onClick={() => handleTraderSort('trader_id')}>
                            TRADER ID {traderSortField === 'trader_id' ? (traderSortDir === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleTraderSort('name')}>
                            NAME {traderSortField === 'name' ? (traderSortDir === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th>SEGMENT</th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleTraderSort('trust_score')}>
                            TRUST {traderSortField === 'trust_score' ? (traderSortDir === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th>STATUS</th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleTraderSort('anomaly_score')}>
                            ANOMALY {traderSortField === 'anomaly_score' ? (traderSortDir === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleTraderSort('open_case_count')}>
                            CASES {traderSortField === 'open_case_count' ? (traderSortDir === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleTraderSort('last_activity')}>
                            LAST ACTIVITY {traderSortField === 'last_activity' ? (traderSortDir === 'asc' ? '▲' : '▼') : ''}
                          </th>
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 9.5, padding: '4px 6px', color: 'var(--accent-cyan)' }}
                          onClick={() => {
                            if (selected) {
                              setSelectedId(selected.trader_id)
                              setView('LIVE MONITOR')
                            }
                          }}
                        >
                          LIVE MONITOR →
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 9.5, padding: '4px 6px', color: 'var(--accent-cobalt)' }}
                          onClick={() => {
                            if (selected) {
                              setSelectedId(selected.trader_id)
                              setView('RELATIONSHIP GRAPH')
                            }
                          }}
                        >
                          TOPOLOGY GRAPH →
                        </button>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => selected && stepUpVerify(selected.trader_id)}
                      >
                        TRIGGER STEP-UP VERIFICATION (RESTORE TRUST)
                      </button>
                      <button className="btn btn-secondary" onClick={createCase}>
                        INITIALIZE FORMAL INVESTIGATION CASE
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 9.5, color: 'var(--state-elevated)' }}
                        onClick={() => selected && resetBaseline(selected.trader_id)}
                        title="Reset behavioral rolling baseline to initial bootstrap distributions"
                      >
                        RESET BEHAVIORAL BASELINE
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

                {/* Recent Behavioral Drift & Transitions */}
                <div className="panel" style={{ marginTop: 12 }}>
                  <div className="panel-header">
                    <h3>Recent Behavioral Drift & Transitions</h3>
                    <span className="panel-meta">TRADER #{selectedId}</span>
                  </div>
                  <div style={{ padding: '10px 14px' }}>
                    {selected?.timeline && selected.timeline.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selected.timeline.slice(-4).reverse().map((tr, idx) => (
                          <div
                            key={tr.transition_id || idx}
                            style={{
                              padding: '6px 8px',
                              background: 'var(--bg-surface-0)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-xs)',
                              fontSize: 10,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span className="mono" style={{ color: 'var(--accent-cobalt)', fontWeight: 600 }}>
                                {tr.event_type || 'DRIFT'}
                              </span>
                              <span className="mono" style={{ color: tr.delta < 0 ? 'var(--state-critical)' : 'var(--state-normal)', fontWeight: 700 }}>
                                {tr.previous_score} → {tr.new_score} ({tr.delta > 0 ? `+${tr.delta}` : tr.delta})
                              </span>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 9.5 }}>
                              {tr.reason}
                            </div>
                            <div className="mono" style={{ color: 'var(--text-dim)', fontSize: 8.5, marginTop: 2 }}>
                              {formatTime(tr.timestamp)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mono" style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', padding: '12px 0' }}>
                        Baseline stable — zero degrading transitions logged for #{selectedId}
                      </div>
                    )}
                  </div>
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
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        value={eventTypeFilter}
                        onChange={e => setEventTypeFilter(e.target.value)}
                        style={{
                          background: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 3,
                          padding: '3px 6px',
                          color: '#fff',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                        }}
                      >
                        <option value="ALL">ALL EVENT TYPES</option>
                        <option value="LOGIN">LOGIN</option>
                        <option value="NEW_DEVICE">NEW_DEVICE</option>
                        <option value="IP_CHANGE">IP_CHANGE</option>
                        <option value="DEPOSIT">DEPOSIT</option>
                        <option value="TRADE">TRADE</option>
                        <option value="LEVERAGE_CHANGE">LEVERAGE_CHANGE</option>
                        <option value="WITHDRAWAL">WITHDRAWAL</option>
                        <option value="PASSWORD_CHANGE">PASSWORD_CHANGE</option>
                        <option value="2FA_CHANGE">2FA_CHANGE</option>
                        <option value="API_KEY_CHANGE">API_KEY_CHANGE</option>
                      </select>
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

                  {/* Severity Filter Strip */}
                  <div style={{
                    display: 'flex',
                    gap: 6,
                    padding: '6px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-1)',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}>
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>SEVERITY:</span>
                    {[
                      { id: 'ALL', label: `ALL (${riskEvents.length})` },
                      { id: 'CRITICAL', label: `CRITICAL ≥70 (${riskEvents.filter(r => (r.severity ?? r.contextual_risk ?? 0) >= 70).length})` },
                      { id: 'HIGH', label: `HIGH 40–69 (${riskEvents.filter(r => (r.severity ?? r.contextual_risk ?? 0) >= 40 && (r.severity ?? r.contextual_risk ?? 0) < 70).length})` },
                      { id: 'GUARDED', label: `GUARDED <40 (${riskEvents.filter(r => (r.severity ?? r.contextual_risk ?? 0) < 40).length})` },
                    ].map(sev => (
                      <button
                        key={sev.id}
                        className={`btn ${riskSeverityFilter === sev.id ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 8.5, padding: '2px 6px' }}
                        onClick={() => setRiskSeverityFilter(sev.id as any)}
                      >
                        {sev.label}
                      </button>
                    ))}
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
                              <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                                {riskEvents.length === 0
                                  ? 'NO CONTEXTUAL RISK INCIDENTS IN LOG — EXECUTE AN ATTACK SCENARIO OR INGEST TELEMETRY TO POPULATE'
                                  : 'NO CONTEXTUAL RISK INCIDENTS MATCHING CURRENT SEARCH CRITERIA'}
                              </td>
                            </tr>
                          ) : (
                            filteredRiskEvents.map((re, rIdx) => {
                              const sev = re.severity ?? re.contextual_risk ?? 0
                              const dec = re.decision_impact ?? re.decision ?? 'ALLOW'
                              const postTrust = Math.round(re.resulting_trust ?? re.trust_after ?? 94)
                              const signalsList = re.signals && re.signals.length > 0
                                ? re.signals
                                : re.reason ? [{ category: re.category || 'RISK', reason: re.reason, feature: re.feature || '' }] : []
                              return (
                                <tr key={re.risk_id || re.event_id || `risk-${rIdx}`}>
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
                                      color: sev >= 70 ? 'var(--state-critical)' : sev >= 40 ? 'var(--state-elevated)' : 'var(--state-guarded)',
                                      fontWeight: 700,
                                    }}>
                                      {Math.round(sev)}/100
                                    </span>
                                  </td>
                                  <td><StatusBadge value={dec} /></td>
                                  <td className="mono"><b>{postTrust}/100</b></td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                      {signalsList.slice(0, 2).map((s, sIdx) => (
                                        <div key={sIdx} style={{ fontSize: 10 }}>
                                          <span className="mono" style={{ color: 'var(--accent-cobalt)', marginRight: 4 }}>
                                            [{(s.category || 'RISK').toUpperCase()}]
                                          </span>
                                          <span>{s.reason}</span>
                                        </div>
                                      ))}
                                      {signalsList.length > 2 && (
                                        <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                                          +{signalsList.length - 2} additional signals
                                        </span>
                                      )}
                                      {signalsList.length === 0 && (
                                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                                          {re.reason || 'Operational anomaly observed'}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button
                                        className="btn btn-secondary"
                                        style={{ padding: '2px 6px', fontSize: 10 }}
                                        onClick={() => {
                                          setSelectedId(re.trader_id)
                                          const matchedEvent = events.find(e => e.event_id === re.event_id)
                                          const matchedDecision = decisions.find(d => d.event_id === re.event_id || d.trader_id === re.trader_id)
                                          const matchedTrader = traders.find(t => t.trader_id === re.trader_id)
                                          setDrawerData({
                                            event: matchedEvent || {
                                              event_id: re.event_id || re.risk_id || 'EV-RISK',
                                              timestamp: re.timestamp,
                                              trader_id: re.trader_id,
                                              event_type: re.event_type,
                                              source: re.source || 'risk-events',
                                              risk_relevance: `${sev}`,
                                            },
                                            decision: matchedDecision,
                                            trader: matchedTrader,
                                          })
                                          setDrawerOpen(true)
                                        }}
                                      >
                                        INSPECT
                                      </button>
                                      {re.event_id && (
                                        <button
                                          className="btn btn-secondary"
                                          style={{ padding: '2px 6px', fontSize: 10, color: 'var(--accent-cyan)' }}
                                          onClick={() => handleNavigateToEvent(re.event_id, re.trader_id)}
                                          title="Trace this exact risk event in Live Telemetry Monitor"
                                        >
                                          TRACE →
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })
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

                  {/* Immediate Ingestion Outcome Feedback */}
                  {lastInjectionResult && (
                    <div
                      style={{
                        margin: '0 14px 14px',
                        background: 'var(--bg-surface-0)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '12px 14px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>
                            IMMEDIATE EVALUATION RESULT:
                          </span>
                          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                            #{lastInjectionResult.trader_id} // {lastInjectionResult.event_type}
                          </span>
                          {lastInjectionResult.event_id && (
                            <span className="mono" style={{ fontSize: 9, color: 'var(--accent-cobalt)' }}>
                              [{lastInjectionResult.event_id}]
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <StatusBadge value={lastInjectionResult.decision} />
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 8.5, padding: '1px 5px' }}
                            onClick={() => setLastInjectionResult(null)}
                          >
                            DISMISS ✕
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 10.5, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span>
                          RESULTING TRUST: <b className="mono">{Math.round(lastInjectionResult.trust_score)} / 100</b>
                        </span>
                        {lastInjectionResult.delta !== undefined && (
                          <span className="mono" style={{ color: lastInjectionResult.delta < 0 ? 'var(--state-critical)' : 'var(--state-normal)', fontWeight: 600 }}>
                            SCORE DELTA: {lastInjectionResult.delta > 0 ? `+${lastInjectionResult.delta}` : lastInjectionResult.delta}
                          </span>
                        )}
                        {lastInjectionResult.rule_triggered && (
                          <span className="mono" style={{ color: 'var(--state-elevated)', fontSize: 10 }}>
                            TRIGGERED RULE: {lastInjectionResult.rule_triggered}
                          </span>
                        )}
                      </div>

                      {lastInjectionResult.reasons && lastInjectionResult.reasons.length > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 10 }}>
                          <b>CONTRIBUTING FACTORS:</b> {lastInjectionResult.reasons.join(' · ')}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 9.5, padding: '3px 8px' }}
                          onClick={() => {
                            if (lastInjectionResult.event_id) {
                              handleNavigateToEvent(lastInjectionResult.event_id, lastInjectionResult.trader_id)
                            } else {
                              setSelectedId(lastInjectionResult.trader_id)
                              setView('LIVE MONITOR')
                            }
                          }}
                        >
                          INSPECT IN LIVE MONITOR →
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 9.5, padding: '3px 8px' }}
                          onClick={() => {
                            const matchedTrader = traders.find(t => t.trader_id === lastInjectionResult.trader_id)
                            setDrawerData({
                              trader: matchedTrader,
                              event: {
                                event_id: lastInjectionResult.event_id || 'EV-MANUAL',
                                timestamp: new Date().toISOString(),
                                trader_id: lastInjectionResult.trader_id,
                                event_type: lastInjectionResult.event_type,
                                source: 'operator-console',
                                risk_relevance: lastInjectionResult.risk_level || 'high',
                              },
                            })
                            setDrawerOpen(true)
                          }}
                        >
                          OPEN FORENSIC EVIDENCE DRAWER →
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 9.5, padding: '3px 8px' }}
                          onClick={() => {
                            setSelectedId(lastInjectionResult.trader_id)
                            setView('RELATIONSHIP GRAPH')
                          }}
                        >
                          VIEW TRADER TOPOLOGY →
                        </button>
                      </div>
                    </div>
                  )}
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
                    const activeGraph = graphMode === 'SYSTEM' ? systemGraph : graph
                    const matchedNode = activeGraph?.nodes?.find(n => n.id === id)
                    const connectedEdges = activeGraph?.edges?.filter(e => e.source === id || e.target === id)
                    const inferredType = matchedNode?.type || (id.startsWith('TRADER-') ? 'TRADER' : id.startsWith('DEV-') ? 'DEVICE' : id.startsWith('IP-') ? 'IP' : 'WALLET')
                    setDrawerData({
                      entity: {
                        id,
                        type: inferredType,
                        risk: matchedNode?.risk,
                        is_cluster: matchedNode?.is_cluster,
                        edges: connectedEdges,
                      },
                    })
                    setDrawerOpen(true)
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

          {/* VIEW: PROTOCOLS */}
          {view === 'PROTOCOLS' && (
            <SecurityProtocolCenter
              protocols={protocols}
              onTriggerProtocol={handleTriggerProtocol}
              onSelectTrader={id => {
                setSelectedId(id)
                refreshSelected(id)
              }}
              onNavigateToView={(v, id) => {
                if (id) {
                  setSelectedId(id)
                  refreshSelected(id)
                }
                setView(v)
              }}
            />
          )}

          {/* VIEW: CASES & TRIAGE */}
          {view === 'CASES' && (
            <ForensicCaseWorkbench
              cases={cases}
              traders={traders}
              selectedTrader={selected}
              decisions={decisions}
              events={events}
              auditRecords={audit}
              userRole={userRole}
              onUpdateCase={updateCase}
              onCreateCase={createCase}
              onAddCaseNote={addCaseNote}
              onExportDossier={exportDossier}
              onStepUpVerify={stepUpVerify}
              onResetBaseline={resetBaseline}
              onInspectTrader={inspectTrader}
              onInspectEvidence={(d, ev, t) => {
                setDrawerData({ decision: d, event: ev, trader: t })
                setDrawerOpen(true)
              }}
              onNavigateToAudit={handleNavigateToAudit}
              onNavigateToEvent={handleNavigateToEvent}
            />
          )}

          {/* VIEW: POLICIES */}
          {view === 'POLICIES' && (
            <PolicyMatrixSimulator
              policy={policy}
              userRole={userRole}
              onSavePolicy={savePolicy}
              onInspectTrader={inspectTrader}
              onInspectEvidence={(d, ev, t) => {
                setDrawerData({ decision: d, event: ev, trader: t })
                setDrawerOpen(true)
              }}
              allTraders={traders}
              allDecisions={decisions}
            />
          )}

          {/* VIEW: SIMULATOR */}
          {view === 'SIMULATOR' && (
            <ScenarioAttackReplay
              trader={selected}
              allTraders={traders}
              decisions={decisions}
              latestDecision={latestDecision}
              events={events}
              graph={graph}
              onInspectEvidence={(d, ev, t) => {
                setDrawerData({ decision: d, event: ev, trader: t })
                setDrawerOpen(true)
              }}
              onInspectTrader={inspectTrader}
              onSelectTrader={id => {
                setSelectedId(id)
                refreshSelected(id)
              }}
              onNavigate={setView}
              onStepUpVerify={stepUpVerify}
              onCreateCase={createCase}
              onRefreshAll={refreshAll}
              onNavigateToAudit={handleNavigateToAudit}
              onNavigateToEvent={handleNavigateToEvent}
            />
          )}

          {/* VIEW: AUDIT */}
          {view === 'AUDIT' && (
            <CryptographicAuditVault
              audit={audit}
              verificationResult={auditVerification}
              isVerifying={verifyingAudit}
              onVerifyChain={verifyAuditChain}
              onExportCSV={exportAuditCSV}
              initialFilterSubject={auditFilterSubject}
              initialAuditId={auditFocusId}
              onNavigateToEvent={handleNavigateToEvent}
            />
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
                    flexWrap: 'wrap',
                  }}>
                    <span className="mono" style={{ color: 'var(--text-muted)' }}>ENFORCEMENT GATEWAY COUNTERS:</span>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span
                        style={{ cursor: 'pointer' }}
                        onClick={() => { setRiskSeverityFilter('GUARDED'); setView('RISK EVENTS'); }}
                        title="Filter risk events for guarded/proceed decisions"
                      >
                        PROCEED: <b className="mono">{analytics?.operational_metrics?.enforcement_counts?.PROCEED ?? 0}</b>
                      </span>
                      <span
                        style={{ cursor: 'pointer' }}
                        onClick={() => { setRiskSeverityFilter('HIGH'); setView('RISK EVENTS'); }}
                        title="Filter risk events for step-up verification decisions"
                      >
                        CHALLENGE 2FA: <b className="mono" style={{ color: 'var(--state-elevated)' }}>{analytics?.operational_metrics?.enforcement_counts?.CHALLENGE_2FA ?? 0}</b>
                      </span>
                      <span
                        style={{ cursor: 'pointer' }}
                        onClick={() => { setView('CASES'); }}
                        title="Triage open forensic investigation cases"
                      >
                        HOLD REVIEW: <b className="mono" style={{ color: 'var(--state-high)' }}>{analytics?.operational_metrics?.enforcement_counts?.HOLD_REVIEW ?? 0}</b>
                      </span>
                      <span
                        style={{ cursor: 'pointer' }}
                        onClick={() => { setRiskSeverityFilter('CRITICAL'); setView('RISK EVENTS'); }}
                        title="Filter risk events for critical block decisions"
                      >
                        HALT BLOCKED: <b className="mono" style={{ color: 'var(--state-critical)' }}>{analytics?.operational_metrics?.enforcement_counts?.HALT_BLOCKED ?? 0}</b>
                      </span>
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
                    {analytics?.trust_distribution.map(item => {
                      const mapBandToFilter: Record<string, any> = {
                        'ALLOW': 'TRUSTED',
                        'MONITOR': 'MONITORED',
                        'VERIFY': 'MONITORED',
                        'RESTRICT': 'RESTRICTED',
                        'BLOCK': 'BLOCKED',
                      }
                      const bandPrefix = item.band.split(' ')[0].replace(/[^A-Z]/g, '')
                      const targetTier = mapBandToFilter[bandPrefix] || 'ALL'
                      return (
                        <div
                          key={item.band}
                          onClick={() => {
                            setTraderRiskFilter(targetTier)
                            setView('TRADERS')
                          }}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '80px 40px 1fr auto',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            padding: '3px 4px',
                            borderRadius: 3,
                          }}
                          className="clickable-distribution-row"
                          title={`Click to view all ${item.band} traders in Managed Population`}
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
                          <span className="mono" style={{ fontSize: 8.5, color: 'var(--accent-cyan)' }}>VIEW →</span>
                        </div>
                      )
                    })}
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
          </ErrorBoundary>
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
        onNavigateToAudit={handleNavigateToAudit}
      />

      {/* Step-Up Identity Verification Modal */}
      {stepUpModalOpen && (
        <StepUpVerificationModal
          trader={traders.find(t => t.trader_id === stepUpTraderId) || selected}
          onClose={() => setStepUpModalOpen(false)}
          onVerify={handleStepUpVerify}
        />
      )}

      {/* Out-of-Band Account Recovery Modal */}
      {recoveryModalOpen && (
        <AccountRecoveryModal
          trader={traders.find(t => t.trader_id === recoveryTraderId) || selected}
          onClose={() => setRecoveryModalOpen(false)}
          onRequestRecovery={handleRequestRecovery}
          onVerifyRecovery={handleVerifyRecovery}
        />
      )}
    </div>
  )
}

/* Institutional Persistent Decision Panel Component with Graduated Policy Ladder */
function PersistentDecisionPanel({
  decision,
  trader,
  onInspect,
  onCreateCase,
  onStepUp,
  onEvaluateAction,
  evaluatingAction,
  actionEvalResult,
}: {
  decision?: Decision
  trader?: Trader
  onInspect: () => void
  onCreateCase: () => void
  onStepUp: () => void
  onEvaluateAction?: (action: string) => void
  evaluatingAction?: boolean
  actionEvalResult?: ActionEvaluationResult | null
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

  const prevScore = (trader?.timeline && trader.timeline.length > 0)
    ? Math.round(trader.timeline[trader.timeline.length - 1].previous_score)
    : (trader?.initial_trust ?? 94)
  const currentScore = Math.round(decision.trust_score)
  const delta = currentScore - prevScore

  return (
    <div className={`decision-panel ${riskClass}`}>
      <div className="decision-panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>NETRA DECISION</span>
          {trader && (
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
              #{trader.trader_id} ({trader.segment})
            </span>
          )}
        </div>
        <span className="mono">{decision.decision_id}</span>
      </div>

      <div className="decision-core-block">
        <div className="trust-display">
          <div className="trust-score-row">
            <strong>{currentScore}</strong>
            <span>/ 100</span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: 8.5,
              marginTop: 1,
              color: delta < 0 ? 'var(--state-critical)' : delta > 0 ? 'var(--state-normal)' : 'var(--text-dim)',
              fontWeight: 600,
            }}
          >
            PREV: {prevScore} ({delta < 0 ? `▼ ${delta}` : delta > 0 ? `▲ +${delta}` : 'Δ 0'} PTS)
          </div>
          <span className="trust-label">CONTINUOUS TRUST</span>
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
      {actionEvalResult && actionEvalResult.trader_id === (trader?.trader_id || decision.trader_id) && (
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
          {Array.isArray(decision?.explanation?.top_factors) && decision.explanation.top_factors.length > 0 ? (
            decision.explanation.top_factors.slice(0, 6).map((factor, idx) => (
              <div key={idx} className="contributor-row">
                <span className="contributor-bullet">•</span>
                <span>{factor}</span>
              </div>
            ))
          ) : (
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', padding: '4px 0' }}>
              No elevated risk factors detected — conforming to baseline norms
            </div>
          )}
        </div>
      </div>

      <div className="decision-recommendation-note">
        <b>SOP RECOMMENDATION:</b> {decision?.explanation?.recommendation || 'Maintain standard passive continuous monitoring.'}
      </div>

      {(decision.audit_id || decision.case_id) && (
        <div style={{ padding: '6px 14px', background: 'var(--bg-surface-0)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, fontFamily: 'var(--font-mono)' }}>
          {decision.audit_id && (
            <span style={{ color: 'var(--text-secondary)' }}>
              AUDIT: <b style={{ color: 'var(--accent-cobalt)' }}>{decision.audit_id}</b> {decision.audit_hash ? `(${decision.audit_hash.slice(0, 8)}…)` : ''}
            </span>
          )}
          {decision.case_id && (
            <span style={{ color: 'var(--state-critical)', fontWeight: 600 }}>
              CASE: {decision.case_id}
            </span>
          )}
        </div>
      )}

      <div className="decision-actions-row">
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onInspect}>
          VIEW EVIDENCE
        </button>
        <button className="btn btn-outline-danger" style={{ flex: 1 }} onClick={onCreateCase}>
          OPEN CASE
        </button>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onStepUp}>
          STEP-UP
        </button>
      </div>
    </div>
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
  recentEventIds,
  showPriority = false,
  onSelectTrader,
  onInspectEvent,
}: {
  events: Event[]
  compact?: boolean
  recentEventIds?: string[]
  showPriority?: boolean
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
    <table className="data-table">
      <thead>
        <tr>
          {showPriority && <th style={{ width: 80 }}>PRIORITY</th>}
          <th>TIME (UTC)</th>
          <th>TRADER ID</th>
          <th>EVENT TYPE</th>
          <th>CONTEXT / TELEMETRY</th>
          <th>SOURCE</th>
          <th>ACTION</th>
        </tr>
      </thead>
      <tbody>
        {events.slice(0, compact ? 8 : 40).map(ev => {
          const priority = getPriority(ev)
          const isNew = recentEventIds?.includes(ev.event_id)
          return (
            <tr key={ev.event_id} className={isNew ? 'live-event-new-row' : ''}>
              {showPriority && (
                <td>
                  <span className={`priority-pill priority-${priority.toLowerCase()}`}>
                    {priority}
                  </span>
                </td>
              )}
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
          )
        })}
      </tbody>
    </table>
  )
}
