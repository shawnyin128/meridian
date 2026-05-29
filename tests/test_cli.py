from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from meridian import __version__
from meridian.cli import main
from meridian.lab import initialize_lab_space, validate_lab_space
from meridian.mcp import adapter as mcp_adapter
from meridian.mcp import harness as mcp_harness
from meridian.mcp import server as mcp_server
from meridian.wiki.corpus import retrieve_papers
from meridian.wiki.extract import PageExtraction, PdfExtraction
from meridian.wiki.ingest import _title_from_first_page
from meridian.wiki.health_server import HealthRunController
from meridian.wiki.model import _primary_paper_key, build_paper_model
from meridian.wiki.packet import _trusted_metadata_authors
from meridian.wiki.promote import _records_for_promotion
from meridian.wiki.quality_check import (
    _candidate_record_score,
    _retrieval_intent_quality_score,
    _retrieval_scenarios,
    _retrieval_taxonomy_boundary_score,
    run_quality_self_check,
)
from meridian.wiki.retrieval_audit import generate_audit_queries
from meridian.wiki.rubrics import complete_result_template, rubric_for


def _run_cli_capture(args: list[str]) -> tuple[int, str, str]:
    stdout = StringIO()
    stderr = StringIO()
    with redirect_stdout(stdout), redirect_stderr(stderr):
        exit_code = main(args)
    return exit_code, stdout.getvalue(), stderr.getvalue()


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

    def test_release_version_surfaces_are_aligned(self) -> None:
        expected = "0.3.5"
        self.assertEqual(__version__, expected)
        self.assertEqual(mcp_server.SERVER_VERSION, expected)
        self.assertEqual(Path("VERSION").read_text(encoding="utf-8").strip(), expected)

        pyproject_version = ""
        for line in Path("pyproject.toml").read_text(encoding="utf-8").splitlines():
            if line.startswith("version = "):
                pyproject_version = line.split("=", 1)[1].strip().strip('"')
                break
        self.assertEqual(pyproject_version, expected)

        codex_plugin = json.loads(
            Path("plugins/codex/meridian/.codex-plugin/plugin.json").read_text(encoding="utf-8")
        )
        claude_plugin = json.loads(
            Path("plugins/claude-code/meridian/.claude-plugin/plugin.json").read_text(encoding="utf-8")
        )
        self.assertEqual(codex_plugin["version"], expected)
        self.assertEqual(claude_plugin["version"], expected)

        exit_code, stdout, stderr = _run_cli_capture(["--version"])
        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(stdout.strip(), f"meridian {expected}")

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

    def test_domain_detection_does_not_treat_support_as_ppo(self) -> None:
        extraction = PdfExtraction(
            metadata={"title": "Physics-informed neural networks"},
            page_count=3,
            pages=[
                PageExtraction(
                    page_number=1,
                    text=(
                        "Abstract\nPhysics-informed neural networks solve forward and inverse "
                        "problems involving nonlinear partial differential equations."
                    ),
                    section_hint="Abstract",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=2,
                    text=(
                        "Method\nThe framework uses collocation points to support PDE residual "
                        "losses, boundary conditions, and data observations."
                    ),
                    section_hint="Method",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=3,
                    text=(
                        "Experiments\nThe paper reports predictive accuracy for forward solution "
                        "and inverse parameter discovery."
                    ),
                    section_hint="Experiments",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
            ],
        )

        model = build_paper_model(
            "Physics-informed neural networks: A deep learning framework for solving forward and inverse problems involving nonlinear partial differential equations",
            extraction,
        )

        self.assertIn("physics-informed neural networks", model.methods)
        self.assertIn("physics-informed PDE setting", model.settings)
        self.assertNotIn("reinforcement-learning setting", model.settings)
        self.assertNotIn("policy optimization", model.methods)
        self.assertIn("PDE residual", " ".join(model.implementation_notes))

    def test_non_llm_clustering_does_not_inherit_quantization_routing(self) -> None:
        extraction = PdfExtraction(
            metadata={"title": "Deep clustering with concrete k-means"},
            page_count=2,
            pages=[
                PageExtraction(
                    page_number=1,
                    text=(
                        "Abstract\nWe propose concrete k-means, an end-to-end solution to the "
                        "k-means objective jointly with representation learning."
                    ),
                    section_hint="Abstract",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=2,
                    text=(
                        "Method\nThe model learns representations and cluster assignments for "
                        "deep clustering benchmarks such as MNIST and Reuters."
                    ),
                    section_hint="Method",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
            ],
        )

        model = build_paper_model("Deep clustering with concrete k-means", extraction)

        self.assertEqual(model.methods, ["clustering algorithm"])
        self.assertEqual(model.settings, ["clustering theory setting"])
        self.assertEqual(model.topics, ["clustering theory"])
        self.assertNotIn("non-uniform quantization", model.topics)
        self.assertNotIn("LUT/kernel setting", model.settings)

    def test_kv_cache_compression_does_not_become_clustering_algorithm(self) -> None:
        extraction = PdfExtraction(
            metadata={"title": "PyramidKV"},
            page_count=3,
            pages=[
                PageExtraction(
                    page_number=1,
                    text=(
                        "Abstract\nPyramidKV compresses KV caches for long-context LLM decoding. "
                        "It retains only a cache budget of key tokens while preserving accuracy and memory."
                    ),
                    section_hint="Abstract",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=2,
                    text=(
                        "Method\nSnapKV improves efficiency by selecting/clustering significant KV positions "
                        "based on attention scores. PyramidKV uses pyramidal information funneling to decide "
                        "which key-value cache entries to retain across layers."
                    ),
                    section_hint="Method",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=3,
                    text=(
                        "Experiments\nThe evaluation sweeps retention ratio, KV cache size, LongBench accuracy, "
                        "Needle In A Haystack success, memory footprint, and decode latency."
                    ),
                    section_hint="Experiments",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
            ],
        )

        model = build_paper_model("PyramidKV: Dynamic KV Cache Compression based on Pyramidal Information Funneling", extraction)

        self.assertIn("KV-cache compression", model.methods)
        self.assertIn("long-context inference", model.methods)
        self.assertNotIn("clustering algorithm", model.methods)
        self.assertIn("KV-cache compression setting", model.settings)
        self.assertIn("KV-cache tensors", model.method_records[0]["inputs"])
        self.assertLess(len(model.method_records[0]["summary"]), 260)
        self.assertNotIn("Our observations reveal", model.method_records[0]["summary"])
        self.assertIn("KV-cache compression method", model.one_line_takeaway)
        self.assertNotIn("SnapKV improves efficiency by selecting/clustering", model.one_line_takeaway)
        self.assertIn("retention ratio", " ".join(model.implementation_notes).lower())
        self.assertNotIn("Test centroid update monotonicity", "\n".join(model.implementation_notes))

    def test_attention_kernel_low_precision_does_not_become_ptq(self) -> None:
        extraction = PdfExtraction(
            metadata={"title": "FlashAttention-3"},
            page_count=3,
            pages=[
                PageExtraction(
                    page_number=1,
                    text=(
                        "Abstract\nFlashAttention-3 speeds up attention on Hopper GPUs with asynchrony, "
                        "warp-specialization, TMA memory movement, and FP8 low-precision attention."
                    ),
                    section_hint="Abstract",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=2,
                    text=(
                        "Method\nThe kernel overlaps Tensor Core matmul, softmax, and memory movement. "
                        "Low-precision attention requires numerical checks against exact attention."
                    ),
                    section_hint="Method",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=3,
                    text=(
                        "Experiments\nThe evaluation reports throughput, latency, and numerical accuracy. "
                        "Baseline FP16 precision and FP8 precision are compared with RMSE."
                    ),
                    section_hint="Experiments",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
            ],
        )

        model = build_paper_model("FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision", extraction)

        self.assertIn("attention kernel optimization", model.methods)
        self.assertIn("GPU attention-kernel setting", model.settings)
        self.assertIn("attention kernel scheduling", model.topics)
        self.assertNotIn("post-training quantization", model.methods)
        self.assertNotIn("hardware-aware quantization", model.methods)
        self.assertNotIn("KV-cache quantization", model.settings)
        self.assertNotIn("precision", model.metrics)
        self.assertNotIn("Quantization:", "\n".join(model.implementation_notes))

    def test_visual_table_equation_pages_create_semantic_mechanism_facts(self) -> None:
        extraction = PdfExtraction(
            metadata={"title": "Pipeline Method"},
            page_count=3,
            pages=[
                PageExtraction(
                    page_number=1,
                    text="Abstract\nWe present a method for robust evaluation.",
                    section_hint="Abstract",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=2,
                    text=(
                        "Method\nFigure 2 illustrates the framework pipeline: inputs are encoded, "
                        "a planner selects actions, and a verifier checks outputs before commit."
                    ),
                    section_hint="Method",
                    image_path="page-0002.png",
                    image_count=1,
                    drawing_count=45,
                ),
                PageExtraction(
                    page_number=3,
                    text="Results\nTable 1 reports accuracy, latency, and memory against baselines.",
                    section_hint="Results",
                    image_path="page-0003.png",
                    image_count=0,
                    drawing_count=22,
                ),
            ],
        )

        model = build_paper_model("Pipeline Method", extraction)

        fact_types = {fact["fact_type"] for fact in model.mechanism_facts}
        summaries = " ".join(fact["summary"] for fact in model.mechanism_facts)
        self.assertIn("mechanism_figure", fact_types)
        self.assertIn("result_table", fact_types)
        self.assertIn("framework pipeline", summaries)

    def test_agent_speculative_actions_are_not_token_decoding(self) -> None:
        extraction = PdfExtraction(
            metadata={"title": "Speculative Actions"},
            page_count=3,
            pages=[
                PageExtraction(
                    page_number=1,
                    text=(
                        "Abstract\nSpeculative Actions is a lossless framework for faster agentic systems. "
                        "Agents predict likely future actions with faster models while slower ground-truth "
                        "executors or external tools verify and commit the trace."
                    ),
                    section_hint="Abstract",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=2,
                    text=(
                        "Method\nThe workflow records agent state, speculative actions, verifier decisions, "
                        "rollback events, environment state, and latency."
                    ),
                    section_hint="Method",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=3,
                    text="Experiments\nThe paper compares task success and speedup against sequential execution.",
                    section_hint="Experiments",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
            ],
        )

        model = build_paper_model("Speculative Actions: A Lossless Framework for Faster Agentic Systems", extraction)

        self.assertIn("agent workflow acceleration", model.methods)
        self.assertIn("speculative action execution", model.methods)
        self.assertIn("agent workflow setting", model.settings)
        self.assertNotIn("speculative decoding", model.methods)
        self.assertNotIn("hardware-aware quantization", model.topics)
        self.assertNotIn("computer architecture", model.topics)
        self.assertLess(len(model.method_records[0]["summary"]), 240)
        self.assertNotIn("Inspired by speculative execution", model.method_records[0]["summary"])
        self.assertIn("rollback", " ".join(model.implementation_notes).lower())
        self.assertNotIn("Speculative decoding:", "\n".join(model.implementation_notes))

    def test_audio_language_paper_gets_audio_route(self) -> None:
        extraction = PdfExtraction(
            metadata={"title": "Qwen-Audio"},
            page_count=3,
            pages=[
                PageExtraction(
                    page_number=1,
                    text=(
                        "Abstract\nQwen-Audio is a large-scale audio-language model for universal audio understanding."
                    ),
                    section_hint="Abstract",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=2,
                    text=(
                        "Method\nThe model connects an audio encoder to a language-model decoder and uses "
                        "hierarchical task tags for speech, music, sound, and audio question answering."
                    ),
                    section_hint="Method",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=3,
                    text="Evaluation\nAudio understanding tasks are evaluated separately by task family.",
                    section_hint="Evaluation",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
            ],
        )

        model = build_paper_model("Qwen-Audio: Advancing Universal Audio Understanding", extraction)

        self.assertIn("audio-language modeling", model.methods)
        self.assertIn("audio-language setting", model.settings)
        self.assertIn("audio-language modeling", model.topics)
        self.assertNotIn("policy optimization", model.topics)
        self.assertNotIn("transformer architecture", model.methods)

    def test_agent_survey_uses_taxonomy_not_reward_model_contract(self) -> None:
        extraction = PdfExtraction(
            metadata={"title": "A Survey on LLM-based Autonomous Agents"},
            page_count=3,
            pages=[
                PageExtraction(
                    page_number=1,
                    text=(
                        "Abstract\nThis survey reviews large language model based autonomous agents, "
                        "covering memory, planning, tool use, action, and evaluation."
                    ),
                    section_hint="Abstract",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=2,
                    text=(
                        "Survey\nWe organize LLM-based autonomous agent papers into a taxonomy of profile, "
                        "memory, planning, action, and evaluation modules."
                    ),
                    section_hint="Survey",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=3,
                    text="Discussion\nSurvey claims should route readers to primary agent papers.",
                    section_hint="Discussion",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
            ],
        )

        model = build_paper_model("A Survey on Large Language Model based Autonomous Agents", extraction)

        self.assertIn("survey synthesis", model.methods)
        self.assertIn("LLM-agent taxonomy", model.methods)
        self.assertIn("agent survey/synthesis setting", model.settings)
        self.assertNotIn("preference-learning setting", model.settings)
        self.assertNotIn("reward modeling", model.methods)
        self.assertNotIn("preference-based reinforcement learning", model.methods)
        self.assertIn("primary agent papers", " ".join(model.implementation_notes).lower())

    def test_video_jepa_uses_representation_route_not_rotation_quantization(self) -> None:
        extraction = PdfExtraction(
            metadata={"title": "V-JEPA 2"},
            page_count=3,
            pages=[
                PageExtraction(
                    page_number=1,
                    text=(
                        "Abstract\nV-JEPA 2 trains self-supervised video models with joint embedding predictive "
                        "learning for understanding, prediction, and planning."
                    ),
                    section_hint="Abstract",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=2,
                    text=(
                        "Method\nThe model predicts masked latent video representations rather than pixels and "
                        "uses downstream probes and planning tasks."
                    ),
                    section_hint="Method",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
                PageExtraction(
                    page_number=3,
                    text="Evaluation\nRepresentation probes and downstream tasks evaluate learned video features.",
                    section_hint="Evaluation",
                    image_path="",
                    image_count=0,
                    drawing_count=0,
                ),
            ],
        )

        model = build_paper_model("V-JEPA 2: Self-Supervised Video Models", extraction)

        self.assertIn("video representation learning", model.methods)
        self.assertIn("joint embedding predictive learning", model.methods)
        self.assertIn("video representation learning setting", model.settings)
        self.assertIn("video representation learning", model.topics)
        self.assertNotIn("rotation-based quantization", model.methods)
        self.assertNotIn("rotation-based quantization", model.topics)
        self.assertNotIn("Long context:", "\n".join(model.implementation_notes))

    def test_quality_check_flags_cross_domain_contamination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paper = root / "paper.md"
            claims = root / "claims.jsonl"
            methods = root / "methods.jsonl"
            evidence = root / "evidence.jsonl"
            extraction = root / "extraction"
            extraction.mkdir()
            paper.write_text(
                """---
type: "paper"
title: "FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision"
status: "draft"
source_pdf: "paper.pdf"
source_id: "paper-pdf-test"
source_registry: "sources.jsonl"
aliases:
  - "FlashAttention-3"
topics:
  - "hardware-aware quantization"
methods:
  - "post-training quantization"
settings:
  - "KV-cache quantization"
claims:
  - "claim-001"
confidence: "medium"
review_state: "needs_review"
---
# FlashAttention-3

## What To Remember
This page incorrectly routes an attention kernel as PTQ.

## When To Retrieve This Paper
Canonical retrieval fits:
- Query: "I want to compare attention kernels."
  Use because: It should be an attention kernel page.
- Query: "I am implementing attention kernels."
  Use because: It should mention profiling.
- Query: "I need evidence for throughput."
  Use because: It should route to runtime evidence.

Scope notes:
- Primary fit: attention kernels.
- Adjacent fit: GPU kernels.
- Weak fit: model compression.

## Mechanism
### Bad
- Operates on: Q/K/V.
- Produces: attention output.
- Depends on: GPU setting.
- First checks: profile.

## Evidence Map
Evidence takeaways:
- Runtime evidence.

## Implementation Hooks
- Profile kernels.

## Limitations / Uncertainty
- GPU-specific.

## Candidate Records
- Claims: `claims.jsonl`
""",
                encoding="utf-8",
            )
            claims.write_text(
                json.dumps({"id": "claim-001", "claim": "Runtime evidence.", "provenance": [{"page": 1}], "evidence_ids": ["evidence-p0001"]}) + "\n",
                encoding="utf-8",
            )
            methods.write_text(
                json.dumps({"id": "method-001", "name": "Bad", "inputs": ["Q"], "outputs": ["O"], "assumptions": ["GPU"], "implementation_notes": ["profile"], "provenance": [{"page": 1}]}) + "\n",
                encoding="utf-8",
            )
            evidence.write_text(
                json.dumps({"id": "evidence-p0001", "page": 1, "supports": ["claim-001"]}) + "\n",
                encoding="utf-8",
            )
            (extraction / "pages.jsonl").write_text(
                json.dumps({"page_number": 1, "text": "FlashAttention kernel", "drawing_count": 0}) + "\n",
                encoding="utf-8",
            )
            run = root / "run.json"
            run.write_text(
                json.dumps(
                    {
                        "title": "FlashAttention-3",
                        "draft_artifacts": {
                            "paper_page": str(paper),
                            "claims": str(claims),
                            "methods": str(methods),
                            "evidence": str(evidence),
                        },
                        "extraction_dir": str(extraction),
                    }
                ),
                encoding="utf-8",
            )

            result = run_quality_self_check(run_manifest=run)
            payload = json.loads(result.path.read_text(encoding="utf-8"))
            findings = " ".join(
                " ".join(str(item) for item in (score.get("findings") or []))
                for score in payload["dimension_scores"]
            )
            self.assertIn("cross_domain_quantization_contamination", findings)

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
            self.assertEqual(run["paper_model"]["strategy"], "heuristic_text_v3")
            self.assertEqual(run["paper_model"]["evidence_candidates"], 3)
            self.assertIn("mechanism_fact_candidates", run["paper_model"])
            self.assertEqual(run["source_management"]["mode"], "managed")
            self.assertTrue((root / "wiki/raw/sources/sources.jsonl").exists())

            review = (out / "review.md").read_text(encoding="utf-8")
            self.assertTrue(review.startswith("---\n"))
            self.assertIn("type: \"ingest_review\"", review)
            self.assertIn("model_strategy: \"heuristic_text_v3\"", review)
            self.assertIn("## Paper Identity", review)
            self.assertIn("## Figures / Tables / Equations Notes", review)
            self.assertIn("## Publish Proposal", review)
            self.assertIn("p. 3", review)
            self.assertNotIn("Agent task:", review)

            paper = (out / "paper.md").read_text(encoding="utf-8")
            self.assertTrue(paper.startswith("---\n"))
            self.assertIn("type: \"paper\"", paper)
            self.assertIn("model_strategy: \"heuristic_text_v3\"", paper)
            self.assertIn("## Paper Positioning", paper)
            self.assertIn("## When To Retrieve This Paper", paper)
            self.assertIn("Canonical retrieval fits:", paper)
            self.assertIn("Scope notes:", paper)
            self.assertIn("## Mechanism", paper)
            self.assertIn("## Candidate Records", paper)
            self.assertNotIn("Review packet: `review.md`", paper)
            self.assertNotIn("Full extraction and review details live", paper)
            self.assertNotIn("\nartifacts:\n", paper)
            self.assertNotIn("\nSource:\n", paper)
            self.assertNotIn("- Metadata title:", paper)
            self.assertNotIn("- Model strategy:", paper)
            self.assertNotIn("## Extracted Contribution Sentences", paper)
            self.assertNotIn("Agent task:", paper)

    def test_wiki_workspace_config_sets_active_source_and_wiki_roots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_home = root / "config"
            library = root / "paper-library"
            pdf = root / "uploaded.pdf"
            pdf.write_bytes(b"%PDF fake")

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["wiki", "init", "--library-root", str(library)]
                )
                self.assertEqual(exit_code, 0, stderr)
                self.assertIn("Initialized Paper Wiki workspace:", stdout)
                self.assertTrue((library / "meridian-wiki.json").exists())
                self.assertTrue((library / "sources/papers").is_dir())
                self.assertTrue((library / "wiki/papers").is_dir())
                self.assertTrue((config_home / "paper-wiki-workspaces.json").exists())

                exit_code, stdout, stderr = _run_cli_capture(
                    [
                        "wiki",
                        "ingest",
                        str(pdf),
                        "--publish-mode",
                        "auto",
                        "--no-page-images",
                    ]
                )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Managed source PDF:", stdout)
            self.assertIn(str(library / "sources" / "papers"), stdout)
            self.assertIn("Canonical wiki page:", stdout)
            registry = library / "sources" / "sources.jsonl"
            self.assertTrue(registry.exists())
            records = [json.loads(line) for line in registry.read_text(encoding="utf-8").splitlines() if line.strip()]
            self.assertEqual(len(records), 1)
            self.assertTrue(
                str(Path(records[0]["managed_path"]).resolve()).startswith(str((library / "sources" / "papers").resolve()))
            )
            out = library / "wiki/.drafts/ingests/uploaded"
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertEqual(
                Path(run["source_management"]["source_root"]).resolve(),
                (library / "sources").resolve(),
            )
            self.assertTrue(Path(run["canonical_artifacts"]["paper_page"]).is_file())

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["wiki", "source-audit", "--wiki-root", str(library / "wiki")]
                )
            self.assertEqual(exit_code, 0, stderr)
            self.assertIn(str((library / "sources" / "index.md").resolve()), stdout)
            self.assertTrue((library / "sources" / "index.md").exists())

    def test_wiki_status_reports_active_workspace_and_core(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_home = root / "config"
            library = root / "paper-library"
            status_json = root / "status.json"

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                self.assertEqual(main(["wiki", "init", "--library-root", str(library)]), 0)
                exit_code, stdout, stderr = _run_cli_capture(
                    ["wiki", "status", "--json-out", str(status_json)]
                )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Workspace status: configured", stdout)
            self.assertIn("Active wiki root:", stdout)
            self.assertIn("Managed source root:", stdout)
            payload = json.loads(status_json.read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "configured")
            self.assertEqual(Path(payload["wiki_root"]).resolve(), (library / "wiki").resolve())
            self.assertEqual(Path(payload["source_root"]).resolve(), (library / "sources").resolve())
            self.assertIn("repo-local PYTHONPATH=<repo>/src python3 -m meridian", payload["resolver_order"])

    def test_wiki_context_uses_active_workspace_and_private_tmp_default(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_home = root / "config"
            library = root / "paper-library"
            query = "MoE PTQ activation outlier probes test-031-context"
            expected_dir = Path("/private/tmp/meridian-context") / "MoE-PTQ-activation-outlier-probes-test-031-context"
            shutil.rmtree(expected_dir, ignore_errors=True)

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                self.assertEqual(main(["wiki", "init", "--library-root", str(library)]), 0)
                _write_test_paper(
                    library / "wiki/papers/MoE-PTQ.md",
                    title="MoE PTQ Paper",
                    aliases=["MoE PTQ"],
                    topics=["activation outliers"],
                    methods=["post-training quantization"],
                    settings=["weight-activation quantization"],
                    body_sections={
                        "What To Remember": "MoE PTQ handles activation outliers.",
                        "Implementation Hooks": "Run activation outlier smoothing probes.",
                    },
                )
                exit_code, stdout, stderr = _run_cli_capture(
                    ["wiki", "context", query, "--top-k", "2"]
                )

            try:
                self.assertEqual(exit_code, 0, stderr)
                self.assertIn("Use Wiki context: ready", stdout)
                self.assertIn(str(library / "wiki"), stdout)
                self.assertTrue((expected_dir / "context.md").exists())
                self.assertTrue((expected_dir / "context.json").exists())
                payload = json.loads((expected_dir / "context.json").read_text(encoding="utf-8"))
                self.assertEqual(payload["results"][0]["canonical_path"], "papers/MoE-PTQ.md")
                self.assertFalse(any(".drafts" in item["canonical_path"] for item in payload["results"]))
            finally:
                shutil.rmtree(expected_dir, ignore_errors=True)

    def test_wiki_context_requires_workspace_instead_of_guessing_local_wiki(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                exit_code, stdout, stderr = _run_cli_capture(["wiki", "context", "agent workflow goals"])

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout, "")
            self.assertIn("No Paper Wiki workspace is configured", stderr)

    def test_wiki_ingest_folder_handles_zotero_export_folder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_home = root / "config"
            library = root / "paper-library"
            zotero_export = root / "My Library"
            nested = zotero_export / "Collection"
            nested.mkdir(parents=True)
            (zotero_export / "paper-one.pdf").write_bytes(b"%PDF fake one")
            (nested / "paper-two.PDF").write_bytes(b"%PDF fake two")

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                self.assertEqual(main(["wiki", "init", "--library-root", str(library)]), 0)
                exit_code, stdout, stderr = _run_cli_capture(
                    [
                        "wiki",
                        "ingest-folder",
                        str(zotero_export),
                        "--publish-mode",
                        "never",
                    ]
                )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Source folder:", stdout)
            self.assertIn("PDFs discovered: 2", stdout)
            self.assertIn("Ingested successfully: 2", stdout)
            self.assertIn("Canonical pages published: 0", stdout)
            self.assertNotIn("review.md", stdout)

            batch_dir = library / "wiki/.drafts/ingests/batches/my-library"
            batch = json.loads((batch_dir / "batch.json").read_text(encoding="utf-8"))
            self.assertEqual(batch["source_kind"], "zotero_export_or_pdf_folder")
            self.assertEqual(batch["pdf_count"], 2)
            self.assertEqual(batch["success_count"], 2)
            self.assertEqual(batch["failure_count"], 0)
            self.assertEqual(batch["artifact_roles"]["managed_source_pdf"], "source_artifact")
            self.assertEqual(batch["artifact_roles"]["canonical_paper_page"], "user_facing_wiki_artifact")
            self.assertTrue((batch_dir / "batch.md").exists())
            self.assertTrue((batch_dir / "runs/paper-one/run.json").exists())
            self.assertTrue((batch_dir / "runs/paper-two/run.json").exists())

            registry = library / "sources" / "sources.jsonl"
            records = [json.loads(line) for line in registry.read_text(encoding="utf-8").splitlines() if line.strip()]
            self.assertEqual(len(records), 2)
            source_root = (library / "sources").resolve()
            self.assertTrue(all(str(Path(record["managed_path"]).resolve()).startswith(str(source_root)) for record in records))

    def test_wiki_ingest_folder_can_publish_single_pdf(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_home = root / "config"
            library = root / "paper-library"
            zotero_export = root / "My Library"
            zotero_export.mkdir()
            (zotero_export / "paper-one.pdf").write_bytes(b"%PDF fake one")

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                self.assertEqual(main(["wiki", "init", "--library-root", str(library)]), 0)
                exit_code, stdout, stderr = _run_cli_capture(
                    [
                        "wiki",
                        "ingest-folder",
                        str(zotero_export),
                        "--publish-mode",
                        "auto",
                    ]
                )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Canonical pages published: 1", stdout)
            batch = json.loads(
                (library / "wiki/.drafts/ingests/batches/my-library/batch.json").read_text(encoding="utf-8")
            )
            self.assertEqual(batch["product_summary"]["canonical_wiki_pages_published"], 1)
            self.assertTrue(Path(batch["results"][0]["canonical_paper_page"]).exists())

    def test_wiki_ingest_can_skip_page_images_for_batch_runs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"

            exit_code = main(["wiki", "ingest", str(pdf), "--out", str(out), "--no-page-images"])

            self.assertEqual(exit_code, 0)
            self.assertTrue((out / "extraction/pages.jsonl").exists())
            self.assertFalse((out / "extraction/page-images/page-0001.png").exists())
            pages = [
                json.loads(line)
                for line in (out / "extraction/pages.jsonl").read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual(len(pages), 3)
            self.assertEqual(pages[0]["image_path"], "")

            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertEqual(run["extraction_options"]["render_page_images"], False)
            self.assertEqual(run["draft_artifacts"]["paper_candidate"], str(out / "paper.md"))
            self.assertEqual(run["internal_artifacts"]["paper_candidate"], str(out / "paper.md"))
            self.assertEqual(run["debug_artifacts"]["review_packet"], str(out / "review.md"))
            self.assertEqual(run["retrieval_visibility"]["draft_candidate_indexed"], False)
            self.assertEqual(run["retrieval_visibility"]["retrieval_targets"], ["wiki/papers/*.md", "wiki/syntheses/*.md"])

            structural_path = root / "structural-self-check.json"
            self.assertEqual(
                main(["wiki", "structural-check", str(out / "run.json"), "--out", str(structural_path)]),
                0,
            )
            structural = json.loads(structural_path.read_text(encoding="utf-8"))
            dimensions = {item["dimension"]: item for item in structural["dimension_scores"]}
            self.assertNotIn("page_image_count_mismatch", " ".join(dimensions["extraction_consistency"]["findings"]))

            claim_lines = (out / "claims.jsonl").read_text(encoding="utf-8").splitlines()
            method_lines = (out / "methods.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertNotIn("needs_agent_fill", "\n".join(claim_lines + method_lines))

            evidence_lines = (out / "evidence.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(evidence_lines), 3)
            first_evidence = json.loads(evidence_lines[0])
            self.assertEqual(first_evidence["id"], "evidence-p0001")
            self.assertEqual(first_evidence["extraction_strategy"], "heuristic_text_v3")

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
            self.assertIn("## When To Retrieve This Paper", paper)
            self.assertIn("Canonical retrieval fits:", paper)
            self.assertIn("Scope notes:", paper)
            self.assertIn('Query: "I want to compare or adapt MoE post-training quantization', paper)
            self.assertIn('Query: "I am implementing or modifying MoE post-training quantization', paper)
            self.assertIn("component contracts around AOS, ACCF, POG, and LUT", paper)
            self.assertNotIn("I am implementing probes or ablations around AOS, ACCF, POG, LUT", paper)
            self.assertNotIn("whether the mechanism is supported by experiments", paper)
            self.assertNotIn("whether this paper is strong enough support", paper)
            self.assertIn("Use because:", paper)
            self.assertIn("Primary fit:", paper)
            self.assertIn("Adjacent fit:", paper)
            self.assertIn("Weak fit:", paper)
            self.assertNotIn("## Retrieval Notes", paper)
            self.assertNotIn("Do not use it when:", paper)
            self.assertNotIn("\nSource:\n", paper)
            self.assertNotIn("- Metadata title:", paper)
            self.assertNotIn("- Model strategy:", paper)
            frontmatter = paper.split("---", 2)[1]
            methods_frontmatter = frontmatter.split("methods:", 1)[1].split("settings:", 1)[0]
            self.assertIn("post-training quantization", methods_frontmatter)
            self.assertIn("MoE quantization", methods_frontmatter)
            self.assertNotIn("Activation-Oriented Outlier Smoothing", methods_frontmatter)
            self.assertIn("settings:", frontmatter)
            self.assertIn("weight-activation quantization", frontmatter)
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
            self.assertIn("product_artifacts", run)
            self.assertIn("internal_artifacts", run)
            self.assertIn("debug_artifacts", run)
            self.assertIn("retrieval_visibility", run)

            canonical = Path(run["canonical_artifacts"]["paper_page"])
            self.assertTrue(canonical.exists())
            self.assertEqual(run["product_artifacts"]["canonical_paper_page"], str(canonical))
            self.assertEqual(run["internal_artifacts"]["paper_candidate"], str(out / "paper.md"))
            self.assertEqual(run["debug_artifacts"]["review_packet"], str(out / "review.md"))
            self.assertEqual(run["retrieval_visibility"]["canonical_page"], str(canonical))
            self.assertTrue(run["retrieval_visibility"]["canonical_corpus_only"])
            canonical_text = canonical.read_text(encoding="utf-8")
            self.assertIn("review_state: \"needs_review\"", canonical_text)
            self.assertIn("quality_gate: \"warn\"", canonical_text)
            self.assertNotIn("Review packet: `review.md`", canonical_text)
            self.assertNotIn("Full extraction and review details live", canonical_text)
            self.assertNotIn("\nartifacts:\n", canonical_text)

            index = (wiki_root / "index.md").read_text(encoding="utf-8")
            log = (wiki_root / "log.md").read_text(encoding="utf-8")
            self.assertIn("[[papers/Fake-Research-Paper|Fake Research Paper]]", index)
            self.assertIn("## [", log)
            self.assertIn("Quality gate: `warn`", log)
            self.assertTrue((wiki_root / ".drafts/retrieval").is_dir())
            self.assertTrue((wiki_root / "templates/paper.md").exists())

    def test_wiki_ingest_auto_commits_scoped_generated_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = root / "repo"
            source_dir = root / "source"
            repo.mkdir()
            source_dir.mkdir()
            subprocess.run(["git", "init"], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Meridian Test"], cwd=repo, check=True)
            wiki_root = repo / "wiki"
            pdf = source_dir / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = wiki_root / ".drafts/ingests/fake-paper"

            exit_code, stdout, stderr = _run_cli_capture(
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

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Git auto-commit:", stdout)
            log = subprocess.run(
                ["git", "log", "-1", "--pretty=%s"],
                cwd=repo,
                check=True,
                text=True,
                stdout=subprocess.PIPE,
            ).stdout.strip()
            self.assertEqual(log, "wiki: ingest Fake Research Paper")
            status = subprocess.run(
                ["git", "status", "--porcelain", "--untracked-files=all"],
                cwd=repo,
                check=True,
                text=True,
                stdout=subprocess.PIPE,
            ).stdout.strip()
            self.assertEqual(status, "")
            committed_files = subprocess.run(
                ["git", "show", "--name-only", "--pretty=", "HEAD"],
                cwd=repo,
                check=True,
                text=True,
                stdout=subprocess.PIPE,
            ).stdout
            self.assertIn("wiki/papers/Fake-Research-Paper.md", committed_files)
            self.assertIn("wiki/.drafts/ingests/fake-paper/run.json", committed_files)
            self.assertIn("wiki/.index/papers.jsonl", committed_files)

    def test_wiki_ingest_default_output_is_product_oriented(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = wiki_root / ".drafts/ingests/fake-paper"

            exit_code, stdout, stderr = _run_cli_capture(
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

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Managed source PDF:", stdout)
            self.assertIn("Canonical wiki page:", stdout)
            self.assertIn("Quality gate:", stdout)
            self.assertIn("Internal artifact root:", stdout)
            self.assertNotIn("review.md", stdout)
            self.assertNotIn("judge-packet.md", stdout)
            self.assertNotIn("reader-check.md", stdout)
            self.assertNotIn("quality-self-check.json", stdout)
            self.assertNotIn("Wrote draft paper page", stdout)

            verbose_out = wiki_root / ".drafts/ingests/fake-paper-verbose"
            exit_code, verbose_stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "ingest",
                    str(pdf),
                    "--out",
                    str(verbose_out),
                    "--wiki-root",
                    str(wiki_root),
                    "--publish-mode",
                    "auto",
                    "--overwrite",
                    "--verbose-artifacts",
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Debug artifacts:", verbose_stdout)
            self.assertIn("review.md", verbose_stdout)
            self.assertIn("paper_candidate", verbose_stdout)

    def test_wiki_health_writes_json_markdown_html_and_repair_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            (wiki_root / "papers").mkdir(exist_ok=True)
            (wiki_root / "papers/Isolated-Paper.md").write_text(
                """---
type: "paper"
title: "Isolated Paper"
status: "draft"
review_state: "needs_review"
quality_state: "multimodal_pending"
---
# Isolated Paper
""",
                encoding="utf-8",
            )

            exit_code, stdout, stderr = _run_cli_capture(
                ["wiki", "health", "--wiki-root", str(wiki_root), "--repair-plan"]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Wrote wiki health JSON:", stdout)
            self.assertIn("Wiki health:", stdout)
            health = json.loads((wiki_root / ".index/wiki-health.json").read_text(encoding="utf-8"))
            self.assertEqual(health["schema_version"], "meridian.wiki_health.v0")
            self.assertEqual(health["health_model_version"], "0.2.0")
            self.assertEqual([item["name"] for item in health["dimensions"]], ["Trust", "Surface", "Context", "Graph", "Growth"])
            self.assertTrue(all(item["subdimensions"] for item in health["dimensions"]))
            html = (wiki_root / ".index/wiki-health.html").read_text(encoding="utf-8")
            self.assertIn("<details class=\"dimension\">", html)
            self.assertIn("What Needs Attention", html)
            self.assertIn("id=\"run-health\"", html)
            self.assertIn("health-ui --wiki-root wiki", html)
            report = (wiki_root / ".index/wiki-health.md").read_text(encoding="utf-8")
            self.assertIn("## Health Dimensions", report)
            self.assertTrue(list((wiki_root / ".drafts/health").glob("*/repair-plan.md")))

    def test_wiki_health_ui_controller_blocks_duplicate_runs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wiki_root = Path(tmp) / "wiki"
            wiki_root.mkdir(parents=True)
            started = threading.Event()
            release = threading.Event()

            def fake_health(**kwargs):  # noqa: ANN001
                root = kwargs["wiki_root"]
                report = root / ".index/wiki-health.json"
                html = root / ".index/wiki-health.html"
                report.parent.mkdir(parents=True, exist_ok=True)
                started.set()
                release.wait(timeout=2)
                report.write_text(
                    json.dumps(
                        {
                            "health_level": "usable",
                            "overall_score": 90,
                            "main_insight": "ok",
                        }
                    ),
                    encoding="utf-8",
                )
                html.write_text("<html></html>", encoding="utf-8")
                return types.SimpleNamespace(report_path=report, html_path=html, repair_plan_path=None)

            controller = HealthRunController(wiki_root=wiki_root, health_function=fake_health)
            first: list[tuple[int, dict[str, object]]] = []
            thread = threading.Thread(target=lambda: first.append(controller.run_once()))
            thread.start()
            self.assertTrue(started.wait(timeout=2))

            duplicate_status, duplicate_payload = controller.run_once()
            self.assertEqual(duplicate_status, 409)
            self.assertEqual(duplicate_payload["state"], "running")

            release.set()
            thread.join(timeout=2)
            self.assertEqual(first[0][0], 200)
            self.assertEqual(first[0][1]["overall_score"], 90)

    def test_mcp_audit_returns_health_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)

            payload = mcp_adapter.audit(wiki_root=wiki_root, scope="summary")

            self.assertEqual(payload["tool"], "meridian.audit")
            self.assertIn("health_level", payload)
            self.assertIn("overall_score", payload)
            self.assertIn("health_json", payload["reports"])
            self.assertTrue(Path(payload["reports"]["health_json"]).exists())

    def test_wiki_flow_default_output_hides_validation_debug_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            rubric = root / "rubric.md"
            pdf.write_bytes(b"%PDF fake")
            rubric.write_text("# Rubric\n", encoding="utf-8")
            out = wiki_root / ".drafts/ingests/fake-flow"

            exit_code, stdout, stderr = _run_cli_capture(
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

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Managed source PDF:", stdout)
            self.assertIn("Canonical wiki page:", stdout)
            self.assertIn("Quality gate:", stdout)
            self.assertIn("Review state:", stdout)
            self.assertIn("Internal artifact root:", stdout)
            self.assertIn("Flow status:", stdout)
            self.assertNotIn("judge-packet.md", stdout)
            self.assertNotIn("reader-check.md", stdout)
            self.assertNotIn("quality-self-check.json", stdout)
            self.assertNotIn("structural-self-check.json", stdout)
            self.assertNotIn("review.md", stdout)

            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertIn("validation_artifacts", flow)
            self.assertIn("validation_artifacts", run)
            self.assertEqual(flow["product_artifacts"]["canonical_paper_page"], run["product_artifacts"]["canonical_paper_page"])

            verbose_out = wiki_root / ".drafts/ingests/fake-flow-verbose"
            exit_code, verbose_stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "flow",
                    str(pdf),
                    "--out",
                    str(verbose_out),
                    "--wiki-root",
                    str(wiki_root),
                    "--rubric",
                    str(rubric),
                    "--overwrite",
                    "--verbose-artifacts",
                ]
            )
            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Validation artifacts:", verbose_stdout)
            self.assertIn("judge-packet.md", verbose_stdout)
            self.assertIn("reader-check.md", verbose_stdout)

    def test_wiki_catalog_indexes_canonical_paper_frontmatter(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = wiki_root / ".drafts/ingests/fake-paper"

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
            self.assertEqual(main(["wiki", "catalog", "--wiki-root", str(wiki_root)]), 0)

            catalog = wiki_root / ".index/papers.jsonl"
            self.assertTrue(catalog.exists())
            records = [json.loads(line) for line in catalog.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["schema_version"], "meridian.paper_catalog.v0")
            self.assertEqual(records[0]["page_id"], "papers/Fake-Research-Paper")
            self.assertEqual(records[0]["path"], "papers/Fake-Research-Paper.md")
            self.assertEqual(records[0]["routing"]["methods"][0], "paper-specific research method")
            self.assertIn("What To Remember", records[0]["section_previews"])

    def test_wiki_init_creates_obsidian_compatible_vault_scaffold(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wiki_root = Path(tmp) / "wiki"

            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)

            for relative in (
                "papers",
                "claims",
                "methods",
                "evidence",
                "topics",
                "concepts",
                "syntheses",
                "templates",
                "raw/sources/papers",
                ".drafts/retrieval",
                ".index",
            ):
                self.assertTrue((wiki_root / relative).exists(), relative)
            self.assertTrue((wiki_root / "index.md").exists())
            self.assertTrue((wiki_root / "log.md").exists())
            self.assertIn('type: "paper"', (wiki_root / "templates/paper.md").read_text(encoding="utf-8"))

    def test_project_has_wiki_retrieval_skill(self) -> None:
        skill = Path(".codex/skills/wiki-retrieve/SKILL.md")
        self.assertTrue(skill.exists())
        text = skill.read_text(encoding="utf-8")
        self.assertIn("meridian wiki retrieve", text)
        self.assertIn("obsidian search", text)
        self.assertIn("Implementation Hooks", text)

    def test_product_wiki_skill_uses_reliable_context_entry(self) -> None:
        skill = Path(".codex/skills/wiki/SKILL.md")
        self.assertTrue(skill.exists())
        text = skill.read_text(encoding="utf-8")
        self.assertIn("meridian wiki context", text)
        self.assertIn("meridian wiki status", text)
        self.assertIn("/private/tmp/meridian-context", text)
        self.assertIn("MERIDIAN_CORE_ROOT", text)
        self.assertIn("do not start with broad `rg`", text)

    def test_meridian_setup_skill_exists(self) -> None:
        skill = Path(".codex/skills/meridian/SKILL.md")
        self.assertTrue(skill.exists())
        text = skill.read_text(encoding="utf-8")
        self.assertIn("Entry Boundary", text)
        self.assertIn("Status Check", text)
        self.assertIn("Initialize", text)
        self.assertIn("Migration Check", text)
        self.assertIn("python3 -m meridian wiki status", text)
        self.assertIn("meridian-wiki.json", text)
        self.assertIn("needs_migration", text)
        self.assertIn("plugin cache/manifest", text)
        self.assertIn("workspace schema", text)
        self.assertIn("delegate those to wiki and lab", text)

    def test_meridian_product_skill_behavior_boundaries(self) -> None:
        meridian = Path(".codex/skills/meridian/SKILL.md").read_text(encoding="utf-8")
        wiki = Path(".codex/skills/wiki/SKILL.md").read_text(encoding="utf-8")
        lab = Path(".codex/skills/lab/SKILL.md").read_text(encoding="utf-8")
        readme = Path("README.md").read_text(encoding="utf-8")

        self.assertIn("Entry Boundary", meridian)
        self.assertIn("If the user asks to ingest, retrieve, answer from papers", meridian)
        self.assertIn("Do not continue the normal work inside this setup skill", meridian)

        self.assertIn("Behavior Priority", wiki)
        self.assertIn("Start from the user's intent, not from CLI discovery", wiki)
        self.assertIn("do not present raw command lists", wiki)
        self.assertIn("product answer", wiki)
        self.assertIn("Agent execution resolver", wiki)
        self.assertNotIn("MCP server entry:", wiki)

        self.assertIn("Behavior Priority", lab)
        self.assertIn("Lab is a research copilot, not a setup assistant", lab)
        self.assertIn("Do the user's coding/debug/experiment task", lab)
        self.assertIn("Keep Research Dev local until a finding proposal is `ready`", lab)

        self.assertIn("| `meridian` | setup, status checks, updates, and migrations |", readme)
        self.assertIn("| `wiki` | Paper Wiki Update Wiki and Use Wiki workflows |", readme)
        self.assertIn("| `lab` | research coding, idea placement, experiments, and local findings |", readme)
        self.assertIn("Support skills", readme)

    def test_meridian_plugin_skill_copies_match_repo_skills(self) -> None:
        for skill_name in ["meridian", "wiki", "lab"]:
            repo = Path(f".codex/skills/{skill_name}/SKILL.md").read_text(encoding="utf-8")
            codex = Path(f"plugins/codex/meridian/skills/{skill_name}/SKILL.md").read_text(encoding="utf-8")
            claude = Path(f"plugins/claude-code/meridian/skills/{skill_name}/SKILL.md").read_text(encoding="utf-8")
            self.assertEqual(codex, repo, skill_name)
            self.assertEqual(claude, repo, skill_name)

    def test_meridian_skill_behavior_eval_assets_parse(self) -> None:
        cases = Path("eval/cases/meridian_skill_behavior_quality.jsonl")
        parsed = [json.loads(line) for line in cases.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreaterEqual(len(parsed), 8)
        self.assertTrue(all(case.get("category") == "meridian_skill_behavior_quality" for case in parsed))
        self.assertTrue(all("expected_skill" in case and "expected_result" in case for case in parsed))
        self.assertTrue(any(case["expected_skill"] == "meridian" for case in parsed))
        self.assertTrue(any(case["expected_skill"] == "wiki" for case in parsed))
        self.assertTrue(any(case["expected_skill"] == "lab" for case in parsed))
        self.assertTrue(any("debug" in " ".join(case.get("must_not_do", [])) for case in parsed))

        rubric = Path("eval/rubrics/meridian_skill_behavior_quality.md").read_text(encoding="utf-8")
        self.assertIn("Entry Selection", rubric)
        self.assertIn("Workspace And Retrieval Discipline", rubric)
        self.assertIn("Artifact Boundary", rubric)
        self.assertIn("Lab Research Copilot Behavior", rubric)
        self.assertIn("Hard Fail Rules", rubric)
        self.assertIn("command_sprawl", rubric)

    def test_product_skills_route_health_findings(self) -> None:
        wiki = Path(".codex/skills/wiki/SKILL.md").read_text(encoding="utf-8")
        retrieve = Path(".codex/skills/wiki-retrieve/SKILL.md").read_text(encoding="utf-8")
        knowledge = Path(".codex/skills/wiki-knowledge/SKILL.md").read_text(encoding="utf-8")
        concept = Path(".codex/skills/wiki-concept/SKILL.md").read_text(encoding="utf-8")
        lab = Path(".codex/skills/lab/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("Health / Repair Triage", wiki)
        self.assertIn("knowledge_graph", wiki)
        self.assertIn("concept_coverage", wiki)
        self.assertIn("Run Meridian context first", retrieve)
        self.assertIn("Health-Driven Repair Routing", knowledge)
        self.assertIn("propose-method-consolidation", knowledge)
        self.assertIn("Health-Driven Concept Coverage", concept)
        self.assertIn("Wiki Health Signals", lab)

    def test_publish_run_promotes_candidate_records_into_wiki_graph(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake_fitz = sys.modules["fitz"]
            fake_fitz.open = lambda path: CodeQuantLikeDocument()
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "codequant.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = wiki_root / ".drafts/ingests/codequant"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(
                main(["wiki", "publish-run", str(out / "run.json"), "--wiki-root", str(wiki_root)]),
                0,
            )

            canonical = wiki_root / "papers/CodeQuant-Unified-Clustering-and-Quantization.md"
            self.assertTrue(canonical.exists())
            self.assertGreaterEqual(len(list((wiki_root / "methods").glob("*.md"))), 4)
            self.assertTrue((wiki_root / "methods/CodeQuant-Unified-Clustering-and-Quantization-method-001.md").exists())
            self.assertGreaterEqual(len(list((wiki_root / "claims").glob("*.md"))), 4)
            self.assertGreaterEqual(len(list((wiki_root / "evidence").glob("*.md"))), 4)
            self.assertTrue((wiki_root / "topics/activation-outliers.md").exists())
            canonical_text = canonical.read_text(encoding="utf-8")
            self.assertIn("## Wiki Graph Links", canonical_text)
            self.assertIn("[[topics/activation-outliers|activation outliers]]", canonical_text)
            self.assertIn("[[methods/CodeQuant-Unified-Clustering-and-Quantization-method-001|", canonical_text)
            self.assertTrue((wiki_root / ".index/papers.jsonl").exists())
            index = (wiki_root / "index.md").read_text(encoding="utf-8")
            self.assertIn("[[papers/CodeQuant-Unified-Clustering-and-Quantization|CodeQuant", index)
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertIn("promotion", run)
            self.assertEqual(len(run["promotion"]["methods"]), 4)

    def test_evidence_promotion_is_capped_for_large_documents(self) -> None:
        records = [
            {"id": f"evidence-{index:04d}", "page": index, "supports": []}
            for index in range(1, 40)
        ]
        records.append({"id": "supported", "page": 35, "supports": ["claim-001"]})

        selected = _records_for_promotion(records, type_name="evidence", max_records=12)

        self.assertEqual(len(selected), 12)
        self.assertIn("supported", {record["id"] for record in selected})

    def test_source_audit_and_lint_report_wiki_management_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = wiki_root / ".drafts/ingests/fake-paper"

            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            self.assertEqual(main(["wiki", "source-audit", "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(main(["wiki", "lint", "--wiki-root", str(wiki_root)]), 0)

            audit = json.loads((wiki_root / ".index/source-audit.json").read_text(encoding="utf-8"))
            lint = json.loads((wiki_root / ".index/wiki-lint.json").read_text(encoding="utf-8"))
            self.assertEqual(audit["total"], 1)
            self.assertEqual(audit["missing_managed"], 0)
            self.assertTrue((wiki_root / "raw/sources/index.md").exists())
            self.assertIn(lint["status"], {"pass", "warn"})

    def test_publish_run_registers_unmanaged_source_before_canonical_write(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            draft = root / "draft"
            draft.mkdir()
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            (draft / "paper.md").write_text(
                """---
type: "paper"
title: "Old Draft"
status: "draft"
sources:
  - "/tmp/random.pdf"
topics:
  - "activation outliers"
methods:
  - "post-training quantization"
settings:
  - "weight-only quantization"
claims: []
confidence: "low"
review_state: "needs_review"
---
# Old Draft

## What To Remember

This draft came from an unmanaged source.
""",
                encoding="utf-8",
            )
            for name in ("claims.jsonl", "methods.jsonl", "evidence.jsonl"):
                (draft / name).write_text("", encoding="utf-8")
            run = {
                "schema_version": "paper_wiki_ingest.v0",
                "created_at": "2026-05-19T00:00:00+00:00",
                "source_pdf": str(pdf),
                "title": "Old Draft",
                "draft_artifacts": {
                    "paper_page": str(draft / "paper.md"),
                    "claims": str(draft / "claims.jsonl"),
                    "methods": str(draft / "methods.jsonl"),
                    "evidence": str(draft / "evidence.jsonl"),
                },
                "quality_gate": {"decision": "warn", "review_state": "needs_review", "confidence": "low", "errors": [], "warnings": []},
            }
            (draft / "run.json").write_text(json.dumps(run), encoding="utf-8")

            self.assertEqual(
                main(["wiki", "publish-run", str(draft / "run.json"), "--wiki-root", str(wiki_root)]),
                0,
            )

            canonical = wiki_root / "papers/Old-Draft.md"
            text = canonical.read_text(encoding="utf-8")
            updated_run = json.loads((draft / "run.json").read_text(encoding="utf-8"))
            self.assertIn('source_id: "paper-pdf-', text)
            self.assertIn("raw/sources/papers", text)
            self.assertEqual(updated_run["source_management"]["mode"], "managed")
            self.assertTrue((wiki_root / "raw/sources/sources.jsonl").exists())

    def test_publish_run_uses_deterministic_convergence_review_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            draft = root / "draft"
            draft.mkdir()
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            (draft / "paper.md").write_text(
                """---
type: "paper"
title: "Converged Draft"
status: "draft"
topics:
  - "agent workflow"
methods:
  - "workflow orchestration"
settings: []
claims: []
confidence: "low"
review_state: "needs_review"
---
# Converged Draft

## What To Remember

This draft has deterministic convergence evidence.
""",
                encoding="utf-8",
            )
            for name in ("claims.jsonl", "methods.jsonl", "evidence.jsonl"):
                (draft / name).write_text("", encoding="utf-8")
            run = {
                "schema_version": "paper_wiki_ingest.v0",
                "created_at": "2026-05-20T00:00:00+00:00",
                "source_pdf": str(pdf),
                "title": "Converged Draft",
                "draft_artifacts": {
                    "paper_page": str(draft / "paper.md"),
                    "claims": str(draft / "claims.jsonl"),
                    "methods": str(draft / "methods.jsonl"),
                    "evidence": str(draft / "evidence.jsonl"),
                },
                "quality_gate": {
                    "decision": "warn",
                    "review_state": "needs_review",
                    "confidence": "low",
                    "errors": [],
                    "warnings": ["evidence_missing_page_image:evidence-p0001"],
                },
                "deterministic_convergence": {
                    "review_state": "auto_converged",
                    "convergence_state": "deterministic_text_converged",
                },
            }
            (draft / "run.json").write_text(json.dumps(run), encoding="utf-8")

            self.assertEqual(
                main(["wiki", "publish-run", str(draft / "run.json"), "--wiki-root", str(wiki_root)]),
                0,
            )

            text = (wiki_root / "papers/Converged-Draft.md").read_text(encoding="utf-8")
            self.assertEqual(text.count('review_state: "auto_converged"'), 1)
            self.assertNotIn('review_state: "needs_review"', text)
            self.assertIn('convergence_state: "deterministic_text_converged"', text)

    def test_wiki_retrieve_outputs_context_packet_from_frontmatter_and_sections(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            (papers / "MoE-PTQ.md").write_text(
                """---
type: "paper"
title: "MoE PTQ Paper"
status: "draft"
aliases:
  - "CodeQuant"
topics:
  - "activation outliers"
  - "quantization error"
methods:
  - "MoE post-training quantization"
settings:
  - "weight-activation quantization"
datasets:
  - "WikiText2"
metrics:
  - "perplexity"
claims:
  - "claim-001"
confidence: "medium"
review_state: "auto_converged"
quality_gate: "pass"
---
# MoE PTQ Paper

## What To Remember

This page explains a MoE post-training quantization design for activation outliers and quantization error.

## Mechanism

The method smooths activation outliers, clusters weights, and keeps component contracts testable.

## Implementation Hooks

- Add ablations for activation outlier smoothing and weight clustering.
""",
                encoding="utf-8",
            )
            (papers / "Alignment.md").write_text(
                """---
type: "paper"
title: "Alignment Paper"
status: "draft"
aliases:
  - "DPO"
topics:
  - "preference optimization"
methods:
  - "direct preference optimization"
settings:
  - "RLHF setting"
datasets: []
metrics: []
claims: []
confidence: "medium"
review_state: "auto_converged"
quality_gate: "pass"
---
# Alignment Paper

## What To Remember

This page explains preference optimization for alignment.
""",
                encoding="utf-8",
            )
            packet = root / "context.md"
            result_json = root / "context.json"

            self.assertEqual(main(["wiki", "catalog", "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieve",
                        "I need MoE post-training quantization papers for activation outlier ablations",
                        "--wiki-root",
                        str(wiki_root),
                        "--top-k",
                        "2",
                        "--out",
                        str(packet),
                        "--json-out",
                        str(result_json),
                    ]
                ),
                0,
            )

            text = packet.read_text(encoding="utf-8")
            payload = json.loads(result_json.read_text(encoding="utf-8"))
            self.assertIn("Retrieval Context Packet", text)
            self.assertIn("MoE PTQ Paper", text)
            self.assertIn("frontmatter methods", text)
            self.assertIn("Implementation Hooks", text)
            self.assertEqual(payload["schema_version"], "meridian.retrieval_context.v0")
            self.assertEqual(payload["results"][0]["title"], "MoE PTQ Paper")
            self.assertIn("methods", payload["results"][0]["matched_frontmatter"])
            self.assertEqual(payload["results"][0]["canonical_path"], "papers/MoE-PTQ.md")
            self.assertIn("Canonical path: `papers/MoE-PTQ.md`", text)

    def test_wiki_retrieve_normalizes_bad_catalog_paths_and_warns(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            _write_test_paper(
                wiki_root / "papers/MoE-PTQ.md",
                title="MoE PTQ Paper",
                aliases=["MoE PTQ"],
                topics=["activation outliers"],
                methods=["post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "MoE PTQ handles activation outliers.",
                    "Implementation Hooks": "Probe activation outlier smoothing and clustering.",
                },
            )
            self.assertEqual(main(["wiki", "catalog", "--wiki-root", str(wiki_root)]), 0)
            record = json.loads((wiki_root / ".index/papers.jsonl").read_text(encoding="utf-8").splitlines()[0])
            record["relative_path"] = "wiki/papers/MoE-PTQ.md"
            record["path"] = str(wiki_root / "wiki/papers/MoE-PTQ.md")
            bad_record = dict(record)
            bad_record["title"] = "Broken Catalog Record"
            bad_record["relative_path"] = "papers/Missing.md"
            bad_record["path"] = str(wiki_root / "wiki/papers/Missing.md")
            draft_record = dict(record)
            draft_record["title"] = "Draft Leakage Record"
            draft_record["relative_path"] = ".drafts/ingests/noisy/paper.md"
            draft_record["path"] = str(wiki_root / ".drafts/ingests/noisy/paper.md")
            bad_catalog = root / "bad-catalog.jsonl"
            bad_catalog.write_text(
                "\n".join(json.dumps(item) for item in (record, bad_record, draft_record)) + "\n",
                encoding="utf-8",
            )
            packet = root / "context.md"
            result_json = root / "context.json"

            exit_code, stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "retrieve",
                    "activation outlier MoE PTQ implementation probes",
                    "--wiki-root",
                    str(wiki_root),
                    "--catalog",
                    str(bad_catalog),
                    "--out",
                    str(packet),
                    "--json-out",
                    str(result_json),
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Retrieved wiki pages: 1", stdout)
            self.assertIn("Retrieval warnings:", stdout)
            text = packet.read_text(encoding="utf-8")
            payload = json.loads(result_json.read_text(encoding="utf-8"))
            self.assertIn("## Retrieval Warnings", text)
            self.assertIn("normalized catalog path", "\n".join(payload["warnings"]))
            self.assertIn("skipped unreadable catalog record", "\n".join(payload["warnings"]))
            self.assertEqual(payload["results"][0]["canonical_path"], "papers/MoE-PTQ.md")
            self.assertFalse(any(".drafts" in str(item.get("canonical_path")) for item in payload["results"]))

    def test_wiki_retrieve_no_results_has_failure_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            _write_test_paper(
                wiki_root / "papers/MoE-PTQ.md",
                title="MoE PTQ Paper",
                aliases=[],
                topics=["activation outliers"],
                methods=["post-training quantization"],
                settings=[],
                body_sections={"What To Remember": "MoE PTQ handles activation outliers."},
            )
            packet = root / "context.md"
            result_json = root / "context.json"

            exit_code, stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "retrieve",
                    "zzzzzz no matching token qqqqqq",
                    "--wiki-root",
                    str(wiki_root),
                    "--out",
                    str(packet),
                    "--json-out",
                    str(result_json),
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Retrieved wiki pages: 0", stdout)
            self.assertIn("Failure report:", stdout)
            self.assertIn("## Failure Report", packet.read_text(encoding="utf-8"))
            self.assertEqual(json.loads(result_json.read_text(encoding="utf-8"))["results"], [])

    def test_wiki_retrieve_exposes_trace_fields_for_evaluator(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            (wiki_root / "papers").mkdir(parents=True)
            _write_test_paper(
                wiki_root / "papers/PINN.md",
                title="PINN Paper",
                aliases=["PINN"],
                topics=["scientific ML"],
                methods=["PDE-constrained learning"],
                settings=["physics-informed PDE setting"],
                body_sections={"What To Remember": "PINN uses PDE residual and boundary conditions."},
            )
            _write_knowledge_page(
                wiki_root / "concepts/PDE-Residual.md",
                page_type="concept",
                title="PDE Residual",
                source_papers=["papers/PINN.md"],
                body="\n".join(
                    [
                        "## What It Is",
                        "A residual of the governing differential equation.",
                        "## Implementation Implications",
                        "Keep residual, boundary, and data loss terms separately logged.",
                        "## Common Failure Modes",
                        "Incorrect autodiff variables can make the residual meaningless.",
                        "## Minimal Checks / Probes",
                        "Run a manufactured-solution residual check.",
                        "## Evidence / Provenance",
                        "Source paper: PINN Paper.",
                    ]
                ),
            )
            (wiki_root / "claims").mkdir(parents=True)
            (wiki_root / "claims/PINN-Claim.md").write_text(
                """---
type: "claim"
title: "PINN residual must be traced to boundary-condition evidence."
status: "draft"
sources:
  - "papers/PINN.md"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "claim-001"
---
# PINN residual must be traced to boundary-condition evidence.

- Source paper: [[papers/PINN|PINN Paper]]
- Claim: PINN residual must be traced to boundary-condition evidence.
- Claim type: source_claim
- Evidence IDs: evidence-p0001
- Provenance: p. 2
""",
                encoding="utf-8",
            )

            result = retrieve_papers(
                query="I want to implement a PINN baseline; retrieve PDE residual concepts, implementation checks, failure modes, claim evidence, and provenance.",
                wiki_root=wiki_root,
                top_k=4,
                strategy="v1",
            )

            concept = next(item for item in result.results if item["result_type"] == "concept")
            claim = next(item for item in result.results if item["result_type"] == "claim")
            self.assertEqual(concept["sources"], ["papers/PINN.md"])
            self.assertIn("Evidence / Provenance", concept["section_headings"])
            concept_sections = {section["heading"] for section in concept["matched_sections"]}
            self.assertTrue(
                {"Implementation Implications", "Common Failure Modes", "Minimal Checks / Probes", "Evidence / Provenance"}
                <= concept_sections
            )
            self.assertEqual(claim["sources"], ["papers/PINN.md"])
            claim_sections = {section["heading"] for section in claim["matched_sections"]}
            self.assertTrue({"Claim", "Supporting Evidence", "Provenance"} <= claim_sections)

    def test_wiki_retrieve_ignores_draft_ingest_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            drafts = wiki_root / ".drafts/ingests/noisy-run"
            papers.mkdir(parents=True)
            drafts.mkdir(parents=True)
            (drafts / "paper.md").write_text(
                """---
type: "paper"
title: "Draft Only Secret Mechanism"
aliases:
  - "DraftOnlySecret"
topics:
  - "hidden unique zeta"
methods:
  - "secret candidate method"
---
# Draft Only Secret Mechanism

## What To Remember

This hidden unique zeta candidate should never enter retrieval.
""",
                encoding="utf-8",
            )
            _write_test_paper(
                papers / "Canonical-Target.md",
                title="Canonical Target",
                aliases=["CanonicalTarget"],
                topics=["canonical retrieval boundary"],
                methods=["canonical method"],
                settings=["paper wiki"],
                body_sections={
                    "What To Remember": "The canonical page is the retrieval target.",
                    "Mechanism": "Draft ingest candidates are internal and excluded from catalog.",
                },
            )

            self.assertEqual(main(["wiki", "catalog", "--wiki-root", str(wiki_root)]), 0)
            draft_only = retrieve_papers(
                query="DraftOnlySecret hidden unique zeta",
                wiki_root=wiki_root,
                top_k=5,
            )
            self.assertEqual(draft_only.results, [])

            canonical = retrieve_papers(
                query="canonical retrieval boundary",
                wiki_root=wiki_root,
                top_k=5,
            )
            self.assertEqual(canonical.results[0]["canonical_path"], "papers/Canonical-Target.md")
            self.assertFalse(
                any(str(item.get("relative_path") or "").startswith(".drafts/") for item in canonical.results)
            )

    def test_mcp_adapter_context_read_trace_and_propose_use_canonical_corpus(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            concepts = wiki_root / "concepts"
            papers.mkdir(parents=True)
            concepts.mkdir(parents=True)
            _write_test_paper(
                papers / "MoE-PTQ.md",
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers", "quantization error"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "This paper studies MoE PTQ.",
                    "Mechanism": "The method smooths activation outliers and tracks quantization error.",
                    "Evidence Map": "Table 1 supports the outlier smoothing claim.",
                    "Implementation Hooks": "Probe activation outlier smoothing before changing quantization kernels.",
                },
            )
            (concepts / "Activation-outliers.md").write_text(
                """---
type: "concept"
title: "Activation outliers"
status: "active"
aliases:
  - "LLM activation outliers"
source_papers:
  - "papers/MoE-PTQ.md"
related_methods:
  - "MoE post-training quantization"
prerequisite_for:
  - "MoE post-training quantization"
confidence: "medium"
review_state: "auto_converged"
---
# Activation outliers

## What It Is

Activation outliers are high-magnitude activation features that stress low-bit quantization.

## Implementation Implications

Check activation magnitude distributions before choosing calibration and smoothing.

## Minimal Checks / Probes

Plot per-channel activation maxima and run an ablation without smoothing.

## Evidence / Provenance

- Source paper: [[papers/MoE-PTQ]].
""",
                encoding="utf-8",
            )
            drafts = wiki_root / ".drafts/ingests/noisy"
            drafts.mkdir(parents=True)
            (drafts / "paper.md").write_text(
                "# Draft Only\n\nThis draft mentions unique hidden draft-only mcp token.",
                encoding="utf-8",
            )

            caps = mcp_adapter.capabilities(detail="full")
            self.assertEqual(caps["entry_model"]["entries"], ["Prompt/Skill", "MCP"])
            self.assertIn("meridian.context", {tool["name"] for tool in caps["tools"]})

            context = mcp_adapter.context(
                query="activation outlier implementation probes for MoE PTQ",
                wiki_root=wiki_root,
                top_k=3,
                out_dir=root / "mcp-context",
            )
            self.assertEqual(context["workflow"], "Use Wiki")
            self.assertTrue(Path(context["context_path"]).exists())
            self.assertFalse(any("drafts/" in str(item.get("canonical_path")) for item in context["results_summary"]))

            read = mcp_adapter.read(page="concepts/Activation-outliers.md", wiki_root=wiki_root)
            self.assertEqual(read["result_type"], "concept")
            self.assertIn("Implementation Implications", read["sections"])
            self.assertIn("Minimal Checks / Probes", read["sections"])

            trace = mcp_adapter.trace(page="papers/MoE-PTQ.md", wiki_root=wiki_root)
            self.assertEqual(trace["page"], "papers/MoE-PTQ.md")
            self.assertIn("Evidence Map", trace["evidence_sections"])

            proposal = mcp_adapter.propose(
                wiki_root=wiki_root,
                query="activation outlier implementation probes for MoE PTQ",
                title="Activation Outlier Probe Plan",
                proposal_type="synthesis",
                context_path=Path(context["context_json_path"]),
                out_dir=wiki_root / ".drafts/proposals/mcp-probe-plan",
            )
            self.assertEqual(proposal["workflow"], "Update Wiki")
            self.assertTrue(Path(proposal["proposal_manifest"]).exists())
            self.assertEqual(proposal["lint_status"], "pass")

            (wiki_root / "syntheses").mkdir(exist_ok=True)
            (wiki_root / "syntheses/Activation-Outlier-Probe-Plan.md").write_text(
                "# Existing target\n",
                encoding="utf-8",
            )
            blocked = mcp_adapter.apply(
                proposal_manifest=Path(proposal["proposal_manifest"]),
                wiki_root=wiki_root,
            )
            self.assertEqual(blocked["status"], "blocked_by_lint")
            self.assertIn("publish_target_exists", {item["code"] for item in blocked["findings"]})

            with self.assertRaises(ValueError):
                mcp_adapter.read(page=".drafts/ingests/noisy/paper.md", wiki_root=wiki_root)

    def test_mcp_stdio_server_registry_and_tool_calls_share_adapter(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            concepts = wiki_root / "concepts"
            papers.mkdir(parents=True)
            concepts.mkdir(parents=True)
            _write_test_paper(
                papers / "MoE-PTQ.md",
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers", "quantization error"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "This paper studies MoE PTQ.",
                    "Mechanism": "The method smooths activation outliers and tracks quantization error.",
                    "Evidence Map": "Table 1 supports the outlier smoothing claim.",
                    "Implementation Hooks": "Probe activation outlier smoothing before changing quantization kernels.",
                },
            )
            (concepts / "Activation-outliers.md").write_text(
                """---
type: "concept"
title: "Activation outliers"
status: "active"
source_papers:
  - "papers/MoE-PTQ.md"
related_methods:
  - "MoE post-training quantization"
confidence: "medium"
review_state: "auto_converged"
---
# Activation outliers

## What It Is

Activation outliers are high-magnitude activation features that stress low-bit quantization.

## Implementation Implications

Check activation magnitude distributions before choosing calibration and smoothing.

## Minimal Checks / Probes

Plot per-channel activation maxima and run an ablation without smoothing.

## Evidence / Provenance

- Source paper: [[papers/MoE-PTQ]].
""",
                encoding="utf-8",
            )
            drafts = wiki_root / ".drafts/ingests/noisy"
            drafts.mkdir(parents=True)
            (drafts / "paper.md").write_text("# Draft artifact\n\nNot canonical.", encoding="utf-8")

            server = mcp_server.MeridianMCPServer(default_wiki_root=wiki_root)
            init_response = server.handle_message(
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {"protocolVersion": "2024-11-05"},
                }
            )
            self.assertEqual(init_response["result"]["serverInfo"]["name"], "meridian-paper-wiki")
            self.assertIn("tools", init_response["result"]["capabilities"])

            tools_response = server.handle_message({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
            tool_names = {tool["name"] for tool in tools_response["result"]["tools"]}
            self.assertEqual(
                {
                    "meridian.capabilities",
                    "meridian.context",
                    "meridian.read",
                    "meridian.trace",
                    "meridian.update",
                    "meridian.propose",
                    "meridian.apply",
                    "meridian.audit",
                },
                tool_names,
            )

            context_response = server.handle_message(
                {
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {
                        "name": "meridian.context",
                        "arguments": {
                            "query": "activation outlier implementation probes for MoE PTQ",
                            "top_k": 3,
                        },
                    },
                }
            )
            context_payload = json.loads(context_response["result"]["content"][0]["text"])
            self.assertEqual(context_payload["workflow"], "Use Wiki")
            self.assertFalse(any("drafts/" in str(item.get("canonical_path")) for item in context_payload["results_summary"]))

            read_response = server.handle_message(
                {
                    "jsonrpc": "2.0",
                    "id": 4,
                    "method": "tools/call",
                    "params": {
                        "name": "meridian.read",
                        "arguments": {"page": "concepts/Activation-outliers.md"},
                    },
                }
            )
            read_payload = json.loads(read_response["result"]["content"][0]["text"])
            self.assertEqual(read_payload["result_type"], "concept")
            self.assertIn("Implementation Implications", read_payload["sections"])

            blocked_read = server.handle_message(
                {
                    "jsonrpc": "2.0",
                    "id": 5,
                    "method": "tools/call",
                    "params": {
                        "name": "meridian.read",
                        "arguments": {"page": ".drafts/ingests/noisy/paper.md"},
                    },
                }
            )
            self.assertTrue(blocked_read["result"]["isError"])
            blocked_payload = json.loads(blocked_read["result"]["content"][0]["text"])
            self.assertIn("not a canonical retrieval page", blocked_payload["message"])

            update_response = server.handle_message(
                {
                    "jsonrpc": "2.0",
                    "id": 6,
                    "method": "tools/call",
                    "params": {
                        "name": "meridian.update",
                        "arguments": {
                            "paper": "CodeQuant",
                            "note": "Use this paper when designing activation outlier probes.",
                            "insight_type": "implementation-note",
                        },
                    },
                }
            )
            update_payload = json.loads(update_response["result"]["content"][0]["text"])
            self.assertEqual(update_payload["workflow"], "Update Wiki")
            self.assertEqual(update_payload["update_type"], "user_insight")
            self.assertIn(update_payload["lint_status"], {"pass", "fail"})

    def test_mcp_stdio_harness_runs_client_style_sequence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            _write_test_paper(
                wiki_root / "papers/KV-Cache.md",
                title="KV Cache Paper",
                aliases=["KVCacheProbe"],
                topics=["KV-cache compression", "long-context inference"],
                methods=["KV-cache compression"],
                settings=["long-context decoding"],
                body_sections={
                    "What To Remember": "KV-cache compression needs retention policy checks.",
                    "Mechanism": "Cache retention should preserve useful context while reducing memory bandwidth.",
                    "Evidence Map": "Reports decode memory and context-retention evidence.",
                    "Implementation Hooks": "Track retained tokens and decode latency.",
                },
            )
            concept = wiki_root / "concepts/Cache-retention-policy.md"
            concept.parent.mkdir(parents=True)
            concept.write_text(
                """---
type: "concept"
title: "Cache retention policy"
status: "active"
source_papers:
  - "papers/KV-Cache.md"
related_methods:
  - "KV-cache compression"
prerequisite_for:
  - "KV-cache compression"
confidence: "medium"
review_state: "auto_structured"
---
# Cache retention policy

## What It Is

Cache retention policy decides which tokens remain available during long-context decoding.

## Implementation Implications

Log retained-token identities and measure decode memory before claiming speedups.

## Minimal Checks / Probes

Compare recency-only retention with attention-based and oracle retention policies.

## Evidence / Provenance

- Source paper: [[papers/KV-Cache]].
""",
                encoding="utf-8",
            )
            report_path = root / "mcp-harness.json"
            result = mcp_harness.run_stdio_harness(wiki_root=wiki_root, out_path=report_path)
            self.assertEqual(result["status"], "pass")
            self.assertTrue(report_path.exists())
            self.assertEqual(result["summary"]["tool_count"], 8)
            self.assertTrue(result["summary"]["blocked_internal_read"])
            self.assertEqual(result["summary"]["fixture_apply_status"], "published")

    def test_system_evaluation_agent_writes_schema_and_judge_packet(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            _write_test_paper(
                wiki_root / "papers/KV-Compression.md",
                title="KV Compression",
                aliases=["KV compression"],
                topics=["long-context attention"],
                methods=["KV-cache compression"],
                settings=["long-context decoding"],
                body_sections={
                    "What To Remember": "KV-cache compression trades memory for accuracy in long-context decoding.",
                    "Implementation Hooks": "Measure retention policy effects with cache hit and latency probes.",
                    "Evidence Map": "Evidence links compression decisions to latency and memory observations.",
                    "Retrieval Hooks": "Use for KV-cache compression implementation probes.",
                },
            )
            _write_knowledge_page(
                wiki_root / "syntheses/KV-Compression-Failure-Boundaries.md",
                page_type="synthesis",
                title="KV Compression Failure Boundaries",
                source_papers=["papers/KV-Compression.md"],
                body="\n".join(
                    [
                        "## Source Facts",
                        "KV compression changes memory pressure and decoding behavior.",
                        "## Wiki Synthesis",
                        "Failure boundaries depend on retained context and attention behavior.",
                        "## Evidence Map",
                        "Trace to KV Compression evidence and paper sections.",
                        "## Open Questions",
                        "Which retention policy fails first?",
                        "## Retrieval Hooks",
                        "Use for KV-cache compression failure-boundary probes.",
                    ]
                ),
            )
            _write_knowledge_page(
                wiki_root / "concepts/KV-Cache-Memory-Bandwidth.md",
                page_type="concept",
                title="KV Cache Memory Bandwidth",
                source_papers=["papers/KV-Compression.md"],
                body="\n".join(
                    [
                        "## What It Is",
                        "The memory movement constraint around KV-cache reads.",
                        "## Why It Matters",
                        "It controls long-context decoding latency.",
                        "## Implementation Implications",
                        "Profile memory bandwidth before claiming algorithmic speedup.",
                        "## Common Failure Modes",
                        "A compute-side win can be hidden by memory traffic.",
                        "## Minimal Checks / Probes",
                        "Measure cache traffic, latency, and retained-token sensitivity.",
                        "## Evidence / Provenance",
                        "Supported by KV Compression paper observations.",
                    ]
                ),
            )
            _write_knowledge_page(
                wiki_root / "evidence/KV-Cache-Latency-Evidence.md",
                page_type="evidence",
                title="KV Cache Latency Evidence",
                source_papers=["papers/KV-Compression.md"],
                body="\n".join(
                    [
                        "## Evidence Item",
                        "Latency and memory observations change under compression.",
                        "## Source",
                        "KV Compression paper.",
                        "## Metric or Observation",
                        "Latency and memory footprint.",
                        "## Provenance",
                        "papers/KV-Compression.md.",
                    ]
                ),
            )
            case = {
                "id": "kv_context",
                "query": "I want a durable synthesis for KV-cache compression failure boundaries.",
                "required_page_families": ["corpus:syntheses", "type:concept", "type:evidence"],
                "required_section_groups": [
                    {
                        "id": "synthesis",
                        "page_families": ["corpus:syntheses"],
                        "sections": ["Source Facts", "Wiki Synthesis", "Evidence Map", "Open Questions"],
                    },
                    {
                        "id": "concept",
                        "page_families": ["type:concept"],
                        "sections": ["Implementation Implications", "Minimal Checks / Probes"],
                    },
                ],
            }
            context = {
                "schema_version": "meridian.retrieval_context.v0",
                "query": case["query"],
                "strategy": "v1",
                "results": [
                    _system_eval_context_result(
                        "syntheses/KV-Compression-Failure-Boundaries.md",
                        page_type="synthesis",
                        corpus_type="syntheses",
                        sections=["Source Facts", "Wiki Synthesis", "Evidence Map", "Open Questions", "Retrieval Hooks"],
                    ),
                    _system_eval_context_result(
                        "concepts/KV-Cache-Memory-Bandwidth.md",
                        page_type="concept",
                        corpus_type="concepts",
                        sections=["Implementation Implications", "Common Failure Modes", "Minimal Checks / Probes", "Evidence / Provenance"],
                    ),
                    _system_eval_context_result(
                        "evidence/KV-Cache-Latency-Evidence.md",
                        page_type="evidence",
                        corpus_type="evidence",
                        sections=["Evidence Item", "Source", "Metric or Observation", "Provenance"],
                    ),
                    _system_eval_context_result(
                        "papers/KV-Compression.md",
                        page_type="paper",
                        corpus_type="papers",
                        sections=["What To Remember", "Implementation Hooks", "Evidence Map"],
                    ),
                ],
            }
            case_path = root / "case.json"
            context_path = root / "context.json"
            case_path.write_text(json.dumps(case), encoding="utf-8")
            context_path.write_text(json.dumps(context), encoding="utf-8")

            exit_code, stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "system-evaluate",
                    "--wiki-root",
                    str(wiki_root),
                    "--case",
                    str(case_path),
                    "--context",
                    str(context_path),
                    "--out",
                    str(root / "eval"),
                    "--rubric",
                    "eval/rubrics/system_evaluation_agent_quality.md",
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Decision: pass", stdout)
            report = json.loads((root / "eval/system-evaluation.json").read_text(encoding="utf-8"))
            self.assertEqual(report["schema_version"], "meridian.system_evaluation.v1")
            self.assertEqual(report["decision"], "pass")
            self.assertGreaterEqual(report["weighted_score"], 4.0)
            self.assertTrue((root / "eval/system-evaluation.md").exists())
            self.assertIn("System Evaluation Judge Packet", (root / "eval/judge-packet.md").read_text(encoding="utf-8"))

    def test_system_evaluation_hard_fails_debug_artifact_leakage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            case_path = root / "case.json"
            context_path = root / "context.json"
            case_path.write_text(json.dumps({"id": "leak", "query": "Use product context only."}), encoding="utf-8")
            context_path.write_text(
                json.dumps(
                    {
                        "query": "Use product context only.",
                        "results": [
                            _system_eval_context_result(
                                ".drafts/ingests/example/paper_candidate.md",
                                page_type="paper",
                                corpus_type=".drafts",
                                sections=["What To Remember"],
                            )
                        ],
                    }
                ),
                encoding="utf-8",
            )

            exit_code, _, _ = _run_cli_capture(
                ["wiki", "system-evaluate", "--wiki-root", str(wiki_root), "--case", str(case_path), "--context", str(context_path), "--out", str(root / "eval")]
            )

            self.assertEqual(exit_code, 1)
            report = json.loads((root / "eval/system-evaluation.json").read_text(encoding="utf-8"))
            self.assertEqual(report["decision"], "fail")
            self.assertIn("debug_artifact_leakage", {item["code"] for item in report["hard_failures"]})
            self.assertIn("artifact_boundary", report["repair_buckets"])

    def test_system_evaluation_hard_fails_source_quality_contamination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            case_path = root / "case.json"
            context_path = root / "context.json"
            case_path.write_text(json.dumps({"id": "source-quality", "query": "Does this evidence support a scientific claim?"}), encoding="utf-8")
            context_path.write_text(
                json.dumps(
                    {
                        "query": "Does this evidence support a scientific claim?",
                        "results": [
                            {
                                **_system_eval_context_result(
                                    "papers/Bad-Metadata.md",
                                    page_type="paper",
                                    corpus_type="papers",
                                    sections=["Evidence Map"],
                                ),
                                "review_state": "source_quality_hold",
                                "quality_state": "untrusted_source_text",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            exit_code, _, _ = _run_cli_capture(
                ["wiki", "system-evaluate", "--wiki-root", str(wiki_root), "--case", str(case_path), "--context", str(context_path), "--out", str(root / "eval")]
            )

            self.assertEqual(exit_code, 1)
            report = json.loads((root / "eval/system-evaluation.json").read_text(encoding="utf-8"))
            self.assertIn("source_quality_contamination", {item["code"] for item in report["hard_failures"]})
            self.assertIn("source_quality_routing", report["repair_buckets"])

    def test_system_evaluation_assigns_repair_bucket_for_missing_required_family(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            case_path = root / "case.json"
            context_path = root / "context.json"
            case_path.write_text(
                json.dumps(
                    {
                        "id": "missing-evidence",
                        "query": "Trace claim support.",
                        "required_page_families": ["type:evidence"],
                    }
                ),
                encoding="utf-8",
            )
            context_path.write_text(
                json.dumps(
                    {
                        "query": "Trace claim support.",
                        "results": [
                            _system_eval_context_result(
                                "papers/Relevant-Paper.md",
                                page_type="paper",
                                corpus_type="papers",
                                sections=["What To Remember"],
                            )
                        ],
                    }
                ),
                encoding="utf-8",
            )

            exit_code, _, _ = _run_cli_capture(
                ["wiki", "system-evaluate", "--wiki-root", str(wiki_root), "--case", str(case_path), "--context", str(context_path), "--out", str(root / "eval")]
            )

            self.assertEqual(exit_code, 0)
            report = json.loads((root / "eval/system-evaluation.json").read_text(encoding="utf-8"))
            self.assertEqual(report["decision"], "needs_refine")
            self.assertIn("retrieval_ranking", report["repair_buckets"])
            self.assertIn("missing_required_page_families", {item["code"] for item in report["findings"]})

    def test_system_evaluation_cases_and_rubric_are_parseable(self) -> None:
        cases = Path("eval/cases/system_evaluation_agent_mvp.jsonl")
        rubric = Path("eval/rubrics/system_evaluation_agent_quality.md")
        self.assertTrue(cases.exists())
        self.assertTrue(rubric.exists())
        parsed = [json.loads(line) for line in cases.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreaterEqual(len(parsed), 6)
        self.assertTrue(all("query" in case and "rubric" in case for case in parsed))
        rubric_text = rubric.read_text(encoding="utf-8")
        self.assertIn("Task Usefulness", rubric_text)
        self.assertIn("Hard Fail Rules", rubric_text)
        self.assertIn("Repair Buckets", rubric_text)

    def test_system_optimize_eval_writes_summary_repair_buckets_and_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            _write_test_paper(
                wiki_root / "papers/KV-Compression.md",
                title="KV Compression",
                aliases=["KV compression"],
                topics=["long-context attention"],
                methods=["KV-cache compression"],
                settings=["long-context decoding"],
                body_sections={
                    "What To Remember": "KV-cache compression has failure boundaries around retained context.",
                    "Implementation Hooks": "Profile KV cache memory bandwidth and retained-token sensitivity.",
                    "Evidence Map": "Evidence links cache compression to latency and memory.",
                },
            )
            _write_knowledge_page(
                wiki_root / "syntheses/KV-Compression-Failure-Boundaries.md",
                page_type="synthesis",
                title="KV Compression Failure Boundaries",
                source_papers=["papers/KV-Compression.md"],
                body="\n".join(
                    [
                        "## Source Facts",
                        "KV-cache compression changes memory pressure.",
                        "## Wiki Synthesis",
                        "Failure boundaries depend on retained context.",
                        "## Evidence Map",
                        "Trace source paper evidence.",
                        "## Open Questions",
                        "Which retention policy fails first?",
                        "## Retrieval Hooks",
                        "Use for KV-cache compression failure boundary research.",
                    ]
                ),
            )
            _write_knowledge_page(
                wiki_root / "concepts/KV-Cache-Memory-Bandwidth.md",
                page_type="concept",
                title="KV Cache Memory Bandwidth",
                source_papers=["papers/KV-Compression.md"],
                body="\n".join(
                    [
                        "## What It Is",
                        "The memory movement constraint for KV cache reads.",
                        "## Implementation Implications",
                        "Profile memory bandwidth before claiming speedup.",
                        "## Common Failure Modes",
                        "Memory traffic can hide compute improvements.",
                        "## Minimal Checks / Probes",
                        "Measure cache traffic and retained-token sensitivity.",
                        "## Evidence / Provenance",
                        "Source paper: KV Compression.",
                    ]
                ),
            )
            cases = root / "cases.jsonl"
            cases.write_text(
                json.dumps(
                    {
                        "id": "kv-system",
                        "query": "KV Compression Failure Boundaries Source Facts Wiki Synthesis Evidence Map Open Questions KV Cache Memory Bandwidth Implementation Implications Minimal Checks Probes Evidence Provenance",
                        "problem_description": "Retrieve synthesis and concept context for KV-cache compression failure-boundary work.",
                        "required_page_families": ["corpus:syntheses", "type:concept"],
                        "required_section_groups": [
                            {
                                "id": "synthesis",
                                "page_families": ["corpus:syntheses"],
                                "sections": ["Source Facts", "Wiki Synthesis", "Evidence Map", "Open Questions"],
                            },
                            {
                                "id": "concept",
                                "page_families": ["type:concept"],
                                "sections": ["Implementation Implications", "Minimal Checks / Probes"],
                            },
                        ],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            exit_code, stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "system-optimize-eval",
                    "--wiki-root",
                    str(wiki_root),
                    "--cases",
                    str(cases),
                    "--out-dir",
                    str(root / "sysopt"),
                    "--rubric",
                    "eval/rubrics/system_evaluation_agent_quality.md",
                    "--top-k",
                    "4",
                    "--overwrite",
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Wrote system optimization summary", stdout)
            summary = json.loads((root / "sysopt/summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["schema_version"], "meridian.system_optimization_eval.v1")
            self.assertEqual(summary["total_cases"], 1)
            self.assertTrue((root / "sysopt/repair-buckets.json").exists())
            self.assertTrue((root / "sysopt/optimization_plan.md").exists())
            self.assertTrue((root / "sysopt/judge-packet.md").exists())
            self.assertTrue((root / "sysopt/kv-system/system-evaluation/system-evaluation.json").exists())

    def test_system_optimize_eval_propagates_hard_failures_to_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            _write_test_paper(
                wiki_root / "papers/Bad-Metadata.md",
                title="Bad Metadata",
                aliases=["Bad Metadata"],
                topics=["source quality"],
                methods=["metadata extraction"],
                settings=["source quality"],
                body_sections={
                    "What To Remember": "This page is a source-quality hold.",
                    "Evidence Map": "Do not use as scientific evidence.",
                },
                review_state="source_quality_hold",
                quality_gate="fail",
                confidence="low",
            )
            cases = root / "cases.jsonl"
            cases.write_text(
                json.dumps(
                    {
                        "id": "bad-source",
                        "query": "Bad Metadata scientific evidence support",
                        "problem_description": "Scientific evidence query should hard-fail if untrusted material is returned as evidence.",
                        "required_page_families": ["type:paper"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            exit_code, _, _ = _run_cli_capture(
                [
                    "wiki",
                    "system-optimize-eval",
                    "--wiki-root",
                    str(wiki_root),
                    "--cases",
                    str(cases),
                    "--out-dir",
                    str(root / "sysopt"),
                    "--top-k",
                    "1",
                ]
            )

            self.assertEqual(exit_code, 0)
            summary = json.loads((root / "sysopt/summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["decisions"]["fail"], 1)
            self.assertGreater(summary["hard_failure_count"], 0)
            self.assertIn("source_quality_routing", summary["repair_buckets"])

    def test_system_optimize_compare_detects_improvement(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            baseline = root / "baseline"
            candidate = root / "candidate"
            baseline.mkdir()
            candidate.mkdir()
            baseline_summary = {
                "out_dir": str(baseline),
                "total_cases": 1,
                "decisions": {"pass": 0, "needs_refine": 1, "fail": 0},
                "score": {"average": 3.7},
                "hard_failure_count": 0,
                "repair_buckets": {"retrieval_ranking": {"count": 2}},
                "dimension_averages": [{"dimension": "retrieval_context_quality", "average_score": 3.6}],
                "cases": [{"id": "case-a", "decision": "needs_refine", "weighted_score": 3.7}],
            }
            candidate_summary = {
                "out_dir": str(candidate),
                "total_cases": 1,
                "decisions": {"pass": 1, "needs_refine": 0, "fail": 0},
                "score": {"average": 4.4},
                "hard_failure_count": 0,
                "repair_buckets": {"retrieval_ranking": {"count": 0}},
                "dimension_averages": [{"dimension": "retrieval_context_quality", "average_score": 4.3}],
                "cases": [{"id": "case-a", "decision": "pass", "weighted_score": 4.4}],
            }
            (baseline / "summary.json").write_text(json.dumps(baseline_summary), encoding="utf-8")
            (candidate / "summary.json").write_text(json.dumps(candidate_summary), encoding="utf-8")

            exit_code, stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "system-optimize-compare",
                    "--baseline-run",
                    str(baseline),
                    "--candidate-run",
                    str(candidate),
                    "--out-dir",
                    str(root / "comparison"),
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Wrote comparison", stdout)
            comparison = json.loads((root / "comparison/comparison.json").read_text(encoding="utf-8"))
            self.assertEqual(comparison["decision"], "improved")
            self.assertGreater(comparison["score_delta"], 0)
            self.assertEqual(comparison["repair_bucket_delta"]["retrieval_ranking"]["delta"], -2)

            baseline_summary["score"]["average"] = 4.912
            baseline_summary["repair_buckets"] = {"provenance_schema": {"count": 5}}
            candidate_summary["score"]["average"] = 5.0
            candidate_summary["repair_buckets"] = {"provenance_schema": {"count": 0}}
            (baseline / "summary.json").write_text(json.dumps(baseline_summary), encoding="utf-8")
            (candidate / "summary.json").write_text(json.dumps(candidate_summary), encoding="utf-8")
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "system-optimize-compare",
                        "--baseline-run",
                        str(baseline),
                        "--candidate-run",
                        str(candidate),
                        "--out-dir",
                        str(root / "small-delta-comparison"),
                    ]
                ),
                0,
            )
            small_delta = json.loads((root / "small-delta-comparison/comparison.json").read_text(encoding="utf-8"))
            self.assertEqual(small_delta["decision"], "improved")

    def test_system_optimization_cases_are_parseable(self) -> None:
        cases = Path("eval/cases/system_evaluation_optimization_loop.jsonl")
        self.assertTrue(cases.exists())
        parsed = [json.loads(line) for line in cases.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreaterEqual(len(parsed), 7)
        self.assertTrue(all("query" in case and "problem_description" in case for case in parsed))

    def test_release_manifest_excludes_private_runtime_state(self) -> None:
        manifest = Path("MANIFEST.in")
        self.assertTrue(manifest.exists())
        text = manifest.read_text(encoding="utf-8")
        self.assertIn("graft src", text)
        self.assertIn("graft .codex/skills", text)
        self.assertIn("graft plugins", text)
        self.assertIn("graft eval/cases", text)
        self.assertIn("graft eval/rubrics", text)
        self.assertIn("prune wiki", text)
        self.assertIn("prune eval/runs", text)
        self.assertIn("prune .arbor", text)

    def test_release_vault_template_is_packaged(self) -> None:
        template = Path("src/meridian/templates/wiki-vault")
        self.assertTrue((template / "Map of Content.md").exists())
        self.assertTrue((template / "raw/sources/sources.jsonl").exists())
        self.assertTrue((template / "papers/.gitkeep").exists())
        pyproject = Path("pyproject.toml").read_text(encoding="utf-8")
        self.assertIn('"templates/wiki-vault/**/*.md"', pyproject)
        self.assertIn('"templates/wiki-vault/**/*.gitkeep"', pyproject)
        self.assertIn('"templates/wiki-vault/**/*.jsonl"', pyproject)

    def test_plugin_release_assets_exist(self) -> None:
        readme = Path("README.md").read_text(encoding="utf-8")
        self.assertNotIn("python3 -m venv", readme)
        self.assertNotIn(". .venv/bin/activate", readme)
        self.assertIn("plugins/codex/meridian/", readme)
        self.assertIn("plugins/claude-code/meridian/", readme)

        codex_root = Path("plugins/codex/meridian")
        codex_marketplace = json.loads(
            Path(".agents/plugins/marketplace.json").read_text(encoding="utf-8")
        )
        self.assertEqual(codex_marketplace["name"], "meridian")
        self.assertEqual(codex_marketplace["plugins"][0]["name"], "meridian")
        self.assertEqual(codex_marketplace["plugins"][0]["source"]["path"], "./plugins/codex/meridian")
        codex_manifest = json.loads((codex_root / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(codex_manifest["name"], "meridian")
        self.assertEqual(codex_manifest["skills"], "./skills/")
        self.assertEqual(codex_manifest["mcpServers"], "./.mcp.json")

        claude_root = Path("plugins/claude-code/meridian")
        claude_marketplace = json.loads(
            Path(".claude-plugin/marketplace.json").read_text(encoding="utf-8")
        )
        self.assertEqual(claude_marketplace["name"], "meridian")
        self.assertEqual(claude_marketplace["plugins"][0]["name"], "meridian")
        self.assertEqual(claude_marketplace["plugins"][0]["source"], "./plugins/claude-code/meridian")
        claude_manifest = json.loads((claude_root / ".claude-plugin/plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(claude_manifest["name"], "meridian")

        for root in (codex_root, claude_root):
            self.assertTrue((root / ".mcp.json").exists())
            self.assertTrue((root / "skills/meridian/SKILL.md").exists())
            self.assertTrue((root / "skills/wiki/SKILL.md").exists())
            self.assertTrue((root / "skills/wiki-retrieve/SKILL.md").exists())
            self.assertTrue((root / "skills/lab/SKILL.md").exists())
            self.assertFalse((root / "skills/llm-wiki").exists())

    def test_research_dev_mvp_assets_exist(self) -> None:
        skill = Path(".codex/skills/lab/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Idea To Experiment Design", skill)
        self.assertIn("Paper Or Method To Implementation", skill)
        self.assertIn("Broken Run To Sanity Check / Debug", skill)
        self.assertIn("meridian.context", skill)
        self.assertIn("Lazy Init", skill)

        template = Path("src/meridian/templates/research-dev")
        self.assertTrue((template / "research-dev-context-packet.md").exists())
        self.assertTrue((template / "experiment-evidence-plan.md").exists())
        self.assertTrue((template / "dev-writeback-packet.md").exists())
        self.assertTrue((template / "idea-card.md").exists())

        pyproject = Path("pyproject.toml").read_text(encoding="utf-8")
        self.assertIn('"templates/research-dev/**/*.md"', pyproject)

    def test_research_dev_idea_management_assets_parse(self) -> None:
        skill = Path(".codex/skills/lab/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Idea Capture / Triage / Evolution", skill)
        self.assertIn("Write back only through a Paper Wiki", skill)
        self.assertIn("proposal when a local finding", skill)

        template = Path("src/meridian/templates/research-dev/idea-card.md").read_text(encoding="utf-8")
        for section in [
            "## Raw Idea",
            "## Hypothesis",
            "## Wiki Grounding",
            "## Feasibility Read",
            "## Minimal Test",
            "## Evidence Log",
            "## Decision",
            "## Write-back Candidate",
        ]:
            self.assertIn(section, template)
        self.assertIn("type: research_dev_idea", template)
        self.assertIn("evidence_state", template)

        cases = Path("eval/cases/research_dev_idea_management_mvp.jsonl")
        parsed = [json.loads(line) for line in cases.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreaterEqual(len(parsed), 8)
        self.assertTrue(all(case.get("category") == "research_dev_idea_management_mvp" for case in parsed))
        self.assertTrue(all("expected_result" in case and "rubric" in case for case in parsed))

        rubric = Path("eval/rubrics/research_dev_idea_management_quality.md").read_text(encoding="utf-8")
        self.assertIn("Raw Idea Fidelity", rubric)
        self.assertIn("Wiki Grounding Quality", rubric)
        self.assertIn("Write-back Boundary", rubric)

    def test_research_dev_state_model_assets_parse(self) -> None:
        skill = Path(".codex/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for phrase in [
            "New Idea Placement / Thread Seed",
            "Approach Tree Exploration",
            "Experiment Evidence Recording",
            "Finding Proposal / Wiki Write-back",
            "Lazy Init",
            ".meridian/state.md",
            ".meridian/memory.md",
            ".meridian/threads/index.md",
            ".meridian/experiments/index.md",
            ".meridian/proposals/index.md",
            "unresolved",
            "repairable",
            "supported",
            "dead",
            "no existing thread candidates",
            "root thread seed",
        ]:
            self.assertIn(phrase, skill)

        template = Path("src/meridian/templates/research-dev")
        for name in [
            "state.md",
            "thread.md",
            "experiment.md",
            "proposal.md",
            "threads-index.md",
            "experiments-index.md",
            "proposals-index.md",
            "memory.md",
            "wiki-transfer-packet.md",
        ]:
            self.assertTrue((template / name).exists(), name)

        thread = (template / "thread.md").read_text(encoding="utf-8")
        self.assertIn("active_node", thread)
        self.assertIn("Approach Tree", thread)
        self.assertIn("unresolved", thread)

        proposal = (template / "proposal.md").read_text(encoding="utf-8")
        self.assertIn("strengthening", proposal)
        self.assertIn("Wiki Transfer Gate", proposal)
        self.assertIn("Transfer Notes", proposal)

        transfer = (template / "wiki-transfer-packet.md").read_text(encoding="utf-8")
        self.assertIn("Boundary Mapping", transfer)
        self.assertIn("Publish Gate", transfer)

        state_doc = Path("docs/research-dev-state-model.md").read_text(encoding="utf-8")
        self.assertIn(".meridian/", state_doc)
        self.assertIn("Lab uses lazy init", state_doc)
        self.assertIn("Node modes are exactly", state_doc)
        self.assertIn("Proposal states are", state_doc)
        self.assertIn("only `threads/index.md`", state_doc)
        self.assertIn("create a root thread seed", state_doc)

        cases = Path("eval/cases/research_dev_state_model.jsonl")
        parsed = [json.loads(line) for line in cases.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreaterEqual(len(parsed), 8)
        self.assertTrue(all(case.get("category") == "research_dev_state_model" for case in parsed))
        self.assertTrue(all("expected_result" in case and "must_not_do" in case for case in parsed))
        no_candidate_case = next(
            case for case in parsed if case["id"] == "state-new-idea-no-thread-candidates"
        )
        self.assertIn("root thread seed", no_candidate_case["expected_result"])
        self.assertTrue(any("skip Lab state" in item for item in no_candidate_case["must_not_do"]))

        rubric = Path("eval/rubrics/research_dev_state_model_quality.md").read_text(encoding="utf-8")
        self.assertIn("Hard Fail Rules", rubric)
        self.assertIn("Placement Boundary", rubric)
        self.assertIn("Lazy Init", rubric)
        self.assertIn("Proposal Lifecycle", rubric)
        self.assertIn("zero candidates", rubric)
        self.assertIn("skipping Lab state", rubric)

    def test_research_dev_zero_candidate_idea_replay_contract(self) -> None:
        skill = Path(".codex/skills/lab/SKILL.md").read_text(encoding="utf-8")
        state_doc = Path("docs/research-dev-state-model.md").read_text(encoding="utf-8")
        rubric = Path("eval/rubrics/research_dev_state_model_quality.md").read_text(encoding="utf-8")
        cases = [
            json.loads(line)
            for line in Path("eval/cases/research_dev_state_model.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        case = next(item for item in cases if item["id"] == "state-new-idea-no-thread-candidates")

        for text in (skill, state_doc):
            self.assertIn("no existing thread candidates", text)
            self.assertIn("root", text)
        self.assertIn("ask to create a root thread seed", skill)
        self.assertIn("create a root thread seed", state_doc)
        self.assertIn("absence of existing threads", case["must_not_do"][0])
        self.assertIn("root thread seed", case["expected_result"])
        self.assertIn("Skips root thread seed creation", rubric)

    def test_lab_lazy_init_creates_minimal_valid_research_space(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            written = initialize_lab_space(root)
            relative = sorted(path.relative_to(root) for path in written)
            self.assertEqual(
                relative,
                [
                    Path(".meridian/experiments/index.md"),
                    Path(".meridian/memory.md"),
                    Path(".meridian/proposals/index.md"),
                    Path(".meridian/state.md"),
                    Path(".meridian/threads/index.md"),
                ],
            )
            self.assertFalse([path for path in (root / ".meridian/threads").glob("*.md") if path.name != "index.md"])
            self.assertFalse([path for path in (root / ".meridian/experiments").glob("*.md") if path.name != "index.md"])
            self.assertFalse([path for path in (root / ".meridian/proposals").glob("*.md") if path.name != "index.md"])
            report = validate_lab_space(root)
            self.assertEqual(report.status, "pass", report.to_dict())

    def test_lab_state_validator_passes_valid_research_space(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            (lab / "state.md").write_text(
                "---\ntype: lab-state\nactive_thread: cache-retention\n---\n# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "memory.md").write_text("---\ntype: lab-memory\n---\n# Memory\n", encoding="utf-8")
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            (lab / "threads/cache-retention.md").write_text(
                "---\ntype: research-thread\nactive_node: A\n---\n"
                "# Research Thread\n\n"
                "## Approach Tree\n\n"
                "### Node A: Initial approach\n\n"
                "- mode: `supported`\n",
                encoding="utf-8",
            )
            (lab / "experiments/exp-cache-probe.md").write_text(
                "---\ntype: research-experiment\nid: exp-cache-probe\nvalidity: valid\n---\n"
                "# Experiment\n",
                encoding="utf-8",
            )
            (lab / "proposals/cache-scoring.md").write_text(
                "---\n"
                "type: research-finding-proposal\n"
                "state: ready\n"
                "source_experiments:\n"
                "  - exp-cache-probe\n"
                "target_wiki_pages:\n"
                "  - wiki/concepts/KV-cache-memory-bandwidth.md\n"
                "---\n"
                "# Finding Proposal\n\n"
                "## Wiki Transfer Gate\n\n"
                "- source facts:\n",
                encoding="utf-8",
            )

            report = validate_lab_space(root)
            self.assertEqual(report.status, "pass", report.to_dict())

    def test_lab_state_validator_fails_invalid_modes_and_ready_bridge(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            (lab / "state.md").write_text(
                "---\ntype: lab-state\nactive_thread: missing-thread\n---\n# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "memory.md").write_text("---\ntype: lab-memory\n---\n# Memory\n", encoding="utf-8")
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            (lab / "threads/cache-retention.md").write_text(
                "---\ntype: research-thread\nactive_node: B\n---\n"
                "# Research Thread\n\n"
                "## Approach Tree\n\n"
                "### Node A: Initial approach\n\n"
                "- mode: `paused`\n",
                encoding="utf-8",
            )
            (lab / "proposals/cache-scoring.md").write_text(
                "---\ntype: research-finding-proposal\nstate: ready\n---\n"
                "# Finding Proposal\n",
                encoding="utf-8",
            )

            report = validate_lab_space(root)
            codes = {finding.code for finding in report.findings}
            self.assertEqual(report.status, "fail")
            self.assertIn("active_thread_missing", codes)
            self.assertIn("active_node_missing", codes)
            self.assertIn("invalid_node_mode", codes)
            self.assertIn("ready_proposal_without_experiments", codes)
            self.assertIn("ready_proposal_without_wiki_target", codes)
            self.assertIn("ready_proposal_without_transfer_gate", codes)

    def test_research_dev_eval_assets_parse(self) -> None:
        cases = Path("eval/cases/research_dev_mvp.jsonl")
        parsed = [json.loads(line) for line in cases.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreaterEqual(len(parsed), 7)
        self.assertTrue(all(case.get("category") == "research_dev_mvp" for case in parsed))
        self.assertTrue(all("expected_result" in case and "rubric" in case for case in parsed))

        rubric = Path("eval/rubrics/research_dev_mvp_quality.md").read_text(encoding="utf-8")
        self.assertIn("Wiki Retrieval Usage", rubric)
        self.assertIn("Write-back Boundary", rubric)
        self.assertIn("Lightweight Behavior", rubric)

    def test_research_dev_longitudinal_replay_assets_parse(self) -> None:
        cases = Path("eval/cases/research_dev_longitudinal_replay.jsonl")
        parsed = [json.loads(line) for line in cases.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreaterEqual(len(parsed), 6)
        self.assertTrue(all(case.get("category") == "research_dev_longitudinal_replay" for case in parsed))
        self.assertTrue(all("expected_result" in case and "must_not_do" in case for case in parsed))

        rubric = Path("eval/rubrics/research_dev_longitudinal_replay_quality.md").read_text(encoding="utf-8")
        self.assertIn("Longitudinal Replay", rubric)
        self.assertIn("Wiki Transfer Boundary", rubric)
        self.assertIn("Invalid Evidence Handling", rubric)

    def test_add_insight_creates_draft_for_exact_canonical_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            paper = wiki_root / "papers/MoE-PTQ.md"
            _write_test_paper(
                paper,
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "This paper studies MoE PTQ.",
                    "Mechanism": "The method smooths activation outliers.",
                },
            )

            exit_code, stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "add-insight",
                    "--wiki-root",
                    str(wiki_root),
                    "--paper",
                    str(paper),
                    "--note",
                    "My reading: this is most useful as a probe design paper for expert-level routing stability.",
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Insight match status: matched", stdout)
            manifest_path = next((wiki_root / ".drafts/insights").glob("*/insight.json"))
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["source_type"], "user_insight")
            self.assertEqual(manifest["provenance"], "user_supplied")
            self.assertEqual(manifest["target_page"], "papers/MoE-PTQ.md")
            self.assertIn("user_input_raw", manifest)
            self.assertIn("internalization_targets", manifest)
            self.assertTrue(manifest["internalization_targets"])
            target = manifest["internalization_targets"][0]
            self.assertIn(target["target_section"], {"Why It Matters For Me", "Personalized Interpretation", "Implementation Hooks"})
            self.assertIn("not paper source fact", target["source_boundary"])
            self.assertIn("provenance_note_id", target)
            self.assertIn("not paper source fact", manifest["source_fact_boundary"])
            insight_text = (manifest_path.parent / "insight.md").read_text(encoding="utf-8")
            self.assertIn("## Raw User Note", insight_text)
            self.assertIn("## Internalization Targets", insight_text)
            self.assertIn("## Proposed Canonical Updates", insight_text)
            self.assertIn("## Source Re-check Needed", insight_text)
            self.assertTrue((manifest_path.parent / "target_context.json").exists())

    def test_add_insight_matches_title_alias_and_natural_language(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            _write_test_paper(
                papers / "MoE-PTQ.md",
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers", "quantization error"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "MoE PTQ handles activation outliers.",
                    "Mechanism": "The paper studies outlier smoothing and expert routing stability.",
                },
            )
            _write_test_paper(
                papers / "Alignment.md",
                title="Alignment Paper",
                aliases=["DPO"],
                topics=["preference optimization"],
                methods=["direct preference optimization"],
                settings=["RLHF setting"],
                body_sections={"What To Remember": "Preference optimization paper."},
            )

            title_out = wiki_root / ".drafts/insights/title-match"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "add-insight",
                        "--wiki-root",
                        str(wiki_root),
                        "--paper",
                        "CodeQuant",
                        "--note",
                        "Remember this when comparing expert-routing quantization failures.",
                        "--out-dir",
                        str(title_out),
                    ]
                ),
                0,
            )
            title_manifest = json.loads((title_out / "insight.json").read_text(encoding="utf-8"))
            self.assertEqual(title_manifest["match"]["target"]["match_type"], "exact alias:CodeQuant match")

            natural_out = wiki_root / ".drafts/insights/natural-match"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "add-insight",
                        "--wiki-root",
                        str(wiki_root),
                        "--paper",
                        "paper about MoE activation outliers and expert routing stability",
                        "--note",
                        "This is the right page for my MoE outlier ablation idea.",
                        "--out-dir",
                        str(natural_out),
                    ]
                ),
                0,
            )
            natural_manifest = json.loads((natural_out / "insight.json").read_text(encoding="utf-8"))
            self.assertEqual(natural_manifest["target_page"], "papers/MoE-PTQ.md")
            self.assertEqual(natural_manifest["match"]["target"]["match_type"], "retrieval match")

    def test_add_insight_blocks_ambiguous_and_no_match(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            for name in ("First", "Second"):
                _write_test_paper(
                    papers / f"{name}.md",
                    title="Shared Title",
                    aliases=["SharedAlias"],
                    topics=["shared topic"],
                    methods=["shared method"],
                    settings=["shared setting"],
                    body_sections={"What To Remember": f"{name} paper."},
                )

            ambiguous_out = wiki_root / ".drafts/insights/ambiguous"
            exit_code, stdout, _ = _run_cli_capture(
                [
                    "wiki",
                    "add-insight",
                    "--wiki-root",
                    str(wiki_root),
                    "--paper",
                    "SharedAlias",
                    "--note",
                    "This note should not be attached until the paper is disambiguated.",
                    "--out-dir",
                    str(ambiguous_out),
                ]
            )
            self.assertEqual(exit_code, 1)
            self.assertIn("Insight match status: ambiguous", stdout)
            ambiguous = json.loads((ambiguous_out / "insight.json").read_text(encoding="utf-8"))
            self.assertEqual(ambiguous["publish_state"], "blocked_disambiguation")

            missing_out = wiki_root / ".drafts/insights/missing"
            exit_code, stdout, _ = _run_cli_capture(
                [
                    "wiki",
                    "add-insight",
                    "--wiki-root",
                    str(wiki_root),
                    "--paper",
                    "totally unrelated nonmatching paper",
                    "--note",
                    "No canonical paper should match this.",
                    "--out-dir",
                    str(missing_out),
                ]
            )
            self.assertEqual(exit_code, 1)
            self.assertIn("Insight match status: no_match", stdout)

    def test_insight_lint_publish_and_retrieval_marks_user_supplied(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            paper = wiki_root / "papers/MoE-PTQ.md"
            _write_test_paper(
                paper,
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "This paper studies MoE PTQ.",
                    "Mechanism": "The method smooths activation outliers.",
                    "Implementation Hooks": "Probe expert routing variance.",
                },
            )
            out = wiki_root / ".drafts/insights/moe-routing"
            note = "For my project, use this paper when designing a routing entropy probe for MoE quantization."
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "add-insight",
                        "--wiki-root",
                        str(wiki_root),
                        "--paper",
                        "CodeQuant",
                        "--note",
                        note,
                        "--insight-type",
                        "implementation-note",
                        "--out-dir",
                        str(out),
                    ]
                ),
                0,
            )
            self.assertEqual(main(["wiki", "insight-lint", str(out / "insight.json"), "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(main(["wiki", "publish-insight", str(out / "insight.json"), "--wiki-root", str(wiki_root)]), 0)

            text = paper.read_text(encoding="utf-8")
            self.assertIn("personalized: true", text)
            self.assertIn("user_insights:", text)
            self.assertIn("## Implementation Hooks", text)
            self.assertIn("Source type: `user_interpretation`; not paper source fact: `true`", text)
            self.assertIn("## User Insight Provenance", text)
            self.assertIn("Raw note:", text)
            self.assertIn("## User Insights", text)
            self.assertIn("Canonical consumption: internalized sections above", text)
            self.assertIn("Boundary: user-supplied insight, not paper source fact or scientific evidence.", text)
            self.assertNotIn("## Source Facts", text)

            result = retrieve_papers(
                query="routing entropy probe for MoE quantization",
                wiki_root=wiki_root,
                top_k=1,
                packet_path=root / "context.md",
                result_path=root / "context.json",
            )
            self.assertEqual(result.results[0]["relative_path"], "papers/MoE-PTQ.md")
            self.assertIn("user_insight", result.results[0]["matched_source_types"])
            self.assertIn("user_interpretation", result.results[0]["matched_source_types"])
            self.assertTrue(result.results[0]["not_paper_source_fact"])
            self.assertTrue(result.results[0]["matched_insight_ids"])
            packet = (root / "context.md").read_text(encoding="utf-8")
            self.assertIn("Boundary warning: matched `User Insights`", packet)
            self.assertIn("matched personalized/internalized content", packet)
            self.assertIn("not paper source fact", packet)

            evidence = retrieve_papers(
                query="scientific evidence for routing entropy probe",
                wiki_root=wiki_root,
                top_k=1,
                packet_path=root / "evidence-context.md",
                result_path=root / "evidence-context.json",
            )
            self.assertEqual(evidence.results[0]["relative_path"], "papers/MoE-PTQ.md")
            self.assertTrue(evidence.results[0]["not_paper_source_fact"])
            evidence_packet = (root / "evidence-context.md").read_text(encoding="utf-8")
            self.assertIn("not paper source fact", evidence_packet)

    def test_insight_lint_rejects_source_fact_contamination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            paper = wiki_root / "papers/MoE-PTQ.md"
            _write_test_paper(
                paper,
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={"What To Remember": "This paper studies MoE PTQ."},
            )
            out = wiki_root / ".drafts/insights/bad"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "add-insight",
                        "--wiki-root",
                        str(wiki_root),
                        "--paper",
                        "CodeQuant",
                        "--note",
                        "The paper proves this method is always stable.",
                        "--out-dir",
                        str(out),
                    ]
                ),
                0,
            )
            manifest = json.loads((out / "insight.json").read_text(encoding="utf-8"))
            manifest["normalized_summary"] = "The paper proves this method is always stable."
            (out / "insight.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            exit_code, stdout, _ = _run_cli_capture(["wiki", "insight-lint", str(out / "insight.json"), "--wiki-root", str(wiki_root)])
            self.assertEqual(exit_code, 1)
            self.assertIn("Insight lint status: fail", stdout)
            report = json.loads((out / "insight-lint.json").read_text(encoding="utf-8"))
            self.assertIn("source_fact_contamination", {item["code"] for item in report["findings"]})

    def test_source_fact_correction_requires_recheck_and_does_not_publish_source_fact(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            paper = wiki_root / "papers/MoE-PTQ.md"
            _write_test_paper(
                paper,
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "This paper studies MoE PTQ.",
                    "Evidence Map": "Source-grounded evidence remains here.",
                },
            )
            out = wiki_root / ".drafts/insights/source-correction"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "add-insight",
                        "--wiki-root",
                        str(wiki_root),
                        "--paper",
                        "CodeQuant",
                        "--note",
                        "paper.md is wrong: the calibration claim seems missing and needs source re-check.",
                        "--insight-type",
                        "paper-correction",
                        "--out-dir",
                        str(out),
                    ]
                ),
                0,
            )
            manifest_path = out / "insight.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            correction = manifest["internalization_targets"][0]
            self.assertEqual(correction["update_type"], "source_fact_correction_request")
            self.assertTrue(correction["requires_source_recheck"])
            self.assertEqual(correction["target_section"], "Limitations / Uncertainty")

            manifest["internalization_targets"][0]["requires_source_recheck"] = False
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            exit_code, stdout, _ = _run_cli_capture(["wiki", "insight-lint", str(manifest_path), "--wiki-root", str(wiki_root)])
            self.assertEqual(exit_code, 1)
            self.assertIn("source_recheck_required", (out / "insight-lint.json").read_text(encoding="utf-8"))

            manifest["internalization_targets"][0]["requires_source_recheck"] = True
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            self.assertEqual(main(["wiki", "publish-insight", str(manifest_path), "--wiki-root", str(wiki_root)]), 0)
            text = paper.read_text(encoding="utf-8")
            self.assertIn("## Limitations / Uncertainty", text)
            self.assertIn("Source re-check required: `True`", text)
            self.assertIn("## User Insight Provenance", text)
            self.assertIn("Source-grounded evidence remains here.", text)

    def test_propose_refine_creates_draft_for_canonical_paper(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            paper = wiki_root / "papers/MoE-PTQ.md"
            _write_test_paper(
                paper,
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "This paper studies MoE PTQ.",
                    "Mechanism": "The method smooths activation outliers.",
                    "When To Retrieve This Paper": "Use for MoE quantization.",
                },
            )
            out = wiki_root / ".drafts/refinements/mechanism-depth"
            exit_code, stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "propose-refine",
                    "--wiki-root",
                    str(wiki_root),
                    "--target",
                    str(paper),
                    "--reason",
                    "Mechanism section is too shallow for implementation planning.",
                    "--note",
                    "Clarify that future readers should inspect the smoothing mechanism before using it for ablation design.",
                    "--out-dir",
                    str(out),
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Refinement target match status: matched", stdout)
            manifest = json.loads((out / "refinement.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["target_page"], "papers/MoE-PTQ.md")
            self.assertEqual(manifest["refinement_type"], "paper-refinement")
            self.assertIn("Mechanism", manifest["affected_sections"])
            self.assertIn("target_revision_before", manifest)
            self.assertTrue((out / "refinement.md").exists())
            self.assertTrue((out / "diff.md").exists())
            self.assertTrue((out / "source_context.json").exists())
            self.assertTrue((out / "publish_plan.md").exists())

    def test_refinement_lint_resolves_cwd_relative_artifact_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            previous_cwd = Path.cwd()
            try:
                os.chdir(tmp)
                wiki_root = Path("wiki")
                paper = wiki_root / "papers/MoE-PTQ.md"
                _write_test_paper(
                    paper,
                    title="MoE PTQ Paper",
                    aliases=["CodeQuant"],
                    topics=["activation outliers"],
                    methods=["MoE post-training quantization"],
                    settings=["weight-activation quantization"],
                    body_sections={"What To Remember": "This paper studies MoE PTQ."},
                )
                out = wiki_root / ".drafts/refinements/relative-path"
                self.assertEqual(
                    main(
                        [
                            "wiki",
                            "propose-refine",
                            "--wiki-root",
                            str(wiki_root),
                            "--target",
                            str(paper),
                            "--reason",
                            "Cwd-relative artifact paths should lint.",
                            "--note",
                            "Keep manifest paths usable when Meridian is run from the project root.",
                            "--out-dir",
                            str(out),
                        ]
                    ),
                    0,
                )
                self.assertEqual(main(["wiki", "refinement-lint", str(out / "refinement.json"), "--wiki-root", str(wiki_root)]), 0)
            finally:
                os.chdir(previous_cwd)

    def test_refinement_lint_publish_creates_snapshot_and_latest_retrieval_warning(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            paper = wiki_root / "papers/MoE-PTQ.md"
            _write_test_paper(
                paper,
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "This paper studies MoE PTQ.",
                    "Mechanism": "The method smooths activation outliers.",
                    "Evidence Map": "Reports quantization quality.",
                },
            )
            out = wiki_root / ".drafts/refinements/stale-claim"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "propose-refine",
                        "--wiki-root",
                        str(wiki_root),
                        "--target",
                        str(paper),
                        "--reason",
                        "The evidence claim is stale and needs warning before use.",
                        "--note",
                        "Mark this as stale for future retrieval until the evidence section is checked against newer papers.",
                        "--change-class",
                        "stale_claim_update",
                        "--out-dir",
                        str(out),
                    ]
                ),
                0,
            )
            self.assertEqual(main(["wiki", "refinement-lint", str(out / "refinement.json"), "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(main(["wiki", "publish-refinement", str(out / "refinement.json"), "--wiki-root", str(wiki_root)]), 0)

            text = paper.read_text(encoding="utf-8")
            self.assertIn("revision_id:", text)
            self.assertIn("revision_count: 1", text)
            self.assertIn('evolution_state: "stale"', text)
            self.assertIn("last_refinement_id:", text)
            self.assertIn("## Evolution Notes", text)
            snapshots = list((wiki_root / ".versions/papers/MoE-PTQ").glob("*.md"))
            self.assertEqual(len(snapshots), 1)
            self.assertIn("The method smooths activation outliers.", snapshots[0].read_text(encoding="utf-8"))

            result = retrieve_papers(
                query="stale evidence warning for MoE PTQ",
                wiki_root=wiki_root,
                top_k=5,
                packet_path=root / "context.md",
                result_path=root / "context.json",
            )
            self.assertEqual(result.results[0]["relative_path"], "papers/MoE-PTQ.md")
            self.assertEqual(result.results[0]["evolution_state"], "stale")
            packet = (root / "context.md").read_text(encoding="utf-8")
            self.assertIn("Revision:", packet)
            self.assertIn("Evolution warning:", packet)
            self.assertFalse(any(".versions/" in str(item.get("relative_path") or "") for item in result.results))

    def test_refinement_lint_blocks_stale_target_and_source_fact_without_recheck(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            paper = wiki_root / "papers/MoE-PTQ.md"
            _write_test_paper(
                paper,
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={"What To Remember": "This paper studies MoE PTQ."},
            )
            out = wiki_root / ".drafts/refinements/source-fact"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "propose-refine",
                        "--wiki-root",
                        str(wiki_root),
                        "--target",
                        str(paper),
                        "--reason",
                        "Source fact correction: the paper says a different mechanism.",
                        "--note",
                        "Correct the source-grounded mechanism after checking the PDF.",
                        "--change-class",
                        "source_fact_correction",
                        "--out-dir",
                        str(out),
                    ]
                ),
                0,
            )
            manifest_path = out / "refinement.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["source_recheck_required"] = False
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            exit_code, stdout, _ = _run_cli_capture(["wiki", "refinement-lint", str(manifest_path), "--wiki-root", str(wiki_root)])
            self.assertEqual(exit_code, 1)
            self.assertIn("Refinement lint status: fail", stdout)
            report = json.loads((out / "refinement-lint.json").read_text(encoding="utf-8"))
            self.assertIn("source_recheck_required", {item["code"] for item in report["findings"]})

            manifest["source_recheck_required"] = True
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            paper.write_text(paper.read_text(encoding="utf-8") + "\nchanged after proposal\n", encoding="utf-8")
            exit_code, _, _ = _run_cli_capture(["wiki", "refinement-lint", str(manifest_path), "--wiki-root", str(wiki_root)])
            self.assertEqual(exit_code, 1)
            report = json.loads((out / "refinement-lint.json").read_text(encoding="utf-8"))
            self.assertIn("stale_target_revision", {item["code"] for item in report["findings"]})

    def test_refinement_supports_synthesis_pages(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            synthesis = wiki_root / "syntheses/MoE-Comparison.md"
            synthesis.parent.mkdir(parents=True)
            synthesis.write_text(
                "\n".join(
                    [
                        "---",
                        'type: "synthesis"',
                        'title: "MoE Comparison"',
                        'status: "draft"',
                        'aliases:',
                        '  - "MoE comparison"',
                        'topics:',
                        '  - "MoE quantization"',
                        'methods:',
                        '  - "post-training quantization"',
                        'confidence: "low"',
                        'review_state: "published_proposal"',
                        "---",
                        "# MoE Comparison",
                        "",
                        "## Wiki Synthesis",
                        "",
                        "Current comparison is thin.",
                    ]
                ),
                encoding="utf-8",
            )
            out = wiki_root / ".drafts/refinements/synthesis"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "propose-refine",
                        "--wiki-root",
                        str(wiki_root),
                        "--target",
                        "MoE comparison",
                        "--reason",
                        "New user note changes the synthesis comparison.",
                        "--note",
                        "Add a decision note that this synthesis is for choosing ablations, not claiming paper evidence.",
                        "--change-class",
                        "decision_update",
                        "--out-dir",
                        str(out),
                    ]
                ),
                0,
            )
            manifest = json.loads((out / "refinement.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["refinement_type"], "synthesis-refinement")
            self.assertEqual(main(["wiki", "refinement-lint", str(out / "refinement.json"), "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(main(["wiki", "publish-refinement", str(out / "refinement.json"), "--wiki-root", str(wiki_root)]), 0)
            self.assertTrue(list((wiki_root / ".versions/syntheses/MoE-Comparison").glob("*.md")))
            updated = synthesis.read_text(encoding="utf-8")
            self.assertIn("## Evolution Notes", updated)
            self.assertIn("revision_count: 1", updated)

    def test_propose_refine_blocks_internal_draft_target(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            draft = wiki_root / ".drafts/ingests/run/paper.md"
            draft.parent.mkdir(parents=True)
            draft.write_text("# Draft Candidate\n", encoding="utf-8")
            out = wiki_root / ".drafts/refinements/draft-target"
            exit_code, stdout, _ = _run_cli_capture(
                [
                    "wiki",
                    "propose-refine",
                    "--wiki-root",
                    str(wiki_root),
                    "--target",
                    str(draft),
                    "--reason",
                    "Do not refine internal candidates.",
                    "--note",
                    "This should not publish.",
                    "--out-dir",
                    str(out),
                ]
            )
            self.assertEqual(exit_code, 1)
            self.assertIn("Refinement target match status: no_match", stdout)

    def test_wiki_retrieve_exact_identity_beats_crowded_shared_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "DuQuant.md",
                title="Lin et al. - 2024 - DuQuant Distributing Outliers via Dual Transformation",
                aliases=["DuQuant"],
                topics=["post-training quantization", "low-bit quantization", "activation outliers"],
                methods=["post-training quantization", "outlier-aware quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "DuQuant distributes massive and normal activation outliers before W4A4 quantization.",
                    "Mechanism": "Dual rotation and permutation transforms preserve the linear layer before quantization.",
                    "Implementation Hooks": "Probe massive-outlier detection separately from normal-outlier smoothing.",
                },
            )
            _write_test_paper(
                papers / "Generic-PTQ.md",
                title="Generic Accurate Post-Training Quantization for Transformers",
                aliases=["Post-Training"],
                topics=["post-training quantization", "low-bit quantization", "activation outliers"],
                methods=["post-training quantization", "outlier-aware quantization", "calibration-aware PTQ"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "A broad PTQ page with many shared quantization terms.",
                    "Mechanism": "Quantization uses calibration data and generic activation outlier handling.",
                    "Evidence Map": "Reports accuracy, perplexity, and latency on common benchmarks.",
                },
            )

            result = retrieve_papers(
                query=(
                    "I am looking for the paper or closely related work on DuQuant about "
                    "post-training quantization, outlier-aware quantization, low-bit quantization, "
                    "and weight-activation quantization."
                ),
                wiki_root=wiki_root,
                top_k=2,
            )

            self.assertEqual(result.results[0]["relative_path"], "papers/DuQuant.md")
            self.assertIn("exact identity match", result.results[0]["selection_reasons"])

    def test_primary_paper_key_prefers_target_method_over_baseline_mentions(self) -> None:
        pages = [
            PageExtraction(
                page_number=1,
                text=(
                    "DuQuant: Distributing Outliers via Dual Transformation Makes Stronger Quantized LLMs\n"
                    "Abstract\nExisting methods such as SmoothQuant and QuaRot motivate the problem, "
                    "but DuQuant is the method proposed in this paper."
                ),
                section_hint="Abstract",
                image_path="",
                image_count=0,
                drawing_count=0,
            )
        ]

        self.assertEqual(_primary_paper_key(pages), "duquant")

    def test_retrieval_section_intent_covers_tradeoff_and_evaluation_language(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "KV-Cache-Method.md",
                title="KV Cache Method",
                aliases=["KV cache compression"],
                topics=["KV-cache compression", "long-context inference"],
                methods=["KV-cache compression"],
                settings=["KV-cache compression setting"],
                body_sections={
                    "What To Remember": "A KV-cache compression page.",
                    "Mechanism": "The method keeps a subset of key/value cache entries.",
                    "Evidence Map": "Evaluation reports memory, latency, quality, and sequence length.",
                    "Limitations / Uncertainty": "Failure boundaries include retention tradeoffs and task-specific quality loss.",
                },
            )

            result = retrieve_papers(
                query=(
                    "I need KV-cache memory tradeoffs, failure boundaries, evaluation metrics, "
                    "and quality risks before changing a long-context decoding cache budget."
                ),
                wiki_root=wiki_root,
                top_k=1,
            )

            headings = {item["heading"] for item in result.results[0]["matched_sections"]}
            self.assertIn("Evidence Map", headings)
            self.assertIn("Limitations / Uncertainty", headings)

    def test_wiki_retrieve_v1_suppresses_source_quality_hold_for_scientific_query(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "Good-PINN.md",
                title="Physics-informed Neural Networks",
                aliases=["PINN"],
                topics=["physics-informed neural networks", "partial differential equations"],
                methods=["PDE residual loss"],
                settings=["scientific ML"],
                body_sections={
                    "What To Remember": "PINNs fit neural networks with PDE residual losses and boundary conditions.",
                    "Mechanism": "Autodiff computes PDE residuals at collocation points.",
                    "Implementation Hooks": "Test residual shapes, boundary losses, and inverse-problem parameters.",
                },
            )
            _write_test_paper(
                papers / "Bad-PINN-OCR.md",
                title="Broken OCR Physics Paper",
                aliases=["PINN OCR"],
                topics=["physics-informed neural networks", "partial differential equations"],
                methods=["PDE residual loss"],
                settings=["scientific ML"],
                body_sections={
                    "What To Remember": "OCR text is too weak to trust.",
                    "Mechanism": "The extracted mechanism is incomplete.",
                },
                review_state="source_quality_hold",
                quality_gate="warn",
                confidence="low",
            )

            result = retrieve_papers(
                query="I need PDE residual losses and boundary condition implementation tests for scientific ML.",
                wiki_root=wiki_root,
                top_k=2,
                strategy="v1",
            )

            self.assertEqual(result.results[0]["relative_path"], "papers/Good-PINN.md")
            self.assertIn("source-quality evidence guard", result.results[1]["selection_reasons"])

    def test_retrieval_optimization_eval_writes_side_by_side_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "KV-Cache.md",
                title="KV Cache Compression",
                aliases=["KV cache compression"],
                topics=["KV-cache compression", "long-context inference"],
                methods=["KV-cache compression"],
                settings=["long-context decoding"],
                body_sections={
                    "What To Remember": "Reduces long-context decoding memory by selecting cache entries.",
                    "Mechanism": "A retention budget controls which key/value entries remain.",
                    "Evidence Map": "Reports memory, latency, quality, and sequence length tradeoffs.",
                    "Implementation Hooks": "Probe retention ratio, cache budget, tensor shapes, and quality loss.",
                    "Limitations / Uncertainty": "Failure boundaries depend on task and retention budget.",
                },
            )
            _write_test_paper(
                papers / "MoEQuant.md",
                title="MoE Quantization",
                aliases=["MoEQuant"],
                topics=["MoE quantization"],
                methods=["post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "Quantization paper unrelated to KV-cache retention.",
                    "Mechanism": "Balances experts for quantization.",
                },
            )
            cases = root / "cases.jsonl"
            case = {
                "id": "kv-memory-optimization",
                "category": "retrieval_optimization",
                "query": "I want to reduce long-context decoding memory with KV-cache compression and need retention budget evidence.",
                "problem_description": "Find KV-cache papers, not quantization distractors.",
                "required_page_families": ["papers/*KV-Cache*"],
                "acceptable_adjacent_pages": [],
                "required_sections": [{"page": "papers/*KV-Cache*", "sections": ["Mechanism", "Evidence Map", "Implementation Hooks"]}],
                "expected_evidence_types": ["memory", "latency", "quality"],
                "hard_distractors": ["papers/*MoEQuant*"],
                "must_not_retrieve_as_evidence": [],
                "context_packet_expectations": ["retention budget", "cache budget", "quality tradeoffs"],
                "rubric": ["Required family is retrieved and distractor is suppressed."],
            }
            cases.write_text(json.dumps(case) + "\n", encoding="utf-8")
            rubric = root / "rubric.md"
            rubric.write_text("# Rubric\n", encoding="utf-8")
            out_dir = root / "retrieval-opt"

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieval-optimize-eval",
                        str(cases),
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(out_dir),
                        "--rubric",
                        str(rubric),
                        "--overwrite",
                    ]
                ),
                0,
            )

            case_dir = out_dir / "kv-memory-optimization"
            self.assertTrue((case_dir / "context.v0.md").exists())
            self.assertTrue((case_dir / "context.v1.md").exists())
            self.assertTrue((case_dir / "judge-packet.md").exists())
            summary = json.loads((out_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["total_cases"], 1)
            self.assertIn("query_intent_coverage", summary["metrics"]["v1"])

    def test_retrieval_optimization_eval_accepts_family_groups(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "WeightOnly.md",
                title="Weight-only Quantization Exemplar",
                aliases=["weight-only exemplar"],
                topics=["low-bit quantization"],
                methods=["post-training quantization"],
                settings=["weight-only quantization"],
                body_sections={
                    "What To Remember": "A weight-only quantization method for LLM inference.",
                    "Mechanism": "Quantizes weights while leaving activations outside the quantized path.",
                    "Limitations / Uncertainty": "Do not treat this as an activation quantization method.",
                },
            )
            _write_test_paper(
                papers / "WeightActivation.md",
                title="Weight Activation Quantization Exemplar",
                aliases=["weight-activation exemplar"],
                topics=["low-bit quantization", "activation outliers"],
                methods=["outlier-aware quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "A weight-activation quantization method for LLM inference.",
                    "Mechanism": "Quantizes activations and weights together under an activation-smoothing contract.",
                    "Limitations / Uncertainty": "Activation range assumptions do not transfer to weight-only methods.",
                },
            )
            cases = root / "cases.jsonl"
            case = {
                "id": "regime-groups",
                "category": "retrieval_optimization",
                "query": "Compare weight-only quantization with weight-activation quantization for LLM inference.",
                "problem_description": "The result should cover both regimes without requiring one unique paper path.",
                "required_page_families": [],
                "required_page_family_groups": [
                    ["papers/*WeightOnly*"],
                    ["papers/*WeightActivation*"],
                ],
                "required_sections": [],
                "required_section_groups": [
                    {"id": "weight-only", "page_families": ["papers/*WeightOnly*"], "sections": ["Mechanism"]},
                    {
                        "id": "weight-activation",
                        "page_families": ["papers/*WeightActivation*"],
                        "sections": ["Mechanism"],
                    },
                ],
                "acceptable_adjacent_pages": [],
                "expected_evidence_types": ["weight-only", "activation"],
                "hard_distractors": [],
                "must_not_retrieve_as_evidence": [],
                "context_packet_expectations": ["regime distinction"],
                "rubric": ["At least one page from each required family group should be present."],
            }
            cases.write_text(json.dumps(case) + "\n", encoding="utf-8")
            out_dir = root / "retrieval-opt"

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieval-optimize-eval",
                        str(cases),
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(out_dir),
                        "--overwrite",
                    ]
                ),
                0,
            )

            summary = json.loads((out_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["metrics"]["v1"]["decisions"], {"pass": 1})

    def test_domain_general_eval_cases_are_parseable(self) -> None:
        ingest_cases = Path("eval/cases/domain_general_paper_ingest.jsonl")
        retrieval_cases = Path("eval/cases/domain_general_idea_retrieval.jsonl")
        rubric = Path("eval/rubrics/domain_general_paper_wiki_quality_v0.md")
        self.assertTrue(ingest_cases.exists())
        self.assertTrue(retrieval_cases.exists())
        self.assertTrue(rubric.exists())

        ingest_domains = set()
        for line in ingest_cases.read_text(encoding="utf-8").splitlines():
            case = json.loads(line)
            ingest_domains.add(case["domain"])
            self.assertIn("expected_result", case)
            self.assertIn("must_not_do", case)
        self.assertGreaterEqual(len(ingest_domains), 10)

        retrieval_ids = []
        for line in retrieval_cases.read_text(encoding="utf-8").splitlines():
            case = json.loads(line)
            retrieval_ids.append(case["id"])
            self.assertEqual(case["category"], "domain_general_idea_retrieval")
            self.assertTrue(case["required_pages"])
            self.assertTrue(case["required_sections"])
            self.assertIn("judge_rubric", case)
        self.assertGreaterEqual(len(retrieval_ids), 6)

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
            self.assertIn("deterministic_review_state", flow)
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
            self.assertIn("retrieval_intent_quality", dimensions)
            self.assertIn("metadata_routing_integrity", dimensions)

    def test_quality_check_penalizes_noisy_method_summaries(self) -> None:
        score = _candidate_record_score(
            claims=[{"id": "claim-1", "provenance": [{"page": 1}]}],
            methods=[
                {
                    "id": "method-1",
                    "summary": "Our observations reveal " + ("generic background sentence. " * 25),
                    "inputs": ["input"],
                    "outputs": ["output"],
                }
            ],
            evidence=[{"id": "evidence-1", "supports": ["claim-1"]}],
        )

        self.assertLessEqual(score["score"], 3.5)
        self.assertIn("noisy_method_summaries:method-1", score["findings"])

    def test_retrieval_taxonomy_allows_descriptive_title_topics(self) -> None:
        score = _retrieval_taxonomy_boundary_score(
            {
                "title": "Quantization Error Propagation: Revisiting Layer-Wise Post-Training Quantization",
                "aliases": ["Quantization Error Propagation", "QEP"],
                "methods": ["post-training quantization", "layer-wise PTQ"],
                "topics": ["post-training quantization", "quantization error", "error propagation"],
                "settings": ["weight-only quantization"],
            },
            [{"name": "Quantization Error Propagation", "short_name": "QEP"}],
        )

        self.assertEqual(score["score"], 5.0)
        self.assertEqual(score["findings"], [])

    def test_retrieval_taxonomy_rejects_alias_topics(self) -> None:
        score = _retrieval_taxonomy_boundary_score(
            {
                "title": "CodeQuant: Unified Clustering and Quantization",
                "aliases": ["CodeQuant", "AOS"],
                "methods": ["post-training quantization"],
                "topics": ["codequant", "activation outliers"],
                "settings": ["weight-activation quantization"],
            },
            [{"name": "Activation-Oriented Outlier Smoothing", "short_name": "AOS"}],
        )

        self.assertLessEqual(score["score"], 3.0)
        self.assertIn("topics_contain_title_or_alias:codequant", score["findings"])

    def test_retrieval_intent_quality_rejects_negative_rule_lists(self) -> None:
        score = _retrieval_intent_quality_score(
            {
                "When To Retrieve This Paper": "\n".join(
                    [
                        "Canonical retrieval fits:",
                        '- Query: "Compare post-training quantization; MoE quantization; outlier-aware quantization."',
                        "  Use because: It says to inspect frontmatter.",
                        '- Query: "Check accuracy; perplexity; latency."',
                        "  Use because: It says to inspect frontmatter.",
                        "",
                        "Do not use it when:",
                        "- You need QAT evidence unless directly compared.",
                        "- You need a generic survey page.",
                    ]
                )
            }
        )

        self.assertLessEqual(score["score"], 3.0)
        self.assertIn("negative_rule_list_present", score["findings"])
        self.assertIn("routing_cases_look_like_metadata_list", score["findings"])

    def test_retrieval_intent_quality_rejects_non_standalone_queries(self) -> None:
        score = _retrieval_intent_quality_score(
            {
                "When To Retrieve This Paper": "\n".join(
                    [
                        "Canonical retrieval fits:",
                        '- Query: "I am implementing probes or ablations around AOS, ACCF, POG, LUT."',
                        "  Use because: The component list is below.",
                        '- Query: "I need to check whether the mechanism is supported by experiments rather than just plausible."',
                        "  Use because: It has evidence.",
                        '- Query: "I am deciding whether this paper is strong enough support for a new research direction."',
                        "  Use because: It has caveats.",
                        "",
                        "Scope notes:",
                        "- Primary fit: MoE post-training quantization.",
                        "- Adjacent fit: weight-only PTQ comparisons.",
                        "- Weak fit: QAT.",
                    ]
                )
            }
        )

        self.assertLessEqual(score["score"], 3.0)
        self.assertIn("query_assumes_paper_already_retrieved", score["findings"])
        self.assertIn("query_is_retrofit_to_component_list", score["findings"])

    def test_retrieval_scenarios_are_standalone_before_page_retrieval(self) -> None:
        scenarios = _retrieval_scenarios(
            {
                "title": "CodeQuant: Unified Clustering and Quantization",
                "methods": ["MoE post-training quantization"],
                "topics": ["activation outliers", "quantization error"],
                "settings": ["weight-activation quantization"],
                "datasets": ["WikiText2"],
                "metrics": ["perplexity"],
            },
            [{"name": "Activation-Oriented Outlier Smoothing", "short_name": "AOS"}],
            [],
            [],
        )
        scenario_text = "\n".join(str(item["query"]) for item in scenarios).lower()

        self.assertIn("modifying a codequant implementation", scenario_text)
        self.assertNotIn("this paper", scenario_text)
        self.assertNotIn("the paper", scenario_text)
        self.assertNotIn("the mechanism", scenario_text)
        self.assertNotIn("this method", scenario_text)

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

    def test_structural_check_flags_non_standalone_retrieval_examples(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / "fake.pdf"
            pdf.write_bytes(b"%PDF fake")
            out = root / "wiki/.drafts/ingests/fake-paper"
            packet = root / "structural-self-check.json"

            self.assertEqual(main(["wiki", "ingest", str(pdf), "--out", str(out)]), 0)
            paper = out / "paper.md"
            text = paper.read_text(encoding="utf-8")
            text = text.replace(
                'Query: "I want to compare or adapt',
                'Query: "I need to check whether this paper supports',
                1,
            )
            paper.write_text(text, encoding="utf-8")
            self.assertEqual(
                main(["wiki", "structural-check", str(out / "run.json"), "--out", str(packet)]),
                0,
            )

            payload = json.loads(packet.read_text(encoding="utf-8"))
            dimensions = {item["dimension"]: item for item in payload["dimension_scores"]}
            source_dimension = dimensions["frontmatter_body_source_of_truth"]
            self.assertLessEqual(source_dimension["score"], 3.0)
            self.assertIn("query_assumes_already_retrieved_page", source_dimension["findings"])

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

    def test_retrieval_eval_runner_writes_metrics_and_judge_packets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "MoE-PTQ.md",
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers", "quantization error"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "A MoE post-training quantization page about activation outliers.",
                    "Mechanism": "The method smooths activation outliers and clusters weights.",
                    "Implementation Hooks": "Add ablations for activation outlier smoothing and weight clustering.",
                },
            )
            _write_test_paper(
                papers / "Alignment.md",
                title="Alignment Paper",
                aliases=["DPO"],
                topics=["preference optimization"],
                methods=["direct preference optimization"],
                settings=["RLHF setting"],
                body_sections={"What To Remember": "A preference optimization paper."},
            )
            cases = root / "retrieval-cases.jsonl"
            case = {
                "id": "retrieval-moe-001",
                "category": "wiki_retrieval_quality",
                "query": "I need MoE post-training quantization papers for activation outlier ablations.",
                "intent": "implementation_probe",
                "wiki_fixture": "unit-test",
                "required_pages": ["papers/MoE-PTQ.md"],
                "acceptable_pages": [],
                "distractor_pages": ["papers/Alignment.md"],
                "required_sections": [
                    {"page": "papers/MoE-PTQ.md", "sections": ["Mechanism", "Implementation Hooks"]}
                ],
                "expected_context_properties": ["Surface implementation hooks and mechanism sections."],
                "must_not_do": ["Do not rank alignment papers above MoE PTQ."],
                "judge_rubric": ["page_selection", "section_selection"],
            }
            cases.write_text(json.dumps(case) + "\n", encoding="utf-8")
            rubric = root / "retrieval-rubric.md"
            rubric.write_text("# Retrieval Rubric\n", encoding="utf-8")
            out_dir = root / "retrieval-eval"

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieval-eval",
                        str(cases),
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(out_dir),
                        "--rubric",
                        str(rubric),
                        "--top-k",
                        "2",
                    ]
                ),
                0,
            )

            manifest = json.loads((out_dir / "retrieval_manifest.json").read_text(encoding="utf-8"))
            summary = json.loads((out_dir / "retrieval_summary.json").read_text(encoding="utf-8"))
            result = manifest["results"][0]
            metrics = result["metrics"]
            self.assertEqual(manifest["schema_version"], "meridian.wiki_retrieval_eval.v0")
            self.assertEqual(result["status"], "evaluated")
            self.assertEqual(metrics["deterministic_decision"], "pass")
            self.assertEqual(metrics["required_recall_at_k"], 1.0)
            self.assertEqual(metrics["section_hit_rate"], 1.0)
            self.assertEqual(metrics["distractor_hits"], [])
            self.assertTrue(Path(result["context_packet"]).exists())
            self.assertTrue(Path(result["context_json"]).exists())
            judge_packet = Path(result["judge_packet"]).read_text(encoding="utf-8")
            self.assertIn("# Wiki Retrieval Judge Packet", judge_packet)
            self.assertIn("Retrieval Rubric", judge_packet)
            self.assertEqual(summary["deterministic_decisions"]["pass"], 1)

            judge_result_path = Path(result["judge_result_expected_path"])
            judge_result_path.write_text(
                json.dumps(
                    {
                        "schema_version": "meridian.wiki_retrieval_judge_result.v0",
                        "case_id": "retrieval-moe-001",
                        "decision": "pass",
                        "weighted_score": 4.5,
                        "dimension_scores": {},
                        "hard_fails": [],
                        "findings": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            self.assertEqual(main(["wiki", "retrieval-eval-summary", str(out_dir / "retrieval_manifest.json")]), 0)
            summary = json.loads((out_dir / "retrieval_summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["judge_results"], 1)
            self.assertEqual(summary["judge_decisions"]["pass"], 1)

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieval-eval",
                        str(cases),
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(out_dir),
                        "--rubric",
                        str(rubric),
                        "--top-k",
                        "2",
                        "--overwrite",
                    ]
                ),
                0,
            )
            summary = json.loads((out_dir / "retrieval_summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["judge_results"], 0)
            self.assertFalse(judge_result_path.exists())

    def test_retrieval_eval_runner_generalizes_across_domains_and_intents(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "Alignment-RLHF.md",
                title="Alignment RLHF Paper",
                aliases=["DPO", "preference optimization"],
                topics=["preference data", "reward hacking", "policy alignment"],
                methods=["direct preference optimization", "reward modeling"],
                settings=["RLHF setting", "instruction tuning"],
                body_sections={
                    "What To Remember": "A preference optimization page for aligning policies from comparison data.",
                    "Mechanism": "The method transforms preference pairs into a policy update without an online reward model.",
                    "Evidence Map": "Reports win rate, reward model agreement, and benchmark comparisons against supervised fine-tuning.",
                    "Limitations / Uncertainty": "Scope depends on preference data quality and can fail under reward hacking or distribution shift.",
                },
            )
            _write_test_paper(
                papers / "Agent-Tool-Use.md",
                title="Agent Tool Use Paper",
                aliases=["toolformer", "function calling"],
                topics=["tool use", "agent planning", "external memory"],
                methods=["tool-augmented language modeling", "planning with tools"],
                settings=["agent setting", "tool calling"],
                body_sections={
                    "What To Remember": "A tool-use agent page about deciding when to call external tools.",
                    "Mechanism": "The agent inserts tool calls, observes outputs, and conditions later reasoning on returned evidence.",
                    "Implementation Hooks": "Log tool-call decisions, failed calls, observation use, and ablate tool availability.",
                    "Limitations / Uncertainty": "Tool-use gains depend on reliable tool outputs and task distributions with useful external actions.",
                },
            )
            _write_test_paper(
                papers / "Audio-Language-Model.md",
                title="Audio Language Model Paper",
                aliases=["speech LLM", "audio instruction tuning"],
                topics=["audio-language modeling", "speech understanding", "multimodal evaluation"],
                methods=["audio-language instruction tuning", "speech encoder adapter"],
                settings=["multimodal audio setting", "speech evaluation"],
                body_sections={
                    "What To Remember": "An audio-language model page about adapting speech encoders into language models.",
                    "Mechanism": "The method maps acoustic representations into a language model token interface.",
                    "Evidence Map": "Evaluates speech recognition, spoken question answering, and audio instruction-following benchmarks.",
                    "Limitations / Uncertainty": "Evidence may not transfer to noisy long-form audio or unseen languages.",
                },
            )
            _write_test_paper(
                papers / "Quantization-Distractor.md",
                title="Quantization Distractor",
                aliases=["CodeQuant"],
                topics=["activation outliers", "quantization error"],
                methods=["post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "A quantization page that should not satisfy alignment, agents, or audio queries.",
                    "Mechanism": "The method smooths outliers for low-bit inference.",
                },
            )
            cases = root / "generalized-retrieval-cases.jsonl"
            cases.write_text(
                "\n".join(
                    json.dumps(case)
                    for case in [
                        {
                            "id": "general-alignment-scope-001",
                            "category": "wiki_retrieval_quality",
                            "query": "I am deciding whether preference optimization evidence is strong enough for an RLHF alignment baseline, and I need limitations around reward hacking and preference data quality.",
                            "intent": "scope_limit",
                            "wiki_fixture": "unit-test",
                            "required_pages": ["papers/Alignment-RLHF.md"],
                            "acceptable_pages": [],
                            "distractor_pages": ["papers/Quantization-Distractor.md"],
                            "required_sections": [
                                {"page": "papers/Alignment-RLHF.md", "sections": ["Evidence Map", "Limitations / Uncertainty"]}
                            ],
                            "expected_context_properties": [
                                "Surface preference optimization evidence and limitations, not quantization mechanics."
                            ],
                            "must_not_do": ["Do not rank quantization pages for RLHF alignment scope queries."],
                            "judge_rubric": ["scope_reasoning", "evidence_alignment"],
                        },
                        {
                            "id": "general-agent-implementation-001",
                            "category": "wiki_retrieval_quality",
                            "query": "Before implementing a tool-use agent baseline, I need papers that explain when the agent should call tools, how observations feed back into reasoning, and which ablations would show whether tool access is actually used.",
                            "intent": "implementation_probe",
                            "wiki_fixture": "unit-test",
                            "required_pages": ["papers/Agent-Tool-Use.md"],
                            "acceptable_pages": [],
                            "distractor_pages": ["papers/Quantization-Distractor.md"],
                            "required_sections": [
                                {"page": "papers/Agent-Tool-Use.md", "sections": ["Mechanism", "Implementation Hooks"]}
                            ],
                            "expected_context_properties": [
                                "Surface mechanism and implementation hooks for tool-use decisions."
                            ],
                            "must_not_do": ["Do not satisfy an agent implementation query with generic model optimization pages."],
                            "judge_rubric": ["implementation_usefulness", "section_selection"],
                        },
                        {
                            "id": "general-audio-evidence-001",
                            "category": "wiki_retrieval_quality",
                            "query": "I need audio-language model papers with evidence on speech understanding and spoken question answering, plus caveats about transfer to noisy or multilingual audio.",
                            "intent": "evidence_check",
                            "wiki_fixture": "unit-test",
                            "required_pages": ["papers/Audio-Language-Model.md"],
                            "acceptable_pages": [],
                            "distractor_pages": ["papers/Quantization-Distractor.md"],
                            "required_sections": [
                                {"page": "papers/Audio-Language-Model.md", "sections": ["Evidence Map", "Limitations / Uncertainty"]}
                            ],
                            "expected_context_properties": [
                                "Surface audio evaluation evidence and transfer caveats."
                            ],
                            "must_not_do": ["Do not over-retrieve unrelated low-bit inference pages."],
                            "judge_rubric": ["evidence_alignment", "uncertainty_reporting"],
                        },
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            out_dir = root / "retrieval-eval"

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieval-eval",
                        str(cases),
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(out_dir),
                        "--top-k",
                        "3",
                    ]
                ),
                0,
            )

            summary = json.loads((out_dir / "retrieval_summary.json").read_text(encoding="utf-8"))
            manifest = json.loads((out_dir / "retrieval_manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["deterministic_decisions"]["pass"], 3)
            self.assertEqual(summary["average_required_recall_at_k"], 1.0)
            self.assertEqual(summary["average_section_hit_rate"], 1.0)
            for result in manifest["results"]:
                self.assertNotEqual(result["metrics"]["retrieved_pages"][0], "papers/Quantization-Distractor.md")
                self.assertNotIn("top_result_is_declared_distractor", result["metrics"]["hard_fails"])
                context = Path(result["context_packet"]).read_text(encoding="utf-8")
                self.assertIn("Read first:", context)

    def test_retrieval_eval_runner_routes_source_quality_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "Scanned-PDF-Hold.md",
                title="Scanned PDF Hold",
                aliases=["bad extraction"],
                topics=["source quality", "OCR cleanup", "metadata repair"],
                methods=["source-quality triage"],
                settings=["scanned PDF", "missing provenance"],
                body_sections={
                    "What To Remember": "This is a source-quality hold, not reliable paper knowledge.",
                    "Mechanism": "Do OCR or obtain a cleaner PDF before extracting claims.",
                    "Limitations / Uncertainty": "Scientific synthesis is blocked because extraction text is too weak.",
                },
                review_state="source_text_insufficient",
                quality_gate="fail",
                confidence="low",
            )
            _write_test_paper(
                papers / "Reliable-Paper.md",
                title="Reliable Paper",
                aliases=["clean source"],
                topics=["language model evaluation"],
                methods=["benchmark evaluation"],
                settings=["clean PDF"],
                body_sections={
                    "What To Remember": "A reliable paper page about benchmark methodology.",
                    "Evidence Map": "The paper reports benchmark results with standard dataset splits.",
                },
                review_state="auto_converged",
                quality_gate="pass",
                confidence="high",
            )
            cases = root / "source-quality-cases.jsonl"
            case = {
                "id": "source-quality-cleanup-unit-001",
                "category": "wiki_retrieval_quality",
                "query": "Find source quality cleanup targets with bad OCR, missing provenance, weak metadata, or scanned PDF extraction holds. I want cleanup work, not scientific evidence.",
                "intent": "source_quality",
                "wiki_fixture": "unit-test",
                "required_pages": ["papers/Scanned-PDF-Hold.md"],
                "acceptable_pages": [],
                "distractor_pages": ["papers/Reliable-Paper.md"],
                "required_sections": [
                    {"page": "papers/Scanned-PDF-Hold.md", "sections": ["Limitations / Uncertainty"]}
                ],
                "expected_context_properties": [
                    "Return low-confidence source-quality holds as cleanup targets."
                ],
                "must_not_do": ["Do not present reliable high-confidence pages as cleanup targets."],
                "judge_rubric": ["source_quality_routing", "uncertainty_reporting"],
            }
            cases.write_text(json.dumps(case) + "\n", encoding="utf-8")
            out_dir = root / "retrieval-eval"

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieval-eval",
                        str(cases),
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(out_dir),
                        "--top-k",
                        "1",
                    ]
                ),
                0,
            )

            manifest = json.loads((out_dir / "retrieval_manifest.json").read_text(encoding="utf-8"))
            summary = json.loads((out_dir / "retrieval_summary.json").read_text(encoding="utf-8"))
            metrics = manifest["results"][0]["metrics"]
            self.assertEqual(metrics["deterministic_decision"], "pass")
            self.assertEqual(metrics["source_quality_routing"]["quality_hits"], ["papers/Scanned-PDF-Hold.md"])
            self.assertEqual(metrics["source_quality_routing"]["reliable_evidence_hits"], [])
            self.assertEqual(summary["source_quality_routing_pass_rate"], 1.0)

    def test_retrieval_audit_runs_generated_queries_for_each_paper(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "Alignment-RLHF.md",
                title="Alignment RLHF Paper",
                aliases=["DPO"],
                topics=["preference data", "policy alignment"],
                methods=["direct preference optimization", "reward modeling"],
                settings=["RLHF setting"],
                body_sections={
                    "What To Remember": "A preference optimization page for policy alignment.",
                    "Mechanism": "The method turns preference pairs into a policy objective.",
                    "Evidence Map": "Reports win rate and reward model agreement.",
                    "Limitations / Uncertainty": "Preference data quality controls transfer.",
                },
            )
            _write_test_paper(
                papers / "Agent-Tool-Use.md",
                title="Agent Tool Use Paper",
                aliases=["toolformer"],
                topics=["tool use", "agent planning"],
                methods=["tool-augmented language modeling"],
                settings=["agent setting", "tool calling"],
                body_sections={
                    "What To Remember": "A tool-use page about external action selection.",
                    "Mechanism": "The agent calls tools and conditions later reasoning on observations.",
                    "Implementation Hooks": "Ablate tool availability and log failed calls.",
                    "Limitations / Uncertainty": "Tool reliability bounds usefulness.",
                },
            )
            out_dir = root / "audit"

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieval-audit",
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(out_dir),
                        "--top-k",
                        "2",
                        "--queries-per-paper",
                        "3",
                    ]
                ),
                0,
            )

            manifest = json.loads((out_dir / "retrieval_audit_manifest.json").read_text(encoding="utf-8"))
            summary = json.loads((out_dir / "retrieval_audit_summary.json").read_text(encoding="utf-8"))
            report = (out_dir / "retrieval_audit_summary.md").read_text(encoding="utf-8")
            self.assertEqual(manifest["schema_version"], "meridian.wiki_retrieval_audit.v0")
            self.assertEqual(manifest["audited_papers"], 2)
            self.assertEqual(summary["paper_count"], 2)
            self.assertEqual(summary["query_count"], 6)
            self.assertEqual(summary["query_recall_at_k"], 1.0)
            self.assertIn("Retrieval Audit Summary", report)
            for paper in manifest["papers"]:
                self.assertEqual(paper["target_recall"], 1.0)
                self.assertEqual(paper["query_count"], 3)
                for query in paper["queries"]:
                    self.assertTrue(Path(query["context_packet"]).exists())
                    self.assertTrue(Path(query["context_json"]).exists())
                    self.assertIn(query["target_page"], query["retrieved_pages"])

    def test_retrieval_audit_evidence_queries_include_method_discriminator(self) -> None:
        queries = generate_audit_queries(
            {
                "title": "FlatQuant",
                "routing": {
                    "methods": ["rotation-based quantization", "post-training quantization"],
                    "topics": ["activation outliers", "quantization error"],
                    "settings": ["weight-activation quantization"],
                    "datasets": ["WikiText2"],
                    "metrics": ["perplexity"],
                },
            }
        )

        evidence_query = next(query for query in queries if query["intent"] == "evidence_scope")
        method_query = next(query for query in queries if query["intent"] == "method_design")
        implementation_query = next(query for query in queries if query["intent"] == "implementation_probe")
        self.assertIn("FlatQuant", method_query["query"])
        self.assertIn("FlatQuant", implementation_query["query"])
        self.assertIn("rotation-based quantization", evidence_query["query"])
        self.assertIn("FlatQuant", evidence_query["query"])
        self.assertIn("activation outliers", evidence_query["query"])
        self.assertIn("WikiText2", evidence_query["query"])
        self.assertIn("methods", evidence_query["source_fields"])
        self.assertEqual(evidence_query["source_fields"]["methods"], ["rotation-based quantization"])

    def test_propose_writeback_creates_draft_without_canonical_publish(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "MoE-PTQ.md",
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "A MoE PTQ page.",
                    "Implementation Hooks": "Add ablations for activation outlier smoothing.",
                },
            )
            context_json = root / "context.json"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieve",
                        "MoE PTQ activation outlier ablations",
                        "--wiki-root",
                        str(wiki_root),
                        "--json-out",
                        str(context_json),
                    ]
                ),
                0,
            )
            body = root / "body.md"
            body.write_text("Compare MoE PTQ outlier smoothing papers before implementing ablations.", encoding="utf-8")

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "propose-writeback",
                        "--wiki-root",
                        str(wiki_root),
                        "--query",
                        "MoE PTQ activation outlier ablations",
                        "--context",
                        str(context_json),
                        "--title",
                        "MoE PTQ Ablation Reading Plan",
                        "--proposal-type",
                        "synthesis",
                        "--body-file",
                        str(body),
                        "--notes",
                        "User wants this as a research planning synthesis.",
                    ]
                ),
                0,
            )

            proposal = wiki_root / ".drafts/proposals/MoE-PTQ-Ablation-Reading-Plan/proposal.md"
            manifest = wiki_root / ".drafts/proposals/MoE-PTQ-Ablation-Reading-Plan/proposal.json"
            self.assertTrue(proposal.exists())
            self.assertTrue(manifest.exists())
            text = proposal.read_text(encoding="utf-8")
            self.assertIn('type: "synthesis"', text)
            self.assertIn('proposal_id: "MoE-PTQ-Ablation-Reading-Plan"', text)
            self.assertIn("source_papers:", text)
            self.assertIn("## What This Page Is For", text)
            self.assertIn("## Source Facts", text)
            self.assertIn("## Wiki Synthesis", text)
            self.assertIn("## User Ideas / Decisions", text)
            self.assertIn("## Evidence Map", text)
            self.assertIn("## Retrieval Hooks", text)
            self.assertIn("[[papers/MoE-PTQ|MoE PTQ Paper]]", text)
            self.assertTrue((wiki_root / ".drafts/proposals/MoE-PTQ-Ablation-Reading-Plan/source_context.json").exists())
            self.assertTrue((wiki_root / ".drafts/proposals/MoE-PTQ-Ablation-Reading-Plan/publish_plan.md").exists())
            self.assertFalse((wiki_root / "syntheses/MoE-PTQ-Ablation-Reading-Plan.md").exists())
            log = (wiki_root / "log.md").read_text(encoding="utf-8")
            self.assertIn("query | MoE PTQ Ablation Reading Plan", log)

    def test_proposal_lint_and_publish_create_retrievable_synthesis(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "MoE-PTQ.md",
                title="MoE PTQ Paper",
                aliases=["CodeQuant"],
                topics=["activation outliers", "quantization error"],
                methods=["MoE post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "A MoE PTQ page.",
                    "Mechanism": "Activation smoothing and clustering reduce quantization error.",
                    "Implementation Hooks": "Add ablations for activation outlier smoothing.",
                    "Evidence Map": "Reports perplexity and kernel speedups.",
                },
            )
            context_json = root / "context.json"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieve",
                        "MoE PTQ activation outlier ablations",
                        "--wiki-root",
                        str(wiki_root),
                        "--json-out",
                        str(context_json),
                    ]
                ),
                0,
            )
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "propose-writeback",
                        "--wiki-root",
                        str(wiki_root),
                        "--query",
                        "MoE PTQ activation outlier ablations",
                        "--context",
                        str(context_json),
                        "--title",
                        "MoE PTQ Ablation Reading Plan",
                        "--proposal-type",
                        "method-family",
                        "--user-note",
                        "I want probes that separate smoothing from clustering.",
                    ]
                ),
                0,
            )
            manifest = wiki_root / ".drafts/proposals/MoE-PTQ-Ablation-Reading-Plan/proposal.json"
            lint_path = root / "proposal-lint.json"
            self.assertEqual(
                main(["wiki", "proposal-lint", str(manifest), "--wiki-root", str(wiki_root), "--out", str(lint_path)]),
                0,
            )
            lint_payload = json.loads(lint_path.read_text(encoding="utf-8"))
            self.assertEqual(lint_payload["status"], "pass")

            self.assertEqual(main(["wiki", "publish-proposal", str(manifest), "--wiki-root", str(wiki_root)]), 0)
            synthesis = wiki_root / "syntheses/MoE-PTQ-Ablation-Reading-Plan.md"
            self.assertTrue(synthesis.exists())
            synthesis_text = synthesis.read_text(encoding="utf-8")
            self.assertIn('type: "method-family"', synthesis_text)
            self.assertIn("review_state: \"published_proposal\"", synthesis_text)
            self.assertIn("I want probes that separate smoothing from clustering.", synthesis_text)
            self.assertIn("[[papers/MoE-PTQ|MoE PTQ Paper]]", synthesis_text)
            self.assertTrue((wiki_root / ".index/syntheses.jsonl").exists())
            self.assertIn("[[syntheses/MoE-PTQ-Ablation-Reading-Plan|MoE PTQ Ablation Reading Plan]]", (wiki_root / "index.md").read_text(encoding="utf-8"))

            retrieve_json = root / "synthesis-retrieval.json"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieve",
                        "cross-paper synthesis for activation outlier ablation probes",
                        "--wiki-root",
                        str(wiki_root),
                        "--json-out",
                        str(retrieve_json),
                        "--top-k",
                        "3",
                    ]
                ),
                0,
            )
            retrieved = json.loads(retrieve_json.read_text(encoding="utf-8"))
            self.assertTrue(
                any(item.get("relative_path") == "syntheses/MoE-PTQ-Ablation-Reading-Plan.md" for item in retrieved["results"])
            )

            self.assertEqual(
                main(["wiki", "proposal-lint", str(manifest), "--wiki-root", str(wiki_root)]),
                1,
            )
            collision_report = json.loads((manifest.parent / "proposal-lint.json").read_text(encoding="utf-8"))
            self.assertIn("publish_target_exists", {item["code"] for item in collision_report["findings"]})
            self.assertEqual(main(["wiki", "publish-proposal", str(manifest), "--wiki-root", str(wiki_root)]), 1)

    def test_proposal_lint_blocks_source_quality_hold_as_scientific_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "Bad-Metadata.md",
                title="Bad Metadata Paper",
                aliases=["metadata hold"],
                topics=["source cleanup"],
                methods=["metadata repair"],
                settings=["source-quality cleanup"],
                body_sections={
                    "What To Remember": "This page is a source-quality hold, not a scientific source.",
                    "Implementation Hooks": "Fix metadata and OCR before using.",
                },
                quality_gate="fail",
                review_state="source_quality_hold",
            )
            context_json = root / "context.json"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieve",
                        "source metadata cleanup hold",
                        "--wiki-root",
                        str(wiki_root),
                        "--json-out",
                        str(context_json),
                    ]
                ),
                0,
            )
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "propose-writeback",
                        "--wiki-root",
                        str(wiki_root),
                        "--query",
                        "source metadata cleanup hold",
                        "--context",
                        str(context_json),
                        "--title",
                        "Bad Metadata Cleanup",
                        "--proposal-type",
                        "research-question",
                    ]
                ),
                0,
            )
            manifest = wiki_root / ".drafts/proposals/Bad-Metadata-Cleanup/proposal.json"
            proposal = wiki_root / ".drafts/proposals/Bad-Metadata-Cleanup/proposal.md"
            text = proposal.read_text(encoding="utf-8")
            self.assertIn("not scientific evidence", text)
            proposal.write_text(text.replace("not scientific evidence", "scientific support"), encoding="utf-8")
            self.assertEqual(
                main(["wiki", "proposal-lint", str(manifest), "--wiki-root", str(wiki_root)]),
                1,
            )
            report = json.loads((wiki_root / ".drafts/proposals/Bad-Metadata-Cleanup/proposal-lint.json").read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "fail")
            self.assertIn("source_quality_as_scientific_evidence", {item["code"] for item in report["findings"]})

    def test_knowledge_audit_repair_publish_and_retrieval_use_compiled_method_pages(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            _write_test_paper(
                papers / "Quant-Paper.md",
                title="Quant Paper",
                aliases=["QuantProbe"],
                topics=["low-bit quantization"],
                methods=["post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "Post-training quantization reduces deployment cost.",
                    "Mechanism": "The method calibrates activations and weights before low-bit inference.",
                    "Implementation Hooks": "Log calibration set, quantization error, activation outliers, and latency.",
                    "Limitations / Uncertainty": "Fails when calibration misses deployment distributions.",
                    "Evidence Map": "Reports perplexity, latency, and ablation evidence.",
                },
            )
            method_page = wiki_root / "methods/post-training-quantization.md"
            method_page.parent.mkdir(parents=True)
            method_page.write_text(
                "\n".join(
                    [
                        "---",
                        'type: "method"',
                        'title: "post-training quantization"',
                        'status: "active"',
                        "related_papers:",
                        '  - "[[papers/Quant-Paper|Quant Paper]]"',
                        'confidence: "medium"',
                        'review_state: "active"',
                        "---",
                        "# post-training quantization",
                        "",
                        "## Related Papers",
                        "",
                        "- [[papers/Quant-Paper|Quant Paper]]",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "knowledge-audit",
                        "--wiki-root",
                        str(wiki_root),
                        "--out",
                        str(wiki_root / ".index/knowledge-audit.json"),
                        "--brief",
                        str(root / "brief.md"),
                    ]
                ),
                0,
            )
            before = json.loads((wiki_root / ".index/knowledge-audit.json").read_text(encoding="utf-8"))
            self.assertGreater(before["metrics"]["low_information_pages"], 0)

            out = wiki_root / ".drafts/knowledge-repair/test"
            self.assertEqual(main(["wiki", "propose-knowledge-repair", "--wiki-root", str(wiki_root), "--out", str(out)]), 0)
            self.assertEqual(main(["wiki", "knowledge-repair-lint", str(out / "repair.json"), "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(main(["wiki", "publish-knowledge-repair", str(out / "repair.json"), "--wiki-root", str(wiki_root)]), 0)

            updated = method_page.read_text(encoding="utf-8")
            self.assertIn("## Mechanism", updated)
            self.assertIn("## Implementation Hooks", updated)
            self.assertTrue(list((wiki_root / ".versions/methods/post-training-quantization").glob("*.md")))

            result = retrieve_papers(
                query="I need implementation hooks and failure modes for post-training quantization methods.",
                wiki_root=wiki_root,
                top_k=3,
                strategy="v1",
            )
            self.assertEqual(result.results[0]["result_type"], "method")
            self.assertEqual(result.results[0]["knowledge_role"], "compiled_knowledge")
            self.assertEqual(result.results[0]["relative_path"], "methods/post-training-quantization.md")

    def test_knowledge_audit_allows_same_method_and_topic_title(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            method = wiki_root / "methods/expert-routing.md"
            topic = wiki_root / "topics/expert-routing.md"
            other = wiki_root / "methods/expert-router.md"
            method.parent.mkdir(parents=True)
            topic.parent.mkdir(parents=True)
            for path, page_type, title in (
                (method, "method", "expert routing"),
                (topic, "topic", "expert routing"),
                (other, "method", "expert router"),
            ):
                path.write_text(
                    "\n".join(
                        [
                            "---",
                            f'type: "{page_type}"',
                            f'title: "{title}"',
                            'status: "active"',
                            "aliases:",
                            '  - "router collision"',
                            'confidence: "medium"',
                            'review_state: "active"',
                            "---",
                            f"# {title}",
                            "",
                            "## Scope",
                            "",
                            "- This page has enough content for the audit fixture.",
                            "- [[papers/Fixture|Fixture paper]]",
                        ]
                    )
                    + "\n",
                    encoding="utf-8",
                )

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "knowledge-audit",
                        "--wiki-root",
                        str(wiki_root),
                        "--out",
                        str(wiki_root / ".index/knowledge-audit.json"),
                        "--brief",
                        str(root / "brief.md"),
                    ]
                ),
                0,
            )
            audit = json.loads((wiki_root / ".index/knowledge-audit.json").read_text(encoding="utf-8"))
            duplicate_findings = [item for item in audit["findings"] if item["code"] == "duplicate_method_or_topic_alias"]
            self.assertEqual(audit["metrics"]["duplicate_method_topic_alias_groups"], 1)
            self.assertEqual(len(duplicate_findings), 1)
            self.assertEqual(duplicate_findings[0]["alias"], "router collision")

    def test_knowledge_repair_lint_rejects_high_risk_deterministic_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            repair_dir = wiki_root / ".drafts/knowledge-repair/bad"
            repair_dir.mkdir(parents=True)
            (repair_dir / "repair.md").write_text("# Bad\n", encoding="utf-8")
            (repair_dir / "publish_plan.md").write_text("# Plan\n", encoding="utf-8")
            (wiki_root / ".index").mkdir(parents=True)
            audit = wiki_root / ".index/knowledge-audit.json"
            audit.write_text('{"schema_version":"meridian.knowledge_audit.v1"}\n', encoding="utf-8")
            manifest = repair_dir / "repair.json"
            manifest.write_text(
                json.dumps(
                    {
                        "schema_version": "meridian.knowledge_repair.v1",
                        "status": "draft",
                        "publish_state": "draft",
                        "repair_path": str(repair_dir / "repair.md"),
                        "publish_plan_path": str(repair_dir / "publish_plan.md"),
                        "audit_path": str(audit),
                        "deterministic_repairs": [
                            {
                                "action_type": "declare_contradiction",
                                "risk": "high",
                                "target_path": "claims/Unsafe.md",
                            }
                        ],
                        "high_risk_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            exit_code, stdout, _ = _run_cli_capture(["wiki", "knowledge-repair-lint", str(manifest), "--wiki-root", str(wiki_root)])
            self.assertEqual(exit_code, 1)
            self.assertIn("Knowledge repair lint status: fail", stdout)

    def test_concept_layer_propose_publish_and_retrieve(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            _write_test_paper(
                wiki_root / "papers/Quant-Paper.md",
                title="Quant Paper",
                aliases=["QuantProbe"],
                topics=["quantization"],
                methods=["post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "The paper studies PTQ and activation outliers in low-bit LLM inference.",
                    "Mechanism": "Activation outliers drive quantization error propagation in post-training quantization.",
                    "Implementation Hooks": "Debug activation outliers, per-channel scaling, and layer-wise quantization error before coding an ablation.",
                    "Limitations / Uncertainty": "Calibration failures can hide activation outlier regimes.",
                    "Evidence Map": "The evidence links activation outliers to quantization error changes.",
                },
            )
            _write_knowledge_page(
                wiki_root / "methods/post-training-quantization.md",
                page_type="method",
                title="post-training quantization",
                body="\n".join(
                    [
                        "## What It Is",
                        "",
                        "A quantization method family for deployment.",
                        "",
                        "## Mechanism",
                        "",
                        "Uses calibration data to choose low-bit representations.",
                        "",
                        "## Implementation Hooks",
                        "",
                        "Inspect activation outliers and quantization error propagation.",
                    ]
                ),
                source_papers=["papers/Quant-Paper.md"],
            )

            self.assertEqual(main(["wiki", "concept-audit", "--wiki-root", str(wiki_root), "--brief", str(root / "concept-audit.md")]), 0)
            audit = json.loads((wiki_root / ".index/concept-audit.json").read_text(encoding="utf-8"))
            self.assertGreaterEqual(audit["metrics"]["candidate_concepts"], 1)

            proposal_dir = wiki_root / ".drafts/knowledge-repair/concepts"
            self.assertEqual(
                main(["wiki", "propose-concept-layer", "--wiki-root", str(wiki_root), "--out-dir", str(proposal_dir), "--max-concepts", "3"]),
                0,
            )
            manifest = proposal_dir / "concept-layer-proposal.json"
            self.assertEqual(main(["wiki", "concept-layer-lint", str(manifest), "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(main(["wiki", "publish-concept-layer", str(manifest), "--wiki-root", str(wiki_root)]), 0)

            concept_page = wiki_root / "concepts/Activation-outliers.md"
            self.assertTrue(concept_page.exists())
            concept_text = concept_page.read_text(encoding="utf-8")
            self.assertIn("## Implementation Implications", concept_text)
            self.assertIn("## Minimal Checks / Probes", concept_text)
            method_text = (wiki_root / "methods/post-training-quantization.md").read_text(encoding="utf-8")
            self.assertIn("## Prerequisite Concepts", method_text)

            result = retrieve_papers(
                query="I am debugging a PTQ ablation and need preliminary knowledge about activation outliers and sanity probes.",
                wiki_root=wiki_root,
                top_k=5,
                strategy="v1",
            )
            result_types = [item["result_type"] for item in result.results]
            self.assertIn("concept", result_types)
            concept = next(item for item in result.results if item["result_type"] == "concept")
            self.assertEqual(concept["relative_path"], "concepts/Activation-outliers.md")
            self.assertIn("source_papers", concept)

    def test_concept_layer_lint_rejects_unprovenanced_concept(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            proposal_dir = wiki_root / ".drafts/knowledge-repair/bad-concept"
            proposal_dir.mkdir(parents=True)
            (proposal_dir / "concept-layer-proposal.md").write_text("# Bad Concept\n", encoding="utf-8")
            (proposal_dir / "publish_plan.md").write_text("# Plan\n", encoding="utf-8")
            manifest = proposal_dir / "concept-layer-proposal.json"
            manifest.write_text(
                json.dumps(
                    {
                        "schema_version": "meridian.concept_layer_proposal.v1",
                        "status": "draft",
                        "proposal_path": str(proposal_dir / "concept-layer-proposal.md"),
                        "publish_plan_path": str(proposal_dir / "publish_plan.md"),
                        "low_risk_actions": [
                            {
                                "action_type": "create_concept_page",
                                "risk": "low",
                                "target_path": "concepts/Error.md",
                                "concept": {
                                    "title": "Error",
                                    "source_papers": [],
                                    "related_methods": [],
                                },
                            },
                            {
                                "action_type": "create_concept_page",
                                "risk": "low",
                                "target_path": "concepts/Unsafe.md",
                                "concept": {
                                    "title": "Unsafe concept",
                                    "source_papers": ["papers/Bad.md"],
                                    "related_methods": ["unsafe method"],
                                    "evidence_notes": [{"snippet": "source_quality_hold should not become scientific evidence"}],
                                },
                            }
                        ],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            exit_code, stdout, _ = _run_cli_capture(["wiki", "concept-layer-lint", str(manifest), "--wiki-root", str(wiki_root)])
            self.assertEqual(exit_code, 1)
            self.assertIn("Concept layer lint status: fail", stdout)
            report = json.loads((proposal_dir / "concept-layer-lint.json").read_text(encoding="utf-8"))
            codes = {item["code"] for item in report["findings"]}
            self.assertIn("source_quality_contamination_risk", codes)

    def test_final_status_migration_adds_retrieval_visible_quality_states(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            _write_test_paper(
                papers / "Sparse-Attention.md",
                title="Sparse Attention Paper",
                aliases=["SparseKV"],
                topics=["long-context attention"],
                methods=["sparse attention"],
                settings=["long-context decoding"],
                body_sections={"What To Remember": "Sparse attention reduces KV-cache pressure."},
                quality_gate="warn",
                review_state="auto_converged",
            )
            self.assertEqual(main(["wiki", "final-status-migrate", "--wiki-root", str(wiki_root)]), 0)
            text = (papers / "Sparse-Attention.md").read_text(encoding="utf-8")
            self.assertIn('quality_state: "multimodal_pending"', text)
            self.assertIn('validation_state: "text_converged"', text)
            self.assertIn('trust_state: "source_grounded_text"', text)

            result_json = root / "retrieve.json"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieve",
                        "long-context sparse attention decoding",
                        "--wiki-root",
                        str(wiki_root),
                        "--json-out",
                        str(result_json),
                    ]
                ),
                0,
            )
            result = json.loads(result_json.read_text(encoding="utf-8"))
            self.assertEqual(result["results"][0]["quality_state"], "multimodal_pending")

    def test_synthesis_growth_batch_publishes_retrievable_compiled_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            _write_test_paper(
                papers / "Quant-Paper.md",
                title="Quant Paper",
                aliases=["QuantProbe"],
                topics=["low-bit quantization"],
                methods=["post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "Post-training quantization reduces deployment cost.",
                    "Mechanism": "Calibration and reconstruction reduce quantization error.",
                    "Implementation Hooks": "Probe activation outliers and quantization error.",
                    "Evidence Map": "Reports perplexity and latency evidence.",
                },
            )
            method = wiki_root / "methods/post-training-quantization.md"
            method.parent.mkdir(parents=True)
            method.write_text(
                "\n".join(
                    [
                        "---",
                        'type: "method"',
                        'title: "post-training quantization"',
                        'status: "active"',
                        "source_papers:",
                        '  - "papers/Quant-Paper"',
                        "related_papers:",
                        '  - "papers/Quant-Paper"',
                        "related_topics:",
                        '  - "low-bit quantization"',
                        'confidence: "medium"',
                        'review_state: "auto_structured"',
                        'evolution_state: "active"',
                        'revision_id: "method-test"',
                        "---",
                        "# post-training quantization",
                        "",
                        "## What It Is",
                        "",
                        "Compiled PTQ method family.",
                        "",
                        "## Mechanism",
                        "",
                        "Calibration and reconstruction reduce quantization error.",
                        "",
                        "## Implementation Hooks",
                        "",
                        "Probe outliers, calibration data, and latency.",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            batch = wiki_root / ".drafts/proposals/test-synthesis-batch"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "propose-synthesis-batch",
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(batch),
                        "--max-items",
                        "1",
                    ]
                ),
                0,
            )
            manifest = batch / "batch.json"
            self.assertTrue(manifest.exists())
            self.assertEqual(main(["wiki", "publish-synthesis-batch", str(manifest), "--wiki-root", str(wiki_root)]), 0)
            self.assertTrue(list((wiki_root / "syntheses").glob("*.md")))
            synthesis_text = next((wiki_root / "syntheses").glob("*.md")).read_text(encoding="utf-8")
            self.assertIn("Working synthesis target", synthesis_text)
            self.assertIn("Retrieval contract", synthesis_text)
            self.assertIn("sources:", synthesis_text)
            self.assertIn("source_papers:", synthesis_text)

            result = retrieve_papers(
                query="cross-paper synthesis for post-training quantization implementation evidence",
                wiki_root=wiki_root,
                top_k=3,
                strategy="v1",
            )
            self.assertTrue(any(item.get("result_type") == "method-family" for item in result.results))

    def test_method_consolidation_and_contradiction_review_are_proposal_first(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            compiled = wiki_root / "methods/post-training-quantization.md"
            compiled.parent.mkdir(parents=True)
            compiled.write_text(
                "\n".join(
                    [
                        "---",
                        'type: "method"',
                        'title: "post-training quantization"',
                        'status: "active"',
                        "source_papers:",
                        '  - "papers/Quant-Paper"',
                        "related_papers:",
                        '  - "papers/Quant-Paper"',
                        "related_topics:",
                        '  - "low-bit quantization"',
                        'confidence: "medium"',
                        'review_state: "auto_structured"',
                        'evolution_state: "active"',
                        'revision_id: "method-test"',
                        "---",
                        "# post-training quantization",
                        "",
                        "## What It Is",
                        "",
                        "Compiled method page.",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            candidate = wiki_root / "methods/Quant-Paper-method-001.md"
            candidate.write_text(
                "\n".join(
                    [
                        "---",
                        'type: "method"',
                        'title: "Quant Paper post-training quantization method"',
                        'status: "candidate"',
                        "related_topics:",
                        '  - "low-bit quantization"',
                        'review_state: "candidate"',
                        "---",
                        "# Candidate",
                        "",
                        "This paper-specific record describes post-training quantization.",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            out = wiki_root / ".drafts/knowledge-repair/method-consolidation-test"
            self.assertEqual(main(["wiki", "propose-method-consolidation", "--wiki-root", str(wiki_root), "--out-dir", str(out)]), 0)
            manifest = json.loads((out / "method-consolidation.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["candidate_count"], 1)
            self.assertEqual(manifest["grouped_count"], 1)
            self.assertIn("consolidation_target", manifest["groups"][0]["publishable_low_risk_update"]["fields"])
            self.assertNotIn("consolidation_target", candidate.read_text(encoding="utf-8"))
            self.assertEqual(main(["wiki", "publish-method-consolidation", str(out / "method-consolidation.json"), "--wiki-root", str(wiki_root)]), 0)
            candidate_text = candidate.read_text(encoding="utf-8")
            self.assertIn('consolidation_target: "methods/post-training-quantization"', candidate_text)
            self.assertIn('retrieval_visibility: "suppressed_unless_exact_identity"', candidate_text)
            result = retrieve_papers(
                query="post-training quantization implementation hooks and mechanism",
                wiki_root=wiki_root,
                top_k=2,
                strategy="v1",
            )
            self.assertEqual(result.results[0]["relative_path"], "methods/post-training-quantization.md")
            candidate_result = next(item for item in result.results if item["relative_path"] == "methods/Quant-Paper-method-001.md")
            self.assertIn("consolidated candidate suppression", candidate_result["selection_reasons"])

            claims = wiki_root / "claims"
            claims.mkdir(parents=True, exist_ok=True)
            (claims / "Unsupported.md").write_text(
                "\n".join(
                    [
                        "---",
                        'type: "claim"',
                        'title: "Unsupported Claim"',
                        'status: "candidate"',
                        "source_papers: []",
                        "supports: []",
                        'confidence: "low"',
                        'review_state: "candidate"',
                        'evolution_state: "active"',
                        'revision_id: "claim-test"',
                        "---",
                        "# Unsupported Claim",
                        "",
                        "## Claim",
                        "",
                        "This claim needs evidence.",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            review_out = wiki_root / ".drafts/knowledge-repair/contradiction-test"
            self.assertEqual(
                main(["wiki", "propose-contradiction-review", "--wiki-root", str(wiki_root), "--out-dir", str(review_out)]),
                0,
            )
            review = json.loads((review_out / "contradiction-review.json").read_text(encoding="utf-8"))
            self.assertGreaterEqual(review["candidate_count"], 1)
            self.assertIn("claim_without_evidence", {item["candidate_type"] for item in review["candidates"]})

    def test_existing_concept_layer_proposal_adds_backlinks_without_recreating_concept(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            _write_test_paper(
                wiki_root / "papers/Quant-Paper.md",
                title="Quant Paper",
                aliases=["QuantProbe"],
                topics=["quantization"],
                methods=["post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "What To Remember": "The paper studies PTQ and activation outliers in low-bit LLM inference.",
                    "Mechanism": "Activation outliers drive quantization error propagation.",
                },
            )
            _write_knowledge_page(
                wiki_root / "methods/post-training-quantization.md",
                page_type="method",
                title="post-training quantization",
                body="## What It Is\n\nA quantization method family.\n\n## Implementation Hooks\n\nInspect activation outliers.",
                source_papers=["papers/Quant-Paper.md"],
            )
            concept = wiki_root / "concepts/Activation-outliers.md"
            _write_knowledge_page(
                concept,
                page_type="concept",
                title="Activation outliers",
                body="\n".join(
                    [
                        "## What It Is",
                        "",
                        "Existing concept page.",
                        "",
                        "## Why It Matters",
                        "",
                        "Outliers affect low-bit quantization.",
                        "",
                        "## Implementation Implications",
                        "",
                        "Inspect activation ranges before choosing scales.",
                        "",
                        "## Minimal Checks / Probes",
                        "",
                        "Plot per-channel activation ranges and run ablations.",
                    ]
                ),
                source_papers=["papers/Quant-Paper.md"],
            )

            proposal_dir = wiki_root / ".drafts/knowledge-repair/existing-concept-links"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "propose-concept-layer",
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(proposal_dir),
                        "--max-concepts",
                        "0",
                    ]
                ),
                0,
            )
            manifest = json.loads((proposal_dir / "concept-layer-proposal.json").read_text(encoding="utf-8"))
            action_types = {item["action_type"] for item in manifest["low_risk_actions"]}
            self.assertNotIn("create_concept_page", action_types)
            self.assertIn("add_method_prerequisite_concept", action_types)
            self.assertEqual(main(["wiki", "concept-layer-lint", str(proposal_dir / "concept-layer-proposal.json"), "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(main(["wiki", "publish-concept-layer", str(proposal_dir / "concept-layer-proposal.json"), "--wiki-root", str(wiki_root)]), 0)
            method_text = (wiki_root / "methods/post-training-quantization.md").read_text(encoding="utf-8")
            self.assertIn("## Prerequisite Concepts", method_text)
            self.assertIn("[[concepts/Activation-outliers|Activation outliers]]", method_text)

    def test_audits_treat_consolidated_method_candidates_as_suppressed_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            method = wiki_root / "methods/Quant-Paper-method-001.md"
            method.parent.mkdir(parents=True)
            method.write_text(
                "\n".join(
                    [
                        "---",
                        'type: "method"',
                        'title: "Quant Paper PTQ method candidate"',
                        'status: "candidate"',
                        'review_state: "candidate"',
                        'consolidation_target: "methods/post-training-quantization"',
                        'candidate_scope: "paper_specific_method_record"',
                        'retrieval_visibility: "suppressed_unless_exact_identity"',
                        "---",
                        "# Quant Paper PTQ method candidate",
                        "",
                        "Compact paper-specific method record.",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "knowledge-audit",
                        "--wiki-root",
                        str(wiki_root),
                        "--out",
                        str(wiki_root / ".index/knowledge-audit.json"),
                        "--brief",
                        str(root / "knowledge-brief.md"),
                    ]
                ),
                0,
            )
            knowledge = json.loads((wiki_root / ".index/knowledge-audit.json").read_text(encoding="utf-8"))
            self.assertEqual(knowledge["metrics"]["consolidated_method_candidate_records"], 1)
            self.assertEqual(knowledge["metrics"]["low_information_pages"], 0)
            self.assertEqual(knowledge["metrics"]["pages_with_required_section_gaps"], 0)
            self.assertNotIn("low_information_knowledge_page", {item["code"] for item in knowledge["findings"]})

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "concept-audit",
                        "--wiki-root",
                        str(wiki_root),
                        "--out",
                        str(wiki_root / ".index/concept-audit.json"),
                        "--brief",
                        str(root / "concept-brief.md"),
                    ]
                ),
                0,
            )
            concept = json.loads((wiki_root / ".index/concept-audit.json").read_text(encoding="utf-8"))
            self.assertEqual(concept["metrics"]["methods_total"], 1)
            self.assertEqual(concept["metrics"]["methods_requiring_prerequisite_concepts"], 0)
            self.assertEqual(concept["metrics"]["consolidated_method_candidate_records"], 1)
            self.assertEqual(concept["metrics"]["methods_with_prerequisite_concepts"], 0)
            self.assertNotIn("method_missing_prerequisite_concepts", {item["code"] for item in concept["findings"]})

    def test_concept_audit_info_only_findings_do_not_degrade_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            _write_knowledge_page(
                wiki_root / "methods/post-training-quantization.md",
                page_type="method",
                title="post-training quantization",
                body="\n".join(
                    [
                        "## What It Is",
                        "",
                        "A compiled method family with enough text to avoid low-information concept checks.",
                        "",
                        "## Mechanism",
                        "",
                        "Calibration and reconstruction reduce quantization error.",
                    ]
                ),
                source_papers=["papers/Quant-Paper.md"],
            )

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "concept-audit",
                        "--wiki-root",
                        str(wiki_root),
                        "--out",
                        str(wiki_root / ".index/concept-audit.json"),
                        "--brief",
                        str(root / "concept-brief.md"),
                    ]
                ),
                0,
            )
            concept = json.loads((wiki_root / ".index/concept-audit.json").read_text(encoding="utf-8"))
            self.assertEqual(concept["status"], "pass")
            self.assertIn("method_missing_prerequisite_concepts", {item["code"] for item in concept["findings"]})

    def test_knowledge_repair_source_extraction_does_not_cross_wikilink_lines(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            synthesis = wiki_root / "syntheses/Agent-Workflow-Overview.md"
            synthesis.parent.mkdir(parents=True)
            synthesis.write_text(
                "\n".join(
                    [
                        "---",
                        'type: "synthesis"',
                        'title: "Agent Workflow Overview"',
                        'status: "draft"',
                        "source_papers:",
                        '  - "papers/Agent-A.md"',
                        'confidence: "low"',
                        'review_state: "published_proposal"',
                        'evolution_state: "active"',
                        'revision_id: "synthesis-test"',
                        "---",
                        "# Agent Workflow Overview",
                        "",
                        "## Source Links",
                        "",
                        "- [[papers/Agent-A|Agent A]]",
                        "- [[claims/Agent-claim-001|Claim should not enter source path]]",
                        "- [[papers/Agent-B|Agent B]]",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            out = wiki_root / ".drafts/knowledge-repair/source-extraction"
            self.assertEqual(main(["wiki", "propose-knowledge-repair", "--wiki-root", str(wiki_root), "--out", str(out)]), 0)
            manifest = json.loads((out / "repair.json").read_text(encoding="utf-8"))
            source_updates = [
                action
                for action in manifest["deterministic_repairs"]
                if action["action_type"] == "update_frontmatter" and action["target_path"] == "syntheses/Agent-Workflow-Overview.md"
            ]
            self.assertEqual(len(source_updates), 1)
            self.assertEqual(source_updates[0]["source_papers"], ["papers/Agent-A.md", "papers/Agent-B.md"])

    def test_knowledge_audit_applies_synthesis_schema_to_method_family_pages(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            synthesis = wiki_root / "syntheses/PTQ-Method-Family.md"
            synthesis.parent.mkdir(parents=True)
            synthesis.write_text(
                "\n".join(
                    [
                        "---",
                        'type: "method-family"',
                        'title: "PTQ Method Family"',
                        'status: "draft"',
                        "source_papers:",
                        '  - "papers/Quant-Paper.md"',
                        'confidence: "low"',
                        'review_state: "published_proposal"',
                        'evolution_state: "active"',
                        'revision_id: "synthesis-test"',
                        "---",
                        "# PTQ Method Family",
                        "",
                        "## Source Facts",
                        "",
                        "- Source-grounded fact.",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            self.assertEqual(
                main(
                    [
                        "wiki",
                        "knowledge-audit",
                        "--wiki-root",
                        str(wiki_root),
                        "--out",
                        str(wiki_root / ".index/knowledge-audit.json"),
                        "--brief",
                        str(root / "knowledge-brief.md"),
                    ]
                ),
                0,
            )
            knowledge = json.loads((wiki_root / ".index/knowledge-audit.json").read_text(encoding="utf-8"))
            findings = {item["code"] for item in knowledge["findings"]}
            self.assertIn("missing_frontmatter_fields", findings)
            self.assertIn("missing_knowledge_sections", findings)

    def test_navigation_and_final_product_check(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            _write_test_paper(
                papers / "Agent-Workflow.md",
                title="Agent Workflow Paper",
                aliases=["WorkflowAgent"],
                topics=["LLM agents"],
                methods=["agent workflow modeling"],
                settings=["tool-use agents"],
                body_sections={"What To Remember": "Agent workflow pages support tool-use research."},
            )
            synthesis = wiki_root / "syntheses/Agent-Workflow-Overview.md"
            synthesis.parent.mkdir(parents=True)
            synthesis.write_text(
                "\n".join(
                    [
                        "---",
                        'type: "synthesis"',
                        'title: "Agent Workflow Overview"',
                        'status: "draft"',
                        "source_papers:",
                        '  - "papers/Agent-Workflow"',
                        "related_papers:",
                        '  - "papers/Agent-Workflow"',
                        "related_methods:",
                        '  - "agent workflow modeling"',
                        "related_topics:",
                        '  - "LLM agents"',
                        'confidence: "low"',
                        'review_state: "published_proposal"',
                        'evolution_state: "active"',
                        'revision_id: "synthesis-test"',
                        "---",
                        "# Agent Workflow Overview",
                        "",
                        "## Source Facts",
                        "",
                        "- [[papers/Agent-Workflow|Agent Workflow Paper]] is the source page.",
                        "",
                        "## Wiki Synthesis",
                        "",
                        "- Scaffold synthesis.",
                        "",
                        "## User Ideas / Decisions",
                        "",
                        "- None.",
                        "",
                        "## Evidence Map",
                        "",
                        "- Needs review.",
                        "",
                        "## Open Questions",
                        "",
                        "- What should be tested?",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            self.assertEqual(main(["wiki", "final-status-migrate", "--wiki-root", str(wiki_root)]), 0)
            self.assertEqual(main(["wiki", "build-navigation", "--wiki-root", str(wiki_root)]), 0)
            self.assertTrue((wiki_root / "Map of Content.md").exists())
            self.assertTrue((wiki_root / "Synthesis Index.md").exists())

            check = root / "final-check.json"
            brief = root / "final-brief.md"
            self.assertEqual(main(["wiki", "final-product-check", "--wiki-root", str(wiki_root), "--out", str(check), "--brief", str(brief)]), 0)
            payload = json.loads(check.read_text(encoding="utf-8"))
            self.assertIn(payload["status"], {"pass", "warn"})
            self.assertEqual(payload["metrics"]["counts"]["syntheses"], 1)
            self.assertTrue(brief.exists())

    def test_final_retrieval_eval_uses_full_corpus_and_suppresses_source_quality_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            _write_test_paper(
                wiki_root / "papers/Good-PTQ.md",
                title="Good PTQ Paper",
                aliases=["GoodPTQ"],
                topics=["post-training quantization"],
                methods=["post-training quantization"],
                settings=["weight-activation quantization"],
                body_sections={
                    "Evidence Map": "Good PTQ evidence is source-grounded and supports implementation probes.",
                    "Implementation Hooks": "Inspect quantization error and calibration probes.",
                },
            )
            _write_test_paper(
                wiki_root / "papers/Bad-Source.md",
                title="Bad Source",
                aliases=["BadSource"],
                topics=["paper source quality"],
                methods=["source-quality triage"],
                settings=["source-text-insufficient"],
                body_sections={"Evidence Map": "Do not use this as scientific evidence."},
                review_state="source_quality_hold",
                quality_gate="warn",
            )
            _prepend_frontmatter_field(wiki_root / "papers/Bad-Source.md", 'quality_state: "source_quality_hold"\nvalidation_state: "needs_source_recheck"')
            _write_knowledge_page(
                wiki_root / "methods/post-training-quantization.md",
                page_type="method",
                title="Post-training Quantization",
                body="## What It Is\n\nA method family for quantizing trained models.\n\n## Implementation Hooks\n\nProbe calibration and quantization error.",
            )
            _write_knowledge_page(
                wiki_root / "topics/post-training-quantization.md",
                page_type="topic",
                title="Post-training Quantization",
                body="## Scope\n\nQuantization methods and evidence boundaries.",
            )
            _write_knowledge_page(
                wiki_root / "syntheses/Post-Training-Quantization-Overview.md",
                page_type="synthesis",
                title="Post-training Quantization Overview",
                body="## Source Facts\n\n- [[papers/Good-PTQ]] supports this overview.\n\n## Wiki Synthesis\n\nUse method-family context before paper details.\n\n## Evidence Map\n\nTrace claims to source pages.",
                source_papers=["papers/Good-PTQ.md"],
            )
            _write_knowledge_page(
                wiki_root / "evidence/Bad-evidence.md",
                page_type="evidence",
                title="Bad Source Evidence",
                body="## Evidence Item\n\npost-training quantization implementation evidence from a bad source.\n\n## Source\n\n[[papers/Bad-Source]]\n\n## Reliability\n\nSource-quality hold.",
                source_papers=["papers/Bad-Source.md"],
            )
            _write_knowledge_page(
                wiki_root / "evidence/Good-evidence.md",
                page_type="evidence",
                title="Good PTQ Evidence",
                body="## Evidence Item\n\npost-training quantization implementation evidence with provenance.\n\n## Source\n\n[[papers/Good-PTQ]]\n\n## Reliability\n\nUsable source-grounded evidence.",
                source_papers=["papers/Good-PTQ.md"],
            )
            cases = root / "cases.jsonl"
            cases.write_text(
                json.dumps(
                    {
                        "id": "full_corpus",
                        "category": "final_llm_wiki_product",
                        "intent": "method_probe_design",
                        "query": "I need an overview of post-training quantization implementation probes with evidence and synthesis context.",
                        "problem_description": "Final retrieval should use compiled knowledge pages and avoid source-quality evidence.",
                        "required_page_families": ["type:method", "type:evidence", "corpus:syntheses", "type:paper"],
                        "acceptable_adjacent_pages": ["type:topic"],
                        "hard_distractors": ["evidence/Bad-evidence.md"],
                        "must_not_retrieve_as_evidence": ["quality:source_quality_hold"],
                        "context_packet_expectations": [],
                        "rubric": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            out = root / "retrieval-final"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "retrieval-optimize-eval",
                        str(cases),
                        "--wiki-root",
                        str(wiki_root),
                        "--out-dir",
                        str(out),
                        "--top-k",
                        "5",
                    ]
                ),
                0,
            )
            summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["metrics"]["v1"]["decisions"], {"pass": 1})
            context = json.loads((out / "full_corpus/context.v1.json").read_text(encoding="utf-8"))
            paths = [item["relative_path"] for item in context["results"]]
            self.assertIn("syntheses/Post-Training-Quantization-Overview.md", paths)
            self.assertIn("evidence/Good-evidence.md", paths)
            self.assertNotIn("evidence/Bad-evidence.md", paths)

    def test_evidence_trace_query_preserves_claim_evidence_and_risk_concept_slots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wiki_root = Path(tmp) / "wiki"
            _write_test_paper(
                wiki_root / "papers/DPO.md",
                title="DPO Paper",
                aliases=["DPO"],
                topics=["preference optimization"],
                methods=["direct preference optimization"],
                settings=["RLHF"],
                body_sections={
                    "Evidence Map": "Preference optimization evidence compares reward modeling and policy objectives.",
                    "Limitations / Uncertainty": "Weak claims need preference-data and reward-model provenance checks.",
                },
            )
            _write_knowledge_page(
                wiki_root / "claims/Preference-support.md",
                page_type="claim",
                title="Preference optimization supports reward-model-free training",
                body="\n".join(
                    [
                        "## Claim",
                        "",
                        "DPO-style evidence supports some reward-model-free preference optimization settings.",
                        "",
                        "## Supporting Evidence",
                        "",
                        "- [[evidence/DPO-evidence]] links the claim to a source paper.",
                        "",
                        "## Provenance",
                        "",
                        "- Source paper: [[papers/DPO]]",
                    ]
                ),
                source_papers=["papers/DPO.md"],
            )
            _write_knowledge_page(
                wiki_root / "evidence/DPO-evidence.md",
                page_type="evidence",
                title="DPO preference evidence",
                body="\n".join(
                    [
                        "## Evidence Item",
                        "",
                        "The paper reports preference optimization evidence against reward-model baselines.",
                        "",
                        "## Source",
                        "",
                        "- [[papers/DPO]]",
                        "",
                        "## Supports",
                        "",
                        "- [[claims/Preference-support]]",
                    ]
                ),
                source_papers=["papers/DPO.md"],
            )
            _write_knowledge_page(
                wiki_root / "concepts/Preference-data-underspecification.md",
                page_type="concept",
                title="Preference data underspecification",
                body="\n".join(
                    [
                        "## What It Is",
                        "",
                        "Preference data can underspecify the intended reward behavior.",
                        "",
                        "## Common Failure Modes",
                        "",
                        "Weak or unsupported claims can follow from incomplete preference data.",
                        "",
                        "## Evidence / Provenance",
                        "",
                        "- [[papers/DPO]] discusses preference evidence boundaries.",
                    ]
                ),
                source_papers=["papers/DPO.md"],
            )
            result = retrieve_papers(
                query="I need to decide whether reward modeling and preference optimization evidence supports a research direction, while tracing unsupported or weak claims separately.",
                wiki_root=wiki_root,
                top_k=5,
                strategy="v1",
            )
            by_type = {item["result_type"]: item for item in result.results}
            self.assertIn("claim", by_type)
            self.assertIn("evidence", by_type)
            self.assertIn("concept", by_type)
            concept_sections = {section["heading"] for section in by_type["concept"]["matched_sections"]}
            self.assertIn("Common Failure Modes", concept_sections)
            self.assertIn("Evidence / Provenance", concept_sections)

    def test_query_writeback_keeps_source_papers_paper_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wiki_root = Path(tmp) / "wiki"
            _write_test_paper(
                wiki_root / "papers/Agent-Paper.md",
                title="Agent Paper",
                aliases=["AgentPaper"],
                topics=["agent workflow"],
                methods=["tool-use agent"],
                settings=["agent workflow"],
                body_sections={"Evidence Map": "Agent evidence is source-grounded."},
            )
            _write_knowledge_page(
                wiki_root / "concepts/Tool-State-Grounding.md",
                page_type="concept",
                title="Tool-state grounding",
                body="## What It Is\n\nA concept used by tool-use agents.\n\n## Evidence / Provenance\n\n- [[papers/Agent-Paper]]",
                source_papers=["papers/Agent-Paper.md"],
            )
            context = wiki_root / ".drafts/retrieval/context.json"
            context.parent.mkdir(parents=True)
            context.write_text(
                json.dumps(
                    {
                        "results": [
                            {
                                "title": "Tool-state grounding",
                                "relative_path": "concepts/Tool-State-Grounding.md",
                                "page_id": "concepts/Tool-State-Grounding",
                                "result_type": "concept",
                                "matched_sections": [{"heading": "Evidence / Provenance", "score": 1.0, "snippet": "concept"}],
                            },
                            {
                                "title": "Agent Paper",
                                "relative_path": "papers/Agent-Paper.md",
                                "page_id": "papers/Agent-Paper",
                                "result_type": "paper",
                                "matched_sections": [{"heading": "Evidence Map", "score": 1.0, "snippet": "paper"}],
                            },
                        ]
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            proposal_dir = wiki_root / ".drafts/proposals/source-paper-boundary"
            self.assertEqual(
                main(
                    [
                        "wiki",
                        "propose-writeback",
                        "--wiki-root",
                        str(wiki_root),
                        "--query",
                        "agent workflow source boundary",
                        "--context",
                        str(context),
                        "--title",
                        "Agent Workflow Boundary",
                        "--proposal-type",
                        "synthesis",
                        "--out-dir",
                        str(proposal_dir),
                    ]
                ),
                0,
            )
            self.assertEqual(
                main(["wiki", "publish-proposal", str(proposal_dir / "proposal.json"), "--wiki-root", str(wiki_root)]),
                0,
            )
            text = (wiki_root / "syntheses/Agent-Workflow-Boundary.md").read_text(encoding="utf-8")
            self.assertIn("sources:\n  - \"concepts/Tool-State-Grounding\"\n  - \"papers/Agent-Paper\"", text)
            self.assertIn("source_papers:\n  - \"papers/Agent-Paper\"", text)
            source_papers_block = text.split("source_papers:", 1)[1].split("source_sections:", 1)[0]
            self.assertNotIn("concepts/Tool-State-Grounding", source_papers_block)


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


def _write_test_paper(
    path: Path,
    *,
    title: str,
    aliases: list[str],
    topics: list[str],
    methods: list[str],
    settings: list[str],
    body_sections: dict[str, str],
    review_state: str = "auto_converged",
    quality_gate: str = "pass",
    confidence: str = "medium",
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frontmatter = [
        "---",
        'type: "paper"',
        f'title: "{title}"',
        'status: "draft"',
        "aliases:",
        *[f'  - "{item}"' for item in aliases],
        "topics:",
        *[f'  - "{item}"' for item in topics],
        "methods:",
        *[f'  - "{item}"' for item in methods],
        "settings:",
        *[f'  - "{item}"' for item in settings],
        "datasets: []",
        "metrics: []",
        "claims: []",
        f'confidence: "{confidence}"',
        f'review_state: "{review_state}"',
        f'quality_gate: "{quality_gate}"',
        "---",
        f"# {title}",
        "",
    ]
    body = []
    for heading, content in body_sections.items():
        body.extend([f"## {heading}", "", content, ""])
    path.write_text("\n".join(frontmatter + body), encoding="utf-8")


def _write_knowledge_page(
    path: Path,
    *,
    page_type: str,
    title: str,
    body: str,
    source_papers: list[str] | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    source_papers = source_papers or []
    frontmatter = [
        "---",
        f'type: "{page_type}"',
        f'title: "{title}"',
        'status: "draft"',
        "aliases: []",
        "sources:",
        *[f'  - "{item}"' for item in source_papers],
        "source_papers:",
        *[f'  - "{item}"' for item in source_papers],
        "related_papers:",
        *[f'  - "{item}"' for item in source_papers],
        "related_methods: []",
        "related_topics: []",
        "supports: []",
        "contradicts: []",
        "supersedes: []",
        "superseded_by: []",
        'confidence: "medium"',
        'review_state: "auto_converged"',
        'evolution_state: "active"',
        f'revision_id: "{page_type}-test"',
        "---",
        f"# {title}",
        "",
        body,
        "",
    ]
    path.write_text("\n".join(frontmatter), encoding="utf-8")


def _system_eval_context_result(
    relative_path: str,
    *,
    page_type: str,
    corpus_type: str,
    sections: list[str],
) -> dict[str, object]:
    return {
        "page_id": str(Path(relative_path).with_suffix("")),
        "title": Path(relative_path).stem.replace("-", " "),
        "relative_path": relative_path,
        "canonical_path": relative_path,
        "type": page_type,
        "result_type": page_type,
        "corpus_type": corpus_type,
        "knowledge_role": "compiled_knowledge" if corpus_type != "papers" else "source_page",
        "score": 10.0,
        "source_papers": ["papers/KV-Compression.md"] if corpus_type != "papers" else [],
        "sources": ["papers/KV-Compression.md"],
        "matched_sections": [{"heading": section, "score": 2.0, "snippet": f"{section} snippet."} for section in sections],
        "section_headings": sections,
        "selection_reasons": ["test fixture"],
    }


def _prepend_frontmatter_field(path: Path, field_text: str) -> None:
    text = path.read_text(encoding="utf-8")
    marker = "---\n"
    first = text.find(marker)
    second = text.find(marker, first + len(marker))
    if first != 0 or second < 0:
        raise AssertionError("test fixture missing frontmatter")
    path.write_text(text[:second] + field_text + "\n" + text[second:], encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
