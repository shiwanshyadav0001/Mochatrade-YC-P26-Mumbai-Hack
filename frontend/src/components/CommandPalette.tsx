import React, { useEffect, useMemo, useState } from 'react'
import type { Trader } from '../types'

type CommandItem = {
  id: string
  title: string
  category: 'NAVIGATION' | 'SCENARIOS' | 'TRADERS' | 'ACTIONS'
  action: () => void
  badge?: string
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (view: any) => void
  onSelectTrader: (traderId: string) => void
  onRunScenario: (scenario: string, mode?: string) => void
  onResetDemo: () => void
  traders: Trader[]
}

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onSelectTrader,
  onRunScenario,
  onResetDemo,
  traders,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) onClose()
        else setQuery('')
      }
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const items: CommandItem[] = useMemo(() => {
    const baseItems: CommandItem[] = [
      { id: 'nav-overview', title: 'OVERVIEW // Institutional Telemetry Dashboard', category: 'NAVIGATION', action: () => onNavigate('OVERVIEW') },
      { id: 'nav-live', title: 'LIVE MONITOR // Streaming Event Ingestion Feed', category: 'NAVIGATION', action: () => onNavigate('LIVE MONITOR'), badge: 'LIVE' },
      { id: 'nav-traders', title: 'TRADERS // Individual Baselines & Historical Profiles', category: 'NAVIGATION', action: () => onNavigate('TRADERS') },
      { id: 'nav-risk-events', title: 'RISK EVENTS // Contextual Threat Incident Feed', category: 'NAVIGATION', action: () => onNavigate('RISK EVENTS'), badge: 'EVENTS' },
      { id: 'nav-graph', title: 'TOPOLOGY // Multi-Hop Infrastructure Link Graph', category: 'NAVIGATION', action: () => onNavigate('RELATIONSHIP GRAPH'), badge: 'GRAPH' },
      { id: 'nav-cases', title: 'CASES // Investigation Triage Queue', category: 'NAVIGATION', action: () => onNavigate('CASES') },
      { id: 'nav-policy', title: 'POLICIES // Parameter Matrix & Pre-Commit Simulator', category: 'NAVIGATION', action: () => onNavigate('POLICIES') },
      { id: 'nav-sim', title: 'SCENARIO LAB // Executable Threat Vectors', category: 'NAVIGATION', action: () => onNavigate('SIMULATOR') },
      { id: 'nav-audit', title: 'AUDIT VAULT // Tamper-Evident Immutable Log', category: 'NAVIGATION', action: () => onNavigate('AUDIT') },
      { id: 'nav-analytics', title: 'ANALYTICS // Risk Engine Metrics & Evaluation Latency', category: 'NAVIGATION', action: () => onNavigate('ANALYTICS') },

      { id: 'act-flagship', title: 'EXECUTE // Flagship Suspicious Withdrawal Surge (#7842)', category: 'SCENARIOS', action: () => onRunScenario('FLAGSHIP', 'FAST'), badge: 'ATTACK' },
      { id: 'act-travel', title: 'EXECUTE // Legitimate Cross-Border Travel (#7842)', category: 'SCENARIOS', action: () => onRunScenario('TRAVEL', 'NORMAL') },
      { id: 'act-ring', title: 'EXECUTE // Collusive Multi-Account Fraud Ring (#7102-#7105)', category: 'SCENARIOS', action: () => onRunScenario('FRAUD_RING', 'NORMAL') },
      { id: 'act-takeover', title: 'EXECUTE // Hostile Account Takeover Surge (#7842)', category: 'SCENARIOS', action: () => onRunScenario('TAKEOVER', 'NORMAL') },
      { id: 'act-reset', title: 'SYSTEM // Re-seed SQLite Persistent Baseline', category: 'ACTIONS', action: onResetDemo, badge: 'RESET' },
    ]

    const traderItems: CommandItem[] = traders.map(t => ({
      id: `trader-${t.trader_id}`,
      title: `TRADER #${t.trader_id} — ${t.name} [${t.segment}]`,
      category: 'TRADERS',
      action: () => {
        onSelectTrader(t.trader_id)
        onNavigate('TRADERS')
      },
      badge: `${Math.round(t.trust_score)}/100`,
    }))

    const all = [...baseItems, ...traderItems]
    if (!query.trim()) return all

    const q = query.toLowerCase()
    return all.filter(
      item => item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || item.badge?.toLowerCase().includes(q)
    )
  }, [onNavigate, onRunScenario, onResetDemo, onSelectTrader, traders, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % Math.max(1, items.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + items.length) % Math.max(1, items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[selectedIndex]) {
        items[selectedIndex].action()
        onClose()
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div className="cmd-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cmd-input-bar">
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>&gt;</span>
          <input
            autoFocus
            type="text"
            placeholder="Search operational commands, entity IDs, or views... [ESC to cancel]"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="cmd-items-list">
          {items.length === 0 ? (
            <div style={{ padding: '16px', color: 'var(--text-muted)', textAlign: 'center', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              NO MATCHING COMMANDS FOUND FOR &quot;{query}&quot;
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                className={`cmd-row ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  item.action()
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div>
                  <div className="cmd-row-title">{item.title}</div>
                  <div className="cmd-row-category">{item.category}</div>
                </div>
                {item.badge && (
                  <span className="status-pill guarded">{item.badge}</span>
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '8px 14px', background: 'var(--bg-deep)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
          <span>UP/DOWN to navigate</span>
          <span>ENTER to select</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  )
}
