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

  const handleMouseUp = () => setIsDragging(false)

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="graph-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
            return (
              <line
                key={`${edge.source}-${edge.target}-${idx}`}
                x1={src.x}
                y1={src.y}
                x2={dst.x}
                y2={dst.y}
                stroke={isSelected ? 'var(--accent-cobalt)' : 'rgba(255,255,255,0.1)'}
                strokeWidth={isSelected ? 1.5 : 1}
                strokeDasharray={edge.type.includes('USES') ? '3 3' : undefined}
              />
            )
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const pos = nodePositions[node.id]
            if (!pos) return null
            const isSelected = selectedNodeId === node.id
            const isDanger = node.is_cluster || node.risk > 70
            const strokeColor = isDanger
              ? 'var(--state-critical)'
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
                {/* Node Box */}
                <rect
                  x={-42}
                  y={-12}
                  width={84}
                  height={24}
                  rx={3}
                  fill="var(--bg-surface-0)"
                  stroke={isSelected ? '#fff' : strokeColor}
                  strokeWidth={isSelected ? 1.5 : 1}
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
