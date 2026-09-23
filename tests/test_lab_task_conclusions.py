"""Task links and node conclusions in the Lab graph (link_task, unlink_task, record_conclusion)."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from meridian.lab.graph import (
    apply_lab_update,
    check_lab_graph_payload,
    materialize_lab_graph,
)

THREAD = ".meridian/threads/kv.md"

# A thread as 0.0.14.x writes it: no Tasks or Conclusion sections.
_OLD_THREAD = (
    "---\ntype: research-thread\ntitle: KV\n---\n# Research Thread: KV\n\n## Approach Tree\n\n"
    "### Node A: Seed\n\n- mode: `unresolved`\n\n#### Experiments\n\n- `exp-1`\n\n"
    "### Node B: Branch\n\n- mode: `supported`\n- parent: A\n"
)


def _write_repo(root: Path, *, tasks: list[str]) -> None:
    lab = root / ".meridian"
    for folder in ("threads", "experiments", "proposals", "events", "control"):
        (lab / folder).mkdir(parents=True)
    (lab / "state.md").write_text("---\ntype: lab-state\nactive_thread: kv\nactive_nodes: [kv.A]\n---\n", encoding="utf-8")
    (lab / "threads/kv.md").write_text(_OLD_THREAD, encoding="utf-8")
    (lab / "experiments/exp-1.md").write_text("# Experiment: one\n", encoding="utf-8")
    (lab / "workspace.json").write_text(
        json.dumps(
            {
                "schema_version": "meridian.workspace.v1",
                "project": {"id": "p1", "name": "P"},
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
                "project": {"id": "p1", "name": "P"},
                "tasks": [{"id": task, "title": f"Task {task}"} for task in tasks],
                "milestones": [],
            }
        ),
        encoding="utf-8",
    )


def _packet(*changes: dict) -> dict:
    return {
        "schema": "meridian.lab.update.v1",
        "intent": "test",
        "target_thread": "kv",
        "changes": list(changes),
        "user_confirmation": {"required_for": [], "status": "not_required"},
    }


def _codes(result: dict) -> list[str]:
    return [finding["code"] for finding in result["validation"]["findings"]]


class TaskLinkTests(unittest.TestCase):
    def test_a_thread_without_the_new_sections_reads_without_tasks_or_conclusion(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, tasks=[])
            details = materialize_lab_graph(root).graph["node_details"]
            self.assertNotIn("tasks", details["kv.A"])
            self.assertNotIn("conclusion", details["kv.B"])

    def test_linking_a_plan_task_records_it_on_the_node(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, tasks=["t1", "t2"])
            result = apply_lab_update(
                root,
                _packet(
                    {"op": "link_task", "node_id": "kv.A", "task_id": "t1"},
                    {"op": "link_task", "node_id": "kv.A", "task_id": "t2"},
                ),
            )
            self.assertEqual(result["status"], "applied", result)
            self.assertIn("#### Tasks\n\n- `t1`\n- `t2`", (root / THREAD).read_text(encoding="utf-8"))
            graph = json.loads((root / ".meridian/graph/graph.json").read_text(encoding="utf-8"))
            self.assertEqual(graph["node_details"]["kv.A"]["tasks"], ["t1", "t2"])

    def test_a_task_outside_the_plan_is_rejected(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, tasks=["t1"])
            result = apply_lab_update(root, _packet({"op": "link_task", "node_id": "kv.A", "task_id": "t9"}))
            self.assertEqual(result["status"], "rejected")
            self.assertEqual(_codes(result), ["task_missing"])

    def test_a_task_already_on_another_node_is_rejected_until_unlinked(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, tasks=["t1"])
            apply_lab_update(root, _packet({"op": "link_task", "node_id": "kv.A", "task_id": "t1"}))

            refused = apply_lab_update(root, _packet({"op": "link_task", "node_id": "kv.B", "task_id": "t1"}))
            self.assertEqual(_codes(refused), ["task_already_linked"])
            self.assertIn("kv.A", refused["validation"]["findings"][0]["message"])

            moved = apply_lab_update(
                root,
                _packet(
                    {"op": "unlink_task", "node_id": "kv.A", "task_id": "t1"},
                    {"op": "link_task", "node_id": "kv.B", "task_id": "t1"},
                ),
            )
            self.assertEqual(moved["status"], "applied", moved)
            details = materialize_lab_graph(root).graph["node_details"]
            self.assertNotIn("tasks", details["kv.A"])
            self.assertEqual(details["kv.B"]["tasks"], ["t1"])
            self.assertNotIn("#### Tasks\n\n\n", (root / THREAD).read_text(encoding="utf-8"))

    def test_a_task_linked_to_two_nodes_by_hand_is_reported(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, tasks=["t1"])
            text = _OLD_THREAD.replace("#### Experiments", "#### Tasks\n\n- `t1`\n\n#### Experiments")
            (root / THREAD).write_text(text + "\n#### Tasks\n\n- `t1`\n", encoding="utf-8")
            result = materialize_lab_graph(root)
            health = check_lab_graph_payload(result.graph, lab_root=result.lab_root)
            self.assertIn("task_linked_twice", [finding["code"] for finding in health["findings"]])


class ConclusionTests(unittest.TestCase):
    def test_a_conclusion_needs_a_closed_node(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, tasks=[])
            change = {"op": "record_conclusion", "node_id": "kv.A", "text": "Eviction wins", "evidence": ["exp-1"]}
            self.assertEqual(_codes(apply_lab_update(root, _packet(change))), ["conclusion_node_open"])

            closed = apply_lab_update(
                root,
                _packet({"op": "update_node", "node_id": "kv.A", "fields": {"state": "supported"}}, change),
            )
            self.assertEqual(closed["status"], "applied", closed)

    def test_a_conclusion_needs_experiments_attached_to_its_node(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, tasks=[])
            bare = {"op": "record_conclusion", "node_id": "kv.B", "text": "Branch holds", "evidence": []}
            self.assertEqual(_codes(apply_lab_update(root, _packet(bare))), ["missing_conclusion_evidence"])
            foreign = {**bare, "evidence": ["exp-1"]}
            self.assertEqual(_codes(apply_lab_update(root, _packet(foreign))), ["conclusion_evidence_unattached"])

    def test_a_conclusion_must_be_one_line(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, tasks=[])
            change = {
                "op": "record_conclusion", "node_id": "kv.A", "text": "two\nlines", "evidence": ["exp-1"],
            }
            result = apply_lab_update(
                root, _packet({"op": "update_node", "node_id": "kv.A", "fields": {"state": "supported"}}, change)
            )
            self.assertEqual(_codes(result), ["invalid_conclusion_text"])

    def test_a_recorded_conclusion_is_projected_and_replaced_by_the_next_one(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, tasks=[])
            close = {"op": "update_node", "node_id": "kv.A", "fields": {"state": "supported"}}
            first = {
                "op": "record_conclusion", "node_id": "kv.A", "text": "Eviction wins", "evidence": ["exp-1"],
                "date": "2026-09-20",
            }
            self.assertEqual(apply_lab_update(root, _packet(close, first))["status"], "applied")
            second = {**first, "text": "Eviction wins at B>=8", "date": "2026-09-21"}
            self.assertEqual(apply_lab_update(root, _packet(second))["status"], "applied")

            text = (root / THREAD).read_text(encoding="utf-8")
            self.assertEqual(text.count("#### Conclusion"), 1)
            self.assertIn("Eviction wins at B>=8\n\n- concluded: 2026-09-21\n- evidence: `exp-1`", text)
            detail = materialize_lab_graph(root).graph["node_details"]["kv.A"]
            self.assertEqual(
                detail["conclusion"],
                {"text": "Eviction wins at B>=8", "date": "2026-09-21", "evidence": ["exp-1"]},
            )


if __name__ == "__main__":
    unittest.main()
