from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

from meridian import __version__
from meridian.framework_check import run_framework_check, write_framework_json, write_framework_report
from meridian.wiki.commands import (
    calibrate_eval,
    catalog_wiki,
    add_insight_wiki,
    build_navigation_wiki,
    concept_audit_wiki,
    concept_layer_lint_wiki,
    converge_run,
    converge_eval,
    create_judge_packet,
    create_reader_check_packet,
    eval_cases,
    final_product_check_wiki,
    final_status_migrate_wiki,
    health_wiki,
    ingest_pdf_folder,
    ingest_pdf,
    init_wiki,
    init_wiki_workspace,
    knowledge_audit_wiki,
    knowledge_repair_lint_wiki,
    insight_lint_wiki,
    lint_wiki_command,
    publish_run,
    publish_method_consolidation_wiki,
    publish_synthesis_batch_wiki,
    publish_proposal_wiki,
    publish_insight_wiki,
    publish_knowledge_repair_wiki,
    publish_concept_layer_wiki,
    publish_refinement_wiki,
    quality_check_run,
    proposal_lint_wiki,
    propose_knowledge_repair_wiki,
    propose_concept_layer_wiki,
    propose_contradiction_review_wiki,
    propose_method_consolidation_wiki,
    propose_refine_wiki,
    propose_synthesis_batch_wiki,
    propose_writeback_wiki,
    record_judge,
    record_review,
    refinement_lint_wiki,
    rebuild_index_wiki,
    retrieval_eval_summary,
    retrieval_audit_wiki,
    retrieval_eval_wiki,
    retrieval_optimization_eval_wiki,
    retrieve_wiki,
    run_flow,
    self_check_aggregate,
    self_check_eval,
    self_check_run,
    source_audit_wiki,
    structural_check_run,
    summarize_eval,
    system_evaluate_wiki,
    system_optimize_compare_wiki,
    system_optimize_eval_wiki,
)
from meridian.wiki.git_auto_commit import GitAutoCommitResult, auto_commit_paths, git_dirty_paths
from meridian.wiki.health_server import serve_health_ui
from meridian.wiki.vault import slugify
from meridian.wiki.workspace import default_user_config_path, resolve_workspace, workspace_for_cli


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="meridian")
    subparsers = parser.add_subparsers(dest="product", required=True)

    framework_check = subparsers.add_parser(
        "framework-check",
        help="Run a deterministic Meridian framework health check.",
    )
    framework_check.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help="Meridian development repo root. Defaults to the current directory.",
    )
    framework_check.add_argument("--library-root", type=Path, default=None, help="Optional Paper Wiki library root.")
    framework_check.add_argument("--wiki-root", type=Path, default=None, help="Optional Paper Wiki canonical vault root.")
    framework_check.add_argument(
        "--lab-root",
        type=Path,
        default=None,
        help="Optional target research repo or .meridian directory for Lab readiness checks.",
    )
    framework_check.add_argument(
        "--require-workspace",
        action="store_true",
        help="Treat a missing Paper Wiki workspace as a failing framework check.",
    )
    framework_check.add_argument("--json-out", type=Path, default=None, help="Optional machine-readable report path.")
    framework_check.add_argument("--report", type=Path, default=None, help="Optional Markdown report path.")

    wiki = subparsers.add_parser("wiki", help="Paper Wiki workflows")
    wiki_subparsers = wiki.add_subparsers(dest="command", required=True)

    ingest = wiki_subparsers.add_parser(
        "ingest",
        help="Extract a single PDF paper into a draft review packet.",
    )
    ingest.add_argument("pdf", type=Path, help="Path to the source paper PDF.")
    ingest.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Draft output directory, e.g. wiki/.drafts/ingests/<paper-slug>/. Defaults to the active workspace.",
    )
    ingest.add_argument(
        "--title",
        default=None,
        help="Optional human-readable paper title override.",
    )
    ingest.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting an existing draft output directory.",
    )
    ingest.add_argument(
        "--wiki-root",
        type=Path,
        default=None,
        help="Optional wiki root used to place draft artifacts in the active Paper Wiki workspace.",
    )
    ingest.add_argument(
        "--library-root",
        type=Path,
        default=None,
        help="Optional Paper Wiki library root. Defaults to the active user workspace.",
    )
    ingest.add_argument(
        "--source-root",
        type=Path,
        default=None,
        help="Optional managed source root. Defaults to the workspace source root.",
    )
    ingest.add_argument(
        "--publish-mode",
        choices=["never"],
        default="never",
        help=(
            "Draft-only publish policy. Direct ingest only writes draft/source extraction artifacts; "
            "use 'wiki flow' with a source-fidelity result for canonical publication."
        ),
    )
    ingest.add_argument(
        "--no-page-images",
        action="store_true",
        help="Skip rendering page PNGs for large batch runs while keeping page-level text extraction.",
    )
    ingest.add_argument(
        "--verbose-artifacts",
        action="store_true",
        help="Print internal/debug artifact paths in addition to product-facing output.",
    )
    ingest.add_argument(
        "--no-auto-commit",
        action="store_true",
        help="Do not create the scoped git commit after a successful ingest.",
    )

    ingest_folder = wiki_subparsers.add_parser(
        "ingest-folder",
        help="Recursively ingest every PDF under a folder such as a Zotero export My Library.",
    )
    ingest_folder.add_argument("folder", type=Path, help="Folder containing exported PDFs, e.g. Zotero My Library.")
    ingest_folder.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Batch output directory. Defaults to <wiki-root>/.drafts/ingests/batches/<folder-slug>/.",
    )
    ingest_folder.add_argument("--wiki-root", type=Path, default=None, help="Wiki root used to place draft batch artifacts.")
    ingest_folder.add_argument(
        "--library-root",
        type=Path,
        default=None,
        help="Optional Paper Wiki library root. Defaults to the active user workspace.",
    )
    ingest_folder.add_argument(
        "--source-root",
        type=Path,
        default=None,
        help="Optional managed source root. Defaults to the workspace source root.",
    )
    ingest_folder.add_argument(
        "--publish-mode",
        choices=["never"],
        default="never",
        help=(
            "Draft-only publish policy for each discovered PDF. Use 'wiki flow' with a "
            "source-fidelity result for canonical publication."
        ),
    )
    ingest_folder.add_argument("--overwrite", action="store_true", help="Overwrite existing per-paper run directories.")
    ingest_folder.add_argument("--limit", type=int, default=None, help="Optional maximum number of PDFs to ingest.")
    ingest_folder.add_argument(
        "--render-page-images",
        action="store_true",
        help="Render page PNGs. By default folder ingest skips page images for scale.",
    )
    ingest_folder.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop after the first per-PDF failure instead of continuing the batch.",
    )
    ingest_folder.add_argument(
        "--verbose-artifacts",
        action="store_true",
        help="Print per-paper run manifest paths in addition to the batch product summary.",
    )
    ingest_folder.add_argument(
        "--no-auto-commit",
        action="store_true",
        help="Do not create the scoped git commit after a successful folder ingest.",
    )

    init = wiki_subparsers.add_parser(
        "init",
        help="Initialize an Obsidian-compatible Paper Wiki vault.",
    )
    init.add_argument("--wiki-root", type=Path, default=None, help="Canonical wiki root.")
    init.add_argument(
        "--library-root",
        type=Path,
        default=None,
        help="Initialize a user-level Paper Wiki library root containing sources/ and wiki/.",
    )
    init.add_argument(
        "--source-root",
        type=Path,
        default=None,
        help="Managed source root for --library-root. Defaults to <library-root>/sources.",
    )
    init.add_argument(
        "--no-set-default",
        action="store_true",
        help="Do not make this workspace the active user-level Paper Wiki workspace.",
    )
    init.add_argument(
        "--overwrite-workspace-config",
        action="store_true",
        help="Rewrite meridian-wiki.json when the workspace paths are intentionally changing.",
    )
    init.add_argument(
        "--overwrite-templates",
        action="store_true",
        help="Rewrite wiki/templates/*.md with the current Meridian templates.",
    )

    flow = wiki_subparsers.add_parser(
        "flow",
        help="Run the canonical Paper Wiki ingest flow through judge packet preparation.",
    )
    flow.add_argument("pdf", type=Path, help="Path to the source paper PDF.")
    flow.add_argument("--out", type=Path, default=None, help="Flow output directory. Defaults to the active workspace.")
    flow.add_argument("--wiki-root", type=Path, default=None, help="Canonical wiki root.")
    flow.add_argument(
        "--library-root",
        type=Path,
        default=None,
        help="Optional Paper Wiki library root. Defaults to the active user workspace.",
    )
    flow.add_argument(
        "--source-root",
        type=Path,
        default=None,
        help="Optional managed source root. Defaults to the workspace source root.",
    )
    flow.add_argument("--rubric", type=Path, required=True, help="LLM-as-Judge rubric markdown.")
    flow.add_argument("--title", default=None, help="Optional paper title override.")
    flow.add_argument("--overwrite", action="store_true", help="Overwrite existing flow output.")
    flow.add_argument(
        "--publish-mode",
        choices=["auto", "always"],
        default="auto",
        help=(
            "Canonical draft publish policy for the flow. 'auto' publishes only after "
            "deterministic checks and source-fidelity pass; 'always' is a manual override "
            "and requires an explicit passing source-fidelity result."
        ),
    )
    flow.add_argument("--case", type=Path, default=None, help="Optional evaluation case file.")
    flow.add_argument(
        "--judge-result",
        type=Path,
        default=None,
        help="Optional LLM-as-Judge JSON result to record and converge immediately.",
    )
    flow.add_argument(
        "--source-fidelity-result",
        type=Path,
        default=None,
        help="Optional source-fidelity JSON result required before canonical publication.",
    )
    flow.add_argument(
        "--no-page-images",
        action="store_true",
        help="Skip rendering page PNGs for large batch runs while keeping page-level text extraction.",
    )
    flow.add_argument(
        "--verbose-artifacts",
        action="store_true",
        help="Print internal/debug/validation artifact paths in addition to product-facing output.",
    )
    flow.add_argument(
        "--no-auto-commit",
        action="store_true",
        help="Do not create the scoped git commit after a successful flow run.",
    )

    eval_cmd = wiki_subparsers.add_parser(
        "eval",
        help="Run ingest or full flow over JSONL evaluation cases.",
    )
    eval_cmd.add_argument("cases", type=Path, help="JSONL evaluation case file.")
    eval_cmd.add_argument(
        "--out-dir",
        type=Path,
        required=True,
        help="Directory where per-case draft outputs and eval manifest are written.",
    )
    eval_cmd.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting existing per-case output directories.",
    )
    eval_cmd.add_argument(
        "--publish-mode",
        choices=["never"],
        default="never",
        help="Draft-only publish policy for eval ingest cases. Use --mode flow for gated canonical publication.",
    )
    eval_cmd.add_argument(
        "--mode",
        choices=["ingest", "flow"],
        default="ingest",
        help=(
            "Evaluation execution mode. 'ingest' writes per-case draft artifacts; "
            "'flow' creates judge/source-fidelity packets and only publishes through the strict gate."
        ),
    )
    eval_cmd.add_argument(
        "--rubric",
        type=Path,
        default=None,
        help="LLM-as-Judge rubric markdown. Required when --mode flow.",
    )
    eval_cmd.add_argument(
        "--wiki-root",
        type=Path,
        default=None,
        help="Shared wiki root for --mode flow. Defaults to <out-dir>/wiki.",
    )
    eval_cmd.add_argument(
        "--no-page-images",
        action="store_true",
        help="Skip rendering page PNGs for large batch runs while keeping page-level text extraction.",
    )

    eval_converge = wiki_subparsers.add_parser(
        "eval-converge",
        help="Record per-case judge results for an eval run and converge each case.",
    )
    eval_converge.add_argument("manifest", type=Path, help="Path to eval_manifest.json.")
    eval_converge.add_argument(
        "--judge-dir",
        type=Path,
        default=None,
        help=(
            "Optional directory containing judge JSON files. Defaults also check each "
            "case directory for judge-result.json."
        ),
    )

    eval_calibrate = wiki_subparsers.add_parser(
        "eval-calibrate",
        help="Append a human calibration record for a judged eval case.",
    )
    eval_calibrate.add_argument("manifest", type=Path, help="Path to eval_manifest.json.")
    eval_calibrate.add_argument("--case-id", required=True, help="Evaluation case id.")
    eval_calibrate.add_argument(
        "--human-decision",
        choices=["agree", "too_harsh", "too_lenient", "missed_key_issue"],
        required=True,
        help="Human calibration judgment about the LLM judge result.",
    )
    eval_calibrate.add_argument(
        "--bucket",
        choices=[
            "workflow",
            "schema",
            "extraction",
            "multimodal_understanding",
            "paper_model",
            "retrieval",
            "judge_rubric",
            "human_gate",
            "other",
        ],
        required=True,
        help="Primary refinement bucket from human calibration.",
    )
    eval_calibrate.add_argument("--notes", default="", help="Short calibration note.")
    eval_calibrate.add_argument(
        "--require-human-review-next-time",
        choices=["true", "false"],
        default=None,
        help="Whether this kind of case should require human review next time.",
    )

    eval_summary = wiki_subparsers.add_parser(
        "eval-summary",
        help="Write aggregate metrics for an eval manifest.",
    )
    eval_summary.add_argument("manifest", type=Path, help="Path to eval_manifest.json.")
    eval_summary.add_argument("--out", type=Path, default=None, help="Optional summary JSON path.")

    publish = wiki_subparsers.add_parser(
        "publish-run",
        help="Publish an existing ingest run into the canonical wiki and promote candidate records.",
    )
    publish.add_argument("run_manifest", type=Path, help="Path to run.json.")
    publish.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    publish.add_argument(
        "--source-fidelity-result",
        type=Path,
        default=None,
        help="Source-fidelity JSON result required before canonical publication.",
    )
    publish.add_argument("--overwrite", action="store_true", help="Allow overwriting the canonical paper page.")
    publish.add_argument(
        "--no-promote-candidates",
        action="store_true",
        help="Only publish the paper page; do not create claim/method/evidence/topic pages.",
    )

    source_audit = wiki_subparsers.add_parser(
        "source-audit",
        help="Audit managed source files and write an Obsidian-readable source index.",
    )
    source_audit.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    source_audit.add_argument("--out", type=Path, default=None, help="Optional audit JSON path.")

    rebuild_index = wiki_subparsers.add_parser(
        "rebuild-index",
        help="Rebuild wiki/index.md and the paper catalog from canonical pages.",
    )
    rebuild_index.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")

    lint = wiki_subparsers.add_parser(
        "lint",
        help="Run a lightweight health check over the canonical wiki layer.",
    )
    lint.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    lint.add_argument("--out", type=Path, default=None, help="Optional lint JSON report path.")

    knowledge_audit = wiki_subparsers.add_parser(
        "knowledge-audit",
        help="Audit the compiled method/topic/claim/evidence/synthesis knowledge layer.",
    )
    knowledge_audit.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    knowledge_audit.add_argument("--out", type=Path, default=None, help="Optional audit JSON report path.")
    knowledge_audit.add_argument(
        "--brief",
        type=Path,
        default=None,
        help="Optional markdown brief path. Defaults to docs/knowledge-layer-quality-audit.md.",
    )

    propose_knowledge_repair = wiki_subparsers.add_parser(
        "propose-knowledge-repair",
        help="Create a low-risk knowledge-layer repair proposal from the latest audit.",
    )
    propose_knowledge_repair.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    propose_knowledge_repair.add_argument("--out", type=Path, default=None, help="Output repair directory.")
    propose_knowledge_repair.add_argument("--audit", type=Path, default=None, help="Optional existing knowledge audit JSON.")
    propose_knowledge_repair.add_argument("--overwrite", action="store_true", help="Overwrite an existing repair directory.")

    knowledge_repair_lint = wiki_subparsers.add_parser(
        "knowledge-repair-lint",
        help="Validate a knowledge repair proposal before publishing low-risk changes.",
    )
    knowledge_repair_lint.add_argument("repair_manifest", type=Path, help="Path to repair.json.")
    knowledge_repair_lint.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    knowledge_repair_lint.add_argument("--out", type=Path, default=None, help="Optional lint JSON report path.")

    publish_knowledge_repair = wiki_subparsers.add_parser(
        "publish-knowledge-repair",
        help="Publish lint-passing low-risk knowledge repairs into the canonical wiki.",
    )
    publish_knowledge_repair.add_argument("repair_manifest", type=Path, help="Path to repair.json.")
    publish_knowledge_repair.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")

    concept_audit = wiki_subparsers.add_parser(
        "concept-audit",
        help="Audit preliminary-knowledge concept pages and prerequisite links.",
    )
    concept_audit.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    concept_audit.add_argument("--out", type=Path, default=None, help="Optional concept audit JSON report path.")
    concept_audit.add_argument(
        "--brief",
        type=Path,
        default=None,
        help="Optional markdown brief path. Defaults to docs/concept-layer-quality-audit.md.",
    )

    concept_proposal = wiki_subparsers.add_parser(
        "propose-concept-layer",
        help="Create proposal-first canonical concept pages from recurring preliminary knowledge.",
    )
    concept_proposal.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    concept_proposal.add_argument("--out-dir", type=Path, default=None, help="Optional concept proposal directory.")
    concept_proposal.add_argument("--max-concepts", type=int, default=24, help="Maximum new concept pages to propose.")
    concept_proposal.add_argument("--overwrite", action="store_true", help="Overwrite an existing concept proposal directory.")

    concept_lint = wiki_subparsers.add_parser(
        "concept-layer-lint",
        help="Validate a concept-layer proposal before publishing low-risk pages/backlinks.",
    )
    concept_lint.add_argument("proposal_manifest", type=Path, help="Path to concept-layer-proposal.json.")
    concept_lint.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    concept_lint.add_argument("--out", type=Path, default=None, help="Optional lint JSON report path.")

    concept_publish = wiki_subparsers.add_parser(
        "publish-concept-layer",
        help="Publish lint-passing low-risk concept pages and prerequisite links.",
    )
    concept_publish.add_argument("proposal_manifest", type=Path, help="Path to concept-layer-proposal.json.")
    concept_publish.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")

    final_status = wiki_subparsers.add_parser(
        "final-status-migrate",
        help="Add final-product quality-state semantics to canonical paper pages.",
    )
    final_status.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    final_status.add_argument("--out", type=Path, default=None, help="Optional migration manifest path.")

    synthesis_batch = wiki_subparsers.add_parser(
        "propose-synthesis-batch",
        help="Seed proposal-first synthesis pages from compiled method/topic clusters.",
    )
    synthesis_batch.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    synthesis_batch.add_argument("--out-dir", type=Path, default=None, help="Optional synthesis batch directory.")
    synthesis_batch.add_argument("--max-items", type=int, default=6, help="Maximum synthesis proposals to create.")
    synthesis_batch.add_argument("--overwrite", action="store_true", help="Overwrite an existing synthesis batch directory.")

    publish_syntheses = wiki_subparsers.add_parser(
        "publish-synthesis-batch",
        help="Lint and publish low-risk synthesis proposals from a synthesis growth batch.",
    )
    publish_syntheses.add_argument("batch_manifest", type=Path, help="Path to batch.json.")
    publish_syntheses.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    publish_syntheses.add_argument("--limit", type=int, default=None, help="Optional maximum proposals to publish.")
    publish_syntheses.add_argument("--overwrite", action="store_true", help="Overwrite existing synthesis pages.")

    method_consolidation = wiki_subparsers.add_parser(
        "propose-method-consolidation",
        help="Group paper-specific method candidate records under compiled method-family pages.",
    )
    method_consolidation.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    method_consolidation.add_argument("--out-dir", type=Path, default=None, help="Optional consolidation proposal directory.")
    method_consolidation.add_argument("--overwrite", action="store_true", help="Overwrite an existing consolidation proposal.")

    publish_method_consolidation = wiki_subparsers.add_parser(
        "publish-method-consolidation",
        help="Publish low-risk method consolidation frontmatter updates.",
    )
    publish_method_consolidation.add_argument("consolidation_manifest", type=Path, help="Path to method-consolidation.json.")
    publish_method_consolidation.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")

    contradiction_review = wiki_subparsers.add_parser(
        "propose-contradiction-review",
        help="Generate conservative contradiction/stale/source-quality review candidates.",
    )
    contradiction_review.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    contradiction_review.add_argument("--out-dir", type=Path, default=None, help="Optional review proposal directory.")
    contradiction_review.add_argument("--overwrite", action="store_true", help="Overwrite an existing review proposal.")

    navigation = wiki_subparsers.add_parser(
        "build-navigation",
        help="Build Obsidian-friendly Map of Content and knowledge-layer navigation pages.",
    )
    navigation.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    navigation.add_argument("--out", type=Path, default=None, help="Optional navigation manifest path.")

    final_check = wiki_subparsers.add_parser(
        "final-product-check",
        help="Run deterministic final LLM Wiki product readiness checks.",
    )
    final_check.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    final_check.add_argument("--out", type=Path, default=None, help="Optional final check JSON path.")
    final_check.add_argument("--brief", type=Path, default=None, help="Optional markdown quality brief path.")

    health = wiki_subparsers.add_parser(
        "health",
        help="Run deterministic Paper Wiki health scoring and write JSON/Markdown/HTML reports.",
    )
    health.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    health.add_argument("--profile", choices=["daily", "release", "strict"], default="daily", help="Scoring profile label.")
    health.add_argument("--out", type=Path, default=None, help="Optional health JSON path.")
    health.add_argument("--report", type=Path, default=None, help="Optional markdown report path.")
    health.add_argument("--html", type=Path, default=None, help="Optional HTML dashboard path.")
    health.add_argument("--repair-plan", action="store_true", help="Also write a standalone repair plan under .drafts/health/.")
    health.add_argument("--repair-plan-out", type=Path, default=None, help="Optional repair plan path.")

    health_ui = wiki_subparsers.add_parser(
        "health-ui",
        help="Serve the local button bridge for wiki health HTML reports.",
    )
    health_ui.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    health_ui.add_argument("--host", default="127.0.0.1", help="Bind host. Defaults to localhost.")
    health_ui.add_argument("--port", type=int, default=8765, help="Bind port. Defaults to 8765.")
    health_ui.add_argument("--profile", choices=["daily", "release", "strict"], default="daily", help="Scoring profile label.")
    health_ui.add_argument("--no-repair-plan", action="store_true", help="Do not write a repair plan when the button runs health.")

    review = wiki_subparsers.add_parser(
        "review",
        help="Record a human-led review decision for a draft review packet.",
    )
    review.add_argument("review_packet", type=Path, help="Path to review.md.")
    review.add_argument(
        "--decision",
        choices=["pass", "fail", "needs_refine"],
        required=True,
        help="Human review decision.",
    )
    review.add_argument(
        "--bucket",
        choices=[
            "workflow",
            "schema",
            "extraction",
            "multimodal_understanding",
            "packet_format",
            "retrieval",
            "other",
        ],
        default="other",
        help="Primary failure/refinement bucket.",
    )
    review.add_argument(
        "--notes",
        default="",
        help="Short human review note.",
    )

    judge_pack = wiki_subparsers.add_parser(
        "judge-pack",
        help="Build a bounded packet for LLM-as-Judge evaluation.",
    )
    judge_pack.add_argument("run_manifest", type=Path, help="Path to run.json.")
    judge_pack.add_argument(
        "--rubric",
        type=Path,
        required=True,
        help="Path to the LLM-as-Judge rubric markdown.",
    )
    judge_pack.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output markdown packet for the judge.",
    )
    judge_pack.add_argument(
        "--case",
        type=Path,
        default=None,
        help="Optional evaluation case JSON/JSONL snippet to include.",
    )

    judge_record = wiki_subparsers.add_parser(
        "judge-record",
        help="Record an LLM-as-Judge JSON result against a run manifest.",
    )
    judge_record.add_argument("run_manifest", type=Path, help="Path to run.json.")
    judge_record.add_argument("judge_result", type=Path, help="Path to judge result JSON.")
    judge_record.add_argument("--out", type=Path, default=None, help="Optional stored result path.")

    reader_check = wiki_subparsers.add_parser(
        "reader-check",
        help="Build a two-reader self-check packet for paper.md understanding quality.",
    )
    reader_check.add_argument("run_manifest", type=Path, help="Path to run.json.")
    reader_check.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output markdown packet for paper.md-only vs source-grounded reader comparison.",
    )

    quality_check = wiki_subparsers.add_parser(
        "quality-check",
        help="Run the scored quality self-check agent against an ingest run.",
    )
    quality_check.add_argument("run_manifest", type=Path, help="Path to run.json.")
    quality_check.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional output JSON path. Defaults to quality-self-check.json beside run.json.",
    )

    structural_check = wiki_subparsers.add_parser(
        "structural-check",
        help="Run the scored structural self-check agent against an ingest run.",
    )
    structural_check.add_argument("run_manifest", type=Path, help="Path to run.json.")
    structural_check.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional output JSON path. Defaults to structural-self-check.json beside run.json.",
    )

    self_check = wiki_subparsers.add_parser(
        "self-check-run",
        help="Run or prepare the full three-agent paper ingest self-check flow.",
    )
    self_check.add_argument("run_manifest", type=Path, help="Path to run.json.")
    self_check.add_argument(
        "--backend",
        choices=["agent-executed", "fake", "api", "vllm"],
        default="agent-executed",
        help=(
            "Judge execution backend. agent-executed prepares packets for Codex/Claude; "
            "fake is deterministic for tests; api/vllm are reserved backend contracts."
        ),
    )
    self_check.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory. Defaults to <run-dir>/self-check/.",
    )
    self_check.add_argument("--overwrite", action="store_true", help="Overwrite existing self-check output.")

    self_check_aggregate_cmd = wiki_subparsers.add_parser(
        "self-check-aggregate",
        help="Validate and aggregate three-agent self-check result JSON.",
    )
    self_check_aggregate_cmd.add_argument("manifest", type=Path, help="Path to self-check-manifest.json.")
    self_check_aggregate_cmd.add_argument("--out", type=Path, default=None, help="Optional summary JSON path.")

    self_check_eval_cmd = wiki_subparsers.add_parser(
        "self-check-eval",
        help="Run or prepare three-agent self-checks for every case in an eval manifest.",
    )
    self_check_eval_cmd.add_argument("manifest", type=Path, help="Path to eval_manifest.json.")
    self_check_eval_cmd.add_argument(
        "--backend",
        choices=["agent-executed", "fake", "api", "vllm"],
        default="agent-executed",
        help="Judge execution backend. Matches self-check-run.",
    )
    self_check_eval_cmd.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory. Defaults to <eval-manifest-dir>/self-check/.",
    )
    self_check_eval_cmd.add_argument("--overwrite", action="store_true", help="Overwrite existing per-case self-check output.")

    converge = wiki_subparsers.add_parser(
        "converge",
        help="Converge a wiki ingest run from quality gate and recorded judge result.",
    )
    converge.add_argument("run_manifest", type=Path, help="Path to run.json.")
    converge.add_argument("--out", type=Path, default=None, help="Optional convergence record path.")

    catalog = wiki_subparsers.add_parser(
        "catalog",
        help="Build machine-readable paper, synthesis, and knowledge-layer catalogs for canonical wiki pages.",
    )
    catalog.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    catalog.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output paper JSONL catalog path. Defaults to <wiki-root>/.index/papers.jsonl.",
    )

    status = wiki_subparsers.add_parser(
        "status",
        help="Show the active Paper Wiki workspace and core execution status.",
    )
    status.add_argument("--wiki-root", type=Path, default=None, help="Optional canonical wiki root.")
    status.add_argument("--library-root", type=Path, default=None, help="Optional Paper Wiki library root.")
    status.add_argument("--json-out", type=Path, default=None, help="Optional machine-readable status path.")

    retrieve = wiki_subparsers.add_parser(
        "retrieve",
        help="Retrieve paper and synthesis wiki context for a research query.",
    )
    retrieve.add_argument("query", help="Standalone research question or retrieval intent.")
    retrieve.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    retrieve.add_argument(
        "--catalog",
        type=Path,
        default=None,
        help="Optional catalog path. Defaults to paper plus synthesis catalogs under <wiki-root>/.index/.",
    )
    retrieve.add_argument("--top-k", type=int, default=5, help="Maximum wiki pages to return.")
    retrieve.add_argument(
        "--strategy",
        choices=["v0", "v1"],
        default="v1",
        help="Retrieval strategy. v0 is the legacy lexical/frontmatter scorer; v1 is the optimized deterministic hybrid scorer.",
    )
    retrieve.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional Markdown context packet path.",
    )
    retrieve.add_argument(
        "--json-out",
        type=Path,
        default=None,
        help="Optional machine-readable retrieval result JSON path.",
    )

    context = wiki_subparsers.add_parser(
        "context",
        help="Create a stable Use Wiki context packet in /private/tmp by default.",
    )
    context.add_argument("query", help="Standalone research or coding intent.")
    context.add_argument("--wiki-root", type=Path, default=None, help="Optional canonical wiki root.")
    context.add_argument("--library-root", type=Path, default=None, help="Optional Paper Wiki library root.")
    context.add_argument("--top-k", type=int, default=6, help="Maximum wiki pages to return.")
    context.add_argument(
        "--strategy",
        choices=["v0", "v1"],
        default="v1",
        help="Retrieval strategy.",
    )
    context.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory. Defaults to /private/tmp/meridian-context/<query-slug>/.",
    )

    add_insight = wiki_subparsers.add_parser(
        "add-insight",
        help="Create a draft user insight for a matched canonical paper page.",
    )
    add_insight.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    add_insight.add_argument("--paper", required=True, help="Paper path, title, alias, source id, or natural-language query.")
    add_insight.add_argument("--note", default="", help="Natural-language user insight or reading note.")
    add_insight.add_argument("--note-file", type=Path, default=None, help="Markdown/text file containing the user insight.")
    add_insight.add_argument(
        "--insight-type",
        choices=[
            "paper-note",
            "paper-correction",
            "research-insight",
            "retrieval-hint",
            "cross-paper-connection",
            "implementation-note",
            "limitation-note",
            "future-question",
        ],
        default="paper-note",
        help="Type of user insight.",
    )
    add_insight.add_argument("--out-dir", type=Path, default=None, help="Optional insight draft output directory.")
    add_insight.add_argument("--overwrite", action="store_true", help="Overwrite an existing insight draft directory.")

    insight_lint = wiki_subparsers.add_parser(
        "insight-lint",
        help="Validate a user insight draft before canonical publish.",
    )
    insight_lint.add_argument("insight_manifest", type=Path, help="Path to insight.json.")
    insight_lint.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    insight_lint.add_argument("--out", type=Path, default=None, help="Optional lint JSON report path.")

    publish_insight = wiki_subparsers.add_parser(
        "publish-insight",
        help="Publish a lint-passing user insight into the target canonical paper page.",
    )
    publish_insight.add_argument("insight_manifest", type=Path, help="Path to insight.json.")
    publish_insight.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")

    propose_refine = wiki_subparsers.add_parser(
        "propose-refine",
        help="Create a draft refinement proposal for an existing canonical wiki page.",
    )
    propose_refine.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    propose_refine.add_argument("--target", required=True, help="Canonical page path, title, alias, or natural-language query.")
    propose_refine.add_argument("--reason", required=True, help="Why this page needs refinement.")
    propose_refine.add_argument("--note", default="", help="Natural-language refinement note.")
    propose_refine.add_argument("--note-file", type=Path, default=None, help="Markdown/text file containing the refinement note.")
    propose_refine.add_argument(
        "--change-class",
        choices=[
            "source_fact_correction",
            "wiki_synthesis_update",
            "user_insight_integration",
            "retrieval_metadata_update",
            "structure_cleanup",
            "stale_claim_update",
            "crosslink_update",
            "decision_update",
        ],
        default="wiki_synthesis_update",
        help="Type of page evolution being proposed.",
    )
    propose_refine.add_argument("--from-insight", default=None, help="Optional user insight id that motivates this refinement.")
    propose_refine.add_argument("--out-dir", type=Path, default=None, help="Optional refinement draft output directory.")
    propose_refine.add_argument("--overwrite", action="store_true", help="Overwrite an existing refinement draft directory.")

    refinement_lint = wiki_subparsers.add_parser(
        "refinement-lint",
        help="Validate a refinement proposal before canonical publish.",
    )
    refinement_lint.add_argument("refinement_manifest", type=Path, help="Path to refinement.json.")
    refinement_lint.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    refinement_lint.add_argument("--out", type=Path, default=None, help="Optional lint JSON report path.")

    publish_refinement = wiki_subparsers.add_parser(
        "publish-refinement",
        help="Publish a lint-passing refinement as a new canonical page revision.",
    )
    publish_refinement.add_argument("refinement_manifest", type=Path, help="Path to refinement.json.")
    publish_refinement.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")

    retrieval_eval = wiki_subparsers.add_parser(
        "retrieval-eval",
        help="Run scenario-based retrieval evaluation over a canonical Paper Wiki.",
    )
    retrieval_eval.add_argument("cases", type=Path, help="JSONL retrieval evaluation case file.")
    retrieval_eval.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    retrieval_eval.add_argument(
        "--out-dir",
        type=Path,
        required=True,
        help="Directory where context packets, judge packets, and retrieval manifest are written.",
    )
    retrieval_eval.add_argument(
        "--rubric",
        type=Path,
        default=None,
        help="Optional retrieval LLM-as-Judge rubric markdown.",
    )
    retrieval_eval.add_argument(
        "--catalog",
        type=Path,
        default=None,
        help="Optional catalog path. Defaults to <wiki-root>/.index/papers.jsonl.",
    )
    retrieval_eval.add_argument("--top-k", type=int, default=5, help="Maximum paper pages per case.")
    retrieval_eval.add_argument(
        "--strategy",
        choices=["v0", "v1"],
        default="v1",
        help="Retrieval strategy to evaluate.",
    )
    retrieval_eval.add_argument("--overwrite", action="store_true", help="Overwrite an existing eval output directory.")

    retrieval_optimization_eval = wiki_subparsers.add_parser(
        "retrieval-optimize-eval",
        help="Run side-by-side retrieval optimization evaluation over a canonical Paper Wiki.",
    )
    retrieval_optimization_eval.add_argument("cases", type=Path, help="JSONL retrieval optimization case file.")
    retrieval_optimization_eval.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    retrieval_optimization_eval.add_argument(
        "--out-dir",
        type=Path,
        required=True,
        help="Directory where side-by-side contexts, judge packets, and summary are written.",
    )
    retrieval_optimization_eval.add_argument("--rubric", type=Path, default=None, help="Optional judge rubric markdown.")
    retrieval_optimization_eval.add_argument(
        "--catalog",
        type=Path,
        default=None,
        help="Optional catalog path. Defaults to <wiki-root>/.index/papers.jsonl.",
    )
    retrieval_optimization_eval.add_argument("--top-k", type=int, default=8, help="Maximum paper pages per case.")
    retrieval_optimization_eval.add_argument("--baseline-strategy", choices=["v0", "v1"], default="v0")
    retrieval_optimization_eval.add_argument("--candidate-strategy", choices=["v0", "v1"], default="v1")
    retrieval_optimization_eval.add_argument("--overwrite", action="store_true", help="Overwrite an existing eval output directory.")

    system_evaluate = wiki_subparsers.add_parser(
        "system-evaluate",
        help="Evaluate a real Paper Wiki use case with a system-level rubric.",
    )
    system_evaluate.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    system_evaluate.add_argument("--case", type=Path, required=True, help="Single JSON case file or JSONL case file.")
    system_evaluate.add_argument("--context", type=Path, required=True, help="Retrieval context JSON path.")
    system_evaluate.add_argument("--out", type=Path, required=True, help="Output directory for evaluation artifacts.")
    system_evaluate.add_argument("--rubric", type=Path, default=None, help="Optional system evaluation rubric markdown.")
    system_evaluate.add_argument(
        "--selected-page",
        action="append",
        default=[],
        help="Optional canonical page path to include as selected read context. Can be repeated.",
    )
    system_evaluate.add_argument("--proposal", type=Path, default=None, help="Optional proposal or synthesis output to evaluate.")
    system_evaluate.add_argument(
        "--audit",
        type=Path,
        action="append",
        default=[],
        help="Optional audit summary path to include. Can be repeated.",
    )
    system_evaluate.add_argument("--overwrite", action="store_true", help="Overwrite an existing system evaluation output directory.")

    system_optimize_eval = wiki_subparsers.add_parser(
        "system-optimize-eval",
        help="Run batch System Evaluation Agent cases and aggregate optimization repair buckets.",
    )
    system_optimize_eval.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    system_optimize_eval.add_argument("--cases", type=Path, required=True, help="JSONL system optimization case file.")
    system_optimize_eval.add_argument("--out-dir", type=Path, required=True, help="Output directory for per-case and aggregate artifacts.")
    system_optimize_eval.add_argument("--rubric", type=Path, default=None, help="Optional system evaluation rubric markdown.")
    system_optimize_eval.add_argument("--top-k", type=int, default=8, help="Maximum wiki pages per retrieval context.")
    system_optimize_eval.add_argument("--strategy", choices=["v0", "v1"], default="v1", help="Retrieval strategy.")
    system_optimize_eval.add_argument(
        "--baseline-run",
        type=Path,
        default=None,
        help="Optional previous system-optimize-eval run directory or summary.json for before/after comparison.",
    )
    system_optimize_eval.add_argument(
        "--selected-pages-per-case",
        type=int,
        default=3,
        help="Number of top retrieved canonical pages to load as selected read context for each system evaluation.",
    )
    system_optimize_eval.add_argument("--overwrite", action="store_true", help="Overwrite an existing system optimization output directory.")

    system_optimize_compare = wiki_subparsers.add_parser(
        "system-optimize-compare",
        help="Compare two system-optimize-eval runs.",
    )
    system_optimize_compare.add_argument("--baseline-run", type=Path, required=True, help="Baseline run directory or summary.json.")
    system_optimize_compare.add_argument("--candidate-run", type=Path, required=True, help="Candidate run directory or summary.json.")
    system_optimize_compare.add_argument("--out-dir", type=Path, required=True, help="Directory where comparison artifacts are written.")

    retrieval_eval_summary_cmd = wiki_subparsers.add_parser(
        "retrieval-eval-summary",
        help="Summarize deterministic and optional judge results for a retrieval eval manifest.",
    )
    retrieval_eval_summary_cmd.add_argument("manifest", type=Path, help="Path to retrieval_manifest.json.")
    retrieval_eval_summary_cmd.add_argument("--out", type=Path, default=None, help="Optional summary JSON path.")

    retrieval_audit = wiki_subparsers.add_parser(
        "retrieval-audit",
        help="Audit whether each canonical paper can be retrieved from generated research-intent queries.",
    )
    retrieval_audit.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    retrieval_audit.add_argument(
        "--out-dir",
        type=Path,
        required=True,
        help="Directory where per-paper retrieval contexts and audit summaries are written.",
    )
    retrieval_audit.add_argument(
        "--catalog",
        type=Path,
        default=None,
        help="Optional catalog path. Defaults to <wiki-root>/.index/papers.jsonl.",
    )
    retrieval_audit.add_argument("--top-k", type=int, default=5, help="Maximum paper pages per generated query.")
    retrieval_audit.add_argument(
        "--queries-per-paper",
        type=int,
        default=3,
        help="Number of generated research-intent queries to run for each paper.",
    )
    retrieval_audit.add_argument("--max-papers", type=int, default=None, help="Optional audit subset size for smoke runs.")
    retrieval_audit.add_argument("--overwrite", action="store_true", help="Overwrite an existing audit output directory.")

    propose_writeback = wiki_subparsers.add_parser(
        "propose-writeback",
        help="Create a draft wiki write-back proposal from a retrieval context packet.",
    )
    propose_writeback.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    propose_writeback.add_argument("--query", required=True, help="Original research query.")
    propose_writeback.add_argument("--context", type=Path, required=True, help="Retrieval context JSON path.")
    propose_writeback.add_argument("--title", required=True, help="Proposal title.")
    propose_writeback.add_argument(
        "--proposal-type",
        choices=["synthesis", "comparison", "method-family", "decision", "research-question", "idea"],
        default="synthesis",
        help="Draft wiki artifact type.",
    )
    propose_writeback.add_argument("--body-file", type=Path, default=None, help="Optional markdown body for the synthesis draft.")
    propose_writeback.add_argument("--out-dir", type=Path, default=None, help="Optional proposal output directory.")
    propose_writeback.add_argument("--notes", default="", help="Deprecated alias for --user-note.")
    propose_writeback.add_argument("--user-note", default="", help="Optional user idea or decision note.")
    propose_writeback.add_argument("--user-note-file", type=Path, default=None, help="Optional markdown file with user ideas or decisions.")
    propose_writeback.add_argument("--overwrite", action="store_true", help="Overwrite an existing proposal directory.")
    propose_writeback.add_argument(
        "--no-log",
        action="store_true",
        help="Do not append a draft proposal entry to wiki/log.md.",
    )

    proposal_lint = wiki_subparsers.add_parser(
        "proposal-lint",
        help="Validate a query write-back proposal before canonical publish.",
    )
    proposal_lint.add_argument("proposal_manifest", type=Path, help="Path to proposal.json.")
    proposal_lint.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    proposal_lint.add_argument("--out", type=Path, default=None, help="Optional lint JSON report path.")
    proposal_lint.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow lint to pass when the publish target already exists.",
    )

    publish_proposal = wiki_subparsers.add_parser(
        "publish-proposal",
        help="Publish a lint-passing write-back proposal into the canonical synthesis layer.",
    )
    publish_proposal.add_argument("proposal_manifest", type=Path, help="Path to proposal.json.")
    publish_proposal.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    publish_proposal.add_argument("--overwrite", action="store_true", help="Allow overwriting an existing synthesis page.")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    effective_argv = sys.argv[1:] if argv is None else argv
    if effective_argv in (["--version"], ["-V"]):
        print(f"meridian {__version__}")
        return 0
    args = parser.parse_args(effective_argv)

    try:
        if args.product == "framework-check":
            report = run_framework_check(
                project_root=args.project_root,
                library_root=args.library_root,
                wiki_root=args.wiki_root,
                lab_root=args.lab_root,
                require_workspace=args.require_workspace,
            )
            if args.json_out:
                write_framework_json(report, args.json_out)
                print(f"Wrote framework check JSON: {args.json_out}")
            if args.report:
                write_framework_report(report, args.report)
                print(f"Wrote framework check report: {args.report}")
            payload = report.to_dict()
            summary = dict(payload["summary"])  # type: ignore[arg-type]
            print(f"Framework status: {report.status}")
            print(
                "Categories: "
                f"{summary['pass']} pass, {summary['warn']} warn, {summary['fail']} fail"
            )
            print(
                "Findings: "
                f"{summary['critical']} critical, {summary['degraded']} degraded, {summary['info']} info"
            )
            for category in report.categories:
                print(f"- {category.name}: {category.status}")
                for finding in category.findings[:3]:
                    print(f"  - {finding.severity}/{finding.fixability}: {finding.message}")
                if len(category.findings) > 3:
                    print(f"  - ... {len(category.findings) - 3} more")
            return 0 if report.status != "fail" else 1

        if args.product == "wiki" and args.command == "init":
            if args.library_root is not None:
                result = init_wiki_workspace(
                    library_root=args.library_root,
                    wiki_root=args.wiki_root,
                    source_root=args.source_root,
                    set_default=not args.no_set_default,
                    overwrite=args.overwrite_workspace_config,
                    overwrite_templates=args.overwrite_templates,
                )
                print(f"Initialized Paper Wiki workspace: {result.workspace.library_root}")
                print(f"Managed source root: {result.workspace.source_root}")
                print(f"Canonical wiki root: {result.workspace.wiki_root}")
                print(f"Workspace config: {result.workspace.config_path}")
                if result.user_config_path:
                    print(f"User config: {result.user_config_path}")
                print(f"Created directories: {len(result.created_dirs)}")
                print(f"Created files: {len(result.created_files)}")
                return 0
            if args.wiki_root is None:
                parser.error("wiki init requires --library-root or --wiki-root")
            result = init_wiki(wiki_root=args.wiki_root, overwrite_templates=args.overwrite_templates)
            print(f"Initialized wiki vault: {result.wiki_root}")
            print(f"Created directories: {len(result.created_dirs)}")
            print(f"Created files: {len(result.created_files)}")
            return 0

        if args.product == "wiki" and args.command == "ingest":
            workspace = None
            if args.library_root is not None or args.wiki_root is not None or args.out is None:
                workspace = workspace_for_cli(library_root=args.library_root, wiki_root=args.wiki_root)
            wiki_root = workspace.wiki_root if workspace is not None else None
            source_root = args.source_root or (workspace.source_root if workspace is not None else None)
            out_dir = args.out or _default_ingest_out_dir(wiki_root=wiki_root, pdf_path=args.pdf, title=args.title)
            baseline_dirty = git_dirty_paths(wiki_root or out_dir)
            result = ingest_pdf(
                pdf_path=args.pdf,
                out_dir=out_dir,
                title_override=args.title,
                overwrite=args.overwrite,
                wiki_root=wiki_root,
                source_root=source_root,
                publish_mode=args.publish_mode,
                render_page_images=not args.no_page_images,
            )
            if wiki_root is not None and result.canonical_paper_path is not None:
                catalog_wiki(wiki_root=wiki_root)
            _print_ingest_summary(result.run_path, verbose_artifacts=args.verbose_artifacts)
            if not args.no_auto_commit:
                commit_result = _auto_commit_ingest_result(
                    result=result,
                    wiki_root=wiki_root,
                    baseline_dirty=baseline_dirty,
                )
                _print_git_auto_commit_result(commit_result)
            return 0

        if args.product == "wiki" and args.command == "ingest-folder":
            workspace = workspace_for_cli(library_root=args.library_root, wiki_root=args.wiki_root)
            batch_dir = args.out_dir or _default_folder_ingest_out_dir(
                wiki_root=workspace.wiki_root,
                folder=args.folder,
            )
            baseline_dirty = git_dirty_paths(workspace.wiki_root)
            result = ingest_pdf_folder(
                source_folder=args.folder,
                batch_dir=batch_dir,
                wiki_root=workspace.wiki_root,
                source_root=args.source_root or workspace.source_root,
                publish_mode=args.publish_mode,
                overwrite=args.overwrite,
                render_page_images=args.render_page_images,
                limit=args.limit,
                stop_on_error=args.stop_on_error,
            )
            if result.success_count:
                catalog_wiki(wiki_root=workspace.wiki_root)
            _print_folder_ingest_summary(result.batch_manifest, verbose_artifacts=args.verbose_artifacts)
            if not args.no_auto_commit:
                commit_result = _auto_commit_folder_ingest_result(
                    batch_manifest=result.batch_manifest,
                    wiki_root=workspace.wiki_root,
                    baseline_dirty=baseline_dirty,
                )
                _print_git_auto_commit_result(commit_result)
            return 0

        if args.product == "wiki" and args.command == "flow":
            workspace = workspace_for_cli(library_root=args.library_root, wiki_root=args.wiki_root)
            out_dir = args.out or _default_ingest_out_dir(wiki_root=workspace.wiki_root, pdf_path=args.pdf, title=args.title)
            baseline_dirty = git_dirty_paths(workspace.wiki_root)
            result = run_flow(
                pdf_path=args.pdf,
                out_dir=out_dir,
                wiki_root=workspace.wiki_root,
                source_root=args.source_root or workspace.source_root,
                rubric_path=args.rubric,
                title_override=args.title,
                overwrite=args.overwrite,
                publish_mode=args.publish_mode,
                case_path=args.case,
                judge_result_path=args.judge_result,
                source_fidelity_result_path=args.source_fidelity_result,
                render_page_images=not args.no_page_images,
            )
            catalog_wiki(wiki_root=workspace.wiki_root)
            _print_flow_summary(
                flow_path=result.flow_path,
                run_path=result.run_path,
                verbose_artifacts=args.verbose_artifacts,
            )
            print(f"Flow status: {result.status}")
            if not args.no_auto_commit:
                commit_result = _auto_commit_flow_result(
                    flow_path=result.flow_path,
                    run_path=result.run_path,
                    wiki_root=workspace.wiki_root,
                    baseline_dirty=baseline_dirty,
                )
                _print_git_auto_commit_result(commit_result)
            return 0

        if args.product == "wiki" and args.command == "eval":
            manifest = eval_cases(
                cases_path=args.cases,
                out_dir=args.out_dir,
                overwrite=args.overwrite,
                publish_mode=args.publish_mode,
                mode=args.mode,
                rubric_path=args.rubric,
                wiki_root=args.wiki_root,
                render_page_images=not args.no_page_images,
            )
            print(f"Wrote eval manifest: {manifest}")
            return 0

        if args.product == "wiki" and args.command == "review":
            record_path = record_review(
                review_packet=args.review_packet,
                decision=args.decision,
                bucket=args.bucket,
                notes=args.notes,
            )
            print(f"Recorded human review: {record_path}")
            return 0

        if args.product == "wiki" and args.command == "eval-converge":
            result = converge_eval(manifest_path=args.manifest, judge_dir=args.judge_dir)
            print(f"Updated eval manifest: {result.manifest_path}")
            print(f"Wrote eval summary: {result.summary_path}")
            print(f"Recorded judge results: {result.recorded_count}")
            print(f"Awaiting judge results: {result.missing_count}")
            return 0

        if args.product == "wiki" and args.command == "eval-calibrate":
            require_next = None
            if args.require_human_review_next_time is not None:
                require_next = args.require_human_review_next_time == "true"
            path = calibrate_eval(
                manifest_path=args.manifest,
                case_id=args.case_id,
                human_decision=args.human_decision,
                bucket=args.bucket,
                notes=args.notes,
                should_require_human_review_next_time=require_next,
            )
            print(f"Recorded human calibration: {path}")
            return 0

        if args.product == "wiki" and args.command == "eval-summary":
            path = summarize_eval(manifest_path=args.manifest, out_path=args.out)
            print(f"Wrote eval summary: {path}")
            return 0

        if args.product == "wiki" and args.command == "publish-run":
            result = publish_run(
                run_manifest=args.run_manifest,
                wiki_root=args.wiki_root,
                source_fidelity_result_path=args.source_fidelity_result,
                promote_candidates=not args.no_promote_candidates,
                overwrite=args.overwrite,
            )
            print(f"Published canonical paper: {result.canonical_paper_path}")
            print(f"Promoted methods: {len(result.promoted_methods)}")
            print(f"Promoted claims: {len(result.promoted_claims)}")
            print(f"Promoted evidence: {len(result.promoted_evidence)}")
            print(f"Updated topics: {len(result.topic_pages)}")
            print(f"Updated index: {result.index_path}")
            print(f"Updated catalog: {result.catalog_path}")
            return 0

        if args.product == "wiki" and args.command == "source-audit":
            result = source_audit_wiki(wiki_root=args.wiki_root, out_path=args.out)
            print(f"Wrote source audit: {result.audit_path}")
            print(f"Wrote source index: {result.source_index_path}")
            print(f"Sources: {result.total}")
            print(f"Missing managed files: {result.missing_managed}")
            print(f"SHA mismatches: {result.sha_mismatches}")
            print(f"Duplicate SHA groups: {result.duplicate_sha_groups}")
            return 0

        if args.product == "wiki" and args.command == "rebuild-index":
            path = rebuild_index_wiki(wiki_root=args.wiki_root)
            print(f"Rebuilt wiki index: {path}")
            print(f"Rebuilt paper catalog: {args.wiki_root / '.index/papers.jsonl'}")
            print(f"Rebuilt synthesis catalog: {args.wiki_root / '.index/syntheses.jsonl'}")
            return 0

        if args.product == "wiki" and args.command == "lint":
            result = lint_wiki_command(wiki_root=args.wiki_root, out_path=args.out)
            print(f"Wrote wiki lint report: {result.report_path}")
            print(f"Wiki lint status: {result.status}")
            print(f"Findings: {len(result.findings)}")
            return 0

        if args.product == "wiki" and args.command == "knowledge-audit":
            result = knowledge_audit_wiki(wiki_root=args.wiki_root, out_path=args.out, brief_path=args.brief)
            print(f"Wrote knowledge audit: {result.report_path}")
            print(f"Wrote knowledge audit brief: {result.brief_path}")
            print(f"Knowledge audit status: {result.status}")
            print(f"Findings: {len(result.findings)}")
            return 0 if result.status != "fail" else 1

        if args.product == "wiki" and args.command == "propose-knowledge-repair":
            result = propose_knowledge_repair_wiki(
                wiki_root=args.wiki_root,
                out_dir=args.out,
                audit_path=args.audit,
                overwrite=args.overwrite,
            )
            print(f"Wrote knowledge repair proposal: {result.repair_path}")
            print(f"Wrote repair manifest: {result.manifest_path}")
            print(f"Wrote publish plan: {result.publish_plan_path}")
            print(f"Deterministic repairs: {result.deterministic_repairs}")
            print(f"High-risk proposal-only repairs: {result.high_risk_repairs}")
            return 0

        if args.product == "wiki" and args.command == "knowledge-repair-lint":
            result = knowledge_repair_lint_wiki(
                repair_manifest=args.repair_manifest,
                wiki_root=args.wiki_root,
                out_path=args.out,
            )
            print(f"Wrote knowledge repair lint report: {result.report_path}")
            print(f"Knowledge repair lint status: {result.status}")
            print(f"Findings: {len(result.findings)}")
            return 0 if result.status == "pass" else 1

        if args.product == "wiki" and args.command == "publish-knowledge-repair":
            result = publish_knowledge_repair_wiki(
                repair_manifest=args.repair_manifest,
                wiki_root=args.wiki_root,
            )
            print(f"Published knowledge repair: {result.manifest_path}")
            print(f"Applied actions: {result.applied_actions}")
            print(f"Skipped actions: {result.skipped_actions}")
            print(f"Updated index: {result.index_path}")
            print(f"Updated wiki log: {result.log_path}")
            print(f"Knowledge repair lint report: {result.lint_report_path}")
            return 0

        if args.product == "wiki" and args.command == "concept-audit":
            result = concept_audit_wiki(wiki_root=args.wiki_root, out_path=args.out, brief_path=args.brief)
            print(f"Wrote concept audit: {result.report_path}")
            print(f"Wrote concept audit brief: {result.brief_path}")
            print(f"Concept audit status: {result.status}")
            print(f"Findings: {len(result.findings)}")
            return 0 if result.status != "fail" else 1

        if args.product == "wiki" and args.command == "propose-concept-layer":
            result = propose_concept_layer_wiki(
                wiki_root=args.wiki_root,
                out_dir=args.out_dir,
                overwrite=args.overwrite,
                max_concepts=args.max_concepts,
            )
            print(f"Wrote concept layer proposal: {result.proposal_path}")
            print(f"Wrote concept layer manifest: {result.manifest_path}")
            print(f"Wrote publish plan: {result.publish_plan_path}")
            print(f"Candidate concepts: {result.candidate_count}")
            print(f"Proposed concepts: {result.proposed_count}")
            return 0

        if args.product == "wiki" and args.command == "concept-layer-lint":
            result = concept_layer_lint_wiki(
                proposal_manifest=args.proposal_manifest,
                wiki_root=args.wiki_root,
                out_path=args.out,
            )
            print(f"Wrote concept layer lint report: {result.report_path}")
            print(f"Concept layer lint status: {result.status}")
            print(f"Findings: {len(result.findings)}")
            return 0 if result.status == "pass" else 1

        if args.product == "wiki" and args.command == "publish-concept-layer":
            result = publish_concept_layer_wiki(
                proposal_manifest=args.proposal_manifest,
                wiki_root=args.wiki_root,
            )
            print(f"Published concept layer: {result.manifest_path}")
            print(f"Created concepts: {result.concepts_created}")
            print(f"Backlinks added: {result.backlinks_added}")
            print(f"Skipped actions: {result.skipped_actions}")
            print(f"Updated index: {result.index_path}")
            print(f"Updated wiki log: {result.log_path}")
            print(f"Concept layer lint report: {result.lint_report_path}")
            return 0

        if args.product == "wiki" and args.command == "final-status-migrate":
            result = final_status_migrate_wiki(wiki_root=args.wiki_root, out_path=args.out)
            print(f"Wrote final status migration: {result.manifest_path}")
            print(f"Updated pages: {result.updated_pages}")
            print(f"Status counts: {json.dumps(result.status_counts, sort_keys=True)}")
            print(f"Updated catalog: {result.catalog_path}")
            print(f"Updated wiki log: {result.log_path}")
            return 0

        if args.product == "wiki" and args.command == "propose-synthesis-batch":
            result = propose_synthesis_batch_wiki(
                wiki_root=args.wiki_root,
                out_dir=args.out_dir,
                max_items=args.max_items,
                overwrite=args.overwrite,
            )
            print(f"Wrote synthesis batch: {result.manifest_path}")
            print(f"Batch directory: {result.batch_dir}")
            print(f"Proposal count: {result.proposal_count}")
            return 0

        if args.product == "wiki" and args.command == "publish-synthesis-batch":
            result = publish_synthesis_batch_wiki(
                batch_manifest=args.batch_manifest,
                wiki_root=args.wiki_root,
                limit=args.limit,
                overwrite=args.overwrite,
            )
            print(f"Updated synthesis batch: {result.manifest_path}")
            print(f"Published syntheses: {result.published_count}")
            print(f"Skipped syntheses: {result.skipped_count}")
            print(f"Failed syntheses: {result.failed_count}")
            return 0 if result.failed_count == 0 else 1

        if args.product == "wiki" and args.command == "propose-method-consolidation":
            result = propose_method_consolidation_wiki(
                wiki_root=args.wiki_root,
                out_dir=args.out_dir,
                overwrite=args.overwrite,
            )
            print(f"Wrote method consolidation proposal: {result.manifest_path}")
            print(f"Candidate method records: {result.candidate_count}")
            print(f"Grouped candidates: {result.grouped_count}")
            print(f"High-risk candidates: {result.high_risk_count}")
            return 0

        if args.product == "wiki" and args.command == "publish-method-consolidation":
            result = publish_method_consolidation_wiki(
                consolidation_manifest=args.consolidation_manifest,
                wiki_root=args.wiki_root,
            )
            print(f"Wrote method consolidation publish result: {result.published_manifest_path}")
            print(f"Updated candidate records: {result.updated_candidates}")
            print(f"Skipped candidate records: {result.skipped_candidates}")
            print(f"Updated wiki log: {result.log_path}")
            return 0

        if args.product == "wiki" and args.command == "propose-contradiction-review":
            result = propose_contradiction_review_wiki(
                wiki_root=args.wiki_root,
                out_dir=args.out_dir,
                overwrite=args.overwrite,
            )
            print(f"Wrote contradiction review proposal: {result.manifest_path}")
            print(f"Candidate reviews: {result.candidate_count}")
            return 0

        if args.product == "wiki" and args.command == "build-navigation":
            result = build_navigation_wiki(wiki_root=args.wiki_root, out_path=args.out)
            print(f"Wrote navigation manifest: {result.manifest_path}")
            print(f"Navigation pages: {len(result.pages)}")
            for path in result.pages:
                print(f"- {path}")
            return 0

        if args.product == "wiki" and args.command == "final-product-check":
            result = final_product_check_wiki(wiki_root=args.wiki_root, out_path=args.out, brief_path=args.brief)
            print(f"Wrote final product check: {result.report_path}")
            print(f"Wrote final product brief: {result.brief_path}")
            print(f"Final product status: {result.status}")
            print(f"Findings: {len(result.findings)}")
            return 0 if result.status != "fail" else 1

        if args.product == "wiki" and args.command == "health":
            result = health_wiki(
                wiki_root=args.wiki_root,
                profile=args.profile,
                out_path=args.out,
                markdown_path=args.report,
                html_path=args.html,
                repair_plan=args.repair_plan,
                repair_plan_path=args.repair_plan_out,
            )
            print(f"Wrote wiki health JSON: {result.report_path}")
            print(f"Wrote wiki health report: {result.markdown_path}")
            print(f"Wrote wiki health HTML: {result.html_path}")
            if result.repair_plan_path:
                print(f"Wrote wiki health repair plan: {result.repair_plan_path}")
            print(f"Wiki health: {result.health_level}")
            print(f"Overall score: {result.overall_score}")
            print(f"Hard failures: {len(result.hard_failures)}")
            return 0 if result.health_level != "blocked" else 1

        if args.product == "wiki" and args.command == "health-ui":
            serve_health_ui(
                wiki_root=args.wiki_root,
                host=args.host,
                port=args.port,
                profile=args.profile,
                repair_plan=not args.no_repair_plan,
            )
            return 0

        if args.product == "wiki" and args.command == "judge-pack":
            packet = create_judge_packet(
                run_manifest=args.run_manifest,
                rubric_path=args.rubric,
                out_path=args.out,
                case_path=args.case,
            )
            print(f"Wrote judge packet: {packet}")
            return 0

        if args.product == "wiki" and args.command == "judge-record":
            record_path = record_judge(
                run_manifest=args.run_manifest,
                judge_result_path=args.judge_result,
                out_path=args.out,
            )
            print(f"Recorded judge result: {record_path}")
            return 0

        if args.product == "wiki" and args.command == "reader-check":
            packet = create_reader_check_packet(
                run_manifest=args.run_manifest,
                out_path=args.out,
            )
            print(f"Wrote reader check packet: {packet}")
            return 0

        if args.product == "wiki" and args.command == "quality-check":
            result = quality_check_run(run_manifest=args.run_manifest, out_path=args.out)
            print(f"Wrote quality self-check: {result.path}")
            print(f"Quality decision: {result.decision}")
            print(f"Weighted score: {result.weighted_score:.3f}")
            return 0

        if args.product == "wiki" and args.command == "structural-check":
            result = structural_check_run(run_manifest=args.run_manifest, out_path=args.out)
            print(f"Wrote structural self-check: {result.path}")
            print(f"Structural decision: {result.decision}")
            print(f"Weighted score: {result.weighted_score:.3f}")
            return 0

        if args.product == "wiki" and args.command == "self-check-run":
            result = self_check_run(
                run_manifest=args.run_manifest,
                out_dir=args.out_dir,
                backend=args.backend,
                overwrite=args.overwrite,
            )
            print(f"Wrote self-check manifest: {result.manifest_path}")
            if result.summary_path is not None:
                print(f"Wrote self-check summary: {result.summary_path}")
            print(f"Self-check status: {result.status}")
            return 0

        if args.product == "wiki" and args.command == "self-check-aggregate":
            result = self_check_aggregate(manifest_path=args.manifest, out_path=args.out)
            print(f"Wrote self-check summary: {result.summary_path}")
            print(f"Self-check decision: {result.decision}")
            print(f"Weighted score: {result.weighted_score:.3f}")
            return 0

        if args.product == "wiki" and args.command == "self-check-eval":
            result = self_check_eval(
                eval_manifest=args.manifest,
                out_dir=args.out_dir,
                backend=args.backend,
                overwrite=args.overwrite,
            )
            print(f"Wrote self-check eval summary: {result.summary_path}")
            print(f"Total cases: {result.total_cases}")
            print(f"Completed cases: {result.completed_cases}")
            print(f"Awaiting agent cases: {result.awaiting_cases}")
            print(f"Failed cases: {result.failed_cases}")
            return 0

        if args.product == "wiki" and args.command == "converge":
            result = converge_run(run_manifest=args.run_manifest, out_path=args.out)
            print(f"Wrote convergence record: {result.convergence_path}")
            print(f"Convergence status: {result.status}")
            return 0

        if args.product == "wiki" and args.command == "catalog":
            result = catalog_wiki(wiki_root=args.wiki_root, out_path=args.out)
            print(f"Wrote paper catalog: {result.catalog_path}")
            print(f"Wrote synthesis catalog: {args.wiki_root / '.index/syntheses.jsonl'}")
            print(f"Wrote knowledge catalogs: {args.wiki_root / '.index'}")
            print(f"Catalog entries: {result.count}")
            return 0

        if args.product == "wiki" and args.command == "status":
            payload = _workspace_status_payload(library_root=args.library_root, wiki_root=args.wiki_root)
            if args.json_out is not None:
                args.json_out.parent.mkdir(parents=True, exist_ok=True)
                args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                print(f"Wrote workspace status JSON: {args.json_out}")
            print(f"Workspace status: {payload['status']}")
            if payload["status"] == "configured":
                print(f"Active wiki root: {payload['wiki_root']}")
                print(f"Managed source root: {payload['source_root']}")
                print(f"Workspace config: {payload['workspace_config']}")
            else:
                print("Active wiki root: not configured")
                print("Initialize with: meridian wiki init --library-root <paper-wiki-library-root>")
            print(f"Core module path: {payload['core_module_path']}")
            print(f"Core package root: {payload['core_package_root']}")
            print(f"meridian on PATH: {payload['meridian_on_path']}")
            print(f"MCP available: {payload['mcp_available']}")
            return 0

        if args.product == "wiki" and args.command == "retrieve":
            result = retrieve_wiki(
                query=args.query,
                wiki_root=args.wiki_root,
                catalog_path=args.catalog,
                top_k=args.top_k,
                strategy=args.strategy,
                packet_path=args.out,
                result_path=args.json_out,
            )
            if result.packet_path is not None:
                print(f"Wrote retrieval context packet: {result.packet_path}")
            if result.result_path is not None:
                print(f"Wrote retrieval JSON: {result.result_path}")
            print(f"Retrieved wiki pages: {len(result.results)}")
            for item in result.results:
                result_type = item.get("result_type") or item.get("type") or "paper"
                print(f"- {item['score']}: [{result_type}] {item['title']} ({item.get('relative_path') or item['path']})")
            if result.warnings:
                print("Retrieval warnings:")
                for warning in result.warnings:
                    print(f"- {warning}")
            if not result.results:
                print("Failure report: no positive-scoring canonical pages were found; rebuild catalog or narrow the query.")
            return 0

        if args.product == "wiki" and args.command == "context":
            workspace = workspace_for_cli(library_root=args.library_root, wiki_root=args.wiki_root)
            out_dir = args.out_dir or _default_context_out_dir(args.query)
            packet_path = out_dir / "context.md"
            result_path = out_dir / "context.json"
            result = retrieve_wiki(
                query=args.query,
                wiki_root=workspace.wiki_root,
                top_k=args.top_k,
                strategy=args.strategy,
                packet_path=packet_path,
                result_path=result_path,
            )
            print("Use Wiki context: ready")
            print(f"Active wiki root: {workspace.wiki_root}")
            print(f"Managed source root: {workspace.source_root}")
            print(f"Wrote retrieval context packet: {packet_path}")
            print(f"Wrote retrieval JSON: {result_path}")
            print(f"Retrieved wiki pages: {len(result.results)}")
            for item in result.results:
                result_type = item.get("result_type") or item.get("type") or "paper"
                print(f"- {item['score']}: [{result_type}] {item['title']} ({item.get('relative_path') or item['path']})")
            if result.warnings:
                print("Retrieval warnings:")
                for warning in result.warnings:
                    print(f"- {warning}")
            if not result.results:
                print("Failure report: no positive-scoring canonical pages were found; rebuild catalog or narrow the query.")
            return 0

        if args.product == "wiki" and args.command == "add-insight":
            result = add_insight_wiki(
                wiki_root=args.wiki_root,
                paper=args.paper,
                note=args.note,
                note_file=args.note_file,
                insight_type=args.insight_type,
                out_dir=args.out_dir,
                overwrite=args.overwrite,
            )
            print(f"Insight match status: {result.status}")
            print(f"Wrote target context: {result.target_context_path}")
            print(f"Wrote insight manifest: {result.manifest_path}")
            if result.insight_path is not None:
                print(f"Wrote insight draft: {result.insight_path}")
            if result.publish_plan_path is not None:
                print(f"Wrote publish plan: {result.publish_plan_path}")
            if result.target_page is not None:
                print(f"Matched canonical paper: {result.target_page}")
            else:
                print(f"Candidate papers: {result.candidate_count}")
            return 0 if result.status == "matched" else 1

        if args.product == "wiki" and args.command == "insight-lint":
            result = insight_lint_wiki(
                insight_manifest=args.insight_manifest,
                wiki_root=args.wiki_root,
                out_path=args.out,
            )
            print(f"Wrote insight lint report: {result.report_path}")
            print(f"Insight lint status: {result.status}")
            print(f"Findings: {len(result.findings)}")
            return 0 if result.status == "pass" else 1

        if args.product == "wiki" and args.command == "publish-insight":
            result = publish_insight_wiki(
                insight_manifest=args.insight_manifest,
                wiki_root=args.wiki_root,
            )
            print(f"Published internalized user insight to: {result.page_path}")
            print(f"Updated paper catalog: {result.catalog_path}")
            print(f"Insight lint report: {result.lint_report_path}")
            print(f"Updated wiki log: {result.log_path}")
            return 0

        if args.product == "wiki" and args.command == "propose-refine":
            result = propose_refine_wiki(
                wiki_root=args.wiki_root,
                target=args.target,
                reason=args.reason,
                note=args.note,
                note_file=args.note_file,
                change_class=args.change_class,
                from_insight=args.from_insight,
                out_dir=args.out_dir,
                overwrite=args.overwrite,
            )
            print(f"Refinement target match status: {result.status}")
            print(f"Wrote source context: {result.source_context_path}")
            print(f"Wrote refinement manifest: {result.manifest_path}")
            if result.refinement_path is not None:
                print(f"Wrote refinement draft: {result.refinement_path}")
            if result.diff_path is not None:
                print(f"Wrote semantic diff: {result.diff_path}")
            if result.publish_plan_path is not None:
                print(f"Wrote publish plan: {result.publish_plan_path}")
            if result.target_page is not None:
                print(f"Matched canonical page: {result.target_page}")
            else:
                print(f"Candidate pages: {result.candidate_count}")
            return 0 if result.status == "matched" else 1

        if args.product == "wiki" and args.command == "refinement-lint":
            result = refinement_lint_wiki(
                refinement_manifest=args.refinement_manifest,
                wiki_root=args.wiki_root,
                out_path=args.out,
            )
            print(f"Wrote refinement lint report: {result.report_path}")
            print(f"Refinement lint status: {result.status}")
            print(f"Findings: {len(result.findings)}")
            return 0 if result.status == "pass" else 1

        if args.product == "wiki" and args.command == "publish-refinement":
            result = publish_refinement_wiki(
                refinement_manifest=args.refinement_manifest,
                wiki_root=args.wiki_root,
            )
            print(f"Published refinement to: {result.page_path}")
            print(f"Snapshot before publish: {result.snapshot_path}")
            print(f"Updated catalog: {result.catalog_path}")
            print(f"Refinement lint report: {result.lint_report_path}")
            print(f"Updated wiki log: {result.log_path}")
            return 0

        if args.product == "wiki" and args.command == "retrieval-eval":
            result = retrieval_eval_wiki(
                cases_path=args.cases,
                wiki_root=args.wiki_root,
                out_dir=args.out_dir,
                rubric_path=args.rubric,
                top_k=args.top_k,
                catalog_path=args.catalog,
                strategy=args.strategy,
                overwrite=args.overwrite,
            )
            print(f"Wrote retrieval manifest: {result.manifest_path}")
            print(f"Wrote retrieval summary: {result.summary_path}")
            print(f"Total cases: {result.total_cases}")
            print(f"Deterministic passes: {result.deterministic_passes}")
            print(f"Deterministic failures: {result.deterministic_failures}")
            return 0

        if args.product == "wiki" and args.command == "retrieval-eval-summary":
            result = retrieval_eval_summary(manifest_path=args.manifest, out_path=args.out)
            print(f"Wrote retrieval summary: {result.summary_path}")
            print(f"Total cases: {result.total_cases}")
            print(f"Judge results: {result.judge_results}")
            return 0

        if args.product == "wiki" and args.command == "retrieval-optimize-eval":
            result = retrieval_optimization_eval_wiki(
                cases_path=args.cases,
                wiki_root=args.wiki_root,
                out_dir=args.out_dir,
                rubric_path=args.rubric,
                top_k=args.top_k,
                catalog_path=args.catalog,
                baseline_strategy=args.baseline_strategy,
                candidate_strategy=args.candidate_strategy,
                overwrite=args.overwrite,
            )
            print(f"Wrote retrieval optimization manifest: {result.manifest_path}")
            print(f"Wrote retrieval optimization summary: {result.summary_path}")
            print(f"Wrote retrieval optimization report: {result.summary_markdown_path}")
            print(f"Total cases: {result.total_cases}")
            print(f"Baseline strategy: {result.baseline_strategy}")
            print(f"Candidate strategy: {result.candidate_strategy}")
            return 0

        if args.product == "wiki" and args.command == "system-evaluate":
            result = system_evaluate_wiki(
                wiki_root=args.wiki_root,
                case_path=args.case,
                context_path=args.context,
                out_dir=args.out,
                rubric_path=args.rubric,
                selected_pages=args.selected_page,
                proposal_path=args.proposal,
                audit_paths=args.audit,
                overwrite=args.overwrite,
            )
            print(f"Wrote system evaluation: {result.report_path}")
            print(f"Wrote system evaluation brief: {result.markdown_path}")
            print(f"Wrote judge packet: {result.judge_packet_path}")
            print(f"Decision: {result.decision}")
            print(f"Weighted score: {result.weighted_score:.3f}")
            print(f"Hard failures: {len(result.hard_failures)}")
            print(f"Findings: {len(result.findings)}")
            return 0 if result.decision != "fail" else 1

        if args.product == "wiki" and args.command == "system-optimize-eval":
            result = system_optimize_eval_wiki(
                wiki_root=args.wiki_root,
                cases_path=args.cases,
                out_dir=args.out_dir,
                rubric_path=args.rubric,
                top_k=args.top_k,
                strategy=args.strategy,
                baseline_run=args.baseline_run,
                selected_pages_per_case=args.selected_pages_per_case,
                overwrite=args.overwrite,
            )
            print(f"Wrote system optimization summary: {result.summary_path}")
            print(f"Wrote system optimization report: {result.summary_markdown_path}")
            print(f"Wrote repair bucket summary: {result.repair_buckets_path}")
            print(f"Wrote optimization plan: {result.optimization_plan_path}")
            print(f"Wrote judge packet: {result.judge_packet_path}")
            if result.comparison_path is not None:
                print(f"Wrote comparison: {result.comparison_path}")
                print(f"Wrote comparison report: {result.comparison_markdown_path}")
            print(f"Total cases: {result.total_cases}")
            print(f"Decisions: {json.dumps(result.decisions, sort_keys=True)}")
            print(f"Average score: {result.average_score:.3f}")
            print(f"Min score: {result.min_score:.3f}")
            return 0

        if args.product == "wiki" and args.command == "system-optimize-compare":
            comparison_path, comparison_markdown_path = system_optimize_compare_wiki(
                baseline_run=args.baseline_run,
                candidate_run=args.candidate_run,
                out_dir=args.out_dir,
            )
            print(f"Wrote comparison: {comparison_path}")
            print(f"Wrote comparison report: {comparison_markdown_path}")
            return 0

        if args.product == "wiki" and args.command == "retrieval-audit":
            result = retrieval_audit_wiki(
                wiki_root=args.wiki_root,
                out_dir=args.out_dir,
                catalog_path=args.catalog,
                top_k=args.top_k,
                queries_per_paper=args.queries_per_paper,
                max_papers=args.max_papers,
                overwrite=args.overwrite,
            )
            print(f"Wrote retrieval audit manifest: {result.manifest_path}")
            print(f"Wrote retrieval audit summary: {result.summary_path}")
            print(f"Wrote retrieval audit report: {result.summary_markdown_path}")
            print(f"Audited papers: {result.paper_count}")
            print(f"Queries run: {result.query_count}")
            print(f"Query recall at k: {result.query_recall_at_k:.3f}")
            return 0

        if args.product == "wiki" and args.command == "propose-writeback":
            result = propose_writeback_wiki(
                wiki_root=args.wiki_root,
                query=args.query,
                context_path=args.context,
                title=args.title,
                proposal_type=args.proposal_type,
                body_path=args.body_file,
                out_dir=args.out_dir,
                notes=args.notes,
                user_note=args.user_note,
                user_note_path=args.user_note_file,
                overwrite=args.overwrite,
                update_log=not args.no_log,
            )
            print(f"Wrote write-back proposal: {result.proposal_path}")
            print(f"Wrote proposal manifest: {result.manifest_path}")
            print(f"Wrote source context: {result.source_context_path}")
            print(f"Wrote publish plan: {result.publish_plan_path}")
            if result.log_path is not None:
                print(f"Updated wiki log: {result.log_path}")
            return 0

        if args.product == "wiki" and args.command == "proposal-lint":
            result = proposal_lint_wiki(
                proposal_manifest=args.proposal_manifest,
                wiki_root=args.wiki_root,
                out_path=args.out,
                overwrite=args.overwrite,
            )
            print(f"Wrote proposal lint report: {result.report_path}")
            print(f"Proposal lint status: {result.status}")
            print(f"Findings: {len(result.findings)}")
            return 0 if result.status == "pass" else 1

        if args.product == "wiki" and args.command == "publish-proposal":
            result = publish_proposal_wiki(
                proposal_manifest=args.proposal_manifest,
                wiki_root=args.wiki_root,
                overwrite=args.overwrite,
            )
            print(f"Published synthesis page: {result.page_path}")
            print(f"Updated synthesis catalog: {result.catalog_path}")
            print(f"Proposal lint report: {result.lint_report_path}")
            print(f"Updated wiki log: {result.log_path}")
            return 0

    except Exception as exc:  # noqa: BLE001 - CLI should render concise failures.
        from meridian.mcp.adapter import call_chain_error_payload, format_call_chain_error

        payload = call_chain_error_payload(exc)
        if payload.get("error_code") in {"needs_init", "workspace_index_write_failed"}:
            print(format_call_chain_error(exc), file=sys.stderr)
        else:
            print(f"error: {exc}", file=sys.stderr)
        return 1

    parser.error("unknown command")
    return 2


def _default_ingest_out_dir(*, wiki_root: Path, pdf_path: Path, title: str | None = None) -> Path:
    return wiki_root / ".drafts" / "ingests" / slugify(title or pdf_path.stem)


def _default_folder_ingest_out_dir(*, wiki_root: Path, folder: Path) -> Path:
    return wiki_root / ".drafts" / "ingests" / "batches" / slugify(folder.name or "pdf-folder")


def _print_ingest_summary(run_path: Path, *, verbose_artifacts: bool) -> None:
    run = _read_manifest(run_path)
    source = dict(run.get("source_artifacts") or {})
    product = dict(run.get("product_artifacts") or {})
    internal = dict(run.get("internal_artifacts") or {})
    quality_gate = dict(run.get("quality_gate") or {})
    canonical = product.get("canonical_paper_page")

    print(f"Managed source PDF: {source.get('managed_pdf') or run.get('source_pdf')}")
    print(f"Canonical wiki page: {canonical or 'not published'}")
    print(f"Quality gate: {quality_gate.get('decision') or 'unknown'}")
    deterministic = dict(run.get("deterministic_convergence") or {})
    review_state = deterministic.get("review_state") or "not_run"
    print(f"Review state: {review_state}")
    if product.get("wiki_index"):
        print(f"Updated wiki index: {product['wiki_index']}")
    if product.get("wiki_log"):
        print(f"Updated wiki log: {product['wiki_log']}")
    print(f"Internal artifact root: {internal.get('artifact_root') or run_path.parent}")

    if verbose_artifacts:
        _print_artifact_group("Internal artifacts", dict(run.get("internal_artifacts") or {}))
        _print_artifact_group("Debug artifacts", dict(run.get("debug_artifacts") or {}))
        print(f"Run manifest: {run_path}")


def _print_folder_ingest_summary(batch_manifest: Path, *, verbose_artifacts: bool) -> None:
    batch = _read_manifest(batch_manifest)
    product = dict(batch.get("product_summary") or {})
    print(f"Source folder: {batch.get('source_folder')}")
    print(f"PDFs discovered: {batch.get('pdf_count')}")
    print(f"Ingested successfully: {batch.get('success_count')}")
    print(f"Failures: {batch.get('failure_count')}")
    print(f"Canonical pages published: {product.get('canonical_wiki_pages_published', 0)}")
    print(f"Batch manifest: {batch_manifest}")

    if verbose_artifacts:
        print("Per-paper runs:")
        for item in batch.get("results", []):
            if not isinstance(item, dict):
                continue
            print(f"  - {item.get('status')}: {item.get('input_pdf')}")
            if item.get("run_manifest"):
                print(f"    run_manifest: {item['run_manifest']}")
            if item.get("managed_source_pdf"):
                print(f"    managed_source_pdf: {item['managed_source_pdf']}")
            if item.get("canonical_paper_page"):
                print(f"    canonical_paper_page: {item['canonical_paper_page']}")
            if item.get("error"):
                print(f"    error: {item['error']}")


def _print_flow_summary(*, flow_path: Path, run_path: Path, verbose_artifacts: bool) -> None:
    flow = _read_manifest(flow_path)
    run = _read_manifest(run_path)
    source = dict(flow.get("source_artifacts") or run.get("source_artifacts") or {})
    product = dict(flow.get("product_artifacts") or run.get("product_artifacts") or {})
    internal = dict(flow.get("internal_artifacts") or run.get("internal_artifacts") or {})
    quality_gate = dict(run.get("quality_gate") or {})

    print(f"Managed source PDF: {source.get('managed_pdf') or run.get('source_pdf')}")
    print(f"Canonical wiki page: {product.get('canonical_paper_page') or 'not published'}")
    print(f"Quality gate: {quality_gate.get('decision') or 'unknown'}")
    print(f"Review state: {flow.get('deterministic_review_state') or 'not_run'}")
    print(f"Publish decision: {flow.get('publish_decision') or 'unknown'}")
    if flow.get("block_reason"):
        print(f"Block reason: {flow['block_reason']}")
    if flow.get("source_fidelity_packet"):
        print(f"Source-fidelity packet: {flow['source_fidelity_packet']}")
    if product.get("wiki_index"):
        print(f"Updated wiki index: {product['wiki_index']}")
    if product.get("wiki_log"):
        print(f"Updated wiki log: {product['wiki_log']}")
    print(f"Internal artifact root: {internal.get('artifact_root') or run_path.parent}")

    if verbose_artifacts:
        _print_artifact_group("Internal artifacts", dict(flow.get("internal_artifacts") or {}))
        _print_artifact_group("Debug artifacts", dict(flow.get("debug_artifacts") or {}))
        _print_artifact_group("Validation artifacts", dict(flow.get("validation_artifacts") or {}))
        print(f"Run manifest: {run_path}")
        print(f"Flow manifest: {flow_path}")


def _auto_commit_ingest_result(
    *,
    result: object,
    wiki_root: Path | None,
    baseline_dirty: set[str],
) -> GitAutoCommitResult:
    run = _read_manifest(result.run_path)  # type: ignore[attr-defined]
    paths = _manifest_commit_paths(run)
    paths.append(result.run_path.parent)  # type: ignore[attr-defined]
    if wiki_root is not None:
        paths.extend(_catalog_paths(wiki_root))
        paths.extend(_vault_scaffold_paths(wiki_root))
    title = str(run.get("title") or "paper")
    return auto_commit_paths(
        anchor=wiki_root or result.run_path.parent,  # type: ignore[attr-defined]
        paths=paths,
        message=f"wiki: ingest {title}",
        baseline_dirty=baseline_dirty,
    )


def _auto_commit_folder_ingest_result(
    *,
    batch_manifest: Path,
    wiki_root: Path,
    baseline_dirty: set[str],
) -> GitAutoCommitResult:
    batch = _read_manifest(batch_manifest)
    paths: list[Path] = [batch_manifest, batch_manifest.parent]
    for item in batch.get("results", []):
        if not isinstance(item, dict) or item.get("status") != "generated":
            continue
        run_manifest = item.get("run_manifest")
        if not run_manifest:
            continue
        run_path = Path(str(run_manifest))
        if run_path.exists():
            paths.extend(_manifest_commit_paths(_read_manifest(run_path)))
            paths.append(run_path.parent)
    paths.extend(_catalog_paths(wiki_root))
    paths.extend(_vault_scaffold_paths(wiki_root))
    return auto_commit_paths(
        anchor=wiki_root,
        paths=paths,
        message=f"wiki: ingest folder {Path(str(batch.get('source_folder') or 'papers')).name}",
        baseline_dirty=baseline_dirty,
    )


def _auto_commit_flow_result(
    *,
    flow_path: Path,
    run_path: Path,
    wiki_root: Path,
    baseline_dirty: set[str],
) -> GitAutoCommitResult:
    flow = _read_manifest(flow_path)
    run = _read_manifest(run_path)
    title = str(run.get("title") or Path(str(flow.get("source_pdf") or "paper")).stem)
    paths = _manifest_commit_paths(run)
    paths.append(flow_path.parent)
    paths.extend(_catalog_paths(wiki_root))
    paths.extend(_vault_scaffold_paths(wiki_root))
    return auto_commit_paths(
        anchor=wiki_root,
        paths=paths,
        message=f"wiki: ingest {title}",
        baseline_dirty=baseline_dirty,
    )


def _manifest_commit_paths(manifest: dict[str, object]) -> list[Path]:
    paths: list[Path] = []
    for group_name in ("source_artifacts", "product_artifacts", "canonical_artifacts"):
        group = manifest.get(group_name)
        if not isinstance(group, dict):
            continue
        for value in group.values():
            if isinstance(value, str) and value:
                paths.append(Path(value))
    for key in ("run_manifest", "flow_manifest"):
        value = manifest.get(key)
        if isinstance(value, str) and value:
            paths.append(Path(value))
    return paths


def _catalog_paths(wiki_root: Path) -> list[Path]:
    index_dir = wiki_root / ".index"
    if not index_dir.exists():
        return []
    return sorted(index_dir.glob("*.jsonl"))


def _vault_scaffold_paths(wiki_root: Path) -> list[Path]:
    return [
        wiki_root / "templates",
        wiki_root / "raw/sources/index.md",
    ]


def _workspace_status_payload(*, library_root: Path | None, wiki_root: Path | None) -> dict[str, object]:
    workspace = resolve_workspace(library_root=library_root, wiki_root=wiki_root)
    meridian_path = shutil.which("meridian")
    core_module = Path(__file__).resolve()
    core_package_root = core_module.parents[2]
    payload: dict[str, object] = {
        "schema_version": "meridian.paper_wiki_status.v1",
        "status": "configured" if workspace is not None else "missing_workspace",
        "user_config_path": str(default_user_config_path()),
        "core_module_path": str(core_module),
        "core_package_root": str(core_package_root),
        "configured_core_root": os.environ.get("MERIDIAN_CORE_ROOT"),
        "meridian_on_path": meridian_path or None,
        "mcp_available": _mcp_available(),
        "resolver_order": [
            "meridian",
            "MERIDIAN_CORE_ROOT/src via PYTHONPATH",
            "repo-local PYTHONPATH=<repo>/src python3 -m meridian",
        ],
    }
    if workspace is not None:
        payload.update(
            {
                "library_root": str(workspace.library_root),
                "source_root": str(workspace.source_root),
                "wiki_root": str(workspace.wiki_root),
                "workspace_config": str(workspace.config_path) if workspace.config_path else None,
            }
        )
    return payload


def _mcp_available() -> bool:
    try:
        import meridian.mcp.server  # noqa: F401
    except Exception:  # noqa: BLE001 - status should report availability, not fail.
        return False
    return True


def _default_context_out_dir(query: str) -> Path:
    return Path("/private/tmp/meridian-context") / slugify(query)[:80]


def _print_git_auto_commit_result(result: GitAutoCommitResult) -> None:
    if result.status == "committed":
        print(f"Git auto-commit: {result.commit}")
    elif result.status == "skipped_not_git_repo":
        print("Git auto-commit: skipped (not a git repository)")
    elif result.status == "skipped_no_paths":
        print("Git auto-commit: skipped (no eligible ingest artifacts)")
    elif result.status == "skipped_no_changes":
        print("Git auto-commit: skipped (no changes)")
    else:
        print(f"Git auto-commit: failed ({result.message})", file=sys.stderr)


def _print_artifact_group(label: str, artifacts: dict[str, object]) -> None:
    print(f"{label}:")
    if not artifacts:
        print("  - none")
        return
    for key, value in sorted(artifacts.items()):
        if value is None:
            continue
        print(f"  - {key}: {value}")


def _read_manifest(path: Path) -> dict[str, object]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


if __name__ == "__main__":
    raise SystemExit(main())
