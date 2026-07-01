from __future__ import annotations

import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from meridian.evals.codex_lab_graph import run_codex_lab_graph_eval


class CodexLabGraphEvalTests(unittest.TestCase):
    def test_graph_eval_scores_fake_outputs_and_writes_artifacts(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            cases = root / "cases.jsonl"
            cases.write_text(
                '{"id":"case1","prompt":"Record experiment","expect_graph_update":true,'
                '"expect_supporting_artifacts":true}\n',
                encoding="utf-8",
            )
            out_dir = root / "out"

            def fake_runner(
                command: list[str],
                cwd: Path,
                timeout: float,
                stdin: str | None,
            ) -> subprocess.CompletedProcess[str]:
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout=(
                        '{"graph_update_packet":true,"supporting_artifacts":true,'
                        '"mutated_generated_graph":false,"confirmation_requested":false}\n'
                    ),
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
            self.assertTrue((out_dir / "report.md").exists())

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

            def fake_runner(
                command: list[str],
                cwd: Path,
                timeout: float,
                stdin: str | None,
            ) -> subprocess.CompletedProcess[str]:
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout=(
                        '{"graph_update_packet":true,"supporting_artifacts":true,'
                        '"mutated_generated_graph":true,"confirmation_requested":false}\n'
                    ),
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


if __name__ == "__main__":
    unittest.main()
