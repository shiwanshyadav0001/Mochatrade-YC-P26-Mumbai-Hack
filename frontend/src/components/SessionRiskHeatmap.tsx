import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { SessionRiskHeatmapPoint } from '../types'

interface SessionRiskHeatmapProps {
  traderId: string
  points?: SessionRiskHeatmapPoint[]
  onSelectPoint?: (point: SessionRiskHeatmapPoint) => void
  onNavigateToEvent?: (eventId: string, traderId: string) => void
  compact?: boolean
}

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'
const formatDate = (value?: string) =>
  value ? new Date(value).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'

function trustToColor(trust: number): { bg: string; border: string; text: string } {
  if (trust >= 90) return { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.45)', text: 'var(--state-normal)' }
  if (trust >= 70) return { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)', text: 'var(--state-normal)' }
  if (trust >= 45) return { bg: 'rgba(245,158,11,0.16)', border: 'rgba(245,158,11,0.45)', text: 'var(--state-elevated)' }
  if (trust >= 20) return { bg: 'rgba(239,68,68,0.16)', border: 'rgba(239,68,68,0.45)', text: 'var(--state-high)' }
  return { bg: 'rgba(239,68,68,0.26)', border: 'rgba(239,68,68,0.65)', text: 'var(--state-critical)' }
}

function heatIntensity(trust: number): number {
  // 0-100 risk intensity inverse trust, for height scaling
  return Math.round(100 - trust)
}

export function SessionRiskHeatmap({ traderId, points: externalPoints, onSelectPoint, onNavigateToEvent, compact = false }: SessionRiskHeatmapProps) {
  const [internalPoints, setInternalPoints] = useState<SessionRiskHeatmapPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const points = externalPoints ?? internalPoints
  const activePoint = useMemo(() => {
    if (selectedIndex !== null && points[selectedIndex]) return points[selectedIndex]
    if (hoverIndex !== null && points[hoverIndex]) return points[hoverIndex]
    return points.length ? points[points.length - 1] : null
  }, [points, selectedIndex, hoverIndex])

  useEffect(() => {
    if (externalPoints) return
    if (!traderId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api.get<SessionRiskHeatmapPoint[]>(`/traders/${traderId}/heatmap?limit=50`)
      .then(data => {
        if (!cancelled) {
          setInternalPoints(data)
          setSelectedIndex(null)
          setHoverIndex(null)
        }
      })
      .catch(err => {
        if (!cancelled) setError(err?.detail || err?.message || 'Failed to load heatmap')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [traderId, externalPoints])

  if (loading) {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>Loading session risk heatmap for #{traderId}…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--state-critical)' }}>Heatmap error: {error}</div>
      </div>
    )
  }

  if (!points.length) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h3>Session Risk Heatmap</h3>
          <span className="panel-meta">TRADER #{traderId} • DETERMINISTIC TIMELINE</span>
        </div>
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }} className="mono">
          No session transitions recorded yet. Normal trading will populate the heatmap deterministically from NETRA engine transitions.
        </div>
      </div>
    )
  }

  const trustTrend = points.length >= 2 ? points[points.length - 1].trust_score - points[0].trust_score : 0
  const degradedCount = points.filter(p => p.risk_level === 'HIGH' || p.risk_level === 'CRITICAL').length
  const majorCount = points.filter(p => p.is_major_transition).length

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Session Risk Heatmap
            <span className="status-pill" style={{ fontSize: 8, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.3)' }}>{points.length} POINTS</span>
          </h3>
          <span className="panel-meta">TRADER #{traderId} • TIME → TRUST INTENSITY • DETERMINISTIC FROM ENGINE TRANSITIONS</span>
        </div>
        <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'right' }}>
          <div>TREND: <span style={{ color: trustTrend < 0 ? 'var(--state-critical)' : trustTrend > 0 ? 'var(--state-normal)' : 'var(--text-dim)', fontWeight: 700 }}>{trustTrend > 0 ? '+' : ''}{trustTrend.toFixed(1)}</span></div>
          <div>DEGRADED: {degradedCount} • MAJOR: {majorCount}</div>
        </div>
      </div>

      <div style={{ padding: compact ? '12px' : '16px' }}>
        {/* LEGEND */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700 }}>HEAT BANDS:</span>
          {[
            { label: 'NORMAL ≥90', color: 'rgba(16,185,129,0.45)' },
            { label: 'GUARDED 70-90', color: 'rgba(16,185,129,0.30)' },
            { label: 'ELEVATED 45-70', color: 'rgba(245,158,11,0.45)' },
            { label: 'HIGH 20-45', color: 'rgba(239,68,68,0.45)' },
            { label: 'CRITICAL <20', color: 'rgba(239,68,68,0.65)' },
          ].map(b => (
            <span key={b.label} className="mono" style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: `1px solid ${b.color}`, background: b.color.replace('0.45','0.15').replace('0.65','0.18').replace('0.30','0.10'), color: '#cbd5e1' }}>{b.label}</span>
          ))}
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 8 }}>⬢ = major transition • hover for context</span>
        </div>

        {/* HEATMAP GRID */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'end', overflowX: 'auto', paddingBottom: 8, minHeight: compact ? 90 : 120 }}>
          {points.map((p, idx) => {
            const col = trustToColor(p.trust_score)
            const intensity = heatIntensity(p.trust_score)
            const height = compact ? 42 + (intensity * 0.48) : 56 + (intensity * 0.64)
            const isSelected = selectedIndex === idx
            const isHovered = hoverIndex === idx
            const isMajor = p.is_major_transition
            return (
              <div
                key={`${p.event_id}-${idx}`}
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onClick={() => {
                  setSelectedIndex(idx)
                  onSelectPoint?.(p)
                  if (onNavigateToEvent) {
                    // do not auto-navigate on click to avoid disrupting demo; user can use details button
                  }
                }}
                title={`${p.event_type} @ ${formatDate(p.timestamp)} • Trust ${p.trust_score} (Δ ${p.delta > 0 ? '+' : ''}${p.delta}) • ${p.decision}`}
                style={{
                  flex: '1 1 0',
                  minWidth: points.length > 20 ? 18 : points.length > 12 ? 28 : 48,
                  maxWidth: 64,
                  height: height,
                  background: col.bg,
                  border: `1px solid ${isSelected ? '#60a5fa' : isHovered ? '#94a3b8' : col.border}`,
                  borderTop: isMajor ? `3px solid ${col.text}` : `1px solid ${col.border}`,
                  borderRadius: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 2px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 0 0 2px rgba(96,165,250,0.35)' : isMajor ? '0 2px 8px rgba(0,0,0,0.25)' : 'none',
                  position: 'relative',
                }}
              >
                {isMajor && <span style={{ position: 'absolute', top: -6, right: -4, fontSize: 9, lineHeight: 1 }}>⬢</span>}
                <span className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', fontWeight: 700 }}>{String(idx + 1).padStart(2, '0')}</span>
                <span className="mono" style={{ fontSize: compact ? 10 : 11, fontWeight: 800, color: col.text }}>{Math.round(p.trust_score)}</span>
                <span className="mono" style={{ fontSize: 7, color: p.delta < 0 ? 'var(--state-critical)' : p.delta > 0 ? 'var(--state-normal)' : 'var(--text-dim)' }}>{p.delta > 0 ? `+${p.delta}` : p.delta}</span>
                <span className="mono" style={{ fontSize: 6, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{p.event_type.slice(0, 8)}</span>
              </div>
            )
          })}
        </div>

        {/* TIMELINE AXIS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '0 2px' }}>
          <span className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>{formatDate(points[0].timestamp)}</span>
          <span className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>SESSION PROGRESSION →</span>
          <span className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>{formatDate(points[points.length - 1].timestamp)}</span>
        </div>

        {/* ACTIVE DETAIL CARD */}
        {activePoint && (
          <div style={{
            marginTop: 16,
            padding: '12px 14px',
            background: 'var(--bg-surface-0)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-xs)',
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : '1.2fr 1fr',
            gap: 14,
            alignItems: 'start',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700 }}>POINT {String(activePoint.index + 1).padStart(2, '0')} • {formatTime(activePoint.timestamp)}</span>
                <span className={`status-pill ${activePoint.risk_level.toLowerCase()}`} style={{ fontSize: 9 }}>{activePoint.risk_level}</span>
                <span className={`status-pill ${activePoint.decision.toLowerCase()}`} style={{ fontSize: 9 }}>{activePoint.decision}</span>
                {activePoint.is_major_transition && <span className="status-pill critical" style={{ fontSize: 8, background: 'rgba(239,68,68,0.15)' }}>MAJOR TRANSITION</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>TRUST SCORE</div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: trustToColor(activePoint.trust_score).text }}>{activePoint.trust_score.toFixed(1)} <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>/ 100</span> <span style={{ fontSize: 10, color: activePoint.delta < 0 ? 'var(--state-critical)' : activePoint.delta > 0 ? 'var(--state-normal)' : 'var(--text-dim)' }}>({activePoint.delta > 0 ? '+' : ''}{activePoint.delta})</span></div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>prev {activePoint.previous_score.toFixed(1)} → risk {activePoint.risk_intensity.toFixed(0)}/100</div>
                </div>
                <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>EVENT / ACTION</div>
                  <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{activePoint.event_type} • {activePoint.action}</div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>{activePoint.event_id} • {activePoint.session_id}</div>
                </div>
                <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>SESSION STATE</div>
                  <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: activePoint.session_risk_state.includes('RESTRICTED') || activePoint.session_risk_state.includes('TERMINATED') ? 'var(--state-critical)' : '#e2e8f0' }}>{activePoint.session_risk_state}</div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>band {activePoint.heat_band}</div>
                </div>
                <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>PROTOCOL / STEP-UP</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                    {activePoint.active_protocols.length ? activePoint.active_protocols.map(pid => (
                      <span key={pid} className="mono" style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: pid==='P-03'?'rgba(239,68,68,0.18)':pid==='P-02'?'rgba(245,158,11,0.16)':'rgba(59,130,246,0.15)', border: '1px solid var(--border-subtle)', color: pid==='P-03'?'var(--state-critical)':pid==='P-02'?'var(--state-high)':'#60a5fa' }}>{pid}</span>
                    )) : <span className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>NONE</span>}
                    {activePoint.requires_step_up && <span className="mono" style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--state-elevated)' }}>STEP-UP</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {onNavigateToEvent && (
                  <button className="btn btn-secondary" style={{ fontSize: 9, padding: '3px 8px' }} onClick={() => onNavigateToEvent(activePoint.event_id, traderId)}>VIEW EVENT →</button>
                )}
                <span className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', alignSelf: 'center' }}>{formatDate(activePoint.timestamp)}</span>
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 4 }}>WHY RISK CHANGED</div>
              {activePoint.primary_signal ? (
                <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-subtle)', borderRadius: 3, borderLeft: `3px solid ${activePoint.primary_signal.severity > 60 ? 'var(--state-critical)' : activePoint.primary_signal.severity > 30 ? 'var(--state-high)' : 'var(--state-normal)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{activePoint.primary_signal.category} • {activePoint.primary_signal.feature}</span>
                    <span className="mono" style={{ fontSize: 9, color: activePoint.primary_signal.severity > 60 ? 'var(--state-critical)' : 'var(--state-high)' }}>{activePoint.primary_signal.severity}/100</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{activePoint.primary_signal.reason}</div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 4 }}>{activePoint.primary_signal.rule_code || 'SIGNAL'}</div>
                </div>
              ) : (
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', padding: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: 3, border: '1px solid var(--border-subtle)' }}>Baseline conforming — no major signals. Trust stable.</div>
              )}
              {activePoint.signals.length > 1 && (
                <div style={{ marginTop: 6 }}>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 3 }}>OTHER SIGNALS ({activePoint.signal_count}):</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {activePoint.signals.slice(1, 3).map((s, i) => (
                      <div key={i} className="mono" style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '3px 6px', background: 'rgba(0,0,0,0.12)', borderRadius: 2, border: '1px solid var(--border-subtle)' }}>{s.category} → {s.reason.slice(0, 78)}</div>
                    ))}
                  </div>
                </div>
              )}
              {activePoint.evidence.length > 0 && (
                <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 6 }}>Evidence: {activePoint.evidence.map(e => e.label || e.id).join(' • ').slice(0, 110)}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
