from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from meridian.wiki.commands import (
    calibrate_eval,
    catalog_wiki,
    add_insight_wiki,
    converge_run,
    converge_eval,
    create_judge_packet,
    create_reader_check_packet,
    eval_cases,
    ingest_pdf,
    init_wiki,
    insight_lint_wiki,
    lint_wiki_command,
    publish_run,
    publish_proposal_wiki,
    publish_insight_wiki,
    quality_check_run,
    proposal_lint_wiki,
    propose_writeback_wiki,
    record_judge,
    record_review,
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
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="meridian")
    subparsers = parser.add_subparsers(dest="product", required=True)

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
        required=True,
        help="Draft output directory, e.g. wiki/.drafts/ingests/<paper-slug>/.",
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
        help="Optional wiki root for canonical draft publish, e.g. wiki/.",
    )
    ingest.add_argument(
        "--publish-mode",
        choices=["never", "auto", "always"],
        default="never",
        help=(
            "Canonical draft publish policy. 'never' only writes draft artifacts; "
            "'auto' publishes when the quality gate does not fail; 'always' publishes "
            "a canonical draft even when it needs review."
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

    init = wiki_subparsers.add_parser(
        "init",
        help="Initialize an Obsidian-compatible Paper Wiki vault.",
    )
    init.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
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
    flow.add_argument("--out", type=Path, required=True, help="Flow output directory.")
    flow.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    flow.add_argument("--rubric", type=Path, required=True, help="LLM-as-Judge rubric markdown.")
    flow.add_argument("--title", default=None, help="Optional paper title override.")
    flow.add_argument("--overwrite", action="store_true", help="Overwrite existing flow output.")
    flow.add_argument(
        "--publish-mode",
        choices=["auto", "always"],
        default="auto",
        help="Canonical draft publish policy for the flow.",
    )
    flow.add_argument("--case", type=Path, default=None, help="Optional evaluation case file.")
    flow.add_argument(
        "--judge-result",
        type=Path,
        default=None,
        help="Optional LLM-as-Judge JSON result to record and converge immediately.",
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
        choices=["never", "auto", "always"],
        default="never",
        help="Per-case canonical draft publish policy inside each eval output directory.",
    )
    eval_cmd.add_argument(
        "--mode",
        choices=["ingest", "flow"],
        default="ingest",
        help=(
            "Evaluation execution mode. 'ingest' writes per-case draft artifacts; "
            "'flow' also publishes draft wiki pages and creates judge packets."
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
        help="Build machine-readable paper and synthesis catalogs for canonical wiki pages.",
    )
    catalog.add_argument("--wiki-root", type=Path, required=True, help="Canonical wiki root.")
    catalog.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output paper JSONL catalog path. Defaults to <wiki-root>/.index/papers.jsonl.",
    )

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
    args = parser.parse_args(argv)

    try:
        if args.product == "wiki" and args.command == "init":
            result = init_wiki(wiki_root=args.wiki_root, overwrite_templates=args.overwrite_templates)
            print(f"Initialized wiki vault: {result.wiki_root}")
            print(f"Created directories: {len(result.created_dirs)}")
            print(f"Created files: {len(result.created_files)}")
            return 0

        if args.product == "wiki" and args.command == "ingest":
            result = ingest_pdf(
                pdf_path=args.pdf,
                out_dir=args.out,
                title_override=args.title,
                overwrite=args.overwrite,
                wiki_root=args.wiki_root,
                publish_mode=args.publish_mode,
                render_page_images=not args.no_page_images,
            )
            _print_ingest_summary(result.run_path, verbose_artifacts=args.verbose_artifacts)
            return 0

        if args.product == "wiki" and args.command == "flow":
            result = run_flow(
                pdf_path=args.pdf,
                out_dir=args.out,
                wiki_root=args.wiki_root,
                rubric_path=args.rubric,
                title_override=args.title,
                overwrite=args.overwrite,
                publish_mode=args.publish_mode,
                case_path=args.case,
                judge_result_path=args.judge_result,
                render_page_images=not args.no_page_images,
            )
            _print_flow_summary(
                flow_path=result.flow_path,
                run_path=result.run_path,
                verbose_artifacts=args.verbose_artifacts,
            )
            print(f"Flow status: {result.status}")
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
            print(f"Catalog entries: {result.count}")
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
            print(f"Published user insight to: {result.page_path}")
            print(f"Updated paper catalog: {result.catalog_path}")
            print(f"Insight lint report: {result.lint_report_path}")
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
        print(f"error: {exc}", file=sys.stderr)
        return 1

    parser.error("unknown command")
    return 2


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
