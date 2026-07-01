import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Descriptions, Empty, List, Tabs, Tag } from "antd";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import type {
  LabGraph,
  ResearchGraphNode,
  ResearchNodeDetail,
  SupportingArtifact
} from "./graphTypes";

interface FlowNodeData extends Record<string, unknown> {
  label: React.ReactNode;
}

type WebviewMessage =
  | { type: "refreshGraph" }
  | { type: "checkGraph" }
  | { type: "revealMarkdown" }
  | { type: "selectedNode"; nodeId: string };

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
}

let vscodeApi: VsCodeApi | null | undefined;

export function App({
  graph,
  initialSelectedNodeId = null
}: {
  graph: LabGraph | null;
  initialSelectedNodeId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(resolveSelectedNodeId(graph, initialSelectedNodeId));

  useEffect(() => {
    if (!graph?.nodes.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((currentId) => {
      if (initialSelectedNodeId && graph.nodes.some((node) => node.id === initialSelectedNodeId)) {
        return initialSelectedNodeId;
      }
      if (currentId && graph.nodes.some((node) => node.id === currentId)) {
        return currentId;
      }
      return graph.nodes[0].id;
    });
  }, [graph, initialSelectedNodeId]);

  const nodeIds = useMemo(() => new Set(graph?.nodes.map((node) => node.id) ?? []), [graph]);
  const selectedNode = graph?.nodes.find((node) => node.id === selectedId) ?? graph?.nodes[0] ?? null;

  const flowNodes = useMemo<FlowNode<FlowNodeData>[]>(() => {
    if (!graph) {
      return [];
    }
    return graph.nodes.map((node, index) => ({
      id: node.id,
      position: stablePosition(node, index, graph.active_path),
      data: {
        label: <GraphNodeLabel node={node} />
      },
      className: nodeClassName(node, selectedNode?.id === node.id),
      draggable: false,
      selectable: true
    }));
  }, [graph, selectedNode?.id]);

  const flowEdges = useMemo<FlowEdge[]>(() => {
    if (!graph) {
      return [];
    }
    return graph.edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: Boolean(edge.on_active_path),
        className: edge.on_active_path ? "activePathEdge" : "researchEdge",
        label: edge.kind,
        type: "smoothstep"
      }));
  }, [graph, nodeIds]);

  if (!graph) {
    return (
      <main className="emptyShell">
        <Empty description="No Meridian graph loaded" />
      </main>
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <main className="emptyShell">
        <Empty description="No research nodes" />
      </main>
    );
  }

  const selectedDetail = selectedNode ? graph.node_details[selectedNode.id] ?? {} : {};
  const selectedArtifacts = selectedNode ? graph.supporting_artifacts[selectedNode.id] ?? [] : [];
  const healthStatus = graph.health?.status ?? "unknown";
  const handleNodeClick = (_: React.MouseEvent, node: FlowNode<FlowNodeData>) => {
    setSelectedId(node.id);
    postToExtension({ type: "selectedNode", nodeId: node.id });
  };

  return (
    <main className="appShell">
      <section className="graphPane" aria-label="Research graph">
        <div className="graphHeader">
          <div>
            <div className="eyebrow">Meridian Lab</div>
            <h1>Research Graph</h1>
          </div>
          <div className="graphHeaderActions">
            <div className="graphMeta">
              <Tag color={healthColor(healthStatus)}>{healthStatus}</Tag>
              {graph.active_thread ? <Tag>{graph.active_thread}</Tag> : null}
            </div>
            <div className="graphToolbar" aria-label="Graph actions">
              <Button size="small" onClick={() => postToExtension({ type: "refreshGraph" })}>
                Refresh
              </Button>
              <Button size="small" onClick={() => postToExtension({ type: "checkGraph" })}>
                Health Check
              </Button>
              <Button size="small" type="primary" onClick={() => postToExtension({ type: "revealMarkdown" })}>
                Open Markdown
              </Button>
            </div>
          </div>
        </div>
        {healthStatus !== "pass" ? (
          <Alert
            className="healthAlert"
            type="warning"
            message="Graph health needs attention"
            description={healthDescription(graph)}
            showIcon
          />
        ) : null}
        <div className="flowFrame">
          <GraphCanvas
            nodes={flowNodes}
            edges={flowEdges}
            onNodeClick={handleNodeClick}
          />
        </div>
      </section>
      <aside className="detailPane" aria-label="Selected research node">
        {selectedNode ? (
          <NodeDetail node={selectedNode} detail={selectedDetail} artifacts={selectedArtifacts} />
        ) : (
          <Empty description="No selected node" />
        )}
      </aside>
    </main>
  );
}

function resolveSelectedNodeId(graph: LabGraph | null, selectedNodeId: string | null | undefined) {
  if (!graph?.nodes.length) {
    return null;
  }
  if (selectedNodeId && graph.nodes.some((node) => node.id === selectedNodeId)) {
    return selectedNodeId;
  }
  return graph.nodes[0].id;
}

function postToExtension(message: WebviewMessage) {
  getVsCodeApi()?.postMessage(message);
}

function getVsCodeApi() {
  if (vscodeApi !== undefined) {
    return vscodeApi;
  }

  vscodeApi = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi<VsCodeApi>() : null;
  return vscodeApi;
}

function GraphNodeLabel({ node }: { node: ResearchGraphNode }) {
  return (
    <div className="nodeLabel">
      <span className="nodeTitle">{node.title || node.id}</span>
      <span className="nodeSubtitle">{node.kind || node.state}</span>
    </div>
  );
}

function GraphCanvas({
  nodes,
  edges,
  onNodeClick
}: {
  nodes: FlowNode<FlowNodeData>[];
  edges: FlowEdge[];
  onNodeClick: (event: React.MouseEvent, node: FlowNode<FlowNodeData>) => void;
}) {
  if (!canRenderInteractiveFlow()) {
    return (
      <div className="staticFlow" aria-label="Research graph preview">
        {nodes.map((node) => (
          <button
            className={`staticGraphNode ${node.className ?? ""}`}
            key={node.id}
            onClick={(event) => onNodeClick(event, node)}
            style={{
              left: node.position.x,
              top: node.position.y
            }}
            type="button"
          >
            {node.data.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.24 }}
    >
      <Background color="#c9d2c4" gap={24} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function canRenderInteractiveFlow() {
  return typeof window !== "undefined" && "ResizeObserver" in window;
}

function NodeDetail({
  node,
  detail,
  artifacts
}: {
  node: ResearchGraphNode;
  detail: ResearchNodeDetail;
  artifacts: SupportingArtifact[];
}) {
  const overviewItems = compactDescriptionItems([
    ["State", <Tag color={stateColor(node.state)}>{node.state}</Tag>],
    ["Thread", detail.thread_id ?? node.thread_id],
    ["Node", detail.raw_id ?? node.raw_id ?? node.id],
    ["Path", node.markdown_path],
    ["Anchor", node.markdown_anchor],
    ["Updated", node.updated],
    ["Doing", detail.doing],
    ["Why", detail.why],
    ["Next", detail.next_action]
  ]);

  const researchPriorItems = compactDescriptionItems([
    ["Status", detail.research_prior?.status],
    ["Summary", detail.research_prior?.summary]
  ]);

  const returnSignalItems = compactDescriptionItems([
    ["Command", detail.return_signal?.command],
    ["Metric", detail.return_signal?.metric],
    ["Validity", detail.return_signal?.validity_criteria]
  ]);

  return (
    <div className="detailContent">
      <div className="detailTitleRow">
        <div>
          <div className="eyebrow">Selected Node</div>
          <h2>{node.title || node.id}</h2>
        </div>
        <div className="detailTags">
          {node.active ? <Tag color="green">active</Tag> : null}
          {node.on_active_path ? <Tag color="gold">active path</Tag> : null}
        </div>
      </div>
      <Tabs
        animated={false}
        items={[
          {
            key: "overview",
            label: "Overview",
            forceRender: true,
            children: <Descriptions size="small" column={1} bordered items={overviewItems} />
          },
          {
            key: "artifacts",
            label: "Artifacts",
            forceRender: true,
            children: (
              <List
                className="artifactList"
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No artifacts" /> }}
                dataSource={artifacts}
                renderItem={(artifact) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <span className="artifactTitle">
                          {artifact.title || artifact.id}
                          <Tag>{artifact.type}</Tag>
                        </span>
                      }
                      description={<ArtifactDescription artifact={artifact} />}
                    />
                  </List.Item>
                )}
              />
            )
          },
          {
            key: "prior",
            label: "Prior",
            forceRender: true,
            children:
              researchPriorItems.length > 0 ? (
                <Descriptions size="small" column={1} bordered items={researchPriorItems} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No research prior" />
              )
          },
          {
            key: "return",
            label: "Return",
            forceRender: true,
            children:
              returnSignalItems.length > 0 ? (
                <Descriptions size="small" column={1} bordered items={returnSignalItems} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No return signal" />
              )
          }
        ]}
      />
    </div>
  );
}

function ArtifactDescription({ artifact }: { artifact: SupportingArtifact }) {
  const rows = [
    artifact.id ? `ID: ${artifact.id}` : "",
    artifact.impact ? `Impact: ${artifact.impact}` : "",
    artifact.validity ? `Validity: ${artifact.validity}` : "",
    artifact.trust_state ? `Trust: ${artifact.trust_state}` : "",
    artifact.path ? `Path: ${artifact.path}` : ""
  ].filter(Boolean);

  return <span>{rows.join(" · ")}</span>;
}

function compactDescriptionItems(items: Array<[string, React.ReactNode | undefined]>) {
  return items
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, children], index) => ({
      key: `${label}-${index}`,
      label,
      children
    }));
}

function stablePosition(node: ResearchGraphNode, index: number, activePath: string[]) {
  if (isFinitePosition(node.position)) {
    return node.position;
  }

  const activeIndex = activePath.indexOf(node.id);
  if (activeIndex >= 0) {
    return {
      x: activeIndex * 300,
      y: 96
    };
  }

  const columns = 4;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: column * 280,
    y: 300 + row * 180
  };
}

function isFinitePosition(position: ResearchGraphNode["position"]): position is { x: number; y: number } {
  return Boolean(position && Number.isFinite(position.x) && Number.isFinite(position.y));
}

function nodeClassName(node: ResearchGraphNode, selected: boolean) {
  return [
    "researchNode",
    `state-${node.state}`,
    node.active ? "activeNode" : "",
    node.on_active_path ? "activePathNode" : "",
    selected ? "selectedNode" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function healthColor(status: string) {
  if (status === "pass") {
    return "green";
  }
  if (status === "fail") {
    return "red";
  }
  return "gold";
}

function stateColor(state: ResearchGraphNode["state"]) {
  switch (state) {
    case "supported":
      return "green";
    case "repairable":
      return "gold";
    case "dead":
      return "red";
    default:
      return "default";
  }
}

function healthDescription(graph: LabGraph) {
  const count = graph.health?.finding_count;
  if (typeof count === "number") {
    return `${count} finding${count === 1 ? "" : "s"}`;
  }
  return graph.generated_at ? `Generated ${graph.generated_at}` : undefined;
}
