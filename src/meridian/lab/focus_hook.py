"""Claude Code hook integration for Lab Focus: which nodes are active right now."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from meridian.lab.graph import materialize_lab_graph

MAX_OUTPUT_LINES = 6
FOCUS_RULE_LINE = (
    "Focus: naming a node activates it (or reopen_node if closed); no confirmation "
    "needed; several nodes may stay active at once."
)


def parse_hook_payload(raw: str) -> dict[str, Any]:
    """Parse a Claude Code hook's stdin JSON payload.

    Returns an empty dict for blank or malformed input rather than raising, so a
    hook invocation never crashes the host session over a stray stdin shape.
    """

    if not raw.strip():
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def find_lab_or_workspace_root(start: Path) -> Path | None:
    """Walk upward from `start` for the nearest repository root with a Lab or workspace surface.

    A repository root qualifies when its `.meridian/` holds `workspace.json` or
    `state.md`. Returns None when no ancestor qualifies.
    """

    current = start.resolve()
    for candidate in (current, *current.parents):
        meridian_dir = candidate / ".meridian"
        if (meridian_dir / "workspace.json").exists() or (meridian_dir / "state.md").exists():
            return candidate
    return None


def render_lab_focus_report(root: Path, *, hook_event_name: str) -> str:
    """Render the compact Focus report for one hook invocation, at most `MAX_OUTPUT_LINES` lines.

    Lists each active node's id, state, and label, then a one-line Focus rule
    reminder. `SessionStart` also names the Lab skill to load, budget permitting.
    """

    graph = materialize_lab_graph(root).graph
    active_ids = [str(node_id) for node_id in graph.get("active_nodes", [])]
    nodes_by_id = {node["id"]: node for node in graph.get("nodes", [])}

    lines = [f"Meridian Lab focus: {len(active_ids)} node(s) active"]
    node_line_budget = MAX_OUTPUT_LINES - 2  # reserve the header line and the rule line
    shown = active_ids[:node_line_budget]
    for node_id in shown:
        node = nodes_by_id.get(node_id)
        if node is None:
            continue
        lines.append(f"- {node_id} ({node.get('state')}): {node.get('label')}")
    remaining = len(active_ids) - len(shown)
    if remaining > 0:
        lines.append(f"- ...and {remaining} more")
    lines.append(FOCUS_RULE_LINE)
    if hook_event_name == "SessionStart" and len(lines) < MAX_OUTPUT_LINES:
        lines.append("Load the `lab` skill for the full Focus rules.")
    return "\n".join(lines[:MAX_OUTPUT_LINES])


def run_lab_focus_hook(payload: dict[str, Any]) -> str:
    """Compute the Focus hook's stdout for one SessionStart/UserPromptSubmit invocation.

    Returns an empty string when `cwd` is missing or no ancestor directory has a
    Lab or workspace root; the caller prints nothing in that case.
    """

    cwd = str(payload.get("cwd") or "").strip()
    if not cwd:
        return ""
    root = find_lab_or_workspace_root(Path(cwd))
    if root is None:
        return ""
    return render_lab_focus_report(root, hook_event_name=str(payload.get("hook_event_name") or ""))
