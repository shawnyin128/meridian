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
