import React, { useMemo, useState } from 'react'
import type { Graph } from '../types'

interface InteractiveGraphProps {
  graph?: Graph
  onSelectNode?: (nodeId: string) => void
  selectedNodeId?: string
}

export function InteractiveGraph({ graph, onSelectNode, selectedNodeId }: InteractiveGraphProps) {
  const [filterType, setFilterType] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [zoom, setZoom] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const rawNodes = graph?.nodes || []
  const rawEdges = graph?.edges || []

  const nodes = useMemo(() => {
    return rawNodes.filter(node => {
      const matchesType = filterType === 'ALL' || node.type === filterType
      const matchesSearch =
        !searchQuery.trim() ||
        node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.id.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesType && matchesSearch
    })
  }, [rawNodes, filterType, searchQuery])

  const nodePositions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {}
    const total = nodes.length
    if (total === 0) return map

    const centerX = 400
    const centerY = 250

    nodes.forEach((node, index) => {
      if (node.is_cluster) {
        const clusterNodes = nodes.filter(n => n.is_cluster)
        const clusterIndex = clusterNodes.findIndex(n => n.id === node.id)
        const angle = (Math.PI * 2 * clusterIndex) / Math.max(1, clusterNodes.length)
        map[node.id] = {
          x: centerX + 170 + Math.cos(angle) * 95,
          y: centerY + Math.sin(angle) * 95,
        }
      } else {
        const angle = (Math.PI * 2 * index) / Math.max(1, total) - Math.PI / 2
        const radius = node.type === 'TRADER' ? 120 : 185
        map[node.id] = {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        }
      }
    })
    return map
  }, [nodes])

  const visibleEdges = useMemo(() => {
    return rawEdges.filter(edge => nodePositions[edge.source] && nodePositions[edge.target])
  }, [rawEdges, nodePositions])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const [showBlastRadius, setShowBlastRadius] = useState<boolean>(true)
  const handleMouseUp = () => setIsDragging(false)

  // Calculate blast radius metrics from real graph topology
  const blastRadiusInfo = useMemo(() => {
    const criticalNodes = rawNodes.filter(n => n.risk > 70 || n.is_cluster)
    const criticalIds = new Set(criticalNodes.map(n => n.id))

    // Find all 1-hop and 2-hop edges connected to critical nodes or selected node
    const focusIds = new Set<string>(criticalIds)
    if (selectedNodeId) focusIds.add(selectedNodeId)

    const attackEdges = rawEdges.filter(e => focusIds.has(e.source) || focusIds.has(e.target))
    const blastEntityIds = new Set<string>()
    attackEdges.forEach(e => {
      blastEntityIds.add(e.source)
      blastEntityIds.add(e.target)
    })

    const compromisedTraders = rawNodes.filter(n => blastEntityIds.has(n.id) && n.type === 'TRADER')
    const compromisedInfra = rawNodes.filter(n => blastEntityIds.has(n.id) && n.type !== 'TRADER')

    return {
      blastSize: blastEntityIds.size,
      compromisedTraders,
      compromisedInfra,
      hasAttackPath: attackEdges.length > 0,
      attackEdges,
      focusIds,
    }
  }, [rawNodes, rawEdges, selectedNodeId])

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="graph-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', marginRight: 4 }}>
            FILTER:
          </span>
          {['ALL', 'TRADER', 'DEVICE', 'IP', 'WALLET'].map(type => (
            <button
              key={type}
              className={`graph-filter-btn ${filterType === type ? 'active' : ''}`}
              onClick={() => setFilterType(type)}
            >
              {type}
            </button>
          ))}
          <button
            className={`btn ${showBlastRadius ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 9, padding: '2px 8px', marginLeft: 6 }}
            onClick={() => setShowBlastRadius(prev => !prev)}
            title="Toggle Attack Path highlighting and Blast Radius HUD"
          >
            {showBlastRadius ? '💥 BLAST RADIUS: ON' : 'BLAST RADIUS: OFF'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            placeholder="Search entity node..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              background: 'var(--bg-surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 3,
              padding: '3px 8px',
              color: '#fff',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              width: 140,
            }}
          />
          <div style={{ display: 'flex', gap: 3 }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '2px 6px', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              onClick={() => setZoom(prev => Math.min(2.2, prev + 0.2))}
            >
              +
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '2px 6px', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              onClick={() => setZoom(prev => Math.max(0.4, prev - 0.2))}
            >
              -
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '2px 6px', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              onClick={() => {
                setZoom(1)
                setPan({ x: 0, y: 0 })
              }}
            >
              RESET
            </button>
          </div>
        </div>
      </div>

      {graph?.has_cluster && (
        <div
          style={{
            background: 'var(--state-critical-bg)',
            borderBottom: '1px solid var(--state-critical-border)',
            padding: '5px 12px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--state-critical)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>ALERT // COLLUSIVE FRAUD INFRASTRUCTURE RING IDENTIFIED (4 LINKED IDENTITIES)</span>
          <span>CLUSTER-RING-X</span>
        </div>
      )}

      <div
        className="graph-stage"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          viewBox="0 0 800 500"
          style={{
            width: '100%',
            height: '100%',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Subtle 1px grid */}
          <pattern id="graph-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
          </pattern>
          <rect width="800" height="500" fill="url(#graph-grid)" />

          {/* Edges */}
          {visibleEdges.map((edge, idx) => {
            const src = nodePositions[edge.source]
            const dst = nodePositions[edge.target]
            if (!src || !dst) return null
            const isSelected = selectedNodeId === edge.source || selectedNodeId === edge.target
            const isAttackEdge = showBlastRadius && (blastRadiusInfo.focusIds.has(edge.source) || blastRadiusInfo.focusIds.has(edge.target))

            let edgeStroke = 'rgba(255,255,255,0.1)'
            let edgeWidth = 1
            if (isSelected) {
              edgeStroke = 'var(--accent-cobalt)'
              edgeWidth = 2
            } else if (isAttackEdge) {
              edgeStroke = 'rgba(220, 38, 38, 0.7)'
              edgeWidth = 1.8
            }

            const midX = (src.x + dst.x) / 2
            const midY = (src.y + dst.y) / 2

            return (
              <g key={`${edge.source}-${edge.target}-${idx}`}>
                <line
                  x1={src.x}
                  y1={src.y}
                  x2={dst.x}
                  y2={dst.y}
                  stroke={edgeStroke}
                  strokeWidth={edgeWidth}
                  strokeDasharray={isAttackEdge ? '4 3' : edge.type.includes('USES') ? '3 3' : undefined}
                />
                {(isAttackEdge || isSelected) && (
                  <text
                    x={midX}
                    y={midY - 4}
                    fill={isAttackEdge ? 'var(--state-critical)' : 'var(--accent-cobalt)'}
                    fontSize="7.5px"
                    fontFamily="var(--font-mono)"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none', background: 'rgba(0,0,0,0.7)' }}
                  >
                    {edge.type}
                  </text>
                )}
              </g>
            )
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const pos = nodePositions[node.id]
            if (!pos) return null
            const isSelected = selectedNodeId === node.id
            const isDanger = node.is_cluster || node.risk > 70
            const inBlast = showBlastRadius && blastRadiusInfo.focusIds.has(node.id)

            const strokeColor = isDanger
              ? 'var(--state-critical)'
              : inBlast
              ? 'var(--state-elevated)'
              : node.type === 'TRADER'
              ? 'var(--accent-cobalt)'
              : 'var(--border-strong)'

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => onSelectNode?.(node.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Attack Path Pulse Halo */}
                {inBlast && (
                  <circle
                    r={30}
                    fill="none"
                    stroke={isDanger ? 'rgba(220, 38, 38, 0.3)' : 'rgba(217, 119, 6, 0.25)'}
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                )}
                {/* Node Box */}
                <rect
                  x={-42}
                  y={-12}
                  width={84}
                  height={24}
                  rx={3}
                  fill="var(--bg-surface-0)"
                  stroke={isSelected ? '#fff' : strokeColor}
                  strokeWidth={isSelected ? 2 : isDanger ? 1.5 : 1}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="9px"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                >
                  {node.label.length > 13 ? `${node.label.slice(0, 11)}..` : node.label}
                </text>
                <text
                  x={0}
                  y={22}
                  textAnchor="middle"
                  fill="var(--text-dim)"
                  fontSize="8px"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {node.type}
                </text>
              </g>
            )
          })}
        </svg>

        {/* BLAST RADIUS HUD OVERLAY */}
        {showBlastRadius && blastRadiusInfo.hasAttackPath && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              background: 'rgba(10, 15, 26, 0.92)',
              border: '1px solid rgba(220, 38, 38, 0.4)',
              borderRadius: 'var(--radius-xs)',
              padding: '10px 12px',
              maxWidth: 260,
              backdropFilter: 'blur(4px)',
              pointerEvents: 'none',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className="status-dot critical" />
              <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--state-critical)' }}>
                BLAST RADIUS HUD // ACTIVE RISK
              </span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: '#fff', marginBottom: 4 }}>
              AFFECTED ENTITIES: <b>{blastRadiusInfo.blastSize} DIRECT / LINKED</b>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
              {blastRadiusInfo.compromisedTraders.length > 0 && (
                <div>• Linked Traders: {blastRadiusInfo.compromisedTraders.map(t => t.label).join(', ')}</div>
              )}
              {blastRadiusInfo.compromisedInfra.length > 0 && (
                <div>• Shared Infra: {blastRadiusInfo.compromisedInfra.map(i => i.label).join(', ')}</div>
              )}
            </div>
          </div>
        )}

        {nodes.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              pointerEvents: 'none',
            }}
          >
            NO TOPOLOGY NODES DETECTED
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
              Select an active trader or switch to Institutional Multi-Trader Topology
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          padding: '6px 14px',
          background: 'var(--bg-surface-0)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
        }}
      >
        <span>ENTITIES: {nodes.length} | EDGES: {visibleEdges.length}</span>
        <span>DRAG TO PAN // CLICK NODE TO INSPECT FORENSIC EVIDENCE</span>
      </div>
    </div>
  )
}
