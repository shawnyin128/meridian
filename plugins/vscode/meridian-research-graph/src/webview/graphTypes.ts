export type ResearchNodeState = "unresolved" | "repairable" | "supported" | "dead";

export type ResearchEdgeStrength = "weak" | "normal" | "strong";

export interface GraphPosition {
  x: number;
  y: number;
}

export interface ResearchGraphNode {
  id: string;
  thread_id: string;
  raw_id?: string;
  title: string;
  label?: string;
  kind: string;
  state: ResearchNodeState;
  active?: boolean;
  on_active_path?: boolean;
  stale?: boolean;
  needs_attention?: boolean;
  source_path?: string;
  markdown_path: string;
  markdown_anchor: string;
  updated?: string;
  position?: GraphPosition;
}

export interface ResearchGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  strength?: ResearchEdgeStrength;
  on_active_path?: boolean;
}

export interface ResearchPriorDetail {
  status?: string;
  summary?: string;
}

export interface ReturnSignalDetail {
  command?: string;
  metric?: string;
  validity_criteria?: string;
}

export interface ResearchNodeDetail {
  thread_id?: string;
  raw_id?: string;
  title?: string;
  parent?: string;
  doing?: string;
  why?: string;
  next_action?: string;
  source_path?: string;
  research_prior?: ResearchPriorDetail;
  return_signal?: ReturnSignalDetail;
}

export interface SupportingArtifact {
  type: string;
  id: string;
  title?: string;
  validity?: string;
  impact?: string;
  path?: string;
  trust_state?: string;
}

export interface LabGraphHealth {
  status: string;
  finding_count?: number;
}

export interface LabGraph {
  schema: "meridian.lab.graph.v1";
  generated_at: string;
  lab_root: string;
  source_files: string[];
  active_thread: string;
  active_path: string[];
  nodes: ResearchGraphNode[];
  edges: ResearchGraphEdge[];
  node_details: Record<string, ResearchNodeDetail>;
  supporting_artifacts: Record<string, SupportingArtifact[]>;
  health: LabGraphHealth;
}

export function normalizeLabGraph(value: unknown): LabGraph | null {
  if (!isRecord(value) || value.schema !== "meridian.lab.graph.v1") {
    return null;
  }

  if (
    !isString(value.generated_at) ||
    !isString(value.lab_root) ||
    !isString(value.active_thread) ||
    !isStringArray(value.source_files) ||
    !isStringArray(value.active_path) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    !isRecord(value.node_details) ||
    !isRecord(value.supporting_artifacts) ||
    !isRecord(value.health) ||
    !isString(value.health.status) ||
    !value.nodes.every(isResearchGraphNode) ||
    !value.edges.every(isResearchGraphEdge)
  ) {
    return null;
  }

  return value as unknown as LabGraph;
}

function isResearchGraphNode(value: unknown): value is ResearchGraphNode {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.thread_id) &&
    isString(value.title) &&
    value.kind === "research_point" &&
    isResearchNodeState(value.state) &&
    isString(value.markdown_path) &&
    isString(value.markdown_anchor) &&
    (value.position === undefined || isGraphPosition(value.position))
  );
}

function isResearchGraphEdge(value: unknown): value is ResearchGraphEdge {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.source) &&
    isString(value.target) &&
    isString(value.kind)
  );
}

function isResearchNodeState(value: unknown): value is ResearchNodeState {
  return value === "unresolved" || value === "repairable" || value === "supported" || value === "dead";
}

function isGraphPosition(value: unknown): value is GraphPosition {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
