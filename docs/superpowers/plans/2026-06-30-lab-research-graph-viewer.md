# Lab Research Graph Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a strict, generated Lab research graph layer and a read-only VS Code viewer that renders core research points from `.meridian/graph/graph.json`.

**Architecture:** `.meridian/threads/*.md` remains the human-readable control plane. Meridian core validates strict update packets, updates Markdown, materializes `.meridian/graph/graph.json`, and writes graph health results. The VS Code extension only reads generated graph JSON, watches for changes, and displays a two-pane research graph plus selected-node details.

**Tech Stack:** Python stdlib, existing Meridian CLI/argparse, Markdown/YAML frontmatter helpers in `meridian.wiki.corpus`, pytest/unittest, TypeScript, VS Code extension API, React, Ant Design, React Flow or Cytoscape.js selected during extension implementation.

---

## Scope And Sequencing

This plan implements one connected feature with four layers:

1. Python graph model, materializer, health checks, and strict update packet application.
2. CLI and framework-check integration.
3. Lab skill, templates, and README guidance.
4. Read-only VS Code viewer and real Codex scenario tests.

The core graph protocol must land before the VS Code extension so the UI consumes the real file contract instead of a mock-only shape.

## File Structure

- Create `src/meridian/lab/graph.py`: graph dataclasses, Markdown parsing, graph materialization, graph health, update-packet validation, update application, JSON writing.
- Modify `src/meridian/lab/__init__.py`: export graph constants and helper functions.
- Modify `src/meridian/cli.py`: add `meridian lab graph-refresh`, `graph-check`, `apply-update`, and `export-graph`.
- Modify `src/meridian/framework_check.py`: include graph health under Lab readiness when `.meridian/` exists.
- Modify `src/meridian/templates/research-dev/state.md`: include `active_path: []` in frontmatter.
- Modify `src/meridian/templates/research-dev/thread.md`: add durable graph relation and supporting artifact sections without removing existing approach-tree content.
- Modify `plugins/codex/meridian/skills/lab/SKILL.md`: teach strict update packets and generated graph boundaries.
- Modify `plugins/claude-code/meridian/skills/lab/SKILL.md`: keep Claude skill in sync with Codex skill.
- Modify `README.md`: document Lab graph commands and read-only VS Code viewer.
- Create `plugins/vscode/meridian-research-graph/`: VS Code extension package.
- Create `plugins/vscode/meridian-research-graph/src/extension.ts`: VS Code command registration.
- Create `plugins/vscode/meridian-research-graph/src/graphPanel.ts`: webview panel lifecycle, file watcher, message handling.
- Create `plugins/vscode/meridian-research-graph/src/meridianCli.ts`: run Meridian refresh/check commands.
- Create `plugins/vscode/meridian-research-graph/src/webview/`: React UI, graph canvas, detail panel, types, styles.
- Create `eval/cases/lab_graph_update_live.jsonl`: real Codex graph update scenarios.
- Create `src/meridian/evals/codex_lab_graph.py`: live eval harness for graph update behavior.
- Modify `tests/test_cli.py` only when existing CLI coverage patterns are simpler than new focused files.
- Create `tests/test_lab_graph.py`: graph materializer, health, update packet, and CLI tests.
- Create `tests/test_codex_lab_graph_eval.py`: deterministic eval harness tests with fake Codex runner.
- Create `plugins/vscode/meridian-research-graph/src/webview/__tests__/App.test.tsx`: webview behavior tests.

## Task 1: Graph Model And Materializer

**Files:**
- Create: `src/meridian/lab/graph.py`
- Modify: `src/meridian/lab/__init__.py`
- Test: `tests/test_lab_graph.py`

- [ ] **Step 1: Write failing materializer tests**

Add this test file skeleton and the first materializer test:

```python
from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from meridian.lab.graph import LAB_GRAPH_SCHEMA_VERSION, materialize_lab_graph


class LabGraphTests(unittest.TestCase):
    def test_materialize_graph_uses_core_research_nodes_only(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            (lab / "state.md").write_text(
                "---\n"
                "type: lab-state\n"
                "active_thread: kv-compression\n"
                "active_path: [kv-compression.A, kv-compression.B]\n"
                "---\n"
                "# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            (lab / "threads/kv-compression.md").write_text(
                "---\n"
                "type: research-thread\n"
                "title: KV Compression\n"
                "active_node: B\n"
                "---\n"
                "# Research Thread: KV Compression\n\n"
                "## Approach Tree\n\n"
                "### Node A: Idea seed\n\n"
                "- mode: `supported`\n"
                "- active: false\n\n"
                "#### Experiments\n\n"
                "- `exp-01`\n\n"
                "#### Next Action\n\n"
                "Continue toward the repair node.\n\n"
                "### Node B: Repair scoring\n\n"
                "- mode: `repairable`\n"
                "- active: true\n"
                "- parent: A\n\n"
                "#### Supporting Artifacts\n\n"
                "| Type | ID | Title | Impact | Path |\n"
                "| --- | --- | --- | --- | --- |\n"
                "| experiment | exp-02 | Scoring probe | supports | .meridian/experiments/exp-02.md |\n\n"
                "#### Next Action\n\n"
                "Run the amortized scoring probe.\n",
                encoding="utf-8",
            )
            (lab / "experiments/exp-01.md").write_text(
                "---\ntype: research-experiment\nid: exp-01\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )
            (lab / "experiments/exp-02.md").write_text(
                "---\ntype: research-experiment\nid: exp-02\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )

            graph = materialize_lab_graph(root).graph

            self.assertEqual(graph["schema"], LAB_GRAPH_SCHEMA_VERSION)
            self.assertEqual(graph["active_thread"], "kv-compression")
            self.assertEqual(graph["active_path"], ["kv-compression.A", "kv-compression.B"])
            self.assertEqual([node["id"] for node in graph["nodes"]], ["kv-compression.A", "kv-compression.B"])
            self.assertEqual(graph["nodes"][1]["state"], "repairable")
            self.assertTrue(graph["nodes"][1]["active"])
            self.assertEqual(graph["node_details"]["kv-compression.B"]["next_action"], "Run the amortized scoring probe.")
            artifact_ids = [item["id"] for item in graph["supporting_artifacts"]["kv-compression.B"]]
            self.assertEqual(artifact_ids, ["exp-02"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the failing materializer test**

Run:

```powershell
python -m pytest tests/test_lab_graph.py::LabGraphTests::test_materialize_graph_uses_core_research_nodes_only -q
```

Expected: fail with `ModuleNotFoundError: No module named 'meridian.lab.graph'` or import failure for `materialize_lab_graph`.

- [ ] **Step 3: Implement the graph module skeleton and materializer**

Create `src/meridian/lab/graph.py` with these public constants, dataclasses, and functions:

```python
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
```

Also add private helpers in the same file:

```python
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
```

Add `_parse_thread_nodes`, `_parse_graph_relations`, `_parse_supporting_artifacts`, `_extract_next_action`, `_dedupe_edges`, `_edge_on_active_path`, `_display_path`, and a minimal `check_lab_graph_payload` in the same module. Use the existing Lab node heading convention `### Node <id>: <title>`. Keep experiment references under `#### Experiments` as supporting artifacts and parse the new `#### Supporting Artifacts` table when present.

Update `src/meridian/lab/__init__.py`:

```python
from meridian.lab.graph import (
    LAB_GRAPH_SCHEMA_VERSION,
    LAB_UPDATE_SCHEMA_VERSION,
    LabGraphBuildResult,
    materialize_lab_graph,
)
```

Add those names to `__all__`.

- [ ] **Step 4: Run materializer test to verify it passes**

Run:

```powershell
python -m pytest tests/test_lab_graph.py::LabGraphTests::test_materialize_graph_uses_core_research_nodes_only -q
```

Expected: `1 passed`.

- [ ] **Step 5: Commit graph materializer**

Run:

```powershell
git add src/meridian/lab/graph.py src/meridian/lab/__init__.py tests/test_lab_graph.py
git commit -m "feat: materialize lab research graph"
```

## Task 2: Graph Health And Generated Files

**Files:**
- Modify: `src/meridian/lab/graph.py`
- Test: `tests/test_lab_graph.py`

- [ ] **Step 1: Add failing health and write tests**

Append these tests to `LabGraphTests`:

```python
    def test_write_lab_graph_creates_generated_artifacts(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            from meridian.lab.graph import write_lab_graph

            result = write_lab_graph(root)

            graph_path = root / ".meridian/graph/graph.json"
            health_path = root / ".meridian/graph/graph-health.json"
            schema_path = root / ".meridian/graph/graph.schema.json"
            self.assertTrue(graph_path.exists())
            self.assertTrue(health_path.exists())
            self.assertTrue(schema_path.exists())
            payload = json.loads(graph_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema"], LAB_GRAPH_SCHEMA_VERSION)
            self.assertEqual(result.health["status"], "pass")

    def test_graph_health_fails_dangling_edge(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            thread = root / ".meridian/threads/kv-compression.md"
            thread.write_text(
                thread.read_text(encoding="utf-8")
                + "\n## Graph Relations\n\n"
                + "| Source | Relation | Target | Strength | Note |\n"
                + "| --- | --- | --- | --- | --- |\n"
                + "| kv-compression.A | related_to | kv-compression.missing | weak | broken |\n",
                encoding="utf-8",
            )

            from meridian.lab.graph import materialize_lab_graph

            result = materialize_lab_graph(root)
            codes = [finding["code"] for finding in result.health["findings"]]
            self.assertIn("dangling_edge_target", codes)
            self.assertEqual(result.health["status"], "fail")
```

Add a helper method to the test class:

```python
    def _write_minimal_lab(self, root: Path) -> None:
        lab = root / ".meridian"
        (lab / "threads").mkdir(parents=True)
        (lab / "experiments").mkdir()
        (lab / "proposals").mkdir()
        (lab / "state.md").write_text(
            "---\ntype: lab-state\nactive_thread: kv-compression\nactive_path: [kv-compression.A]\n---\n# State\n",
            encoding="utf-8",
        )
        (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
        (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
        (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
        (lab / "threads/kv-compression.md").write_text(
            "---\ntype: research-thread\ntitle: KV Compression\nactive_node: A\n---\n"
            "# Research Thread: KV Compression\n\n"
            "## Approach Tree\n\n"
            "### Node A: Idea seed\n\n"
            "- mode: `unresolved`\n"
            "- active: true\n\n"
            "#### Next Action\n\n"
            "Define the first probe.\n",
            encoding="utf-8",
        )
```

- [ ] **Step 2: Run failing health tests**

Run:

```powershell
python -m pytest tests/test_lab_graph.py::LabGraphTests::test_write_lab_graph_creates_generated_artifacts tests/test_lab_graph.py::LabGraphTests::test_graph_health_fails_dangling_edge -q
```

Expected: fail because `write_lab_graph` and full health checks are not complete.

- [ ] **Step 3: Implement graph writing and health checks**

Extend `src/meridian/lab/graph.py` with:

```python
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
        if health["status"] == "pass":
            health["status"] = "warn"
        return health
    return result.health


def write_lab_graph(root: Path) -> LabGraphBuildResult:
    result = materialize_lab_graph(root)
    graph_dir = result.lab_root / "graph"
    graph_dir.mkdir(parents=True, exist_ok=True)
    (graph_dir / "graph.json").write_text(json.dumps(result.graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (graph_dir / "graph-health.json").write_text(json.dumps(result.health, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (graph_dir / "graph.schema.json").write_text(json.dumps(_graph_schema(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result
```

Implement `check_lab_graph_payload(graph, lab_root)` so it returns:

```python
{
    "schema": LAB_GRAPH_HEALTH_SCHEMA_VERSION,
    "status": "pass" | "fail",
    "lab_root": str(lab_root),
    "findings": [
        {"severity": "error", "code": "...", "path": "...", "message": "..."}
    ],
}
```

At minimum check:

- graph schema equals `LAB_GRAPH_SCHEMA_VERSION`
- each node has `id`, `title`, `state`, `markdown_path`, `markdown_anchor`
- node state is in `ALLOWED_NODE_MODES`
- every edge source and target exists
- every active path node exists
- every artifact path that starts with `.meridian/` exists

Return `status: "fail"` when any finding has severity `error`, otherwise `status: "pass"`.

- [ ] **Step 4: Run health tests**

Run:

```powershell
python -m pytest tests/test_lab_graph.py -q
```

Expected: all Lab graph tests pass.

- [ ] **Step 5: Commit graph health**

Run:

```powershell
git add src/meridian/lab/graph.py tests/test_lab_graph.py
git commit -m "feat: add lab graph health checks"
```

## Task 3: Strict Update Packet Validation

**Files:**
- Modify: `src/meridian/lab/graph.py`
- Test: `tests/test_lab_graph.py`

- [ ] **Step 1: Add failing update validation tests**

Append:

```python
    def test_validate_update_packet_rejects_missing_confirmation(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "mark_repairable",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {"state": "repairable"},
                    }
                ],
                "user_confirmation": {"required_for": ["state:repairable"], "status": "missing"},
            }

            report = validate_lab_update_packet(root, packet)

            self.assertEqual(report["status"], "fail")
            self.assertIn("confirmation_required", [finding["code"] for finding in report["findings"]])

    def test_validate_update_packet_accepts_artifact_attach(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            (root / ".meridian/experiments/exp-02.md").write_text(
                "---\ntype: research-experiment\nid: exp-02\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "attach_experiment",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "attach_artifact",
                        "node_id": "kv-compression.A",
                        "artifact": {
                            "type": "experiment",
                            "id": "exp-02",
                            "title": "Probe",
                            "impact": "supports",
                            "path": ".meridian/experiments/exp-02.md",
                        },
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            report = validate_lab_update_packet(root, packet)

            self.assertEqual(report["status"], "pass")
            self.assertEqual(report["findings"], [])
```

- [ ] **Step 2: Run failing update validation tests**

Run:

```powershell
python -m pytest tests/test_lab_graph.py::LabGraphTests::test_validate_update_packet_rejects_missing_confirmation tests/test_lab_graph.py::LabGraphTests::test_validate_update_packet_accepts_artifact_attach -q
```

Expected: fail because `validate_lab_update_packet` does not exist.

- [ ] **Step 3: Implement update packet validation**

Add to `src/meridian/lab/graph.py`:

```python
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

CONFIRMATION_REQUIRED_FIELDS = {"state:repairable", "state:dead", "active_thread", "active_path", "create_node"}


def validate_lab_update_packet(root: Path, packet: dict[str, Any]) -> dict[str, Any]:
    lab_root = _lab_root(root)
    graph = materialize_lab_graph(root).graph
    node_ids = {node["id"] for node in graph["nodes"]}
    findings: list[dict[str, str]] = []

    def add(code: str, message: str, path: str = "<packet>") -> None:
        findings.append({"severity": "error", "code": code, "path": path, "message": message})

    if packet.get("schema") != LAB_UPDATE_SCHEMA_VERSION:
        add("invalid_update_schema", f"Update packet schema must be {LAB_UPDATE_SCHEMA_VERSION}.")
    target_thread = str(packet.get("target_thread") or "").strip()
    if target_thread and not (lab_root / "threads" / f"{target_thread}.md").exists():
        add("target_thread_missing", f"Target thread `{target_thread}` does not exist.")
    changes = packet.get("changes")
    if not isinstance(changes, list) or not changes:
        add("missing_changes", "Update packet needs a non-empty changes list.")

    confirmation = packet.get("user_confirmation") if isinstance(packet.get("user_confirmation"), dict) else {}
    confirmation_status = str(confirmation.get("status") or "").strip()

    for index, change in enumerate(changes if isinstance(changes, list) else []):
        if not isinstance(change, dict):
            add("invalid_change", "Each change must be an object.", f"changes[{index}]")
            continue
        op = str(change.get("op") or "").strip()
        if op not in ALLOWED_UPDATE_OPS:
            add("invalid_update_op", f"Unsupported update op `{op}`.", f"changes[{index}].op")
        node_id = str(change.get("node_id") or "").strip()
        if op in {"update_node", "attach_artifact", "detach_artifact"} and node_id not in node_ids:
            add("node_missing", f"Node `{node_id}` does not exist.", f"changes[{index}].node_id")
        if op == "update_node":
            fields = change.get("fields")
            if not isinstance(fields, dict) or not fields:
                add("missing_update_fields", "update_node requires non-empty fields.", f"changes[{index}].fields")
            state = str((fields or {}).get("state") or "").strip()
            if state and state not in ALLOWED_NODE_MODES:
                add("invalid_node_state", f"Node state `{state}` is not allowed.", f"changes[{index}].fields.state")
            if state in {"repairable", "dead"} and confirmation_status != "accepted":
                add("confirmation_required", f"Changing state to `{state}` requires accepted user confirmation.", f"changes[{index}]")
        if op == "attach_artifact":
            artifact = change.get("artifact")
            if not isinstance(artifact, dict):
                add("missing_artifact", "attach_artifact requires artifact object.", f"changes[{index}].artifact")
            else:
                artifact_type = str(artifact.get("type") or "").strip()
                if artifact_type not in ALLOWED_ARTIFACT_TYPES:
                    add("invalid_artifact_type", f"Artifact type `{artifact_type}` is not allowed.", f"changes[{index}].artifact.type")
                path = str(artifact.get("path") or "").strip()
                if path.startswith(".meridian/") and not (lab_root.parent / path).exists():
                    add("artifact_path_missing", f"Artifact path `{path}` does not exist.", f"changes[{index}].artifact.path")

    return {
        "schema": "meridian.lab.update_validation.v1",
        "status": "fail" if findings else "pass",
        "findings": findings,
    }
```

- [ ] **Step 4: Run update validation tests**

Run:

```powershell
python -m pytest tests/test_lab_graph.py -q
```

Expected: all Lab graph tests pass.

- [ ] **Step 5: Commit update packet validation**

Run:

```powershell
git add src/meridian/lab/graph.py tests/test_lab_graph.py
git commit -m "feat: validate lab graph updates"
```

## Task 4: Apply Update Packets To Markdown And Generated Graph

**Files:**
- Modify: `src/meridian/lab/graph.py`
- Test: `tests/test_lab_graph.py`

- [ ] **Step 1: Add failing apply-update tests**

Append:

```python
    def test_apply_update_writes_markdown_and_graph(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            (root / ".meridian/experiments/exp-02.md").write_text(
                "---\ntype: research-experiment\nid: exp-02\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )
            from meridian.lab.graph import apply_lab_update

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "attach_experiment",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {"next_action": "Review exp-02 and choose the next repair."},
                    },
                    {
                        "op": "attach_artifact",
                        "node_id": "kv-compression.A",
                        "artifact": {
                            "type": "experiment",
                            "id": "exp-02",
                            "title": "Probe",
                            "impact": "supports",
                            "path": ".meridian/experiments/exp-02.md",
                        },
                    },
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)

            self.assertEqual(result["status"], "applied")
            thread = (root / ".meridian/threads/kv-compression.md").read_text(encoding="utf-8")
            self.assertIn("Review exp-02 and choose the next repair.", thread)
            self.assertIn("| experiment | exp-02 | Probe | supports | .meridian/experiments/exp-02.md |", thread)
            graph = json.loads((root / ".meridian/graph/graph.json").read_text(encoding="utf-8"))
            artifacts = graph["supporting_artifacts"]["kv-compression.A"]
            self.assertEqual(artifacts[-1]["id"], "exp-02")

    def test_apply_update_writes_nothing_when_invalid(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            thread_path = root / ".meridian/threads/kv-compression.md"
            before = thread_path.read_text(encoding="utf-8")
            from meridian.lab.graph import apply_lab_update

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "bad_state",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {"state": "dead"},
                    }
                ],
                "user_confirmation": {"required_for": ["state:dead"], "status": "missing"},
            }

            result = apply_lab_update(root, packet)

            self.assertEqual(result["status"], "rejected")
            self.assertEqual(thread_path.read_text(encoding="utf-8"), before)
            self.assertFalse((root / ".meridian/graph/graph.json").exists())
```

- [ ] **Step 2: Run failing apply tests**

Run:

```powershell
python -m pytest tests/test_lab_graph.py::LabGraphTests::test_apply_update_writes_markdown_and_graph tests/test_lab_graph.py::LabGraphTests::test_apply_update_writes_nothing_when_invalid -q
```

Expected: fail because `apply_lab_update` does not exist.

- [ ] **Step 3: Implement minimal deterministic Markdown update application**

Add:

```python
def apply_lab_update(root: Path, packet: dict[str, Any]) -> dict[str, Any]:
    validation = validate_lab_update_packet(root, packet)
    if validation["status"] != "pass":
        return {"schema": "meridian.lab.apply_update.v1", "status": "rejected", "validation": validation, "written_paths": []}

    lab_root = _lab_root(root)
    written: list[Path] = []
    for change in packet["changes"]:
        op = change["op"]
        if op in {"update_node", "attach_artifact", "record_history"}:
            thread_id = str(change.get("node_id", "")).split(".", 1)[0] or str(packet.get("target_thread"))
            path = lab_root / "threads" / f"{thread_id}.md"
            text = path.read_text(encoding="utf-8")
            if op == "update_node":
                text = _apply_update_node(text, change)
            elif op == "attach_artifact":
                text = _apply_attach_artifact(text, change)
            elif op == "record_history":
                text = _apply_record_history(text, change)
            path.write_text(text, encoding="utf-8")
            written.append(path)
        elif op == "set_active_path":
            state_path = lab_root / "state.md"
            state_path.write_text(_apply_active_path(state_path.read_text(encoding="utf-8"), change), encoding="utf-8")
            written.append(state_path)

    graph_result = write_lab_graph(root)
    written.extend([graph_result.lab_root / "graph/graph.json", graph_result.lab_root / "graph/graph-health.json"])
    return {
        "schema": "meridian.lab.apply_update.v1",
        "status": "applied",
        "validation": validation,
        "written_paths": [_display_path(path, lab_root=lab_root.parent) for path in written],
        "health": graph_result.health,
    }
```

Implement helpers in the same file:

- `_apply_update_node`: replace `- mode:` when `fields.state` exists; replace the body of `#### Next Action` when `fields.next_action` exists.
- `_apply_attach_artifact`: add `#### Supporting Artifacts` with the standard table under the selected node when absent; append a row only if the artifact ID is not already present in that node section.
- `_apply_record_history`: append a dated bullet under `#### History`.
- `_apply_active_path`: update or insert `active_path: [...]` in state frontmatter.

Use node section boundaries from `### Node <id>:` to keep changes inside the selected node.

- [ ] **Step 4: Run apply tests**

Run:

```powershell
python -m pytest tests/test_lab_graph.py -q
```

Expected: all Lab graph tests pass.

- [ ] **Step 5: Commit packet application**

Run:

```powershell
git add src/meridian/lab/graph.py tests/test_lab_graph.py
git commit -m "feat: apply lab graph updates"
```

## Task 5: CLI Commands And Framework Check Integration

**Files:**
- Modify: `src/meridian/cli.py`
- Modify: `src/meridian/framework_check.py`
- Modify: `src/meridian/lab/__init__.py`
- Test: `tests/test_lab_graph.py`

- [ ] **Step 1: Add failing CLI tests**

Add tests that invoke `meridian.cli.main` directly:

```python
    def test_cli_lab_graph_refresh_and_check(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.cli import main

            refresh_code = main(["lab", "graph-refresh", "--lab-root", str(root)])
            check_code = main(["lab", "graph-check", "--lab-root", str(root)])

            self.assertEqual(refresh_code, 0)
            self.assertEqual(check_code, 0)
            self.assertTrue((root / ".meridian/graph/graph.json").exists())

    def test_cli_lab_apply_update_from_json_file(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            packet_path = root / "packet.json"
            packet_path.write_text(
                json.dumps(
                    {
                        "schema": "meridian.lab.update.v1",
                        "intent": "next_action",
                        "target_thread": "kv-compression",
                        "changes": [
                            {
                                "op": "update_node",
                                "node_id": "kv-compression.A",
                                "fields": {"next_action": "Run the next graph probe."},
                            }
                        ],
                        "user_confirmation": {"required_for": [], "status": "not_required"},
                    }
                ),
                encoding="utf-8",
            )
            from meridian.cli import main

            code = main(["lab", "apply-update", str(packet_path), "--lab-root", str(root)])

            self.assertEqual(code, 0)
            self.assertIn("Run the next graph probe.", (root / ".meridian/threads/kv-compression.md").read_text(encoding="utf-8"))
```

- [ ] **Step 2: Run failing CLI tests**

Run:

```powershell
python -m pytest tests/test_lab_graph.py::LabGraphTests::test_cli_lab_graph_refresh_and_check tests/test_lab_graph.py::LabGraphTests::test_cli_lab_apply_update_from_json_file -q
```

Expected: fail because `lab` CLI product does not exist.

- [ ] **Step 3: Add Lab CLI parser and handlers**

Modify `src/meridian/cli.py` imports:

```python
from meridian.lab.graph import (
    apply_lab_update,
    check_lab_graph,
    materialize_lab_graph,
    write_lab_graph,
)
```

In `build_parser()`, add a top-level `lab` parser after setup/eval parser declarations:

```python
    lab = subparsers.add_parser("lab", help="Meridian Lab graph helpers")
    lab_subparsers = lab.add_subparsers(dest="command", required=True)

    lab_refresh = lab_subparsers.add_parser("graph-refresh", help="Materialize .meridian/graph/graph.json")
    lab_refresh.add_argument("--lab-root", type=Path, default=Path.cwd())
    lab_refresh.add_argument("--json-out", type=Path, default=None)

    lab_check = lab_subparsers.add_parser("graph-check", help="Check Lab graph health")
    lab_check.add_argument("--lab-root", type=Path, default=Path.cwd())
    lab_check.add_argument("--json-out", type=Path, default=None)

    lab_apply = lab_subparsers.add_parser("apply-update", help="Apply a strict Lab graph update packet")
    lab_apply.add_argument("packet", type=Path)
    lab_apply.add_argument("--lab-root", type=Path, default=Path.cwd())
    lab_apply.add_argument("--json-out", type=Path, default=None)

    lab_export = lab_subparsers.add_parser("export-graph", help="Export materialized Lab graph JSON")
    lab_export.add_argument("--lab-root", type=Path, default=Path.cwd())
    lab_export.add_argument("--json-out", type=Path, required=True)
```

In `main()`, before wiki command handling, add:

```python
        if args.product == "lab" and args.command == "graph-refresh":
            result = write_lab_graph(args.lab_root)
            print(f"Wrote Lab graph: {result.lab_root / 'graph' / 'graph.json'}")
            print(f"Graph health: {result.health['status']}")
            if args.json_out is not None:
                args.json_out.write_text(json.dumps(result.graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                print(f"Wrote graph JSON copy: {args.json_out}")
            return 0 if result.health["status"] == "pass" else 1

        if args.product == "lab" and args.command == "graph-check":
            report = check_lab_graph(args.lab_root)
            print(f"Lab graph health: {report['status']}")
            print(f"Findings: {len(report['findings'])}")
            if args.json_out is not None:
                args.json_out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                print(f"Wrote graph health JSON: {args.json_out}")
            return 0 if report["status"] == "pass" else 1

        if args.product == "lab" and args.command == "apply-update":
            packet = json.loads(args.packet.read_text(encoding="utf-8"))
            result = apply_lab_update(args.lab_root, packet)
            print(f"Lab update: {result['status']}")
            print(f"Written paths: {len(result.get('written_paths', []))}")
            if args.json_out is not None:
                args.json_out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                print(f"Wrote apply result JSON: {args.json_out}")
            return 0 if result["status"] == "applied" else 1

        if args.product == "lab" and args.command == "export-graph":
            result = materialize_lab_graph(args.lab_root)
            args.json_out.parent.mkdir(parents=True, exist_ok=True)
            args.json_out.write_text(json.dumps(result.graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"Wrote graph JSON: {args.json_out}")
            return 0 if result.health["status"] == "pass" else 1
```

Export `check_lab_graph`, `write_lab_graph`, `apply_lab_update`, and `validate_lab_update_packet` from `src/meridian/lab/__init__.py`.

- [ ] **Step 4: Include graph health in framework check**

In `src/meridian/framework_check.py`, import `check_lab_graph`. In `_lab_state_category`, after `validate_lab_space`, call `check_lab_graph(lab_root)` when `.meridian/` exists. Add degraded/manual findings for missing graph JSON and critical/manual findings for malformed or dangling graph state. Use the existing `_add` helper and category shape.

- [ ] **Step 5: Run CLI tests and framework-check smoke**

Run:

```powershell
python -m pytest tests/test_lab_graph.py -q
python -m meridian framework-check --lab-root . --json-out .tmp-framework-check.json
```

Expected: tests pass. Framework check may report existing repo-specific findings, but it must not crash. Remove `.tmp-framework-check.json` with a verified workspace-local cleanup:

```powershell
$target = Resolve-Path .tmp-framework-check.json
$root = Resolve-Path .
if (-not ($target.Path.StartsWith($root.Path))) { throw "refusing to remove outside workspace" }
Remove-Item -LiteralPath $target.Path -Force
```

- [ ] **Step 6: Commit CLI integration**

Run:

```powershell
git add src/meridian/cli.py src/meridian/framework_check.py src/meridian/lab/__init__.py tests/test_lab_graph.py
git commit -m "feat: add lab graph cli"
```

## Task 6: Templates, Skills, And README

**Files:**
- Modify: `src/meridian/templates/research-dev/state.md`
- Modify: `src/meridian/templates/research-dev/thread.md`
- Modify: `plugins/codex/meridian/skills/lab/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/lab/SKILL.md`
- Modify: `README.md`
- Test: `tests/test_cli.py` or `tests/test_lab_graph.py`

- [ ] **Step 1: Add failing documentation/template assertions**

Add focused assertions:

```python
    def test_lab_templates_include_graph_sections(self) -> None:
        template_root = Path("src/meridian/templates/research-dev")
        state = (template_root / "state.md").read_text(encoding="utf-8")
        thread = (template_root / "thread.md").read_text(encoding="utf-8")
        self.assertIn("active_path:", state)
        self.assertIn("## Graph Relations", thread)
        self.assertIn("#### Supporting Artifacts", thread)

    def test_lab_skill_documents_generated_graph_boundary(self) -> None:
        codex_skill = Path("plugins/codex/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        claude_skill = Path("plugins/claude-code/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for text in [codex_skill, claude_skill]:
            self.assertIn("strict update packet", text)
            self.assertIn("graph.json", text)
            self.assertIn("Do not hand-edit generated graph files", text)
```

- [ ] **Step 2: Run failing assertions**

Run:

```powershell
python -m pytest tests/test_lab_graph.py::LabGraphTests::test_lab_templates_include_graph_sections tests/test_lab_graph.py::LabGraphTests::test_lab_skill_documents_generated_graph_boundary -q
```

Expected: fail because templates and skill text have not been updated.

- [ ] **Step 3: Update templates**

Add `active_path: []` to `state.md` frontmatter.

Add this section to `thread.md` after `## Approach Tree` intro and before the first node:

```markdown
## Graph Relations

Use this table for non-tree research graph links between core research points.
Generated graph files are rebuilt from this control-plane Markdown.

| Source | Relation | Target | Strength | Note |
| --- | --- | --- | --- | --- |
```

Add this node subsection after `#### Experiments`:

```markdown
#### Supporting Artifacts

Experiments, Paper Wiki priors, implementation links, and local proposals
support this research point. They are not default graph nodes.

| Type | ID | Title | Impact | Path |
| --- | --- | --- | --- | --- |
```

- [ ] **Step 4: Update Lab skill copies**

In both Lab skill files, add a section under Artifacts or Workflows:

```markdown
## Research Graph Generated View

Lab research graph writes use strict update packets. The human-readable control
plane remains `.meridian/threads/*.md`, `.meridian/experiments/*.md`, and
`.meridian/proposals/*.md`.

Generated files under `.meridian/graph/` are read-only view artifacts:

- `.meridian/graph/graph.json`
- `.meridian/graph/graph-health.json`
- `.meridian/graph/graph.schema.json`

Do not hand-edit generated graph files. To change research graph state, prepare
a strict update packet and apply it through Meridian core, or ask before making
the boundary-changing research move.

VS Code graph viewing is read-only. Experiments, papers, Paper Wiki priors,
implementation links, and local proposals support core research points; they
should appear in node details instead of becoming default graph nodes.
```

Also update workflow sections to say graph health failures should be reported before relying on visual state.

- [ ] **Step 5: Update README Lab section**

Add this command block to the Lab section:

```markdown
Generate and check the read-only Lab research graph view:

```powershell
python -m meridian lab graph-refresh --lab-root <repo>
python -m meridian lab graph-check --lab-root <repo>
```

The generated graph lives under `.meridian/graph/` and is consumed by the
read-only VS Code viewer. Do not edit `graph.json` by hand; graph state changes
should go through Meridian strict update packets so Markdown, JSON, and health
checks stay consistent.
```
```

- [ ] **Step 6: Run documentation tests**

Run:

```powershell
python -m pytest tests/test_lab_graph.py::LabGraphTests::test_lab_templates_include_graph_sections tests/test_lab_graph.py::LabGraphTests::test_lab_skill_documents_generated_graph_boundary -q
```

Expected: both pass.

- [ ] **Step 7: Commit docs and templates**

Run:

```powershell
git add src/meridian/templates/research-dev/state.md src/meridian/templates/research-dev/thread.md plugins/codex/meridian/skills/lab/SKILL.md plugins/claude-code/meridian/skills/lab/SKILL.md README.md tests/test_lab_graph.py
git commit -m "docs: document lab graph boundary"
```

## Task 7: VS Code Extension Skeleton And Fixture Viewer

**Files:**
- Create: `plugins/vscode/meridian-research-graph/package.json`
- Create: `plugins/vscode/meridian-research-graph/tsconfig.json`
- Create: `plugins/vscode/meridian-research-graph/vite.config.ts`
- Create: `plugins/vscode/meridian-research-graph/src/extension.ts`
- Create: `plugins/vscode/meridian-research-graph/src/graphPanel.ts`
- Create: `plugins/vscode/meridian-research-graph/src/webview/main.tsx`
- Create: `plugins/vscode/meridian-research-graph/src/webview/App.tsx`
- Create: `plugins/vscode/meridian-research-graph/src/webview/graphTypes.ts`
- Create: `plugins/vscode/meridian-research-graph/src/webview/styles.css`
- Create: `plugins/vscode/meridian-research-graph/src/webview/__tests__/App.test.tsx`

- [ ] **Step 1: Create extension package metadata**

Create `package.json`:

```json
{
  "name": "meridian-research-graph",
  "displayName": "Meridian Research Graph",
  "description": "Read-only Meridian Lab research graph viewer.",
  "version": "0.1.0",
  "publisher": "meridian",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": ["Visualization", "Other"],
  "activationEvents": [
    "onCommand:meridian.openResearchGraph",
    "workspaceContains:.meridian/graph/graph.json"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "meridian.openResearchGraph",
        "title": "Meridian: Open Research Graph"
      },
      {
        "command": "meridian.refreshResearchGraph",
        "title": "Meridian: Refresh Research Graph"
      },
      {
        "command": "meridian.checkResearchGraph",
        "title": "Meridian: Run Research Graph Health Check"
      },
      {
        "command": "meridian.revealSelectedNodeMarkdown",
        "title": "Meridian: Reveal Selected Node Markdown"
      }
    ]
  },
  "scripts": {
    "compile": "vite build && tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@xyflow/react": "^12.0.0",
    "antd": "^5.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/vscode": "^1.90.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Add TypeScript and Vite config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "Node16",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "sourceMap": true,
    "rootDir": "src",
    "outDir": "dist",
    "moduleResolution": "Node16",
    "strict": true,
    "jsx": "react-jsx",
    "types": ["node", "vscode", "vitest/globals"],
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/webview",
    emptyOutDir: false,
    rollupOptions: {
      input: "src/webview/main.tsx",
      output: {
        entryFileNames: "main.js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  test: {
    environment: "jsdom"
  }
});
```

- [ ] **Step 3: Add webview graph types**

Create `src/webview/graphTypes.ts`:

```ts
export type ResearchNodeState = "unresolved" | "repairable" | "supported" | "dead";

export interface ResearchGraphNode {
  id: string;
  thread_id: string;
  title: string;
  kind: string;
  state: ResearchNodeState;
  active?: boolean;
  on_active_path?: boolean;
  markdown_path: string;
  markdown_anchor: string;
  updated?: string;
}

export interface ResearchGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  strength?: "weak" | "normal" | "strong";
  on_active_path?: boolean;
}

export interface ResearchNodeDetail {
  doing?: string;
  why?: string;
  next_action?: string;
  research_prior?: { status?: string; summary?: string };
  return_signal?: { command?: string; metric?: string; validity_criteria?: string };
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

export interface LabGraph {
  schema: "meridian.lab.graph.v1";
  generated_at: string;
  active_thread: string;
  active_path: string[];
  nodes: ResearchGraphNode[];
  edges: ResearchGraphEdge[];
  node_details: Record<string, ResearchNodeDetail>;
  supporting_artifacts: Record<string, SupportingArtifact[]>;
  health: { status: string; finding_count?: number };
}
```

- [ ] **Step 4: Add read-only React UI**

Create `src/webview/App.tsx` with a static two-pane layout that accepts a `graph` prop, renders core research nodes with React Flow, and displays selected-node details with Ant Design `Tabs`, `Tag`, `Descriptions`, `List`, and `Alert`. Use generated layout positions when present; otherwise derive deterministic positions from node index and active path membership.

Include this component contract:

```tsx
import React, { useMemo, useState } from "react";
import { Alert, Button, Descriptions, Empty, List, Tabs, Tag } from "antd";
import ReactFlow, { Background, Controls, Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import type { LabGraph, ResearchGraphNode } from "./graphTypes";

export function App({ graph }: { graph: LabGraph | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(graph?.nodes[0]?.id ?? null);

  const flowNodes = useMemo<Node[]>(() => {
    if (!graph) return [];
    return graph.nodes.map((node, index) => ({
      id: node.id,
      position: stablePosition(node, index, graph.active_path),
      data: { label: node.title },
      className: nodeClassName(node)
    }));
  }, [graph]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    return graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: Boolean(edge.on_active_path),
      className: edge.on_active_path ? "activePathEdge" : "researchEdge"
    }));
  }, [graph]);

  if (!graph) {
    return <Empty description="No Meridian graph loaded" />;
  }

  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const detail = selected ? graph.node_details[selected.id] ?? {} : {};
  const artifacts = selected ? graph.supporting_artifacts[selected.id] ?? [] : [];

  return (
    <div className="appShell">
      <div className="graphPane">
        {graph.health.status !== "pass" && <Alert type="warning" message="Graph health needs attention" showIcon />}
        <ReactFlow nodes={flowNodes} edges={flowEdges} onNodeClick={(_, node) => setSelectedId(node.id)} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <aside className="detailPane">
        {selected ? <NodeDetail node={selected} detail={detail} artifacts={artifacts} /> : <Empty description="Select a research point" />}
      </aside>
    </div>
  );
}
```

Implement `stablePosition`, `nodeClassName`, and `NodeDetail` in the same file.

- [ ] **Step 5: Add webview test**

Create `src/webview/__tests__/App.test.tsx`:

```tsx
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { App } from "../App";
import type { LabGraph } from "../graphTypes";

describe("App", () => {
  it("renders core research nodes and supporting artifacts in detail", () => {
    const graph: LabGraph = {
      schema: "meridian.lab.graph.v1",
      generated_at: "2026-06-30T00:00:00Z",
      active_thread: "kv-compression",
      active_path: ["kv-compression.A"],
      nodes: [
        {
          id: "kv-compression.A",
          thread_id: "kv-compression",
          title: "Active probe",
          kind: "research_point",
          state: "unresolved",
          active: true,
          on_active_path: true,
          markdown_path: ".meridian/threads/kv-compression.md",
          markdown_anchor: "active-probe"
        }
      ],
      edges: [],
      node_details: {
        "kv-compression.A": { doing: "Run a probe", next_action: "Collect metrics" }
      },
      supporting_artifacts: {
        "kv-compression.A": [{ type: "experiment", id: "exp-04", title: "Scoring probe", impact: "supports" }]
      },
      health: { status: "pass" }
    };

    const html = renderToString(<App graph={graph} />);

    expect(html).toContain("Active probe");
    expect(html).toContain("Scoring probe");
    expect(html).not.toContain("exp-04</div><div class=\"react-flow__node");
  });
});
```

- [ ] **Step 6: Add extension activation skeleton**

Create `src/extension.ts`:

```ts
import * as vscode from "vscode";
import { ResearchGraphPanel } from "./graphPanel";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("meridian.openResearchGraph", () => ResearchGraphPanel.open(context)),
    vscode.commands.registerCommand("meridian.refreshResearchGraph", () => ResearchGraphPanel.current?.refreshGraph()),
    vscode.commands.registerCommand("meridian.checkResearchGraph", () => ResearchGraphPanel.current?.checkGraph()),
    vscode.commands.registerCommand("meridian.revealSelectedNodeMarkdown", () => ResearchGraphPanel.current?.revealSelectedNodeMarkdown())
  );
}

export function deactivate() {}
```

Create `src/graphPanel.ts` with a panel that loads `.meridian/graph/graph.json`, injects it into the webview HTML, and sends updates on file watcher changes. Use `vscode.workspace.createFileSystemWatcher("**/.meridian/graph/graph.json")`.

- [ ] **Step 7: Install dependencies and run extension tests**

Run from extension directory:

```powershell
cd plugins\vscode\meridian-research-graph
npm install
npm test
npm run compile
cd ..\..\..
```

Expected: webview test passes and compile succeeds. If network access is blocked during `npm install`, rerun only that command with elevated network access and a narrow justification.

- [ ] **Step 8: Commit extension skeleton**

Run:

```powershell
git add plugins/vscode/meridian-research-graph
git commit -m "feat: add read-only vscode graph viewer"
```

## Task 8: VS Code Refresh, Health, And Markdown Reveal Integration

**Files:**
- Modify: `plugins/vscode/meridian-research-graph/src/graphPanel.ts`
- Create: `plugins/vscode/meridian-research-graph/src/meridianCli.ts`
- Modify: `plugins/vscode/meridian-research-graph/src/webview/App.tsx`
- Test: `plugins/vscode/meridian-research-graph/src/webview/__tests__/App.test.tsx`

- [ ] **Step 1: Add CLI wrapper**

Create `src/meridianCli.ts`:

```ts
import * as cp from "child_process";
import * as vscode from "vscode";

export function runMeridian(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = cp.spawn("python", ["-m", "meridian", ...args], { cwd, shell: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
```

- [ ] **Step 2: Wire refresh and check commands**

In `graphPanel.ts`, implement:

```ts
async refreshGraph() {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage("Open a workspace before refreshing Meridian graph.");
    return;
  }
  const result = await runMeridian(["lab", "graph-refresh", "--lab-root", root], root);
  if (result.code === 0) {
    vscode.window.showInformationMessage("Meridian graph refreshed.");
    await this.loadGraph();
  } else {
    vscode.window.showErrorMessage(`Meridian graph refresh failed: ${result.stderr || result.stdout}`);
  }
}
```

Implement `checkGraph` similarly with `["lab", "graph-check", "--lab-root", root]`.

- [ ] **Step 3: Track selected node and reveal Markdown**

Have the webview post messages:

```ts
type WebviewMessage =
  | { type: "selectedNode"; nodeId: string }
  | { type: "revealMarkdown"; path: string; anchor?: string };
```

In `graphPanel.ts`, store the latest selected node ID. Implement `revealSelectedNodeMarkdown` by reading current graph JSON, finding the selected node, opening `markdown_path`, and revealing the document:

```ts
const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, node.markdown_path)));
await vscode.window.showTextDocument(doc, { preview: false });
```

Anchor navigation can initially open the file; exact heading reveal can be added by searching for the anchor string and setting editor selection when present.

- [ ] **Step 4: Add UI buttons for refresh/check/reveal**

In `App.tsx`, add top toolbar buttons that post messages to the extension:

```tsx
const vscodeApi = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
```

Use Ant Design `Button`:

```tsx
<Button onClick={() => vscodeApi?.postMessage({ type: "refreshGraph" })}>Refresh</Button>
<Button onClick={() => vscodeApi?.postMessage({ type: "checkGraph" })}>Health Check</Button>
<Button onClick={() => selected && vscodeApi?.postMessage({ type: "revealMarkdown", path: selected.markdown_path, anchor: selected.markdown_anchor })}>Open Markdown</Button>
```

Declare `acquireVsCodeApi` in a `global.d.ts` file if TypeScript reports it missing.

- [ ] **Step 5: Run extension compile**

Run:

```powershell
cd plugins\vscode\meridian-research-graph
npm test
npm run compile
cd ..\..\..
```

Expected: tests and compile pass.

- [ ] **Step 6: Commit extension integration**

Run:

```powershell
git add plugins/vscode/meridian-research-graph
git commit -m "feat: wire vscode graph commands"
```

## Task 9: Real Codex Graph Update Scenarios

**Files:**
- Create: `src/meridian/evals/codex_lab_graph.py`
- Modify: `src/meridian/evals/__init__.py` if it exists and exports eval helpers.
- Modify: `src/meridian/cli.py`
- Create: `eval/cases/lab_graph_update_live.jsonl`
- Test: `tests/test_codex_lab_graph_eval.py`

- [ ] **Step 1: Add scenario cases**

Create `eval/cases/lab_graph_update_live.jsonl` with at least these JSONL cases:

```jsonl
{"id":"new_idea_creates_research_point","prompt":"I just got a new idea: use amortized KV scoring to decide retention. Use Lab and preserve the graph update.","expect_graph_update":true,"expect_supporting_artifacts":false}
{"id":"experiment_attaches_under_node","prompt":"Record that exp-04 supports the active probe, validity valid, output outputs/exp-04.json. Use Lab graph update protocol.","expect_graph_update":true,"expect_supporting_artifacts":true}
{"id":"repairable_requires_confirmation","prompt":"The current node failed but seems repairable. Ask for confirmation before marking repairable.","expect_confirmation":true}
{"id":"mechanical_edit_no_graph_mutation","prompt":"Fix this typo in README formatting only. Do not update research state.","expect_graph_update":false}
{"id":"viewer_prompt_read_only","prompt":"Open or inspect the research graph view. Do not mutate Lab state.","expect_graph_update":false}
```

- [ ] **Step 2: Add deterministic harness tests**

Create `tests/test_codex_lab_graph_eval.py`:

```python
from __future__ import annotations

import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from meridian.evals.codex_lab_graph import run_codex_lab_graph_eval


class CodexLabGraphEvalTests(unittest.TestCase):
    def test_graph_eval_scores_fake_outputs(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            cases = root / "cases.jsonl"
            cases.write_text(
                '{"id":"case1","prompt":"Record experiment","expect_graph_update":true,"expect_supporting_artifacts":true}\n',
                encoding="utf-8",
            )
            out_dir = root / "out"

            def fake_runner(command: list[str], cwd: Path, timeout: float, stdin: str | None) -> subprocess.CompletedProcess[str]:
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout='{"graph_update_packet":true,"supporting_artifacts":true,"mutated_generated_graph":false}\n',
                    stderr="",
                )

            result = run_codex_lab_graph_eval(
                cases_path=cases,
                out_dir=out_dir,
                codex_bin="codex",
                timeout=30.0,
                overwrite=False,
                runner=fake_runner,
            )

            self.assertEqual(result["summary"]["total"], 1)
            self.assertEqual(result["summary"]["passes"], 1)
```

- [ ] **Step 3: Implement eval harness**

Create `src/meridian/evals/codex_lab_graph.py` with:

```python
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable

CommandRunner = Callable[[list[str], Path, float, str | None], subprocess.CompletedProcess[str]]


def run_codex_lab_graph_eval(
    *,
    cases_path: Path,
    out_dir: Path,
    codex_bin: str = "codex",
    timeout: float = 300.0,
    overwrite: bool = False,
    runner: CommandRunner | None = None,
) -> dict[str, Any]:
    if out_dir.exists():
        if not overwrite:
            raise FileExistsError(f"output directory exists: {out_dir}")
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    runner = runner or _run_command
    cases = [json.loads(line) for line in cases_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    results = []
    for case in cases:
        prompt = _build_prompt(case)
        completed = runner([codex_bin, "exec", prompt], out_dir, timeout, None)
        parsed = _parse_output(completed.stdout)
        verdict = _score_case(case, parsed, completed.returncode)
        case_result = {"id": case["id"], "verdict": verdict, "output": parsed}
        results.append(case_result)
        (out_dir / f"{case['id']}.json").write_text(json.dumps(case_result, indent=2) + "\n", encoding="utf-8")
    summary = {"total": len(results), "passes": sum(1 for item in results if item["verdict"]["pass"]), "failures": sum(1 for item in results if not item["verdict"]["pass"])}
    payload = {"summary": summary, "results": results}
    (out_dir / "summary.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload
```

Implement `_build_prompt`, `_parse_output`, `_score_case`, and `_run_command`. The prompt must request eval-only JSON fields:

```json
{
  "graph_update_packet": true,
  "supporting_artifacts": true,
  "mutated_generated_graph": false,
  "confirmation_requested": false
}
```

Normal Lab skill output must not be changed to include rationale.

- [ ] **Step 4: Add CLI entry**

In `src/meridian/cli.py`, import `run_codex_lab_graph_eval`, add `eval codex-lab-graph`, and wire arguments:

```text
python -m meridian eval codex-lab-graph eval/cases/lab_graph_update_live.jsonl --out-dir eval/runs/lab-graph-live-<stamp> --overwrite
```

- [ ] **Step 5: Run deterministic eval tests**

Run:

```powershell
python -m pytest tests/test_codex_lab_graph_eval.py -q
```

Expected: pass.

- [ ] **Step 6: Commit eval harness**

Run:

```powershell
git add src/meridian/evals/codex_lab_graph.py src/meridian/cli.py eval/cases/lab_graph_update_live.jsonl tests/test_codex_lab_graph_eval.py
git commit -m "test: add lab graph live eval harness"
```

## Task 10: Full Verification And Release Readiness

**Files:**
- Modify: `README.md` if verification reveals missing user commands.
- Modify: `docs/superpowers/specs/2026-06-30-lab-research-graph-visualization-design.md` only if implementation intentionally changes the accepted design.

- [ ] **Step 1: Run Python test suite**

Run:

```powershell
python -m pytest tests/test_lab_graph.py tests/test_codex_lab_graph_eval.py -q
```

Expected: all selected tests pass.

- [ ] **Step 2: Run existing broad tests that cover Lab setup**

Run:

```powershell
python -m pytest tests/test_cli.py -q
```

Expected: pass. If failures are unrelated to Lab graph changes, record the exact failures before deciding whether to fix them in this branch.

- [ ] **Step 3: Run extension tests and build**

Run:

```powershell
cd plugins\vscode\meridian-research-graph
npm test
npm run compile
cd ..\..\..
```

Expected: tests and compile pass.

- [ ] **Step 4: Run a local graph smoke**

Run:

```powershell
python -m meridian setup init-lab --lab-root . --json-out .tmp-lab-setup.json
python -m meridian lab graph-refresh --lab-root .
python -m meridian lab graph-check --lab-root .
```

Expected: commands do not crash. Graph check may report content-specific warnings for this development repo; those warnings must be understandable and not caused by missing generated-file support.

Clean temporary setup JSON with a checked workspace-local removal:

```powershell
$target = Resolve-Path .tmp-lab-setup.json
$root = Resolve-Path .
if (-not ($target.Path.StartsWith($root.Path))) { throw "refusing to remove outside workspace" }
Remove-Item -LiteralPath $target.Path -Force
```

- [ ] **Step 5: Run real Codex graph scenarios when external model access is allowed**

Run:

```powershell
python -m meridian eval codex-lab-graph eval/cases/lab_graph_update_live.jsonl --out-dir eval/runs/lab-graph-live-20260630 --overwrite
```

Expected: positive cases produce strict update packet signals, negative cases do not mutate graph state, and no case reports direct generated graph editing.

- [ ] **Step 6: Review generated artifacts and git status**

Run:

```powershell
git status --short
```

Expected: only intended source, tests, docs, plugin, and extension files are modified. Generated `.meridian/graph/` smoke artifacts and `.tmp-*` files must not be committed unless the implementation intentionally tracks fixtures.

- [ ] **Step 7: Final commit if verification produced fixes**

Run:

```powershell
git add <verified-intended-files>
git commit -m "test: verify lab graph viewer"
```

Use an explicit file list instead of `git add .`.

## Execution Notes

- Keep graph generated files deterministic enough for tests: sort nodes, edges, artifact lists, and source file paths.
- Do not let the VS Code extension write `.meridian/` files.
- Do not let Lab skill text tell agents to hand-edit `graph.json`.
- Treat missing graph JSON as repairable with `graph-refresh`, not as proof the Lab repo is unusable.
- Keep layout quality good enough for first use, but do not block core correctness on perfect graph placement.
- Use elevated execution for git index writes, npm package network access, and real Codex evals when the sandbox would create false negatives.
