from __future__ import annotations

import json
import io
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
from meridian.framework_check import (
    FRAMEWORK_CHECK_CATEGORIES,
    MCP_RUNTIME_CATEGORY,
    lab_skill_path_diagnostics,
    run_framework_check,
)
from meridian.lab import initialize_lab_space, validate_lab_space
from meridian.mcp import adapter as mcp_adapter
from meridian.mcp import harness as mcp_harness
from meridian.mcp import server as mcp_server
from meridian.setup.runtime import (
    CommandResult,
    RuntimeCandidate,
    default_runtime_candidates,
    resolve_meridian_runtime,
)
from meridian.setup.clients import inspect_client_installs
from meridian.setup.doctor import build_setup_doctor_report, format_setup_doctor
from meridian.setup.repair import apply_mcp_repair, plan_mcp_repair
from meridian.wiki import commands as wiki_commands
from meridian.wiki.corpus import retrieve_papers
from meridian.wiki.context_paths import default_context_out_dir
from meridian.wiki.extract import PageExtraction, PdfExtraction
from meridian.wiki.ingest import _title_from_first_page
from meridian.wiki.health_server import HealthRunController
from meridian.wiki.model import _primary_paper_key, build_paper_model
from meridian.wiki.packet import _trusted_metadata_authors
from meridian.wiki.quality_check import (
    _candidate_record_score,
    _retrieval_intent_quality_score,
    _retrieval_scenarios,
    _retrieval_taxonomy_boundary_score,
    run_quality_self_check,
)
from meridian.wiki.source_fidelity import (
    SourceFidelityResult,
    build_source_fidelity_packet,
    decide_publish,
    load_source_fidelity_result,
)

PRODUCT_SKILL_NAMES = ["meridian", "wiki", "lab", "meridian-coding"]
AGENT_PLUGIN_SKILL_ROOT = Path("plugins/agent/meridian/skills")
CODEX_PLUGIN_SKILL_ROOT = Path("plugins/codex/meridian/skills")
CLAUDE_PLUGIN_SKILL_ROOT = Path("plugins/claude-code/meridian/skills")


def _run_cli_capture(args: list[str], env: dict[str, str] | None = None) -> tuple[int, str, str]:
    stdout = StringIO()
    stderr = StringIO()
    env_context = patch.dict(os.environ, env) if env is not None else patch.dict(os.environ, {})
    with env_context, redirect_stdout(stdout), redirect_stderr(stderr):
        exit_code = main(args)
    return exit_code, stdout.getvalue(), stderr.getvalue()


def _run_mcp_adapter_capture(args: list[str], env: dict[str, str] | None = None) -> tuple[int, str, str]:
    stdout = StringIO()
    stderr = StringIO()
    env_context = patch.dict(os.environ, env) if env is not None else patch.dict(os.environ, {})
    with env_context, redirect_stdout(stdout), redirect_stderr(stderr):
        try:
            exit_code = mcp_adapter.main(args)
        except SystemExit as exc:
            exit_code = int(exc.code or 0)
    return exit_code, stdout.getvalue(), stderr.getvalue()


def _mcp_frame(message: dict[str, object]) -> bytes:
    payload = json.dumps(message).encode("utf-8")
    return b"Content-Length: " + str(len(payload)).encode("ascii") + b"\r\n\r\n" + payload


def _mcp_framed_responses(raw: bytes) -> list[dict[str, object]]:
    responses: list[dict[str, object]] = []
    offset = 0
    while offset < len(raw):
        header_end = raw.index(b"\r\n\r\n", offset)
        header = raw[offset:header_end]
        length = int(header.split(b":", 1)[1].strip())
        body_start = header_end + 4
        body_end = body_start + length
        responses.append(json.loads(raw[body_start:body_end].decode("utf-8")))
        offset = body_end
    return responses


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

    def test_plugin_version_surfaces_are_aligned(self) -> None:
        # The skills and MCP (plugins and Python core) share VERSION; the desktop app has its own version.
        expected = Path("VERSION").read_text(encoding="utf-8").strip()
        self.assertRegex(expected, r"^\d+\.\d+\.\d+$")
        self.assertEqual(__version__, expected)
        self.assertEqual(mcp_server.SERVER_VERSION, expected)

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
        agent_plugin = json.loads(Path("plugins/agent/meridian/plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(codex_plugin["version"], expected)
        self.assertEqual(claude_plugin["version"], expected)
        self.assertEqual(agent_plugin["version"], expected)

        exit_code, stdout, stderr = _run_cli_capture(["--version"])
        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(stdout.strip(), f"meridian {expected}")

    def test_desktop_app_version_surfaces_are_aligned(self) -> None:
        desktop = json.loads(Path("apps/desktop/package.json").read_text(encoding="utf-8"))["version"]
        self.assertRegex(desktop, r"^\d+\.\d+\.\d+$")
        lock = json.loads(Path("package-lock.json").read_text(encoding="utf-8"))
        self.assertEqual(lock["packages"]["apps/desktop"]["version"], desktop)

    def test_python_module_entrypoints_execute_cli_main(self) -> None:
        env = os.environ.copy()
        src_path = str((Path.cwd() / "src").resolve())
        env["PYTHONPATH"] = src_path if not env.get("PYTHONPATH") else f"{src_path}{os.pathsep}{env['PYTHONPATH']}"

        meridian = subprocess.run(
            [sys.executable, "-m", "meridian", "--version"],
            cwd=Path.cwd(),
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        cli_module = subprocess.run(
            [sys.executable, "-m", "meridian.cli", "--version"],
            cwd=Path.cwd(),
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        cli_help = subprocess.run(
            [sys.executable, "-m", "meridian.cli", "wiki", "--help"],
            cwd=Path.cwd(),
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(meridian.returncode, 0, meridian.stderr)
        self.assertEqual(meridian.stdout.strip(), f"meridian {__version__}")
        self.assertEqual(cli_module.returncode, 0, cli_module.stderr)
        self.assertEqual(cli_module.stdout.strip(), f"meridian {__version__}")
        self.assertEqual(cli_help.returncode, 0, cli_help.stderr)
        self.assertIn("usage: meridian wiki", cli_help.stdout)

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

    def test_source_fidelity_result_requires_core_statement_support(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source-fidelity-result.json"
            path.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "The method rotates activations before quantization.",
                                "role": "source_fact",
                                "core": True,
                                "verdict": "supported",
                                "support": [{"page": 2, "excerpt": "rotates activations before quantization"}],
                                "repair_bucket": "none",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = load_source_fidelity_result(path)

            self.assertEqual(result.decision, "pass")
            self.assertEqual(result.weighted_score, 4.8)
            self.assertEqual(result.blocking_findings, [])

    def test_source_fidelity_result_blocks_unsupported_core_statement(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source-fidelity-result.json"
            path.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "The paper proves lossless compression.",
                                "role": "source_fact",
                                "core": True,
                                "verdict": "unsupported",
                                "support": [],
                                "repair_bucket": "paper_model_extraction",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = load_source_fidelity_result(path)

            self.assertEqual(result.decision, "fail")
            self.assertEqual(result.blocking_findings[0]["rule_id"], "unsupported_core_statement")

    def test_source_fidelity_result_blocks_missing_core_statement(self) -> None:
        cases = [
            ("empty statements", []),
            (
                "no core statements",
                [
                    {
                        "statement_id": "stmt-1",
                        "statement": "The method rotates activations before quantization.",
                        "role": "source_fact",
                        "core": False,
                        "verdict": "supported",
                        "support": [{"page": 2, "excerpt": "rotates activations before quantization"}],
                        "repair_bucket": "none",
                    }
                ],
            ),
        ]
        for label, statements in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "source-fidelity-result.json"
                path.write_text(
                    json.dumps(
                        {
                            "schema_version": "paper_wiki_source_fidelity_result.v0",
                            "agent": "source_fidelity",
                            "decision": "pass",
                            "weighted_score": 4.8,
                            "statements": statements,
                            "hard_failures": [],
                            "recommended_repairs": [],
                        }
                    )
                    + "\n",
                    encoding="utf-8",
                )

                result = load_source_fidelity_result(path)

                self.assertEqual(result.decision, "fail")
                self.assertIn("missing_core_statement", {finding["rule_id"] for finding in result.blocking_findings})

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source-fidelity-result.json"
            path.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "The method rotates activations before quantization.",
                                "role": "source_fact",
                                "core": "true",
                                "verdict": "supported",
                                "support": [{"page": 2, "excerpt": "rotates activations before quantization"}],
                                "repair_bucket": "none",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = load_source_fidelity_result(path)

            self.assertEqual(result.decision, "fail")
            self.assertIn("invalid_statement_core", {finding["rule_id"] for finding in result.blocking_findings})

    def test_source_fidelity_result_blocks_malformed_support(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source-fidelity-result.json"
            path.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "The method rotates activations before quantization.",
                                "role": "source_fact",
                                "core": True,
                                "verdict": "supported",
                                "support": [{}],
                                "repair_bucket": "none",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = load_source_fidelity_result(path)

            self.assertEqual(result.decision, "fail")
            self.assertIn("invalid_statement_support", {finding["rule_id"] for finding in result.blocking_findings})

    def test_source_fidelity_result_accepts_non_page_locator_support(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source-fidelity-result.json"
            path.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "The method is described in the methods section.",
                                "role": "source_fact",
                                "core": True,
                                "verdict": "supported",
                                "support": [{"section": "Methods", "excerpt": "The method is described."}],
                                "repair_bucket": "none",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = load_source_fidelity_result(path)

            self.assertEqual(result.decision, "pass")
            self.assertEqual(result.blocking_findings, [])

    def test_source_fidelity_result_blocks_blank_support_locator_or_evidence(self) -> None:
        cases = [
            ("blank section locator", {"section": " ", "excerpt": "The method is described."}),
            ("blank excerpt", {"page": 2, "excerpt": " "}),
        ]
        for label, support in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "source-fidelity-result.json"
                path.write_text(
                    json.dumps(
                        {
                            "schema_version": "paper_wiki_source_fidelity_result.v0",
                            "agent": "source_fidelity",
                            "decision": "pass",
                            "weighted_score": 4.8,
                            "statements": [
                                {
                                    "statement_id": "stmt-1",
                                    "statement": "The method is described in the source.",
                                    "role": "source_fact",
                                    "core": True,
                                    "verdict": "supported",
                                    "support": [support],
                                    "repair_bucket": "none",
                                }
                            ],
                            "hard_failures": [],
                            "recommended_repairs": [],
                        }
                    )
                    + "\n",
                    encoding="utf-8",
                )

                result = load_source_fidelity_result(path)

                self.assertEqual(result.decision, "fail")
                self.assertIn("invalid_statement_support", {finding["rule_id"] for finding in result.blocking_findings})

    def test_source_fidelity_result_blocks_unusable_support_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source-fidelity-result.json"
            path.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "The method rotates activations before quantization.",
                                "role": "source_fact",
                                "core": True,
                                "verdict": "supported",
                                "support": [{"page": 0, "evidence": False}],
                                "repair_bucket": "none",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = load_source_fidelity_result(path)

            self.assertEqual(result.decision, "fail")
            self.assertIn("invalid_statement_support", {finding["rule_id"] for finding in result.blocking_findings})

    def test_source_fidelity_packet_marks_missing_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "run.json"
            manifest.write_text(
                json.dumps(
                    {
                        "title": "Missing Artifact Paper",
                        "draft_artifacts": {"paper_page": "missing-paper.md"},
                        "pages_jsonl": "missing-pages.jsonl",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            packet = root / "source-fidelity-packet.md"

            build_source_fidelity_packet(manifest, packet)

            text = packet.read_text(encoding="utf-8")
            self.assertIn("[missing artifact: missing-paper.md]", text)
            self.assertIn("[missing artifact: missing-pages.jsonl]", text)

    def test_source_fidelity_packet_prefers_manifest_local_relative_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest_dir = root / "run"
            cwd_dir = root / "cwd"
            manifest_dir.mkdir()
            cwd_dir.mkdir()
            (manifest_dir / "paper.md").write_text("manifest-local paper", encoding="utf-8")
            (cwd_dir / "paper.md").write_text("cwd paper", encoding="utf-8")
            manifest = manifest_dir / "run.json"
            manifest.write_text(
                json.dumps(
                    {
                        "title": "Relative Artifact Paper",
                        "draft_artifacts": {"paper_page": "paper.md"},
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            packet = manifest_dir / "source-fidelity-packet.md"
            previous_cwd = Path.cwd()
            try:
                os.chdir(cwd_dir)
                build_source_fidelity_packet(manifest, packet)
            finally:
                os.chdir(previous_cwd)

            text = packet.read_text(encoding="utf-8")
            self.assertIn("manifest-local paper", text)
            self.assertNotIn("cwd paper", text)

    def test_publish_decision_requires_quality_structural_and_source_fidelity_pass(self) -> None:
        source = SourceFidelityResult(
            path=Path("source-fidelity-result.json"),
            decision="pass",
            weighted_score=4.7,
            blocking_findings=[],
        )

        decision = decide_publish(
            quality_gate_decision="pass",
            quality_self_check_decision="pass",
            quality_self_check_score=4.7,
            structural_self_check_decision="pass",
            structural_self_check_score=4.7,
            source_fidelity=source,
            source_fidelity_result_provided=True,
            publish_mode="auto",
        )

        self.assertEqual(decision.decision, "published")
        self.assertEqual(decision.reason, "all_required_gates_passed")

    def test_publish_decision_always_cannot_override_source_fidelity_failure(self) -> None:
        source = SourceFidelityResult(
            path=Path("source-fidelity-result.json"),
            decision="fail",
            weighted_score=1.0,
            blocking_findings=[{"rule_id": "unsupported_core_statement"}],
        )

        decision = decide_publish(
            quality_gate_decision="pass",
            quality_self_check_decision="pass",
            quality_self_check_score=4.7,
            structural_self_check_decision="pass",
            structural_self_check_score=4.7,
            source_fidelity=source,
            source_fidelity_result_provided=True,
            publish_mode="always",
        )

        self.assertEqual(decision.decision, "blocked")
        self.assertEqual(decision.reason, "source_fidelity_not_pass")
        self.assertEqual(decision.trust_state, "quarantined")

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
                        "--no-page-images",
                    ]
                )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Managed source PDF:", stdout)
            self.assertIn(str(library / "sources" / "papers"), stdout)
            self.assertIn("Canonical wiki page: not published", stdout)
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
            self.assertFalse(run["canonical_wiki_mutated"])
            self.assertEqual(run["write_policy"], "draft_only")
            self.assertNotIn("canonical_artifacts", run)

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
            expected_dir = default_context_out_dir(query)
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

    def test_mcp_json_bridge_context_reports_needs_init_without_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "empty-config"
            exit_code, stdout, stderr = _run_mcp_adapter_capture(
                ["context", "--query", "agent workflow goals"],
                env={"MERIDIAN_CONFIG_HOME": str(config_home)},
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("needs_init", stderr)
        self.assertIn("meridian wiki init --library-root", stderr)

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

    def test_wiki_ingest_can_publish_canonical_draft_only(self) -> None:
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
                ]
            )

            self.assertEqual(exit_code, 0)
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertFalse(run["canonical_wiki_mutated"])
            self.assertEqual(run["write_policy"], "draft_only")
            self.assertNotIn("canonical_artifacts", run)
            self.assertIn("product_artifacts", run)
            self.assertIn("internal_artifacts", run)
            self.assertIn("debug_artifacts", run)
            self.assertIn("retrieval_visibility", run)

            canonical = wiki_root / "papers/Fake-Research-Paper.md"
            self.assertFalse(canonical.exists())
            self.assertIsNone(run["product_artifacts"]["canonical_paper_page"])
            self.assertEqual(run["internal_artifacts"]["paper_candidate"], str(out / "paper.md"))
            self.assertEqual(run["debug_artifacts"]["review_packet"], str(out / "review.md"))
            self.assertIsNone(run["retrieval_visibility"]["canonical_page"])
            self.assertTrue(run["retrieval_visibility"]["canonical_corpus_only"])

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
            self.assertIn("wiki/.drafts/ingests/fake-paper/run.json", committed_files)
            self.assertIn("wiki/.drafts/ingests/fake-paper/paper.md", committed_files)

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
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Managed source PDF:", stdout)
            self.assertIn("Canonical wiki page: not published", stdout)
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

    def test_wiki_health_strict_blocks_unverified_canonical_paper(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            self.assertEqual(main(["wiki", "init", "--wiki-root", str(wiki_root)]), 0)
            _write_test_paper(
                wiki_root / "papers/Unverified-Paper.md",
                title="Unverified Paper",
                aliases=["UnverifiedPaper"],
                topics=["source fidelity"],
                methods=["paper audit"],
                settings=["strict health"],
                body_sections={"Evidence Map": "This page has not passed source-fidelity validation."},
                validation_state=None,
                trust_state=None,
            )
            out = root / "health.json"

            exit_code, stdout, stderr = _run_cli_capture(
                ["wiki", "health", "--wiki-root", str(wiki_root), "--profile", "strict", "--out", str(out)]
            )

            self.assertEqual(exit_code, 1, stderr)
            self.assertIn("Wiki health:", stdout)
            health = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(health["health_level"], "blocked")
            self.assertIn(
                "canonical_source_fidelity_unverified",
                {item["code"] for item in health["hard_failures"]},
            )
            audit = health["source_fidelity_audit"]
            self.assertEqual(audit["unverified"], 1)
            self.assertEqual(audit["verified"], 0)
            self.assertIn("papers/Unverified-Paper.md", audit["findings"][0]["path"])
            repair_text = json.dumps(health["repair_queue"], ensure_ascii=False).lower()
            self.assertIn("source fidelity", repair_text)
            self.assertIn("unverified", repair_text)

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

    def test_wiki_flow_blocks_publish_without_source_fidelity_result(self) -> None:
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
            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertEqual(flow["publish_decision"], "blocked")
            self.assertEqual(run["publish_decision"], "blocked")
            self.assertIn("Publish decision: blocked", stdout)
            self.assertIn(f"Block reason: {flow['block_reason']}", stdout)
            self.assertIn(f"Source-fidelity packet: {flow['source_fidelity_packet']}", stdout)
            self.assertFalse(run["canonical_wiki_mutated"])
            self.assertFalse((wiki_root / "papers/Fake-Research-Paper.md").exists())

    def test_wiki_flow_always_blocks_without_explicit_source_fidelity_result(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            rubric = root / "rubric.md"
            pdf.write_bytes(b"%PDF fake")
            rubric.write_text("# Rubric\n", encoding="utf-8")
            out = wiki_root / ".drafts/ingests/manual-override-flow"

            wiki_commands.run_flow(
                pdf_path=pdf,
                out_dir=out,
                wiki_root=wiki_root,
                rubric_path=rubric,
                publish_mode="always",
            )

            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertEqual(flow["publish_decision"], "blocked")
            self.assertEqual(flow["block_reason"], "manual_override_requires_source_fidelity_result")
            self.assertEqual(run["publish_decision"], "blocked")
            self.assertFalse(run["canonical_wiki_mutated"])
            self.assertFalse((wiki_root / "papers/Fake-Research-Paper.md").exists())

    def test_wiki_flow_blocked_with_judge_result_does_not_converge(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            rubric = root / "rubric.md"
            judge = root / "judge-result.json"
            pdf.write_bytes(b"%PDF fake")
            rubric.write_text("# Rubric\n", encoding="utf-8")
            judge.write_text(json.dumps(_passing_judge_result("case-blocked-flow")) + "\n", encoding="utf-8")
            out = wiki_root / ".drafts/ingests/blocked-judge-flow"

            result = wiki_commands.run_flow(
                pdf_path=pdf,
                out_dir=out,
                wiki_root=wiki_root,
                rubric_path=rubric,
                publish_mode="auto",
                judge_result_path=judge,
            )

            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertEqual(result.status, "blocked")
            self.assertEqual(flow["status"], "blocked")
            self.assertEqual(flow["publish_decision"], "blocked")
            self.assertEqual(run["publish_decision"], "blocked")
            self.assertNotIn("judge_result", run)
            self.assertNotIn("convergence", run)
            self.assertNotIn("deterministic_convergence", run)
            self.assertIsNone(flow["validation_artifacts"]["convergence"])
            self.assertIsNone(flow["convergence"])
            self.assertFalse((out / "convergence.json").exists())

    def test_wiki_flow_publishes_with_passing_source_fidelity_result(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            sys.modules["fitz"].open = lambda path: CodeQuantLikeDocument()
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            rubric = root / "rubric.md"
            source_fidelity = root / "source-fidelity-result.json"
            pdf.write_bytes(b"%PDF fake")
            rubric.write_text("# Rubric\n", encoding="utf-8")
            source_fidelity.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "CodeQuant applies rotations to smooth activation outliers.",
                                "role": "source_fact",
                                "core": True,
                                "verdict": "supported",
                                "support": [
                                    {
                                        "page": 2,
                                        "excerpt": "Stage 1 applies learnable rotations to smooth activation outliers.",
                                    }
                                ],
                                "repair_bucket": "none",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            out = wiki_root / ".drafts/ingests/codequant-flow"

            wiki_commands.run_flow(
                pdf_path=pdf,
                out_dir=out,
                wiki_root=wiki_root,
                rubric_path=rubric,
                publish_mode="auto",
                source_fidelity_result_path=source_fidelity,
            )

            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            canonical = wiki_root / "papers/CodeQuant-Unified-Clustering-and-Quantization.md"
            self.assertEqual(flow["publish_decision"], "published")
            self.assertEqual(run["publish_decision"], "published")
            self.assertTrue(canonical.exists())
            text = canonical.read_text(encoding="utf-8")
            self.assertIn('validation_state: "source_fidelity_pass"', text)
            self.assertIn('trust_state: "source_verified"', text)

    def test_wiki_flow_cli_source_fidelity_result_publishes_canonical_page(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            sys.modules["fitz"].open = lambda path: CodeQuantLikeDocument()
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            rubric = root / "rubric.md"
            source_fidelity = root / "source-fidelity-result.json"
            pdf.write_bytes(b"%PDF fake")
            rubric.write_text("# Rubric\n", encoding="utf-8")
            source_fidelity.write_text(json.dumps(_passing_source_fidelity_result()) + "\n", encoding="utf-8")
            out = wiki_root / ".drafts/ingests/codequant-flow"

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
                    "--source-fidelity-result",
                    str(source_fidelity),
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            canonical = wiki_root / "papers/CodeQuant-Unified-Clustering-and-Quantization.md"
            self.assertEqual(flow["publish_decision"], "published")
            self.assertEqual(run["publish_decision"], "published")
            self.assertTrue(canonical.exists())
            self.assertIn("Publish decision: published", stdout)
            self.assertIn(f"Source-fidelity packet: {flow['source_fidelity_packet']}", stdout)
            text = canonical.read_text(encoding="utf-8")
            self.assertIn('validation_state: "source_fidelity_pass"', text)
            self.assertIn('trust_state: "source_verified"', text)

    def test_wiki_catalog_indexes_canonical_paper_frontmatter(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            _write_test_paper(
                wiki_root / "papers/Fake-Research-Paper.md",
                title="Fake Research Paper",
                aliases=["Fake Paper"],
                topics=["paper-specific research topic"],
                methods=["paper-specific research method"],
                settings=["paper-specific setting"],
                body_sections={
                    "What To Remember": "This canonical fixture should be indexed.",
                    "Mechanism": "The method is intentionally small for catalog coverage.",
                },
            )
            wiki_commands.catalog_wiki(wiki_root=wiki_root)

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

    def test_product_wiki_skill_uses_reliable_context_entry(self) -> None:
        for root in (CODEX_PLUGIN_SKILL_ROOT, CLAUDE_PLUGIN_SKILL_ROOT):
            skill = root / "wiki/SKILL.md"
            self.assertTrue(skill.exists())
            text = skill.read_text(encoding="utf-8")
            self.assertIn("meridian wiki context", text)
            self.assertIn("meridian wiki status", text)
            self.assertIn("meridian-context", text)
            self.assertIn("MERIDIAN_CORE_ROOT", text)
            self.assertIn("do not start with broad `rg`", text)
            self.assertIn("HTTP(S) paper URL", text)
            self.assertIn("download it to a local PDF first", text)
            self.assertIn("MCP source update is a handoff", text)
            self.assertIn("Do not read CLI internals", text)

    def test_meridian_setup_skill_exists(self) -> None:
        skill = CODEX_PLUGIN_SKILL_ROOT / "meridian/SKILL.md"
        self.assertTrue(skill.exists())
        text = skill.read_text(encoding="utf-8")
        self.assertIn("Entry Boundary", text)
        self.assertIn("Status Check", text)
        self.assertIn("Initialize", text)
        self.assertIn("Migration Check", text)
        self.assertIn("python -m meridian wiki status", text)
        self.assertIn("meridian-wiki.json", text)
        self.assertIn("needs_migration", text)
        self.assertIn("needs_lab_init", text)
        self.assertIn("Lab state separately", text)
        self.assertIn("minimal Lab skeleton", text)
        self.assertIn("create the minimal Lab skeleton during setup", text)
        self.assertIn("Do not report overall `ready`", text)
        self.assertIn("This is setup initialization, not a Lab workflow", text)
        self.assertIn("It must not create thread", text)
        self.assertIn("plugin cache/manifest", text)
        self.assertIn("workspace schema", text)
        self.assertIn("delegate those to wiki and lab", text)
        self.assertIn("hand off to the normal coding workflow", text)
        self.assertIn("unreadable `lab/SKILL.md` path", text)
        self.assertIn("remembered Lab semantics", text)
        self.assertIn("coding-style profile", text)
        self.assertIn("Coding Style Feedback Gate", text)
        self.assertIn("MERIDIAN_CONFIG_HOME", text)
        self.assertIn("~/.meridian/", text)
        self.assertIn("coding-style.md", text)
        self.assertIn("research-agent-principles.md", text)
        self.assertNotIn("wants to ingest, retrieve, code, or record experiments", text)

    def test_setup_doctor_skill_and_docs_policy_is_documented(self) -> None:
        meridian = (CODEX_PLUGIN_SKILL_ROOT / "meridian/SKILL.md").read_text(encoding="utf-8")
        lab = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        wiki = (CODEX_PLUGIN_SKILL_ROOT / "wiki/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("python -m meridian setup doctor", meridian)
        self.assertIn("python -m meridian setup repair-mcp", meridian)
        self.assertIn("skill_visible_but_mcp_unavailable", meridian)
        self.assertIn("no_valid_meridian_runtime", meridian)
        self.assertIn("paper_wiki_grounding", lab)
        self.assertIn("fallback_grounding", lab)
        self.assertIn("repair_available", lab)
        self.assertIn("external_primary_sources_only_after_explicit_user_choice", lab)
        self.assertIn("Use Wiki blocked", wiki)
        self.assertIn("do not\nanswer from web search or broad file search", wiki)

    def test_meridian_product_skill_behavior_boundaries(self) -> None:
        meridian = (CODEX_PLUGIN_SKILL_ROOT / "meridian/SKILL.md").read_text(encoding="utf-8")
        wiki = (CODEX_PLUGIN_SKILL_ROOT / "wiki/SKILL.md").read_text(encoding="utf-8")
        lab = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("Entry Boundary", meridian)
        self.assertIn("Framework Check", meridian)
        self.assertIn("python -m meridian framework-check", meridian)
        self.assertIn("If the user asks to ingest, retrieve, answer from papers", meridian)
        self.assertIn("Do not continue the normal work", meridian)
        self.assertIn("inside this setup skill after the setup issue is resolved", meridian)
        self.assertIn("Report Paper Wiki/plugin state", meridian)
        self.assertIn("Lab state separately", meridian)
        self.assertIn("needs_lab_init", meridian)
        self.assertIn("create the minimal Lab skeleton during setup", meridian)
        self.assertIn("Do not defer this to `lab`", meridian)
        self.assertIn("unreadable `lab/SKILL.md` path", meridian)
        self.assertIn("plugin path drift", meridian)
        self.assertIn("code implementation, debugging, tests, commits, release, or", meridian)
        self.assertIn("hand off to the normal coding workflow", meridian)
        self.assertIn("coding-style profile", meridian)
        self.assertIn("Coding Style Feedback Gate", meridian)
        self.assertNotIn("wants to ingest, retrieve, code, or record experiments", meridian)

        self.assertIn("Behavior Priority", wiki)
        self.assertIn("Start from the user's intent, not from CLI discovery", wiki)
        self.assertIn("do not present raw command lists", wiki)
        self.assertIn("product answer", wiki)
        self.assertIn("Agent execution resolver", wiki)
        self.assertNotIn("MCP server entry:", wiki)

        self.assertIn("Behavior Priority", lab)
        self.assertIn("Lab-First Routing Gate", lab)
        self.assertIn("When the target repo has `.meridian/`, default to Lab-first preflight", lab)
        self.assertIn("Research Project Grounding Gate", lab)
        self.assertIn("For idea-related requests, Lab must first check the research graph and Paper Wiki", lab)
        self.assertIn("For research-coding requests, Lab must check Paper Wiki papers and open-source implementation", lab)
        self.assertIn("For ongoing work, Lab must place it under the correct research node", lab)
        self.assertIn("lab_route: use", lab)
        self.assertIn("lab_route: skip", lab)
        self.assertIn("Pure mechanical engineering may skip Lab", lab)
        self.assertIn("research development requests must not bypass Lab", lab)
        self.assertIn("Runtime Load Boundary", lab)
        self.assertIn("Do not continue from remembered Lab semantics", lab)
        self.assertIn("Lab is not a coding agent", lab)
        self.assertIn("Research Grounding Injection", lab)
        self.assertIn("User Coding Style Principles", lab)
        self.assertIn("Coding Style Feedback Gate", lab)
        self.assertIn("record_user_level_principle", lab)
        self.assertIn("ask_whether_to_record", lab)
        self.assertIn("Do not use for code implementation", lab)


    def test_meridian_plugin_skill_copies_match_repo_skills(self) -> None:
        for skill_name in PRODUCT_SKILL_NAMES:
            agent = (AGENT_PLUGIN_SKILL_ROOT / skill_name / "SKILL.md").read_text(encoding="utf-8")
            codex = (CODEX_PLUGIN_SKILL_ROOT / skill_name / "SKILL.md").read_text(encoding="utf-8")
            claude = (CLAUDE_PLUGIN_SKILL_ROOT / skill_name / "SKILL.md").read_text(encoding="utf-8")
            self.assertEqual(agent, codex, skill_name)
            self.assertEqual(claude, codex, skill_name)

    def test_meridian_plugin_skill_frontmatter_is_loader_safe(self) -> None:
        for root in (AGENT_PLUGIN_SKILL_ROOT, CODEX_PLUGIN_SKILL_ROOT, CLAUDE_PLUGIN_SKILL_ROOT):
            for skill_name in PRODUCT_SKILL_NAMES:
                skill = root / skill_name / "SKILL.md"
                text = skill.read_text(encoding="utf-8")
                self.assertTrue(text.startswith("---\n"), str(skill))
                frontmatter = text.split("---", 2)[1]
                fields = {}
                for line in frontmatter.splitlines():
                    if ": " in line:
                        key, value = line.split(": ", 1)
                        fields[key] = value
                self.assertEqual(skill_name, fields.get("name"), str(skill))
                description = fields.get("description", "")
                self.assertTrue(description, str(skill))
                if ": " in description:
                    self.assertTrue(
                        (description.startswith('"') and description.endswith('"'))
                        or (description.startswith("'") and description.endswith("'")),
                        f"{skill} has a description with ': ' that must be quoted for YAML loaders",
                    )

    def test_product_skills_route_health_findings(self) -> None:
        wiki = (CODEX_PLUGIN_SKILL_ROOT / "wiki/SKILL.md").read_text(encoding="utf-8")
        lab = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("Health / Repair Triage", wiki)
        self.assertIn("knowledge_graph", wiki)
        self.assertIn("concept_coverage", wiki)
        self.assertIn("Wiki Health Signals", lab)

    def test_framework_check_reports_stable_categories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake_home = Path(tmp) / "home"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(Path(tmp) / "config")}):
                with patch.object(Path, "home", return_value=fake_home):
                    report = run_framework_check(project_root=Path.cwd())

        self.assertEqual(report.to_dict()["schema_version"], "meridian.framework_check.v0")
        self.assertEqual([category.name for category in report.categories], FRAMEWORK_CHECK_CATEGORIES)
        category_status = {category.name: category.status for category in report.categories}
        self.assertEqual(category_status["Product Surface"], "pass")
        self.assertEqual(category_status["Plugin Bundle"], "pass")
        self.assertEqual(category_status["Runtime"], "pass")
        self.assertEqual(category_status["Workspace"], "pass")
        self.assertEqual(category_status["Lab State"], "pass")

        info_codes = {
            finding.code
            for category in report.categories
            for finding in category.findings
            if finding.severity == "info"
        }
        self.assertIn("workspace_not_configured", info_codes)
        self.assertIn("lab_state_not_checked", info_codes)
        self.assertIn("lab_skill_path_readable", info_codes)
        self.assertIn("coding_style_profile_missing", info_codes)

    def test_framework_check_include_mcp_runtime_adds_setup_findings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake_home = Path(tmp) / "home"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(Path(tmp) / "config")}):
                with patch.object(Path, "home", return_value=fake_home):
                    report = run_framework_check(project_root=Path.cwd(), include_mcp_runtime=True)

        category_names = [category.name for category in report.categories]
        self.assertEqual(category_names[: len(FRAMEWORK_CHECK_CATEGORIES)], FRAMEWORK_CHECK_CATEGORIES)
        self.assertEqual(category_names[-1], MCP_RUNTIME_CATEGORY)
        mcp_runtime = next(category for category in report.categories if category.name == MCP_RUNTIME_CATEGORY)
        self.assertGreaterEqual(len(mcp_runtime.findings), 1)

    def test_framework_check_mcp_runtime_translates_setup_findings(self) -> None:
        fake_report = types.SimpleNamespace(
            findings=[
                {
                    "severity": "critical",
                    "client": "codex",
                    "code": "skill_visible_but_mcp_unavailable",
                    "message": "launcher failed",
                    "next_action": "repair codex",
                },
                {
                    "severity": "degraded",
                    "client": "claude",
                    "code": "needs_plugin_install",
                    "message": "cache missing",
                    "next_action": "install claude",
                },
            ]
        )
        with patch("meridian.framework_check.build_setup_doctor_report", return_value=fake_report):
            report = run_framework_check(project_root=Path.cwd(), include_mcp_runtime=True)

        mcp_runtime = next(category for category in report.categories if category.name == MCP_RUNTIME_CATEGORY)
        by_code = {finding.code: finding for finding in mcp_runtime.findings}
        self.assertEqual(by_code["skill_visible_but_mcp_unavailable"].severity, "critical")
        self.assertEqual(by_code["skill_visible_but_mcp_unavailable"].message, "codex: launcher failed")
        self.assertEqual(by_code["needs_plugin_install"].severity, "degraded")
        self.assertEqual(by_code["needs_plugin_install"].message, "claude: cache missing")

    def test_framework_check_mcp_runtime_reports_ready_when_setup_has_no_findings(self) -> None:
        fake_report = types.SimpleNamespace(findings=[])
        with patch("meridian.framework_check.build_setup_doctor_report", return_value=fake_report):
            report = run_framework_check(project_root=Path.cwd(), include_mcp_runtime=True)

        mcp_runtime = next(category for category in report.categories if category.name == MCP_RUNTIME_CATEGORY)
        self.assertEqual(mcp_runtime.status, "pass")
        self.assertEqual(len(mcp_runtime.findings), 1)
        self.assertEqual(mcp_runtime.findings[0].severity, "info")
        self.assertEqual(mcp_runtime.findings[0].code, "mcp_runtime_ready")

    def test_setup_runtime_resolver_selects_sys_executable(self) -> None:
        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            joined = " ".join(argv)
            if "import sys, meridian" in joined:
                return CommandResult(0, f"C:/Python/python.exe\n{__version__}\n", "")
            if "-m meridian.mcp --help" in joined:
                return CommandResult(0, "usage: python -m meridian.mcp", "")
            if "-m meridian.mcp capabilities --detail summary" in joined:
                return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
            return CommandResult(1, "", f"unexpected argv: {argv}")

        candidates = [
            RuntimeCandidate(
                label="current Python",
                command="C:/Python/python.exe",
                args_prefix=[],
                source="sys_executable",
            )
        ]

        report = resolve_meridian_runtime(candidates=candidates, runner=runner)

        self.assertIsNotNone(report.selected)
        self.assertEqual(report.selected.command, "C:/Python/python.exe")
        self.assertTrue(report.selected.import_ok)
        self.assertTrue(report.selected.mcp_help_ok)
        self.assertTrue(report.selected.capabilities_ok)
        self.assertEqual(report.selected.version, __version__)

    def test_setup_runtime_resolver_rejects_missing_python3(self) -> None:
        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            return CommandResult(127, "", "python3: command not found")

        candidates = [
            RuntimeCandidate(label="python3", command="python3", args_prefix=[], source="path")
        ]

        report = resolve_meridian_runtime(candidates=candidates, runner=runner)

        self.assertIsNone(report.selected)
        self.assertEqual(report.candidates[0].error_code, "mcp_launcher_command_not_found")
        self.assertFalse(report.candidates[0].exists)

    def test_setup_runtime_resolver_prefers_valid_meridian_python_env(self) -> None:
        calls: list[list[str]] = []

        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            calls.append(argv)
            if argv[0] == "C:/bad/python.exe":
                return CommandResult(0, "C:/bad/python.exe\n", "No module named meridian")
            if argv[0] == "C:/good/python.exe" and "-c" in argv:
                return CommandResult(0, f"C:/good/python.exe\n{__version__}\n", "")
            if argv[0] == "C:/good/python.exe" and "--help" in argv:
                return CommandResult(0, "usage: python -m meridian.mcp", "")
            if argv[0] == "C:/good/python.exe" and "capabilities" in argv:
                return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
            return CommandResult(1, "", f"unexpected argv: {argv}")

        candidates = [
            RuntimeCandidate(label="current Python", command="C:/bad/python.exe", args_prefix=[], source="sys_executable"),
            RuntimeCandidate(label="MERIDIAN_PYTHON", command="C:/good/python.exe", args_prefix=[], source="env"),
        ]

        report = resolve_meridian_runtime(candidates=candidates, runner=runner)

        self.assertEqual(report.selected.command, "C:/good/python.exe")
        self.assertEqual(report.candidates[0].error_code, "mcp_launcher_import_failed")
        self.assertGreaterEqual(len(calls), 4)

    def test_setup_runtime_resolver_default_candidates_respects_empty_env_override(self) -> None:
        with patch.dict(os.environ, {"MERIDIAN_PYTHON": "C:/ignored/python"}):
            candidates = default_runtime_candidates(env={})

        self.assertFalse(any(candidate.source == "env" for candidate in candidates))
        self.assertFalse(any(candidate.label == "MERIDIAN_PYTHON" for candidate in candidates))

    def test_setup_runtime_resolver_empty_candidates_does_not_probe(self) -> None:
        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            raise AssertionError(f"runner was called unexpectedly: {argv}")

        report = resolve_meridian_runtime(candidates=[], runner=runner)

        self.assertIsNone(report.selected)
        self.assertEqual(report.candidates, [])

    def test_setup_client_inspector_finds_codex_and_claude_caches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            for package, manifest_dir in [
                ("plugins/codex/meridian", ".codex-plugin"),
                ("plugins/claude-code/meridian", ".claude-plugin"),
            ]:
                package_root = root / package
                (package_root / manifest_dir).mkdir(parents=True)
                (package_root / manifest_dir / "plugin.json").write_text(
                    json.dumps({"name": "meridian", "version": __version__}),
                    encoding="utf-8",
                )
            for cache_root in [
                home / ".codex/plugins/cache/meridian/meridian" / __version__,
                home / ".claude/plugins/cache/meridian/meridian" / __version__,
            ]:
                (cache_root / "skills/meridian").mkdir(parents=True)
                (cache_root / "skills/wiki").mkdir(parents=True)
                (cache_root / "skills/lab").mkdir(parents=True)
                for skill in ["meridian", "wiki", "lab"]:
                    (cache_root / "skills" / skill / "SKILL.md").write_text(
                        f"# {skill}\n",
                        encoding="utf-8",
                    )
                (cache_root / ".mcp.json").write_text(
                    json.dumps(
                        {
                            "mcpServers": {
                                "meridian-paper-wiki": {
                                    "command": "python3",
                                    "args": ["-m", "meridian.mcp", "serve"],
                                }
                            }
                        }
                    ),
                    encoding="utf-8",
                )

            installs = {
                item.client: item for item in inspect_client_installs(project_root=root, home=home, clients=["codex", "claude"])
            }

        self.assertEqual(installs["codex"].cache_state, "installed")
        self.assertEqual(installs["claude"].cache_state, "installed")
        self.assertEqual(installs["codex"].skills["lab"], "readable")
        self.assertEqual(installs["codex"].configured_server["command"], "python3")

    def test_setup_client_inspector_reports_missing_plugin_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            installs = inspect_client_installs(
                project_root=Path(tmp) / "project",
                home=Path(tmp) / "home",
                clients=["codex"],
            )

        self.assertEqual(installs[0].client, "codex")
        self.assertEqual(installs[0].cache_state, "missing")
        self.assertIsNone(installs[0].mcp_config_path)

    def test_setup_client_inspector_allows_empty_client_list(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            installs = inspect_client_installs(project_root=Path(tmp) / "project", home=Path(tmp) / "home", clients=[])

        self.assertEqual(installs, [])

    def test_setup_client_inspector_accepts_positional_project_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"

            installs = inspect_client_installs(root, home=home, clients=["codex"])

        self.assertEqual(installs[0].client, "codex")

    def test_setup_client_inspector_malformed_mcp_server_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            (cache_root / "skills/meridian").mkdir(parents=True)
            (cache_root / "skills/wiki").mkdir(parents=True)
            (cache_root / "skills/lab").mkdir(parents=True)
            for skill in ["meridian", "wiki", "lab"]:
                (cache_root / "skills" / skill / "SKILL.md").write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": ["not", "pairs"],
                        }
                    }
                ),
                encoding="utf-8",
            )

            installs = inspect_client_installs(project_root=root, home=home, clients=["codex"])

        self.assertIsNone(installs[0].configured_server)
        self.assertEqual(installs[0].cache_state, "installed")
        self.assertIsNotNone(installs[0].error)

    def test_setup_client_inspector_reports_mcp_server_missing_launcher_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            (cache_root / "skills/meridian").mkdir(parents=True)
            (cache_root / "skills/wiki").mkdir(parents=True)
            (cache_root / "skills/lab").mkdir(parents=True)
            for skill in ["meridian", "wiki", "lab"]:
                (cache_root / "skills" / skill / "SKILL.md").write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            installs = inspect_client_installs(project_root=root, home=home, clients=["codex"])

        self.assertIsNone(installs[0].configured_server)
        self.assertIsNotNone(installs[0].error)

    def test_setup_doctor_cli_writes_json_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            home = Path(tmp) / "home"
            json_out = root / "setup.json"
            root.mkdir(exist_ok=True)

            with patch.object(Path, "home", return_value=home):
                exit_code, stdout, stderr = _run_cli_capture(
                    [
                        "setup",
                        "doctor",
                        "--client",
                        "codex",
                        "--project-root",
                        str(root),
                        "--json-out",
                        str(json_out),
                    ]
                )

            self.assertIn(exit_code, {0, 1})
            self.assertEqual(stderr, "")
            self.assertTrue(stdout.startswith("Meridian setup doctor:"))
            self.assertTrue(json_out.exists())
            self.assertIn("status", json.loads(json_out.read_text(encoding="utf-8")))

    def test_setup_repair_mcp_cli_dry_run_does_not_apply(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            mcp_path = cache_root / ".mcp.json"
            original = {"mcpServers": {"meridian-paper-wiki": {"args": ["-m", "meridian.mcp", "serve"]}}
            }
            mcp_path.write_text(json.dumps(original), encoding="utf-8")

            with patch.object(Path, "home", return_value=home):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "repair-mcp", "--client", "codex", "--project-root", str(root)]
                )
            original_text = mcp_path.read_text(encoding="utf-8")

        self.assertIn(exit_code, {0, 1})
        self.assertEqual(stderr, "")
        self.assertIn("Planned repair:", stdout)
        self.assertIn("No files changed. Re-run with --apply.", stdout)
        self.assertEqual(json.loads(original_text), original)

    def test_setup_repair_mcp_cli_no_files_changed_message_is_dry_run_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            root.mkdir(parents=True, exist_ok=True)
            home = Path(tmp) / "home"

            with patch.object(Path, "home", return_value=home):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "repair-mcp", "--client", "codex", "--project-root", str(root)]
                )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stderr, "")
        self.assertIn("No MCP repair is available.", stdout)
        self.assertNotIn("No files changed. Re-run with --apply.", stdout)

    def test_setup_init_lab_cli_initializes_user_contract_and_lab_ready_repo(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "research-repo"
            config_home = Path(tmp) / "config"
            root.mkdir()
            (root / "AGENTS.md").write_text("# Existing Rules\n\nKeep this project rule.\n", encoding="utf-8")

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "init-lab", "--lab-root", str(root)]
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(stderr, "")
            self.assertIn("Meridian Lab setup: ready", stdout)
            self.assertIn("coding-style.md", stdout)
            self.assertIn("research-agent-principles.md", stdout)
            self.assertTrue((config_home / "coding-style.md").exists())
            self.assertTrue((config_home / "research-agent-principles.md").exists())
            agents = (root / "AGENTS.md").read_text(encoding="utf-8")
            self.assertIn("Keep this project rule.", agents)
            self.assertIn("MERIDIAN RESEARCH AGENT CONTRACT START", agents)
            self.assertEqual(validate_lab_space(root).status, "pass")

    def test_setup_init_lab_cli_reports_existing_lab_state_blockers_without_overwriting_threads(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "research-repo"
            config_home = Path(tmp) / "config"
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            (lab / "state.md").write_text(
                "---\ntype: lab-state\nactive_thread: direction\n---\n# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            thread = lab / "threads/direction.md"
            original_thread = "# Direction\n\nExisting research notes stay untouched.\n"
            thread.write_text(original_thread, encoding="utf-8")

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "init-lab", "--lab-root", str(root)]
                )

            self.assertEqual(exit_code, 1)
            self.assertEqual(stderr, "")
            self.assertIn("Meridian Lab setup: needs_manual_repair", stdout)
            self.assertIn("invalid_thread_type", stdout)
            self.assertIn("thread_without_nodes", stdout)
            self.assertTrue((root / "AGENTS.md").exists())
            self.assertTrue((config_home / "coding-style.md").exists())
            self.assertTrue((config_home / "research-agent-principles.md").exists())
            self.assertEqual(thread.read_text(encoding="utf-8"), original_thread)

    def test_setup_init_lab_cli_accepts_meridian_directory_as_lab_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "research-repo"
            config_home = Path(tmp) / "config"
            lab = root / ".meridian"

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "init-lab", "--lab-root", str(lab)]
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(stderr, "")
            self.assertIn("Meridian Lab setup: ready", stdout)
            self.assertTrue((root / "AGENTS.md").exists())
            self.assertIn("MERIDIAN RESEARCH AGENT CONTRACT START", (root / "AGENTS.md").read_text(encoding="utf-8"))

    def test_setup_repair_mcp_cli_apply_writes_target_and_backup(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            mcp_path = cache_root / ".mcp.json"
            original_text = '{"mcpServers": {"meridian-paper-wiki": '
            mcp_path.write_text(original_text, encoding="utf-8")
            json_out = root / "repair.json"

            with patch.object(Path, "home", return_value=home):
                exit_code, stdout, stderr = _run_cli_capture(
                    [
                        "setup",
                        "repair-mcp",
                        "--client",
                        "codex",
                        "--project-root",
                        str(root),
                        "--apply",
                        "--json-out",
                        str(json_out),
                    ]
                )
            self.assertEqual(exit_code, 0)
            self.assertEqual(stderr, "")
            self.assertTrue(json_out.exists())
            backups = [path for path in mcp_path.parent.iterdir() if path.name.startswith(".mcp.json.bak-")]
            self.assertTrue(backups)
            self.assertEqual(backups[0].read_text(encoding="utf-8"), original_text)
            self.assertIn("Applied repair:", stdout)
            self.assertIn("- MCP config updated", stdout)
            self.assertIn("- restart required: yes", stdout)
            self.assertEqual(
                json.loads(mcp_path.read_text(encoding="utf-8"))["mcpServers"]["meridian-paper-wiki"]["args"],
                ["-m", "meridian.mcp", "serve"],
            )
            repair_payload = json.loads(json_out.read_text(encoding="utf-8"))
            self.assertEqual(repair_payload["applied"], True)

    def test_setup_doctor_reports_repair_available_for_skill_visible_mcp_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "command": "python3",
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
                if argv[0] == sys.executable and "-c" in argv:
                    return CommandResult(0, f"{sys.executable}\n{__version__}\n", "")
                if argv[0] == sys.executable and "--help" in argv:
                    return CommandResult(0, "usage: python -m meridian.mcp", "")
                if argv[0] == sys.executable and "capabilities" in argv:
                    return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
                if argv[0] == "python3":
                    return CommandResult(127, "", "python3: command not found")
                return CommandResult(1, "", f"unexpected argv: {argv}")

            report = build_setup_doctor_report(project_root=root, home=home, clients=["codex"], runner=runner)

        self.assertEqual(report.status, "repair_available")
        self.assertIn("skill_visible_but_mcp_unavailable", {finding["code"] for finding in report.findings})
        self.assertIn("mcp_repair_available", {finding["code"] for finding in report.findings})
        self.assertIn("repair_available", format_setup_doctor(report))

    def test_setup_doctor_reports_runner_calls_timeout_for_mcp_smoke(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "command": "python3",
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            def runner(argv: list[str], timeout: float) -> CommandResult:
                if argv[0] == sys.executable and "-c" in argv:
                    return CommandResult(0, f"{sys.executable}\n{__version__}\n", "")
                if argv[0] == sys.executable and "--help" in argv and timeout == 10.0:
                    return CommandResult(0, "usage: python -m meridian.mcp", "")
                if argv[0] == sys.executable and "capabilities" in argv and timeout == 10.0:
                    return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
                if argv[0] == "python3" and "--help" in argv and timeout == 10.0:
                    return CommandResult(127, "", "python3: command not found")
                if argv[0] == "python3":
                    return CommandResult(127, "", "python3: command not found")
                return CommandResult(1, "", f"unexpected argv/timeout: {argv}/{timeout}")

            report = build_setup_doctor_report(project_root=root, home=home, clients=["codex"], runner=runner)

        self.assertEqual(report.status, "repair_available")
        self.assertIn("skill_visible_but_mcp_unavailable", {finding["code"] for finding in report.findings})

    def test_setup_doctor_reports_repair_for_malformed_mcp_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            def runner(argv: list[str], timeout: float) -> CommandResult:
                if argv[0] == sys.executable and "-c" in argv:
                    return CommandResult(0, f"{sys.executable}\n{__version__}\n", "")
                if argv[0] == sys.executable and "--help" in argv:
                    return CommandResult(0, "usage: python -m meridian.mcp", "")
                if argv[0] == sys.executable and "capabilities" in argv:
                    return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
                return CommandResult(1, "", f"unexpected argv: {argv}")

            report = build_setup_doctor_report(project_root=root, home=home, clients=["codex"], runner=runner)

        self.assertEqual(report.status, "repair_available")
        codes = {finding["code"] for finding in report.findings}
        self.assertIn("mcp_required_tool_missing", codes)
        self.assertIn("mcp_repair_available", codes)
        self.assertEqual(len(report.repair_plan), 1)
        self.assertEqual(report.repair_plan[0].client, "codex")
        self.assertEqual(report.repair_plan[0].command, sys.executable)

    def test_setup_repair_mcp_dry_run_writes_no_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original = {
                "mcpServers": {
                    "meridian-paper-wiki": {
                        "command": "python3",
                        "args": ["-m", "meridian.mcp", "serve"],
                    }
                }
            }
            mcp_path.write_text(json.dumps(original), encoding="utf-8")
            action = plan_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
            )
            self.assertEqual(json.loads(mcp_path.read_text(encoding="utf-8")), original)
            self.assertEqual(action.client, "codex")
            self.assertEqual(action.target, mcp_path)

    def test_setup_repair_mcp_apply_writes_backup_and_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mcp_path = root / ".mcp.json"
            original_payload = {
                "top": "preserve-me",
                "mcpServers": {
                    "meridian-paper-wiki": {
                        "icons": [{"src": "./assets/meridian-mark.svg", "mimeType": "image/svg+xml"}],
                        "command": "python3",
                        "args": ["-m", "meridian.mcp", "serve"],
                    }
                },
            }
            mcp_path.write_text(
                json.dumps(original_payload),
                encoding="utf-8",
            )
            original_text = mcp_path.read_text(encoding="utf-8")

            result = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            updated = json.loads(mcp_path.read_text(encoding="utf-8"))
            self.assertTrue(result.applied)
            self.assertTrue(result.backup_path.exists())
            self.assertEqual(result.backup_path.read_text(encoding="utf-8"), original_text)
            server = updated["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "C:/Python/python.exe")
            self.assertEqual(server["icons"], [{"src": "./assets/meridian-mark.svg", "mimeType": "image/svg+xml"}])
            self.assertEqual(server["title"], "Meridian Paper Wiki")
            self.assertEqual(server["cwd"], ".")
            self.assertIn("source-grounded Paper Wiki context", server["description"])
            self.assertEqual(updated["top"], "preserve-me")

    def test_setup_repair_mcp_apply_rewrites_bad_mcp_servers_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original = {"top": "preserve-me", "mcpServers": None}
            mcp_path.write_text(json.dumps(original), encoding="utf-8")

            result = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            updated = json.loads(mcp_path.read_text(encoding="utf-8"))

            self.assertTrue(result.applied)
            self.assertTrue(result.backup_path.exists())
            self.assertEqual(updated["top"], "preserve-me")
            server = updated["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "C:/Python/python.exe")
            self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])
            self.assertEqual(server["title"], "Meridian Paper Wiki")
            self.assertEqual(server["cwd"], ".")

    def test_setup_repair_mcp_apply_rewrites_non_dict_root_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            mcp_path.write_text(json.dumps(["bad", "root"]), encoding="utf-8")

            result = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            updated = json.loads(mcp_path.read_text(encoding="utf-8"))

            self.assertTrue(result.applied)
            server = updated["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "C:/Python/python.exe")
            self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])
            self.assertEqual(server["title"], "Meridian Paper Wiki")
            self.assertEqual(server["cwd"], ".")

    def test_setup_repair_mcp_apply_rewrites_invalid_json_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original_text = '{"mcpServers": '
            mcp_path.write_text(original_text, encoding="utf-8")

            result = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            updated = json.loads(mcp_path.read_text(encoding="utf-8"))

            self.assertTrue(result.applied)
            self.assertEqual(result.backup_path.read_text(encoding="utf-8"), original_text)
            server = updated["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "C:/Python/python.exe")
            self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])
            self.assertEqual(server["title"], "Meridian Paper Wiki")
            self.assertEqual(server["cwd"], ".")

    def test_setup_repair_mcp_apply_keeps_claude_server_schema_minimal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original = {
                "mcpServers": {
                    "meridian-paper-wiki": {
                        "command": "python3",
                        "args": ["-m", "meridian.mcp", "serve"],
                    }
                }
            }
            mcp_path.write_text(json.dumps(original), encoding="utf-8")

            apply_mcp_repair(
                client="claude",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            server = json.loads(mcp_path.read_text(encoding="utf-8"))["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server, {"command": "C:/Python/python.exe", "args": ["-m", "meridian.mcp", "serve"]})

    def test_setup_repair_mcp_apply_timestamp_collision_generates_unique_backups(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original = {
                "mcpServers": {
                    "meridian-paper-wiki": {
                        "command": "python3",
                        "args": ["-m", "meridian.mcp", "serve"],
                    }
                }
            }
            mcp_path.write_text(json.dumps(original), encoding="utf-8")

            first = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )
            first_backup_text = first.backup_path.read_text(encoding="utf-8")

            second = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            self.assertNotEqual(first.backup_path, second.backup_path)
            self.assertEqual(first.backup_path.name, ".mcp.json.bak-20260615-153012")
            self.assertEqual(second.backup_path.name, ".mcp.json.bak-20260615-153012-1")
            self.assertTrue(first.backup_path.exists())
            self.assertTrue(second.backup_path.exists())
            self.assertEqual(first.backup_path.read_text(encoding="utf-8"), first_backup_text)

    def test_setup_doctor_reports_blocked_if_mixed_unrepairable_critical(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            codex_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            claude_root = home / ".claude/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = codex_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            (codex_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = claude_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            # leave claude_root/.mcp.json missing to create a non-repairable MCP config blocker

            def runner(argv: list[str], timeout: float) -> CommandResult:
                if argv[0] == sys.executable and "-c" in argv:
                    return CommandResult(0, f"{sys.executable}\n{__version__}\n", "")
                if argv[0] == sys.executable and "--help" in argv:
                    return CommandResult(0, "usage: python -m meridian.mcp", "")
                if argv[0] == sys.executable and "capabilities" in argv:
                    return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
                return CommandResult(1, "", f"unexpected argv: {argv}")

            report = build_setup_doctor_report(project_root=root, home=home, clients=["codex", "claude"], runner=runner)

        self.assertEqual(report.status, "blocked")
        codes = {finding["code"] for finding in report.findings}
        self.assertIn("mcp_repair_available", codes)
        self.assertIn("mcp_required_tool_missing", codes)
        repairable_clients = {action.client for action in report.repair_plan}
        self.assertIn("codex", repairable_clients)
        self.assertNotIn("claude", repairable_clients)
    def test_coding_style_profile_init_is_user_level_and_no_code_blocks(self) -> None:
        from meridian.lab import initialize_coding_style_profile, migrate_coding_style_profile, validate_coding_style_profile

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            profile_path = initialize_coding_style_profile(config_home=config_home)
            self.assertEqual(profile_path, (config_home / "coding-style.md").resolve())
            text = profile_path.read_text(encoding="utf-8")

            self.assertIn("schema_version: meridian.coding_style_profile.v1", text)
            self.assertIn("## Principles", text)
            self.assertIn("## Pending Review", text)
            self.assertIn("structured merge", text)
            self.assertIn("~/.meridian/code-ref/", text)
            self.assertIn("consider adding or referencing", text)
            self.assertNotIn("```", text)

            report = validate_coding_style_profile(profile_path)
            self.assertEqual(report.status, "pass", report.to_dict())

            profile_path.write_text(text + "\n## User Edit\n\nDo not overwrite me.\n", encoding="utf-8")
            rewritten = initialize_coding_style_profile(config_home=config_home)
            self.assertEqual(rewritten, profile_path)
            self.assertIn("Do not overwrite me.", profile_path.read_text(encoding="utf-8"))

            old_profile = config_home / "old-style.md"
            old_profile.write_text("# My Style\n\nKeep experiment scripts linear.\n", encoding="utf-8")
            migrated = migrate_coding_style_profile(path=old_profile)
            migrated_text = migrated.read_text(encoding="utf-8")
            self.assertIn("schema_version: meridian.coding_style_profile.v1", migrated_text)
            self.assertIn("## Principles", migrated_text)
            self.assertIn("## Pending Review", migrated_text)
            self.assertIn("structured merge", migrated_text)
            self.assertIn("Keep experiment scripts linear.", migrated_text)

    def test_research_agent_principles_init_migrate_and_validate(self) -> None:
        from meridian.lab import (
            RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION,
            initialize_research_agent_principles,
            migrate_research_agent_principles,
            research_agent_principles_path,
            validate_research_agent_principles,
        )

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            target = research_agent_principles_path(config_home=config_home)
            self.assertEqual(target, (config_home / "research-agent-principles.md").resolve())

            written = initialize_research_agent_principles(config_home=config_home)
            self.assertEqual(written, target)
            text = written.read_text(encoding="utf-8")
            self.assertIn(f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}", text)
            self.assertIn("Implementation Integrity", text)
            self.assertIn("Do not silently substitute", text)
            self.assertIn("Prefer linear, readable code", text)
            self.assertIn("## Profile Maintenance", text)
            self.assertIn("structured merge", text)
            self.assertIn("~/.meridian/code-ref/", text)
            self.assertIn("Do not append raw distillation notes", text)
            self.assertNotIn("```python", text)
            self.assertEqual(validate_research_agent_principles(written).status, "pass")

            old = config_home / "old-principles.md"
            old.write_text("# Existing Principles\n\nUser text stays.\n", encoding="utf-8")
            migrated = migrate_research_agent_principles(path=old)
            migrated_text = migrated.read_text(encoding="utf-8")
            self.assertIn("User text stays.", migrated_text)
            self.assertIn(f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}", migrated_text)
            self.assertIn("## Implementation Integrity", migrated_text)
            self.assertIn("## Research Code Style", migrated_text)
            self.assertIn("## Profile Maintenance", migrated_text)

    def test_coding_style_profile_points_to_research_agent_principles(self) -> None:
        from meridian.lab import initialize_coding_style_profile

        with tempfile.TemporaryDirectory() as tmp:
            profile = initialize_coding_style_profile(config_home=Path(tmp))
            text = profile.read_text(encoding="utf-8")
            self.assertIn("research-agent-principles.md", text)
            self.assertIn("compact", text.lower())

    def test_research_agent_principles_validate_reports_stale_contract_gaps(self) -> None:
        from meridian.lab import RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION, validate_research_agent_principles

        with tempfile.TemporaryDirectory() as tmp:
            principles = Path(tmp) / "research-agent-principles.md"
            principles.write_text(
                "\n".join(
                    [
                        "# Meridian Research Agent Principles",
                        "",
                        f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}",
                        "",
                        "## Research Code Style",
                        "",
                        "- Keep code readable.",
                        "",
                        "## Implementation Integrity",
                        "",
                        "- Do not silently substitute legacy behavior.",
                        "",
                        "```",
                        "print('too much code')",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            report = validate_research_agent_principles(principles)

        self.assertEqual(report.status, "warn")
        codes = {finding.code for finding in report.findings}
        self.assertIn("research_agent_principles_validation_missing", codes)
        self.assertIn("research_agent_principles_linear_style_missing", codes)
        self.assertIn("research_agent_principles_contains_code_block", codes)

    def test_coding_style_feedback_gate_classifies_reusable_feedback(self) -> None:
        from meridian.lab import classify_coding_style_feedback

        strong = classify_coding_style_feedback(
            "For research code I want one linear function; do not split this into so many helper functions."
        )
        weak = classify_coding_style_feedback("This file is messy and hard to maintain.")
        bug_only = classify_coding_style_feedback("The loader crashes on an empty validation split.")

        self.assertEqual(strong.outcome, "record_user_level_principle")
        self.assertIn("research_code", strong.scopes)
        self.assertIn("helper", strong.reason)
        self.assertEqual(weak.outcome, "ask_whether_to_record")
        self.assertEqual(bug_only.outcome, "do_not_record_task_local_only")

    def test_framework_check_reports_coding_style_profile_state(self) -> None:
        from meridian.lab import initialize_coding_style_profile

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                missing = run_framework_check(project_root=Path.cwd())
                initialize_coding_style_profile(config_home=config_home)
                ready = run_framework_check(project_root=Path.cwd())

        missing_category = next(category for category in missing.categories if category.name == "User Profile")
        ready_category = next(category for category in ready.categories if category.name == "User Profile")
        self.assertIn("coding_style_profile_missing", {finding.code for finding in missing_category.findings})
        self.assertIn("coding_style_profile_ready", {finding.code for finding in ready_category.findings})

    def test_framework_check_reports_research_agent_principles_state(self) -> None:
        from meridian.lab import initialize_research_agent_principles

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                missing = run_framework_check(project_root=Path.cwd())
                initialize_research_agent_principles(config_home=config_home)
                ready = run_framework_check(project_root=Path.cwd())

        missing_category = next(category for category in missing.categories if category.name == "User Profile")
        ready_category = next(category for category in ready.categories if category.name == "User Profile")
        self.assertIn("research_agent_principles_missing", {finding.code for finding in missing_category.findings})
        self.assertIn("research_agent_principles_ready", {finding.code for finding in ready_category.findings})

    def test_meridian_setup_skill_mentions_research_agent_contract(self) -> None:
        codex = Path("plugins/codex/meridian/skills/meridian/SKILL.md").read_text(encoding="utf-8")
        claude = Path("plugins/claude-code/meridian/skills/meridian/SKILL.md").read_text(encoding="utf-8")
        for text in [codex, claude]:
            self.assertIn("research-agent-principles.md", text)
            self.assertIn("AGENTS.md", text)
            self.assertIn("setup init-lab", text)
            self.assertIn("Do not silently substitute", text)
            self.assertIn("MERIDIAN_CONFIG_HOME", text)

    def test_framework_check_reports_stale_research_agent_principles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            config_home.mkdir()
            (config_home / "research-agent-principles.md").write_text(
                "# Old Principles\n\nKeep this user text.\n",
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                report = run_framework_check(project_root=Path.cwd())

        user_profile = next(category for category in report.categories if category.name == "User Profile")
        by_code = {finding.code: finding for finding in user_profile.findings}
        finding = by_code.get("research_agent_principles_schema_missing") or by_code.get(
            "research_agent_principles_integrity_missing"
        )
        self.assertIsNotNone(finding)
        assert finding is not None
        self.assertEqual(finding.severity, "degraded")
        self.assertIn("migrate", finding.next_action)
        self.assertIn("without deleting user text", finding.next_action)

    def test_framework_check_reports_missing_and_ready_agents_contract_for_lab_root(self) -> None:
        from meridian.lab import inject_meridian_agents_contract

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
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")

            missing = run_framework_check(project_root=Path.cwd(), lab_root=root)
            inject_meridian_agents_contract(root)
            ready = run_framework_check(project_root=Path.cwd(), lab_root=root)

        missing_category = next(category for category in missing.categories if category.name == "Lab State")
        ready_category = next(category for category in ready.categories if category.name == "Lab State")
        self.assertIn("agents_contract_missing", {finding.code for finding in missing_category.findings})
        self.assertIn("agents_contract_ready", {finding.code for finding in ready_category.findings})

    def test_framework_check_flags_user_style_profile_drift_inside_agents(self) -> None:
        from meridian.lab import initialize_lab_space, inject_meridian_agents_contract

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            initialize_lab_space(root)
            agents = root / "AGENTS.md"
            agents.write_text(
                agents.read_text(encoding="utf-8")
                + "\n## Meridian Coding Style Profile\n\n"
                + "- User-level style distilled from this repo should not live here.\n",
                encoding="utf-8",
            )
            inject_meridian_agents_contract(root)

            report = run_framework_check(project_root=Path.cwd(), lab_root=root)

        lab_category = next(category for category in report.categories if category.name == "Lab State")
        self.assertIn("style_profile_drift_in_agents", {finding.code for finding in lab_category.findings})

    def test_framework_check_reports_mcp_entrypoint_drift(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            for package, manifest_dir in [
                ("plugins/codex/meridian", ".codex-plugin"),
                ("plugins/claude-code/meridian", ".claude-plugin"),
            ]:
                package_root = root / package
                (package_root / manifest_dir).mkdir(parents=True)
                (package_root / ".mcp.json").write_text(
                    json.dumps(
                        {
                            "mcpServers": {
                                "meridian-paper-wiki": {
                                    "command": "python3",
                                    "args": ["-m", "meridian.mcp", "serve"],
                                }
                            }
                        }
                    ),
                    encoding="utf-8",
                )
                (package_root / manifest_dir / "plugin.json").write_text(
                    json.dumps({"name": "meridian", "version": __version__}),
                    encoding="utf-8",
                )
                for skill_name in ["meridian", "wiki", "lab"]:
                    skill = package_root / "skills" / skill_name / "SKILL.md"
                    skill.parent.mkdir(parents=True, exist_ok=True)
                    skill.write_text(f"---\nname: {skill_name}\n---\n# {skill_name}\n", encoding="utf-8")

            report = run_framework_check(project_root=root)

        bundle = next(category for category in report.categories if category.name == "Plugin Bundle")
        self.assertIn("mcp_config_entrypoint_drift", {finding.code for finding in bundle.findings})

    def test_lab_coding_style_profile_assets_parse(self) -> None:
        lab = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        meridian = (CODEX_PLUGIN_SKILL_ROOT / "meridian/SKILL.md").read_text(encoding="utf-8")
        injection = Path("src/meridian/templates/research-dev/research-grounding-injection.md").read_text(encoding="utf-8")

        for phrase in [
            "Coding Style Feedback Gate",
            "User Coding Style Principles",
            "record_user_level_principle",
            "ask_whether_to_record",
            "do_not_record_task_local_only",
            "Do not store full pasted code examples",
        ]:
            self.assertIn(phrase, lab)
        self.assertIn("coding-style profile", meridian)
        self.assertIn("## User Coding Style Principles", injection)
        self.assertIn("## Implementation Prior", injection)
        self.assertIn("## Coding Implication", injection)

    def test_research_grounding_injection_has_implementation_integrity_gate(self) -> None:
        injection = Path("src/meridian/templates/research-dev/research-grounding-injection.md").read_text(encoding="utf-8")
        codex_lab = Path("plugins/codex/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        claude_lab = Path("plugins/claude-code/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for text in [injection, codex_lab, claude_lab]:
            self.assertIn("Implementation Integrity Gate", text)
            self.assertIn("required current behavior", text)
            self.assertIn("fallback-only implementation", text)
            self.assertIn("blocker reporting", text)
            self.assertIn("validation", text)
            self.assertIn("must prove", text)
            self.assertIn("swallowed errors", text)
            self.assertTrue("placeholder/no-op" in text or "placeholder / no-op" in text)

        self.assertIn("benchmark or metric contract", injection)
        for skill in [codex_lab, claude_lab]:
            self.assertTrue("primary path" in skill or "primary requested path" in skill)
            self.assertIn("Do not let Lab implement the code", skill)

    def test_lab_documents_code_style_distillation_workflow(self) -> None:
        codex_lab = Path("plugins/codex/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        claude_lab = Path("plugins/claude-code/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for text in [codex_lab, claude_lab]:
            self.assertIn("Code Style Distillation", text)
            self.assertIn("confirmed_candidate", text)
            self.assertIn("repo_local", text)
            self.assertIn("insufficient_evidence", text)
            self.assertIn("Do not store full code blocks", text)
            self.assertIn("Do not write user coding-style sections into project `AGENTS.md`", text)
            self.assertIn("structured merge", text)
            self.assertIn("~/.meridian/code-ref/", text)
            self.assertIn("optional reference material", text)

    def test_lab_initialization_requires_deterministic_agents_contract_helper(self) -> None:
        codex_lab = Path("plugins/codex/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        claude_lab = Path("plugins/claude-code/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for text in [codex_lab, claude_lab]:
            self.assertIn("python -m meridian setup init-lab --lab-root <repo>", text)
            self.assertIn("Do not hand-write", text)
            self.assertIn("deterministic Meridian helper", text)
            self.assertIn("guarded Meridian research-agent contract block", text)

    def test_lab_skill_path_diagnostics_reports_readable_source_and_caches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            for package in ["plugins/codex/meridian", "plugins/claude-code/meridian"]:
                skill = root / package / "skills/lab/SKILL.md"
                skill.parent.mkdir(parents=True)
                skill.write_text("---\nname: lab\n---\n# Lab\n", encoding="utf-8")
            for cache in [
                home / ".codex/plugins/cache/meridian/meridian" / __version__,
                home / ".claude/plugins/cache/meridian/meridian" / __version__,
            ]:
                skill = cache / "skills/lab/SKILL.md"
                skill.parent.mkdir(parents=True)
                skill.write_text("---\nname: lab\n---\n# Lab\n", encoding="utf-8")

            records = {record["label"]: record for record in lab_skill_path_diagnostics(root, home=home)}

        self.assertEqual(records["source_codex"]["state"], "readable")
        self.assertEqual(records["source_claude"]["state"], "readable")
        self.assertEqual(records["codex_cache_current"]["state"], "readable")
        self.assertEqual(records["claude_cache_current"]["state"], "readable")
        self.assertNotIn("version_drift", {record["state"] for record in records.values()})

    def test_lab_skill_path_diagnostics_reports_unreadable_missing_and_version_drift(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            for package in ["plugins/codex/meridian", "plugins/claude-code/meridian"]:
                skill = root / package / "skills/lab/SKILL.md"
                skill.parent.mkdir(parents=True)
                skill.write_text("---\nname: lab\n---\n# Lab\n", encoding="utf-8")

            unreadable = home / ".codex/plugins/cache/meridian/meridian" / __version__ / "skills/lab/SKILL.md"
            unreadable.mkdir(parents=True)
            stale = home / ".claude/plugins/cache/meridian/meridian/0.1.0/skills/lab/SKILL.md"
            stale.parent.mkdir(parents=True)
            stale.write_text("---\nname: lab\n---\n# Old Lab\n", encoding="utf-8")

            records = {record["label"]: record for record in lab_skill_path_diagnostics(root, home=home)}

        self.assertEqual(records["codex_cache_current"]["state"], "unreadable")
        self.assertEqual(records["claude_cache_current"]["state"], "missing")
        self.assertEqual(records["claude_cache_latest"]["state"], "version_drift")
        self.assertEqual(records["claude_cache_latest"]["version"], "0.1.0")

    def test_framework_check_cli_writes_json_and_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            json_out = root / "framework.json"
            report_out = root / "framework.md"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(root / "config")}):
                with patch.object(Path, "home", return_value=root / "home"):
                    exit_code, stdout, stderr = _run_cli_capture(
                        [
                            "framework-check",
                            "--project-root",
                            str(Path.cwd()),
                            "--include-mcp-runtime",
                            "--json-out",
                            str(json_out),
                            "--report",
                            str(report_out),
                        ]
                    )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Framework status:", stdout)
            payload = json.loads(json_out.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema_version"], "meridian.framework_check.v0")
            category_names = [category["name"] for category in payload["categories"]]
            self.assertIn(MCP_RUNTIME_CATEGORY, category_names)
            markdown = report_out.read_text(encoding="utf-8")
            self.assertIn("# Meridian Framework Check", markdown)
            self.assertIn(f"### {MCP_RUNTIME_CATEGORY}:", markdown)

    def test_framework_check_catches_missing_lab_state_when_requested(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = run_framework_check(project_root=Path.cwd(), lab_root=Path(tmp))

        lab_category = next(category for category in report.categories if category.name == "Lab State")
        self.assertEqual(lab_category.status, "fail")
        self.assertIn("lab_missing_lab_root", {finding.code for finding in lab_category.findings})

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
validation_state: "source_fidelity_pass"
trust_state: "source_verified"
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
validation_state: "source_fidelity_pass"
trust_state: "source_verified"
---
# Alignment Paper

## What To Remember

This page explains preference optimization for alignment.
""",
                encoding="utf-8",
            )
            packet = root / "context.md"
            result_json = root / "context.json"

            wiki_commands.catalog_wiki(wiki_root=wiki_root)
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
            wiki_commands.catalog_wiki(wiki_root=wiki_root)
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

            wiki_commands.catalog_wiki(wiki_root=wiki_root)
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

    def test_mcp_json_bridge_capabilities_does_not_require_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "empty-config"
            exit_code, stdout, stderr = _run_mcp_adapter_capture(
                ["capabilities", "--detail", "summary"],
                env={"MERIDIAN_CONFIG_HOME": str(config_home)},
            )

        self.assertEqual(exit_code, 0, stderr)
        payload = json.loads(stdout)
        self.assertEqual(payload["schema_version"], "meridian.mcp_adapter.v0")
        self.assertIn("entry_model", payload)
        self.assertIn("tools", payload)

    def test_mcp_adapter_shapes_index_write_failure(self) -> None:
        error = PermissionError(1, "Operation not permitted", "/tmp/wiki/.index/papers.jsonl")
        payload = mcp_adapter.call_chain_error_payload(error)

        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["error_code"], "workspace_index_write_failed")
        self.assertEqual(payload["path"], "/tmp/wiki/.index/papers.jsonl")
        self.assertIn("could not refresh", payload["message"])
        self.assertIn("write access", payload["next_action"])

    def test_mcp_source_update_returns_complete_ingest_handoff(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            source = root / "paper.pdf"
            source.write_bytes(b"%PDF fake")

            payload = mcp_adapter.update(wiki_root=wiki_root, source_path=source)

            self.assertEqual(payload["workflow"], "Update Wiki")
            self.assertEqual(payload["update_type"], "source")
            self.assertEqual(payload["status"], "ready_for_ingest_flow")
            self.assertEqual(payload["handoff_type"], "cli_ingest_flow")
            self.assertEqual(payload["input_contract"]["accepted_source_forms"], ["local_pdf_path"])
            self.assertIn("download it to a local PDF first", payload["input_contract"]["url_handling"])
            self.assertTrue(payload["rubric"]["required"])
            self.assertEqual(Path(payload["rubric"]["path"]).name, "paper_wiki_quality_v0.md")
            command = payload["run_command"]
            fallback = payload["fallback_command"]
            self.assertEqual(command[:3], ["meridian", "wiki", "flow"])
            self.assertIn("--rubric", command)
            self.assertIn(str(source), command)
            self.assertEqual(fallback[:5], ["python3", "-m", "meridian", "wiki", "flow"])
            self.assertIn("--rubric", fallback)
            self.assertIn("Managed source PDF", payload["minimum_completion"])
            self.assertIn("Canonical wiki page", payload["minimum_completion"])
            self.assertIn("git clean or explicit git auto-commit status", payload["post_ingest_checks"])

            exit_code, stdout, stderr = _run_cli_capture(command[1:])

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Managed source PDF:", stdout)
            self.assertIn("Canonical wiki page:", stdout)
            flow = json.loads((wiki_root / ".drafts/ingests/paper/flow.json").read_text(encoding="utf-8"))
            self.assertEqual(flow["publish_decision"], "blocked")
            self.assertFalse((wiki_root / "papers/Fake-Research-Paper.md").exists())
            self.assertTrue(Path(flow["source_fidelity_packet"]).exists())

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
                    "meridian.workspace_status",
                    "meridian.workspace_plan",
                    "meridian.workspace_changes",
                    "meridian.workspace_idea",
                    "meridian.workspace_event_add",
                    "meridian.workspace_idea_add",
                    "meridian.lab_graph",
                    "meridian.lab_node",
                    "meridian.lab_update",
                    "meridian.lab_result",
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

    def test_mcp_stdio_server_context_reports_needs_init_without_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "empty-config"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                server = mcp_server.MeridianMCPServer()
                tools_response = server.handle_message({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
                tool_names = {tool["name"] for tool in tools_response["result"]["tools"]}
                self.assertIn("meridian.context", tool_names)

                context_response = server.handle_message(
                    {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {
                            "name": "meridian.context",
                            "arguments": {"query": "agent workflow goals"},
                        },
                    }
                )

        self.assertIn("result", context_response)
        result = context_response["result"]
        self.assertTrue(result["isError"])
        payload = json.loads(result["content"][0]["text"])
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["error_code"], "needs_init")
        self.assertIn("meridian wiki init --library-root", payload["next_action"])

    def test_mcp_stdio_server_speaks_content_length_framing(self) -> None:
        requests = [
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "clientInfo": {"name": "framed-test-client", "version": "0.1"},
                },
            },
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        ]
        stdin = io.BytesIO(b"".join(_mcp_frame(request) for request in requests))
        stdout = io.BytesIO()

        server = mcp_server.MeridianMCPServer()
        self.assertEqual(server.serve_stdio(stdin=stdin, stdout=stdout), 0)

        raw = stdout.getvalue()
        responses = _mcp_framed_responses(raw)
        self.assertEqual([response["id"] for response in responses], [1, 2])
        self.assertEqual(responses[0]["jsonrpc"], "2.0")
        self.assertEqual(responses[0]["result"]["serverInfo"]["name"], "meridian-paper-wiki")
        self.assertIn("tools", responses[0]["result"]["capabilities"])
        tool_names = {tool["name"] for tool in responses[1]["result"]["tools"]}
        self.assertIn("meridian.context", tool_names)

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
            self.assertEqual(result["summary"]["tool_count"], 18)
            self.assertTrue(result["summary"]["blocked_internal_read"])
            self.assertEqual(result["summary"]["fixture_apply_status"], "published")
            self.assertEqual(result["summary"]["workspace_status"], "ready")
            self.assertEqual(result["summary"]["workspace_plan_revision"], "fixture-revision")
            self.assertEqual(result["summary"]["workspace_change_cursor_status"], "ok")
            self.assertEqual(result["summary"]["workspace_idea_id"], "fixture-idea")
            self.assertEqual(result["summary"]["workspace_node_id"], "fixture.A")
            self.assertEqual(result["summary"]["workspace_event_status"], "created")
            self.assertEqual(result["summary"]["lab_update_status"], "applied")

    def test_release_manifest_excludes_private_runtime_state(self) -> None:
        manifest = Path("MANIFEST.in")
        self.assertTrue(manifest.exists())
        text = manifest.read_text(encoding="utf-8")
        self.assertIn("graft src", text)
        self.assertIn("graft plugins", text)
        self.assertIn("prune wiki", text)
        self.assertIn("prune .arbor", text)

    def test_plugin_release_assets_exist(self) -> None:
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
        self.assertIn("grounding", codex_manifest["keywords"])
        self.assertIn("retrieval", codex_manifest["keywords"])
        codex_interface = codex_manifest["interface"]
        self.assertIn("Read", codex_interface["capabilities"])
        self.assertIn("Write", codex_interface["capabilities"])
        self.assertLessEqual(len(codex_interface["defaultPrompt"]), 3)
        self.assertTrue(
            all(len(prompt) <= 128 for prompt in codex_interface["defaultPrompt"]),
            codex_interface["defaultPrompt"],
        )
        self.assertIn("MCP context/read/trace", codex_interface["longDescription"])
        self.assertTrue((codex_root / codex_interface["composerIcon"]).exists())
        self.assertTrue((codex_root / codex_interface["logo"]).exists())

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
            mcp_config = json.loads((root / ".mcp.json").read_text(encoding="utf-8"))
            server = mcp_config["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "python")
            self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])
            if root == codex_root:
                self.assertEqual(server["title"], "Meridian Paper Wiki")
                self.assertEqual(server["cwd"], ".")
                self.assertIn("source-grounded Paper Wiki context", server["description"])
                self.assertEqual(server["icons"][0]["mimeType"], "image/svg+xml")
                self.assertTrue((root / server["icons"][0]["src"]).exists())
            self.assertTrue((root / "skills/meridian/SKILL.md").exists())
            self.assertTrue((root / "skills/wiki/SKILL.md").exists())
            self.assertTrue((root / "skills/lab/SKILL.md").exists())
            self.assertTrue((root / "skills/meridian-coding/SKILL.md").exists())
            self.assertFalse((root / "skills/llm-wiki").exists())
            self.assertFalse((root / "skills/paper-ingest").exists())
            self.assertFalse((root / "skills/wiki-retrieve").exists())
            self.assertFalse((root / "skills/wiki-personalize").exists())
            self.assertFalse((root / "skills/wiki-evolve").exists())
            self.assertFalse((root / "skills/wiki-knowledge").exists())
            self.assertFalse((root / "skills/wiki-concept").exists())

    def test_agent_plugins_portable_package_is_standard_shaped(self) -> None:
        root = Path("plugins/agent/meridian")
        manifest = json.loads((root / "plugin.json").read_text(encoding="utf-8"))
        manifest_keys = {
            "$schema",
            "name",
            "version",
            "description",
            "author",
            "homepage",
            "repository",
            "license",
            "keywords",
            "extensions",
        }
        self.assertLessEqual(set(manifest), manifest_keys)
        self.assertEqual(manifest["$schema"], "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json")
        self.assertEqual(manifest["name"], "meridian")
        self.assertRegex(manifest["name"], r"^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")
        self.assertEqual(manifest["version"], __version__)
        self.assertIn("paper-wiki", manifest["keywords"])
        self.assertIn("lab", manifest["keywords"])

        mcp_config = json.loads((root / "mcp.json").read_text(encoding="utf-8"))
        self.assertEqual(set(mcp_config), {"$schema", "mcpServers"})
        self.assertEqual(mcp_config["$schema"], "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json")
        server = mcp_config["mcpServers"]["meridian-paper-wiki"]
        self.assertEqual(set(server), {"type", "command", "args"})
        self.assertEqual(server["type"], "stdio")
        self.assertEqual(server["command"], "python")
        self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])

        self.assertFalse((root / ".codex-plugin").exists())
        self.assertFalse((root / ".claude-plugin").exists())
        self.assertFalse((root / ".mcp.json").exists())

        skills_root = root / "skills"
        self.assertEqual(
            sorted(child.name for child in skills_root.iterdir() if child.is_dir()),
            ["lab", "meridian", "meridian-coding", "wiki"],
        )
        for skill_name in ["meridian", "wiki", "lab", "meridian-coding"]:
            portable = skills_root / skill_name / "SKILL.md"
            codex = Path("plugins/codex/meridian/skills") / skill_name / "SKILL.md"
            claude = Path("plugins/claude-code/meridian/skills") / skill_name / "SKILL.md"
            self.assertTrue(portable.exists(), str(portable))
            self.assertEqual(portable.read_text(encoding="utf-8"), codex.read_text(encoding="utf-8"))
            self.assertEqual(portable.read_text(encoding="utf-8"), claude.read_text(encoding="utf-8"))

    def test_codex_product_skills_define_ui_display_names(self) -> None:
        expected = {
            "meridian": "Meridian",
            "wiki": "Wiki",
            "lab": "Lab",
            "meridian-coding": "Meridian Coding",
        }
        for skill_name, display_name in expected.items():
            metadata = Path(f"plugins/codex/meridian/skills/{skill_name}/agents/openai.yaml")
            self.assertTrue(metadata.exists(), str(metadata))
            text = metadata.read_text(encoding="utf-8")
            self.assertIn(f'display_name: "{display_name}"', text)
            self.assertIn("short_description:", text)
            self.assertIn(f"default_prompt: \"Use ${skill_name}", text)

    def test_plugin_marketplace_taglines_match_lab_boundary(self) -> None:
        codex_marketplace = json.loads(Path(".agents/plugins/marketplace.json").read_text(encoding="utf-8"))
        claude_marketplace = json.loads(Path(".claude-plugin/marketplace.json").read_text(encoding="utf-8"))
        claude_description = claude_marketplace["plugins"][0]["description"]

        self.assertEqual(codex_marketplace["name"], "meridian")
        self.assertIn("Paper Wiki", claude_description)
        self.assertIn("Lab", claude_description)
        self.assertNotIn("research-coding copilot", claude_description)
        self.assertNotIn("Research Dev Agent", claude_description)

    def test_research_dev_mvp_assets_exist(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Idea Feasibility Review", skill)
        self.assertIn("Research Grounding Injection", skill)
        self.assertIn("Experiment Evidence Recording", skill)
        self.assertIn("meridian.context", skill)
        self.assertIn("Lazy Init", skill)
        self.assertIn("Research Code Style", skill)
        self.assertIn("one readable main flow", skill)
        self.assertIn("single-use parser, loader", skill)
        self.assertIn("downstream coding acceptance criterion", skill)

        template = Path("src/meridian/templates/research-dev")
        self.assertTrue((template / "research-dev-context-packet.md").exists())
        self.assertTrue((template / "experiment-evidence-plan.md").exists())
        self.assertFalse((template / "development-handoff-packet.md").exists())
        self.assertTrue((template / "research-grounding-injection.md").exists())
        self.assertTrue((template / "idea-card.md").exists())
        injection_template = (template / "research-grounding-injection.md").read_text(encoding="utf-8")
        self.assertIn("## Implementation Prior", injection_template)
        self.assertIn("related papers", injection_template)
        self.assertIn("code/repo links", injection_template)
        self.assertIn("## Research Code Style", injection_template)
        self.assertIn("one readable main flow", injection_template)
        self.assertIn("Return Signal", injection_template)

        pyproject = Path("pyproject.toml").read_text(encoding="utf-8")
        self.assertIn('"templates/research-dev/**/*.md"', pyproject)

    def test_research_dev_idea_management_assets_parse(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Idea Placement", skill)
        self.assertIn("Never edit canonical wiki pages directly from Lab state", skill)
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

    def test_research_dev_state_model_assets_parse(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        for phrase in [
            "New Idea Placement / Thread Seed",
            "Approach Tree Exploration",
            "Experiment Evidence Recording",
            "Finding Proposal / Wiki Write-back",
            "Lazy Init",
            ".meridian/state.md",
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
            "wiki-transfer-packet.md",
        ]:
            self.assertTrue((template / name).exists(), name)
        self.assertFalse((template / "memory.md").exists())

        thread = (template / "thread.md").read_text(encoding="utf-8")
        self.assertNotIn("active_node", thread)
        self.assertIn("Approach Tree", thread)
        self.assertIn("unresolved", thread)

        proposal = (template / "proposal.md").read_text(encoding="utf-8")
        self.assertIn("strengthening", proposal)
        self.assertIn("Wiki Transfer Gate", proposal)
        self.assertIn("Transfer Notes", proposal)

        transfer = (template / "wiki-transfer-packet.md").read_text(encoding="utf-8")
        self.assertIn("Boundary Mapping", transfer)
        self.assertIn("Publish Gate", transfer)

    def test_research_dev_zero_candidate_idea_replay_contract(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("no existing thread candidates", skill)
        self.assertIn("ask to create a root thread seed", skill)

    def test_lab_research_prior_assets_parse(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        for phrase in [
            "Research Prior",
            "needed",
            "checked",
            "missing",
            "deferred",
            "not_needed",
            "LLM-as-Judge",
            "user confirmation",
            "Research Prior Gate",
            "Call `meridian.context`",
            "Default MCP grounding path",
        ]:
            self.assertIn(phrase, skill)

        template_root = Path("src/meridian/templates/research-dev")
        thread = (template_root / "thread.md").read_text(encoding="utf-8")
        experiment = (template_root / "experiment.md").read_text(encoding="utf-8")
        for text in (thread, experiment):
            self.assertIn("Research Prior", text)
            self.assertIn("needed | checked | missing | deferred | not_needed", text)
            self.assertIn("method | prompt | metric | eval | ablation | probe | failure | baseline", text)
            self.assertIn("mcp grounding", text)
            self.assertIn("user confirmation", text)

    def test_lab_official_benchmark_fidelity_gate_assets_parse(self) -> None:
        required_skill_phrases = [
            "Official Benchmark Fidelity",
            "official runner entrypoint",
            "official task source / split source",
            "official config defaults",
            "official metric function",
            "official aggregation granularity",
            "provider substitution",
            "history/context hook",
            "reporting-only",
            "official metric",
            "derived diagnostic",
            "Please review benchmark faithfulness, not general code quality.",
        ]
        for root in (CODEX_PLUGIN_SKILL_ROOT, CLAUDE_PLUGIN_SKILL_ROOT):
            lab = (root / "lab/SKILL.md").read_text(encoding="utf-8")
            for phrase in required_skill_phrases:
                self.assertIn(phrase, lab)

    def test_lab_lazy_init_creates_minimal_valid_research_space(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            written = initialize_lab_space(root)
            relative = {path.resolve().relative_to(root.resolve()) for path in written}
            self.assertTrue(
                {
                    Path(".meridian/experiments/index.md"),
                    Path(".meridian/proposals/index.md"),
                    Path(".meridian/state.md"),
                    Path(".meridian/threads/index.md"),
                }.issubset(relative),
            )
            self.assertIn(Path("AGENTS.md"), relative)
            self.assertFalse([path for path in (root / ".meridian/threads").glob("*.md") if path.name != "index.md"])
            self.assertFalse([path for path in (root / ".meridian/experiments").glob("*.md") if path.name != "index.md"])
            self.assertFalse([path for path in (root / ".meridian/proposals").glob("*.md") if path.name != "index.md"])
            report = validate_lab_space(root)
            self.assertEqual(report.status, "pass", report.to_dict())

    def test_meridian_agents_contract_block_is_idempotent_and_preserves_user_text(self) -> None:
        from meridian.lab import inject_meridian_agents_contract

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            agents.write_text("# Existing Rules\n\nKeep this line.\n", encoding="utf-8")

            first = inject_meridian_agents_contract(root)
            second = inject_meridian_agents_contract(root)

            self.assertEqual(first, agents.resolve())
            self.assertEqual(second, agents.resolve())
            text = agents.read_text(encoding="utf-8")
            self.assertIn("Keep this line.", text)
            self.assertEqual(text.count("MERIDIAN RESEARCH AGENT CONTRACT START"), 1)
            self.assertEqual(text.count("MERIDIAN RESEARCH AGENT CONTRACT END"), 1)
            self.assertIn("research-agent-principles.md", text)
            self.assertIn("Do not silently substitute", text)

    def test_meridian_agents_contract_routes_research_coding_through_lab(self) -> None:
        from meridian.lab import meridian_agents_contract_block

        block = meridian_agents_contract_block()

        self.assertIn("repo has `.meridian/`", block)
        self.assertIn("load the Meridian Lab skill", block)
        self.assertIn("Research Grounding Injection", block)
        self.assertIn("Pure mechanical engineering may skip Lab", block)

    def test_meridian_agents_contract_replacement_preserves_surrounding_text_exactly(self) -> None:
        from meridian.lab import (
            MERIDIAN_AGENTS_CONTRACT_END,
            MERIDIAN_AGENTS_CONTRACT_START,
            inject_meridian_agents_contract,
            meridian_agents_contract_block,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            prefix = "# Existing Rules\n\nKeep this line.  \n\n"
            old_block = "\n".join(
                [
                    MERIDIAN_AGENTS_CONTRACT_START,
                    "Old Meridian contract text.",
                    MERIDIAN_AGENTS_CONTRACT_END,
                ]
            )
            suffix = "\n\n    Indentation-sensitive text after the block.\n\tTabbed continuation.\n"
            agents.write_text(prefix + old_block + suffix, encoding="utf-8")

            inject_meridian_agents_contract(root)
            first_text = agents.read_text(encoding="utf-8")
            inject_meridian_agents_contract(root)
            second_text = agents.read_text(encoding="utf-8")

            block = meridian_agents_contract_block().rstrip()
            self.assertEqual(first_text, prefix + block + suffix)
            self.assertEqual(second_text, first_text)

    def test_meridian_agents_contract_validator_reports_stale_and_duplicate_blocks(self) -> None:
        from meridian.lab import (
            MERIDIAN_AGENTS_CONTRACT_END,
            MERIDIAN_AGENTS_CONTRACT_START,
            meridian_agents_contract_block,
            validate_meridian_agents_contract,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            agents.write_text(
                "\n".join(
                    [
                        MERIDIAN_AGENTS_CONTRACT_START,
                        "Old contract text.",
                        MERIDIAN_AGENTS_CONTRACT_END,
                    ]
                ),
                encoding="utf-8",
            )
            stale = validate_meridian_agents_contract(root)
            agents.write_text(
                meridian_agents_contract_block().rstrip()
                + "\n\n"
                + meridian_agents_contract_block().rstrip()
                + "\n",
                encoding="utf-8",
            )
            duplicate = validate_meridian_agents_contract(root)

        self.assertIn("agents_contract_stale", {finding.code for finding in stale.findings})
        self.assertIn("agents_contract_duplicate", {finding.code for finding in duplicate.findings})

    def test_meridian_agents_contract_orphan_start_preserves_text_across_repeated_injection(self) -> None:
        from meridian.lab import (
            MERIDIAN_AGENTS_CONTRACT_START,
            inject_meridian_agents_contract,
            meridian_agents_contract_block,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            original = (
                "# Existing Rules\n\n"
                f"{MERIDIAN_AGENTS_CONTRACT_START}\n"
                "This is user-authored text after an orphan marker.\n"
                "    Preserve this indentation.\n"
            )
            agents.write_text(original, encoding="utf-8")

            inject_meridian_agents_contract(root)
            first_text = agents.read_text(encoding="utf-8")
            inject_meridian_agents_contract(root)
            second_text = agents.read_text(encoding="utf-8")

            block = meridian_agents_contract_block().rstrip()
            expected = original + "\n" + block + "\n"
            self.assertEqual(first_text, expected)
            self.assertEqual(second_text, expected)
            self.assertEqual(first_text.count(block), 1)

    def test_meridian_agents_contract_stray_end_preserves_text_and_appends_valid_block(self) -> None:
        from meridian.lab import (
            MERIDIAN_AGENTS_CONTRACT_END,
            inject_meridian_agents_contract,
            meridian_agents_contract_block,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            original = (
                f"{MERIDIAN_AGENTS_CONTRACT_END}\n"
                "# Existing Rules\n\n"
                "Normal user text after a stray end marker.\n"
                "\tKeep the tabbed line.\n"
            )
            agents.write_text(original, encoding="utf-8")

            inject_meridian_agents_contract(root)
            first_text = agents.read_text(encoding="utf-8")
            inject_meridian_agents_contract(root)
            second_text = agents.read_text(encoding="utf-8")

            block = meridian_agents_contract_block().rstrip()
            expected = original + "\n" + block + "\n"
            self.assertEqual(first_text, expected)
            self.assertEqual(second_text, expected)
            self.assertEqual(first_text.count(block), 1)

    def test_initialize_lab_space_injects_agents_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            written = initialize_lab_space(root)
            relative = {
                str(path.resolve().relative_to(root.resolve())).replace("\\", "/")
                for path in written
            }
            self.assertIn("AGENTS.md", relative)
            text = (root / "AGENTS.md").read_text(encoding="utf-8")
            self.assertIn("MERIDIAN RESEARCH AGENT CONTRACT START", text)
            self.assertIn("~/.meridian/research-agent-principles.md", text)

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
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            (lab / "threads/cache-retention.md").write_text(
                "---\ntype: research-thread\n---\n"
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
            self.assertIn("invalid_node_mode", codes)
            self.assertIn("ready_proposal_without_experiments", codes)
            self.assertIn("ready_proposal_without_wiki_target", codes)
            self.assertIn("ready_proposal_without_transfer_gate", codes)

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

    def test_retrieval_excludes_unverified_papers_from_scientific_queries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            papers = wiki_root / "papers"
            papers.mkdir(parents=True)
            _write_test_paper(
                papers / "Verified-PINN.md",
                title="Verified PINN",
                aliases=["VerifiedPINN"],
                topics=["physics-informed neural networks", "partial differential equations"],
                methods=["PDE residual loss"],
                settings=["scientific ML"],
                body_sections={
                    "What To Remember": "PINNs fit neural networks with PDE residual losses and boundary conditions.",
                    "Mechanism": "Autodiff computes PDE residuals at collocation points.",
                    "Implementation Hooks": "Test residual shapes and boundary losses.",
                },
            )
            _write_test_paper(
                papers / "Unverified-PINN.md",
                title="Unverified PINN",
                aliases=["UnverifiedPINN"],
                topics=["physics-informed neural networks", "partial differential equations"],
                methods=["PDE residual loss"],
                settings=["scientific ML"],
                body_sections={
                    "What To Remember": "This historical page has not passed source-fidelity review.",
                    "Mechanism": "It should not be used as scientific evidence yet.",
                },
                validation_state=None,
                trust_state=None,
            )

            result = retrieve_papers(
                query="I need PDE residual losses and boundary condition implementation tests for scientific ML.",
                wiki_root=wiki_root,
                top_k=5,
                strategy="v1",
            )

            paths = [item["relative_path"] for item in result.results]
            self.assertIn("papers/Verified-PINN.md", paths)
            self.assertNotIn("papers/Unverified-PINN.md", paths)

            v0 = retrieve_papers(
                query="I need PDE residual losses and boundary condition implementation tests for scientific ML.",
                wiki_root=wiki_root,
                top_k=5,
                strategy="v0",
            )
            self.assertIn("papers/Verified-PINN.md", [item["relative_path"] for item in v0.results])
            self.assertNotIn("papers/Unverified-PINN.md", [item["relative_path"] for item in v0.results])

            verified_query = retrieve_papers(
                query="Find source verified pages for PDE residual loss implementation evidence.",
                wiki_root=wiki_root,
                top_k=5,
                strategy="v1",
            )
            self.assertNotIn("papers/Unverified-PINN.md", [item["relative_path"] for item in verified_query.results])

            cleanup = retrieve_papers(
                query="Find unverified source fidelity pages that need recheck or quarantine.",
                wiki_root=wiki_root,
                top_k=5,
                strategy="v1",
            )
            self.assertIn("papers/Unverified-PINN.md", [item["relative_path"] for item in cleanup.results])

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
            self.assertEqual(flow["status"], "blocked")
            self.assertEqual(flow["publish_decision"], "blocked")
            self.assertEqual(flow["block_reason"], "quality_gate_not_pass")
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
                {"understanding", "quality", "structural", "source_fidelity"},
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
            self.assertFalse((wiki_root / "papers/Fake-Research-Paper.md").exists())
            self.assertTrue(Path(flow["source_fidelity_packet"]).exists())

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


def _passing_source_fidelity_result() -> dict[str, object]:
    return {
        "schema_version": "paper_wiki_source_fidelity_result.v0",
        "agent": "source_fidelity",
        "decision": "pass",
        "weighted_score": 4.8,
        "statements": [
            {
                "statement_id": "stmt-1",
                "statement": "CodeQuant applies rotations to smooth activation outliers.",
                "role": "source_fact",
                "core": True,
                "verdict": "supported",
                "support": [
                    {
                        "page": 2,
                        "excerpt": "Stage 1 applies learnable rotations to smooth activation outliers.",
                    }
                ],
                "repair_bucket": "none",
            }
        ],
        "hard_failures": [],
        "recommended_repairs": [],
    }


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
    validation_state: str | None = "source_fidelity_pass",
    trust_state: str | None = "source_verified",
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
        *([] if validation_state is None else [f'validation_state: "{validation_state}"']),
        *([] if trust_state is None else [f'trust_state: "{trust_state}"']),
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
