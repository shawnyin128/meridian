"""Adversarial tests for the Lab multiple-active-nodes model.

Covers what tests/test_lab_graph.py does not: the legacy active_path fallback,
automatic deactivation on close, reopen_node, the Focus workspace event
(present/absent), the node_not_active and active_node_closed warnings, and
on_active_path marking every active node's ancestor route and nothing else.
"""

from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from meridian.lab.graph import apply_lab_update, materialize_lab_graph


def _write_lab(root: Path, *, state_frontmatter: str, thread_body: str) -> None:
    lab = root / ".meridian"
    (lab / "threads").mkdir(parents=True)
    (lab / "experiments").mkdir()
    (lab / "proposals").mkdir()
    (lab / "state.md").write_text(f"---\ntype: lab-state\n{state_frontmatter}\n---\n# State\n", encoding="utf-8")
    (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
    (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
    (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
    (lab / "threads/kv-compression.md").write_text(
        f"---\ntype: research-thread\ntitle: KV Compression\n---\n# Research Thread: KV Compression\n\n{thread_body}",
        encoding="utf-8",
    )


def _write_workspace_manifest(root: Path) -> None:
    lab = root / ".meridian"
    (lab / "events").mkdir(parents=True, exist_ok=True)
    (lab / "control").mkdir(parents=True, exist_ok=True)
    (lab / "workspace.json").write_text(
        json.dumps(
            {
                "schema_version": "meridian.workspace.v1",
                "project": {"id": "project-1", "name": "Test project"},
                "surfaces": {
                    "plan": {"path": ".meridian/control/plan.json", "writer": "meridian-app"},
                    "graph": {"path": ".meridian/graph/graph.json", "writer": "workspace"},
                    "events": {"path": ".meridian/events/events.json", "writer": "workspace"},
                },
            }
        ),
        encoding="utf-8",
    )
    (lab / "control/plan.json").write_text(
        json.dumps(
            {
                "schema_version": "meridian.project-plan.v1",
                "revision": "r1",
                "updated_at": "2026-09-16T00:00:00Z",
                "project": {"id": "project-1", "name": "Test project"},
                "tasks": [],
                "milestones": [],
            }
        ),
        encoding="utf-8",
    )


_TWO_NODE_TREE = (
    "## Approach Tree\n\n"
    "### Node A: Idea seed\n\n"
    "- mode: `unresolved`\n\n"
    "### Node B: Repair branch\n\n"
    "- mode: `unresolved`\n"
    "- parent: A\n"
)


class LabActiveNodesTests(unittest.TestCase):
    def test_legacy_active_path_with_multiple_elements_reads_as_last(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(
                root,
                state_frontmatter="active_thread: kv-compression\nactive_path: [kv-compression.A, kv-compression.B]",
                thread_body=_TWO_NODE_TREE,
            )

            graph = materialize_lab_graph(root).graph

            self.assertEqual(graph["active_nodes"], ["kv-compression.B"])
            nodes_by_id = {node["id"]: node for node in graph["nodes"]}
            self.assertFalse(nodes_by_id["kv-compression.A"]["active"])
            self.assertTrue(nodes_by_id["kv-compression.B"]["active"])

    def test_marking_a_node_supported_or_dead_removes_it_from_active_nodes(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(
                root,
                state_frontmatter="active_thread: kv-compression\nactive_nodes: [kv-compression.A, kv-compression.B]",
                thread_body=_TWO_NODE_TREE,
            )
            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "close_both",
                "target_thread": "kv-compression",
                "changes": [
                    {"op": "update_node", "node_id": "kv-compression.A", "fields": {"state": "supported"}},
                    {"op": "update_node", "node_id": "kv-compression.B", "fields": {"state": "dead"}},
                ],
                "user_confirmation": {
                    "required_for": ["state:dead"],
                    "status": "accepted",
                },
            }

            result = apply_lab_update(root, packet)

            self.assertEqual(result["status"], "applied")
            state_text = (root / ".meridian/state.md").read_text(encoding="utf-8")
            self.assertIn("active_nodes: []", state_text)
            self.assertEqual(result["graph_health"]["status"], "pass")
            self.assertEqual(result["warnings"], [])

    def test_deactivate_node_removes_it_without_touching_others(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(
                root,
                state_frontmatter="active_thread: kv-compression\nactive_nodes: [kv-compression.A, kv-compression.B]",
                thread_body=_TWO_NODE_TREE,
            )
            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "pause_b",
                "target_thread": "kv-compression",
                "changes": [{"op": "deactivate_node", "node_id": "kv-compression.B"}],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)

            self.assertEqual(result["status"], "applied")
            graph = materialize_lab_graph(root).graph
            self.assertEqual(graph["active_nodes"], ["kv-compression.A"])

    def test_reopen_node_sets_unresolved_and_adds_to_active_nodes(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(
                root,
                state_frontmatter="active_thread: kv-compression\nactive_nodes: []",
                thread_body=_TWO_NODE_TREE.replace("### Node A: Idea seed\n\n- mode: `unresolved`", "### Node A: Idea seed\n\n- mode: `dead`"),
            )
            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "reopen_a",
                "target_thread": "kv-compression",
                "changes": [{"op": "reopen_node", "node_id": "kv-compression.A"}],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)

            self.assertEqual(result["status"], "applied")
            graph = materialize_lab_graph(root).graph
            nodes_by_id = {node["id"]: node for node in graph["nodes"]}
            self.assertEqual(nodes_by_id["kv-compression.A"]["state"], "unresolved")
            self.assertEqual(graph["active_nodes"], ["kv-compression.A"])

    def test_activate_node_emits_focus_event_when_workspace_present(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(
                root,
                state_frontmatter="active_thread: kv-compression\nactive_nodes: []",
                thread_body=_TWO_NODE_TREE,
            )
            _write_workspace_manifest(root)
            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "start_a",
                "target_thread": "kv-compression",
                "changes": [{"op": "activate_node", "node_id": "kv-compression.A"}],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            apply_lab_update(root, packet)

            events_path = root / ".meridian/events/events.json"
            self.assertTrue(events_path.exists())
            events = json.loads(events_path.read_text(encoding="utf-8"))["events"]
            self.assertEqual(len(events), 1)
            self.assertIn("开始推进", events[0]["text"])
            self.assertEqual(events[0]["node"], "kv-compression.A")

    def test_activate_node_writes_no_event_without_a_workspace(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(
                root,
                state_frontmatter="active_thread: kv-compression\nactive_nodes: []",
                thread_body=_TWO_NODE_TREE,
            )
            # No workspace.json: a Lab-only repo is valid and gets no event.
            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "start_a",
                "target_thread": "kv-compression",
                "changes": [{"op": "activate_node", "node_id": "kv-compression.A"}],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)

            self.assertEqual(result["status"], "applied")
            self.assertFalse((root / ".meridian/events/events.json").exists())

    def test_node_not_active_warning_when_editing_an_inactive_node(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(
                root,
                state_frontmatter="active_thread: kv-compression\nactive_nodes: []",
                thread_body=_TWO_NODE_TREE,
            )
            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "quiet_edit",
                "target_thread": "kv-compression",
                "changes": [
                    {"op": "update_node", "node_id": "kv-compression.A", "fields": {"next_action": "Try a smaller probe."}},
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)

            self.assertEqual(result["status"], "applied")
            warning_codes = [warning["code"] for warning in result["warnings"]]
            self.assertIn("node_not_active", warning_codes)
            node_not_active = next(w for w in result["warnings"] if w["code"] == "node_not_active")
            self.assertEqual(node_not_active["node_id"], "kv-compression.A")

    def test_active_node_closed_health_warning_after_hand_edit(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(
                root,
                state_frontmatter="active_thread: kv-compression\nactive_nodes: [kv-compression.A]",
                thread_body=_TWO_NODE_TREE.replace("### Node A: Idea seed\n\n- mode: `unresolved`", "### Node A: Idea seed\n\n- mode: `supported`"),
            )

            result = materialize_lab_graph(root)

            codes = [finding["code"] for finding in result.health["findings"]]
            self.assertIn("active_node_closed", codes)
            self.assertEqual(result.health["status"], "warn")

    def test_on_active_path_marks_every_active_nodes_ancestor_route_and_nothing_else(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(
                root,
                state_frontmatter="active_thread: kv-compression\nactive_nodes: [kv-compression.B, kv-compression.C]",
                thread_body=(
                    "## Approach Tree\n\n"
                    "### Node A: Root\n\n"
                    "- mode: `unresolved`\n\n"
                    "### Node B: Branch one\n\n"
                    "- mode: `unresolved`\n"
                    "- parent: A\n\n"
                    "### Node C: Branch two\n\n"
                    "- mode: `unresolved`\n"
                    "- parent: A\n\n"
                    "### Node D: Untouched branch\n\n"
                    "- mode: `unresolved`\n"
                    "- parent: A\n"
                ),
            )

            graph = materialize_lab_graph(root).graph
            edges_by_target = {edge["target"]: edge for edge in graph["edges"]}

            self.assertTrue(edges_by_target["kv-compression.B"]["on_active_path"])
            self.assertTrue(edges_by_target["kv-compression.C"]["on_active_path"])
            self.assertFalse(edges_by_target["kv-compression.D"]["on_active_path"])


if __name__ == "__main__":
    unittest.main()
