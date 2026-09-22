"""Tests for the `python -m meridian lab focus --hook` Claude Code hook integration."""

from __future__ import annotations

import json
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from meridian.cli import main
from meridian.lab import focus_hook as focus_hook_module
from meridian.lab.focus_hook import (
    find_lab_or_workspace_root,
    parse_hook_payload,
    render_lab_focus_report,
    run_lab_focus_hook,
)


def _write_lab(root: Path, *, active_nodes: str) -> None:
    lab = root / ".meridian"
    (lab / "threads").mkdir(parents=True)
    (lab / "experiments").mkdir()
    (lab / "proposals").mkdir()
    (lab / "state.md").write_text(
        f"---\ntype: lab-state\nactive_thread: kv-compression\nactive_nodes: {active_nodes}\n---\n# State\n",
        encoding="utf-8",
    )
    (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
    (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
    (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
    (lab / "threads/kv-compression.md").write_text(
        "---\ntype: research-thread\ntitle: KV Compression\n---\n"
        "# Research Thread: KV Compression\n\n"
        "## Approach Tree\n\n"
        "### Node A: Idea seed\n\n"
        "- mode: `unresolved`\n",
        encoding="utf-8",
    )


class LabFocusHookTests(unittest.TestCase):
    def test_find_root_returns_none_outside_any_workspace(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "nested" / "deep").mkdir(parents=True)

            self.assertIsNone(find_lab_or_workspace_root(root / "nested" / "deep"))

    def test_find_root_walks_up_to_the_nearest_meridian_directory(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(root, active_nodes="[]")
            nested = root / "src" / "pkg"
            nested.mkdir(parents=True)

            self.assertEqual(find_lab_or_workspace_root(nested), root.resolve())

    def test_run_hook_returns_empty_string_outside_a_workspace(self) -> None:
        with TemporaryDirectory() as tmp:
            self.assertEqual(run_lab_focus_hook({"cwd": tmp}), "")

    def test_run_hook_returns_empty_string_without_a_cwd(self) -> None:
        # Pin the short-circuit itself: with no cwd, the hook must not even
        # attempt the directory walk (which could otherwise find an unrelated
        # ancestor .meridian/ on the real filesystem and mask this guard).
        with patch.object(focus_hook_module, "find_lab_or_workspace_root") as walk:
            self.assertEqual(run_lab_focus_hook({}), "")
            walk.assert_not_called()

    def test_render_report_lists_active_nodes_and_caps_at_six_lines(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(root, active_nodes="[kv-compression.A]")

            report = render_lab_focus_report(root, hook_event_name="UserPromptSubmit")

            lines = report.splitlines()
            self.assertLessEqual(len(lines), 6)
            self.assertIn("kv-compression.A", report)
            self.assertIn("unresolved", report)
            self.assertIn("Idea seed", report)
            self.assertIn("Focus:", report)

    def test_render_report_truncates_many_active_nodes_to_stay_within_budget(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            node_ids = [f"kv-compression.N{i}" for i in range(8)]
            (lab / "state.md").write_text(
                "---\ntype: lab-state\nactive_thread: kv-compression\n"
                f"active_nodes: [{', '.join(node_ids)}]\n---\n# State\n",
                encoding="utf-8",
            )
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            nodes_markdown = "\n\n".join(f"### Node N{i}: Probe {i}\n\n- mode: `unresolved`" for i in range(8))
            (lab / "threads/kv-compression.md").write_text(
                f"---\ntype: research-thread\ntitle: KV Compression\n---\n"
                f"# Research Thread: KV Compression\n\n## Approach Tree\n\n{nodes_markdown}\n",
                encoding="utf-8",
            )

            report = render_lab_focus_report(root, hook_event_name="UserPromptSubmit")

            self.assertLessEqual(len(report.splitlines()), 6)
            self.assertIn("more", report)

    def test_render_report_names_the_lab_skill_only_on_session_start(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(root, active_nodes="[]")

            session_start = render_lab_focus_report(root, hook_event_name="SessionStart")
            prompt_submit = render_lab_focus_report(root, hook_event_name="UserPromptSubmit")

            self.assertIn("skill", session_start.lower())
            self.assertNotIn("skill", prompt_submit.lower())

    def test_parse_hook_payload_tolerates_blank_and_malformed_input(self) -> None:
        self.assertEqual(parse_hook_payload(""), {})
        self.assertEqual(parse_hook_payload("   "), {})
        self.assertEqual(parse_hook_payload("{not json"), {})
        self.assertEqual(parse_hook_payload("[1, 2]"), {})
        self.assertEqual(parse_hook_payload('{"cwd": "/tmp"}'), {"cwd": "/tmp"})

    def test_cli_hook_prints_nothing_outside_a_workspace(self) -> None:
        with TemporaryDirectory() as tmp:
            payload = json.dumps({"cwd": tmp, "hook_event_name": "SessionStart"})
            out = StringIO()
            with patch("sys.stdin", StringIO(payload)), redirect_stdout(out):
                exit_code = main(["lab", "focus", "--hook"])

            self.assertEqual(exit_code, 0)
            self.assertEqual(out.getvalue(), "")

    def test_cli_hook_prints_active_nodes_inside_a_workspace(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(root, active_nodes="[kv-compression.A]")
            payload = json.dumps({"cwd": str(root), "hook_event_name": "SessionStart"})
            out = StringIO()
            with patch("sys.stdin", StringIO(payload)), redirect_stdout(out):
                exit_code = main(["lab", "focus", "--hook"])

            self.assertEqual(exit_code, 0)
            self.assertIn("kv-compression.A", out.getvalue())

    def test_cli_focus_without_hook_flag_prints_nothing(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_lab(root, active_nodes="[kv-compression.A]")
            out = StringIO()
            with redirect_stdout(out):
                exit_code = main(["lab", "focus"])

            self.assertEqual(exit_code, 0)
            self.assertEqual(out.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
