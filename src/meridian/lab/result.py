from __future__ import annotations

import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.lab.graph import (
    LAB_APPLY_UPDATE_SCHEMA_VERSION,
    apply_lab_update,
    check_lab_graph,
    materialize_lab_graph,
    validate_lab_apply_update,
)
from meridian.lab.state import ALLOWED_EXPERIMENT_VALIDITY
from meridian.wiki.corpus import parse_frontmatter, split_sections, strip_frontmatter
from meridian.workspace_protocol import (
    PreparedWorkspaceEvent,
    WorkspaceProtocolError,
    commit_workspace_event,
    prepare_workspace_event,
)

LAB_RESULT_SCHEMA_VERSION = "meridian.lab.result.v1"
ALLOWED_RESULT_IMPACTS = {"supports", "refutes", "updates", "unclear"}
REQUIRED_EXPERIMENT_SECTIONS = (
    "Question",
    "Command / Config / Output",
    "Result",
    "Validity",
    "Interpretation",
)
EXPERIMENT_RECORD_FIELDS = ("title", "validity", "question", "command", "result", "interpretation")


class LabResultError(WorkspaceProtocolError):
    """Raised when an agent return cannot be safely projected into Lab."""


def record_lab_result(
    root: Path,
    *,
    node_id: str,
    event_id: str,
    summary: str,
    source: str,
    impact: str,
    event_date: str | None = None,
    state: str | None = None,
    next_action: str | None = None,
    user_confirmation: dict[str, Any] | None = None,
    experiment: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Attach experiment evidence to one node and project one App-visible event.

    When ``experiment`` is given, ``source`` must not exist yet: the record is
    written there from the fields in ``EXPERIMENT_RECORD_FIELDS`` and removed
    again if the result is rejected or fails. Without it, ``source`` must be an
    existing experiment record.
    """

    created = (
        None
        if experiment is None
        else _write_experiment_record(_lab_root_of(root).parent, source, experiment, node_id)
    )
    try:
        result = _record_lab_result(
            root,
            node_id=node_id,
            event_id=event_id,
            summary=summary,
            source=source,
            impact=impact,
            event_date=event_date,
            state=state,
            next_action=next_action,
            user_confirmation=user_confirmation,
        )
    except Exception:
        if created is not None:
            created.unlink(missing_ok=True)
        raise
    if created is None:
        return result
    if result["status"] == "rejected":
        created.unlink(missing_ok=True)
        return result
    return {**result, "written_paths": sorted({*result["written_paths"], Path(source).as_posix()})}


def _record_lab_result(
    root: Path,
    *,
    node_id: str,
    event_id: str,
    summary: str,
    source: str,
    impact: str,
    event_date: str | None,
    state: str | None,
    next_action: str | None,
    user_confirmation: dict[str, Any] | None,
) -> dict[str, Any]:
    graph_result = materialize_lab_graph(root)
    node = next(
        (
            item
            for item in graph_result.graph["nodes"]
            if item.get("id") == node_id.strip()
        ),
        None,
    )
    if node is None:
        raise LabResultError(f"Lab node does not exist: {node_id}")

    normalized_impact = impact.strip()
    if normalized_impact not in ALLOWED_RESULT_IMPACTS:
        raise LabResultError(f"impact must be one of {sorted(ALLOWED_RESULT_IMPACTS)}")

    prepared_event = prepare_workspace_event(
        root,
        event_id=event_id,
        text=summary,
        source=source,
        event_date=event_date,
        node=node_id,
    )
    evidence = _validate_experiment(prepared_event)
    if evidence["validity"] != "valid" and normalized_impact in {
        "supports",
        "refutes",
    }:
        raise LabResultError(
            "only valid experiment evidence may directly support or refute a node"
        )
    normalized_state = state.strip() if state is not None else ""
    if normalized_state in {"supported", "dead"} and evidence["validity"] != "valid":
        raise LabResultError(
            "only valid experiment evidence may mark a node supported or dead"
        )

    changes: list[dict[str, Any]] = [
        {
            "op": "attach_artifact",
            "node_id": node_id,
            "artifact": {
                "type": "experiment",
                "id": evidence["id"],
                "title": evidence["title"],
                "impact": normalized_impact,
                "path": evidence["path"],
            },
        }
    ]
    fields: dict[str, str] = {}
    if normalized_state:
        fields["state"] = normalized_state
    if next_action is not None and next_action.strip():
        fields["next_action"] = next_action.strip()
    if fields:
        changes.append({"op": "update_node", "node_id": node_id, "fields": fields})

    packet = {
        "schema": "meridian.lab.update.v1",
        "intent": "record_experiment_result",
        "target_thread": str(node["thread_id"]),
        "changes": changes,
        "user_confirmation": user_confirmation
        or {"required_for": [], "status": "not_required"},
    }
    validation = validate_lab_apply_update(root, packet)
    if validation["status"] != "pass":
        return {
            "schema": LAB_RESULT_SCHEMA_VERSION,
            "status": "rejected",
            "validation": validation,
            "written_paths": [],
        }

    if prepared_event.status == "unchanged" and _node_result_is_current(
        graph_result.graph,
        node_id=node_id,
        evidence=evidence,
        state=normalized_state,
        next_action=next_action,
    ):
        graph_health = check_lab_graph(root)
        if graph_health["status"] == "pass":
            event = commit_workspace_event(prepared_event)
            return {
                "schema": LAB_RESULT_SCHEMA_VERSION,
                "status": "unchanged",
                "evidence": evidence,
                "event": event,
                "lab_update": {
                    "schema": LAB_APPLY_UPDATE_SCHEMA_VERSION,
                    "status": "unchanged",
                    "validation": validation,
                    "written_paths": [],
                    "graph_health": graph_health,
                },
                "written_paths": [],
            }

    snapshots = _snapshots(
        [
            graph_result.lab_root / "threads" / f"{node['thread_id']}.md",
            graph_result.lab_root / "graph" / "graph.json",
            graph_result.lab_root / "graph" / "graph-health.json",
            graph_result.lab_root / "graph" / "graph.schema.json",
            prepared_event.target,
        ]
    )
    try:
        lab_update = apply_lab_update(root, packet)
        if lab_update["status"] != "applied":
            raise LabResultError(
                "Lab result passed preflight but its node update was rejected"
            )
        event = commit_workspace_event(prepared_event)
    except Exception:
        _restore_snapshots(snapshots)
        raise

    written_paths = set(lab_update["written_paths"])
    if event["status"] == "created":
        written_paths.add(event["path"])
    return {
        "schema": LAB_RESULT_SCHEMA_VERSION,
        "status": "applied",
        "evidence": evidence,
        "event": event,
        "lab_update": lab_update,
        "written_paths": sorted(written_paths),
    }


def _validate_experiment(prepared: PreparedWorkspaceEvent) -> dict[str, str]:
    relative = Path(prepared.event["source"])
    experiments_root = Path(".meridian/experiments")
    if (
        relative == experiments_root / "index.md"
        or experiments_root not in relative.parents
    ):
        raise LabResultError(
            "lab_result source must be an experiment Markdown file under .meridian/experiments"
        )
    if relative.suffix.lower() != ".md":
        raise LabResultError("lab_result source must be a Markdown experiment record")

    path = prepared.repository / relative
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise LabResultError("experiment record must be UTF-8 Markdown") from exc
    frontmatter = parse_frontmatter(text)
    if frontmatter.get("type") != "research-experiment":
        raise LabResultError(
            "experiment frontmatter must use type: research-experiment"
        )
    experiment_id = str(frontmatter.get("id") or "").strip()
    if not experiment_id:
        raise LabResultError("experiment frontmatter requires a non-empty id")
    primary_target = str(frontmatter.get("primary_target") or "").strip()
    if not primary_target:
        raise LabResultError(
            "experiment frontmatter requires a non-empty primary_target"
        )
    validity = str(frontmatter.get("validity") or "").strip()
    if validity not in ALLOWED_EXPERIMENT_VALIDITY:
        raise LabResultError(
            f"experiment validity must be one of {sorted(ALLOWED_EXPERIMENT_VALIDITY)}"
        )

    sections = split_sections(strip_frontmatter(text))
    missing = [
        heading
        for heading in REQUIRED_EXPERIMENT_SECTIONS
        if not sections.get(heading, "").strip()
    ]
    if missing:
        raise LabResultError(
            f"experiment record is missing durable evidence sections: {', '.join(missing)}"
        )
    if sections["Validity"].strip().strip("`") != validity:
        raise LabResultError(
            "experiment Validity section must match frontmatter validity"
        )

    heading = re.search(
        r"^#[ \t]+(?:Experiment:[ \t]*)?(.+?)\s*$",
        strip_frontmatter(text),
        flags=re.MULTILINE,
    )
    title = heading.group(1).strip() if heading else experiment_id
    return {
        "id": experiment_id,
        "title": title,
        "validity": validity,
        "primary_target": primary_target,
        "path": relative.as_posix(),
        "source": relative.as_posix(),
    }


def _lab_root_of(root: Path) -> Path:
    return root if root.name == ".meridian" else root / ".meridian"


def _write_experiment_record(
    repository: Path, source: str, experiment: dict[str, Any], node_id: str
) -> Path:
    """Write a new experiment record at ``source`` and return its path; never overwrites."""

    unknown = sorted(set(experiment) - set(EXPERIMENT_RECORD_FIELDS))
    if unknown:
        raise LabResultError(f"experiment has unknown fields: {', '.join(unknown)}")
    values: dict[str, str] = {}
    for field in EXPERIMENT_RECORD_FIELDS:
        value = experiment.get(field)
        if not isinstance(value, str) or not value.strip():
            raise LabResultError(f"experiment requires a non-empty {field}")
        values[field] = value.strip()
    if values["validity"] not in ALLOWED_EXPERIMENT_VALIDITY:
        raise LabResultError(
            f"experiment validity must be one of {sorted(ALLOWED_EXPERIMENT_VALIDITY)}"
        )

    relative = Path(source.strip())
    experiments_root = Path(".meridian/experiments")
    if (
        relative.is_absolute()
        or ".." in relative.parts
        or relative.parent != experiments_root
        or relative.suffix.lower() != ".md"
        or relative.name == "index.md"
    ):
        raise LabResultError(
            "a new experiment record must be .meridian/experiments/<id>.md"
        )
    path = repository / relative
    if path.exists():
        raise LabResultError(
            "experiment record already exists; omit experiment to attach the existing record"
        )

    today = datetime.now(timezone.utc).astimezone().date().isoformat()
    text = "\n".join(
        [
            "---",
            "type: research-experiment",
            f"id: {relative.stem}",
            f"created: {today}",
            f"updated: {today}",
            f"validity: {values['validity']}",
            f"primary_target: {node_id.strip()}",
            "---",
            "",
            f"# Experiment: {values['title']}",
            "",
            "## Question",
            "",
            values["question"],
            "",
            "## Command / Config / Output",
            "",
            values["command"],
            "",
            "## Result",
            "",
            values["result"],
            "",
            "## Validity",
            "",
            f"`{values['validity']}`",
            "",
            "## Interpretation",
            "",
            values["interpretation"],
            "",
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        stream.write(text)
    return path


def _snapshots(paths: list[Path]) -> dict[Path, bytes | None]:
    return {path: path.read_bytes() if path.exists() else None for path in paths}


def _node_result_is_current(
    graph: dict[str, Any],
    *,
    node_id: str,
    evidence: dict[str, str],
    state: str,
    next_action: str | None,
) -> bool:
    node = next((item for item in graph["nodes"] if item.get("id") == node_id), None)
    if node is None or (state and node.get("state") != state):
        return False
    expected_next_action = next_action.strip() if next_action is not None else ""
    details = graph.get("node_details", {}).get(node_id, {})
    if expected_next_action and details.get("next_action") != expected_next_action:
        return False
    return any(
        artifact.get("type") == "experiment"
        and artifact.get("id") == evidence["id"]
        and artifact.get("path") == evidence["path"]
        for artifact in graph.get("supporting_artifacts", {}).get(node_id, [])
    )


def _restore_snapshots(snapshots: dict[Path, bytes | None]) -> None:
    for path, content in snapshots.items():
        if content is None:
            path.unlink(missing_ok=True)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".rollback", dir=path.parent
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
