from __future__ import annotations

import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from meridian.evals.codex_lab_graph import build_codex_lab_graph_prompt, run_codex_lab_graph_eval


class CodexLabGraphEvalTests(unittest.TestCase):
    def test_graph_eval_scores_last_message_outputs_and_writes_real_lab_fixture(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            cases = root / "cases.jsonl"
            cases.write_text(
                '{"id":"case1","prompt":"Record experiment","expect_graph_update":true,'
                '"expect_supporting_artifacts":true}\n',
                encoding="utf-8",
            )
            out_dir = root / "out"

            def fake_runner(command: list[str], cwd: Path, timeout: float, stdin: str | None) -> subprocess.CompletedProcess[str]:
                self.assertEqual(cwd, out_dir / "case1" / "repo")
                self.assertTrue((cwd / "AGENTS.md").exists())
                self.assertTrue((cwd / ".meridian" / "state.md").exists())
                self.assertTrue((cwd / ".meridian" / "threads" / "index.md").exists())
                self.assertTrue((cwd / ".meridian" / "threads" / "active-probe.md").exists())
                self.assertTrue((cwd / ".meridian" / "experiments" / "index.md").exists())
                self.assertTrue((cwd / ".meridian" / "proposals" / "index.md").exists())
                last_message_path = Path(command[command.index("--output-last-message") + 1])
                last_message_path.write_text(
                    json.dumps(
                        {
                            "graph_update_packet": True,
                            "supporting_artifacts": True,
                            "mutated_generated_graph": False,
                            "confirmation_requested": False,
                        }
                    ),
                    encoding="utf-8",
                )
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout='{"type":"event","message":"events stream is not the result contract"}\n',
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

            self.assertEqual(result.total_cases, 1)
            self.assertEqual(result.passed_cases, 1)
            self.assertEqual(result.failed_cases, 0)
            summary = json.loads((out_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["total_cases"], 1)
            self.assertEqual(summary["passed_cases"], 1)
            self.assertTrue((out_dir / "case1" / "result.json").exists())
            self.assertTrue((out_dir / "case1" / "prompt.md").exists())
            self.assertTrue((out_dir / "case1" / "repo" / ".meridian" / "threads" / "active-probe.md").exists())
            self.assertTrue((out_dir / "report.md").exists())
            case_result = json.loads((out_dir / "case1" / "result.json").read_text(encoding="utf-8"))
            self.assertEqual(case_result["repo_root"], str(out_dir / "case1" / "repo"))
            self.assertEqual(case_result["parse_source"], "last_message")

    def test_graph_eval_fails_when_generated_graph_is_mutated(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            cases = root / "cases.jsonl"
            cases.write_text(
                '{"id":"case1","prompt":"Record experiment","expect_graph_update":true,'
                '"expect_supporting_artifacts":true}\n',
                encoding="utf-8",
            )
            out_dir = root / "out"

            def fake_runner(command: list[str], cwd: Path, timeout: float, stdin: str | None) -> subprocess.CompletedProcess[str]:
                last_message_path = Path(command[command.index("--output-last-message") + 1])
                last_message_path.write_text(
                    json.dumps(
                        {
                            "graph_update_packet": True,
                            "supporting_artifacts": True,
                            "mutated_generated_graph": True,
                            "confirmation_requested": False,
                        }
                    ),
                    encoding="utf-8",
                )
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout="",
                    stderr="",
                )

            result = run_codex_lab_graph_eval(
                cases_path=cases,
                out_dir=out_dir,
                overwrite=False,
                runner=fake_runner,
            )

            self.assertEqual(result.total_cases, 1)
            self.assertEqual(result.passed_cases, 0)
            self.assertEqual(result.failed_cases, 1)
            case_result = json.loads((out_dir / "case1" / "result.json").read_text(encoding="utf-8"))
            self.assertEqual(case_result["verdict"]["decision"], "fail")
            self.assertIn("mutated_generated_graph must be false", case_result["verdict"]["failures"])

    def test_graph_eval_scores_no_update_and_confirmation_cases(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            cases = root / "cases.jsonl"
            cases.write_text(
                "\n".join(
                    [
                        '{"id":"no_update","prompt":"Fix README formatting only.",'
                        '"expect_graph_update":false,"expect_supporting_artifacts":false}',
                        '{"id":"confirmation","prompt":"Mark the current node repairable after failure.",'
                        '"expect_graph_update":true,"expect_supporting_artifacts":false,"expect_confirmation":true}',
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            out_dir = root / "out"

            def fake_runner(command: list[str], cwd: Path, timeout: float, stdin: str | None) -> subprocess.CompletedProcess[str]:
                case_id = cwd.parent.name
                payloads = {
                    "no_update": {
                        "graph_update_packet": False,
                        "supporting_artifacts": False,
                        "mutated_generated_graph": False,
                        "confirmation_requested": False,
                    },
                    "confirmation": {
                        "graph_update_packet": True,
                        "supporting_artifacts": False,
                        "mutated_generated_graph": False,
                        "confirmation_requested": True,
                    },
                }
                last_message_path = Path(command[command.index("--output-last-message") + 1])
                last_message_path.write_text(json.dumps(payloads[case_id]), encoding="utf-8")
                return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

            result = run_codex_lab_graph_eval(cases_path=cases, out_dir=out_dir, runner=fake_runner)

            self.assertEqual(result.total_cases, 2)
            self.assertEqual(result.passed_cases, 2)
            summary = json.loads((out_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual([item["decision"] for item in summary["case_results"]], ["pass", "pass"])

    def test_graph_eval_does_not_use_stdout_when_last_message_is_missing(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            cases = root / "cases.jsonl"
            cases.write_text(
                '{"id":"case1","prompt":"Record experiment","expect_graph_update":true}\n',
                encoding="utf-8",
            )
            out_dir = root / "out"

            def fake_runner(command: list[str], cwd: Path, timeout: float, stdin: str | None) -> subprocess.CompletedProcess[str]:
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout=(
                        '{"graph_update_packet":true,"supporting_artifacts":false,'
                        '"mutated_generated_graph":false,"confirmation_requested":false}\n'
                    ),
                    stderr="",
                )

            result = run_codex_lab_graph_eval(cases_path=cases, out_dir=out_dir, runner=fake_runner)

            self.assertEqual(result.passed_cases, 0)
            case_result = json.loads((out_dir / "case1" / "result.json").read_text(encoding="utf-8"))
            self.assertEqual(case_result["parse_source"], None)
            self.assertIn("last message file was not created", case_result["parse_error"])

    def test_graph_eval_refuses_unsafe_overwrite_without_marker(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            cases = root / "cases.jsonl"
            cases.write_text('{"id":"case1","prompt":"Record experiment"}\n', encoding="utf-8")
            out_dir = root / "out"
            out_dir.mkdir()
            (out_dir / "unrelated.txt").write_text("keep me\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "Refusing to overwrite"):
                run_codex_lab_graph_eval(cases_path=cases, out_dir=out_dir, overwrite=True)

            self.assertTrue((out_dir / "unrelated.txt").exists())

    def test_graph_eval_prompt_is_neutral_and_allows_repo_inspection(self) -> None:
        prompt = build_codex_lab_graph_prompt(
            {
                "id": "case1",
                "prompt": "Record experiment evidence under the active node.",
            }
        )

        self.assertIn("Inspect the current repository and Lab files", prompt)
        self.assertNotIn("Do not edit files, run commands, load skills", prompt)
        self.assertNotIn('"graph_update_packet": true', prompt)
        self.assertNotIn('"supporting_artifacts": true', prompt)

    def test_live_graph_cases_keep_boundary_confirmation_expectations_precise(self) -> None:
        cases = [
            json.loads(line)
            for line in Path("eval/cases/lab_graph_update_live.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        by_id = {case["id"]: case for case in cases}

        self.assertNotIn("expect_confirmation", by_id["new_idea_creates_research_point"])
        self.assertTrue(by_id["new_idea_creates_research_point"]["expect_graph_update"])
        self.assertNotIn("expect_graph_update", by_id["repairable_requires_confirmation"])
        self.assertTrue(by_id["repairable_requires_confirmation"]["expect_confirmation"])


if __name__ == "__main__":
    unittest.main()
