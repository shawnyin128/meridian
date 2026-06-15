from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from meridian.setup.clients import ClientInstall, inspect_client_installs
from meridian.setup.runtime import (
    CommandRunner,
    RuntimeCandidate,
    RuntimeResolution,
    default_command_runner,
    resolve_meridian_runtime,
)


@dataclass(frozen=True)
class RepairAction:
    client: str
    target: Path
    command: str
    args: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "client": self.client,
            "target": str(self.target),
            "command": self.command,
            "args": self.args,
        }


@dataclass(frozen=True)
class SetupDoctorReport:
    status: str
    runtime: RuntimeResolution
    clients: list[ClientInstall]
    findings: list[dict[str, str]]
    repair_plan: list[RepairAction]

    def to_dict(self) -> dict[str, object]:
        return {
            "status": self.status,
            "runtime": self.runtime.to_dict(),
            "clients": [client.to_dict() for client in self.clients],
            "findings": self.findings,
            "repair_plan": [action.to_dict() for action in self.repair_plan],
        }


def build_setup_doctor_report(
    *,
    project_root: Path,
    home: Path | None = None,
    clients: list[str] | None = None,
    runner: CommandRunner = default_command_runner,
) -> SetupDoctorReport:
    runtime = resolve_meridian_runtime(runner=runner)
    installs = inspect_client_installs(project_root=project_root, home=home, clients=clients)
    findings: list[dict[str, str]] = []
    repair_plan: list[RepairAction] = []

    for install in installs:
        _add_client_findings(install, runtime=runtime, findings=findings, repair_plan=repair_plan, runner=runner)

    if runtime.selected is None:
        findings.append(
            {
                "severity": "critical",
                "code": "no_valid_meridian_runtime",
                "message": "No Python runtime candidate can import Meridian and run MCP capabilities.",
                "next_action": "Install the Meridian core in a Python environment or set MERIDIAN_PYTHON.",
            }
        )

    status = _status(findings, repair_plan=repair_plan)
    return SetupDoctorReport(
        status=status,
        runtime=runtime,
        clients=installs,
        findings=findings,
        repair_plan=repair_plan,
    )


def format_setup_doctor(report: SetupDoctorReport) -> str:
    selected = report.runtime.selected
    lines = [f"Meridian setup doctor: {report.status}", ""]
    lines.extend(_format_runtime(selected))
    for client in report.clients:
        lines.extend(
            [
                "",
                f"{client.client}:",
                f"- skill cache: {_skill_summary(client)}",
                f"- mcp config: {'found' if client.configured_server else 'missing/invalid'}",
                f"- launcher: {_launcher_summary(client)}",
            ]
        )
    if report.findings:
        lines.extend(["", "Findings:"])
        for finding in report.findings:
            lines.append(f"- {finding['severity']} / {finding['code']}: {finding['message']}")
            if finding.get("next_action"):
                lines.append(f"  Next action: {finding['next_action']}")
    if report.repair_plan:
        first = report.repair_plan[0]
        lines.extend(["", "First repair action:", f"python -m meridian setup repair-mcp --client {first.client} --apply"])
    return "\n".join(lines).rstrip() + "\n"


def _add_client_findings(
    install: ClientInstall,
    *,
    runtime: RuntimeResolution,
    findings: list[dict[str, str]],
    repair_plan: list[RepairAction],
    runner: CommandRunner,
) -> None:
    if install.cache_state == "missing":
        findings.append(
            {
                "severity": "degraded",
                "code": "needs_plugin_install",
                "client": install.client,
                "message": f"{install.client} plugin cache is missing.",
                "next_action": f"Install or reinstall the Meridian plugin for {install.client}.",
            }
        )
        return

    if install.mcp_config_path is None or install.configured_server is None:
        findings.append(
            {
                "severity": "critical",
                "code": "mcp_required_tool_missing",
                "client": install.client,
                "message": f"{install.client} MCP config is missing or invalid.",
                "next_action": f"Repair the Meridian MCP cache for {install.client}.",
            }
        )
        if install.mcp_config_path is not None and runtime.selected is not None:
            repair_command, repair_args = runtime.selected.mcp_server_command()
            repair_plan.append(RepairAction(install.client, install.mcp_config_path, repair_command, repair_args))
            findings.append(
                {
                    "severity": "degraded",
                    "code": "mcp_repair_available",
                    "client": install.client,
                    "message": f"{install.client} MCP cache can be repaired with selected runtime {repair_command}.",
                    "next_action": f"Run python -m meridian setup repair-mcp --client {install.client} --apply.",
                }
            )
        return

    command = str(install.configured_server.get("command", ""))
    args = [str(item) for item in install.configured_server.get("args", [])]
    smoke_argv = _mcp_smoke_argv(command=command, args=args)
    smoke = runner(smoke_argv, 10.0)
    if smoke.returncode != 0:
        findings.append(
            {
                "severity": "critical",
                "code": "skill_visible_but_mcp_unavailable",
                "client": install.client,
                "message": (
                    f"{install.client} MCP cache is readable, but configured launcher "
                    f"failed: {smoke.stderr or smoke.stdout or 'unknown error'}."
                ),
                "next_action": f"Run python -m meridian setup repair-mcp --client {install.client} --apply.",
            }
        )
        if runtime.selected is not None and install.mcp_config_path is not None:
            repair_command, repair_args = runtime.selected.mcp_server_command()
            repair_plan.append(RepairAction(install.client, install.mcp_config_path, repair_command, repair_args))
            findings.append(
                {
                    "severity": "degraded",
                    "code": "mcp_repair_available",
                    "client": install.client,
                    "message": f"{install.client} MCP config can be repaired with selected runtime {repair_command}.",
                    "next_action": f"Run python -m meridian setup repair-mcp --client {install.client} --apply.",
                }
            )


def _status(findings: list[dict[str, str]], repair_plan: list[RepairAction]) -> str:
    codes = {finding["code"] for finding in findings}
    if "no_valid_meridian_runtime" in codes:
        return "blocked"
    repairable_clients = {action.client for action in repair_plan}
    for finding in findings:
        if finding.get("severity") != "critical":
            continue
        if finding["code"] == "mcp_repair_available":
            continue
        if finding["code"] in {"skill_visible_but_mcp_unavailable", "mcp_required_tool_missing"}:
            if finding.get("client") in repairable_clients:
                continue
        return "blocked"
    if "mcp_repair_available" in codes:
        return "repair_available"
    if findings:
        return "degraded"
    return "ready"


def _skill_summary(client: ClientInstall) -> str:
    if all(state == "readable" for state in client.skills.values()):
        return "all_readable"
    return ",".join(f"{name}:{state}" for name, state in sorted(client.skills.items()))


def _launcher_summary(client: ClientInstall) -> str:
    if not client.configured_server:
        return "missing"
    args = [str(item) for item in (client.configured_server.get("args") or [])]
    summary = [str(client.configured_server.get("command", ""))]
    summary.extend(args)
    return " ".join(part.strip() for part in summary if part)


def _format_runtime(selected: RuntimeCandidate | None) -> list[str]:
    lines = ["Runtime:"]
    if selected is None:
        lines.append("- selected: none")
        return lines
    lines.extend(
        [
            f"- selected: {selected.command}",
            f"- selected version: {selected.version}",
            f"- import: {'pass' if selected.import_ok else 'fail'}",
            f"- meridian mcp --help: {'pass' if selected.mcp_help_ok else 'fail'}",
            f"- meridian mcp capabilities: {'pass' if selected.capabilities_ok else 'fail'}",
        ]
    )
    return lines


def _mcp_smoke_argv(*, command: str, args: list[str]) -> list[str]:
    resolved_args = list(args)
    if resolved_args and resolved_args[-1] == "serve":
        resolved_args[-1] = "--help"
    else:
        resolved_args.append("--help")
    return [command, *resolved_args]
