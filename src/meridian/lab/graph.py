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
                edges.append(
                    {
                        "id": f"edge.{thread_id}.{node['parent']}.{node['raw_id']}",
                        "source": f"{thread_id}.{node['parent']}",
                        "target": node["node"]["id"],
                        "kind": "continues",
                        "strength": "strong",
                        "on_active_path": _edge_on_active_path(f"{thread_id}.{node['parent']}", node["node"]["id"], active_path),
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


def check_lab_graph_payload(graph: dict[str, Any], *, lab_root: Path) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []

    def add(severity: str, code: str, message: str, path: Path | str | None = None) -> None:
        finding: dict[str, Any] = {"severity": severity, "code": code, "message": message}
        if path is not None:
            finding["path"] = _display_path(path, lab_root=lab_root.parent)
        findings.append(finding)

    if graph.get("schema") != LAB_GRAPH_SCHEMA_VERSION:
        add("error", "invalid_graph_schema", "Graph payload has an unexpected schema.", lab_root)

    try:
        json.dumps(graph, sort_keys=True)
    except TypeError as exc:
        add("error", "graph_not_json_serializable", str(exc), lab_root)

    nodes = graph.get("nodes") or []
    node_ids: set[str] = set()
    for node in nodes:
        node_id = str(node.get("id") or "")
        if not node_id:
            add("error", "node_without_id", "Graph node is missing an id.")
            continue
        if node_id in node_ids:
            add("error", "duplicate_node_id", f"Graph node `{node_id}` appears more than once.")
        node_ids.add(node_id)
        state = str(node.get("state") or "")
        if state not in ALLOWED_NODE_MODES:
            add("error", "invalid_node_state", f"Graph node `{node_id}` uses invalid state `{state}`.")

    edge_ids: set[str] = set()
    for edge in graph.get("edges") or []:
        edge_id = str(edge.get("id") or "")
        if edge_id and edge_id in edge_ids:
            add("error", "duplicate_edge_id", f"Graph edge `{edge_id}` appears more than once.")
        if edge_id:
            edge_ids.add(edge_id)
        kind = str(edge.get("kind") or "")
        if kind not in ALLOWED_EDGE_KINDS:
            add("error", "invalid_edge_kind", f"Graph edge `{edge_id}` uses invalid kind `{kind}`.")
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if source and source not in node_ids:
            add("warning", "edge_source_missing", f"Graph edge `{edge_id}` source `{source}` is not a materialized node.")
        if target and target not in node_ids:
            add("warning", "edge_target_missing", f"Graph edge `{edge_id}` target `{target}` is not a materialized node.")

    for node_id, artifacts in (graph.get("supporting_artifacts") or {}).items():
        if node_id not in node_ids:
            add("warning", "artifact_node_missing", f"Supporting artifacts refer to missing node `{node_id}`.")
        for artifact in artifacts:
            artifact_type = str(artifact.get("type") or "")
            if artifact_type not in ALLOWED_ARTIFACT_TYPES:
                add("warning", "invalid_artifact_type", f"Artifact `{artifact.get('id')}` uses type `{artifact_type}`.")

    status = "fail" if any(finding["severity"] == "error" for finding in findings) else "pass"
    return {
        "schema": LAB_GRAPH_HEALTH_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": status,
        "lab_root": _display_path(lab_root, lab_root=lab_root.parent),
        "findings": findings,
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
        active = _parse_bool(_node_field(body, "active")) or raw_id == active_node or node_id in active_path
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
        kind = str(row.get("kind") or row.get("type") or "related_to").strip() or "related_to"
        if not source or not target:
            continue
        edge = {
            "id": str(row.get("id") or f"edge.{source}.{kind}.{target}"),
            "source": source,
            "target": target,
            "kind": kind,
            "strength": str(row.get("strength") or "normal").strip() or "normal",
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
