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
LAB_APPLY_UPDATE_SCHEMA_VERSION = "meridian.lab.apply_update.v1"

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

ALLOWED_UPDATE_OPS = {
    "create_node",
    "update_node",
    "create_edge",
    "update_edge",
    "attach_artifact",
    "detach_artifact",
    "set_active_thread",
    "set_active_path",
    "record_history",
}

ALLOWED_UPDATE_NODE_FIELDS = {
    "state",
    "title",
    "doing",
    "why",
    "next_action",
    "research_prior",
    "return_signal",
}

STRING_UPDATE_NODE_FIELDS = {
    "title",
    "doing",
    "why",
    "next_action",
    "research_prior",
    "return_signal",
}

APPLY_SUPPORTED_OPS = {"update_node", "attach_artifact", "record_history", "set_active_path", "set_active_thread"}
APPLY_SUPPORTED_UPDATE_NODE_FIELDS = {"state", "next_action"}

CONFIRMATION_REQUIRED_FIELDS = {
    "state:repairable",
    "state:dead",
    "create_node",
    "set_active_thread",
    "set_active_path",
    "detach_artifact",
}
CONFIRMATION_REQUIRED_OPS = {"create_node", "set_active_thread", "set_active_path", "detach_artifact"}


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
        raw_graph = graph_path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        return _graph_health(
            result.lab_root,
            [
                {
                    "severity": "error",
                    "code": "graph_json_invalid_encoding",
                    "path": "graph/graph.json",
                    "message": f"Generated graph JSON is not valid UTF-8: {exc.reason}.",
                }
            ],
        )
    except OSError as exc:
        return _graph_health(
            result.lab_root,
            [
                {
                    "severity": "error",
                    "code": "graph_json_unreadable",
                    "path": "graph/graph.json",
                    "message": f"Generated graph JSON could not be read: {exc}.",
                }
            ],
        )

    try:
        loaded = json.loads(raw_graph)
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
    if isinstance(loaded.get("health"), dict) and loaded.get("health") != result.graph.get("health"):
        findings.append(
            {
                "severity": "warning",
                "code": "graph_health_stale",
                "path": "graph/graph.json/health",
                "message": "Generated graph health summary does not match the current Lab Markdown state; run graph-refresh.",
            }
        )
    findings.extend(_check_graph_health_file(result.lab_root, result.health))
    health["findings"] = findings
    health["status"] = _health_status(findings)
    return health


def validate_lab_update_packet(root: Path, packet: dict[str, Any]) -> dict[str, Any]:
    lab_root = _lab_root(root)
    graph = materialize_lab_graph(root).graph
    node_ids = {node["id"] for node in graph["nodes"]}
    edge_pairs = {
        (str(edge.get("source") or ""), str(edge.get("target") or ""))
        for edge in graph["edges"]
        if str(edge.get("source") or "") and str(edge.get("target") or "")
    }
    findings: list[dict[str, str]] = []

    def add(code: str, message: str, path: str = "<packet>") -> None:
        findings.append({"severity": "error", "code": code, "path": path, "message": message})

    def require_confirmation(reason: str, path: str) -> None:
        if confirmation_status != "accepted" or reason not in confirmation_required_for:
            add("confirmation_required", f"{reason} requires accepted user confirmation.", path)

    def validate_node_id(node_id: str, path: str, *, must_exist: bool | None = None) -> bool:
        if not node_id:
            add("missing_node_id", "Change requires a non-empty node_id.", path)
            return False
        if not _is_well_formed_node_id(node_id):
            add("invalid_node_id", f"Node id `{node_id}` is not well-formed.", path)
            return False
        if must_exist is True and node_id not in node_ids:
            add("node_missing", f"Node `{node_id}` does not exist.", path)
            return False
        if must_exist is False and node_id in node_ids:
            add("node_already_exists", f"Node `{node_id}` already exists.", path)
            return False
        return True

    def validate_edge_endpoint(change: dict[str, Any], index: int, field: str) -> None:
        endpoint = str(change.get(field) or "").strip()
        path = f"changes[{index}].{field}"
        if not endpoint:
            add(f"missing_edge_{field}", f"{field} node id is required.", path)
            return
        if not _is_well_formed_node_id(endpoint):
            add(f"invalid_edge_{field}", f"{field} node id `{endpoint}` is not well-formed.", path)
            return
        if endpoint not in node_ids:
            add(f"edge_{field}_missing", f"{field} node `{endpoint}` does not exist.", path)

    def validate_update_fields(fields: dict[str, Any], index: int) -> None:
        for field in sorted(fields):
            if field not in ALLOWED_UPDATE_NODE_FIELDS:
                add(
                    "invalid_update_field",
                    f"update_node field `{field}` is not allowed.",
                    f"changes[{index}].fields.{field}",
                )
        for field in sorted(STRING_UPDATE_NODE_FIELDS & fields.keys()):
            value = fields[field]
            if not isinstance(value, str) or not value.strip():
                add(
                    "invalid_update_field_value",
                    f"update_node field `{field}` must be a non-empty string.",
                    f"changes[{index}].fields.{field}",
                )
        if "state" in fields:
            value = fields["state"]
            if not isinstance(value, str) or not value.strip():
                add("invalid_node_state", "Node state must be a non-empty string.", f"changes[{index}].fields.state")
                return
            state = value.strip()
            if state not in ALLOWED_NODE_MODES:
                add("invalid_node_state", f"Node state `{state}` is not allowed.", f"changes[{index}].fields.state")
            if state in {"repairable", "dead"}:
                require_confirmation(f"state:{state}", f"changes[{index}]")

    def validate_active_thread(change: dict[str, Any], index: int) -> None:
        if "thread_id" in change:
            thread_id = str(change.get("thread_id") or "").strip()
        elif "target_thread" in change:
            thread_id = str(change.get("target_thread") or "").strip()
        else:
            thread_id = target_thread
        if not thread_id:
            add("missing_active_thread", "set_active_thread requires a non-empty thread id.", f"changes[{index}]")
        elif not _is_well_formed_thread_id(thread_id):
            add("invalid_active_thread", f"Active thread `{thread_id}` is not well-formed.", f"changes[{index}]")
        elif not (lab_root / "threads" / f"{thread_id}.md").exists():
            add("active_thread_missing", f"Active thread `{thread_id}` does not exist.", f"changes[{index}]")

    def validate_active_path(change: dict[str, Any], index: int) -> None:
        path_value = change.get("path", change.get("active_path"))
        if not isinstance(path_value, list) or not path_value:
            add("missing_active_path", "set_active_path requires a non-empty path list.", f"changes[{index}].path")
            return
        for item_index, item in enumerate(path_value):
            active_node_id = str(item or "").strip()
            path = f"changes[{index}].path[{item_index}]"
            if not active_node_id:
                add("missing_active_path_node", "Active path node id is required.", path)
            elif not _is_well_formed_node_id(active_node_id):
                add("invalid_active_path_node", f"Active path node id `{active_node_id}` is not well-formed.", path)
            elif active_node_id not in node_ids:
                add("active_path_node_missing", f"Active path node `{active_node_id}` does not exist.", path)
        for item_index, (source, target) in enumerate(zip(path_value, path_value[1:])):
            source_id = str(source or "").strip()
            target_id = str(target or "").strip()
            if source_id in node_ids and target_id in node_ids and (source_id, target_id) not in edge_pairs:
                add(
                    "active_path_edge_missing",
                    f"Active path step `{source_id}` -> `{target_id}` is missing a graph edge.",
                    f"changes[{index}].path[{item_index}]",
                )

    def validate_detach_artifact(change: dict[str, Any], index: int) -> None:
        artifact = change.get("artifact")
        if isinstance(artifact, dict):
            artifact_id = str(artifact.get("id") or "").strip()
            artifact_type = str(artifact.get("type") or "").strip()
            path = f"changes[{index}].artifact"
        else:
            artifact_id = str(change.get("artifact_id") or change.get("id") or "").strip()
            artifact_type = str(change.get("artifact_type") or change.get("type") or "").strip()
            path = f"changes[{index}]"
        if not artifact_id:
            add("missing_artifact_id", "detach_artifact requires a non-empty artifact id.", path)
        if not artifact_type:
            add("missing_artifact_type", "detach_artifact requires a non-empty artifact type.", path)
        elif artifact_type not in ALLOWED_ARTIFACT_TYPES:
            add("invalid_artifact_type", f"Artifact type `{artifact_type}` is not allowed.", path)

    def validate_history(change: dict[str, Any], index: int) -> None:
        history_text = None
        for field in ("message", "history", "note"):
            if field in change:
                history_text = change.get(field)
                break
        if not isinstance(history_text, str) or not history_text.strip():
            add("missing_history_text", "record_history requires non-empty history text.", f"changes[{index}]")

    if packet.get("schema") != LAB_UPDATE_SCHEMA_VERSION:
        add("invalid_update_schema", f"Update packet schema must be {LAB_UPDATE_SCHEMA_VERSION}.")
    target_thread = str(packet.get("target_thread") or "").strip()
    if not target_thread:
        add("missing_target_thread", "Update packet requires a non-empty target_thread.")
    elif not _is_well_formed_thread_id(target_thread):
        add("invalid_target_thread", f"Target thread `{target_thread}` is not well-formed.")
    elif not (lab_root / "threads" / f"{target_thread}.md").exists():
        add("target_thread_missing", f"Target thread `{target_thread}` does not exist.")
    changes = packet.get("changes")
    if not isinstance(changes, list) or not changes:
        add("missing_changes", "Update packet needs a non-empty changes list.")

    confirmation = packet.get("user_confirmation") if isinstance(packet.get("user_confirmation"), dict) else {}
    confirmation_status = str(confirmation.get("status") or "").strip()
    confirmation_required_for = set(_as_list(confirmation.get("required_for")))

    for index, change in enumerate(changes if isinstance(changes, list) else []):
        if not isinstance(change, dict):
            add("invalid_change", "Each change must be an object.", f"changes[{index}]")
            continue
        op = str(change.get("op") or "").strip()
        if op not in ALLOWED_UPDATE_OPS:
            add("invalid_update_op", f"Unsupported update op `{op}`.", f"changes[{index}].op")
        node_id = str(change.get("node_id") or "").strip()
        if op in CONFIRMATION_REQUIRED_OPS:
            require_confirmation(op, f"changes[{index}]")
        if op in {"update_node", "attach_artifact", "detach_artifact", "record_history"}:
            validate_node_id(node_id, f"changes[{index}].node_id", must_exist=True)
        if op == "create_node":
            validate_node_id(node_id, f"changes[{index}].node_id", must_exist=False)
        if op in {"create_edge", "update_edge"}:
            validate_edge_endpoint(change, index, "source")
            validate_edge_endpoint(change, index, "target")
            kind = str(change.get("kind") or "").strip()
            if not kind:
                add("missing_edge_kind", "Edge kind is required.", f"changes[{index}].kind")
            elif kind not in ALLOWED_EDGE_KINDS:
                add("invalid_edge_kind", f"Edge kind `{kind}` is not allowed.", f"changes[{index}].kind")
        if op == "set_active_thread":
            validate_active_thread(change, index)
        if op == "set_active_path":
            validate_active_path(change, index)
        if op == "detach_artifact":
            validate_detach_artifact(change, index)
        if op == "record_history":
            validate_history(change, index)
        if op == "update_node":
            fields = change.get("fields")
            if not isinstance(fields, dict) or not fields:
                add("missing_update_fields", "update_node requires non-empty fields.", f"changes[{index}].fields")
            if isinstance(fields, dict):
                validate_update_fields(fields, index)
        if op == "attach_artifact":
            artifact = change.get("artifact")
            if not isinstance(artifact, dict):
                add("missing_artifact", "attach_artifact requires artifact object.", f"changes[{index}].artifact")
            else:
                artifact_id = str(artifact.get("id") or "").strip()
                if not artifact_id:
                    add(
                        "missing_artifact_id",
                        "attach_artifact requires non-empty artifact id.",
                        f"changes[{index}].artifact.id",
                    )
                artifact_type = str(artifact.get("type") or "").strip()
                if artifact_type not in ALLOWED_ARTIFACT_TYPES:
                    add(
                        "invalid_artifact_type",
                        f"Artifact type `{artifact_type}` is not allowed.",
                        f"changes[{index}].artifact.type",
                    )
                path = str(artifact.get("path") or "").strip()
                if not path:
                    add(
                        "missing_artifact_path",
                        "attach_artifact requires non-empty artifact path.",
                        f"changes[{index}].artifact.path",
                    )
                elif _path_starts_with_meridian(path) and not (lab_root.parent / Path(path.replace("\\", "/"))).exists():
                    add(
                        "artifact_path_missing",
                        f"Artifact path `{path}` does not exist.",
                        f"changes[{index}].artifact.path",
                    )

    return {
        "schema": "meridian.lab.update_validation.v1",
        "status": "fail" if findings else "pass",
        "findings": findings,
    }


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


def apply_lab_update(root: Path, packet: dict[str, Any]) -> dict[str, Any]:
    validation = validate_lab_update_packet(root, packet)
    if validation["status"] == "pass":
        validation = _reject_apply_unsupported_changes(validation, packet)
    if validation["status"] != "pass":
        return {
            "schema": LAB_APPLY_UPDATE_SCHEMA_VERSION,
            "status": "rejected",
            "validation": validation,
            "written_paths": [],
        }

    lab_root = _lab_root(root)
    written_paths: list[Path] = []

    def remember(path: Path) -> None:
        if path not in written_paths:
            written_paths.append(path)

    def write_if_changed(path: Path, text: str) -> None:
        existing = path.read_text(encoding="utf-8") if path.exists() else ""
        if text != existing:
            path.write_text(text, encoding="utf-8")
            remember(path)

    for change in packet.get("changes", []):
        if not isinstance(change, dict):
            continue
        op = str(change.get("op") or "").strip()
        if op in {"update_node", "attach_artifact", "record_history"}:
            thread_id, raw_id = _split_node_id(str(change.get("node_id") or ""))
            thread_path = lab_root / "threads" / f"{thread_id}.md"
            text = thread_path.read_text(encoding="utf-8")
            if op == "update_node":
                fields = change.get("fields") if isinstance(change.get("fields"), dict) else {}
                text = _apply_update_node_change(text, raw_id, fields)
            elif op == "attach_artifact":
                artifact = change.get("artifact") if isinstance(change.get("artifact"), dict) else {}
                text = _apply_attach_artifact_change(text, raw_id, artifact)
            elif op == "record_history":
                text = _apply_record_history_change(text, raw_id, _history_message(change))
            write_if_changed(thread_path, text)
        elif op == "set_active_path":
            state_path = lab_root / "state.md"
            active_path = _as_list(change.get("path", change.get("active_path")))
            text = state_path.read_text(encoding="utf-8") if state_path.exists() else ""
            write_if_changed(state_path, _upsert_frontmatter_field(text, "active_path", _format_inline_list(active_path)))
        elif op == "set_active_thread":
            state_path = lab_root / "state.md"
            active_thread = str(change.get("thread_id") or change.get("target_thread") or packet.get("target_thread") or "")
            text = state_path.read_text(encoding="utf-8") if state_path.exists() else ""
            write_if_changed(state_path, _upsert_frontmatter_field(text, "active_thread", active_thread.strip()))

    graph_result = write_lab_graph(root)
    remember(lab_root / "graph" / "graph.json")
    remember(lab_root / "graph" / "graph-health.json")
    remember(lab_root / "graph" / "graph.schema.json")

    return {
        "schema": LAB_APPLY_UPDATE_SCHEMA_VERSION,
        "status": "applied",
        "validation": validation,
        "written_paths": [_display_path(path, lab_root=lab_root.parent) for path in written_paths],
        "graph_health": graph_result.health,
    }


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
    elif active_thread_value:
        if not _is_well_formed_thread_id(active_thread_value):
            add(
                "error",
                "invalid_active_thread",
                f"Graph active_thread `{active_thread_value}` is not well-formed.",
                "active_thread",
            )
        elif not (lab_root / "threads" / f"{active_thread_value}.md").exists():
            add(
                "error",
                "active_thread_missing",
                f"Graph active_thread `{active_thread_value}` does not exist.",
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
    node_records: list[dict[str, Any]] = []
    required_node_fields = ("id", "thread_id", "title", "kind", "state", "markdown_path", "markdown_anchor")
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
        node_records.append(node)
        state = str(node.get("state") or "")
        if state not in ALLOWED_NODE_MODES:
            add(
                "error",
                "invalid_node_state",
                f"Graph node `{node_id}` uses invalid state `{state}`.",
                f"nodes/{index}/state",
            )
        kind = str(node.get("kind") or "")
        if kind != "research_point":
            add(
                "error",
                "invalid_node_kind",
                f"Graph node `{node_id}` uses invalid kind `{kind}`.",
                f"nodes/{index}/kind",
            )
        markdown_path = str(node.get("markdown_path") or "")
        if _path_starts_with_meridian(markdown_path) and not (lab_root.parent / markdown_path).exists():
            add(
                "error",
                "node_markdown_path_missing",
                f"Graph node `{node_id}` markdown path `{markdown_path}` does not exist.",
                markdown_path,
            )
        elif _path_starts_with_meridian(markdown_path):
            raw_id = _node_raw_id(node)
            expected_anchor = _node_markdown_anchor(raw_id, str(node.get("title") or "").strip())
            markdown_anchor = str(node.get("markdown_anchor") or "")
            markdown_file = lab_root.parent / markdown_path
            if markdown_anchor != expected_anchor or not _markdown_node_heading_exists(markdown_file, raw_id):
                add(
                    "error",
                    "markdown_anchor_missing",
                    f"Graph node `{node_id}` markdown anchor `{markdown_anchor}` does not resolve to a source heading.",
                    f"nodes/{index}/markdown_anchor",
                )

    edges_value = graph.get("edges")
    if not isinstance(edges_value, list):
        add("error", "invalid_edges", "Graph payload field `edges` must be a list.", "edges")
        edges = []
    else:
        edges = edges_value
    edge_ids: set[str] = set()
    edge_pairs: set[tuple[str, str]] = set()
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
        if source and target:
            edge_pairs.add((source, target))
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
    for active_index, (source, target) in enumerate(zip(active_path, active_path[1:])):
        source_id = str(source)
        target_id = str(target)
        if (source_id, target_id) not in edge_pairs:
            add(
                "error",
                "active_path_edge_missing",
                f"Active path step `{source_id}` -> `{target_id}` is missing a graph edge.",
                f"active_path/{active_index}",
            )

    node_details = graph.get("node_details")
    if not isinstance(node_details, dict):
        add("error", "invalid_node_details", "Graph payload field `node_details` must be an object.", "node_details")
        node_details = {}
    for node in node_records:
        node_id = str(node.get("id") or "")
        detail = node_details.get(node_id)
        if detail is None:
            add("error", "node_detail_missing", f"Graph node `{node_id}` is missing node detail.", f"node_details/{node_id}")
        elif not isinstance(detail, dict):
            add("error", "invalid_node_detail", f"Graph node `{node_id}` detail must be an object.", f"node_details/{node_id}")

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


def _check_graph_health_file(lab_root: Path, expected_health: dict[str, Any]) -> list[dict[str, Any]]:
    health_path = lab_root / "graph" / "graph-health.json"
    if not health_path.exists():
        return [
            {
                "severity": "warning",
                "code": "graph_health_json_missing",
                "path": "graph/graph-health.json",
                "message": "Generated graph health JSON is missing; run graph-refresh.",
            }
        ]

    try:
        raw_health = health_path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        return [
            {
                "severity": "error",
                "code": "graph_health_json_invalid_encoding",
                "path": "graph/graph-health.json",
                "message": f"Generated graph health JSON is not valid UTF-8: {exc.reason}.",
            }
        ]
    except OSError as exc:
        return [
            {
                "severity": "error",
                "code": "graph_health_json_unreadable",
                "path": "graph/graph-health.json",
                "message": f"Generated graph health JSON could not be read: {exc}.",
            }
        ]

    try:
        loaded_health = json.loads(raw_health)
    except json.JSONDecodeError as exc:
        return [
            {
                "severity": "error",
                "code": "graph_health_json_invalid",
                "path": "graph/graph-health.json",
                "message": f"Generated graph health JSON is invalid: {exc.msg}.",
            }
        ]

    if not isinstance(loaded_health, dict):
        return [
            {
                "severity": "error",
                "code": "graph_health_json_not_object",
                "path": "graph/graph-health.json",
                "message": "Generated graph health JSON must contain an object payload.",
            }
        ]

    if loaded_health != expected_health:
        return [
            {
                "severity": "warning",
                "code": "graph_health_json_stale",
                "path": "graph/graph-health.json",
                "message": "Generated graph health JSON does not match the current Lab Markdown state; run graph-refresh.",
            }
        ]
    return []


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
            "generated_at": {"type": "string"},
            "lab_root": {"type": "string"},
            "source_files": {"type": "array", "items": {"type": "string"}},
            "active_thread": {"type": "string"},
            "active_path": {"type": "array", "items": {"type": "string"}},
            "nodes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "thread_id", "title", "kind", "state", "markdown_path", "markdown_anchor"],
                    "properties": {
                        "id": {"type": "string"},
                        "thread_id": {"type": "string"},
                        "title": {"type": "string"},
                        "kind": {"const": "research_point"},
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
            "node_details": {"type": "object"},
            "supporting_artifacts": {
                "type": "object",
                "additionalProperties": {"type": "array", "items": {"type": "object"}},
            },
            "health": {"type": "object"},
        },
    }


def _lab_root(root: Path) -> Path:
    return root if root.name == ".meridian" else root / ".meridian"


def _frontmatter(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return parse_frontmatter(path.read_text(encoding="utf-8"))


def _split_node_id(node_id: str) -> tuple[str, str]:
    clean = _clean_scalar(node_id)
    if "." not in clean:
        return "", clean
    thread_id, raw_id = clean.rsplit(".", maxsplit=1)
    return thread_id, raw_id


def _reject_apply_unsupported_changes(validation: dict[str, Any], packet: dict[str, Any]) -> dict[str, Any]:
    findings = list(validation.get("findings", []))
    changes = packet.get("changes")
    for index, change in enumerate(changes if isinstance(changes, list) else []):
        if not isinstance(change, dict):
            continue
        op = str(change.get("op") or "").strip()
        if op not in APPLY_SUPPORTED_OPS:
            findings.append(
                {
                    "severity": "error",
                    "code": "unsupported_apply_op",
                    "path": f"changes[{index}].op",
                    "message": f"Apply does not support update op `{op}` in this task.",
                }
            )
            continue
        if op != "update_node":
            continue
        fields = change.get("fields")
        for field in sorted(fields if isinstance(fields, dict) else {}):
            if field not in APPLY_SUPPORTED_UPDATE_NODE_FIELDS:
                findings.append(
                    {
                        "severity": "error",
                        "code": "unsupported_apply_field",
                        "path": f"changes[{index}].fields.{field}",
                        "message": f"Apply does not support update_node field `{field}` in this task.",
                    }
                )
    return {**validation, "status": "fail" if findings else "pass", "findings": findings}


def _apply_update_node_change(text: str, raw_id: str, fields: dict[str, Any]) -> str:
    def edit(body: str) -> str:
        if "state" in fields:
            body = _upsert_node_field(body, "mode", f"`{str(fields['state']).strip()}`")
        if "next_action" in fields:
            body = _upsert_heading_body(body, "Next Action", str(fields["next_action"]).strip())
        return body

    return _replace_node_body(text, raw_id, edit)


def _apply_attach_artifact_change(text: str, raw_id: str, artifact: dict[str, Any]) -> str:
    def edit(body: str) -> str:
        artifact_id = str(artifact.get("id") or "").strip()
        if any(str(existing.get("id") or "").strip() == artifact_id for existing in _parse_supporting_artifacts(body)):
            return body
        return _append_supporting_artifact(body, artifact)

    return _replace_node_body(text, raw_id, edit)


def _apply_record_history_change(text: str, raw_id: str, message: str) -> str:
    def edit(body: str) -> str:
        dated_message = f"- {datetime.now(timezone.utc).date().isoformat()}: {message.strip()}"
        return _append_heading_line(body, "History", dated_message)

    return _replace_node_body(text, raw_id, edit)


def _replace_node_body(text: str, raw_id: str, edit: Any) -> str:
    pattern = rf"^###[ \t]+Node[ \t]+{re.escape(raw_id)}(?::[^\n]*)?$"
    match = re.search(pattern, text, flags=re.MULTILINE)
    if not match:
        return text
    body_start = match.end()
    next_match = re.search(r"^#{1,3}[ \t]+", text[body_start:], flags=re.MULTILINE)
    body_end = body_start + next_match.start() if next_match else len(text)
    return text[:body_start] + edit(text[body_start:body_end]) + text[body_end:]


def _upsert_node_field(body: str, name: str, value: str) -> str:
    line = f"- {name}: {value}"
    pattern = rf"^[ \t]*-[ \t]*{re.escape(name)}:[ \t]*.*$"
    if re.search(pattern, body, flags=re.MULTILINE):
        return re.sub(pattern, line, body, count=1, flags=re.MULTILINE)
    leading_blank = re.match(r"^(?:[ \t]*(?:\r?\n|$))*", body)
    index = leading_blank.end() if leading_blank else 0
    return body[:index] + line + "\n" + body[index:]


def _append_supporting_artifact(body: str, artifact: dict[str, Any]) -> str:
    row = _artifact_table_row(artifact)
    table = "| Type | ID | Title | Impact | Path |\n| --- | --- | --- | --- | --- |\n" + row
    bounds = _heading_body_bounds(body, "Supporting Artifacts")
    if bounds is None:
        return _append_heading_section(body, "Supporting Artifacts", table)

    _, content_start, content_end = bounds
    content = body[content_start:content_end].strip()
    if _has_markdown_table(content):
        content = content.rstrip() + "\n" + row
    elif content:
        content = content.rstrip() + "\n\n" + table
    else:
        content = table
    return _replace_heading_content(body, content_start, content_end, content)


def _append_heading_line(body: str, heading: str, line: str) -> str:
    bounds = _heading_body_bounds(body, heading)
    if bounds is None:
        return _append_heading_section(body, heading, line)
    _, content_start, content_end = bounds
    content = body[content_start:content_end].strip()
    content = f"{content}\n{line}" if content else line
    return _replace_heading_content(body, content_start, content_end, content)


def _upsert_heading_body(body: str, heading: str, content: str) -> str:
    bounds = _heading_body_bounds(body, heading)
    if bounds is None:
        return _append_heading_section(body, heading, content)
    _, content_start, content_end = bounds
    return _replace_heading_content(body, content_start, content_end, content)


def _append_heading_section(body: str, heading: str, content: str) -> str:
    base = body.rstrip()
    separator = "\n\n" if base else "\n\n"
    return f"{base}{separator}#### {heading}\n\n{content.strip()}\n\n"


def _replace_heading_content(body: str, content_start: int, content_end: int, content: str) -> str:
    tail = body[content_end:].lstrip("\r\n")
    separator = "\n\n" if tail else "\n"
    return body[:content_start] + "\n\n" + content.strip() + separator + tail


def _heading_body_bounds(body: str, heading: str) -> tuple[re.Match[str], int, int] | None:
    pattern = rf"^####[ \t]+{re.escape(heading)}[ \t]*$"
    match = re.search(pattern, body, flags=re.MULTILINE)
    if not match:
        return None
    content_start = match.end()
    next_heading = re.search(r"^#{2,4}[ \t]+", body[content_start:], flags=re.MULTILINE)
    content_end = content_start + next_heading.start() if next_heading else len(body)
    return match, content_start, content_end


def _artifact_table_row(artifact: dict[str, Any]) -> str:
    cells = [
        artifact.get("type"),
        artifact.get("id"),
        artifact.get("title"),
        artifact.get("impact"),
        artifact.get("path"),
    ]
    return "| " + " | ".join(_table_cell(cell) for cell in cells) + " |"


def _table_cell(value: Any) -> str:
    return " ".join(str(value or "").split()).replace("|", "/")


def _has_markdown_table(content: str) -> bool:
    return sum(1 for line in content.splitlines() if line.strip().startswith("|")) >= 2


def _history_message(change: dict[str, Any]) -> str:
    for field in ("message", "history", "note"):
        if field in change:
            return str(change.get(field) or "")
    return ""


def _format_inline_list(values: list[str]) -> str:
    return "[" + ", ".join(values) + "]"


def _upsert_frontmatter_field(text: str, field: str, value: str) -> str:
    line = f"{field}: {value}"
    bounds = _frontmatter_text_bounds(text)
    if bounds is None:
        return f"---\n{line}\n---\n{text}"

    start, end = bounds
    frontmatter = text[start:end]
    pattern = rf"^{re.escape(field)}:[ \t]*.*$"
    if re.search(pattern, frontmatter, flags=re.MULTILINE):
        frontmatter = re.sub(pattern, line, frontmatter, count=1, flags=re.MULTILINE)
    else:
        stripped = frontmatter.rstrip("\r\n")
        frontmatter = f"{stripped}\n{line}\n" if stripped else f"{line}\n"
    return text[:start] + frontmatter + text[end:]


def _frontmatter_text_bounds(text: str) -> tuple[int, int] | None:
    opening = re.match(r"^---[ \t]*(?:\r?\n|$)", text)
    if not opening:
        return None
    closing = re.search(r"^---[ \t]*(?:\r?\n|$)", text[opening.end() :], flags=re.MULTILINE)
    if not closing:
        return None
    start = opening.end()
    end = opening.end() + closing.start()
    return start, end


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
            "kind": "research_point",
            "label": title or raw_id,
            "state": mode,
            "active": active,
            "on_active_path": node_id in active_path,
            "source_path": _display_path(thread_path, lab_root=project_root),
            "markdown_path": _display_path(thread_path, lab_root=project_root),
            "markdown_anchor": _node_markdown_anchor(raw_id, title),
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


def _node_markdown_anchor(raw_id: str, title: str) -> str:
    heading = f"Node {raw_id}: {title}" if title else f"Node {raw_id}"
    return re.sub(r"[^a-z0-9]+", "-", heading.strip().lower()).strip("-") or "node"


def _node_raw_id(node: dict[str, Any]) -> str:
    raw_id = str(node.get("raw_id") or "").strip()
    if raw_id:
        return raw_id
    node_id = str(node.get("id") or "").strip()
    return node_id.rsplit(".", maxsplit=1)[-1]


def _markdown_node_heading_exists(path: Path, raw_id: str) -> bool:
    try:
        markdown = strip_frontmatter(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError):
        return False
    pattern = rf"^###\s+Node\s+{re.escape(raw_id)}(?::|\s*$)"
    return re.search(pattern, markdown, flags=re.MULTILINE) is not None


def _path_starts_with_meridian(path: str) -> bool:
    return path.replace("\\", "/").startswith(".meridian/")


def _is_well_formed_thread_id(value: str) -> bool:
    return re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", value) is not None and ".." not in value


def _is_well_formed_node_id(value: str) -> bool:
    return re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9][A-Za-z0-9_-]*)+", value) is not None


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
