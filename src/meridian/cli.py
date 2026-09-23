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
from meridian.mcp import adapter
from meridian.setup.doctor import build_setup_doctor_report, format_setup_doctor
from meridian.setup.lab import format_lab_setup_result, initialize_lab_readiness, write_lab_setup_json
from meridian.setup.repair import apply_mcp_repair
from meridian.wiki.workspace import default_user_config_path, init_workspace, resolve_workspace, workspace_for_cli
from meridian.workspace_protocol import (
    EVENT_KINDS,
    add_workspace_agent_idea,
    add_workspace_agent_task,
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

    workspace_task_add = workspace_subparsers.add_parser(
        "task-add",
        help="Add a concrete next step agreed with the user to the Meridian App's project plan.",
    )
    workspace_task_add.add_argument("--root", type=Path, default=Path.cwd(), help="Repository or .meridian root.")
    workspace_task_add.add_argument("--id", required=True, help="Stable task identifier.")
    workspace_task_add.add_argument("--title", required=True, help="The step in one line.")
    workspace_task_add.add_argument("--note", default=None, help="Optional Markdown note.")
    workspace_task_add.add_argument("--date", default=None, help="Planned date in YYYY-MM-DD; defaults to today.")
    workspace_task_add.add_argument("--json-out", type=Path, default=None, help="Optional write result JSON path.")

    wiki = subparsers.add_parser("wiki", help="Paper Wiki workflows")
    wiki_subparsers = wiki.add_subparsers(dest="command", required=True)

    init = wiki_subparsers.add_parser(
        "init",
        help="Register a Paper Wiki library root (the Meridian App owns the wiki content itself).",
    )
    init.add_argument("--library-root", type=Path, required=True, help="Paper Wiki library root containing sources/ and wiki/.")
    init.add_argument(
        "--source-root",
        type=Path,
        default=None,
        help="Managed source root. Defaults to <library-root>/sources.",
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

    status = wiki_subparsers.add_parser(
        "status",
        help="Show the active Paper Wiki workspace and core execution status.",
    )
    status.add_argument("--wiki-root", type=Path, default=None, help="Optional canonical wiki root.")
    status.add_argument("--library-root", type=Path, default=None, help="Optional Paper Wiki library root.")
    status.add_argument("--json-out", type=Path, default=None, help="Optional machine-readable status path.")

    propose = wiki_subparsers.add_parser(
        "propose",
        help="Submit a claim-only Wiki proposal (addClaim/reviseClaim/addEvidence/markConflict/resolveConflict/retractClaim) for App review.",
    )
    propose.add_argument("ops", type=Path, help="Path to a JSON file holding the claim ops array.")
    propose.add_argument("--wiki-root", type=Path, default=None, help="Canonical wiki root.")
    propose.add_argument("--library-root", type=Path, default=None, help="Optional Paper Wiki library root.")
    propose.add_argument("--title", required=True, help="One sentence for the review list.")
    propose.add_argument("--project", required=True, help="The project id the conclusion came from.")
    propose.add_argument("--node", default=None, help="Optional project node id.")
    propose.add_argument("--rationale", default=None, help="Optional rationale.")
    propose.add_argument("--json-out", type=Path, default=None, help="Optional result JSON path.")

    proposal_status = wiki_subparsers.add_parser(
        "proposal-status",
        help="Check a submitted Wiki proposal's review status, or list recent proposals.",
    )
    proposal_status.add_argument("--wiki-root", type=Path, default=None, help="Canonical wiki root.")
    proposal_status.add_argument("--library-root", type=Path, default=None, help="Optional Paper Wiki library root.")
    proposal_status.add_argument("--key", default=None, help="The key returned by `wiki propose`.")
    proposal_status.add_argument("--limit", type=int, default=10, help="Recent proposals to list when --key is omitted.")
    proposal_status.add_argument("--json-out", type=Path, default=None, help="Optional result JSON path.")

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

        if args.product == "workspace" and args.command == "task-add":
            json_out = _preflight_json_out(args.json_out)
            if args.json_out and json_out is None:
                return 1
            result = add_workspace_agent_task(
                args.root, task_id=args.id, title=args.title, note=args.note, task_date=args.date,
            )
            if json_out:
                target = _write_json_payload(json_out, result)
                print(f"Wrote workspace task result JSON: {target}")
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
            result = init_workspace(
                library_root=args.library_root,
                source_root=args.source_root,
                set_default=not args.no_set_default,
                overwrite=args.overwrite_workspace_config,
            )
            print(f"Registered Paper Wiki workspace: {result.workspace.library_root}")
            print(f"Managed source root: {result.workspace.source_root}")
            print(f"Canonical wiki root: {result.workspace.wiki_root}")
            print(f"Workspace config: {result.workspace.config_path}")
            if result.user_config_path:
                print(f"User config: {result.user_config_path}")
            print(f"Created directories: {len(result.created_dirs)}")
            print(f"Created files: {len(result.created_files)}")
            print("Note: the Meridian App creates and owns wiki/ content itself; this only registers the library root.")
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
                print("Register one with: meridian wiki init --library-root <paper-wiki-library-root>")
            print(f"Core module path: {payload['core_module_path']}")
            print(f"Core package root: {payload['core_package_root']}")
            print(f"meridian on PATH: {payload['meridian_on_path']}")
            print(f"MCP available: {payload['mcp_available']}")
            return 0

        if args.product == "wiki" and args.command == "propose":
            workspace = workspace_for_cli(library_root=args.library_root, wiki_root=args.wiki_root)
            ops = json.loads(args.ops.read_text(encoding="utf-8"))
            result = adapter.wiki_propose(
                wiki_root=workspace.wiki_root,
                ops=ops,
                title=args.title,
                trigger={"project": args.project, "node": args.node},
                rationale=args.rationale,
            )
            if args.json_out:
                target = _write_json_payload(args.json_out, result)
                print(f"Wrote proposal result JSON: {target}")
            print(f"Proposal status: {result['status']}")
            print(f"Key: {result['key']}")
            print(f"Wrote inbox file: {result['path']}")
            return 0

        if args.product == "wiki" and args.command == "proposal-status":
            workspace = workspace_for_cli(library_root=args.library_root, wiki_root=args.wiki_root)
            result = adapter.wiki_proposal_status(wiki_root=workspace.wiki_root, key=args.key, limit=args.limit)
            if args.json_out:
                target = _write_json_payload(args.json_out, result)
                print(f"Wrote proposal status JSON: {target}")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0

    except Exception as exc:  # noqa: BLE001 - CLI should render concise failures.
        payload = adapter.call_chain_error_payload(exc)
        if payload.get("error_code") in {"needs_init", "workspace_index_write_failed", "invalid_proposal"}:
            print(adapter.format_call_chain_error(exc), file=sys.stderr)
        else:
            print(f"error: {exc}", file=sys.stderr)
        return 1

    parser.error("unknown command")
    return 2


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
