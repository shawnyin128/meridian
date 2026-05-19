from __future__ import annotations

import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

from meridian.cli import main
from meridian.wiki.extract import PageExtraction, PdfExtraction
from meridian.wiki.ingest import _title_from_first_page
from meridian.wiki.packet import _trusted_metadata_authors
from meridian.wiki.rubrics import complete_result_template, rubric_for


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
                "The Cayley transform keeps R orthogonal and Eq. 3 minimizes ||XR - Q(XR)||^2. "
                "Adaptive Weight Clustering and Centroid Finetuning (ACCF) optimizes centroids C and assignments A. "
                "The ACCF objective adds router logits KL divergence for MoE FFN weights. "
                "Permutation-Invariant Outlier Grouping (POG) reorders columns for block-wise clustering. "
                "The LUT-based system implementation uses centroids and assignments for inference.",
                images=0,
                drawings=2,
            ),
            FakePage(
                "Experiments\nAlgorithm 1: POG Algorithm sorts columns by mean absolute value and pairs high-variance subgroups with low-variance subgroups. "
                "A4W4 uses 4-bit activations and 16 centroids for weights. "
                "Table 10 shows POG helps block-wise clustering. Table 11 shows KL penalty reduces router change. "
                "Accel-Sim is used for GPU evidence. T-MAC in Llama.cpp is used for CPU evidence. "
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

    def test_title_extraction_keeps_multiline_technical_title(self) -> None:
        extraction = PdfExtraction(
            metadata={},
            page_count=1,
            pages=[
                PageExtraction(
                    page_number=1,
                    text=(
                        "AFFINEQUANT: AFFINE TRANSFORMATION QUANTI-\n"
                        "ZATION FOR LARGE LANGUAGE MODELS\n"
                        "Yuexiao Ma1*, Huixia Li2, Rui Wang2\n"
                        "ABSTRACT\n"
                        "The paper studies quantization."
                    ),
                    section_hint=None,
                    image_path="page.png",
                    image_count=0,
                    drawing_count=0,
                )
            ],
        )

        self.assertEqual(
            _title_from_first_page(extraction),
            "AffineQuant: Affine Transformation Quantization For Large Language Models",
        )

    def test_metadata_authors_are_only_trusted_when_seen_on_first_page(self) -> None:
        extraction = PdfExtraction(
            metadata={"author": "A. Researcher"},
            page_count=1,
            pages=[
                PageExtraction(
                    page_number=1,
                    text="Real Author\nAbstract\nThis paper studies a method.",
                    section_hint=None,
                    image_path="page.png",
                    image_count=0,
                    drawing_count=0,
                )
            ],
        )

        self.assertEqual(
            _trusted_metadata_authors(extraction),
            "not trusted (PDF metadata says: A. Researcher)",
        )

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
            self.assertEqual(run["paper_model"]["strategy"], "heuristic_text_v2")
            self.assertEqual(run["paper_model"]["evidence_candidates"], 3)
            self.assertIn("mechanism_fact_candidates", run["paper_model"])
            self.assertEqual(run["source_management"]["mode"], "managed")
            self.assertTrue((root / "wiki/raw/sources/sources.jsonl").exists())

            review = (out / "review.md").read_text(encoding="utf-8")
            self.assertTrue(review.startswith("---\n"))
            self.assertIn("type: \"ingest_review\"", review)
            self.assertIn("model_strategy: \"heuristic_text_v2\"", review)
            self.assertIn("## Paper Identity", review)
            self.assertIn("## Figures / Tables / Equations Notes", review)
            self.assertIn("## Publish Proposal", review)
            self.assertIn("p. 3", review)
            self.assertNotIn("Agent task:", review)

            paper = (out / "paper.md").read_text(encoding="utf-8")
            self.assertTrue(paper.startswith("---\n"))
            self.assertIn("type: \"paper\"", paper)
            self.assertIn("model_strategy: \"heuristic_text_v2\"", paper)
            self.assertIn("## Paper Positioning", paper)
            self.assertIn("## Retrieval Anchors", paper)
            self.assertIn("## Mechanism", paper)
            self.assertIn("## Candidate Records", paper)
            self.assertNotIn("## Extracted Contribution Sentences", paper)
            self.assertNotIn("Agent task:", paper)

            claim_lines = (out / "claims.jsonl").read_text(encoding="utf-8").splitlines()
            method_lines = (out / "methods.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertNotIn("needs_agent_fill", "\n".join(claim_lines + method_lines))

            evidence_lines = (out / "evidence.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(evidence_lines), 3)
            first_evidence = json.loads(evidence_lines[0])
            self.assertEqual(first_evidence["id"], "evidence-p0001")
            self.assertEqual(first_evidence["extraction_strategy"], "heuristic_text_v2")

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
            self.assertIn("## Retrieval Anchors", paper)
            self.assertIn("First it learns rotations", paper)
            self.assertIn("POG is the conditional piece", paper)
            self.assertIn("makes the clustered representation executable", paper)
            self.assertIn("Operates on:", paper)
            self.assertIn("Depends on:", paper)
            self.assertIn("First checks:", paper)
            self.assertIn("## Mechanism Details To Verify", paper)
            self.assertIn("Eq. 3", paper)
            self.assertIn("Algorithm 1", paper)
            self.assertIn("16 learned centroids", paper)
            self.assertIn("Accel-Sim", paper)
            self.assertIn("T-MAC", paper)
            self.assertIn("## Implementation Hooks", paper)
            self.assertIn("Router KL evidence should be tracked separately", paper)
            self.assertNotIn("Add a sanity check for this dependency", paper)
            self.assertNotIn("The core mechanism is CodeQuant:", paper)
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
            self.assertTrue(Path(result["reader_check_packet"]).exists())
            self.assertTrue(Path(result["quality_self_check"]).exists())
            self.assertTrue(Path(result["structural_self_check"]).exists())
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
            self.assertTrue((out / "reader-check.md").exists())
            self.assertTrue((out / "quality-self-check.json").exists())
            self.assertTrue((out / "structural-self-check.json").exists())
            quality = json.loads((out / "quality-self-check.json").read_text(encoding="utf-8"))
            self.assertEqual(quality["schema_version"], "paper_wiki_quality_self_check.v0")
            self.assertIn("retrieval_scenarios", quality)
            self.assertIn("dimension_scores", quality)
            structural = json.loads((out / "structural-self-check.json").read_text(encoding="utf-8"))
            self.assertEqual(structural["schema_version"], "paper_wiki_structural_self_check.v0")
            self.assertEqual(structural["agent_role"], "structural")
            self.assertIn("managed_agent_architecture", structural)
            self.assertEqual(flow["reader_check_packet"], str(out / "reader-check.md"))
            self.assertEqual(flow["quality_self_check"], str(out / "quality-self-check.json"))
            self.assertEqual(flow["structural_self_check"], str(out / "structural-self-check.json"))
            self.assertEqual(
                set(flow["managed_self_check_agents"]),
                {"understanding", "quality", "structural"},
            )
            reader_check = (out / "reader-check.md").read_text(encoding="utf-8")
            self.assertIn("Schema version: `paper_wiki_reader_check.v2`", reader_check)
            self.assertIn("## Mandatory Checklist", reader_check)
            self.assertIn("## Comparison Dimensions", reader_check)
            self.assertIn("## Detailed Rubric", reader_check)
            self.assertIn("## Reader A Task: paper.md Only", reader_check)
            self.assertIn("## Reader B Task: source-grounded", reader_check)
            self.assertIn("## Candidate Record Audit Inputs", reader_check)
            self.assertIn("## Reconciliation Task", reader_check)
            self.assertIn("mechanism_causality", reader_check)
            self.assertIn("weighted_score", reader_check)
            self.assertIn("rubric_scores", reader_check)
            self.assertIn("implementation_usefulness", reader_check)
            self.assertIn("candidate_record_audit", reader_check)
            self.assertIn("regression_tests_to_add", reader_check)
            self.assertIn("generation_bucket", reader_check)
            self.assertTrue((wiki_root / "papers/Fake-Research-Paper.md").exists())

    def test_reader_check_command_builds_two_reader_packet(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            packet = root / "reader-check.md"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(
                main(["wiki", "reader-check", str(out / "run.json"), "--out", str(packet)]),
                0,
            )

            text = packet.read_text(encoding="utf-8")
            self.assertIn("# Paper Wiki Reader Check Packet", text)
            self.assertIn("paper_wiki_reader_check.v2", text)
            self.assertIn("Reader A using only the `paper.md`", text)
            self.assertIn("Reader B using the source-grounded excerpt", text)
            self.assertIn("frontmatter_retrieval", text)
            self.assertIn("dimension_comparison", text)
            self.assertIn("teachback_completeness", text)
            self.assertIn("hard_failures", text)
            self.assertIn("retrieval_metadata_audit", text)
            self.assertIn("mechanism_refine_plan", text)
            self.assertIn("Fake Research Paper", text)

    def test_quality_check_command_scores_ingest_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            packet = root / "quality-self-check.json"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(
                main(["wiki", "quality-check", str(out / "run.json"), "--out", str(packet)]),
                0,
            )

            payload = json.loads(packet.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema_version"], "paper_wiki_quality_self_check.v0")
            self.assertIn(payload["decision"], {"pass", "needs_refine", "fail"})
            self.assertIn("weighted_score", payload)
            self.assertEqual(len(payload["retrieval_scenarios"]), 5)
            dimensions = {item["dimension"] for item in payload["dimension_scores"]}
            self.assertIn("retrieval_scenario_coverage", dimensions)
            self.assertIn("metadata_routing_integrity", dimensions)

    def test_structural_check_command_scores_ingest_structure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            packet = root / "structural-self-check.json"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(
                main(["wiki", "structural-check", str(out / "run.json"), "--out", str(packet)]),
                0,
            )

            payload = json.loads(packet.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema_version"], "paper_wiki_structural_self_check.v0")
            self.assertIn(payload["decision"], {"pass", "needs_refine", "fail"})
            self.assertIn("weighted_score", payload)
            dimensions = {item["dimension"] for item in payload["dimension_scores"]}
            self.assertIn("run_manifest_contract", dimensions)
            self.assertIn("frontmatter_schema", dimensions)
            self.assertIn("candidate_jsonl_schema", dimensions)
            self.assertIn("source_management", dimensions)

    def test_structural_check_fails_missing_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            packet = root / "structural-self-check.json"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            (out / "methods.jsonl").unlink()
            self.assertEqual(
                main(["wiki", "structural-check", str(out / "run.json"), "--out", str(packet)]),
                0,
            )

            payload = json.loads(packet.read_text(encoding="utf-8"))
            self.assertIn(payload["decision"], {"needs_refine", "fail"})
            dimensions = {item["dimension"]: item for item in payload["dimension_scores"]}
            self.assertLess(dimensions["artifact_existence"]["score"], 5)
            self.assertLess(dimensions["candidate_jsonl_schema"]["score"], 3)

    def test_structural_check_fails_missing_required_section(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            packet = root / "structural-self-check.json"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            paper = out / "paper.md"
            paper.write_text(
                paper.read_text(encoding="utf-8").replace("## Mechanism\n", ""),
                encoding="utf-8",
            )
            self.assertEqual(
                main(["wiki", "structural-check", str(out / "run.json"), "--out", str(packet)]),
                0,
            )

            payload = json.loads(packet.read_text(encoding="utf-8"))
            self.assertIn(payload["decision"], {"needs_refine", "fail"})
            dimensions = {item["dimension"]: item for item in payload["dimension_scores"]}
            self.assertLess(dimensions["section_schema"]["score"], 3)

    def test_three_agent_rubrics_are_complete(self) -> None:
        for agent in ("understanding", "quality", "structural"):
            rubric = rubric_for(agent)
            self.assertTrue(rubric.schema_version.endswith(".v1") or rubric.output_schema_version.endswith(".v0"))
            self.assertGreaterEqual(len(rubric.dimensions), 6)
            self.assertGreaterEqual(len(rubric.hard_fail_rules), 4)
            for dimension in rubric.dimensions:
                self.assertGreater(dimension.weight, 0)
                self.assertEqual(set(dimension.anchors), {1, 2, 3, 4, 5})
                self.assertTrue(dimension.evidence_required)
                self.assertTrue(dimension.failure_examples)

    def test_self_check_run_fake_completes_and_aggregates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            self_check_dir = root / "self-check"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "self-check-run",
                        str(out / "run.json"),
                        "--backend",
                        "fake",
                        "--out-dir",
                        str(self_check_dir),
                    ]
                ),
                0,
            )

            manifest = json.loads((self_check_dir / "self-check-manifest.json").read_text(encoding="utf-8"))
            summary = json.loads((self_check_dir / "self-check-summary.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["backend"], "fake")
            self.assertEqual(manifest["status"], "completed")
            self.assertEqual(set(manifest["agents"]), {"understanding", "quality", "structural"})
            self.assertEqual(summary["schema_version"], "paper_wiki_self_check_summary.v0")
            self.assertEqual(summary["decision"], "pass")
            self.assertIn("understanding", summary["agents"])
            self.assertIn("quality", summary["agents"])
            self.assertIn("structural", summary["agents"])

    def test_self_check_eval_runs_calibration_manifest_with_fake_backend(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            cases = root / "cases.jsonl"
            records = [
                {
                    "id": "case-a",
                    "category": "paper_ingest",
                    "paper_path": str(pdf),
                    "problem_description": "First calibration case.",
                    "expected_result": "Self-check can run over eval output.",
                    "acceptable_paths": ["Any path that writes a self-check summary."],
                    "must_not_do": [],
                    "evaluation_rubric": ["three agent decisions are summarized"],
                },
                {
                    "id": "case-b",
                    "category": "paper_ingest",
                    "paper_path": str(pdf),
                    "problem_description": "Second calibration case.",
                    "expected_result": "Batch summary includes per-case results.",
                    "acceptable_paths": ["Any path that runs the same rubric contract."],
                    "must_not_do": [],
                    "evaluation_rubric": ["batch does not require human review"],
                },
            ]
            cases.write_text("\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8")
            eval_out = root / "eval-output"
            self_check_out = root / "self-check-eval"

            self.assertEqual(main(["wiki", "eval", str(cases), "--out-dir", str(eval_out)]), 0)
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "self-check-eval",
                        str(eval_out / "eval_manifest.json"),
                        "--backend",
                        "fake",
                        "--out-dir",
                        str(self_check_out),
                    ]
                ),
                0,
            )

            summary = json.loads((self_check_out / "self-check-eval-summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["schema_version"], "paper_wiki_self_check_eval_summary.v0")
            self.assertEqual(summary["total_cases"], 2)
            self.assertEqual(summary["completed_cases"], 2)
            self.assertEqual(summary["awaiting_cases"], 0)
            self.assertEqual({case["decision"] for case in summary["case_results"]}, {"pass"})

    def test_self_check_run_agent_executed_prepares_portable_packets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            self_check_dir = root / "self-check"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "self-check-run",
                        str(out / "run.json"),
                        "--backend",
                        "agent-executed",
                        "--out-dir",
                        str(self_check_dir),
                    ]
                ),
                0,
            )

            manifest = json.loads((self_check_dir / "self-check-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["status"], "awaiting_agent_results")
            self.assertTrue((self_check_dir / "understanding-agent.md").exists())
            self.assertTrue((self_check_dir / "quality-agent.md").exists())
            self.assertTrue((self_check_dir / "structural-self-check.json").exists())
            self.assertTrue((self_check_dir / "agent-execution-instructions.md").exists())
            understanding_packet = (self_check_dir / "understanding-agent.md").read_text(encoding="utf-8")
            quality_packet = (self_check_dir / "quality-agent.md").read_text(encoding="utf-8")
            self.assertIn("paper_wiki_understanding_rubric.v1", understanding_packet)
            self.assertIn("paper_wiki_quality_rubric.v1", quality_packet)
            self.assertIn("paper_wiki_understanding_result.v1", understanding_packet)
            self.assertIn("paper_wiki_quality_result.v1", quality_packet)
            self.assertFalse((self_check_dir / "self-check-summary.json").exists())

    def test_self_check_aggregate_fails_missing_agent_results(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            self_check_dir = root / "self-check"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "self-check-run",
                        str(out / "run.json"),
                        "--backend",
                        "agent-executed",
                        "--out-dir",
                        str(self_check_dir),
                    ]
                ),
                0,
            )
            self.assertEqual(main(["wiki", "self-check-aggregate", str(self_check_dir / "self-check-manifest.json")]), 0)

            summary = json.loads((self_check_dir / "self-check-summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["decision"], "fail")
            self.assertTrue(summary["hard_failures"])

    def test_self_check_aggregate_hard_fail_overrides_high_score(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            self_check_dir = root / "self-check"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "self-check-run",
                        str(out / "run.json"),
                        "--backend",
                        "agent-executed",
                        "--out-dir",
                        str(self_check_dir),
                    ]
                ),
                0,
            )
            manifest = json.loads((self_check_dir / "self-check-manifest.json").read_text(encoding="utf-8"))
            Path(manifest["agents"]["understanding"]["expected_result"]).write_text(
                json.dumps(_complete_self_check_result("understanding", score=4.8)) + "\n",
                encoding="utf-8",
            )
            quality = _complete_self_check_result("quality", score=4.8)
            quality["hard_failures"] = [
                {
                    "rule_id": "keyword_stuffed_retrieval",
                    "severity": "blocking",
                    "evidence": "frontmatter has keywords but scenarios cannot retrieve mechanism.",
                    "repair_bucket": "retrieval_metadata",
                    "testable_fix": "Remove noisy anchors and add mechanism-specific retrieval keys.",
                }
            ]
            Path(manifest["agents"]["quality"]["expected_result"]).write_text(
                json.dumps(quality) + "\n",
                encoding="utf-8",
            )

            self.assertEqual(main(["wiki", "self-check-aggregate", str(self_check_dir / "self-check-manifest.json")]), 0)

            summary = json.loads((self_check_dir / "self-check-summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["decision"], "fail")
            self.assertGreater(summary["weighted_score"], 4.0)
            self.assertEqual(summary["hard_failures"][0]["rule_id"], "keyword_stuffed_retrieval")

    def test_self_check_aggregate_rejects_malformed_agent_dimension(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            self_check_dir = root / "self-check"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "self-check-run",
                        str(out / "run.json"),
                        "--backend",
                        "agent-executed",
                        "--out-dir",
                        str(self_check_dir),
                    ]
                ),
                0,
            )
            manifest = json.loads((self_check_dir / "self-check-manifest.json").read_text(encoding="utf-8"))
            understanding = _complete_self_check_result("understanding", score=4.5)
            understanding["dimension_scores"][0].pop("rationale")
            Path(manifest["agents"]["understanding"]["expected_result"]).write_text(
                json.dumps(understanding) + "\n",
                encoding="utf-8",
            )
            Path(manifest["agents"]["quality"]["expected_result"]).write_text(
                json.dumps(_complete_self_check_result("quality", score=4.5)) + "\n",
                encoding="utf-8",
            )

            self.assertEqual(main(["wiki", "self-check-aggregate", str(self_check_dir / "self-check-manifest.json")]), 0)

            summary = json.loads((self_check_dir / "self-check-summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["decision"], "fail")
            self.assertTrue(
                any(finding["problem"] == "dimension score missing fields" for finding in summary["validation_findings"])
            )

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


def _complete_self_check_result(agent: str, score: float = 4.5) -> dict[str, object]:
    result = complete_result_template(agent)
    result["decision"] = "pass"
    result["weighted_score"] = score
    result["confidence"] = "high"
    result["one_sentence_verdict"] = f"{agent} result is schema-complete."
    result["dimension_scores"] = [
        {
            "dimension": dimension.id,
            "score": score,
            "weight": dimension.weight,
            "anchor": "5",
            "evidence": f"{dimension.id} evidence",
            "rationale": f"{dimension.id} rationale",
            "repair_bucket": "judge_rubric",
        }
        for dimension in rubric_for(agent).dimensions
    ]
    result["hard_failures"] = []
    result["findings"] = []
    result["recommended_repairs"] = []
    result["calibration_notes"] = ["unit-test synthetic result"]
    return result


if __name__ == "__main__":
    unittest.main()
