from __future__ import annotations

import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

from meridian.cli import main


class FakePixmap:
    def save(self, path: Path) -> None:
        Path(path).write_bytes(b"fake-png")


class FakePage:
    def __init__(self, text: str, images: int = 0, drawings: int = 0) -> None:
        self.text = text
        self.images = images
        self.drawings = drawings

    def get_text(self, mode: str) -> str:
        assert mode == "text"
        return self.text

    def get_pixmap(self, matrix=None, alpha=False):  # noqa: ANN001
        return FakePixmap()

    def get_images(self, full: bool = True):  # noqa: ARG002
        return [object()] * self.images

    def get_drawings(self):
        return [object()] * self.drawings


class FakeDocument:
    metadata = {"title": "Fake Research Paper", "author": "A. Researcher"}

    def __init__(self) -> None:
        self.pages = [
            FakePage("Abstract\nThis paper studies a useful method.", images=0, drawings=1),
            FakePage("1 Introduction\nThe problem is important.", images=1, drawings=0),
            FakePage("Experiments\nTable 1 reports benchmark results.", images=2, drawings=3),
        ]

    def __len__(self) -> int:
        return len(self.pages)

    def load_page(self, index: int) -> FakePage:
        return self.pages[index]


class CodeQuantLikeDocument:
    metadata = {"title": "CodeQuant: Unified Clustering and Quantization", "author": "A. Researcher"}

    def __init__(self) -> None:
        self.pages = [
            FakePage(
                "Abstract\nOutliers have emerged as background filler. "
                "In this work, we tackle MoE post-training quantization with CodeQuant.",
                images=0,
                drawings=1,
            ),
            FakePage(
                "Figure 1: Stage 1 applies learnable rotations to smooth activation outliers; "
                "Stage 2 permutes weights; Stage 3 fine-tunes centroids; Stage 4 deploys a LUT kernel. "
                "We first introduce Activation-oriented Outlier Smoothing (AOS), which suppresses activation outliers. "
                "We then propose Adaptive Weight Clustering with Centroid Finetuning (ACCF) and "
                "Permutation Invariant Outlier Grouping (POG). We develop a LUT kernel.",
                images=1,
                drawings=200,
            ),
            FakePage(
                "Methodology\nActivation-Oriented Outlier Smoothing (AOS) applies a rotation matrix R to activations X. "
                "Adaptive Weight Clustering and Centroid Finetuning (ACCF) optimizes centroids C and assignments A. "
                "Permutation-Invariant Outlier Grouping (POG) reorders columns for block-wise clustering. "
                "The LUT-based system implementation uses centroids and assignments for inference.",
                images=0,
                drawings=2,
            ),
            FakePage(
                "Experiments\nTable 10 shows POG helps block-wise clustering. Table 11 shows KL penalty reduces router change. "
                "On CPU, CodeQuant achieves up to 4.15x speedup.",
                images=0,
                drawings=20,
            ),
        ]

    def __len__(self) -> int:
        return len(self.pages)

    def load_page(self, index: int) -> FakePage:
        return self.pages[index]


class CliTests(unittest.TestCase):
    def setUp(self) -> None:
        fake_fitz = types.ModuleType("fitz")
        fake_fitz.Matrix = lambda *args, **kwargs: ("matrix", args, kwargs)
        fake_fitz.open = lambda path: FakeDocument()
        self.previous_fitz = sys.modules.get("fitz")
        sys.modules["fitz"] = fake_fitz

    def tearDown(self) -> None:
        if self.previous_fitz is None:
            sys.modules.pop("fitz", None)
        else:
            sys.modules["fitz"] = self.previous_fitz

    def test_wiki_ingest_writes_draft_only_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"

            exit_code = main(["wiki", "ingest", str(pdf), "--out", str(out)])

            self.assertEqual(exit_code, 0)
            self.assertTrue((out / "review.md").exists())
            self.assertTrue((out / "paper.md").exists())
            self.assertTrue((out / "claims.jsonl").exists())
            self.assertTrue((out / "methods.jsonl").exists())
            self.assertTrue((out / "evidence.jsonl").exists())
            self.assertTrue((out / "run.json").exists())
            self.assertTrue((out / "extraction/pages.jsonl").exists())
            self.assertTrue((out / "extraction/page-images/page-0001.png").exists())
            self.assertFalse((root / "wiki/index.md").exists())

            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertFalse(run["canonical_wiki_mutated"])
            self.assertEqual(run["write_policy"], "draft_only")
            self.assertEqual(run["draft_artifacts"]["paper_page"], str(out / "paper.md"))
            self.assertEqual(run["quality_gate"]["decision"], "warn")
            self.assertEqual(run["paper_model"]["strategy"], "heuristic_text_v1")
            self.assertEqual(run["paper_model"]["evidence_candidates"], 3)
            self.assertEqual(run["source_management"]["mode"], "managed")
            self.assertTrue((root / "wiki/raw/sources/sources.jsonl").exists())

            review = (out / "review.md").read_text(encoding="utf-8")
            self.assertTrue(review.startswith("---\n"))
            self.assertIn("type: \"ingest_review\"", review)
            self.assertIn("model_strategy: \"heuristic_text_v1\"", review)
            self.assertIn("## Paper Identity", review)
            self.assertIn("## Figures / Tables / Equations Notes", review)
            self.assertIn("## Publish Proposal", review)
            self.assertIn("p. 3", review)
            self.assertNotIn("Agent task:", review)

            paper = (out / "paper.md").read_text(encoding="utf-8")
            self.assertTrue(paper.startswith("---\n"))
            self.assertIn("type: \"paper\"", paper)
            self.assertIn("model_strategy: \"heuristic_text_v1\"", paper)
            self.assertIn("## Paper Positioning", paper)
            self.assertIn("## Mechanism", paper)
            self.assertNotIn("Agent task:", paper)

            claim_lines = (out / "claims.jsonl").read_text(encoding="utf-8").splitlines()
            method_lines = (out / "methods.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertNotIn("needs_agent_fill", "\n".join(claim_lines + method_lines))

            evidence_lines = (out / "evidence.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(evidence_lines), 3)
            first_evidence = json.loads(evidence_lines[0])
            self.assertEqual(first_evidence["id"], "evidence-p0001")
            self.assertEqual(first_evidence["extraction_strategy"], "heuristic_text_v1")

    def test_codequant_like_ingest_builds_deeper_method_page(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake_fitz = sys.modules["fitz"]
            fake_fitz.open = lambda path: CodeQuantLikeDocument()
            root = Path(tmp)
            pdf = root / "codequant.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/codequant"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)

            methods = [
                json.loads(line)
                for line in (out / "methods.jsonl").read_text(encoding="utf-8").splitlines()
            ]
            method_names = {record["short_name"]: record for record in methods}
            self.assertIn("AOS", method_names)
            self.assertIn("ACCF", method_names)
            self.assertIn("POG", method_names)
            self.assertIn("LUT", method_names)
            self.assertTrue(method_names["AOS"]["inputs"])
            self.assertTrue(method_names["ACCF"]["outputs"])
            self.assertTrue(method_names["POG"]["assumptions"])

            paper = (out / "paper.md").read_text(encoding="utf-8")
            self.assertIn("This is a MoE post-training quantization paper", paper)
            self.assertIn("## What To Remember", paper)
            self.assertIn("## Implementation Notes", paper)
            self.assertIn("Router KL evidence should be tracked separately", paper)
            self.assertNotIn("Outliers have emerged as background filler", paper)

    def test_wiki_ingest_can_publish_canonical_draft(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = wiki_root / ".drafts/ingests/fake-paper"

            exit_code = main(
                [
                    "wiki",
                    "ingest",
                    str(pdf),
                    "--out",
                    str(out),
                    "--wiki-root",
                    str(wiki_root),
                    "--publish-mode",
                    "auto",
                ]
            )

            self.assertEqual(exit_code, 0)
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertTrue(run["canonical_wiki_mutated"])
            self.assertEqual(run["write_policy"], "auto_publish_draft")
            self.assertIn("canonical_artifacts", run)

            canonical = Path(run["canonical_artifacts"]["paper_page"])
            self.assertTrue(canonical.exists())
            canonical_text = canonical.read_text(encoding="utf-8")
            self.assertIn("review_state: \"needs_review\"", canonical_text)
            self.assertIn("quality_gate: \"warn\"", canonical_text)

            index = (wiki_root / "index.md").read_text(encoding="utf-8")
            log = (wiki_root / "log.md").read_text(encoding="utf-8")
            self.assertIn("[[papers/Fake-Research-Paper|Fake Research Paper]]", index)
            self.assertIn("## [", log)
            self.assertIn("Quality gate: `warn`", log)

    def test_eval_iterates_jsonl_cases(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            cases = root / "cases.jsonl"
            case = {
                "id": "case-1",
                "category": "paper_ingest",
                "paper_path": str(pdf),
                "problem_description": "Ingest a fake paper.",
                "expected_result": "Draft review packet with provenance.",
                "acceptable_paths": ["Any path that creates draft-only artifacts."],
                "must_not_do": ["Do not modify canonical wiki."],
                "evaluation_rubric": ["Human review checks packet usefulness."],
            }
            cases.write_text(json.dumps(case) + "\n", encoding="utf-8")
            out_dir = root / "eval-output"

            exit_code = main(["wiki", "eval", str(cases), "--out-dir", str(out_dir)])

            self.assertEqual(exit_code, 0)
            manifest = json.loads((out_dir / "eval_manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["judging_policy"], "llm-as-judge-with-human-calibration")
            self.assertEqual(manifest["results"][0]["status"], "generated")
            self.assertEqual(manifest["results"][0]["quality_gate"]["decision"], "warn")
            self.assertEqual(manifest["results"][0]["mode"], "ingest")
            self.assertTrue(Path(manifest["results"][0]["case_snapshot"]).exists())

    def test_eval_flow_mode_prepares_judge_packets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            rubric = root / "rubric.md"
            rubric.write_text("# Rubric\n\nJudge the paper wiki packet.\n", encoding="utf-8")
            cases = root / "cases.jsonl"
            case = {
                "id": "case-flow-1",
                "category": "paper_ingest",
                "paper_path": str(pdf),
                "problem_description": "Run the full Paper Wiki flow.",
                "expected_result": "Judge packet and canonical draft are created.",
                "acceptable_paths": ["Any path that prepares judge evidence."],
                "must_not_do": ["Do not require human review before packet creation."],
                "evaluation_rubric": ["Judge packet includes generated artifacts."],
            }
            cases.write_text(json.dumps(case) + "\n", encoding="utf-8")
            out_dir = root / "eval-output"

            exit_code = main(
                [
                    "wiki",
                    "eval",
                    str(cases),
                    "--out-dir",
                    str(out_dir),
                    "--mode",
                    "flow",
                    "--rubric",
                    str(rubric),
                ]
            )

            self.assertEqual(exit_code, 0)
            manifest = json.loads((out_dir / "eval_manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["mode"], "flow")
            self.assertEqual(manifest["rubric"], str(rubric))
            self.assertEqual(manifest["wiki_root"], str(out_dir / "wiki"))
            result = manifest["results"][0]
            self.assertEqual(result["status"], "awaiting_judge")
            self.assertEqual(result["mode"], "flow")
            self.assertTrue(Path(result["flow_manifest"]).exists())
            self.assertTrue(Path(result["judge_packet"]).exists())
            self.assertTrue(Path(result["case_snapshot"]).exists())
            self.assertIn("canonical_artifacts", result)

    def test_eval_converge_summary_and_calibration(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            rubric = root / "rubric.md"
            rubric.write_text("# Rubric\n", encoding="utf-8")
            cases = root / "cases.jsonl"
            case = {
                "id": "case-flow-1",
                "category": "paper_ingest",
                "paper_path": str(pdf),
                "problem_description": "Run and judge the full Paper Wiki flow.",
                "expected_result": "Judge result is recorded and converged.",
                "acceptable_paths": ["Any path that records judge evidence."],
                "must_not_do": ["Do not skip convergence."],
                "evaluation_rubric": ["source_fidelity"],
            }
            cases.write_text(json.dumps(case) + "\n", encoding="utf-8")
            out_dir = root / "eval-output"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "eval",
                        str(cases),
                        "--out-dir",
                        str(out_dir),
                        "--mode",
                        "flow",
                        "--rubric",
                        str(rubric),
                    ]
                ),
                0,
            )

            judge_path = out_dir / "case-flow-1" / "judge-result.json"
            judge_path.write_text(json.dumps(_passing_judge_result("case-flow-1")) + "\n", encoding="utf-8")
            manifest_path = out_dir / "eval_manifest.json"

            self.assertEqual(main(["wiki", "eval-converge", str(manifest_path)]), 0)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            result = manifest["results"][0]
            self.assertEqual(result["evaluation_status"], "converged")
            self.assertEqual(result["judge_decision"], "pass")
            self.assertEqual(result["convergence_status"], "converged")
            self.assertTrue((out_dir / "eval_summary.json").exists())

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "eval-calibrate",
                        str(manifest_path),
                        "--case-id",
                        "case-flow-1",
                        "--human-decision",
                        "agree",
                        "--bucket",
                        "paper_model",
                        "--notes",
                        "Judge result matches the human calibration.",
                        "--require-human-review-next-time",
                        "false",
                    ]
                ),
                0,
            )
            calibration = (out_dir / "human_calibration.jsonl").read_text(encoding="utf-8")
            self.assertIn("case-flow-1", calibration)
            summary = json.loads((out_dir / "eval_summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["human_calibration_count"], 1)
            self.assertEqual(summary["judge_decisions"]["pass"], 1)

    def test_review_records_human_decision(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            review = Path(tmp) / "review.md"
            review.write_text("# Review\n", encoding="utf-8")

            exit_code = main(
                [
                    "wiki",
                    "review",
                    str(review),
                    "--decision",
                    "needs_refine",
                    "--bucket",
                    "packet_format",
                    "--notes",
                    "Needs clearer evidence notes.",
                ]
            )

            self.assertEqual(exit_code, 0)
            records = (review.parent / "human_review.jsonl").read_text(encoding="utf-8")
            self.assertIn("needs_refine", records)
            self.assertIn("packet_format", records)

    def test_judge_pack_collects_run_artifacts_and_rubric(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            rubric = root / "rubric.md"
            rubric.write_text("# Rubric\n\nScore the wiki packet.\n", encoding="utf-8")
            packet = root / "judge-packet.md"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            exit_code = main(
                [
                    "wiki",
                    "judge-pack",
                    str(out / "run.json"),
                    "--rubric",
                    str(rubric),
                    "--out",
                    str(packet),
                ]
            )

            self.assertEqual(exit_code, 0)
            text = packet.read_text(encoding="utf-8")
            self.assertIn("# Paper Wiki Judge Packet", text)
            self.assertIn("## Rubric", text)
            self.assertIn("## Artifact: draft.paper_page", text)
            self.assertIn("Fake Research Paper", text)

    def test_flow_prepares_judge_packet_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            rubric = root / "rubric.md"
            rubric.write_text("# Rubric\n", encoding="utf-8")
            out = wiki_root / ".drafts/ingests/fake-paper"

            exit_code = main(
                [
                    "wiki",
                    "flow",
                    str(pdf),
                    "--out",
                    str(out),
                    "--wiki-root",
                    str(wiki_root),
                    "--rubric",
                    str(rubric),
                ]
            )

            self.assertEqual(exit_code, 0)
            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            self.assertEqual(flow["status"], "awaiting_judge")
            self.assertTrue((out / "judge-packet.md").exists())
            self.assertTrue((wiki_root / "papers/Fake-Research-Paper.md").exists())

    def test_judge_record_and_converge_update_run_and_canonical_page(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = wiki_root / ".drafts/ingests/fake-paper"
            judge = root / "judge-result.json"
            judge.write_text(json.dumps(_passing_judge_result("case-1")) + "\n", encoding="utf-8")

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "ingest",
                        str(pdf),
                        "--out",
                        str(out),
                        "--wiki-root",
                        str(wiki_root),
                        "--publish-mode",
                        "auto",
                    ]
                ),
                0,
            )
            self.assertEqual(main(["wiki", "judge-record", str(out / "run.json"), str(judge)]), 0)
            self.assertEqual(main(["wiki", "converge", str(out / "run.json")]), 0)

            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertEqual(run["judge_result"]["decision"], "pass")
            self.assertEqual(run["convergence"]["status"], "converged")
            convergence = json.loads((out / "convergence.json").read_text(encoding="utf-8"))
            self.assertEqual(convergence["status"], "converged")

            canonical = Path(run["canonical_artifacts"]["paper_page"]).read_text(encoding="utf-8")
            self.assertIn("review_state: \"auto_converged\"", canonical)
            self.assertIn("judge_decision: \"pass\"", canonical)


def _passing_judge_result(case_id: str) -> dict[str, object]:
    return {
        "schema_version": "paper_wiki_judge_result.v0",
        "case_id": case_id,
        "decision": "pass",
        "weighted_score": 4.2,
        "dimension_scores": {
            "source_fidelity": 4,
            "provenance_quality": 4,
            "paper_model_depth": 4,
            "object_decomposition": 4,
            "retrieval_readiness": 4,
            "wiki_integration": 4,
            "uncertainty_handling": 4,
            "human_gate_discipline": 4,
            "research_usefulness": 4,
            "format_schema_validity": 5,
        },
        "blocking_issues": [],
        "findings": [],
        "calibration_questions_for_human": [],
        "recommended_refine_bucket": "other",
    }


if __name__ == "__main__":
    unittest.main()
