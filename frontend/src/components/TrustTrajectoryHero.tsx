import React, { useEffect, useRef, useState } from 'react'
import type { Trader, Transition } from '../types'

interface TrustTrajectoryHeroProps {
  trader?: Trader
}

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'

const money = (val?: number) =>
  val !== undefined
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
    : '—'

export function TrustTrajectoryHero({ trader }: TrustTrajectoryHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = true
    video.playsInline = true
    const attemptPlay = () => {
      const p = video.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
    attemptPlay()
    const onCanPlay = () => attemptPlay()
    const onVisibilityChange = () => { if (document.visibilityState === 'visible' && video.paused) attemptPlay() }
    const onInteraction = () => { if (video.paused) attemptPlay() }
    video.addEventListener('canplay', onCanPlay)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('click', onInteraction, { once: true })
    window.addEventListener('touchstart', onInteraction, { once: true })
    window.addEventListener('keydown', onInteraction, { once: true })
    return () => {
      video.removeEventListener('canplay', onCanPlay)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('click', onInteraction)
      window.removeEventListener('touchstart', onInteraction)
      window.removeEventListener('keydown', onInteraction)
    }
  }, [])

  const [hoveredPoint, setHoveredPoint] = useState<{
    index: number
    label: string
    score: number
    delta?: number
    reason?: string
    timestamp?: string
    x: number
    y: number
  } | null>(null)

  const baselineScore = trader?.initial_trust ?? 94
  const timeline: Transition[] = trader?.timeline || []
  const hasHistory = timeline.length > 0

  // Points starting with baseline, followed by chronological transitions
  const chartPoints = [
    {
      label: 'BASELINE',
      score: baselineScore,
      delta: 0,
      reason: 'Individual habitual baseline established',
      timestamp: trader?.last_activity,
      event_type: 'INITIAL_BASELINE',
    },
    ...timeline.map(t => ({
      label: t.event_type.replace(/_/g, ' '),
      score: t.new_score,
      delta: t.delta,
      reason: t.reason || 'Telemetry state transition',
      timestamp: t.timestamp,
      event_type: t.event_type,
    })),
  ]

  const width = 720
  const height = 180
  const padLeft = 40
  const padRight = 95
  const padTop = 26
  const padBottom = 28
  const plotWidth = width - padLeft - padRight
  const plotHeight = height - padTop - padBottom

  const getY = (score: number) => padTop + (100 - Math.max(0, Math.min(100, score))) * (plotHeight / 100)
  const getX = (index: number) =>
    chartPoints.length === 1
      ? padLeft + plotWidth / 2
      : padLeft + index * (plotWidth / (chartPoints.length - 1))

  const coords = chartPoints.map((pt, idx) => ({
    ...pt,
    x: getX(idx),
    y: getY(pt.score),
  }))

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const areaPath = coords.length > 1
    ? `${linePath} L ${coords[coords.length - 1].x} ${padTop + plotHeight} L ${coords[0].x} ${padTop + plotHeight} Z`
    : ''

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#10b981' // ALLOW
    if (score >= 70) return '#0284c7' // MONITOR
    if (score >= 45) return '#d97706' // VERIFY
    if (score >= 20) return '#ea580c' // RESTRICT
    return '#dc2626' // BLOCK
  }

  const currentScore = Math.round(chartPoints[chartPoints.length - 1].score)
  const netDelta = Math.round(currentScore - baselineScore)

  return (
    <div className="hero-chart-container">
      {/* Chart Meta Header */}
      <div className="hero-chart-header">
        <div className="chart-header-left">
          <span className="mono chart-badge">ANALYTICAL TRAJECTORY ENGINE</span>
          <span className="chart-subject">
            TRADER #{trader?.trader_id ?? '7842'} // {trader?.name ?? 'Target'}
          </span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            ({trader?.segment ?? 'RETAIL_HIGH'} SEGMENT)
          </span>
        </div>
        <div className="chart-header-right mono">
          <span className="chart-stat">BASELINE: <strong>{baselineScore}</strong></span>
          <span className="chart-stat">
            CURRENT: <strong style={{ color: getScoreColor(currentScore) }}>{currentScore}</strong>
          </span>
          <span className={`chart-stat delta-pill ${netDelta < 0 ? 'negative' : 'neutral'}`}>
            {netDelta < 0 ? `▼ ${netDelta} PTS` : netDelta > 0 ? `▲ +${netDelta} PTS` : 'Δ 0 PTS'}
          </span>
        </div>
      </div>

      {/* Hero Demonstration Video — primary visual artifact inside Analytical Trajectory Engine */}
      <div style={{ background: '#06080c', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', lineHeight: 0 }}>
        <video
          ref={videoRef}
          src="/assets/netra-hero.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            maxHeight: 460,
            aspectRatio: '16 / 9',
            objectFit: 'contain',
            background: '#06080c',
          }}
        />
      </div>

      {/* SVG Canvas with Shaded Policy Bands */}
      <div className="hero-chart-svg-wrapper">
        <svg
          className="hero-chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="trajectory-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={getScoreColor(currentScore)} stopOpacity="0.22" />
              <stop offset="100%" stopColor={getScoreColor(currentScore)} stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="trajectory-stroke-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor={netDelta < -30 ? '#d97706' : '#0284c7'} />
              <stop offset="100%" stopColor={getScoreColor(currentScore)} />
            </linearGradient>
          </defs>

          {/* Shaded Policy Zones */}
          {/* Zone 1: ALLOW (90-100) */}
          <rect
            x={padLeft}
            y={getY(100)}
            width={plotWidth}
            height={getY(90) - getY(100)}
            fill="rgba(16, 185, 129, 0.04)"
          />
          {/* Zone 2: MONITOR (70-90) */}
          <rect
            x={padLeft}
            y={getY(90)}
            width={plotWidth}
            height={getY(70) - getY(90)}
            fill="rgba(2, 132, 199, 0.03)"
          />
          {/* Zone 3: VERIFY (45-70) */}
          <rect
            x={padLeft}
            y={getY(70)}
            width={plotWidth}
            height={getY(45) - getY(70)}
            fill="rgba(217, 119, 6, 0.04)"
          />
          {/* Zone 4: RESTRICT (20-45) */}
          <rect
            x={padLeft}
            y={getY(45)}
            width={plotWidth}
            height={getY(20) - getY(45)}
            fill="rgba(234, 88, 12, 0.05)"
          />
          {/* Zone 5: BLOCK (0-20) */}
          <rect
            x={padLeft}
            y={getY(20)}
            width={plotWidth}
            height={getY(0) - getY(20)}
            fill="rgba(220, 38, 38, 0.07)"
          />

          {/* Policy Threshold Boundary Lines */}
          {[
            { y: 90, label: 'ALLOW 90', color: '#10b981' },
            { y: 70, label: 'MONITOR 70', color: '#0284c7' },
            { y: 45, label: 'VERIFY 45', color: '#d97706' },
            { y: 20, label: 'RESTRICT 20', color: '#ea580c' },
          ].map(t => (
            <g key={t.y}>
              <line
                x1={padLeft}
                y1={getY(t.y)}
                x2={padLeft + plotWidth}
                y2={getY(t.y)}
                stroke={t.color}
                strokeWidth="1"
                strokeDasharray="3 4"
                strokeOpacity="0.45"
              />
              <text
                x={padLeft + plotWidth + 6}
                y={getY(t.y) + 3}
                fill={t.color}
                fontSize="8"
                fontFamily="var(--font-mono)"
                fontWeight="600"
                opacity="0.85"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Left Y-Axis Score Reference */}
          {[100, 75, 50, 25, 0].map(val => (
            <text
              key={val}
              x={padLeft - 6}
              y={getY(val) + 3}
              fill="var(--text-dim)"
              fontSize="8"
              fontFamily="var(--font-mono)"
              textAnchor="end"
            >
              {val}
            </text>
          ))}

          {/* Multi-point trajectory line and area */}
          {coords.length > 1 && (
            <>
              <path d={areaPath} fill="url(#trajectory-area-grad)" />
              <path
                d={linePath}
                fill="none"
                stroke="url(#trajectory-stroke-grad)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Single-point baseline reference line */}
          {coords.length === 1 && (
            <line
              x1={padLeft}
              y1={getY(baselineScore)}
              x2={padLeft + plotWidth}
              y2={getY(baselineScore)}
              stroke="#10b981"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              strokeOpacity="0.6"
            />
          )}

          {/* Interactive Point Markers */}
          {coords.map((c, i) => {
            const isLatest = i === coords.length - 1
            const ptColor = getScoreColor(c.score)
            return (
              <g
                key={i}
                className="chart-point-group"
                onMouseEnter={() =>
                  setHoveredPoint({
                    index: i,
                    label: c.label,
                    score: Math.round(c.score),
                    delta: c.delta,
                    reason: c.reason,
                    timestamp: c.timestamp,
                    x: c.x,
                    y: c.y,
                  })
                }
                onMouseLeave={() => setHoveredPoint(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Outer halo */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isLatest ? 6 : 4}
                  fill={ptColor}
                  fillOpacity={isLatest ? 0.35 : 0.18}
                />
                {/* Core node */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isLatest ? 3.5 : 2.5}
                  fill="var(--bg-surface-0)"
                  stroke={ptColor}
                  strokeWidth={isLatest ? 2 : 1.5}
                />

                {/* Score label above point */}
                <text
                  x={c.x}
                  y={c.y - 7}
                  fill={isLatest ? '#fff' : 'var(--text-secondary)'}
                  fontSize={isLatest ? '9' : '8'}
                  fontFamily="var(--font-mono)"
                  fontWeight={isLatest ? '700' : '600'}
                  textAnchor="middle"
                >
                  {Math.round(c.score)}
                </text>

                {/* Drop delta indicator badge if dropped */}
                {c.delta && c.delta < 0 && (
                  <text
                    x={c.x}
                    y={c.y - 17}
                    fill="var(--state-critical)"
                    fontSize="7"
                    fontFamily="var(--font-mono)"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {Math.round(c.delta)}
                  </text>
                )}

                {/* Event Marker Label below bottom */}
                <text
                  x={c.x}
                  y={padTop + plotHeight + 14}
                  fill={isLatest ? 'var(--accent-cobalt)' : 'var(--text-dim)'}
                  fontSize="7.5"
                  fontFamily="var(--font-mono)"
                  fontWeight={isLatest ? '600' : '500'}
                  textAnchor="middle"
                >
                  {c.label.length > 11 ? c.label.slice(0, 10) + '..' : c.label}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="chart-hover-tooltip"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
            }}
          >
            <div className="tooltip-header">
              <span className="mono">{hoveredPoint.label}</span>
              <strong style={{ color: getScoreColor(hoveredPoint.score) }}>
                {hoveredPoint.score} / 100
              </strong>
            </div>
            {hoveredPoint.delta ? (
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: hoveredPoint.delta < 0 ? 'var(--state-critical)' : 'var(--state-normal)',
                }}
              >
                DELTA: {hoveredPoint.delta > 0 ? `+${hoveredPoint.delta}` : hoveredPoint.delta} PTS
              </div>
            ) : null}
            <div className="tooltip-desc">{hoveredPoint.reason}</div>
            {hoveredPoint.timestamp && (
              <div className="mono" style={{ fontSize: 8, color: 'var(--text-dim)' }}>
                {formatTime(hoveredPoint.timestamp)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Baseline Envelope Info Box (When 0 or 1 transition exists) */}
      {!hasHistory && (
        <div className="baseline-envelope-box">
          <div className="envelope-head">
            <span className="status-pill normal" style={{ fontSize: 8 }}>
              INDIVIDUAL BASELINE ENVELOPE (94.0/100)
            </span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
              ZERO STATISTICAL ANOMALIES DETECTED
            </span>
          </div>
          <div className="envelope-grid mono">
            <div className="envelope-param">
              <span>KNOWN DEVICES:</span>
              <strong>{trader?.baseline?.known_devices?.length ? `${trader.baseline.known_devices.length} registered` : '1 registered'}</strong>
            </div>
            <div className="envelope-param">
              <span>MAX BASELINE LEV:</span>
              <strong>{trader?.baseline?.leverage ? `${trader.baseline.leverage}× margin` : '—'}</strong>
            </div>
            <div className="envelope-param">
              <span>HABITUAL VOLUME:</span>
              <strong>{trader?.baseline?.deposit_amount != null ? `${money(trader.baseline.deposit_amount)} avg` : '—'}</strong>
            </div>
            <div className="envelope-param">
              <span>HOURS PROFILE:</span>
              <strong>
                {trader?.baseline?.normal_login_hours?.length
                  ? `UTC ${String(Math.min(...trader.baseline.normal_login_hours)).padStart(2, '0')}:00 – ${String(Math.max(...trader.baseline.normal_login_hours)).padStart(2, '0')}:00`
                  : 'UTC 08:00 – 20:00'}
              </strong>
            </div>
            <div className="envelope-param">
              <span>NORMAL VELOCITY:</span>
              <strong>{trader?.baseline?.transaction_velocity_per_hour != null ? `${trader.baseline.transaction_velocity_per_hour} events/hr` : '—'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Trajectory Technical Strip Footer */}
      <div className="hero-chart-footer mono">
        <div className="footer-item">
          <span>STARTING BASELINE:</span>
          <strong>{baselineScore} / 100</strong>
        </div>
        <div className="footer-item">
          <span>CURRENT SCORE:</span>
          <strong style={{ color: getScoreColor(currentScore) }}>{currentScore} / 100</strong>
        </div>
        <div className="footer-item">
          <span>TRANSITIONS EVALUATED:</span>
          <strong>{chartPoints.length}</strong>
        </div>
        <div className="footer-item">
          <span>STATUS:</span>
          <span className={`status-pill ${trader?.status?.toLowerCase() || 'normal'}`} style={{ fontSize: 8 }}>
            {trader?.status || 'NORMAL'}
          </span>
        </div>
        <div className="footer-item">
          <span>ENFORCEMENT:</span>
          <strong style={{ color: getScoreColor(currentScore) }}>
            {trader?.last_decision || 'ALLOW'}
          </strong>
        </div>
      </div>
    </div>
  )
}
