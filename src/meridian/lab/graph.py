from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.lab.state import ALLOWED_NODE_MODES
from meridian.wiki.corpus import parse_frontmatter, strip_frontmatter


LAB_GRAPH_SCHEMA_VERSION = "meridian.lab.graph.v1"
LAB_GRAPH_HEALTH_SCHEMA_VERSION = "meridian.lab.graph_health.v1"
LAB_UPDATE_SCHEMA_VERSION = "meridian.lab.update.v1"

ALLOWED_EDGE_KINDS = {
    "continues",
    "branches_from",
    "related_to",
    "blocks",
    "supersedes",
    "contradicts",
    "supports_direction",
}

ALLOWED_ARTIFACT_TYPES = {
    "experiment",
    "wiki_prior",
    "paper",
    "implementation_link",
    "code_reference",
    "finding_proposal",
    "research_grounding_injection",
}


@dataclass(frozen=True)
class LabGraphBuildResult:
    graph: dict[str, Any]
    lab_root: Path
    source_files: list[Path]
    health: dict[str, Any]


def materialize_lab_graph(root: Path) -> LabGraphBuildResult:
    lab_root = _lab_root(root)
    state = _frontmatter(lab_root / "state.md")
    active_thread = str(state.get("active_thread") or "").strip()
    active_path = _as_list(state.get("active_path"))
    threads = sorted((lab_root / "threads").glob("*.md")) if (lab_root / "threads").exists() else []
    threads = [path for path in threads if path.name != "index.md"]

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    node_details: dict[str, dict[str, Any]] = {}
    supporting_artifacts: dict[str, list[dict[str, Any]]] = {}
    source_files = [lab_root / "state.md", *threads]

    for thread_path in threads:
        thread_id = thread_path.stem
        text = thread_path.read_text(encoding="utf-8")
        frontmatter = parse_frontmatter(text)
        active_node = str(frontmatter.get("active_node") or "").strip()
        for node in _parse_thread_nodes(thread_id, thread_path, text, active_node=active_node, active_path=active_path):
            nodes.append(node["node"])
            node_details[node["node"]["id"]] = node["details"]
            supporting_artifacts[node["node"]["id"]] = node["artifacts"]
            if node["parent"]:
                parent_id = _node_ref(thread_id, node["parent"])
                edges.append(
                    {
                        "id": f"edge.{parent_id}.{node['raw_id']}",
                        "source": parent_id,
                        "target": node["node"]["id"],
                        "kind": "continues",
                        "strength": "strong",
                        "on_active_path": _edge_on_active_path(parent_id, node["node"]["id"], active_path),
                    }
                )
        edges.extend(_parse_graph_relations(thread_id, text, active_path))

    graph = {
        "schema": LAB_GRAPH_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "lab_root": ".meridian",
        "source_files": [_display_path(path, lab_root=lab_root.parent) for path in source_files if path.exists()],
        "active_thread": active_thread,
        "active_path": active_path,
        "nodes": nodes,
        "edges": _dedupe_edges(edges),
        "node_details": node_details,
        "supporting_artifacts": supporting_artifacts,
        "health": {"status": "unknown", "findings": []},
    }
    health = check_lab_graph_payload(graph, lab_root=lab_root)
    graph["health"] = {"status": health["status"], "finding_count": len(health["findings"])}
    return LabGraphBuildResult(graph=graph, lab_root=lab_root, source_files=source_files, health=health)


def check_lab_graph(root: Path) -> dict[str, Any]:
    result = materialize_lab_graph(root)
    graph_path = result.lab_root / "graph" / "graph.json"
    if not graph_path.exists():
        health = dict(result.health)
        health["findings"] = [
            *health["findings"],
            {
                "severity": "warning",
                "code": "graph_json_missing",
                "path": "graph/graph.json",
                "message": "Generated graph JSON is missing; run graph-refresh.",
            },
        ]
        health["status"] = _health_status(health["findings"])
        return health

    try:
        loaded = json.loads(graph_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return _graph_health(
            result.lab_root,
            [
                {
                    "severity": "error",
                    "code": "graph_json_invalid",
                    "path": "graph/graph.json",
                    "message": f"Generated graph JSON is invalid: {exc.msg}.",
                }
            ],
        )

    if not isinstance(loaded, dict):
        return _graph_health(
            result.lab_root,
            [
                {
                    "severity": "error",
                    "code": "graph_json_not_object",
                    "path": "graph/graph.json",
                    "message": "Generated graph JSON must contain an object payload.",
                }
            ],
        )

    health = dict(check_lab_graph_payload(loaded, lab_root=result.lab_root))
    findings = list(health["findings"])
    if _stable_graph_payload(loaded) != _stable_graph_payload(result.graph):
        findings.append(
            {
                "severity": "warning",
                "code": "graph_json_stale",
                "path": "graph/graph.json",
                "message": "Generated graph JSON does not match the current Lab Markdown state; run graph-refresh.",
            }
        )
    health["findings"] = findings
    health["status"] = _health_status(findings)
    return health


def write_lab_graph(root: Path) -> LabGraphBuildResult:
    result = materialize_lab_graph(root)
    graph_dir = result.lab_root / "graph"
    graph_dir.mkdir(parents=True, exist_ok=True)
    (graph_dir / "graph.json").write_text(
        json.dumps(result.graph, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (graph_dir / "graph-health.json").write_text(
        json.dumps(result.health, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (graph_dir / "graph.schema.json").write_text(
        json.dumps(_graph_schema(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return result


def check_lab_graph_payload(graph: dict[str, Any], lab_root: Path) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []

    def add(severity: str, code: str, message: str, path: Path | str | None = None) -> None:
        finding: dict[str, Any] = {"severity": severity, "code": code, "message": message}
        if path is not None:
            finding["path"] = _display_path(path, lab_root=lab_root.parent) if isinstance(path, Path) else path
        findings.append(finding)

    if not isinstance(graph, dict):
        return _graph_health(
            lab_root,
            [
                {
                    "severity": "error",
                    "code": "graph_payload_not_object",
                    "path": "graph",
                    "message": "Graph payload must be an object.",
                }
            ],
        )

    required_top_level_fields = (
        "schema",
        "generated_at",
        "lab_root",
        "source_files",
        "active_thread",
        "active_path",
        "nodes",
        "edges",
        "node_details",
        "supporting_artifacts",
        "health",
    )
    for field in required_top_level_fields:
        if field not in graph:
            add("error", "missing_top_level_field", f"Graph payload is missing top-level field `{field}`.", field)

    schema_value = graph.get("schema")
    if not isinstance(schema_value, str) or schema_value != LAB_GRAPH_SCHEMA_VERSION:
        add("error", "invalid_graph_schema", "Graph payload has an unexpected schema.", "schema")

    generated_at_value = graph.get("generated_at")
    if not isinstance(generated_at_value, str):
        add("error", "invalid_generated_at", "Graph payload field `generated_at` must be a string.", "generated_at")

    lab_root_value = graph.get("lab_root")
    if not isinstance(lab_root_value, str):
        add("error", "invalid_lab_root", "Graph payload field `lab_root` must be a string.", "lab_root")

    source_files_value = graph.get("source_files")
    if not isinstance(source_files_value, list):
        add("error", "invalid_source_files", "Graph payload field `source_files` must be a list.", "source_files")

    active_thread_value = graph.get("active_thread")
    if not isinstance(active_thread_value, str):
        add(
            "error",
            "invalid_active_thread",
            "Graph payload field `active_thread` must be a string.",
            "active_thread",
        )

    health_value = graph.get("health")
    if not isinstance(health_value, dict):
        add("error", "invalid_health", "Graph payload field `health` must be an object.", "health")

    try:
        json.dumps(graph, sort_keys=True)
    except TypeError as exc:
        add("error", "graph_not_json_serializable", str(exc), "graph")

    nodes_value = graph.get("nodes")
    if not isinstance(nodes_value, list):
        add("error", "invalid_nodes", "Graph payload field `nodes` must be a list.", "nodes")
        nodes = []
    else:
        nodes = nodes_value
    node_ids: set[str] = set()
    required_node_fields = ("id", "title", "state", "markdown_path", "markdown_anchor")
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            add("error", "invalid_node", "Graph node is not an object.", f"nodes/{index}")
            continue
        for field in required_node_fields:
            if not str(node.get(field) or "").strip():
                add("error", "missing_node_field", f"Graph node is missing `{field}`.", f"nodes/{index}/{field}")
        node_id = str(node.get("id") or "")
        if not node_id:
            continue
        if node_id in node_ids:
            add("error", "duplicate_node_id", f"Graph node `{node_id}` appears more than once.", f"nodes/{index}/id")
        node_ids.add(node_id)
        state = str(node.get("state") or "")
        if state not in ALLOWED_NODE_MODES:
            add(
                "error",
                "invalid_node_state",
                f"Graph node `{node_id}` uses invalid state `{state}`.",
                f"nodes/{index}/state",
            )
        markdown_path = str(node.get("markdown_path") or "")
        if _path_starts_with_meridian(markdown_path) and not (lab_root.parent / markdown_path).exists():
            add(
                "error",
                "node_markdown_path_missing",
                f"Graph node `{node_id}` markdown path `{markdown_path}` does not exist.",
                markdown_path,
            )

    edges_value = graph.get("edges")
    if not isinstance(edges_value, list):
        add("error", "invalid_edges", "Graph payload field `edges` must be a list.", "edges")
        edges = []
    else:
        edges = edges_value
    edge_ids: set[str] = set()
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            add("error", "invalid_edge", "Graph edge is not an object.", f"edges/{index}")
            continue
        edge_id = str(edge.get("id") or "")
        if edge_id and edge_id in edge_ids:
            add("error", "duplicate_edge_id", f"Graph edge `{edge_id}` appears more than once.", f"edges/{index}/id")
        if edge_id:
            edge_ids.add(edge_id)
        kind = str(edge.get("kind") or "")
        if kind not in ALLOWED_EDGE_KINDS:
            add("error", "invalid_edge_kind", f"Graph edge `{edge_id}` uses invalid kind `{kind}`.", f"edges/{index}/kind")
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if not source or source not in node_ids:
            add(
                "error",
                "dangling_edge_source",
                f"Graph edge `{edge_id}` source `{source}` is not a materialized node.",
                f"edges/{index}/source",
            )
        if not target or target not in node_ids:
            add(
                "error",
                "dangling_edge_target",
                f"Graph edge `{edge_id}` target `{target}` is not a materialized node.",
                f"edges/{index}/target",
            )

    active_path_value = graph.get("active_path")
    if not isinstance(active_path_value, list):
        add("error", "invalid_active_path", "Graph payload field `active_path` must be a list.", "active_path")
        active_path = []
    else:
        active_path = active_path_value
    for active_index, node_id in enumerate(active_path):
        if str(node_id) not in node_ids:
            add(
                "error",
                "invalid_active_path_node",
                f"Active path node `{node_id}` is not a materialized node.",
                f"active_path/{active_index}",
            )

    node_details = graph.get("node_details")
    if not isinstance(node_details, dict):
        add("error", "invalid_node_details", "Graph payload field `node_details` must be an object.", "node_details")

    supporting_artifacts_value = graph.get("supporting_artifacts")
    if not isinstance(supporting_artifacts_value, dict):
        add(
            "error",
            "invalid_supporting_artifacts",
            "Graph payload field `supporting_artifacts` must be an object.",
            "supporting_artifacts",
        )
        supporting_artifacts = {}
    else:
        supporting_artifacts = supporting_artifacts_value
    for node_id, artifacts in supporting_artifacts.items():
        if node_id not in node_ids:
            add(
                "warning",
                "artifact_node_missing",
                f"Supporting artifacts refer to missing node `{node_id}`.",
                "supporting_artifacts",
            )
        if not isinstance(artifacts, list):
            add(
                "error",
                "invalid_supporting_artifacts",
                f"Supporting artifacts for node `{node_id}` must be a list.",
                f"supporting_artifacts/{node_id}",
            )
            continue
        for artifact_index, artifact in enumerate(artifacts):
            if not isinstance(artifact, dict):
                add(
                    "error",
                    "invalid_supporting_artifact",
                    f"Supporting artifact `{artifact_index}` for node `{node_id}` must be an object.",
                    f"supporting_artifacts/{node_id}/{artifact_index}",
                )
                continue
            artifact_type = str(artifact.get("type") or "")
            if artifact_type not in ALLOWED_ARTIFACT_TYPES:
                add(
                    "warning",
                    "invalid_artifact_type",
                    f"Artifact `{artifact.get('id')}` uses type `{artifact_type}`.",
                    f"supporting_artifacts/{node_id}/{artifact_index}/type",
                )
            artifact_path = str(artifact.get("path") or "")
            if _path_starts_with_meridian(artifact_path) and not (lab_root.parent / artifact_path).exists():
                add(
                    "error",
                    "artifact_path_missing",
                    f"Artifact `{artifact.get('id')}` path `{artifact_path}` does not exist.",
                    artifact_path,
                )

    return _graph_health(lab_root, findings)


def _graph_health(lab_root: Path, findings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema": LAB_GRAPH_HEALTH_SCHEMA_VERSION,
        "status": _health_status(findings),
        "lab_root": str(lab_root),
        "findings": findings,
    }


def _health_status(findings: list[dict[str, Any]]) -> str:
    if any(finding["severity"] == "error" for finding in findings):
        return "fail"
    if any(finding["severity"] == "warning" for finding in findings):
        return "warn"
    return "pass"


def _stable_graph_payload(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _stable_graph_payload(item)
            for key, item in value.items()
            if key not in {"generated_at", "health"}
        }
    if isinstance(value, list):
        return [_stable_graph_payload(item) for item in value]
    return value


def _graph_schema() -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": LAB_GRAPH_SCHEMA_VERSION,
        "title": "Meridian Lab Graph",
        "type": "object",
        "required": [
            "schema",
            "generated_at",
            "lab_root",
            "source_files",
            "active_thread",
            "active_path",
            "nodes",
            "edges",
            "node_details",
            "supporting_artifacts",
            "health",
        ],
        "properties": {
            "schema": {"const": LAB_GRAPH_SCHEMA_VERSION},
            "nodes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "title", "state", "markdown_path", "markdown_anchor"],
                    "properties": {
                        "id": {"type": "string"},
                        "title": {"type": "string"},
                        "state": {"enum": sorted(ALLOWED_NODE_MODES)},
                        "markdown_path": {"type": "string"},
                        "markdown_anchor": {"type": "string"},
                    },
                },
            },
            "edges": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["source", "target", "kind"],
                    "properties": {
                        "source": {"type": "string"},
                        "target": {"type": "string"},
                        "kind": {"enum": sorted(ALLOWED_EDGE_KINDS)},
                    },
                },
            },
        },
    }


def _lab_root(root: Path) -> Path:
    return root if root.name == ".meridian" else root / ".meridian"


def _frontmatter(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return parse_frontmatter(path.read_text(encoding="utf-8"))


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    raw = str(value).strip()
    if not raw or raw == "[]":
        return []
    if raw.startswith("[") and raw.endswith("]"):
        return [item.strip().strip('"').strip("'") for item in raw[1:-1].split(",") if item.strip()]
    return [raw]


def _parse_thread_nodes(
    thread_id: str,
    thread_path: Path,
    text: str,
    *,
    active_node: str,
    active_path: list[str],
) -> list[dict[str, Any]]:
    markdown = strip_frontmatter(text)
    matches = list(re.finditer(r"^### Node\s+([^:\n]+)(?::\s*(.*))?$", markdown, flags=re.MULTILINE))
    parsed: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        raw_id = match.group(1).strip()
        title = (match.group(2) or "").strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        body = markdown[start:end].strip()
        node_id = f"{thread_id}.{raw_id}"
        mode = _node_field(body, "mode") or "unresolved"
        parent = _node_field(body, "parent")
        active_field = _node_field(body, "active")
        active = _parse_bool(active_field) if active_field else raw_id == active_node
        project_root = thread_path.parents[1].parent
        node = {
            "id": node_id,
            "thread_id": thread_id,
            "raw_id": raw_id,
            "title": title,
            "label": title or raw_id,
            "state": mode,
            "active": active,
            "on_active_path": node_id in active_path,
            "source_path": _display_path(thread_path, lab_root=project_root),
            "markdown_path": _display_path(thread_path, lab_root=project_root),
            "markdown_anchor": _markdown_anchor(raw_id),
        }
        parsed.append(
            {
                "node": node,
                "raw_id": raw_id,
                "parent": parent,
                "details": {
                    "thread_id": thread_id,
                    "raw_id": raw_id,
                    "title": title,
                    "parent": parent,
                    "next_action": _extract_next_action(body),
                    "source_path": node["source_path"],
                },
                "artifacts": _parse_supporting_artifacts(body),
            }
        )
    return parsed


def _parse_graph_relations(thread_id: str, text: str, active_path: list[str]) -> list[dict[str, Any]]:
    section = _extract_heading_section(strip_frontmatter(text), "Graph Relations")
    if not section:
        return []
    edges: list[dict[str, Any]] = []
    for row in _parse_markdown_table(section):
        source = _node_ref(thread_id, row.get("source") or row.get("from") or "")
        target = _node_ref(thread_id, row.get("target") or row.get("to") or "")
        kind = _clean_scalar(str(row.get("relation") or row.get("kind") or row.get("type") or "related_to")) or "related_to"
        if not source or not target:
            continue
        edge = {
            "id": str(row.get("id") or f"edge.{source}.{kind}.{target}"),
            "source": source,
            "target": target,
            "kind": kind,
            "strength": _clean_scalar(str(row.get("strength") or "normal")) or "normal",
            "on_active_path": _edge_on_active_path(source, target, active_path),
        }
        edges.append(edge)
    for line in section.splitlines():
        match = re.match(r"^\s*-\s*`?([^`\s]+)`?\s+([a-z_]+)\s+`?([^`\s]+)`?", line)
        if not match:
            continue
        source = _node_ref(thread_id, match.group(1))
        kind = match.group(2).strip()
        target = _node_ref(thread_id, match.group(3))
        edges.append(
            {
                "id": f"edge.{source}.{kind}.{target}",
                "source": source,
                "target": target,
                "kind": kind,
                "strength": "normal",
                "on_active_path": _edge_on_active_path(source, target, active_path),
            }
        )
    return edges


def _parse_supporting_artifacts(body: str) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    experiments = _extract_heading_section(body, "Experiments")
    for line in experiments.splitlines():
        match = re.match(r"^\s*-\s*(.+?)\s*$", line)
        if not match:
            continue
        experiment_id = _clean_scalar(match.group(1))
        if not experiment_id:
            continue
        artifacts.append(
            {
                "type": "experiment",
                "id": experiment_id,
                "title": "",
                "impact": "referenced",
                "path": f".meridian/experiments/{experiment_id}.md",
            }
        )

    supporting = _extract_heading_section(body, "Supporting Artifacts")
    for row in _parse_markdown_table(supporting):
        artifact_type = str(row.get("type") or "").strip()
        artifact_id = str(row.get("id") or "").strip()
        if not artifact_id:
            continue
        artifacts.append(
            {
                "type": artifact_type,
                "id": artifact_id,
                "title": str(row.get("title") or "").strip(),
                "impact": str(row.get("impact") or "").strip(),
                "path": str(row.get("path") or "").strip(),
            }
        )
    return _dedupe_artifacts(artifacts)


def _extract_next_action(body: str) -> str:
    section = _extract_heading_section(body, "Next Action")
    return "\n".join(line.strip() for line in section.splitlines() if line.strip())


def _dedupe_edges(edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str, str]] = set()
    result: list[dict[str, Any]] = []
    for edge in edges:
        key = (
            str(edge.get("id") or ""),
            str(edge.get("source") or ""),
            str(edge.get("target") or ""),
            str(edge.get("kind") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        result.append(edge)
    return result


def _edge_on_active_path(source: str, target: str, active_path: list[str]) -> bool:
    return any(left == source and right == target for left, right in zip(active_path, active_path[1:]))


def _display_path(path: Path | str, *, lab_root: Path) -> str:
    path = Path(path)
    try:
        return path.relative_to(lab_root).as_posix()
    except ValueError:
        return str(path)


def _markdown_anchor(raw_id: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", raw_id.strip().lower()).strip("-") or "node"


def _path_starts_with_meridian(path: str) -> bool:
    return path.replace("\\", "/").startswith(".meridian/")


def _node_field(body: str, name: str) -> str:
    match = re.search(rf"^\s*-\s*{re.escape(name)}:\s*(.+?)\s*$", body, flags=re.MULTILINE)
    return _clean_scalar(match.group(1)) if match else ""


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"true", "yes", "1"}


def _clean_scalar(value: str) -> str:
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1].strip()
    value = value.strip("`").strip()
    if value.startswith("[") and "](" in value:
        match = re.match(r"\[([^\]]+)\]\([^)]+\)", value)
        if match:
            value = match.group(1)
    return value.strip().strip('"').strip("'")


def _extract_heading_section(markdown: str, heading: str) -> str:
    pattern = rf"^####\s+{re.escape(heading)}\s*$"
    match = re.search(pattern, markdown, flags=re.MULTILINE)
    if not match:
        pattern = rf"^##+\s+{re.escape(heading)}\s*$"
        match = re.search(pattern, markdown, flags=re.MULTILINE)
    if not match:
        return ""
    start = match.end()
    next_heading = re.search(r"^#{2,4}\s+", markdown[start:], flags=re.MULTILINE)
    end = start + next_heading.start() if next_heading else len(markdown)
    return markdown[start:end].strip()


def _parse_markdown_table(markdown: str) -> list[dict[str, str]]:
    rows = [line.strip() for line in markdown.splitlines() if line.strip().startswith("|")]
    if len(rows) < 2:
        return []
    headers = [_normalize_header(cell) for cell in rows[0].strip("|").split("|")]
    result: list[dict[str, str]] = []
    for row in rows[2:]:
        cells = [cell.strip() for cell in row.strip("|").split("|")]
        if not cells or all(set(cell) <= {"-"} for cell in cells if cell):
            continue
        payload = {headers[index]: cells[index].strip() for index in range(min(len(headers), len(cells)))}
        result.append(payload)
    return result


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _node_ref(thread_id: str, value: str) -> str:
    value = _clean_scalar(value)
    if not value:
        return ""
    return value if "." in value else f"{thread_id}.{value}"


def _dedupe_artifacts(artifacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    result: list[dict[str, Any]] = []
    for artifact in artifacts:
        key = (
            str(artifact.get("type") or ""),
            str(artifact.get("id") or ""),
            str(artifact.get("path") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        result.append(artifact)
    return result
