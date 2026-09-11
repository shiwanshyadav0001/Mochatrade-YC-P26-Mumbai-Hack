export type UserRole = 'ADMIN' | 'RISK_ANALYST' | 'INVESTIGATOR' | 'VIEWER'
export type StreamStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED' | 'ERROR'

export type Evidence = {
  id: string
  type: string
  label: string
}

export type RiskSignalItem = {
  category: string
  feature: string
  severity: number
  contribution?: number
  reason: string
  evidence?: Record<string, any>
  rule_code?: string
  source?: string
}

export type PrimaryDriver = {
  name: string
  category: string
  severity: number
  contribution?: number
  observed?: string
  baseline?: string
  deviation?: string
  direction?: 'negative' | 'positive' | 'neutral'
  reason: string
}

export type WhatChanged = {
  before: {
    trust: number
    policy: string
    device?: string
    amount_norm?: string
    velocity?: string
    topology?: string
  }
  event: {
    event_id: string
    event_type: string
    amount?: number
    device_id?: string
    ip_address?: string
    network_type?: string
  }
  after: {
    trust: number
    trust_delta: number
    policy: string
    action: string
    risk_level: string
  }
}

export type EvidenceBasis = {
  event_id: string
  trader_id: string
  decision_id?: string
  case_id?: string
  audit_id?: string
  audit_hash?: string
}

export type CounterfactualModifications = {
  remove_device_novelty?: boolean
  remove_network_novelty?: boolean
  normalize_amount?: boolean
  normalize_leverage?: boolean
  remove_velocity?: boolean
  remove_topology_linkage?: boolean
  verification_succeeded?: boolean
}

export type CounterfactualResult = {
  trader_id: string
  original: {
    trust: number
    trust_delta: number
    decision: string
    action: string
    risk_score?: number
    signals?: RiskSignalItem[]
  }
  counterfactual: {
    trust: number
    trust_delta: number
    decision: string
    action: string
    risk_score?: number
    signals?: RiskSignalItem[]
  }
  trust_shift: number
  policy_transition: string
  mitigated_signals: RiskSignalItem[]
  modifications_applied: CounterfactualModifications
  simulation_type: string
  methodological_note: string
}

export type Decision = {
  decision_id: string
  timestamp: string
  event_id?: string
  audit_id?: string
  audit_hash?: string
  case_id?: string
  trader_id: string
  action: string
  decision: string
  trust_score: number
  previous_score?: number
  risk_level: string
  confidence: string
  triggered_rules: string[]
  processing_latency_ms: number
  policy_version: string
  explanation?: {
    summary?: string
    top_factors?: string[]
    recommendation?: string
    evidence?: Evidence[]
    signals?: RiskSignalItem[]
    primary_drivers?: PrimaryDriver[]
    what_changed?: WhatChanged
    evidence_basis?: EvidenceBasis
  }
  signals?: RiskSignalItem[]
  enforcement?: ActionEvaluationResult
  amount?: number
  device_id?: string
  ip_address?: string
  wallet_address?: string
  source?: string
}

export type Transition = {
  transition_id: string
  timestamp: string
  event_id: string
  event_type: string
  previous_score: number
  new_score: number
  delta: number
  reason: string
  evidence: Evidence[]
}

export type Event = {
  event_id: string
  timestamp: string
  trader_id: string
  event_type: string
  amount?: number
  currency?: string
  asset?: string
  leverage?: number
  device_id?: string
  ip_address?: string
  country?: string
  city?: string
  asn?: string
  network_type?: string
  wallet_address?: string
  source: string
  risk_relevance: string
  context?: Record<string, any>
  metadata?: Record<string, any>
  audit_id?: string
  audit_hash?: string
}

export type Trader = {
  trader_id: string
  name: string
  segment: string
  trust_score: number
  initial_trust?: number
  status: string
  last_decision: string
  event_count: number
  relationship_summary: string
  open_case_count?: number
  anomaly_score?: number | null
  last_activity?: string
  cases?: Case[]
  anomaly?: any
  baseline?: {
    deposit_amount?: number
    leverage?: number
    countries?: string[]
    cities?: string[]
    known_devices?: string[]
    normal_login_hours?: number[]
    known_wallets?: string[]
    transaction_velocity_per_hour?: number
  }
  risk_dimensions?: Record<string, number>
  session_risk_state?: string
  failed_verifications?: number
  pending_recovery?: any
  timeline?: Transition[]
  recent_events?: Event[]
}

export type Case = {
  case_id: string
  trader_id: string
  severity: string
  trust_score: number
  status: 'OPEN' | 'INVESTIGATING' | 'ESCALATED' | 'RESOLVED' | 'FALSE_POSITIVE'
  created_at: string
  updated_at: string
  assigned_to: string
  reason: string
  decision: string
  evidence: Evidence[]
  notes: { timestamp: string; author: string; text: string }[]
  resolution?: string
}

export type GraphNode = {
  id: string
  label: string
  type: string
  risk: number
  is_cluster?: boolean
}

export type GraphEdge = {
  source: string
  target: string
  type: string
  evidence: string[]
  strength?: number
}

export type GraphCluster = {
  cluster_id: string
  affected_traders: string[]
  cluster_type: string
  confidence: number
  explanation: string
  shared_entities: string[]
  risk_level: string
  edges: GraphEdge[]
}

export type Graph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  summary: string
  has_cluster?: boolean
  clusters?: GraphCluster[]
}

export type RiskEventSignal = {
  category: string
  feature: string
  severity: number
  contribution: number
  reason: string
  rule_code: string
}

export type RiskEventItem = {
  risk_id?: string
  event_id: string
  trader_id: string
  timestamp: string
  event_type: string
  feature?: string
  category?: string
  severity?: number
  reason?: string
  evidence?: Record<string, any>
  rule_code?: string
  decision_impact?: string
  resulting_trust?: number
  source?: string
  // Backward-compatibility aliases
  signals?: RiskEventSignal[]
  contextual_risk?: number
  decision?: string
  trust_after?: number
}

export type OperationalMetrics = {
  total_traders: number
  trusted_traders: number
  monitored_traders: number
  restricted_traders: number
  blocked_traders: number
  open_cases: number
  active_risk_events: number
  graph_clusters_detected: number
  enforcement_counts: Record<string, number>
}

export type Analytics = {
  summary: {
    active_high_risk: number
    average_trust: number
    critical_events: number
    high_risk_withdrawals: number
    open_cases: number
    suspicious_clusters: number
  }
  operational_metrics?: OperationalMetrics
  trust_distribution: { band: string; count: number }[]
  decision_distribution: { decision: string; count: number }[]
  latency_metrics?: {
    p50_ms: number
    p95_ms: number
    average_ms: number
    hardware_profile: string
  }
  demo_metrics: {
    precision: number
    recall: number
    false_positive_rate: number
    detection_rate: number
    average_decision_latency_ms: number
    label: string
  }
  recent_decisions: Decision[]
  top_rules: [string, number][]
}

export type Policy = {
  version: string
  weights: Record<string, number>
  action_sensitivity: Record<string, number>
  velocity_thresholds: Record<string, number>
  trust_bands: Record<string, number>
}

export type PolicySimulationResult = {
  evaluated_events: number
  current_distribution: Record<string, number>
  simulated_distribution: Record<string, number>
  total_divergences: number
  divergences: {
    decision_id: string
    trader_id: string
    action: string
    trust_score: number
    current: string
    simulated: string
  }[]
  estimated_latency_delta_ms: number
}

export type SearchResult = {
  traders: { trader_id: string; name: string; trust_score: number; status: string }[]
  events: { event_id: string; trader_id: string; event_type: string; timestamp: string }[]
  cases: { case_id: string; trader_id: string; status: string; reason: string }[]
}

export type AuditRecord = {
  audit_id: string
  timestamp: string
  actor: string
  event: string
  subject: string
  reason: string
  policy_version: string
  details?: Record<string, any>
  previous_hash?: string
  current_hash?: string
}

export type AuditVerifyResult = {
  valid: boolean
  total_records?: number
  checked_records: number
  genesis_hash?: string
  latest_hash?: string
  head_hash?: string
  message?: string
  first_invalid_record?: Record<string, any>
  reason?: string
}

export type ActionEvaluationResult = {
  trader_id: string
  action: string
  decision: string
  allowed: boolean
  trust_score: number
  reason: string
  policy_version: string
  evidence: any[]
  status?: string
  requires_step_up?: boolean
  session_risk_state?: string
  restriction_status?: string
  active_protocols?: string[]
}

export type ObservatoryOperationalState =
  | 'HIGH_ALERT'
  | 'RESTRICTED'
  | 'PROTOCOL_ACTIVE'
  | 'PROTOCOL_PENDING'
  | 'RECOVERY'
  | 'MONITORING'
  | 'RESOLVED'

export type ObservatoryRecord = {
  trader_id: string
  name: string
  segment: string
  trust_score: number
  initial_trust: number
  status: string
  session_id: string
  session_risk_state: string
  operational_state: ObservatoryOperationalState
  active_protocols: string[]
  protocol_details: SecurityProtocol[]
  active_anomalies: any[]
  failed_verifications: number
  last_decision: string
  last_event_at?: string
  last_event_type?: string
  device_id?: string
  ip_address?: string
  network_type?: string
  country?: string
  wallet_address?: string
  open_case_id?: string | null
  open_case_severity?: string | null
  shared_clusters_count: number
  relationship_summary: string
  risk_dimensions: Record<string, number>
  pending_recovery: boolean
  requires_step_up: boolean
}

export type SecurityProtocol = {
  protocol_id: string
  name: string
  description: string
  trigger_conditions: string
  applicable_categories: string[]
  min_risk_level: string
  target_actions: string[]
  required_response: string
  enforcement_action: string
  escalation_behavior: string
  failure_behavior: string
  recovery_behavior: string
  status: string
  active_triggers_count?: number
  affected_traders?: {
    trader_id: string
    name: string
    trust_score: number
    operational_state: string
    session_risk_state: string
  }[]
}

export type RecoveryRequestResponse = {
  trader_id: string
  session_id: string
  recovery_id: string
  channel: string
  masked_contact: string
  status: string
  instructions: string
  demo_code: string
}

export type RecoveryVerifyResponse = {
  trader_id: string
  session_id: string
  verified: boolean
  status: string
  previous_trust: number
  new_trust: number
  decision: string
  session_risk_state: string
  transition?: any
  message: string
}
