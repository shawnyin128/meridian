from __future__ import annotations

import argparse
import sys
from pathlib import Path

from meridian.wiki.commands import (
    calibrate_eval,
    converge_run,
    converge_eval,
    create_judge_packet,
    eval_cases,
    ingest_pdf,
    record_judge,
    record_review,
    run_flow,
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

    converge = wiki_subparsers.add_parser(
        "converge",
        help="Converge a wiki ingest run from quality gate and recorded judge result.",
    )
    converge.add_argument("run_manifest", type=Path, help="Path to run.json.")
    converge.add_argument("--out", type=Path, default=None, help="Optional convergence record path.")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.product == "wiki" and args.command == "ingest":
            result = ingest_pdf(
                pdf_path=args.pdf,
                out_dir=args.out,
                title_override=args.title,
                overwrite=args.overwrite,
                wiki_root=args.wiki_root,
                publish_mode=args.publish_mode,
            )
            print(f"Wrote draft review packet: {result.review_path}")
            print(f"Wrote draft paper page: {result.paper_path}")
            print(f"Wrote candidate claims: {result.claims_path}")
            print(f"Wrote candidate methods: {result.methods_path}")
            print(f"Wrote candidate evidence: {result.evidence_path}")
            if result.canonical_paper_path is not None:
                print(f"Published canonical draft paper page: {result.canonical_paper_path}")
                print(f"Updated wiki index: {result.index_path}")
                print(f"Updated wiki log: {result.log_path}")
            print(f"Wrote run manifest: {result.run_path}")
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
            )
            print(f"Wrote flow manifest: {result.flow_path}")
            print(f"Wrote run manifest: {result.run_path}")
            print(f"Wrote judge packet: {result.judge_packet_path}")
            if result.convergence_path is not None:
                print(f"Wrote convergence record: {result.convergence_path}")
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

        if args.product == "wiki" and args.command == "converge":
            result = converge_run(run_manifest=args.run_manifest, out_path=args.out)
            print(f"Wrote convergence record: {result.convergence_path}")
            print(f"Convergence status: {result.status}")
            return 0

    except Exception as exc:  # noqa: BLE001 - CLI should render concise failures.
        print(f"error: {exc}", file=sys.stderr)
        return 1

    parser.error("unknown command")
    return 2
