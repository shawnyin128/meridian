from __future__ import annotations

import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable

from meridian import __version__

WORKSPACE_SCHEMA_VERSION = "meridian.workspace.v1"
PROJECT_PLAN_SCHEMA_VERSION = "meridian.project-plan.v1"
WORKSPACE_EVENTS_SCHEMA_VERSION = "meridian.workspace-events.v1"
WORKSPACE_STATUS_SCHEMA_VERSION = "meridian.workspace-status.v1"
WORKSPACE_EVENT_WRITE_SCHEMA_VERSION = "meridian.workspace-event-write.v1"
WORKSPACE_CHANGES_SCHEMA_VERSION = "meridian.workspace-changes.v1"
WORKSPACE_CHANGE_PAGE_SCHEMA_VERSION = "meridian.workspace-change-page.v1"
WORKSPACE_IDEA_SCHEMA_VERSION = "meridian.workspace-idea.v1"
WORKSPACE_AGENT_IDEAS_SCHEMA_VERSION = "meridian.workspace-agent-ideas.v1"
WORKSPACE_AGENT_IDEA_WRITE_SCHEMA_VERSION = "meridian.workspace-agent-idea-write.v1"

MANIFEST_PATH = Path(".meridian/workspace.json")
PLAN_PATH = Path(".meridian/control/plan.json")
GRAPH_PATH = Path(".meridian/graph/graph.json")
EVENTS_PATH = Path(".meridian/events/events.json")
CHANGES_PATH = Path(".meridian/control/changes.json")
AGENT_IDEAS_PATH = Path(".meridian/ideas/ideas.json")

_EVENT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_APP_OR_GENERATED_SURFACES = {MANIFEST_PATH, PLAN_PATH, GRAPH_PATH, EVENTS_PATH, CHANGES_PATH, AGENT_IDEAS_PATH}
EVENT_KINDS = {"start", "reopen", "result", "decision", "complete", "note"}
_EVENT_TITLE_MAX_LEN = 120
_EVENT_DETAIL_MAX_LEN = 300
_CHANGE_KINDS = {
    "project.snapshot",
    "project.updated",
    "idea.linked",
    "idea.unlinked",
    "idea.updated",
    "idea.node_linked",
    "idea.node_unlinked",
    "idea.node_changed",
}


class WorkspaceProtocolError(ValueError):
    """Raised when a project workspace does not satisfy the shared protocol."""


@dataclass(frozen=True)
class PreparedWorkspaceEvent:
    """Validated event write that has not changed the workspace yet."""

    repository: Path
    target: Path
    relative_path: Path
    payload: dict[str, Any]
    event: dict[str, str]
    status: str


def inspect_project_workspace(root: Path) -> dict[str, Any]:
    """Return a compact, machine-readable view of the workspace surfaces."""

    repository = _repository_root(root)
    surfaces: dict[str, dict[str, Any]] = {}

    try:
        manifest = _read_manifest(repository)
    except (OSError, WorkspaceProtocolError) as exc:
        surfaces["manifest"] = _invalid_surface(MANIFEST_PATH, exc)
        return _status_payload(repository, "invalid", surfaces)

    surfaces["manifest"] = {
        "status": "ok",
        "path": MANIFEST_PATH.as_posix(),
        "schema_version": manifest["schema_version"],
    }

    plan = _inspect_optional_surface(
        repository / PLAN_PATH,
        PLAN_PATH,
        _validate_plan,
        summary=lambda value: {
            "schema_version": value["schema_version"],
            "revision": value["revision"],
            "updated_at": value["updated_at"],
            "task_count": len(value["tasks"]),
            "milestone_count": len(value["milestones"]),
        },
    )
    graph = _inspect_optional_surface(
        repository / GRAPH_PATH,
        GRAPH_PATH,
        _validate_graph,
        summary=lambda value: {
            "schema": value["schema"],
            "generated_at": value.get("generated_at"),
            "node_count": len(value["nodes"]),
            "edge_count": len(value["edges"]),
            "health": (value.get("health") or {}).get("status"),
        },
    )
    changes = _inspect_optional_surface(
        repository / CHANGES_PATH,
        CHANGES_PATH,
        _validate_changes,
        summary=lambda value: {
            "schema_version": value["schema_version"],
            "epoch": value["epoch"],
            "head_sequence": value["next_sequence"] - 1,
            "retained_change_count": len(value["changes"]),
            "linked_idea_count": len(value["ideas"]),
        },
    )
    events = _inspect_optional_surface(
        repository / EVENTS_PATH,
        EVENTS_PATH,
        lambda value: _validate_events(value, repository=repository),
        summary=lambda value: {
            "schema_version": value["schema_version"],
            "event_count": len(value["events"]),
        },
    )
    surfaces.update(plan=plan, changes=changes, graph=graph, events=events)

    if plan["status"] != "ok":
        status = "invalid"
    elif changes["status"] == "invalid" or graph["status"] == "invalid" or events["status"] == "invalid":
        status = "degraded"
    else:
        status = "ready"
    return _status_payload(repository, status, surfaces, project=manifest["project"])


def read_project_plan(root: Path) -> dict[str, Any]:
    """Read the App-owned plan without changing any workspace file."""

    repository = _repository_root(root)
    manifest = _read_manifest(repository)
    plan_path = Path(manifest["surfaces"]["plan"]["path"])
    return _validate_plan(_read_json(repository / plan_path, label="project plan"))


def read_workspace_changes(
    root: Path,
    *,
    cursor: str | None = None,
    limit: int = 20,
    kinds: list[str] | None = None,
) -> dict[str, Any]:
    """Read a bounded incremental page from the App-owned change journal."""

    repository = _repository_root(root)
    manifest = _read_manifest(repository)
    surface = manifest["surfaces"].get("changes")
    if surface is None or not (repository / CHANGES_PATH).exists():
        return {
            "schema_version": WORKSPACE_CHANGE_PAGE_SCHEMA_VERSION,
            "status": "unavailable",
            "cursor_status": "unavailable",
            "next_cursor": None,
            "has_more": False,
            "baseline_truncated": False,
            "changes": [],
            "fallback": {"tool": "meridian.workspace_plan"},
        }

    if limit < 1 or limit > 100:
        raise WorkspaceProtocolError("change page limit must be between 1 and 100")
    requested_kinds = set(kinds or [])
    unknown_kinds = requested_kinds - _CHANGE_KINDS
    if unknown_kinds:
        raise WorkspaceProtocolError(f"unknown workspace change kinds: {', '.join(sorted(unknown_kinds))}")

    payload = _validate_changes(_read_json(repository / CHANGES_PATH, label="workspace changes"))
    epoch = payload["epoch"]
    head = payload["next_sequence"] - 1
    retained_from = payload["changes"][0]["sequence"] if payload["changes"] else head + 1
    cursor_status = "initialized"
    after_sequence: int | None = None
    if cursor:
        parsed = _parse_change_cursor(cursor)
        if parsed is None or parsed[0] != epoch:
            cursor_status = "reset_required"
        else:
            after_sequence = parsed[1]
            if after_sequence > head or after_sequence < retained_from - 1:
                cursor_status = "reset_required"
                after_sequence = None
            else:
                cursor_status = "ok"

    if after_sequence is None:
        matching = [
            item for item in payload["changes"]
            if not requested_kinds or item["kind"] in requested_kinds
        ]
        selected = matching[-limit:]
        baseline_truncated = len(matching) > len(selected)
        has_more = False
        next_sequence = head
    else:
        matching = [
            item for item in payload["changes"]
            if item["sequence"] > after_sequence
            and (not requested_kinds or item["kind"] in requested_kinds)
        ]
        selected = matching[:limit]
        has_more = len(matching) > len(selected)
        baseline_truncated = False
        next_sequence = selected[-1]["sequence"] if has_more and selected else head

    return {
        "schema_version": WORKSPACE_CHANGE_PAGE_SCHEMA_VERSION,
        "status": "ready",
        "project_id": payload["project_id"],
        "cursor_status": cursor_status,
        "next_cursor": _change_cursor(epoch, next_sequence),
        "has_more": has_more,
        "baseline_truncated": baseline_truncated,
        "retained_from": retained_from,
        "head_sequence": head,
        "changes": selected,
    }


def read_workspace_idea(root: Path, idea_id: str) -> dict[str, Any]:
    """Read one current App-owned idea projection without loading every idea."""

    repository = _repository_root(root)
    manifest = _read_manifest(repository)
    if "changes" not in manifest["surfaces"]:
        raise WorkspaceProtocolError("workspace idea index is unavailable")
    payload = _validate_changes(_read_json(repository / CHANGES_PATH, label="workspace changes"))
    normalized = idea_id.strip()
    idea = next((item for item in payload["ideas"] if item["id"] == normalized), None)
    if idea is None:
        raise WorkspaceProtocolError(f"workspace idea does not exist: {normalized}")
    return {
        "schema_version": WORKSPACE_IDEA_SCHEMA_VERSION,
        "project_id": payload["project_id"],
        "idea": idea,
    }


def read_workspace_node_ideas(root: Path, node_id: str) -> list[dict[str, Any]]:
    """Return compact current idea references attached to one Lab node."""

    repository = _repository_root(root)
    manifest = _read_manifest(repository)
    if "changes" not in manifest["surfaces"] or not (repository / CHANGES_PATH).exists():
        return []
    payload = _validate_changes(_read_json(repository / CHANGES_PATH, label="workspace changes"))
    return [
        {
            "id": idea["id"],
            "title": idea["title"],
            "updated": idea["updated"],
            "archived": idea["archived"],
        }
        for idea in payload["ideas"]
        if idea.get("node") == node_id
    ]


def add_workspace_event(
    root: Path,
    *,
    event_id: str,
    text: str,
    source: str,
    event_date: str | None = None,
    node: str | None = None,
    kind: str | None = None,
    detail: str | None = None,
) -> dict[str, Any]:
    """Append one source-backed event to the repository-owned event projection."""

    prepared = prepare_workspace_event(
        root,
        event_id=event_id,
        text=text,
        source=source,
        event_date=event_date,
        node=node,
        kind=kind,
        detail=detail,
    )
    return commit_workspace_event(prepared)


def prepare_workspace_event(
    root: Path,
    *,
    event_id: str,
    text: str,
    source: str,
    event_date: str | None = None,
    node: str | None = None,
    kind: str | None = None,
    detail: str | None = None,
) -> PreparedWorkspaceEvent:
    """Validate and stage one event without writing its projection."""

    repository = _repository_root(root)
    manifest = _read_manifest(repository)
    events_path = Path(manifest["surfaces"]["events"]["path"])

    normalized_id = event_id.strip()
    if not _EVENT_ID.fullmatch(normalized_id):
        raise WorkspaceProtocolError("event id must be 1-128 URL-safe identifier characters")
    normalized_text = text.strip()
    if not normalized_text:
        raise WorkspaceProtocolError("event text must not be empty")
    if len(normalized_text) > _EVENT_TITLE_MAX_LEN:
        raise WorkspaceProtocolError(f"event text must be at most {_EVENT_TITLE_MAX_LEN} characters")
    normalized_source = _source_path(repository, source)
    normalized_date = _event_date(event_date)
    normalized_node = node.strip() if node is not None else ""
    normalized_kind = _event_kind(kind, label="event kind") if kind is not None else None
    normalized_detail = _event_detail(detail, label="event detail") if detail is not None else None

    event: dict[str, str] = {
        "id": normalized_id,
        "date": normalized_date,
        "text": normalized_text,
        "source": normalized_source,
        "at": datetime.now(timezone.utc).astimezone().isoformat(),
    }
    if normalized_node:
        event["node"] = normalized_node
    if normalized_kind is not None:
        event["kind"] = normalized_kind
    if normalized_detail is not None:
        event["detail"] = normalized_detail

    target = repository / events_path
    if target.exists():
        payload = _validate_events(_read_json(target, label="workspace events"), repository=repository)
    else:
        payload = {"schema_version": WORKSPACE_EVENTS_SCHEMA_VERSION, "events": []}

    prior = next((item for item in payload["events"] if item["id"] == normalized_id), None)
    if prior is not None:
        # "at" always reflects this call's time, so a repeat call is compared without it: the
        # stored event (and its original "at") is kept, not overwritten with a later timestamp.
        if {k: v for k, v in prior.items() if k != "at"} != {k: v for k, v in event.items() if k != "at"}:
            raise WorkspaceProtocolError(f"event id already exists with different content: {normalized_id}")
        status = "unchanged"
        event = prior
    else:
        payload["events"].append(event)
        status = "created"

    return PreparedWorkspaceEvent(
        repository=repository,
        target=target,
        relative_path=events_path,
        payload=payload,
        event=event,
        status=status,
    )


def commit_workspace_event(prepared: PreparedWorkspaceEvent) -> dict[str, Any]:
    """Commit an event previously validated by :func:`prepare_workspace_event`."""

    if prepared.status == "created":
        _atomic_json(prepared.target, prepared.payload)

    return {
        "schema_version": WORKSPACE_EVENT_WRITE_SCHEMA_VERSION,
        "status": prepared.status,
        "path": prepared.relative_path.as_posix(),
        "event": prepared.event,
    }


def add_workspace_agent_idea(
    root: Path,
    *,
    idea_id: str,
    title: str,
    body: str,
    context: str | None = None,
    idea_date: str | None = None,
    node: str | None = None,
) -> dict[str, Any]:
    """Record one idea a coding agent found, for the Meridian App to pick up into its idea list.

    Writing the same id with the same content again is a no-op; the same id with different
    content raises :class:`WorkspaceProtocolError`.
    """

    repository = _repository_root(root)
    _read_manifest(repository)
    normalized_id = idea_id.strip()
    if not _EVENT_ID.fullmatch(normalized_id):
        raise WorkspaceProtocolError("idea id must be 1-128 URL-safe identifier characters")
    normalized_title = title.strip()
    normalized_body = body.strip()
    if not normalized_title or len(normalized_title) > 160:
        raise WorkspaceProtocolError("idea title must be 1-160 characters")
    if not normalized_body or len(normalized_body) > 20_000:
        raise WorkspaceProtocolError("idea body must be 1-20000 characters")
    idea: dict[str, str] = {
        "id": normalized_id,
        "date": _event_date(idea_date),
        "title": normalized_title,
        "body": normalized_body,
    }
    if context is not None and context.strip():
        idea["context"] = context.strip()
    if node is not None and node.strip():
        idea["node"] = node.strip()

    target = repository / AGENT_IDEAS_PATH
    if target.exists():
        payload = _validate_agent_ideas(_read_json(target, label="workspace agent ideas"))
    else:
        payload = {"schema_version": WORKSPACE_AGENT_IDEAS_SCHEMA_VERSION, "ideas": []}
    prior = next((item for item in payload["ideas"] if item["id"] == normalized_id), None)
    if prior is not None:
        if prior != idea:
            raise WorkspaceProtocolError(f"idea id already exists with different content: {normalized_id}")
        status = "unchanged"
    else:
        payload["ideas"].append(idea)
        _atomic_json(target, payload)
        status = "created"
    return {
        "schema_version": WORKSPACE_AGENT_IDEA_WRITE_SCHEMA_VERSION,
        "status": status,
        "path": AGENT_IDEAS_PATH.as_posix(),
        "idea": idea,
    }


def _validate_agent_ideas(value: Any) -> dict[str, Any]:
    payload = _object(value, "workspace agent ideas")
    _exact_keys(payload, {"schema_version", "ideas"}, "workspace agent ideas")
    if payload.get("schema_version") != WORKSPACE_AGENT_IDEAS_SCHEMA_VERSION:
        raise WorkspaceProtocolError("workspace agent ideas are not meridian.workspace-agent-ideas.v1")
    ideas = payload.get("ideas")
    if not isinstance(ideas, list):
        raise WorkspaceProtocolError("workspace agent ideas must be a JSON array")
    ids: set[str] = set()
    for index, raw in enumerate(ideas):
        item = _object(raw, f"workspace agent idea {index}")
        if set(item) - {"id", "date", "title", "body", "context", "node"} or not {"id", "date", "title", "body"}.issubset(item):
            raise WorkspaceProtocolError(f"workspace agent idea {index} has invalid fields")
        idea_id = _nonempty_string(item.get("id"), f"workspace agent idea {index} id")
        if not _EVENT_ID.fullmatch(idea_id) or idea_id in ids:
            raise WorkspaceProtocolError(f"workspace agent idea {index} id is invalid or duplicated")
        ids.add(idea_id)
        _event_date(_nonempty_string(item.get("date"), f"workspace agent idea {index} date"))
        _nonempty_string(item.get("title"), f"workspace agent idea {index} title")
        _nonempty_string(item.get("body"), f"workspace agent idea {index} body")
    return payload


def _repository_root(root: Path) -> Path:
    candidate = root.expanduser()
    if not candidate.exists():
        raise WorkspaceProtocolError(f"workspace root does not exist: {candidate}")
    resolved = candidate.resolve()
    if not resolved.is_dir():
        raise WorkspaceProtocolError(f"workspace root is not a directory: {resolved}")
    return resolved.parent if resolved.name == ".meridian" else resolved


def _read_manifest(repository: Path) -> dict[str, Any]:
    manifest = _read_json(repository / MANIFEST_PATH, label="workspace manifest")
    _exact_keys(manifest, {"schema_version", "project", "surfaces"}, "workspace manifest")
    if manifest.get("schema_version") != WORKSPACE_SCHEMA_VERSION:
        raise WorkspaceProtocolError("workspace manifest is not meridian.workspace.v1")

    project = _object(manifest.get("project"), "workspace project")
    _exact_keys(project, {"id", "name"}, "workspace project")
    _nonempty_string(project.get("id"), "workspace project id")
    _nonempty_string(project.get("name"), "workspace project name")

    surfaces = _object(manifest.get("surfaces"), "workspace surfaces")
    surface_names = set(surfaces)
    required_surfaces = {"plan", "graph", "events"}
    allowed_surfaces = required_surfaces | {"changes", "ideas"}
    unknown_surfaces = surface_names - allowed_surfaces
    missing_surfaces = required_surfaces - surface_names
    if unknown_surfaces or missing_surfaces:
        raise WorkspaceProtocolError(
            "workspace surfaces do not match the v1 contract: "
            f"unknown={sorted(unknown_surfaces)}, missing={sorted(missing_surfaces)} "
            f"(meridian {__version__}); restart the agent session or update Meridian."
        )
    expected = {
        "plan": (PLAN_PATH, "meridian-app"),
        **({"changes": (CHANGES_PATH, "meridian-app")} if "changes" in surfaces else {}),
        "graph": (GRAPH_PATH, "workspace"),
        "events": (EVENTS_PATH, "workspace"),
        **({"ideas": (AGENT_IDEAS_PATH, "workspace")} if "ideas" in surfaces else {}),
    }
    for name, (path, writer) in expected.items():
        surface = _object(surfaces.get(name), f"workspace {name} surface")
        _exact_keys(surface, {"path", "writer"}, f"workspace {name} surface")
        if surface.get("path") != path.as_posix() or surface.get("writer") != writer:
            raise WorkspaceProtocolError(f"workspace {name} surface does not match the v1 contract")
    return manifest


def _validate_plan(value: Any) -> dict[str, Any]:
    plan = _object(value, "project plan")
    if plan.get("schema_version") != PROJECT_PLAN_SCHEMA_VERSION:
        raise WorkspaceProtocolError("project plan is not meridian.project-plan.v1")
    _nonempty_string(plan.get("revision"), "project plan revision")
    _nonempty_string(plan.get("updated_at"), "project plan updated_at")
    project = _object(plan.get("project"), "project plan project")
    _nonempty_string(project.get("id"), "project plan project id")
    _nonempty_string(project.get("name"), "project plan project name")
    if not isinstance(plan.get("tasks"), list):
        raise WorkspaceProtocolError("project plan tasks must be a JSON array")
    if not isinstance(plan.get("milestones"), list):
        raise WorkspaceProtocolError("project plan milestones must be a JSON array")
    return plan


def _validate_graph(value: Any) -> dict[str, Any]:
    graph = _object(value, "research graph")
    if graph.get("schema") != "meridian.lab.graph.v1":
        raise WorkspaceProtocolError("research graph is not meridian.lab.graph.v1")
    nodes = graph.get("nodes")
    edges = graph.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise WorkspaceProtocolError("research graph nodes and edges must be JSON arrays")
    ids: set[str] = set()
    for index, raw_node in enumerate(nodes):
        item = _object(raw_node, f"research graph node {index}")
        node_id = _nonempty_string(item.get("id"), f"research graph node {index} id")
        if node_id in ids:
            raise WorkspaceProtocolError(f"research graph contains duplicate node id: {node_id}")
        ids.add(node_id)
    for index, raw_edge in enumerate(edges):
        item = _object(raw_edge, f"research graph edge {index}")
        source = _nonempty_string(item.get("source"), f"research graph edge {index} source")
        target = _nonempty_string(item.get("target"), f"research graph edge {index} target")
        if source not in ids or target not in ids:
            raise WorkspaceProtocolError(f"research graph edge {index} references a missing node")
    return graph


def _validate_events(value: Any, *, repository: Path | None = None) -> dict[str, Any]:
    payload = _object(value, "workspace events")
    if payload.get("schema_version") != WORKSPACE_EVENTS_SCHEMA_VERSION:
        raise WorkspaceProtocolError("workspace events are not meridian.workspace-events.v1")
    events = payload.get("events")
    if not isinstance(events, list):
        raise WorkspaceProtocolError("workspace events must be a JSON array")
    ids: set[str] = set()
    for index, raw_event in enumerate(events):
        item = _object(raw_event, f"workspace event {index}")
        allowed = {"id", "date", "text", "source", "node", "kind", "detail", "at"}
        if set(item) - allowed or not {"id", "date", "text", "source"}.issubset(item):
            raise WorkspaceProtocolError(f"workspace event {index} has invalid fields")
        event_id = _nonempty_string(item.get("id"), f"workspace event {index} id")
        if not _EVENT_ID.fullmatch(event_id):
            raise WorkspaceProtocolError(f"workspace event {index} id is invalid")
        if event_id in ids:
            raise WorkspaceProtocolError(f"workspace events contain duplicate id: {event_id}")
        ids.add(event_id)
        _event_date(_nonempty_string(item.get("date"), f"workspace event {index} date"))
        # New events keep the title to _EVENT_TITLE_MAX_LEN; legacy events may run longer and are
        # shown whole, so the stored length is not re-checked here.
        _nonempty_string(item.get("text"), f"workspace event {index} text")
        source = _nonempty_string(item.get("source"), f"workspace event {index} source")
        if repository is not None:
            _source_path(repository, source)
        if "node" in item:
            _nonempty_string(item.get("node"), f"workspace event {index} node")
        if "kind" in item:
            _event_kind(item.get("kind"), label=f"workspace event {index} kind")
        if "detail" in item:
            _event_detail(item.get("detail"), label=f"workspace event {index} detail")
        if "at" in item:
            _event_at(item.get("at"), f"workspace event {index} at")
    return payload


def _validate_changes(value: Any) -> dict[str, Any]:
    payload = _object(value, "workspace changes")
    _exact_keys(
        payload,
        {"schema_version", "project_id", "epoch", "next_sequence", "ideas", "changes"},
        "workspace changes",
    )
    if payload.get("schema_version") != WORKSPACE_CHANGES_SCHEMA_VERSION:
        raise WorkspaceProtocolError("workspace changes are not meridian.workspace-changes.v1")
    _nonempty_string(payload.get("project_id"), "workspace changes project id")
    _nonempty_string(payload.get("epoch"), "workspace changes epoch")
    next_sequence = payload.get("next_sequence")
    if not isinstance(next_sequence, int) or isinstance(next_sequence, bool) or next_sequence < 1:
        raise WorkspaceProtocolError("workspace changes next_sequence must be a positive integer")

    ideas = payload.get("ideas")
    if not isinstance(ideas, list):
        raise WorkspaceProtocolError("workspace changes ideas must be a JSON array")
    idea_ids: set[str] = set()
    for index, raw_idea in enumerate(ideas):
        idea = _object(raw_idea, f"workspace idea {index}")
        allowed = {"id", "title", "body", "archived", "created", "updated", "node", "source"}
        required = {"id", "title", "body", "archived", "created", "updated", "source"}
        if set(idea) - allowed or not required.issubset(idea):
            raise WorkspaceProtocolError(f"workspace idea {index} has invalid fields")
        idea_id = _nonempty_string(idea.get("id"), f"workspace idea {index} id")
        if idea_id in idea_ids:
            raise WorkspaceProtocolError(f"workspace changes contain duplicate idea id: {idea_id}")
        idea_ids.add(idea_id)
        _nonempty_string(idea.get("title"), f"workspace idea {index} title")
        _nonempty_string(idea.get("body"), f"workspace idea {index} body")
        if not isinstance(idea.get("archived"), bool):
            raise WorkspaceProtocolError(f"workspace idea {index} archived must be boolean")
        _nonempty_string(idea.get("created"), f"workspace idea {index} created")
        _nonempty_string(idea.get("updated"), f"workspace idea {index} updated")
        if "node" in idea:
            _nonempty_string(idea.get("node"), f"workspace idea {index} node")
        source = _object(idea.get("source"), f"workspace idea {index} source")
        allowed_source = {"chat_title", "paper_id", "paper_title"}
        if set(source) - allowed_source or "chat_title" not in source:
            raise WorkspaceProtocolError(f"workspace idea {index} source has invalid fields")
        _nonempty_string(source.get("chat_title"), f"workspace idea {index} source chat_title")
        for key in ("paper_id", "paper_title"):
            if key in source:
                _nonempty_string(source.get(key), f"workspace idea {index} source {key}")

    changes = payload.get("changes")
    if not isinstance(changes, list):
        raise WorkspaceProtocolError("workspace changes changes must be a JSON array")
    prior_sequence = 0
    for index, raw_change in enumerate(changes):
        change = _object(raw_change, f"workspace change {index}")
        _exact_keys(change, {"sequence", "at", "kind", "summary", "refs"}, f"workspace change {index}")
        sequence = change.get("sequence")
        if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence <= prior_sequence:
            raise WorkspaceProtocolError("workspace change sequences must be strictly increasing positive integers")
        if sequence >= next_sequence:
            raise WorkspaceProtocolError("workspace change sequence must be below next_sequence")
        prior_sequence = sequence
        _nonempty_string(change.get("at"), f"workspace change {index} at")
        kind = _nonempty_string(change.get("kind"), f"workspace change {index} kind")
        if kind not in _CHANGE_KINDS:
            raise WorkspaceProtocolError(f"workspace change {index} kind is unknown: {kind}")
        _nonempty_string(change.get("summary"), f"workspace change {index} summary")
        refs = change.get("refs")
        if not isinstance(refs, list) or not refs:
            raise WorkspaceProtocolError(f"workspace change {index} refs must be a non-empty array")
        for ref_index, raw_ref in enumerate(refs):
            ref = _object(raw_ref, f"workspace change {index} ref {ref_index}")
            _exact_keys(ref, {"kind", "id"}, f"workspace change {index} ref {ref_index}")
            if ref.get("kind") not in {"project", "idea", "node"}:
                raise WorkspaceProtocolError(f"workspace change {index} ref {ref_index} kind is invalid")
            _nonempty_string(ref.get("id"), f"workspace change {index} ref {ref_index} id")
    return payload


def _change_cursor(epoch: str, sequence: int) -> str:
    return f"{epoch}:{sequence}"


def _parse_change_cursor(cursor: str) -> tuple[str, int] | None:
    epoch, separator, raw_sequence = cursor.rpartition(":")
    if not separator or not epoch:
        return None
    try:
        sequence = int(raw_sequence)
    except ValueError:
        return None
    return (epoch, sequence) if sequence >= 0 else None


def _source_path(repository: Path, source: str) -> str:
    raw = source.strip()
    if not raw:
        raise WorkspaceProtocolError("event source must not be empty")
    relative = Path(raw)
    if relative.is_absolute():
        raise WorkspaceProtocolError("event source must be relative to the workspace root")
    try:
        resolved = (repository / relative).resolve(strict=True)
        normalized = resolved.relative_to(repository)
    except (OSError, ValueError) as exc:
        raise WorkspaceProtocolError("event source must be an existing file inside the workspace") from exc
    if not resolved.is_file():
        raise WorkspaceProtocolError("event source must be an existing file inside the workspace")
    if normalized in _APP_OR_GENERATED_SURFACES:
        raise WorkspaceProtocolError("event source must be durable evidence, not a protocol projection")
    return normalized.as_posix()


def _event_date(value: str | None) -> str:
    candidate = datetime.now(timezone.utc).astimezone().date().isoformat() if value is None else value.strip()
    try:
        parsed = date.fromisoformat(candidate)
    except ValueError as exc:
        raise WorkspaceProtocolError("event date must use YYYY-MM-DD") from exc
    if parsed.isoformat() != candidate:
        raise WorkspaceProtocolError("event date must use YYYY-MM-DD")
    return candidate


def _event_kind(value: Any, *, label: str) -> str:
    kind = _nonempty_string(value, label)
    if kind not in EVENT_KINDS:
        raise WorkspaceProtocolError(f"{label} is unknown: {kind}")
    return kind


def _event_detail(value: Any, *, label: str) -> str:
    detail = _nonempty_string(value, label)
    if len(detail) > _EVENT_DETAIL_MAX_LEN:
        raise WorkspaceProtocolError(f"{label} must be at most {_EVENT_DETAIL_MAX_LEN} characters")
    return detail


def _event_at(value: Any, label: str) -> str:
    candidate = _nonempty_string(value, label)
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise WorkspaceProtocolError(f"{label} must be an ISO 8601 datetime with offset") from exc
    if parsed.tzinfo is None:
        raise WorkspaceProtocolError(f"{label} must be an ISO 8601 datetime with offset")
    return candidate


def _inspect_optional_surface(
    file: Path,
    relative: Path,
    validator: Callable[[Any], dict[str, Any]],
    *,
    summary: Callable[[dict[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    if not file.exists():
        return {"status": "missing", "path": relative.as_posix()}
    try:
        value = validator(_read_json(file, label=relative.as_posix()))
    except (OSError, WorkspaceProtocolError) as exc:
        return _invalid_surface(relative, exc)
    return {"status": "ok", "path": relative.as_posix(), **summary(value)}


def _status_payload(
    repository: Path,
    status: str,
    surfaces: dict[str, dict[str, Any]],
    *,
    project: Any = None,
) -> dict[str, Any]:
    return {
        "schema_version": WORKSPACE_STATUS_SCHEMA_VERSION,
        "status": status,
        "root": str(repository),
        **({"project": project} if project is not None else {}),
        "surfaces": surfaces,
    }


def _invalid_surface(path: Path, error: Exception) -> dict[str, Any]:
    return {"status": "invalid", "path": path.as_posix(), "issue": str(error)}


def _read_json(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise WorkspaceProtocolError(f"{label} is missing: {path}") from exc
    except UnicodeDecodeError as exc:
        raise WorkspaceProtocolError(f"{label} is not UTF-8: {path}") from exc
    except json.JSONDecodeError as exc:
        raise WorkspaceProtocolError(f"{label} is not valid JSON: {path}:{exc.lineno}") from exc


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WorkspaceProtocolError(f"{label} must be a JSON object")
    return value


def _nonempty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise WorkspaceProtocolError(f"{label} must be a non-empty string")
    return value.strip()


def _exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise WorkspaceProtocolError(f"{label} fields do not match the v1 contract")


def _atomic_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
