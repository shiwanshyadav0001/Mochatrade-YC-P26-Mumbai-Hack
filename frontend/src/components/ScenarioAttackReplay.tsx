import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { soundManager } from '../audio'
import type { Decision, Event, Graph, Trader } from '../types'
import { InteractiveGraph } from './InteractiveGraph'
import { ReasoningEvidenceChain } from './ReasoningEvidenceChain'

export type ScenarioCode =
  | 'FLAGSHIP'
  | 'ATTACK_SURGE'
  | 'TRAVEL'
  | 'FRAUD_RING'
  | 'TAKEOVER'
  | 'NORMAL_ACTIVITY'
  | 'LEVERAGE_SPIKE'
  | 'HIGH_VALUE'

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
    title: 'Rapid Suspicious Withdrawal Attack',
    targetTraderId: '7842',
    targetTraderName: 'Maya Chen',
    severityTag: 'CRITICAL',
    summary:
      'Compounding attack kill chain: New Device → Datacenter IP → $25,000 Liquidity Injection → 50× Leverage Escalation → Capital Exfiltration to Fresh Wallet.',
    thesis:
      'NETRA continuously correlates hardware novelty, network classification, financial volume surges, and leverage anomalies to intercept an automated capital drain before execution.',
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
        title: 'Abnormal Liquidity Injection',
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
        baselineComparison: '$2,800 vs habitual baseline $3,000 (0.93×). Financial dimension is calm.',
        expectedOutcome: 'ALLOW // Baseline Behavioral Continuity (~88.0)',
        severity: 'NORMAL',
      },
      {
        step: 3,
        event_type: 'TRADE',
        title: 'Standard Execution Pattern',
        telemetry: '$1,200 ETH Execution // 3× Conservative Leverage',
        detail: 'Normal trading volume and low margin multiplier confirm legitimate operator continuity.',
        baselineComparison: 'Risk dimensions remain within standard tolerances. Zero false-positive intervention.',
        expectedOutcome: 'ALLOW // Full Account Mobility Maintained (~86.0)',
        severity: 'NORMAL',
      },
    ],
  },
  FRAUD_RING: {
    code: 'FRAUD_RING',
    title: 'Collusive Multi-Account Syndicate Sweep',
    targetTraderId: '7102',
    targetTraderName: 'Kavita Reddy',
    severityTag: 'HIGH',
    summary:
      'Coordinated syndicate sweep: Four ostensible strangers simultaneously withdraw $9,800 to identical wallets from shared proxy hardware.',
    thesis:
      'Graph intelligence traverses shared device identifiers, IP subnets, and destination wallets to isolate hidden collusive clusters and enforce collective lockdown.',
    steps: [
      {
        step: 1,
        event_type: 'WITHDRAWAL',
        title: 'Node #7102 Syndicate Extraction',
        telemetry: '$9,800 USD → WALLET-RING-X // Hardware DEV-RING-X',
        detail: 'Initial withdrawal from ring node #7102 to destination wallet.',
        baselineComparison: 'High amount near $10k reporting limit. Graph seed established.',
        expectedOutcome: 'MONITOR // Surveillance Active (~68.0)',
        severity: 'MONITOR',
      },
      {
        step: 2,
        event_type: 'WITHDRAWAL',
        title: 'Node #7103 Infrastructure Reuse',
        telemetry: '$9,800 USD → WALLET-RING-X // Hardware DEV-RING-X',
        detail: 'Second account executes withdrawal from IDENTICAL hardware to IDENTICAL wallet address.',
        baselineComparison: 'Direct 1-hop graph bridge formed between #7102 and #7103.',
        expectedOutcome: 'VERIFY // Ring Cluster Detected (~48.0)',
        severity: 'HIGH',
      },
      {
        step: 3,
        event_type: 'WITHDRAWAL',
        title: 'Node #7104 Multi-Hop Convergence',
        telemetry: '$9,800 USD → WALLET-RING-X // Hardware DEV-RING-X',
        detail: 'Third account converges on identical infrastructure. Graph confidence exceeds 90%.',
        baselineComparison: '3-node clique confirmed. Multi-account collusion probability 0.94.',
        expectedOutcome: 'RESTRICT // Cluster-Wide Withdrawal Hold (~34.0)',
        severity: 'HIGH',
      },
      {
        step: 4,
        event_type: 'WITHDRAWAL',
        title: 'Node #7105 Syndicate Lockdown',
        telemetry: '$9,800 USD → WALLET-RING-X // Hardware DEV-RING-X',
        detail: 'Fourth synchronized extraction triggers global cluster quarantine across all 4 nodes.',
        baselineComparison: 'Full syndicate topology mapped. Collective trust collapse to critical.',
        expectedOutcome: 'BLOCK // Coordinated Syndicate Quarantine (~18.0)',
        severity: 'CRITICAL',
      },
    ],
  },
  TAKEOVER: {
    code: 'TAKEOVER',
    title: 'Hostile Account Takeover Surge',
    targetTraderId: '7842',
    targetTraderName: 'Maya Chen',
    severityTag: 'ELEVATED',
    summary:
      'Defense stripping attack: Adversary logs in from unknown hardware and systematically invalidates defenses: Password → 2FA → API Key.',
    thesis:
      'Rapid sequence correlation identifies credential and authorization modification patterns that precede balance exfiltration, stepping up biometric authentication before losses occur.',
    steps: [
      {
        step: 1,
        event_type: 'NEW_DEVICE',
        title: 'Perimeter Hardware Intrusion',
        telemetry: 'Device DEV-ATO // Datacenter Subnet',
        detail: 'First session detected on hostile device profile via datacenter connection.',
        baselineComparison: 'Device novelty + Datacenter ASN. Identity dimension elevated.',
        expectedOutcome: 'MONITOR // Surveillance Initiated (~88.0)',
        severity: 'MONITOR',
      },
      {
        step: 2,
        event_type: 'PASSWORD_CHANGE',
        title: 'Credential Invalidation Surge',
        telemetry: 'Password Reset via Datacenter Subnet',
        detail: 'Account password modified immediately following novel hardware intrusion.',
        baselineComparison: 'Credential change from unverified device violates baseline protocol.',
        expectedOutcome: 'MONITOR // Credential Risk Flagged (~68.0)',
        severity: 'ELEVATED',
      },
      {
        step: 3,
        event_type: '2FA_CHANGE',
        title: 'Defense Neutralization Attempt',
        telemetry: 'Two-Factor Authentication Reset Attempted',
        detail: 'Adversary attempts to disable or rotate 2FA authenticator device.',
        baselineComparison: 'Compounding credential stripping kill chain pattern detected.',
        expectedOutcome: 'VERIFY // Biometric Re-Authentication Enforced (~44.0)',
        severity: 'HIGH',
      },
      {
        step: 4,
        event_type: 'API_KEY_CHANGE',
        title: 'Programmatic Exfiltration Preparation',
        telemetry: 'Trading & Withdrawal API Key Generated',
        detail: 'Adversary generates programmatic access keys for automated bot-assisted drain.',
        baselineComparison: 'Takeover sequence 100% complete. Immediate containment required.',
        expectedOutcome: 'BLOCK // Account Quarantined & Keys Revoked (~20.0)',
        severity: 'CRITICAL',
      },
    ],
  },
  ATTACK_SURGE: {
    code: 'ATTACK_SURGE',
    title: 'Compounding Anomaly Kill Chain Surge',
    targetTraderId: '7842',
    targetTraderName: 'Maya Chen',
    severityTag: 'CRITICAL',
    summary:
      'Compounding intrusion sequence: Unrecognized Datacenter Hardware → Immediate Password Invalidation → 80× Leverage Spike → $35,000 Hostile Balance Exfiltration.',
    thesis:
      'NETRA correlates hardware novelty, credential modification velocity, and destabilizing leverage to enforce an immediate automated capital lockdown and case escalation before exfiltration.',
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
        title: 'Credential Invalidation Surge',
        telemetry: 'Password Reset via Datacenter Subnet 198.18.0.21',
        detail: 'Account password changed immediately following unauthorized hardware introduction.',
        baselineComparison: 'Credential change from unverified hardware violates habitual security profile.',
        expectedOutcome: 'VERIFY // Credential Anomaly Spike (~58.0)',
        severity: 'HIGH',
      },
      {
        step: 3,
        event_type: 'LEVERAGE_CHANGE',
        title: 'Destabilizing Leverage Escalation',
        telemetry: '80× Maximum Margin Multiplier on SOL',
        detail: 'Margin multiplied to 80×, exposing account equity to catastrophic liquidation risk.',
        baselineComparison: '16× above habitual max leverage (5×). Extreme velocity and volatility deviation.',
        expectedOutcome: 'RESTRICT // Margin Capability Constrained (~32.0)',
        severity: 'HIGH',
      },
      {
        step: 4,
        event_type: 'WITHDRAWAL',
        title: 'Hostile Balance Drain Exfiltration',
        telemetry: '$35,000 USD to Destination WALLET-SURGE-DRAIN',
        detail: 'Attempted rapid withdrawal to fresh destination wallet completes compounding attack sequence.',
        baselineComparison: 'Kill chain completed. Continuous trust score collapses below critical lockdown threshold.',
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
        telemetry: '$1,000 BTC Execution // 3× Leverage',
        detail: 'Trade volume and margin multiplier align strictly with historical trading behaviour.',
        baselineComparison: 'Within standard deviation across all 10 risk dimensions. Zero friction.',
        expectedOutcome: 'ALLOW // Optimal Execution State (~94.0)',
        severity: 'NORMAL',
      },
    ],
  },
  LEVERAGE_SPIKE: {
    code: 'LEVERAGE_SPIKE',
    title: 'Speculative Leverage Anomaly',
    targetTraderId: '7002',
    targetTraderName: 'Liam Vance',
    severityTag: 'HIGH',
    summary:
      'Speculative volatility surge: Traveler logs in from US, multiplies leverage to 75× on volatile SOL, and executes large position.',
    thesis:
      'NETRA flags out-of-band leverage escalation before market volatility causes catastrophic liquidation losses.',
    steps: [
      {
        step: 1,
        event_type: 'LOGIN',
        title: 'US Travel Session',
        telemetry: 'New York, US (198.51.100.12) // Device DEV-7002-TRAVEL',
        detail: 'User authenticates from known travel laptop during verified business travel.',
        baselineComparison: 'Known secondary device. Geographical transition registered.',
        expectedOutcome: 'ALLOW // Travel Context Recognized (~90.0)',
        severity: 'MONITOR',
      },
      {
        step: 2,
        event_type: 'LEVERAGE_CHANGE',
        title: 'Margin Multiplier Surge',
        telemetry: '75× Maximum Margin on SOL',
        detail: 'Trader multiplies margin to 75× on volatile asset, far exceeding account baseline.',
        baselineComparison: '15× above habitual leverage (5×). Risk profile heavily distorted.',
        expectedOutcome: 'VERIFY // Margin Restriction Enforced (~54.0)',
        severity: 'HIGH',
      },
      {
        step: 3,
        event_type: 'TRADE',
        title: 'High-Margin Altcoin Position',
        telemetry: '$35,000 SOL Speculative Margin Position',
        detail: 'High nominal exposure with 75× multiplier triggers automated risk mitigation.',
        baselineComparison: 'Capital exposure exceeds portfolio risk threshold. Step-up required.',
        expectedOutcome: 'RESTRICT // Execution Gated by Policy (~36.0)',
        severity: 'HIGH',
      },
    ],
  },
  HIGH_VALUE: {
    code: 'HIGH_VALUE',
    title: 'Institutional Whale Deployment',
    targetTraderId: '7003',
    targetTraderName: 'Elena Rostova',
    severityTag: 'NORMAL',
    summary:
      'Institutional scale liquidity: $150,000 wire deposit followed by $120,000 conservative BTC execution.',
    thesis:
      'NETRA avoids false positives on large nominal sums by referencing verified institutional tier baselines.',
    steps: [
      {
        step: 1,
        event_type: 'LOGIN',
        title: 'Institutional Terminal Login',
        telemetry: 'London, GB (198.51.100.33) // DEV-7003-INSTITUTIONAL',
        detail: 'Trader connects from dedicated institutional corporate terminal in London.',
        baselineComparison: 'Matches registered institutional network ASN and hardware key.',
        expectedOutcome: 'ALLOW // Institutional Baseline Confirmed (~96.0)',
        severity: 'NORMAL',
      },
      {
        step: 2,
        event_type: 'DEPOSIT',
        title: 'High-Value Corporate Wire',
        telemetry: '$150,000 USD Institutional Liquidity Wire',
        detail: 'Substantial liquidity injection proportional to institutional account tier ($50,000 baseline).',
        baselineComparison: 'Institutional tier authorized for 6-figure liquidity injections.',
        expectedOutcome: 'ALLOW // Corporate Liquidity Approved (~95.0)',
        severity: 'NORMAL',
      },
      {
        step: 3,
        event_type: 'TRADE',
        title: 'Institutional Execution',
        telemetry: '$120,000 BTC Execution // 2× Conservative Leverage',
        detail: 'Large-scale spot execution with low margin multiplier maintains healthy liquidity buffer.',
        baselineComparison: 'Conservative leverage confirms disciplined institutional capital deployment.',
        expectedOutcome: 'ALLOW // Full Institutional Continuity (~94.5)',
        severity: 'NORMAL',
      },
    ],
  },
}

interface ScenarioAttackReplayProps {
  trader?: Trader
  allTraders: Trader[]
  decisions: Decision[]
  latestDecision?: Decision
  events: Event[]
  graph?: Graph
  onInspectEvidence?: (decision?: Decision, event?: Event, trader?: Trader) => void
  onInspectTrader?: (trader: Trader) => void
  onSelectTrader?: (traderId: string) => void
  onNavigate?: (view: any) => void
  onStepUpVerify?: (traderId: string) => void
  onCreateCase?: (traderId: string, reason: string) => void
  onRefreshAll: () => Promise<void>
  onNavigateToAudit?: (auditId?: string, subject?: string) => void
  onNavigateToEvent?: (eventId: string, traderId: string) => void
}

export function ScenarioAttackReplay({
  trader,
  allTraders,
  decisions,
  latestDecision,
  events,
  graph,
  onInspectEvidence,
  onInspectTrader,
  onSelectTrader,
  onNavigate,
  onStepUpVerify,
  onCreateCase,
  onRefreshAll,
  onNavigateToAudit,
  onNavigateToEvent,
}: ScenarioAttackReplayProps) {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioCode>('FLAGSHIP')
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [playSpeed, setPlaySpeed] = useState<'NORMAL' | 'FAST'>('NORMAL')
  const [isStepping, setIsStepping] = useState<boolean>(false)
  const [stepHistory, setStepHistory] = useState<any[]>([])
  const [replayNotice, setReplayNotice] = useState<string>('')

  const activeScenario = SCENARIOS[selectedScenario]
  const totalSteps = activeScenario.steps.length
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Find targeted trader object
  const scenarioTrader = useMemo(() => {
    return allTraders.find(t => t.trader_id === activeScenario.targetTraderId) || trader
  }, [allTraders, activeScenario.targetTraderId, trader])

  const targetTraderDisplayName = scenarioTrader?.name || activeScenario.targetTraderName

  // Current recorded step outcome (if stepped)
  const activeStepResult = useMemo(() => {
    if (currentStepIndex === 0) return null
    return stepHistory[currentStepIndex - 1] || null
  }, [currentStepIndex, stepHistory])

  // Stop auto-play on unmount or scenario switch
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Switch scenario handler: reset stepper cleanly and focus target trader
  const handleSelectScenario = async (code: ScenarioCode) => {
    if (isPlaying) {
      setIsPlaying(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
    setSelectedScenario(code)
    setCurrentStepIndex(0)
    setStepHistory([])
    setReplayNotice(`LOADED SCENARIO: ${SCENARIOS[code].title}`)
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

  // Execute ONE step forward
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

      setReplayNotice(
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
      setReplayNotice(err.message || 'Step execution failed.')
      setIsPlaying(false)
      return false
    } finally {
      setIsStepping(false)
    }
  }, [currentStepIndex, totalSteps, selectedScenario, onRefreshAll, onSelectTrader])

  // Step Backward (safely replays N-1 steps from clean reset)
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
        setReplayNotice('RESET TO BASELINE PROFILE (STEP 0)')
        await onRefreshAll()
        return
      }

      // Re-advance to targetStep
      const newHistory: any[] = []
      for (let i = 0; i < targetStep; i++) {
        const res = await api.send<any>('POST', '/simulator/step', { scenario: selectedScenario })
        newHistory.push(res)
      }
      setStepHistory(newHistory)
      setCurrentStepIndex(targetStep)
      setReplayNotice(`ROLLED BACK TO STEP ${targetStep}/${totalSteps}`)
      await onRefreshAll()
    } catch (err: any) {
      setReplayNotice(err.message || 'Rollback failed.')
    } finally {
      setIsStepping(false)
    }
  }

  // Reset Scenario
  const handleReset = async () => {
    setIsPlaying(false)
    if (timerRef.current) clearInterval(timerRef.current)
    setIsStepping(true)
    try {
      soundManager.playSuccess()
      await api.send('POST', '/simulator/reset')
      setCurrentStepIndex(0)
      setStepHistory([])
      setReplayNotice('SCENARIO RESET: Initial Trader Habitual Baseline Restored')
      await onRefreshAll()
    } catch (err: any) {
      setReplayNotice(err.message || 'Reset failed.')
    } finally {
      setIsStepping(false)
    }
  }

  // Jump to specific step (1-indexed)
  const handleJumpToStep = async (targetStep: number) => {
    if (isStepping || targetStep === currentStepIndex) return
    setIsPlaying(false)
    if (timerRef.current) clearInterval(timerRef.current)

    setIsStepping(true)
    try {
      soundManager.playEventTick()
      if (targetStep < currentStepIndex) {
        // Rollback: reset and replay up to targetStep
        await api.send('POST', '/simulator/reset')
        const newHistory: any[] = []
        for (let i = 0; i < targetStep; i++) {
          const res = await api.send<any>('POST', '/simulator/step', { scenario: selectedScenario })
          newHistory.push(res)
        }
        setStepHistory(newHistory)
        setCurrentStepIndex(targetStep)
      } else {
        // Forward: step remainder
        const stepsToTake = targetStep - currentStepIndex
        const newHistory = [...stepHistory]
        for (let i = 0; i < stepsToTake; i++) {
          const res = await api.send<any>('POST', '/simulator/step', { scenario: selectedScenario })
          newHistory.push(res)
        }
        setStepHistory(newHistory)
        setCurrentStepIndex(targetStep)
      }
      setReplayNotice(`JUMPED TO STEP ${targetStep}/${totalSteps}`)
      await onRefreshAll()
    } catch (err: any) {
      setReplayNotice(err.message || 'Jump failed.')
    } finally {
      setIsStepping(false)
    }
  }

  // Auto-play timer effect
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = playSpeed === 'FAST' ? 650 : 1400
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

  // Trust score & policy calculations for active step
  const activeTrust = activeStepResult?.trust_score ?? activeStepResult?.decision?.trust_score ?? scenarioTrader?.trust_score ?? 94.0
  const priorTrust = activeStepResult?.decision?.previous_score ?? 94.0
  const trustDelta = activeStepResult?.transition?.delta ?? (currentStepIndex === 0 ? 0 : roundNumber(activeTrust - priorTrust))
  const activeDecisionStr = activeStepResult?.decision?.decision ?? scenarioTrader?.last_decision ?? 'ALLOW'

  return (
    <div className="scenario-lab-container">
      {/* 1. SCENARIO SELECTOR RIBBON */}
      <div className="scenario-selector-ribbon">
        <div className="scenario-tab-group">
          {(Object.keys(SCENARIOS) as ScenarioCode[]).map(code => {
            const sc = SCENARIOS[code]
            const icon =
              code === 'FLAGSHIP'
                ? '⚡'
                : code === 'ATTACK_SURGE'
                ? '💥'
                : code === 'TRAVEL'
                ? '✈'
                : code === 'FRAUD_RING'
                ? '🕸'
                : code === 'TAKEOVER'
                ? '🔑'
                : code === 'NORMAL_ACTIVITY'
                ? '🛡'
                : code === 'LEVERAGE_SPIKE'
                ? '📈'
                : '🐋'
            return (
              <button
                key={code}
                className={`scenario-tab-btn ${selectedScenario === code ? 'active' : ''}`}
                onClick={() => handleSelectScenario(code)}
              >
                <span>{icon}</span>
                <span>{sc.title}</span>
                <span className={`priority-pill priority-${sc.severityTag.toLowerCase()}`}>
                  {sc.severityTag}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>TARGET:</span>
          <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>
            #{activeScenario.targetTraderId} {targetTraderDisplayName}
          </span>
        </div>
      </div>

      {/* 2. SCENARIO NARRATIVE & THESIS BANNER */}
      <div className="scenario-narrative-banner">
        <div>
          <div className="narrative-headline">
            <span>SCENARIO INTEL // {activeScenario.title.toUpperCase()}</span>
            <span className={`priority-pill priority-${activeScenario.severityTag.toLowerCase()}`}>
              TARGET TRADER #{activeScenario.targetTraderId}
            </span>
          </div>
          <div className="narrative-summary">{activeScenario.summary}</div>
          <div className="narrative-summary" style={{ color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 4 }}>
            <b>Thesis:</b> {activeScenario.thesis}
          </div>
        </div>

        {replayNotice && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--accent-cyan)', background: 'var(--bg-surface-0)', padding: '4px 8px', borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
            {replayNotice}
          </div>
        )}
      </div>

      {/* 3. ATTACK PROGRESSION TIMELINE STEPPER */}
      <div className="attack-stepper-card">
        <div className="stepper-header">
          <div>
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
              ATTACK VECTOR STEPPER // {totalSteps} EVENT PROGRESSION
            </span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 8 }}>
              {currentStepIndex === 0 ? 'BASELINE READY (NOT STARTED)' : `AT STEP ${currentStepIndex} OF ${totalSteps}`}
            </span>
          </div>
          <div className="step-indicator-text mono">
            {currentStepIndex === totalSteps ? (
              <span style={{ color: 'var(--state-critical)' }}>KILL CHAIN COMPLETE</span>
            ) : (
              `${totalSteps - currentStepIndex} STEPS REMAINING`
            )}
          </div>
        </div>

        {/* Stepper Node Grid */}
        <div className="stepper-track">
          {activeScenario.steps.map((stepDef, idx) => {
            const stepNum = idx + 1
            const isCompleted = stepNum < currentStepIndex
            const isActive = stepNum === currentStepIndex
            const isPending = stepNum > currentStepIndex

            const stepData = stepHistory[idx]
            const recordedScore = stepData?.trust_score ?? stepData?.decision?.trust_score
            const recordedDelta = stepData?.transition?.delta
            const recordedDecision = stepData?.decision?.decision

            return (
              <div
                key={stepDef.step}
                className={`stepper-node ${isCompleted ? 'node-completed' : ''} ${isActive ? 'node-active' : ''} ${isPending ? 'node-pending' : ''}`}
                onClick={() => handleJumpToStep(stepNum)}
                title={`Click to jump to Step ${stepNum}`}
              >
                <div>
                  <div className="node-step-index">
                    <span>STEP 0{stepNum}</span>
                    <span>
                      {isCompleted ? '✓ DONE' : isActive ? '● ACTIVE' : '○ PENDING'}
                    </span>
                  </div>

                  <div className="node-event-type">
                    {stepDef.event_type.replace(/_/g, ' ')}
                  </div>

                  <div className="node-telemetry" title={stepDef.telemetry}>
                    {stepDef.title}
                  </div>
                </div>

                <div className="node-trust-badge">
                  {isCompleted || isActive ? (
                    <>
                      <span style={{ fontWeight: 700, color: recordedScore < 45 ? 'var(--state-critical)' : recordedScore < 70 ? 'var(--state-elevated)' : 'var(--state-normal)' }}>
                        {recordedScore !== undefined ? `${Math.round(recordedScore)}/100` : '—'}
                      </span>
                      <span style={{ fontSize: 9, color: recordedDelta < 0 ? 'var(--state-critical)' : 'var(--text-dim)' }}>
                        {recordedDelta !== undefined ? `${recordedDelta > 0 ? '+' : ''}${recordedDelta}` : ''}
                      </span>
                      <span className={`priority-pill priority-${(recordedDecision || stepDef.severity).toLowerCase()}`} style={{ fontSize: 8 }}>
                        {recordedDecision || stepDef.severity}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                      EXPECTED: {stepDef.expectedOutcome.split(' ')[0]}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Playback Control Bar */}
        <div className="stepper-control-bar">
          <div className="control-btn-group">
            <button
              className="ctrl-btn"
              disabled={currentStepIndex <= 0 || isStepping}
              onClick={handlePrevStep}
              title="Roll back to previous event checkpoint"
            >
              ⏮ PREVIOUS
            </button>

            <button
              className={`ctrl-btn ${isPlaying ? 'ctrl-play' : ''}`}
              disabled={isStepping}
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
              title="Autonomous step-by-step attack playback"
            >
              {isPlaying ? '⏸ PAUSE PLAYBACK' : '▶ AUTO-PLAY'}
            </button>

            <button
              className="ctrl-btn"
              disabled={currentStepIndex >= totalSteps || isStepping}
              onClick={() => executeStepForward()}
              title="Advance one event forward in the sequence"
            >
              {isStepping ? 'STEPPING...' : '⏭ NEXT STEP'}
            </button>

            <button
              className="ctrl-btn"
              disabled={isStepping}
              onClick={handleReset}
              title="Reset scenario and clean baseline"
            >
              ↺ RESET
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>PLAYBACK SPEED:</span>
              <button
                className={`ctrl-btn ${playSpeed === 'NORMAL' ? 'ctrl-play' : ''}`}
                style={{ padding: '2px 8px', fontSize: 9 }}
                onClick={() => setPlaySpeed('NORMAL')}
              >
                1.4s NORMAL
              </button>
              <button
                className={`ctrl-btn ${playSpeed === 'FAST' ? 'ctrl-play' : ''}`}
                style={{ padding: '2px 8px', fontSize: 9 }}
                onClick={() => setPlaySpeed('FAST')}
              >
                0.6s FAST
              </button>
            </div>

            <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
              STEP {currentStepIndex} OF {totalSteps}
            </div>
          </div>
        </div>
      </div>

      {/* 4. ACTIVE STEP CAUSAL INTELLIGENCE & DECISION GRID */}
      <div className="grid-12">
        {/* LEFT COLUMN: Active Step Behavioral Dossier & Causal Reasoning Chain */}
        <div className="col-7">
          {/* Active Step Behavioral Dossier */}
          <div className="replay-step-dossier">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
              <div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  ACTIVE EVENT TELEMETRY & BEHAVIORAL DOSSIER
                </span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>
                  {currentStepIndex === 0
                    ? 'HABITUAL CLEAN BASELINE // PRIOR TO THREAT EXECUTION'
                    : `STEP 0${currentStepIndex}: ${activeScenario.steps[currentStepIndex - 1]?.title || 'Event'}`}
                </div>
              </div>

              {currentStepIndex > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '3px 8px', fontSize: 10 }}
                    onClick={() => {
                      const matchedEvent = activeStepResult?.event || events.find(e => e.trader_id === activeScenario.targetTraderId)
                      const matchedDecision = activeStepResult?.decision || latestDecision
                      onInspectEvidence?.(matchedDecision, matchedEvent, scenarioTrader)
                    }}
                  >
                    INSPECT FORENSICS →
                  </button>

                  {(activeStepResult?.decision?.audit_id || activeStepResult?.event?.audit_id) && onNavigateToAudit && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 8px', fontSize: 10, color: 'var(--accent-cyan)' }}
                      onClick={() => onNavigateToAudit(activeStepResult?.decision?.audit_id || activeStepResult?.event?.audit_id, activeScenario.targetTraderId)}
                      title="Inspect exact audit record in Cryptographic Audit Vault"
                    >
                      AUDIT VAULT →
                    </button>
                  )}

                  {activeStepResult?.event?.event_id && onNavigateToEvent && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 8px', fontSize: 10, color: 'var(--accent-amber)' }}
                      onClick={() => onNavigateToEvent(activeStepResult.event.event_id, activeScenario.targetTraderId)}
                      title="Inspect event in Live Telemetry Monitor"
                    >
                      LIVE MONITOR →
                    </button>
                  )}
                </div>
              )}
            </div>

            {currentStepIndex === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <div className="mono" style={{ fontSize: 12, color: 'var(--state-normal)', fontWeight: 600 }}>
                  BASELINE INTACT — 100% OPERATIONAL TRUST (94.0/100)
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, maxWidth: 500, marginInline: 'auto' }}>
                  Trader #{activeScenario.targetTraderId} ({targetTraderDisplayName}) has established a clean 90-day baseline with habitual deposit $3,000, 5× max leverage, domestic IP, and registered primary hardware. Click <b>NEXT STEP</b> or <b>AUTO-PLAY</b> to begin the attack replay.
                </div>
              </div>
            ) : (
              <>
                <div className="dossier-grid">
                  <div className="dossier-cell">
                    <span className="dossier-cell-label">EVENT TYPE & SOURCE</span>
                    <div className="dossier-cell-val mono">
                      {activeScenario.steps[currentStepIndex - 1]?.event_type} ({activeStepResult?.event?.source || 'SIMULATED'})
                    </div>
                  </div>

                  <div className="dossier-cell">
                    <span className="dossier-cell-label">TELEMETRY CONTEXT</span>
                    <div className="dossier-cell-val mono" style={{ fontSize: 10 }}>
                      {activeScenario.steps[currentStepIndex - 1]?.telemetry}
                    </div>
                  </div>

                  <div className="dossier-cell">
                    <span className="dossier-cell-label">BASELINE COMPARISON</span>
                    <div className="dossier-cell-val" style={{ fontSize: 10, color: '#fbbf24' }}>
                      {activeScenario.steps[currentStepIndex - 1]?.baselineComparison}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-surface-0)', borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>ANALYST SUMMARY &amp; ACTION PROVENANCE:</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 8.5, padding: '2px 7px', color: 'var(--accent-cyan)' }}
                        onClick={() => {
                          const matchedEvent = activeStepResult?.event || events.find(e => e.trader_id === activeScenario.targetTraderId)
                          const matchedDecision = activeStepResult?.decision || latestDecision
                          onInspectEvidence?.(matchedDecision, matchedEvent, scenarioTrader)
                        }}
                        title="Open complete forensic evidence dossier"
                      >
                        INSPECT FORENSICS →
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 8.5, padding: '2px 7px', color: 'var(--accent-cobalt)' }}
                        onClick={() => {
                          if (activeStepResult?.event?.event_id && onNavigateToEvent) {
                            onNavigateToEvent(activeStepResult.event.event_id, activeScenario.targetTraderId)
                          } else if (onNavigate) {
                            onNavigate('LIVE MONITOR')
                          }
                        }}
                        title="Jump to live event stream in Live Telemetry Monitor"
                      >
                        LIVE MONITOR →
                      </button>
                      {(activeStepResult?.decision?.audit_id || activeStepResult?.audit_record?.audit_id) && onNavigateToAudit && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 8.5, padding: '2px 7px', color: 'var(--accent-cyan)' }}
                          onClick={() => {
                            const aid = activeStepResult?.decision?.audit_id || activeStepResult?.audit_record?.audit_id
                            onNavigateToAudit(aid, activeScenario.targetTraderId)
                          }}
                          title="Verify cryptographic SHA-256 ledger proof"
                        >
                          AUDIT VAULT →
                        </button>
                      )}
                      {(activeStepResult?.decision?.case_id || (activeStepResult as any)?.case?.case_id) && onNavigate && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 8.5, padding: '2px 7px', color: 'var(--accent-amber)' }}
                          onClick={() => onNavigate('CASES')}
                          title="Open escalated incident case"
                        >
                          VIEW IN CASES →
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {activeStepResult?.explanation?.summary || activeScenario.steps[currentStepIndex - 1]?.detail}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Causal Reasoning Evidence Chain */}
          <div style={{ marginTop: 12 }}>
            <ReasoningEvidenceChain
              trader={scenarioTrader}
              decision={activeStepResult?.decision || latestDecision}
              latestEvent={activeStepResult?.event || events.find(e => e.trader_id === activeScenario.targetTraderId)}
              graph={graph}
              onInspectEvidence={() => {
                const matchedEvent = activeStepResult?.event || events.find(e => e.trader_id === activeScenario.targetTraderId)
                const matchedDecision = activeStepResult?.decision || latestDecision
                onInspectEvidence?.(matchedDecision, matchedEvent, scenarioTrader)
              }}
              onOpenTopology={() => onNavigate?.('RELATIONSHIP GRAPH')}
              onNavigateToAudit={onNavigateToAudit}
              onNavigateToCase={() => onNavigate?.('CASES')}
              onNavigateToEvent={onNavigateToEvent}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: Continuous Trust Gauge & Decision Enforcement Panel */}
        <div className="col-5">
          {/* Trust Score Trajectory Card */}
          <div className="live-focus-card">
            <div className="live-focus-header">
              <div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  CONTINUOUS TRUST IMPACT GAUGE
                </span>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 2 }}>
                  Trader #{activeScenario.targetTraderId} // {targetTraderDisplayName}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  className="mono"
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color:
                      activeTrust >= 80
                        ? 'var(--state-normal)'
                        : activeTrust < 25
                        ? 'var(--state-critical)'
                        : activeTrust < 50
                        ? '#fb923c'
                        : 'var(--state-elevated)',
                  }}
                >
                  {Math.round(activeTrust)}
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>/100</span>
                </div>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>CURRENT TRUST</span>
              </div>
            </div>

            <div className="live-focus-body">
              <div className="live-focus-row">
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>PREVIOUS SCORE:</span>
                <span className="mono" style={{ fontSize: 11, color: '#fff' }}>
                  {Math.round(priorTrust)}/100
                </span>
              </div>

              <div className="live-focus-row">
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>SCORE DELTA:</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: trustDelta < 0 ? 'var(--state-critical)' : trustDelta > 0 ? 'var(--state-normal)' : 'var(--text-dim)',
                  }}
                >
                  {trustDelta > 0 ? `+${trustDelta}` : trustDelta}
                </span>
              </div>

              <div className="live-focus-row">
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>ACTIVE POLICY ENFORCEMENT:</span>
                <span className={`priority-pill priority-${activeDecisionStr.toLowerCase()}`}>
                  {activeDecisionStr}
                </span>
              </div>

              {/* Policy Threshold Status Indicator */}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>POLICY THRESHOLD STATUS</span>
                  <span className="mono" style={{ fontSize: 9, color: activeTrust < 20 ? 'var(--state-critical)' : activeTrust < 45 ? 'var(--state-elevated)' : 'var(--state-normal)' }}>
                    {activeTrust < 15
                      ? '● BREACHED: AUTO-BLOCK (<15)'
                      : activeTrust < 20
                      ? '▲ BREACHED: RESTRICT (<20)'
                      : activeTrust < 45
                      ? '▲ BREACHED: STEP-UP VERIFY (<45)'
                      : activeTrust < 70
                      ? '● GUARDED: MONITOR (<70)'
                      : '✓ NORMAL STANDING (>70)'}
                  </span>
                </div>

                {/* Progress bar visual */}
                <div style={{ height: 6, background: 'var(--bg-surface-0)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, activeTrust))}%`,
                      background:
                        activeTrust >= 80
                          ? 'var(--state-normal)'
                          : activeTrust < 25
                          ? 'var(--state-critical)'
                          : activeTrust < 50
                          ? '#fb923c'
                          : 'var(--state-elevated)',
                      transition: 'all 240ms ease',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Decision Panel with Action Sensitivity */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="panel-header">
              <h3>Real-Time Policy Enforcement State</h3>
              <span className={`priority-pill priority-${activeDecisionStr.toLowerCase()}`}>
                {activeDecisionStr}
              </span>
            </div>

            <div style={{ padding: 12 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
                WHAT DOES NETRA ENFORCE RIGHT NOW?
              </div>

              <div style={{ fontSize: 12, color: '#fff', marginBottom: 12 }}>
                {activeDecisionStr === 'BLOCK'
                  ? 'All trading, withdrawal, and session privileges are strictly frozen. Automatic investigation case dispatched to compliance queue.'
                  : activeDecisionStr === 'RESTRICT'
                  ? 'High-risk actions (withdrawals, leverage surges) are blocked. Standard defensive order modification permitted.'
                  : activeDecisionStr === 'VERIFY'
                  ? 'Step-Up Biometric 2FA challenge dispatched to primary hardware before action execution.'
                  : activeDecisionStr === 'MONITOR'
                  ? 'Transactions permitted under elevated telemetry sampling and continuous temporal sequence tracking.'
                  : 'Normal operations authorized. Action matches behavioral baseline and verified identity profile.'}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 10 }}
                  onClick={() => onStepUpVerify?.(activeScenario.targetTraderId)}
                >
                  DISPATCH STEP-UP
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 10 }}
                  onClick={() =>
                    onCreateCase?.(
                      activeScenario.targetTraderId,
                      `Scenario Replay escalated threat: ${activeScenario.title}`
                    )
                  }
                >
                  OPEN INVESTIGATION CASE
                </button>
              </div>
            </div>
          </div>

          {/* Live Topology Context Preview */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="panel-header">
              <h3>Live Topology Relationship Context</h3>
              <span className="panel-meta">{graph?.nodes.length ?? 0} NODES</span>
            </div>
            <div style={{ height: 220 }}>
              <InteractiveGraph graph={graph} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function roundNumber(num: number): number {
  return Math.round(num * 10) / 10
}
