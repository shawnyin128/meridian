from __future__ import annotations

import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from meridian.cli import main
from meridian.workspace_protocol import (
    AGENT_IDEA_FILES_PATH,
    AGENT_IDEAS_PATH,
    CHANGES_PATH,
    EVENTS_PATH,
    WorkspaceProtocolError,
    _validate_agent_ideas,
    _validate_changes,
    add_workspace_agent_idea,
    add_workspace_agent_idea_file,
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

    def test_add_event_writes_kind_detail_and_at(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            evidence = root / ".meridian/experiments/latency-probe.md"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text("# Latency probe\n", encoding="utf-8")

            result = add_workspace_event(
                root,
                event_id="latency-probe-result",
                event_date="2026-09-15",
                text="Latency probe passed on A100",
                source=".meridian/experiments/latency-probe.md",
                kind="result",
                detail="p99 dropped from 80ms to 62ms",
            )

            self.assertEqual(result["event"]["kind"], "result")
            self.assertEqual(result["event"]["detail"], "p99 dropped from 80ms to 62ms")
            at = datetime.fromisoformat(result["event"]["at"])
            self.assertIsNotNone(at.tzinfo)

    def test_add_event_rejects_bad_kind_empty_detail_and_overlong_text(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            evidence = root / ".meridian/experiments/latency-probe.md"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text("# Latency probe\n", encoding="utf-8")

            with self.assertRaisesRegex(WorkspaceProtocolError, "kind is unknown"):
                add_workspace_event(
                    root, event_id="bad-kind", text="Bad kind", source=".meridian/experiments/latency-probe.md",
                    kind="unknown",
                )
            with self.assertRaisesRegex(WorkspaceProtocolError, "non-empty string"):
                add_workspace_event(
                    root, event_id="bad-detail", text="Bad detail", source=".meridian/experiments/latency-probe.md",
                    detail=" ",
                )
            with self.assertRaisesRegex(WorkspaceProtocolError, "at most 120 characters"):
                add_workspace_event(
                    root, event_id="bad-length", text="x" * 121, source=".meridian/experiments/latency-probe.md",
                )

    def test_validate_events_accepts_legacy_overlong_text_but_checks_new_fields(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            evidence = root / ".meridian/experiments/latency-probe.md"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text("# Latency probe\n", encoding="utf-8")
            self._write_json(
                root / EVENTS_PATH,
                {
                    "schema_version": "meridian.workspace-events.v1",
                    "events": [
                        {
                            "id": "legacy",
                            "date": "2026-09-01",
                            "text": "x" * 200,
                            "source": ".meridian/experiments/latency-probe.md",
                        }
                    ],
                },
            )

            status = inspect_project_workspace(root)

            self.assertEqual(status["surfaces"]["events"]["status"], "ok")

            self._write_json(
                root / EVENTS_PATH,
                {
                    "schema_version": "meridian.workspace-events.v1",
                    "events": [
                        {
                            "id": "bad-at",
                            "date": "2026-09-01",
                            "text": "Missing offset",
                            "source": ".meridian/experiments/latency-probe.md",
                            "at": "2026-09-01T00:00:00",
                        }
                    ],
                },
            )

            invalid = inspect_project_workspace(root)
            self.assertEqual(invalid["surfaces"]["events"]["status"], "invalid")
            self.assertIn("ISO 8601 datetime with offset", invalid["surfaces"]["events"]["issue"])

    def test_add_event_is_idempotent_despite_a_fresh_at_each_call(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            evidence = root / ".meridian/experiments/latency-probe.md"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text("# Latency probe\n", encoding="utf-8")

            first = add_workspace_event(
                root, event_id="repeat", text="Repeat", source=".meridian/experiments/latency-probe.md", kind="note",
            )
            second = add_workspace_event(
                root, event_id="repeat", text="Repeat", source=".meridian/experiments/latency-probe.md", kind="note",
            )

            self.assertEqual(first["status"], "created")
            self.assertEqual(second["status"], "unchanged")
            self.assertEqual(first["event"]["at"], second["event"]["at"])

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

    def test_add_event_succeeds_after_a_stored_event_source_was_deleted(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            for name in ("first.md", "second.md"):
                (root / "results").mkdir(exist_ok=True)
                (root / "results" / name).write_text("# Evidence\n", encoding="utf-8")
            add_workspace_event(root, event_id="first", text="First", source="results/first.md")
            stored_first = json.loads((root / EVENTS_PATH).read_text(encoding="utf-8"))["events"][0]
            (root / "results/first.md").unlink()

            result = add_workspace_event(root, event_id="second", text="Second", source="results/second.md")

            self.assertEqual(result["status"], "created")
            stored = json.loads((root / EVENTS_PATH).read_text(encoding="utf-8"))["events"]
            self.assertEqual(stored, [stored_first, result["event"]])

    def test_add_event_keeps_stored_events_this_version_cannot_read_as_written(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            (root / "results").mkdir()
            (root / "results/probe.md").write_text("# Probe\n", encoding="utf-8")
            stored = [
                {"id": "known", "date": "2026-09-01", "text": "Known", "source": "results/probe.md", "kind": "note"},
                {
                    "id": "future",
                    "date": "2026-09-02",
                    "text": "Written by a newer version",
                    "source": "results/probe.md",
                    "kind": "milestone",
                    "future_field": {"nested": [1, 2.5, None]},
                },
                {"id": "partial", "date": "2026-09-03", "text": "No source"},
                "not an event object",
            ]
            self._write_json(root / EVENTS_PATH, {"schema_version": "meridian.workspace-events.v1", "events": stored})

            result = add_workspace_event(root, event_id="new", text="New", source="results/probe.md")

            self.assertEqual(result["status"], "created")
            payload = json.loads((root / EVENTS_PATH).read_text(encoding="utf-8"))
            self.assertEqual(payload["events"], [*stored, result["event"]])
            with self.assertRaisesRegex(WorkspaceProtocolError, "different content: future"):
                add_workspace_event(root, event_id="future", text="Reused id", source="results/probe.md")

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

    def test_change_journal_reads_an_idea_the_user_wrote_down_without_a_chat(self) -> None:
        def journal(chat_title: str) -> dict[str, object]:
            return {
                "schema_version": "meridian.workspace-changes.v1",
                "project_id": "project-1",
                "epoch": "feed-a",
                "next_sequence": 1,
                "ideas": [
                    {
                        "id": "idea-9",
                        "title": "Own idea",
                        "body": "Written down by hand.",
                        "archived": False,
                        "created": "2026-10-21",
                        "updated": "2026-10-21",
                        "source": {"chat_title": chat_title},
                    }
                ],
                "changes": [],
            }

        # The App writes MANUAL_SOURCE as the chat title of an idea that came from no chat.
        read = _validate_changes(journal("手动添加"))
        self.assertEqual(read["ideas"][0]["source"], {"chat_title": "手动添加"})
        with self.assertRaisesRegex(WorkspaceProtocolError, "chat_title must be a non-empty string"):
            _validate_changes(journal(""))

    def _add_idea(self, root: Path, **overrides: str) -> dict[str, object]:
        arguments = {
            "idea_id": "reuse-distance",
            "title": "Evict prefix cache by reuse distance",
            "body": "Score shared prefixes by reuse distance instead of recency.",
            "context": "Prefix cache eviction",
            "idea_date": "2026-10-21",
            **overrides,
        }
        return add_workspace_agent_idea(root, **arguments)

    def test_agent_idea_title_must_be_one_line_of_at_most_80_characters(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)

            for title in ("t" * 81, "Evict by reuse distance\nthen tune the window", "Evict by\u2028reuse distance", "  "):
                with (
                    self.subTest(title=title),
                    self.assertRaisesRegex(WorkspaceProtocolError, "idea title must be one line of 1-80 characters"),
                ):
                    self._add_idea(root, title=title)
            self.assertFalse((root / AGENT_IDEAS_PATH).exists())

    def test_agent_idea_context_names_the_work_in_one_short_line_without_dates_or_times(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)

            cases = {
                "c" * 61: "idea context must be one line of at most 60 characters",
                "Prefix cache\neviction": "idea context must be one line of at most 60 characters",
                "2026-10-21 prefix cache discussion": "idea context must not hold a date or time",
                "Prefix cache, discussed 2026/10/21": "idea context must not hold a date or time",
                "Prefix cache eviction, 10-21": "idea context must not hold a date or time",
                "创建于2026-10-21的讨论": "idea context must not hold a date or time",
                "创建于 10月21日，更新于 10月22日": "idea context must not hold a date or time",
                "Eviction discussion at 14:30": "idea context must not hold a date or time",
            }
            for context, reason in cases.items():
                with self.subTest(context=context), self.assertRaisesRegex(WorkspaceProtocolError, reason):
                    self._add_idea(root, context=context)
            self.assertFalse((root / AGENT_IDEAS_PATH).exists())

    def test_agent_idea_context_may_hold_numbers_that_are_not_dates_or_times(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            contexts = [
                "KV compression at a 1:10 ratio",
                "16:9 画幅的草稿",
                "Batch 1024-4096 sweep",
                "25:61 split of the eval set",
                "13-14 层剪枝",
                "B=16 宽度扫描",
            ]

            for index, context in enumerate(contexts):
                with self.subTest(context=context):
                    self.assertEqual(self._add_idea(root, idea_id=f"idea-{index}", context=context)["status"], "created")
            stored = json.loads((root / AGENT_IDEAS_PATH).read_text(encoding="utf-8"))["ideas"]
            self.assertEqual([idea["context"] for idea in stored], contexts)

    def test_agent_idea_stores_exactly_the_accepted_fields(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)

            result = self._add_idea(root, title="t" * 80, context="c" * 60, node="kv.A")

            self.assertEqual(result["status"], "created")
            self.assertEqual(
                json.loads((root / AGENT_IDEAS_PATH).read_text(encoding="utf-8")),
                {
                    "schema_version": "meridian.workspace-agent-ideas.v1",
                    "ideas": [
                        {
                            "id": "reuse-distance",
                            "date": "2026-10-21",
                            "title": "t" * 80,
                            "body": "Score shared prefixes by reuse distance instead of recency.",
                            "context": "c" * 60,
                            "node": "kv.A",
                        }
                    ],
                },
            )

    def test_agent_idea_text_that_looks_like_lab_structure_round_trips_unchanged(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            title = "### Node X: - evidence: reuse distance"
            body = "Score by reuse distance.\n### Node X: injected\n- evidence: exp-1\n- mode: `dead`\n\n## Graph Relations"
            context = "- evidence: ### prefix cache"

            created = self._add_idea(root, title=title, body=body, context=context)
            repeated = self._add_idea(root, title=title, body=body, context=context)

            self.assertEqual((created["status"], repeated["status"]), ("created", "unchanged"))
            stored = _validate_agent_ideas(json.loads((root / AGENT_IDEAS_PATH).read_text(encoding="utf-8")))
            self.assertEqual(
                [(idea["title"], idea["body"], idea["context"]) for idea in stored["ideas"]],
                [(title, body, context)],
            )

    def test_agent_idea_add_keeps_older_ideas_that_break_the_new_limits(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            older = {
                "id": "older",
                "date": "2026-09-01",
                "title": "An older idea whose title runs on " + "x" * 120,
                "body": "Written by an older plugin.",
                "context": "Claude Code session, created 2026-09-01 09:30\nupdated 2026-09-02",
            }
            self._write_json(
                root / AGENT_IDEAS_PATH,
                {"schema_version": "meridian.workspace-agent-ideas.v1", "ideas": [older]},
            )

            self._add_idea(root)

            stored = json.loads((root / AGENT_IDEAS_PATH).read_text(encoding="utf-8"))["ideas"]
            self.assertEqual([idea["id"] for idea in stored], ["older", "reuse-distance"])
            self.assertEqual(stored[0], older)

    def test_cli_idea_add_rejects_a_context_holding_a_time_with_its_reason(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            stderr = StringIO()

            with redirect_stderr(stderr):
                code = main(
                    [
                        "workspace", "idea-add", "--root", str(root), "--id", "reuse-distance",
                        "--title", "Evict prefix cache by reuse distance", "--body", "Score by reuse distance.",
                        "--context", "Eviction discussion at 14:30",
                    ]
                )

            self.assertEqual(code, 1)
            self.assertIn("idea context must not hold a date or time", stderr.getvalue())
            self.assertFalse((root / AGENT_IDEAS_PATH).exists())

    def test_agent_idea_file_add_records_a_file_inside_the_workspace_once(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            (root / "docs").mkdir()
            (root / "docs/proposal.md").write_text("# Proposal\n", encoding="utf-8")

            created = add_workspace_agent_idea_file(
                root, file_id="proposal", idea_id="reuse-distance", path="./docs/../docs/proposal.md", file_date="2026-10-21",
            )
            repeated = add_workspace_agent_idea_file(
                root, file_id="proposal", idea_id="reuse-distance", path="docs/proposal.md", file_date="2026-10-21",
            )
            with self.assertRaisesRegex(WorkspaceProtocolError, "already exists with different content"):
                add_workspace_agent_idea_file(
                    root, file_id="proposal", idea_id="idea-7", path="docs/proposal.md", file_date="2026-10-21",
                )

            entry = {"id": "proposal", "idea_id": "reuse-distance", "path": "docs/proposal.md", "date": "2026-10-21"}
            self.assertEqual((created["status"], repeated["status"]), ("created", "unchanged"))
            self.assertEqual(created["file"], entry)
            self.assertEqual(
                json.loads((root / AGENT_IDEA_FILES_PATH).read_text(encoding="utf-8")),
                {"schema_version": "meridian.workspace-agent-idea-files.v1", "files": [entry]},
            )

    def test_agent_idea_file_add_rejects_a_missing_outside_or_protocol_file_and_a_bad_id(self) -> None:
        with TemporaryDirectory() as tmp, TemporaryDirectory() as outside_tmp:
            root = Path(tmp)
            self._workspace(root)
            outside = Path(outside_tmp) / "outside.md"
            outside.write_text("outside\n", encoding="utf-8")
            (root / "proposal.md").write_text("proposal\n", encoding="utf-8")

            for path, reason in [
                ("missing.md", "existing file"),
                (str(outside), "relative to the workspace root"),
                ("../" + outside.name, "existing file"),
                (".meridian/workspace.json", "not a protocol projection"),
                (".", "existing file"),
            ]:
                with self.assertRaisesRegex(WorkspaceProtocolError, reason):
                    add_workspace_agent_idea_file(root, file_id="f", idea_id="i", path=path)
            for file_id, idea_id in [("", "i"), ("f", " "), ("f/1", "i")]:
                with self.assertRaisesRegex(WorkspaceProtocolError, "URL-safe"):
                    add_workspace_agent_idea_file(root, file_id=file_id, idea_id=idea_id, path="proposal.md")
            self.assertFalse((root / AGENT_IDEA_FILES_PATH).exists())

    def test_agent_idea_file_add_keeps_stored_files_it_cannot_read(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            (root / "proposal.md").write_text("proposal\n", encoding="utf-8")
            malformed = {"id": "bad", "path": ["not", "a", "path"], "extra": True}
            self._write_json(
                root / AGENT_IDEA_FILES_PATH,
                {"schema_version": "meridian.workspace-agent-idea-files.v1", "files": [malformed], "later": 1},
            )

            add_workspace_agent_idea_file(root, file_id="new", idea_id="i", path="proposal.md", file_date="2026-10-21")

            stored = json.loads((root / AGENT_IDEA_FILES_PATH).read_text(encoding="utf-8"))
            self.assertEqual(stored["later"], 1)
            self.assertEqual([item["id"] for item in stored["files"]], ["bad", "new"])
            self.assertEqual(stored["files"][0], malformed)

    def test_cli_idea_file_add_writes_the_file_and_prints_the_result(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            (root / "proposal.md").write_text("proposal\n", encoding="utf-8")
            stdout = StringIO()

            with redirect_stdout(stdout):
                code = main(
                    [
                        "workspace", "idea-file-add", "--root", str(root), "--id", "proposal",
                        "--idea", "reuse-distance", "--path", "proposal.md", "--date", "2026-10-21",
                    ]
                )

            self.assertEqual(code, 0)
            self.assertEqual(json.loads(stdout.getvalue())["status"], "created")
            self.assertEqual(
                json.loads((root / AGENT_IDEA_FILES_PATH).read_text(encoding="utf-8"))["files"],
                [{"id": "proposal", "idea_id": "reuse-distance", "path": "proposal.md", "date": "2026-10-21"}],
            )

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
                        "--kind",
                        "result",
                        "--detail",
                        "3 of 3 checks pass",
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
            stored = json.loads((root / ".meridian/events/events.json").read_text(encoding="utf-8"))["events"][-1]
            self.assertEqual((stored["kind"], stored["detail"]), ("result", "3 of 3 checks pass"))

    def test_manifest_error_names_a_missing_required_surface(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_json(
                root / ".meridian/workspace.json",
                {
                    "schema_version": "meridian.workspace.v1",
                    "project": {"id": "project-1", "name": "Shared research"},
                    "surfaces": {
                        # "plan" is missing (required); Core cannot interpret the manifest without it.
                        "graph": {"path": ".meridian/graph/graph.json", "writer": "workspace"},
                        "events": {"path": ".meridian/events/events.json", "writer": "workspace"},
                    },
                },
            )

            with self.assertRaises(WorkspaceProtocolError) as raised:
                read_project_plan(root)

            message = str(raised.exception)
            self.assertIn("missing required entries ['plan']", message)
            self.assertIn("update Meridian", message)

    def test_forward_compatible_with_a_newer_format_sample(self) -> None:
        """A newer Meridian may add fields or a surface this version does not know about yet.

        Version-compatibility rule (AGENTS.md): unknown additive fields and unrecognized extra
        surfaces are ignored, not rejected. Only a missing required field is an error.
        """
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence = root / ".meridian/experiments/e1.md"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text("# Experiment\n", encoding="utf-8")
            self._write_json(
                root / ".meridian/workspace.json",
                {
                    "schema_version": "meridian.workspace.v1",
                    "future_top_level_field": "ignored",
                    "project": {"id": "project-1", "name": "Shared research", "future_project_field": "ignored"},
                    "surfaces": {
                        "plan": {"path": ".meridian/control/plan.json", "writer": "meridian-app", "future_surface_field": "ignored"},
                        "graph": {"path": ".meridian/graph/graph.json", "writer": "workspace"},
                        "events": {"path": ".meridian/events/events.json", "writer": "workspace"},
                        "changes": {"path": ".meridian/control/changes.json", "writer": "meridian-app"},
                        "future_surface": {"path": ".meridian/future/x.json", "writer": "meridian-app"},
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
                    "tasks": [{"id": "task-1", "title": "Run probe", "note": "Check baseline first"}],
                    "milestones": [],
                },
            )
            self._write_json(
                root / ".meridian/events/events.json",
                {
                    "schema_version": "meridian.workspace-events.v1",
                    "events": [
                        {
                            "id": "e1",
                            "date": "2026-09-16",
                            "text": "Probe ran",
                            "source": ".meridian/experiments/e1.md",
                            "future_event_field": "ignored",
                        }
                    ],
                },
            )
            self._write_json(
                root / ".meridian/control/changes.json",
                {
                    "schema_version": "meridian.workspace-changes.v1",
                    "project_id": "project-1",
                    "epoch": "epoch-1",
                    "next_sequence": 2,
                    "future_changes_field": "ignored",
                    "ideas": [
                        {
                            "id": "idea-1",
                            "title": "Try X",
                            "body": "Body",
                            "archived": False,
                            "created": "2026-09-16",
                            "updated": "2026-09-16",
                            "source": {"chat_title": "chat", "future_source_field": "ignored"},
                            "future_idea_field": "ignored",
                        }
                    ],
                    "changes": [
                        {
                            "sequence": 1,
                            "at": "2026-09-16T00:00:00Z",
                            "kind": "idea.linked",
                            "summary": "linked",
                            "refs": [{"kind": "idea", "id": "idea-1", "future_ref_field": "ignored"}],
                            "future_change_field": "ignored",
                        }
                    ],
                },
            )

            status = inspect_project_workspace(root)
            self.assertEqual(status["status"], "ready")
            plan = read_project_plan(root)
            self.assertEqual(plan["revision"], "abc123")
            # A per-task field, such as a task's note, is not validated at all -- it is opaque data
            # this reader passes straight through to whichever MCP tool call returns the plan.
            self.assertEqual(plan["tasks"][0]["note"], "Check baseline first")
            changes = read_workspace_changes(root)
            self.assertEqual(changes["status"], "ready")
            self.assertEqual(len(changes["changes"]), 1)
            idea = read_workspace_idea(root, "idea-1")
            self.assertEqual(idea["idea"]["id"], "idea-1")


if __name__ == "__main__":
    unittest.main()
