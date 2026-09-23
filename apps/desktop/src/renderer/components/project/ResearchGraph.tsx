import { useEffect, useId, useRef, useState } from 'react'
import type {
  PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  ProjectDetail as Project,
  ResearchGraph as Graph,
  ResearchIdea,
  Task,
} from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { activeRoutes } from '../../../shared/research-path.js'
import { recordKind, recordOrigin, sortRecordsNewestFirst } from '../../../shared/project-signals.js'
import { Markdown } from '../Markdown.js'
import { EmptyState } from '../EmptyState.js'
import { FadeText } from '../FadeText.js'
import { IconPlus } from '../icons.js'
import { PanelClose } from '../PanelClose.js'
import { SectionHeading } from '../PageShell.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { ProjectEventRow } from './ProjectSignals.js'
import './ResearchGraph.css'

type GraphNode = Graph['nodes'][number]

const GRAPH_NODE_HEIGHT = 48
const GRAPH_LABEL_LEFT = 32
const GRAPH_LABEL_RIGHT = 16
const GRAPH_NODE_MAX_WIDTH = 360

/** Estimated pixel width of one label character at the node's 13px medium-weight sans font. */
const glyphWidth = (char: string) => (/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(char) ? 13.5 : 7.4)

/** Estimated pixel width of a node label. */
export const graphLabelWidth = (label: string) => [...label].reduce((sum, char) => sum + glyphWidth(char), 0)

/** The label as drawn: whole when it fits the widest node, otherwise cut with an ellipsis. */
export function graphNodeLabel(label: string): string {
  const room = GRAPH_NODE_MAX_WIDTH - GRAPH_LABEL_LEFT - GRAPH_LABEL_RIGHT
  if (graphLabelWidth(label) <= room) return label
  let width = glyphWidth('…')
  let kept = ''
  for (const char of label) {
    width += glyphWidth(char)
    if (width > room) break
    kept += char
  }
  return `${kept}…`
}

/** Node width that holds its drawn label between the status dot and the right edge. */
export const graphNodeWidth = (label: string, given: number) => Math.min(GRAPH_NODE_MAX_WIDTH, Math.max(
  172, given + 28, Math.ceil(GRAPH_LABEL_LEFT + graphLabelWidth(graphNodeLabel(label)) + GRAPH_LABEL_RIGHT),
))
const GRAPH_VIEW_HEIGHT = 280
const GRAPH_COLUMN_GAP = 72
const GRAPH_ROW_GAP = 28
const GRAPH_MIN_ZOOM = .6
const GRAPH_MAX_ZOOM = 1.8

const clampGraphZoom = (zoom: number) =>
  Math.min(GRAPH_MAX_ZOOM, Math.max(GRAPH_MIN_ZOOM, zoom))

/** A node's research state, the one the graph colours its dot by. */
export const nodeMode = (node: GraphNode): NonNullable<GraphNode['mode']> =>
  node.mode ?? (node.state === 'done' ? 'supported' : 'unresolved')

/**
 * Lay out the read-only graph from topology instead of persisted display coordinates.
 * Sibling branches share a column; semantic cross-links are omitted from the parent tree.
 */
export function layoutResearchTree(graph: Graph): { nodes: Graph['nodes']; edges: Graph['edges'] } {
  if (graph.nodes.length === 0) return { nodes: [], edges: [] }
  const ids = new Set(graph.nodes.map((node) => node.id))
  const edges = graph.edges.filter(([from, to]) => ids.has(from) && ids.has(to))
  const outgoing = new Map<string, string[]>()
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]))
  for (const [from, to] of edges) {
    outgoing.set(from, [...(outgoing.get(from) ?? []), to])
    incoming.set(to, (incoming.get(to) ?? 0) + 1)
  }

  const depth = new Map<string, number>()
  const spread = (seeds: string[]) => {
    const queue: string[] = []
    for (const seed of seeds) {
      if (depth.has(seed)) continue
      depth.set(seed, 0)
      queue.push(seed)
    }
    for (let index = 0; index < queue.length; index += 1) {
      const from = queue[index]!
      const nextDepth = depth.get(from)! + 1
      for (const to of outgoing.get(from) ?? []) {
        const held = depth.get(to)
        if (held !== undefined && held <= nextDepth) continue
        depth.set(to, nextDepth)
        queue.push(to)
      }
    }
  }
  spread(graph.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id))
  for (const node of graph.nodes) {
    if (!depth.has(node.id)) spread([node.id])
  }

  const treeEdges = edges.filter(([from, to]) => depth.get(to) === depth.get(from)! + 1)
  const sized = graph.nodes.map((node) => ({ ...node, width: graphNodeWidth(node.label, node.width) }))
  const layers = new Map<number, typeof sized>()
  for (const node of sized) {
    const column = depth.get(node.id) ?? 0
    layers.set(column, [...(layers.get(column) ?? []), node])
  }

  const rowStep = GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP
  const y = new Map<string, number>()
  for (const layer of layers.values()) {
    layer.forEach((node, row) => y.set(node.id, row * rowStep))
  }
  const children = new Map<string, string[]>()
  for (const [from, to] of treeEdges) children.set(from, [...(children.get(from) ?? []), to])
  const maxDepth = Math.max(...depth.values())
  for (let column = maxDepth - 1; column >= 0; column -= 1) {
    let previous = -rowStep
    for (const node of layers.get(column) ?? []) {
      const childRows = (children.get(node.id) ?? []).map((id) => y.get(id)!)
      const centered = childRows.length === 0
        ? y.get(node.id)!
        : childRows.reduce((sum, value) => sum + value, 0) / childRows.length
      const placed = Math.max(centered, previous + rowStep)
      y.set(node.id, placed)
      previous = placed
    }
  }

  const columnX = new Map<number, number>()
  let nextX = 0
  for (let column = 0; column <= maxDepth; column += 1) {
    columnX.set(column, nextX)
    const width = Math.max(0, ...(layers.get(column) ?? []).map((node) => node.width))
    nextX += width + GRAPH_COLUMN_GAP
  }
  const minY = Math.min(...y.values())
  return {
    nodes: sized.map((node) => ({
      ...node,
      x: columnX.get(depth.get(node.id) ?? 0) ?? 0,
      y: y.get(node.id)! - minY,
    })),
    edges: treeEdges,
  }
}

/**
 * Interactive research DAG. View transforms are local presentation state and never write back
 * into the Agent-owned graph.
 */
export function ResearchGraph({ graph, selected, ideaNodeIds = [], onSelect }: {
  graph: Graph
  selected: string | null
  /** Nodes linked to the idea currently open in the project detail panel. */
  ideaNodeIds?: readonly string[]
  onSelect: (nodeId: string) => void
}) {
  const m = useMessages()
  const ideaPatternId = `idea-node-hatch-${useId().replaceAll(':', '')}`
  const viewport = useRef<HTMLDivElement>(null)
  const panStart = useRef<{
    pointerId: number; clientX: number; clientY: number; x: number; y: number
  } | null>(null)
  const [viewportWidth, setViewportWidth] = useState(780)
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const [panning, setPanning] = useState(false)
  const layout = layoutResearchTree(graph)
  const graphKey = `${layout.nodes.map((node) => `${node.id}:${node.width}`).join('|')}::${layout.edges.join('|')}`

  useEffect(() => {
    const element = viewport.current
    if (element === null) return
    const sync = () => setViewportWidth(element.clientWidth)
    sync()
    const resize = new ResizeObserver(sync)
    resize.observe(element)
    return () => resize.disconnect()
  }, [graph.nodes.length])
  useEffect(() => setView({ x: 0, y: 0, zoom: 1 }), [graphKey])

  if (graph.nodes.length === 0) {
    return <div className="lm rgempty">{m.project.graph.empty}</div>
  }
  const nodes = layout.nodes
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const activeNodeIds = new Set((graph.activeNodes ?? []).filter((id) => byId.has(id)))
  const routes = activeRoutes(graph, graph.activeNodes ?? [])
  const ideaNodes = new Set(ideaNodeIds.filter((id) => byId.has(id)))
  const routeEdges = layout.edges.filter(([from, to]) => routes.edges.has(`${from}\u0000${to}`))
  const contentWidth = Math.max(...nodes.map((node) => node.x + node.width))
  const contentHeight = Math.max(...nodes.map((node) => node.y + GRAPH_NODE_HEIGHT))
  const baseX = contentWidth < viewportWidth ? (viewportWidth - contentWidth) / 2 : 24
  const baseY = contentHeight < GRAPH_VIEW_HEIGHT ? (GRAPH_VIEW_HEIGHT - contentHeight) / 2 : 24
  const edgePath = (from: string, to: string) => {
    const a = byId.get(from)!
    const b = byId.get(to)!
    const [x1, y1, x2, y2] = [
      a.x + a.width, a.y + GRAPH_NODE_HEIGHT / 2, b.x, b.y + GRAPH_NODE_HEIGHT / 2,
    ]
    return `M${x1} ${y1} C ${x1 + 42} ${y1}, ${x2 - 42} ${y2}, ${x2} ${y2}`
  }

  const zoomAt = (requested: number, atX = viewportWidth / 2, atY = GRAPH_VIEW_HEIGHT / 2) => {
    setView((current) => {
      const zoom = clampGraphZoom(requested)
      if (zoom === current.zoom) return current
      const worldX = (atX - baseX - current.x) / current.zoom
      const worldY = (atY - baseY - current.y) / current.zoom
      return {
        zoom,
        x: atX - baseX - worldX * zoom,
        y: atY - baseY - worldY * zoom,
      }
    })
  }
  const wheelZoom = useRef<(event: WheelEvent) => void>(() => {})
  wheelZoom.current = (event) => {
    event.preventDefault()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    zoomAt(
      view.zoom * Math.exp(-event.deltaY * .0015),
      event.clientX - rect.left,
      event.clientY - rect.top,
    )
  }
  // React registers wheel listeners as passive, where preventDefault is ignored and the page scrolls too.
  useEffect(() => {
    const element = viewport.current
    if (element === null) return
    const onWheel = (event: WheelEvent) => wheelZoom.current(event)
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [viewport])
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('.rgn,.graph-view-controls')) return
    panStart.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: view.x,
      y: view.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPanning(true)
  }
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = panStart.current
    if (start === null || start.pointerId !== event.pointerId) return
    setView((current) => ({
      ...current,
      x: start.x + event.clientX - start.clientX,
      y: start.y + event.clientY - start.clientY,
    }))
  }
  const stopPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panStart.current?.pointerId !== event.pointerId) return
    panStart.current = null
    setPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="rgraph">
      <div
        className={`rgraph-viewport${panning ? ' panning' : ''}`} ref={viewport}
        onPointerDown={startPan} onPointerMove={movePan}
        onPointerUp={stopPan} onPointerCancel={stopPan}
      >
        <svg viewBox={`0 0 ${Math.max(1, viewportWidth)} ${GRAPH_VIEW_HEIGHT}`}>
          <defs>
            <pattern
              id={ideaPatternId} width="12" height="12" patternUnits="userSpaceOnUse"
              patternTransform="rotate(32)"
            >
              <rect className="idea-node-pattern-base" width="12" height="12" />
              <path className="idea-node-pattern-stripe" d="M-12 0V12 M0 0V12 M12 0V12">
                <animateTransform
                  attributeName="transform" type="translate" from="-12 0" to="0 0"
                  dur="720ms" repeatCount="indefinite"
                />
              </path>
            </pattern>
          </defs>
          <g transform={`translate(${baseX + view.x},${baseY + view.y}) scale(${view.zoom})`}>
            <g className="redges">
              {layout.edges.map(([from, to]) => (
                <path
                  className={routes.edges.has(`${from}\u0000${to}`) ? 'active' : undefined}
                  key={`${from} ${to}`} d={edgePath(from, to)}
                />
              ))}
            </g>
            <g className="active-edge-flows" aria-hidden="true">
              {routeEdges.map(([from, to], index) => (
                <path
                  key={`${from} ${to}`} d={edgePath(from, to)}
                  style={{ animationDelay: `${index * 110}ms` }}
                />
              ))}
            </g>
            {nodes.map((node) => {
              const ideaRelated = ideaNodes.has(node.id)
              const onRoute = routes.nodes.has(node.id) && !activeNodeIds.has(node.id)
              return (
                <g
                  className={`rgn ${node.state} ${nodeMode(node)}${onRoute ? ' active-path-node-graph' : ''}${activeNodeIds.has(node.id) ? ' active-leaf' : ''}${ideaRelated ? ' idea-related' : ''}${node.id === selected ? ' sel' : ''}`}
                  data-node={node.id}
                  key={node.id} transform={`translate(${node.x},${node.y})`}
                  onClick={() => onSelect(node.id)}
                >
                  <rect
                    width={node.width} height={GRAPH_NODE_HEIGHT} rx="11"
                    style={ideaRelated ? { fill: `url(#${ideaPatternId})` } : undefined}
                  />
                  <circle cx="18" cy={GRAPH_NODE_HEIGHT / 2} r="4" className="nd" />
                  <title>{node.label}</title>
                  <text x={GRAPH_LABEL_LEFT} y="29">{graphNodeLabel(node.label)}</text>
                </g>
              )
            })}
          </g>
        </svg>
        <div className="graph-view-controls">
          <button type="button" aria-label={m.project.graph.zoomOut} onClick={() => zoomAt(view.zoom / 1.2)}>−</button>
          <button
            type="button" className="graph-zoom-reset" title={m.project.graph.resetView}
            onClick={() => setView({ x: 0, y: 0, zoom: 1 })}
          >{Math.round(view.zoom * 100)}%</button>
          <button
            type="button" aria-label={m.project.graph.zoomIn} onClick={() => zoomAt(view.zoom * 1.2)}
          ><IconPlus /></button>
        </div>
      </div>
      <div className="glegend">
        <span className="legend-item"><span className="ld progress" />{m.project.graph.legend.needsRepair}</span>
        <span className="legend-item"><span className="ld verified" />{m.project.graph.legend.verified}</span>
        <span className="legend-item"><span className="ld failed" />{m.project.graph.legend.failed}</span>
        <span className="legend-item"><span className="ld candidate" />{m.project.graph.legend.candidate}</span>
        {routes.nodes.size === 0 ? null : (
          <>
            <span className="legend-divider" aria-hidden="true" />
            <span className="legend-item"><span className="legend-path" />{m.project.graph.legend.activePath}</span>
            <span className="legend-item"><span className="legend-node current" />{m.project.graph.legend.inProgress}</span>
          </>
        )}
        {ideaNodes.size === 0 ? null : (
          <span className="legend-item"><span className="legend-node idea" />{m.project.graph.legend.ideaLinked}</span>
        )}
      </div>
    </div>
  )
}

/** Separate leading Agent metadata from the Markdown body shown in the reading panel. */
export function splitNodeDocument(markdown: string | undefined): {
  metadata: Array<{ key: string; value: string }>
  body: string
} {
  const source = markdown?.trim() ?? ''
  if (source === '') return { metadata: [], body: '' }
  const lines = source.split('\n')
  const metadata: Array<{ key: string; value: string }> = []
  let cursor = 0
  while (cursor < lines.length) {
    const match = /^\s*-\s+([^:]+):\s*(.*)$/.exec(lines[cursor]!)
    if (match === null) break
    metadata.push({ key: match[1]!.trim(), value: match[2]!.trim().replace(/^`|`$/g, '') })
    cursor += 1
  }
  if (metadata.length === 0) return { metadata, body: source }
  while (lines[cursor]?.trim() === '') cursor += 1
  return { metadata, body: lines.slice(cursor).join('\n').trim() }
}

/** Read-only projection of the Agent-maintained node document, with App-owned idea associations. */
export function ResearchNodePanel({ graph, events, ideas, tasks, node, onClose, onSelect, onSelectIdea, onSelectTask }: {
  graph: Graph
  events: Project['events']
  ideas: ResearchIdea[]
  /** The plan tasks that belong to this node, in plan order. */
  tasks: Task[]
  node: GraphNode
  onClose: () => void
  onSelect: (nodeId: string) => void
  onSelectIdea: (ideaId: string) => void
  onSelectTask: (taskId: string) => void
}) {
  const m = useMessages()
  const byId = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]))
  const children = layoutResearchTree(graph).edges
    .filter(([from]) => from === node.id)
    .flatMap(([, to]) => byId.get(to) ?? [])
  const activeNodeIds = new Set(graph.activeNodes ?? [])
  const isActive = (child: GraphNode) => activeNodeIds.has(child.id)
  const branches = [
    {
      key: 'active', label: m.project.graph.legend.inProgress,
      nodes: children.filter(isActive),
    },
    {
      key: 'repairable', label: m.project.graph.legend.needsRepair,
      nodes: children.filter((child) => !isActive(child) && nodeMode(child) === 'repairable'),
    },
    {
      key: 'useful', label: m.project.graph.legend.verified,
      nodes: children.filter((child) => nodeMode(child) === 'supported'),
    },
    {
      key: 'dead', label: m.project.graph.legend.failed,
      nodes: children.filter((child) => nodeMode(child) === 'dead'),
    },
    {
      key: 'candidate', label: m.project.graph.legend.candidate,
      nodes: children.filter((child) => !isActive(child) && nodeMode(child) === 'unresolved'),
    },
  ].filter((group) => group.nodes.length > 0)
  const nodeEvents = sortRecordsNewestFirst(events.filter((event) => event.node === node.id))
  const document = splitNodeDocument(node.markdown)

  return (
    <>
      <SectionHeading
        variant="rail" className="node-document-head"
        actions={<PanelClose onClose={onClose} />}
      ><span className="node-document-title">{node.label}</span>
      </SectionHeading>
      <SectionHeading variant="rail">{m.project.graph.branchSummary(children.length)}</SectionHeading>
      {children.length === 0
        ? <EmptyState variant="section">{m.project.graph.noBranches}</EmptyState>
        : (
          <div className="node-branch-groups">
            {branches.map((group) => (
              <div className={`node-branch-group ${group.key}`} key={group.key}>
                <span className="node-branch-label">{group.label}</span>
                <div className="node-branch-list">
                  {group.nodes.map((child) => (
                    <button className="node-branch" key={child.id} onClick={() => onSelect(child.id)}>
                      <span className="node-branch-dot" />{child.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      <SectionHeading variant="rail">{m.project.graph.tasks(tasks.length)}</SectionHeading>
      {tasks.length === 0
        ? <EmptyState variant="section">{m.project.graph.noTasks}</EmptyState>
        : (
          <StructuredList className="node-tasks" variant="embedded">
            {tasks.map((task) => (
              <StructuredRow className="node-task-row" data-task={task.id} key={task.id} onActivate={() => onSelectTask(task.id)}>
                <FadeText>{task.title}</FadeText>
                {task.origin === 'agent' ? <span className="agtag">{m.project.records.who.agent}</span> : null}
              </StructuredRow>
            ))}
          </StructuredList>
        )}

      <SectionHeading variant="rail">{m.project.linkedIdeas(ideas.length)}</SectionHeading>
      {ideas.length === 0
        ? <EmptyState variant="section">{m.project.noLinkedIdeas}</EmptyState>
        : (
          <StructuredList className="node-ideas" variant="embedded">
            {ideas.map((idea) => {
              const source = idea.source.paperTitle === undefined
                ? idea.source.chatTitle
                : `${idea.source.paperTitle} · ${idea.source.chatTitle}`
              return (
                <StructuredRow
                  className="node-idea-row" data-idea={idea.id} key={idea.id}
                  onActivate={() => onSelectIdea(idea.id)}
                >
                  <span className="node-idea-title">{idea.title}</span>
                  <span className="node-idea-source" title={source}>{m.project.idea.sourceTag(source)}</span>
                </StructuredRow>
              )
            })}
          </StructuredList>
        )}

      <SectionHeading variant="rail">{m.project.graph.records(nodeEvents.length)}</SectionHeading>
      {nodeEvents.length === 0
        ? <EmptyState variant="section">{m.project.graph.noRecords}</EmptyState>
        : (
          <StructuredList className="node-event-list" variant="embedded">
            {nodeEvents.map((event, index) => (
              <ProjectEventRow
                key={`${event.date} ${index}`}
                kind={recordKind(event)} date={event.date} title={event.text} detail={event.detail} origin={recordOrigin(event)}
              />
            ))}
          </StructuredList>
        )}

      <div className="node-markdown">
        {document.body === ''
          ? <p className="lm">{m.project.graph.noDocument}</p>
          : <div className="md"><Markdown src={document.body} titles={{}} /></div>}
      </div>

      {node.markdownPath === undefined
        ? null
        : (
          <div className="node-document-source" title={node.markdownPath}>
            {node.markdownPath}{node.markdownAnchor === undefined ? '' : `#${node.markdownAnchor}`}
          </div>
        )}
    </>
  )
}
