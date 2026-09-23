from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

from meridian import __version__
from meridian.framework_check import run_framework_check, write_framework_json, write_framework_report
from meridian.lab import apply_lab_update, check_lab_graph, materialize_lab_graph, write_lab_graph
from meridian.lab.focus_hook import parse_hook_payload, run_lab_focus_hook
from meridian.setup.doctor import build_setup_doctor_report, format_setup_doctor
from meridian.setup.lab import format_lab_setup_result, initialize_lab_readiness, write_lab_setup_json
from meridian.setup.repair import apply_mcp_repair
from meridian.wiki.commands import (
    add_insight_wiki,
    catalog_wiki,
    health_wiki,
    ingest_pdf,
    init_wiki,
    init_wiki_workspace,
    insight_lint_wiki,
    proposal_lint_wiki,
    publish_insight_wiki,
    publish_proposal_wiki,
    propose_writeback_wiki,
    retrieve_wiki,
    run_flow,
)
from meridian.wiki.context_paths import default_context_out_dir
from meridian.wiki.git_auto_commit import GitAutoCommitResult, auto_commit_paths, git_dirty_paths
from meridian.wiki.health_server import serve_health_ui
from meridian.wiki.vault import slugify
from meridian.wiki.workspace import default_user_config_path, resolve_workspace, workspace_for_cli
from meridian.workspace_protocol import (
    EVENT_KINDS,
    add_workspace_agent_idea,
    add_workspace_event,
    inspect_project_workspace,
    read_project_plan,
)


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
    framework_check.add_argument(
        "--include-mcp-runtime",
        action="store_true",
        help="Include setup doctor MCP runtime findings as an optional framework-check category.",
    )
    framework_check.add_argument("--json-out", type=Path, default=None, help="Optional machine-readable report path.")
    framework_check.add_argument("--report", type=Path, default=None, help="Optional Markdown report path.")

    setup = subparsers.add_parser("setup", help="Meridian setup diagnostics and repair")
    setup_subparsers = setup.add_subparsers(dest="command", required=True)

    setup_doctor = setup_subparsers.add_parser(
        "doctor",
        help="Diagnose Meridian runtime, plugin, and MCP readiness.",
    )
    setup_doctor.add_argument("--client", choices=["codex", "claude", "all"], default="all")
    setup_doctor.add_argument("--project-root", type=Path, default=Path.cwd())
    setup_doctor.add_argument("--json-out", type=Path, default=None)

    setup_repair = setup_subparsers.add_parser(
        "repair-mcp",
        help="Repair installed Meridian MCP client cache config.",
    )
    setup_repair.add_argument("--client", choices=["codex", "claude"], required=True)
    setup_repair.add_argument("--project-root", type=Path, default=Path.cwd())
    setup_repair.add_argument("--apply", action="store_true")
    setup_repair.add_argument("--json-out", type=Path, default=None)

    setup_init_lab = setup_subparsers.add_parser(
        "init-lab",
        help="Initialize or migrate Lab readiness for a target research repo.",
    )
    setup_init_lab.add_argument(
        "--lab-root",
        type=Path,
        required=True,
        help="Target research repo root or .meridian directory to initialize for Lab.",
    )
    setup_init_lab.add_argument(
        "--config-home",
        type=Path,
        default=None,
        help="Optional Meridian user config home. Defaults to MERIDIAN_CONFIG_HOME or ~/.meridian.",
    )
    setup_init_lab.add_argument("--json-out", type=Path, default=None, help="Optional machine-readable result path.")

    lab = subparsers.add_parser("lab", help="Meridian Lab graph workflows")
    lab_subparsers = lab.add_subparsers(dest="command", required=True)

    lab_graph_refresh = lab_subparsers.add_parser(
        "graph-refresh",
        help="Regenerate Lab graph JSON and health artifacts.",
    )
    lab_graph_refresh.add_argument(
        "--lab-root",
        type=Path,
        required=True,
        help="Target research repo root or .meridian directory.",
    )
    lab_graph_refresh.add_argument("--json-out", type=Path, default=None, help="Optional graph JSON copy path.")

    lab_graph_check = lab_subparsers.add_parser(
        "graph-check",
        help="Check generated Lab graph health against Markdown state.",
    )
    lab_graph_check.add_argument(
        "--lab-root",
        type=Path,
        required=True,
        help="Target research repo root or .meridian directory.",
    )
    lab_graph_check.add_argument("--json-out", type=Path, default=None, help="Optional graph health report path.")

    lab_apply_update = lab_subparsers.add_parser(
        "apply-update",
        help="Apply a Lab update packet from JSON.",
    )
    lab_apply_update.add_argument("packet", type=Path, help="Path to a Lab update packet JSON file.")
    lab_apply_update.add_argument(
        "--lab-root",
        type=Path,
        required=True,
        help="Target research repo root or .meridian directory.",
    )
    lab_apply_update.add_argument("--json-out", type=Path, default=None, help="Optional apply result JSON path.")

    lab_export_graph = lab_subparsers.add_parser(
        "export-graph",
        help="Materialize Lab graph JSON to an explicit output path.",
    )
    lab_export_graph.add_argument(
        "--lab-root",
        type=Path,
        required=True,
        help="Target research repo root or .meridian directory.",
    )
    lab_export_graph.add_argument("--json-out", type=Path, required=True, help="Required graph JSON output path.")

    lab_focus = lab_subparsers.add_parser(
        "focus",
        help="Print compact Lab Focus context (active nodes) for hook integrations.",
    )
    lab_focus.add_argument(
        "--hook",
        action="store_true",
        help="Read a Claude Code hook JSON payload (with `cwd`) from stdin and print the Focus report.",
    )

    workspace = subparsers.add_parser("workspace", help="Shared App and repository workspace protocol")
    workspace_subparsers = workspace.add_subparsers(dest="command", required=True)

    workspace_status = workspace_subparsers.add_parser(
        "status",
        help="Validate and summarize the shared workspace surfaces.",
    )
    workspace_status.add_argument("--root", type=Path, default=Path.cwd(), help="Repository or .meridian root.")
    workspace_status.add_argument("--json-out", type=Path, default=None, help="Optional status JSON path.")

    workspace_plan = workspace_subparsers.add_parser(
        "plan",
        help="Read the App-owned project plan as JSON.",
    )
    workspace_plan.add_argument("--root", type=Path, default=Path.cwd(), help="Repository or .meridian root.")
    workspace_plan.add_argument("--json-out", type=Path, default=None, help="Optional plan JSON path.")

    workspace_event_add = workspace_subparsers.add_parser(
        "event-add",
        help="Append a source-backed event to the repository-owned event projection.",
    )
    workspace_event_add.add_argument("--root", type=Path, default=Path.cwd(), help="Repository or .meridian root.")
    workspace_event_add.add_argument("--id", required=True, help="Stable event identifier.")
    workspace_event_add.add_argument("--text", required=True, help="One-line title: the conclusion.")
    workspace_event_add.add_argument(
        "--kind", required=True, choices=sorted(EVENT_KINDS), help="Research record type."
    )
    workspace_event_add.add_argument("--detail", default=None, help="Optional key numbers or parameters.")
    workspace_event_add.add_argument("--source", required=True, help="Existing evidence file relative to the repository.")
    workspace_event_add.add_argument("--date", default=None, help="Event date in YYYY-MM-DD; defaults to today.")
    workspace_event_add.add_argument("--node", default=None, help="Optional Lab graph node id.")
    workspace_event_add.add_argument("--json-out", type=Path, default=None, help="Optional write result JSON path.")

    workspace_idea_add = workspace_subparsers.add_parser(
        "idea-add",
        help="Record a research idea found while working, for the Meridian App's idea list.",
    )
    workspace_idea_add.add_argument("--root", type=Path, default=Path.cwd(), help="Repository or .meridian root.")
    workspace_idea_add.add_argument("--id", required=True, help="Stable idea identifier.")
    workspace_idea_add.add_argument("--title", required=True, help="The idea in one line.")
    workspace_idea_add.add_argument("--body", required=True, help="The mechanism, hypothesis or direction.")
    workspace_idea_add.add_argument("--context", default=None, help="What the work was about when it came up.")
    workspace_idea_add.add_argument("--date", default=None, help="Idea date in YYYY-MM-DD; defaults to today.")
    workspace_idea_add.add_argument("--node", default=None, help="Optional Lab graph node id.")
    workspace_idea_add.add_argument("--json-out", type=Path, default=None, help="Optional write result JSON path.")

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
                include_mcp_runtime=args.include_mcp_runtime,
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

        if args.product == "setup" and args.command == "doctor":
            clients = None if args.client == "all" else [args.client]
            report = build_setup_doctor_report(project_root=args.project_root, clients=clients)
            print(format_setup_doctor(report), end="")
            if args.json_out:
                args.json_out.parent.mkdir(parents=True, exist_ok=True)
                args.json_out.write_text(json.dumps(report.to_dict(), indent=2) + "\n", encoding="utf-8")
                print(f"Wrote setup doctor JSON: {args.json_out}")
            return 0 if report.status in {"ready", "degraded", "repair_available"} else 1

        if args.product == "setup" and args.command == "repair-mcp":
            report = build_setup_doctor_report(project_root=args.project_root, clients=[args.client])
            if not report.repair_plan:
                print("No MCP repair is available.")
                print(format_setup_doctor(report), end="")
                return 1
            action = report.repair_plan[0]
            if not args.apply:
                print("Planned repair:")
                print(f"- write: {action.target}")
                print(f"- command: {action.command}")
                print(f"- args: {' '.join(action.args)}")
                print("")
                print("No files changed. Re-run with --apply.")
                return 0
            result = apply_mcp_repair(
                client=action.client,
                mcp_config_path=action.target,
                command=action.command,
                args=action.args,
            )
            if args.json_out:
                args.json_out.parent.mkdir(parents=True, exist_ok=True)
                args.json_out.write_text(json.dumps(result.to_dict(), indent=2) + "\n", encoding="utf-8")
                print(f"Wrote setup repair JSON: {args.json_out}")
            print("Applied repair:")
            print(f"- backup written: {result.backup_path}")
            print("- MCP config updated")
            print("- restart required: yes")
            return 0

        if args.product == "setup" and args.command == "init-lab":
            result = initialize_lab_readiness(lab_root=args.lab_root, config_home=args.config_home)
            print(format_lab_setup_result(result), end="")
            if args.json_out:
                write_lab_setup_json(result, args.json_out)
                print(f"Wrote Lab setup JSON: {args.json_out}")
            return 0 if result.status == "ready" else 1

        if args.product == "lab" and args.command == "graph-refresh":
            json_out = _preflight_json_out(args.json_out)
            if args.json_out and json_out is None:
                return 1
            result = write_lab_graph(args.lab_root)
            graph_path = result.lab_root / "graph" / "graph.json"
            if json_out:
                target = _write_json_payload(json_out, result.graph)
                print(f"Wrote Lab graph JSON copy: {target}")
            print(f"Lab graph refresh: {result.health['status']}")
            print(f"Wrote Lab graph JSON: {graph_path}")
            print(f"Findings: {len(result.health['findings'])}")
            return 0 if result.health.get("status") == "pass" else 1

        if args.product == "lab" and args.command == "graph-check":
            health = check_lab_graph(args.lab_root)
            if args.json_out:
                target = _write_json_payload(args.json_out, health)
                print(f"Wrote Lab graph health JSON: {target}")
            print(f"Lab graph check: {health['status']}")
            print(f"Findings: {len(health['findings'])}")
            return 0 if health.get("status") == "pass" else 1

        if args.product == "lab" and args.command == "apply-update":
            json_out = _preflight_json_out(args.json_out)
            if args.json_out and json_out is None:
                return 1
            packet = _read_manifest(args.packet)
            result = apply_lab_update(args.lab_root, packet)
            if json_out:
                target = _write_json_payload(json_out, result)
                print(f"Wrote Lab update result JSON: {target}")
            print(f"Lab update: {result['status']}")
            validation = result.get("validation")
            if isinstance(validation, dict):
                print(f"Validation: {validation.get('status', 'unknown')}")
            print(f"Written paths: {len(result.get('written_paths', []))}")
            return 0 if result.get("status") == "applied" else 1

        if args.product == "lab" and args.command == "export-graph":
            result = materialize_lab_graph(args.lab_root)
            target = _write_json_payload(args.json_out, result.graph)
            print(f"Lab graph export: {result.health['status']}")
            print(f"Wrote Lab graph JSON: {target}")
            print(f"Findings: {len(result.health['findings'])}")
            return 0 if result.health.get("status") == "pass" else 1

        if args.product == "lab" and args.command == "focus":
            # Claude Code exchanges hook JSON and context as UTF-8, whatever the console code page.
            payload = parse_hook_payload(sys.stdin.buffer.read().decode("utf-8")) if args.hook else {}
            report = run_lab_focus_hook(payload)
            if report:
                sys.stdout.flush()
                sys.stdout.buffer.write(f"{report}\n".encode("utf-8"))
                sys.stdout.buffer.flush()
            return 0

        if args.product == "workspace" and args.command == "status":
            result = inspect_project_workspace(args.root)
            if args.json_out:
                target = _write_json_payload(args.json_out, result)
                print(f"Wrote workspace status JSON: {target}")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0 if result["status"] in {"ready", "degraded"} else 1

        if args.product == "workspace" and args.command == "plan":
            result = read_project_plan(args.root)
            if args.json_out:
                target = _write_json_payload(args.json_out, result)
                print(f"Wrote project plan JSON: {target}")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0

        if args.product == "workspace" and args.command == "event-add":
            json_out = _preflight_json_out(args.json_out)
            if args.json_out and json_out is None:
                return 1
            result = add_workspace_event(
                args.root,
                event_id=args.id,
                text=args.text,
                source=args.source,
                event_date=args.date,
                node=args.node,
                kind=args.kind,
                detail=args.detail,
            )
            if json_out:
                target = _write_json_payload(json_out, result)
                print(f"Wrote workspace event result JSON: {target}")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0

        if args.product == "workspace" and args.command == "idea-add":
            json_out = _preflight_json_out(args.json_out)
            if args.json_out and json_out is None:
                return 1
            result = add_workspace_agent_idea(
                args.root,
                idea_id=args.id,
                title=args.title,
                body=args.body,
                context=args.context,
                idea_date=args.date,
                node=args.node,
            )
            if json_out:
                target = _write_json_payload(json_out, result)
                print(f"Wrote workspace idea result JSON: {target}")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0

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
    return default_context_out_dir(query)


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


def _preflight_json_out(path: Path | None) -> Path | None:
    if path is None:
        return None
    target = path.expanduser().resolve()
    if target.exists() and target.is_dir():
        print(f"error: --json-out points to a directory: {target}", file=sys.stderr)
        return None
    parent = target.parent
    if parent.exists() and not parent.is_dir():
        print(f"error: --json-out parent is not a directory: {parent}", file=sys.stderr)
        return None
    try:
        parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        print(f"error: could not prepare --json-out parent {parent}: {exc}", file=sys.stderr)
        return None
    if target.exists() and not target.is_file():
        print(f"error: --json-out target is not a regular file: {target}", file=sys.stderr)
        return None
    return target


def _write_json_payload(path: Path, payload: object) -> Path:
    target = path.expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


def _read_manifest(path: Path) -> dict[str, object]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


if __name__ == "__main__":
    raise SystemExit(main())
