from __future__ import annotations

import json
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from meridian import __version__
from meridian.cli import main
from meridian.workspace_protocol import (
    CHANGES_PATH,
    EVENTS_PATH,
    WorkspaceProtocolError,
    add_workspace_event,
    inspect_project_workspace,
    read_project_plan,
    read_workspace_changes,
    read_workspace_idea,
)


class WorkspaceProtocolTest(unittest.TestCase):
    def _workspace(self, root: Path) -> None:
        self._write_json(
            root / ".meridian/workspace.json",
            {
                "schema_version": "meridian.workspace.v1",
                "project": {"id": "project-1", "name": "Shared research"},
                "surfaces": {
                    "plan": {"path": ".meridian/control/plan.json", "writer": "meridian-app"},
                    "graph": {"path": ".meridian/graph/graph.json", "writer": "workspace"},
                    "events": {"path": ".meridian/events/events.json", "writer": "workspace"},
                },
            },
        )
        self._write_json(
            root / ".meridian/control/plan.json",
            {
                "schema_version": "meridian.project-plan.v1",
                "revision": "abc123",
                "updated_at": "2026-09-15T18:00:00Z",
                "project": {"id": "project-1", "name": "Shared research"},
                "tasks": [{"id": "task-1", "title": "Run probe"}],
                "milestones": [{"id": "milestone-1", "title": "Choose direction"}],
            },
        )

    def _write_json(self, path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value) + "\n", encoding="utf-8")

    def test_status_and_plan_read_do_not_create_repository_owned_views(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)

            status = inspect_project_workspace(root)
            plan = read_project_plan(root / ".meridian")

            self.assertEqual(status["status"], "ready")
            self.assertEqual(status["surfaces"]["plan"]["revision"], "abc123")
            self.assertEqual(status["surfaces"]["graph"]["status"], "missing")
            self.assertEqual(status["surfaces"]["events"]["status"], "missing")
            self.assertEqual(plan["tasks"][0]["title"], "Run probe")
            self.assertFalse((root / EVENTS_PATH).exists())

    def test_add_event_is_source_backed_atomic_and_idempotent(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            evidence = root / ".meridian/experiments/latency-probe.md"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text("# Latency probe\n", encoding="utf-8")

            first = add_workspace_event(
                root,
                event_id="latency-probe-complete",
                event_date="2026-09-15",
                text="Latency probe passed on A100",
                node="spec-decoding.B",
                source=".meridian/experiments/latency-probe.md",
            )
            second = add_workspace_event(
                root,
                event_id="latency-probe-complete",
                event_date="2026-09-15",
                text="Latency probe passed on A100",
                node="spec-decoding.B",
                source=".meridian/experiments/latency-probe.md",
            )
            payload = json.loads((root / EVENTS_PATH).read_text(encoding="utf-8"))

            self.assertEqual(first["status"], "created")
            self.assertEqual(second["status"], "unchanged")
            self.assertEqual(len(payload["events"]), 1)
            self.assertEqual(payload["events"][0]["source"], ".meridian/experiments/latency-probe.md")
            self.assertFalse(list((root / EVENTS_PATH.parent).glob("*.tmp")))

    def test_event_rejects_conflicting_id_and_non_evidence_source(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            evidence = root / "results/probe.json"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text("{}\n", encoding="utf-8")
            add_workspace_event(
                root,
                event_id="probe",
                event_date="2026-09-15",
                text="Probe completed",
                source="results/probe.json",
            )

            with self.assertRaisesRegex(WorkspaceProtocolError, "different content"):
                add_workspace_event(
                    root,
                    event_id="probe",
                    event_date="2026-09-15",
                    text="Different result",
                    source="results/probe.json",
                )
            with self.assertRaisesRegex(WorkspaceProtocolError, "durable evidence"):
                add_workspace_event(
                    root,
                    event_id="bad-source",
                    event_date="2026-09-15",
                    text="Used the plan as evidence",
                    source=".meridian/control/plan.json",
                )

    def test_event_rejects_missing_or_escaping_source(self) -> None:
        with TemporaryDirectory() as tmp, TemporaryDirectory() as outside_tmp:
            root = Path(tmp)
            self._workspace(root)
            outside = Path(outside_tmp) / "outside.md"
            outside.write_text("outside\n", encoding="utf-8")

            with self.assertRaisesRegex(WorkspaceProtocolError, "existing file"):
                add_workspace_event(root, event_id="missing", text="Missing", source="missing.md")
            with self.assertRaisesRegex(WorkspaceProtocolError, "relative to the workspace root"):
                add_workspace_event(root, event_id="escape", text="Escape", source=str(outside))

    def test_status_reports_invalid_repository_owned_surface_without_hiding_plan(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            graph = root / ".meridian/graph/graph.json"
            graph.parent.mkdir(parents=True, exist_ok=True)
            graph.write_text('{"schema":"wrong"}\n', encoding="utf-8")

            status = inspect_project_workspace(root)

            self.assertEqual(status["status"], "degraded")
            self.assertEqual(status["surfaces"]["plan"]["status"], "ok")
            self.assertEqual(status["surfaces"]["graph"]["status"], "invalid")

    def test_change_cursor_is_incremental_and_ideas_expand_individually(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            manifest_path = root / ".meridian/workspace.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["surfaces"]["changes"] = {
                "path": CHANGES_PATH.as_posix(),
                "writer": "meridian-app",
            }
            self._write_json(manifest_path, manifest)
            self._write_json(
                root / CHANGES_PATH,
                {
                    "schema_version": "meridian.workspace-changes.v1",
                    "project_id": "project-1",
                    "epoch": "feed-a",
                    "next_sequence": 4,
                    "ideas": [
                        {
                            "id": "idea-1",
                            "title": "Dynamic threshold",
                            "body": "Calibrate by batch.",
                            "archived": False,
                            "created": "2026-09-16",
                            "updated": "2026-09-18",
                            "node": "direction.B",
                            "source": {"chat_title": "Threshold discussion"},
                        }
                    ],
                    "changes": [
                        {
                            "sequence": 1,
                            "at": "2026-09-16T00:00:00Z",
                            "kind": "project.snapshot",
                            "summary": "Project snapshot created",
                            "refs": [{"kind": "project", "id": "project-1"}],
                        },
                        {
                            "sequence": 2,
                            "at": "2026-09-17T00:00:00Z",
                            "kind": "idea.linked",
                            "summary": "Idea linked",
                            "refs": [
                                {"kind": "project", "id": "project-1"},
                                {"kind": "idea", "id": "idea-1"},
                            ],
                        },
                        {
                            "sequence": 3,
                            "at": "2026-09-18T00:00:00Z",
                            "kind": "idea.node_linked",
                            "summary": "Idea linked to node",
                            "refs": [
                                {"kind": "project", "id": "project-1"},
                                {"kind": "idea", "id": "idea-1"},
                                {"kind": "node", "id": "direction.B"},
                            ],
                        },
                    ],
                },
            )

            baseline = read_workspace_changes(root, limit=2)
            incremental = read_workspace_changes(root, cursor="feed-a:2")
            reset = read_workspace_changes(root, cursor="other:3")
            idea = read_workspace_idea(root, "idea-1")

            self.assertEqual([item["sequence"] for item in baseline["changes"]], [2, 3])
            self.assertEqual(baseline["next_cursor"], "feed-a:3")
            self.assertFalse(baseline["has_more"])
            self.assertTrue(baseline["baseline_truncated"])
            self.assertEqual([item["sequence"] for item in incremental["changes"]], [3])
            self.assertEqual(incremental["cursor_status"], "ok")
            self.assertFalse(incremental["baseline_truncated"])
            self.assertEqual(reset["cursor_status"], "reset_required")
            self.assertEqual(idea["idea"]["body"], "Calibrate by batch.")

    def test_change_reader_has_explicit_fallback_for_legacy_workspace(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)

            page = read_workspace_changes(root)

            self.assertEqual(page["status"], "unavailable")
            self.assertEqual(page["fallback"]["tool"], "meridian.workspace_plan")

    def test_cli_exposes_status_plan_and_event_write_as_json(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            evidence = root / "results/probe.json"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text("{}\n", encoding="utf-8")

            status_stdout = StringIO()
            with redirect_stdout(status_stdout):
                status_code = main(["workspace", "status", "--root", str(root)])
            plan_stdout = StringIO()
            with redirect_stdout(plan_stdout):
                plan_code = main(["workspace", "plan", "--root", str(root)])
            event_stdout = StringIO()
            with redirect_stdout(event_stdout):
                event_code = main(
                    [
                        "workspace",
                        "event-add",
                        "--root",
                        str(root),
                        "--id",
                        "probe-complete",
                        "--text",
                        "Probe completed",
                        "--source",
                        "results/probe.json",
                    ]
                )

            self.assertEqual(status_code, 0)
            self.assertEqual(plan_code, 0)
            self.assertEqual(event_code, 0)
            self.assertEqual(json.loads(status_stdout.getvalue())["status"], "ready")
            self.assertEqual(json.loads(plan_stdout.getvalue())["revision"], "abc123")
            self.assertEqual(json.loads(event_stdout.getvalue())["status"], "created")

    def test_manifest_error_names_unknown_and_missing_surfaces(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_json(
                root / ".meridian/workspace.json",
                {
                    "schema_version": "meridian.workspace.v1",
                    "project": {"id": "project-1", "name": "Shared research"},
                    "surfaces": {
                        # "plan" is missing (required); "totally_unknown" is not part of the contract.
                        "graph": {"path": ".meridian/graph/graph.json", "writer": "workspace"},
                        "events": {"path": ".meridian/events/events.json", "writer": "workspace"},
                        "totally_unknown": {"path": ".meridian/x.json", "writer": "workspace"},
                    },
                },
            )

            with self.assertRaises(WorkspaceProtocolError) as raised:
                read_project_plan(root)

            message = str(raised.exception)
            self.assertIn("unknown=['totally_unknown']", message)
            self.assertIn("missing=['plan']", message)
            self.assertIn(f"meridian {__version__}", message)
            self.assertIn("restart the agent session or update Meridian", message)


if __name__ == "__main__":
    unittest.main()
