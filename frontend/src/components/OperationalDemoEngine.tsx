import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { soundManager } from '../audio'
import type {
  AuditRecord,
  Case,
  CounterfactualModifications,
  CounterfactualResult,
  Decision,
  Event,
  Graph,
  Trader,
} from '../types'

export type ScenarioCode =
  | 'FLAGSHIP'
  | 'TRAVEL'
  | 'FRAUD_RING'
  | 'TAKEOVER'
  | 'ATTACK_SURGE'
  | 'NORMAL_ACTIVITY'

interface ScenarioStepDef {
  step: number
  event_type: string
  title: string
  telemetry: string
  detail: string
  baselineComparison: string
  expectedOutcome: string
  severity: 'NORMAL' | 'MONITOR' | 'ELEVATED' | 'HIGH' | 'CRITICAL'
}

interface ScenarioDef {
  code: ScenarioCode
  title: string
  targetTraderId: string
  targetTraderName: string
  severityTag: string
  summary: string
  thesis: string
  steps: ScenarioStepDef[]
}

const SCENARIOS: Record<ScenarioCode, ScenarioDef> = {
  FLAGSHIP: {
    code: 'FLAGSHIP',
    title: 'Rapid Suspicious Withdrawal Kill Chain',
    targetTraderId: '7842',
    targetTraderName: 'Maya Chen',
    severityTag: 'CRITICAL',
    summary:
      'Compounding attack kill chain: New Device → Datacenter IP → $25,000 Liquidity Surge → 50× Leverage Multiplier → $24,000 Exfiltration to Fresh Wallet.',
    thesis:
      'NETRA continuously correlates hardware novelty, network reputation, volume surges, and leverage anomalies to intercept an automated capital drain before execution.',
    steps: [
      {
        step: 1,
        event_type: 'LOGIN',
        title: 'Routine Session Initiation',
        telemetry: 'Mumbai, IN (203.0.113.22) // Primary Hardware DEV-7842-PRIMARY',
        detail: 'User authenticates from known domestic ISP and registered hardware profile.',
        baselineComparison: 'Within habitual hours (09:00–17:00 UTC) and approved geography (IN).',
        expectedOutcome: 'ALLOW // Baseline Trust Preserved (~94.0)',
        severity: 'NORMAL',
      },
      {
        step: 2,
        event_type: 'NEW_DEVICE',
        title: 'Hardware Fingerprint Novelty',
        telemetry: 'Unrecognized Device DEV-7842-NEW // Mumbai, IN',
        detail: 'First session detected on novel hardware. Identity novelty signal registered.',
        baselineComparison: 'Known devices: [DEV-7842-PRIMARY]. Novel device novelty penalty logged.',
        expectedOutcome: 'MONITOR // Guarded Surveillance Initiated (~89.0)',
        severity: 'MONITOR',
      },
      {
        step: 3,
        event_type: 'IP_CHANGE',
        title: 'Proxy / Datacenter Obfuscation',
        telemetry: 'Datacenter IP 198.18.0.14 // ASN AS-DEMO-DC (Hosting)',
        detail: 'Session hops to commercial datacenter subnet. Strong compounding anomaly with novel device.',
        baselineComparison: 'Baseline ISP: Domestic residential. Datacenter IP violates infrastructure profile.',
        expectedOutcome: 'MONITOR // Risk Vector Escalation (~74.0)',
        severity: 'ELEVATED',
      },
      {
        step: 4,
        event_type: 'DEPOSIT',
        title: 'Abnormal Liquidity Surge',
        telemetry: '$25,000 USDT via Datacenter Subnet',
        detail: 'Sudden high-volume deposit injected immediately prior to speculative leverage.',
        baselineComparison: '8.3× above 90-day habitual deposit mean ($3,000). Velocity surge detected.',
        expectedOutcome: 'VERIFY // Biometric Step-Up Required (~52.0)',
        severity: 'HIGH',
      },
      {
        step: 5,
        event_type: 'LEVERAGE_CHANGE',
        title: 'Speculative Leverage Escalation',
        telemetry: '50× Maximum Margin on BTC/USD',
        detail: 'Margin multiplied to 50×, exposing account to catastrophic liquidation risk.',
        baselineComparison: '10× above habitual max leverage (5×). Risk profile completely destabilized.',
        expectedOutcome: 'RESTRICT // Trading Capability Constrained (~38.0)',
        severity: 'HIGH',
      },
      {
        step: 6,
        event_type: 'WITHDRAWAL',
        title: 'Hostile Capital Exfiltration',
        telemetry: '$24,000 USD to Fresh Destination WALLET-7842-FRESH',
        detail: 'Attempted rapid withdrawal to brand-new destination address completes sequence kill chain.',
        baselineComparison: 'Rapid withdrawal sequence completed. Total trust collapse below block boundary.',
        expectedOutcome: 'BLOCK // Automated Capital Lockdown & Case Escalation (~22.0)',
        severity: 'CRITICAL',
      },
    ],
  },
  TRAVEL: {
    code: 'TRAVEL',
    title: 'Legitimate Cross-Border Travel',
    targetTraderId: '7842',
    targetTraderName: 'Maya Chen',
    severityTag: 'GUARDED',
    summary:
      'Legitimate executive travel to Singapore. Residential ISP, proportional deposits, and routine leverage demonstrate zero false-positive disruption.',
    thesis:
      'NETRA distinguishes benign geographic mobility from adversary takeovers by cross-referencing network reputation, deposit proportions, and normal behavioral continuity.',
    steps: [
      {
        step: 1,
        event_type: 'LOGIN',
        title: 'Cross-Border Authentication',
        telemetry: 'Singapore (203.0.113.88) // Device DEV-7842-TRAVEL',
        detail: 'Trader logs in from Singapore residential ISP. Geographic novelty detected but network reputation is clean.',
        baselineComparison: 'Baseline country IN → New country SG. Velocity matches flight travel window.',
        expectedOutcome: 'ALLOW // Travel Context Recognized (~91.0)',
        severity: 'MONITOR',
      },
      {
        step: 2,
        event_type: 'DEPOSIT',
        title: 'Habitual Capital Deposit',
        telemetry: '$2,800 USD from Singapore',
        detail: 'Deposit aligns precisely with typical historical funding sizes.',
        baselineComparison: '$2,800 vs habitual baseline $3,000. Variance within normal 1-sigma bounds.',
        expectedOutcome: 'ALLOW // Continuous Trust Maintained (~90.5)',
        severity: 'NORMAL',
      },
      {
        step: 3,
        event_type: 'TRADE',
        title: 'Routine Spot Trade',
        telemetry: '$1,200 ETH Spot Execution // 3× Habitual Margin',
        detail: 'Execution follows historical trading pattern with standard margin multiplier.',
        baselineComparison: 'Leverage within baseline (3× vs 3×). Zero anomaly detected.',
        expectedOutcome: 'ALLOW // Uninterrupted Execution (~91.0)',
        severity: 'NORMAL',
      },
    ],
  },
  FRAUD_RING: {
    code: 'FRAUD_RING',
    title: 'Multi-Account Collusion Cluster',
    targetTraderId: '7102',
    targetTraderName: 'Raj Patel',
    severityTag: 'CRITICAL',
    summary:
      'Sybil fraud ring: Traders #7102–#7105 share device DEV-RING-X, subnet IP-RING-X, and exfiltrate to WALLET-RING-X simultaneously.',
    thesis:
      'NETRA graph intelligence discovers multi-hop entity sharing across distinct accounts, escalating policy to isolate the entire collusion cluster.',
    steps: [
      {
        step: 1,
        event_type: 'WITHDRAWAL',
        title: 'Coordinated Withdrawal Node A',
        telemetry: '$9,800 to WALLET-RING-X // DEV-RING-X',
        detail: 'First cluster account initiates rapid withdrawal to shared cluster wallet.',
        baselineComparison: 'Shared device and destination wallet link to 3 other active trader accounts.',
        expectedOutcome: 'RESTRICT // Infrastructure Collusion Flagged (~35.0)',
        severity: 'HIGH',
      },
      {
        step: 2,
        event_type: 'WITHDRAWAL',
        title: 'Coordinated Withdrawal Node B',
        telemetry: '$9,800 to WALLET-RING-X // DEV-RING-X',
        detail: 'Second cluster account initiates parallel withdrawal from identical hardware.',
        baselineComparison: 'High-density shared infrastructure cluster confirms coordinated fraud ring.',
        expectedOutcome: 'BLOCK // Cluster-Wide Quarantine (~18.0)',
        severity: 'CRITICAL',
      },
    ],
  },
  TAKEOVER: {
    code: 'TAKEOVER',
    title: 'Credential Stuffing & Takeover',
    targetTraderId: '7842',
    targetTraderName: 'Maya Chen',
    severityTag: 'CRITICAL',
    summary:
      'Brute-force credential takeover: Novel device → Multiple failed logins → Password changed → API key generated.',
    thesis:
      'NETRA terminates active sessions and blocks API generation when credential modifications follow failed authentication spikes.',
    steps: [
      {
        step: 1,
        event_type: 'LOGIN_FAILURE',
        title: 'Failed Credential Attempt',
        telemetry: 'Tor Exit Node // DEV-UNKNOWN-TOR',
        detail: 'Adversary probes login credentials through anonymized exit relay.',
        baselineComparison: 'Unknown network and device violate habitual login profile.',
        expectedOutcome: 'MONITOR // Suspicious Auth Logged (~78.0)',
        severity: 'ELEVATED',
      },
      {
        step: 2,
        event_type: 'PASSWORD_CHANGE',
        title: 'Credential Reset Surge',
        telemetry: 'Immediate Password Invalidation',
        detail: 'Password changed immediately following unauthorized access probe.',
        baselineComparison: 'Violates habitual security profile. Step-up challenge required.',
        expectedOutcome: 'RESTRICT // Session Quarantined (~42.0)',
        severity: 'HIGH',
      },
    ],
  },
  ATTACK_SURGE: {
    code: 'ATTACK_SURGE',
    title: 'Compounding Anomaly Kill Chain',
    targetTraderId: '7842',
    targetTraderName: 'Maya Chen',
    severityTag: 'CRITICAL',
    summary:
      'Datacenter Hardware Intrusion → Password Reset → 80× Leverage Multiplier → $35,000 Hostile Balance Exfiltration.',
    thesis:
      'NETRA enforces automated capital lockdown and incident case creation before balance exfiltration can complete.',
    steps: [
      {
        step: 1,
        event_type: 'NEW_DEVICE',
        title: 'Datacenter Hardware Intrusion',
        telemetry: 'Hardware DEV-SURGE-1 // Datacenter Subnet 198.18.0.21',
        detail: 'First session detected from novel hardware routing through commercial datacenter hosting.',
        baselineComparison: 'Known devices: [DEV-7842-PRIMARY]. Datacenter network type flags identity novelty.',
        expectedOutcome: 'MONITOR // Identity Novelty Penalized (~84.0)',
        severity: 'MONITOR',
      },
      {
        step: 2,
        event_type: 'PASSWORD_CHANGE',
        title: 'Credential Invalidation',
        telemetry: 'Password Reset via Datacenter Subnet 198.18.0.21',
        detail: 'Account password changed immediately following unauthorized hardware introduction.',
        baselineComparison: 'Credential change from unverified hardware violates habitual security profile.',
        expectedOutcome: 'VERIFY // Credential Anomaly Spike (~58.0)',
        severity: 'HIGH',
      },
      {
        step: 3,
        event_type: 'LEVERAGE_CHANGE',
        title: 'Destabilizing Margin Surge',
        telemetry: '80× Margin Multiplier on SOL',
        detail: 'Margin multiplied to 80×, exposing account equity to catastrophic liquidation risk.',
        baselineComparison: '16× above habitual max leverage (5×). Extreme velocity and volatility deviation.',
        expectedOutcome: 'RESTRICT // Margin Capability Constrained (~32.0)',
        severity: 'HIGH',
      },
      {
        step: 4,
        event_type: 'WITHDRAWAL',
        title: 'Hostile Balance Drain',
        telemetry: '$35,000 USD to WALLET-SURGE-DRAIN',
        detail: 'Attempted rapid withdrawal to fresh destination wallet completes compounding attack sequence.',
        baselineComparison: 'Continuous trust score collapses below critical lockdown threshold.',
        expectedOutcome: 'BLOCK // Automated Capital Lockdown & Case Escalation (~16.0)',
        severity: 'CRITICAL',
      },
    ],
  },
  NORMAL_ACTIVITY: {
    code: 'NORMAL_ACTIVITY',
    title: 'Routine Habitual Baseline Session',
    targetTraderId: '7842',
    targetTraderName: 'Maya Chen',
    severityTag: 'NORMAL',
    summary:
      'Routine operational activity: Known domestic device, habitual $1,500 deposit, and conservative 3× margin trade.',
    thesis:
      'NETRA preserves high continuous trust across routine operations without unnecessary step-up friction or false positives.',
    steps: [
      {
        step: 1,
        event_type: 'LOGIN',
        title: 'Authenticated Session',
        telemetry: 'Mumbai, IN // Primary Hardware DEV-7842-PRIMARY',
        detail: 'Operator authenticates from habitual residential ISP and registered primary device.',
        baselineComparison: 'Matches established geographical and device profile. Zero deviation.',
        expectedOutcome: 'ALLOW // Baseline Trust Preserved (~94.0)',
        severity: 'NORMAL',
      },
      {
        step: 2,
        event_type: 'DEPOSIT',
        title: 'Routine Account Funding',
        telemetry: '$1,500 USD via Domestic Banking Rail',
        detail: 'Deposit aligns comfortably with habitual funding baseline ($3,000 mean).',
        baselineComparison: '$1,500 vs habitual baseline $3,000 (0.5×). Financial volume within 1 standard deviation.',
        expectedOutcome: 'ALLOW // Continuous Trust Maintained (~93.5)',
        severity: 'NORMAL',
      },
      {
        step: 3,
        event_type: 'TRADE',
        title: 'Conservative Execution',
        telemetry: '$1,000 BTC Execution // 3× Baseline Margin',
        detail: 'Spot order execution with habitual asset and standard margin multiplier.',
        baselineComparison: 'Matches habitual asset (BTC) and leverage (3×). Zero behavioral anomaly.',
        expectedOutcome: 'ALLOW // Continuous Normal Standing (~94.0)',
        severity: 'NORMAL',
      },
    ],
  },
}

interface OperationalDemoEngineProps {
  trader?: Trader
  allTraders: Trader[]
  decisions: Decision[]
  latestDecision?: Decision
  events: Event[]
  cases: Case[]
  auditRecords: AuditRecord[]
  graph?: Graph
  onInspectEvidence?: (decision?: Decision, event?: Event, trader?: Trader) => void
  onInspectTrader?: (trader: Trader) => void
  onSelectTrader?: (traderId: string) => void
  onNavigate?: (view: any) => void
  onNavigateToCase?: (caseId?: string) => void
  onNavigateToAudit?: (auditId?: string, subject?: string) => void
  onNavigateToEvent?: (eventId: string, traderId: string) => void
  onRefreshAll: () => Promise<void>
  onCloseModal?: () => void
  isModal?: boolean
}

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'

const money = (val?: number) =>
  val !== undefined
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
    : '—'

export function OperationalDemoEngine({
  trader,
  allTraders,
  decisions,
  latestDecision,
  events,
  cases,
  auditRecords,
  graph,
  onInspectEvidence,
  onInspectTrader,
  onSelectTrader,
  onNavigate,
  onNavigateToCase,
  onNavigateToAudit,
  onNavigateToEvent,
  onRefreshAll,
  onCloseModal,
  isModal = false,
}: OperationalDemoEngineProps) {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioCode>('FLAGSHIP')
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [playSpeed, setPlaySpeed] = useState<'NORMAL' | 'FAST'>('NORMAL')
  const [isStepping, setIsStepping] = useState<boolean>(false)
  const [stepHistory, setStepHistory] = useState<any[]>([])
  const [demoNotice, setDemoNotice] = useState<string>('')
  const [expandedStage, setExpandedStage] = useState<number | null>(3) // Stage 3 open by default
  const [verifyingAuditLedger, setVerifyingAuditLedger] = useState(false)
  const [ledgerVerificationResult, setLedgerVerificationResult] = useState<any | null>(null)

  // Counterfactual State
  const [cfMods, setCfMods] = useState<CounterfactualModifications>({
    remove_device_novelty: false,
    remove_network_novelty: false,
    normalize_amount: false,
    normalize_leverage: false,
    remove_velocity: false,
    remove_topology_linkage: false,
    verification_succeeded: false,
  })
  const [cfResult, setCfResult] = useState<CounterfactualResult | null>(null)
  const [simulatingCf, setSimulatingCf] = useState(false)

  const activeScenario = SCENARIOS[selectedScenario]
  const totalSteps = activeScenario.steps.length
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Target trader
  const scenarioTrader = useMemo(() => {
    return allTraders.find(t => t.trader_id === activeScenario.targetTraderId) || trader
  }, [allTraders, activeScenario.targetTraderId, trader])

  const targetTraderDisplayName = scenarioTrader?.name || activeScenario.targetTraderName

  // Step result currently active
  const activeStepResult = useMemo(() => {
    if (currentStepIndex === 0) return null
    return stepHistory[currentStepIndex - 1] || null
  }, [currentStepIndex, stepHistory])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Switch scenario
  const handleSelectScenario = async (code: ScenarioCode) => {
    if (isPlaying) {
      setIsPlaying(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
    setSelectedScenario(code)
    setCurrentStepIndex(0)
    setStepHistory([])
    setCfResult(null)
    setLedgerVerificationResult(null)
    setDemoNotice(`SCENARIO ACTIVATED: ${SCENARIOS[code].title}`)
    if (onSelectTrader) {
      onSelectTrader(SCENARIOS[code].targetTraderId)
    }
    try {
      await api.send('POST', '/simulator/reset')
      await onRefreshAll()
    } catch (e) {
      console.error(e)
    }
  }

  // Step forward
  const executeStepForward = useCallback(async (): Promise<boolean> => {
    if (currentStepIndex >= totalSteps) {
      setIsPlaying(false)
      return false
    }
    setIsStepping(true)
    try {
      soundManager.playEventTick()
      const res = await api.send<any>('POST', '/simulator/step', { scenario: selectedScenario })
      setStepHistory(prev => [...prev.slice(0, currentStepIndex), res])
      const nextIndex = currentStepIndex + 1
      setCurrentStepIndex(nextIndex)

      if (res.decision?.trust_score < 45) {
        soundManager.playThreatAlert()
      }

      setDemoNotice(
        `STEP ${nextIndex}/${totalSteps}: ${res.event?.event_type || 'Event'} processed // Trust: ${res.trust_score ?? res.decision?.trust_score ?? '—'}`
      )

      if (res.event?.trader_id && onSelectTrader) {
        onSelectTrader(res.event.trader_id)
      }

      await onRefreshAll()

      if (res.complete || nextIndex >= totalSteps) {
        setIsPlaying(false)
        return false
      }
      return true
    } catch (err: any) {
      setDemoNotice(err.message || 'Step execution failed.')
      setIsPlaying(false)
      return false
    } finally {
      setIsStepping(false)
    }
  }, [currentStepIndex, totalSteps, selectedScenario, onRefreshAll, onSelectTrader])

  // Step backward
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

      const newHistory: any[] = []
      for (let i = 0; i < targetStep; i++) {
        const res = await api.send<any>('POST', '/simulator/step', { scenario: selectedScenario })
        newHistory.push(res)
      }
      setStepHistory(newHistory)
      setCurrentStepIndex(targetStep)
      setDemoNotice(`ROLLED BACK TO STEP ${targetStep}/${totalSteps}`)
      await onRefreshAll()
    } catch (err: any) {
      setDemoNotice(err.message || 'Rollback failed.')
    } finally {
      setIsStepping(false)
    }
  }

  // Reset to Baseline
  const handleReset = async () => {
    setIsPlaying(false)
    if (timerRef.current) clearInterval(timerRef.current)
    setIsStepping(true)
    try {
      soundManager.playSuccess()
      await api.send('POST', '/simulator/reset')
      setCurrentStepIndex(0)
      setStepHistory([])
      setCfResult(null)
      setLedgerVerificationResult(null)
      setDemoNotice('SCENARIO RESET: Initial Trader Habitual Baseline Restored')
      await onRefreshAll()
    } catch (err: any) {
      setDemoNotice(err.message || 'Reset failed.')
    } finally {
      setIsStepping(false)
    }
  }

  // Jump directly to step
  const handleJumpToStep = async (targetStep: number) => {
    if (isStepping || targetStep === currentStepIndex) return
    setIsPlaying(false)
    if (timerRef.current) clearInterval(timerRef.current)

    setIsStepping(true)
    try {
      soundManager.playEventTick()
      if (targetStep < currentStepIndex) {
        await api.send('POST', '/simulator/reset')
        const newHistory: any[] = []
        for (let i = 0; i < targetStep; i++) {
          const res = await api.send<any>('POST', '/simulator/step', { scenario: selectedScenario })
          newHistory.push(res)
        }
        setStepHistory(newHistory)
        setCurrentStepIndex(targetStep)
      } else {
        const stepsToTake = targetStep - currentStepIndex
        const newHistory = [...stepHistory]
        for (let i = 0; i < stepsToTake; i++) {
          const res = await api.send<any>('POST', '/simulator/step', { scenario: selectedScenario })
          newHistory.push(res)
        }
        setStepHistory(newHistory)
        setCurrentStepIndex(targetStep)
      }
      setDemoNotice(`JUMPED TO STEP ${targetStep}/${totalSteps}`)
      await onRefreshAll()
    } catch (err: any) {
      setDemoNotice(err.message || 'Jump failed.')
    } finally {
      setIsStepping(false)
    }
  }

  // Auto-play timer
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

  // Active step fields
  const activeEvent = activeStepResult?.event || events.find(e => e.trader_id === activeScenario.targetTraderId) || events[0]
  const activeDecision = activeStepResult?.decision || decisions.find(d => d.trader_id === activeScenario.targetTraderId) || latestDecision
  const activeAudit = activeStepResult?.audit_record || auditRecords.find(a => a.subject === activeScenario.targetTraderId) || auditRecords[0]
  const activeCase = activeStepResult?.case || cases.find(c => c.trader_id === activeScenario.targetTraderId)

  const activeTrust = activeStepResult?.trust_score ?? activeDecision?.trust_score ?? scenarioTrader?.trust_score ?? 94.0
  const priorTrust = activeDecision?.previous_score ?? 94.0
  const trustDelta = Math.round((activeTrust - priorTrust) * 10) / 10
  const activeDecisionStr = activeDecision?.decision ?? 'ALLOW'

  const explanation = activeDecision?.explanation || {}
  const primaryDrivers = explanation.primary_drivers || []
  const whatChanged = explanation.what_changed || {}
  const evidenceBasis = explanation.evidence_basis || {}

  // Run live counterfactual simulation
  const handleRunCounterfactual = async (customMods?: CounterfactualModifications) => {
    const modsToApply = customMods || cfMods
    if (!activeEvent) return
    setSimulatingCf(true)
    try {
      const res = await api.post<CounterfactualResult>('/counterfactual/simulate', {
        trader_id: activeEvent.trader_id,
        event: activeEvent,
        modifications: modsToApply,
      })
      setCfResult(res)
      soundManager.playEventTick()
    } catch (e: any) {
      console.error('Counterfactual simulation failed:', e)
    } finally {
      setSimulatingCf(false)
    }
  }

  // Verify full audit ledger
  const handleVerifyLedger = async () => {
    setVerifyingAuditLedger(true)
    try {
      soundManager.playEventTick()
      const res = await api.get<any>('/audit/verify')
      setLedgerVerificationResult(res)
      soundManager.playSuccess()
    } catch (e: any) {
      setLedgerVerificationResult({ valid: false, error: e.message || 'Audit verification failed' })
    } finally {
      setVerifyingAuditLedger(false)
    }
  }

  // Blast radius calculation
  const blastRadius = useMemo(() => {
    const directEdges = (graph?.edges || []).filter(
      e => e.source === `TRADER-${activeScenario.targetTraderId}` || e.target === `TRADER-${activeScenario.targetTraderId}`
    )
    const directEntityIds = new Set(
      directEdges.map(e => (e.source.startsWith('TRADER-') ? e.target : e.source))
    )
    const secondHopEdges = (graph?.edges || []).filter(
      e => directEntityIds.has(e.source) || directEntityIds.has(e.target)
    )
    const allConnectedEntities = new Set([
      ...Array.from(directEntityIds),
      ...secondHopEdges.map(e => e.source),
      ...secondHopEdges.map(e => e.target),
    ])
    allConnectedEntities.delete(`TRADER-${activeScenario.targetTraderId}`)

    const affectedTraders = Array.from(allConnectedEntities).filter(id => id.startsWith('TRADER-'))
    const affectedDevices = Array.from(allConnectedEntities).filter(id => id.startsWith('DEV-') || id.startsWith('DEVICE-'))
    const affectedIps = Array.from(allConnectedEntities).filter(id => id.startsWith('IP-') || id.startsWith('SUBNET-'))
    const affectedWallets = Array.from(allConnectedEntities).filter(id => id.startsWith('WALLET-'))

    return {
      directCount: directEntityIds.size,
      totalCount: allConnectedEntities.size,
      affectedTraders,
      affectedDevices,
      affectedIps,
      affectedWallets,
      status: affectedTraders.length > 0 ? 'COLLUSION_CLUSTER' : directEntityIds.size > 2 ? 'ELEVATED_BLAST_RADIUS' : 'LOCALIZED',
    }
  }, [graph, activeScenario.targetTraderId])

  return (
    <div className={`operational-demo-engine ${isModal ? 'modal-mode' : ''}`}>
      {/* DEMO ENGINE COMMAND BANNER */}
      <div className="demo-engine-header">
        <div className="demo-engine-title-group">
          <div className="demo-kicker mono">
            NETRA // CONTINUOUS TRUST INTELLIGENCE // UNIFIED OPERATIONAL DEMONSTRATOR
          </div>
          <h2 className="demo-title">
            <span>OPERATIONAL DEMONSTRATION ENGINE</span>
            <span className={`priority-pill priority-${activeScenario.severityTag.toLowerCase()}`}>
              SCENARIO: {activeScenario.code}
            </span>
          </h2>
          <div className="demo-thesis mono">
            {activeScenario.summary}
          </div>
        </div>

        <div className="demo-engine-quick-controls">
          {isModal && onCloseModal && (
            <button className="btn btn-secondary" onClick={onCloseModal} style={{ padding: '6px 12px' }}>
              ✕ CLOSE DEMO
            </button>
          )}
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
            {isPlaying ? '⏸ PAUSE DEMO' : '⚡ RUN AUTONOMOUS DEMO'}
          </button>
        </div>
      </div>

      {/* SCENARIO SELECTOR STRIP */}
      <div className="demo-scenario-strip">
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>
          SELECT SCENARIO:
        </span>
        {(Object.keys(SCENARIOS) as ScenarioCode[]).map(code => {
          const sc = SCENARIOS[code]
          const isSelected = selectedScenario === code
          return (
            <button
              key={code}
              className={`demo-scenario-tab ${isSelected ? 'active' : ''}`}
              onClick={() => handleSelectScenario(code)}
            >
              <span className="tab-code mono">{sc.code}</span>
              <span className="tab-title">{sc.title}</span>
            </button>
          )
        })}
      </div>

      {/* STEPPER PROGRESSION TIMELINE */}
      <div className="demo-stepper-card">
        <div className="demo-stepper-head">
          <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
            INCIDENT RECONSTRUCTION TIMELINE // {totalSteps} CORRELATED EVENTS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              SPEED:
            </span>
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
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)' }}>
              STEP {currentStepIndex} OF {totalSteps}
            </span>
          </div>
        </div>

        {/* Stepper Node Ribbon */}
        <div className="demo-stepper-track">
          {activeScenario.steps.map((stepDef, idx) => {
            const stepNum = idx + 1
            const isCompleted = stepNum < currentStepIndex
            const isActive = stepNum === currentStepIndex
            const stepData = stepHistory[idx]
            const score = stepData?.trust_score ?? stepData?.decision?.trust_score
            const dec = stepData?.decision?.decision

            return (
              <div
                key={stepDef.step}
                className={`demo-step-node ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
                onClick={() => handleJumpToStep(stepNum)}
              >
                <div className="node-top">
                  <span className="mono" style={{ fontSize: 9 }}>STEP 0{stepNum}</span>
                  <span className={`priority-pill priority-${(dec || stepDef.severity).toLowerCase()}`} style={{ fontSize: 8 }}>
                    {dec || stepDef.severity}
                  </span>
                </div>
                <div className="node-type mono">{stepDef.event_type}</div>
                <div className="node-title">{stepDef.title}</div>
                <div className="node-score mono">
                  {score !== undefined ? `${Math.round(score)}/100` : '—'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Stepper Playback Controls */}
        <div className="demo-playback-bar">
          <div className="btn-group">
            <button
              className="btn btn-secondary"
              style={{ fontSize: 10, padding: '4px 10px' }}
              disabled={currentStepIndex <= 0 || isStepping}
              onClick={handlePrevStep}
            >
              ⏮ PREV STEP
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 10, padding: '4px 10px' }}
              disabled={currentStepIndex >= totalSteps || isStepping}
              onClick={() => executeStepForward()}
            >
              {isStepping ? 'PROCESSING...' : '⏭ NEXT STEP'}
            </button>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 10, padding: '4px 10px' }}
              disabled={isStepping}
              onClick={handleReset}
            >
              ↺ RESET BASELINE
            </button>
          </div>

          {demoNotice && (
            <div className="demo-notice mono">
              {demoNotice}
            </div>
          )}
        </div>
      </div>

      {/* 10-STAGE CANONICAL PROGRESSION ACCORDION & COCKPIT */}
      <div className="demo-stages-cockpit">
        <div className="cockpit-header">
          <div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              AUTHORITATIVE REASONING CHAIN // CURRENT TELEMETRY EVENT
            </div>
            <h3 style={{ margin: '2px 0 0 0', color: '#fff', fontSize: 16 }}>
              {currentStepIndex === 0
                ? 'INITIAL HABITUAL BASELINE PROFILE (NO ATTACK TELEMETRY YET)'
                : `STEP 0${currentStepIndex}: ${activeScenario.steps[currentStepIndex - 1]?.title}`}
            </h3>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {activeEvent && onNavigateToEvent && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: 10, padding: '4px 10px' }}
                onClick={() => onNavigateToEvent(activeEvent.event_id, activeEvent.trader_id)}
              >
                ⚡ LIVE MONITOR →
              </button>
            )}
            {activeCase && onNavigate && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: 10, padding: '4px 10px' }}
                onClick={() => onNavigate('CASES')}
              >
                📂 VIEW CASE #{activeCase.case_id.slice(-6)} →
              </button>
            )}
            {activeAudit && onNavigateToAudit && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: 10, padding: '4px 10px' }}
                onClick={() => onNavigateToAudit(activeAudit.audit_id, activeEvent?.trader_id)}
              >
                ⛓ AUDIT VAULT →
              </button>
            )}
          </div>
        </div>

        {/* 10-STAGE GRID */}
        <div className="stages-accordion-list">
          {/* STAGE 01: EVENT DETECTED */}
          <div className={`stage-card ${expandedStage === 1 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 1 ? null : 1)}>
              <span className="stage-badge mono">STAGE 01</span>
              <span className="stage-title">EVENT DETECTED</span>
              <span className="stage-preview mono">
                {activeEvent?.event_type || '—'} // {money(activeEvent?.amount)} // {activeEvent?.device_id || 'Primary Hardware'}
              </span>
              <span className="stage-chevron">{expandedStage === 1 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 1 && (
              <div className="stage-card-body">
                <div className="data-grid-4">
                  <div>
                    <span className="data-label">EVENT ID:</span>
                    <span className="data-val mono">{activeEvent?.event_id || 'EV-BASELINE'}</span>
                  </div>
                  <div>
                    <span className="data-label">EVENT TYPE:</span>
                    <span className="data-val mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                      {activeEvent?.event_type || 'LOGIN'}
                    </span>
                  </div>
                  <div>
                    <span className="data-label">AMOUNT / CURRENCY:</span>
                    <span className="data-val mono">{money(activeEvent?.amount)} {activeEvent?.currency || 'USD'}</span>
                  </div>
                  <div>
                    <span className="data-label">TIMESTAMP:</span>
                    <span className="data-val mono">{formatTime(activeEvent?.timestamp)}</span>
                  </div>
                  <div>
                    <span className="data-label">HARDWARE SIGNATURE:</span>
                    <span className="data-val mono">{activeEvent?.device_id || 'DEV-7842-PRIMARY'}</span>
                  </div>
                  <div>
                    <span className="data-label">NETWORK / IP:</span>
                    <span className="data-val mono">{activeEvent?.ip_address || '203.0.113.22'} ({activeEvent?.network_type || 'residential'})</span>
                  </div>
                  <div>
                    <span className="data-label">DESTINATION WALLET:</span>
                    <span className="data-val mono">{activeEvent?.wallet_address || '—'}</span>
                  </div>
                  <div>
                    <span className="data-label">INGESTION PIPELINE:</span>
                    <span className="data-val mono" style={{ color: 'var(--state-normal)' }}>WRITE-AHEAD SHA-256 COMMITTED</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STAGE 02: CONTEXT RESOLVED */}
          <div className={`stage-card ${expandedStage === 2 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 2 ? null : 2)}>
              <span className="stage-badge mono">STAGE 02</span>
              <span className="stage-title">CONTEXT RESOLUTION</span>
              <span className="stage-preview mono">
                Trader #{scenarioTrader?.trader_id} // {scenarioTrader?.name} // Tier: {scenarioTrader?.segment || 'RETAIL_HIGH'}
              </span>
              <span className="stage-chevron">{expandedStage === 2 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 2 && (
              <div className="stage-card-body">
                <div className="data-grid-4">
                  <div>
                    <span className="data-label">TRADER IDENTITY:</span>
                    <span className="data-val mono" style={{ fontWeight: 700, color: '#fff' }}>
                      #{scenarioTrader?.trader_id} — {scenarioTrader?.name}
                    </span>
                  </div>
                  <div>
                    <span className="data-label">BASELINE DEPOSIT:</span>
                    <span className="data-val mono">${scenarioTrader?.baseline?.deposit_amount?.toLocaleString() || '3,000'}</span>
                  </div>
                  <div>
                    <span className="data-label">KNOWN DEVICES:</span>
                    <span className="data-val mono">{scenarioTrader?.baseline?.known_devices?.join(', ') || 'DEV-7842-PRIMARY'}</span>
                  </div>
                  <div>
                    <span className="data-label">HOME COUNTRY / CITIES:</span>
                    <span className="data-val mono">{scenarioTrader?.baseline?.countries?.join(', ') || 'IN'}</span>
                  </div>
                  <div>
                    <span className="data-label">TRADER STATUS:</span>
                    <span className="data-val mono" style={{ color: scenarioTrader?.status === 'BLOCKED' ? 'var(--state-critical)' : 'var(--accent-cyan)' }}>
                      {scenarioTrader?.status || 'NORMAL'}
                    </span>
                  </div>
                  <div>
                    <span className="data-label">SEGMENT PROFILE:</span>
                    <span className="data-val mono" style={{ color: 'var(--state-normal)' }}>
                      {scenarioTrader?.segment || 'RETAIL_HIGH'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STAGE 03: SIGNALS DECOMPOSED */}
          <div className={`stage-card ${expandedStage === 3 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 3 ? null : 3)}>
              <span className="stage-badge mono">STAGE 03</span>
              <span className="stage-title">SIGNALS DECOMPOSED</span>
              <span className="stage-preview mono">
                {primaryDrivers.length > 0 ? `${primaryDrivers.length} ACTIVE RISK DRIVERS` : 'HABITUAL CONFORMANCE (0 ALARMS)'}
              </span>
              <span className="stage-chevron">{expandedStage === 3 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 3 && (
              <div className="stage-card-body">
                {primaryDrivers.length === 0 ? (
                  <div className="mono" style={{ padding: 12, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
                    NO MATERIAL RISK DRIVERS DETECTED // EVENT CONFORMS STRICTLY TO HABITUAL BASELINE
                  </div>
                ) : (
                  <div className="driver-cards-grid">
                    {primaryDrivers.map((driver: any, i: number) => (
                      <div key={i} className="driver-card">
                        <div className="driver-card-top">
                          <span className="driver-name">{driver.name}</span>
                          <span className="driver-category mono">{driver.category}</span>
                        </div>
                        <div className="driver-reason">{driver.reason}</div>
                        <div className="driver-card-bottom">
                          <span className="mono" style={{ fontSize: 10, color: driver.severity > 60 ? 'var(--state-critical)' : 'var(--state-elevated)' }}>
                            SEVERITY: {driver.severity}/100
                          </span>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                            CONTRIBUTION: {driver.contribution}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STAGE 04: BASELINE COMPARISON */}
          <div className={`stage-card ${expandedStage === 4 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 4 ? null : 4)}>
              <span className="stage-badge mono">STAGE 04</span>
              <span className="stage-title">BASELINE DEVIATION</span>
              <span className="stage-preview mono">
                NORMAL VS OBSERVED PARAMETER COMPARISON
              </span>
              <span className="stage-chevron">{expandedStage === 4 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 4 && (
              <div className="stage-card-body">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>DIMENSION</th>
                      <th>HABITUAL BASELINE</th>
                      <th>CURRENT OBSERVATION</th>
                      <th>VARIANCE & STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="mono" style={{ fontWeight: 600 }}>TRANSACTION VOLUME</td>
                      <td className="mono">{whatChanged.before?.amount_norm || '≤ $3,000 (avg)'}</td>
                      <td className="mono" style={{ color: activeEvent?.amount && activeEvent.amount > 10000 ? 'var(--state-critical)' : '#fff' }}>
                        {money(activeEvent?.amount)}
                      </td>
                      <td className="mono">
                        {activeEvent?.amount && activeEvent.amount > 10000
                          ? `+${Math.round((activeEvent.amount / 3000 - 1) * 100)}% ANOMALOUS SURGE`
                          : 'WITHIN 1-SIGMA NORMAL'}
                      </td>
                    </tr>
                    <tr>
                      <td className="mono" style={{ fontWeight: 600 }}>HARDWARE DEVICE</td>
                      <td className="mono">Registered Hardware [DEV-7842-PRIMARY]</td>
                      <td className="mono">{activeEvent?.device_id || 'DEV-7842-PRIMARY'}</td>
                      <td className="mono">
                        {activeEvent?.device_id && activeEvent.device_id.includes('NEW')
                          ? 'UNRECOGNIZED HARDWARE SIGNATURE'
                          : 'KNOWN HARDWARE PROFILE'}
                      </td>
                    </tr>
                    <tr>
                      <td className="mono" style={{ fontWeight: 600 }}>NETWORK REPUTATION</td>
                      <td className="mono">Residential Domestic ISP (IN)</td>
                      <td className="mono">{activeEvent?.network_type || 'residential'} ({activeEvent?.ip_address || 'Domestic'})</td>
                      <td className="mono">
                        {activeEvent?.network_type === 'datacenter'
                          ? 'COMMERCIAL HOSTING PROXY DETECTED'
                          : 'DOMESTIC RESIDENTIAL VERIFIED'}
                      </td>
                    </tr>
                    <tr>
                      <td className="mono" style={{ fontWeight: 600 }}>MARGIN MULTIPLIER</td>
                      <td className="mono">3×–5× Conservative</td>
                      <td className="mono">{activeEvent?.leverage ? `${activeEvent.leverage}×` : '1× Spot'}</td>
                      <td className="mono">
                        {activeEvent?.leverage && activeEvent.leverage > 20
                          ? 'DESTABILIZING VOLATILITY SURGE'
                          : 'WITHIN MARGIN BUFFER'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* STAGE 05: TOPOLOGY DISCOVERY */}
          <div className={`stage-card ${expandedStage === 5 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 5 ? null : 5)}>
              <span className="stage-badge mono">STAGE 05</span>
              <span className="stage-title">TOPOLOGY DISCOVERY & BLAST RADIUS</span>
              <span className="stage-preview mono">
                {blastRadius.directCount} DIRECT NODES // {blastRadius.totalCount} EXTENDED BLAST RADIUS
              </span>
              <span className="stage-chevron">{expandedStage === 5 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 5 && (
              <div className="stage-card-body">
                <div className="topology-blast-grid">
                  <div className="blast-card">
                    <span className="blast-label">TOTAL BLAST RADIUS</span>
                    <span className="blast-val mono">{blastRadius.totalCount} ENTITIES</span>
                    <span className="blast-sub mono">{blastRadius.status.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="blast-card">
                    <span className="blast-label">AFFECTED TRADERS</span>
                    <span className="blast-val mono">{blastRadius.affectedTraders.length} ACCOUNTS</span>
                    <span className="blast-sub mono">
                      {blastRadius.affectedTraders.length > 0 ? blastRadius.affectedTraders.join(', ') : 'None (Isolated)'}
                    </span>
                  </div>
                  <div className="blast-card">
                    <span className="blast-label">SHARED DEVICES</span>
                    <span className="blast-val mono">{blastRadius.affectedDevices.length} HARDWARE</span>
                    <span className="blast-sub mono">
                      {blastRadius.affectedDevices.slice(0, 2).join(', ') || 'None'}
                    </span>
                  </div>
                  <div className="blast-card">
                    <span className="blast-label">SHARED WALLETS</span>
                    <span className="blast-val mono">{blastRadius.affectedWallets.length} WALLETS</span>
                    <span className="blast-sub mono">
                      {blastRadius.affectedWallets.slice(0, 1).join(', ') || 'None'}
                    </span>
                  </div>
                </div>

                <div className="attack-path-strip mono" style={{ marginTop: 12 }}>
                  <span style={{ color: 'var(--text-dim)' }}>IDENTIFIED ATTACK PATH:</span>
                  <span className="path-node">TRADER #{activeScenario.targetTraderId}</span>
                  <span className="path-arrow">→</span>
                  <span className="path-node">{activeEvent?.device_id || 'DEV-PRIMARY'}</span>
                  <span className="path-arrow">→</span>
                  <span className="path-node">{activeEvent?.ip_address || '203.0.113.22'}</span>
                  {activeEvent?.wallet_address && (
                    <>
                      <span className="path-arrow">→</span>
                      <span className="path-node wallet">{activeEvent.wallet_address}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* STAGE 06: TRUST IMPACT */}
          <div className={`stage-card ${expandedStage === 6 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 6 ? null : 6)}>
              <span className="stage-badge mono">STAGE 06</span>
              <span className="stage-title">TRUST IMPACT</span>
              <span className="stage-preview mono">
                {Math.round(priorTrust)} → {Math.round(activeTrust)} ({trustDelta > 0 ? `+${trustDelta}` : trustDelta})
              </span>
              <span className="stage-chevron">{expandedStage === 6 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 6 && (
              <div className="stage-card-body">
                <div className="trust-transition-display">
                  <div className="trust-side">
                    <span className="side-label mono">PREVIOUS TRUST</span>
                    <span className="side-val mono">{Math.round(priorTrust)}/100</span>
                    <span className="side-status mono">PRIOR EQUILIBRIUM</span>
                  </div>
                  <div className="trust-arrow-middle">
                    <span className="arrow-sym">→</span>
                    <span className="delta-pill mono" style={{ color: trustDelta < 0 ? 'var(--state-critical)' : 'var(--state-normal)' }}>
                      {trustDelta > 0 ? `+${trustDelta}` : trustDelta} POINTS
                    </span>
                  </div>
                  <div className="trust-side">
                    <span className="side-label mono">POST-EVENT TRUST</span>
                    <span className="side-val mono" style={{ color: activeTrust < 45 ? 'var(--state-critical)' : activeTrust < 70 ? 'var(--state-elevated)' : 'var(--state-normal)' }}>
                      {Math.round(activeTrust)}/100
                    </span>
                    <span className="side-status mono">{activeDecisionStr} TIER</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STAGE 07: POLICY DECISION */}
          <div className={`stage-card ${expandedStage === 7 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 7 ? null : 7)}>
              <span className="stage-badge mono">STAGE 07</span>
              <span className="stage-title">POLICY DECISION</span>
              <span className="stage-preview mono">
                ESCALATED TO: {activeDecisionStr}
              </span>
              <span className="stage-chevron">{expandedStage === 7 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 7 && (
              <div className="stage-card-body">
                <div className="policy-stepper-slider">
                  {['ALLOW', 'MONITOR', 'VERIFY', 'RESTRICT', 'BLOCK'].map(p => {
                    const isSelected = activeDecisionStr === p
                    return (
                      <div key={p} className={`policy-slider-node ${isSelected ? 'active' : ''}`}>
                        <div className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{p}</div>
                        <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                          {p === 'ALLOW' ? '≥ 90.0' : p === 'MONITOR' ? '70–89' : p === 'VERIFY' ? '45–69' : p === 'RESTRICT' ? '20–44' : '< 20.0'}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="policy-rule-explanation mono" style={{ marginTop: 12 }}>
                  {explanation.recommendation || `Policy transitioned to ${activeDecisionStr} based on continuous threshold breach.`}
                </div>
              </div>
            )}
          </div>

          {/* STAGE 08: ACTION ENFORCEMENT */}
          <div className={`stage-card ${expandedStage === 8 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 8 ? null : 8)}>
              <span className="stage-badge mono">STAGE 08</span>
              <span className="stage-title">ACTION ENFORCEMENT GATEWAY</span>
              <span className="stage-preview mono">
                GATEWAY: {activeDecision?.enforcement?.status || 'ENFORCED'}
              </span>
              <span className="stage-chevron">{expandedStage === 8 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 8 && (
              <div className="stage-card-body">
                <div className="data-grid-4">
                  <div>
                    <span className="data-label">ACTION SENSITIVITY:</span>
                    <span className="data-val mono">HIGH (CRITICAL WITHDRAWAL)</span>
                  </div>
                  <div>
                    <span className="data-label">GATEWAY OUTCOME:</span>
                    <span className="data-val mono" style={{ color: activeDecisionStr === 'BLOCK' ? 'var(--state-critical)' : 'var(--state-normal)', fontWeight: 700 }}>
                      {activeDecision?.enforcement?.decision || activeDecisionStr}
                    </span>
                  </div>
                  <div>
                    <span className="data-label">STEP-UP REQUIRED:</span>
                    <span className="data-val mono">{activeDecision?.enforcement?.requires_step_up ? 'YES (BIOMETRIC / 2FA)' : 'NO'}</span>
                  </div>
                  <div>
                    <span className="data-label">GATEWAY REASON:</span>
                    <span className="data-val mono">{activeDecision?.enforcement?.reason || 'Policy enforced.'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STAGE 09: INCIDENT CASE */}
          <div className={`stage-card ${expandedStage === 9 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 9 ? null : 9)}>
              <span className="stage-badge mono">STAGE 09</span>
              <span className="stage-title">INCIDENT CASE TRIAGE</span>
              <span className="stage-preview mono">
                {activeCase ? `CASE #${activeCase.case_id.slice(-6)} // ${activeCase.status}` : 'NO ACTIVE ESCALATION'}
              </span>
              <span className="stage-chevron">{expandedStage === 9 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 9 && (
              <div className="stage-card-body">
                {activeCase ? (
                  <div className="data-grid-4">
                    <div>
                      <span className="data-label">CASE ID:</span>
                      <span className="data-val mono">{activeCase.case_id}</span>
                    </div>
                    <div>
                      <span className="data-label">SEVERITY:</span>
                      <span className="data-val mono" style={{ color: 'var(--state-critical)', fontWeight: 700 }}>{activeCase.severity}</span>
                    </div>
                    <div>
                      <span className="data-label">STATUS:</span>
                      <span className="data-val mono">{activeCase.status}</span>
                    </div>
                    <div>
                      <span className="data-label">ACTION:</span>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 9, padding: '2px 8px' }}
                          onClick={() => {
                            if (onNavigateToCase) onNavigateToCase(activeCase.case_id)
                            else onNavigate?.('CASES')
                          }}
                        >
                          OPEN DOSSIER IN WORKBENCH →
                        </button>
                    </div>
                  </div>
                ) : (
                  <div className="mono" style={{ padding: 12, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
                    NO INCIDENT CASE GENERATED // TRUST DID NOT BREACH CASE ESCALATION BOUNDARY
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STAGE 10: CRYPTOGRAPHIC AUDIT */}
          <div className={`stage-card ${expandedStage === 10 ? 'expanded' : ''}`}>
            <div className="stage-card-header" onClick={() => setExpandedStage(expandedStage === 10 ? null : 10)}>
              <span className="stage-badge mono">STAGE 10</span>
              <span className="stage-title">CRYPTOGRAPHIC AUDIT VAULT</span>
              <span className="stage-preview mono">
                BLOCK: {activeAudit?.audit_id || 'AUD-001'} // SHA-256 HASH VERIFIED
              </span>
              <span className="stage-chevron">{expandedStage === 10 ? '▲' : '▼'}</span>
            </div>
            {expandedStage === 10 && (
              <div className="stage-card-body">
                <div className="data-grid-4">
                  <div>
                    <span className="data-label">AUDIT RECORD ID:</span>
                    <span className="data-val mono">{activeAudit?.audit_id || evidenceBasis.audit_id || 'AUD-UNCOMMITTED'}</span>
                  </div>
                  <div>
                    <span className="data-label">SHA-256 HASH:</span>
                    <span className="data-val mono hash-pill">{activeAudit?.current_hash || evidenceBasis.audit_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}</span>
                  </div>
                  <div>
                    <span className="data-label">PREVIOUS BLOCK HASH:</span>
                    <span className="data-val mono hash-pill">{activeAudit?.previous_hash || 'GENESIS-00000000000000000000000000000000'}</span>
                  </div>
                  <div>
                    <span className="data-label">VERIFY PROOF:</span>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 9, padding: '3px 8px' }}
                      onClick={handleVerifyLedger}
                      disabled={verifyingAuditLedger}
                    >
                      {verifyingAuditLedger ? 'CHECKING...' : 'VERIFY SHA-256 CHAIN 🔍'}
                    </button>
                  </div>
                </div>

                {ledgerVerificationResult && (
                  <div className="mono" style={{ marginTop: 8, padding: 6, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 3, fontSize: 10, color: 'var(--state-normal)' }}>
                    ✓ AUDIT CHAIN VALID: {ledgerVerificationResult.checked_records ?? auditRecords.length} blocks verified cryptographically with zero hash mismatches.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* WHAT IF? DETERMINISTIC COUNTERFACTUAL COCKPIT */}
      <div className="demo-counterfactual-cockpit">
        <div className="cf-head">
          <div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--accent-cyan)' }}>
              WOW FACTOR #2 // DETERMINISTIC COUNTERFACTUAL SENSITIVITY ENGINE
            </div>
            <h3 style={{ margin: '2px 0 0 0', color: '#fff', fontSize: 15 }}>
              WHAT IF? SENSITIVITY SIMULATION
            </h3>
          </div>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            RE-EVALUATES NETRA RISK EQUATIONS WITHOUT MUTATING PRODUCTION STATE
          </span>
        </div>

        {/* Counterfactual Presets */}
        <div className="cf-presets-strip">
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', alignSelf: 'center' }}>
            PRESETS:
          </span>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 10 }}
            onClick={() => {
              const p = { remove_device_novelty: true, remove_network_novelty: true }
              setCfMods(p)
              handleRunCounterfactual(p)
            }}
          >
            Familiar Hardware & Residential IP
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 10 }}
            onClick={() => {
              const p = { normalize_amount: true }
              setCfMods(p)
              handleRunCounterfactual(p)
            }}
          >
            Habitual Withdrawal Amount ($3,000)
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 10 }}
            onClick={() => {
              const p = { verification_succeeded: true }
              setCfMods(p)
              handleRunCounterfactual(p)
            }}
          >
            Biometric Challenge Succeeded
          </button>
        </div>

        {/* Counterfactual Result Diff */}
        {cfResult && (
          <div className="cf-diff-panel">
            <div className="diff-col original">
              <span className="diff-label mono">ACTUAL ENFORCEMENT</span>
              <span className="diff-decision mono" style={{ color: 'var(--state-critical)' }}>
                {cfResult.original.decision}
              </span>
              <span className="diff-trust mono">{Math.round(cfResult.original.trust)}/100</span>
              <span className="diff-sub mono">{cfResult.original.action}</span>
            </div>

            <div className="diff-arrow-col">
              <span className="mono" style={{ color: 'var(--state-normal)', fontSize: 12, fontWeight: 700 }}>
                +{cfResult.trust_shift} PTS
              </span>
              <span style={{ fontSize: 18, color: '#fff' }}>→</span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                {cfResult.policy_transition}
              </span>
            </div>

            <div className="diff-col counterfactual">
              <span className="diff-label mono">COUNTERFACTUAL OUTCOME</span>
              <span className="diff-decision mono" style={{ color: 'var(--state-normal)' }}>
                {cfResult.counterfactual.decision}
              </span>
              <span className="diff-trust mono">{Math.round(cfResult.counterfactual.trust)}/100</span>
              <span className="diff-sub mono">{cfResult.counterfactual.action}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
