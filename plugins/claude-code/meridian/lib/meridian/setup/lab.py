from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from meridian.lab import (
    initialize_lab_space,
    migrate_coding_style_profile,
    migrate_research_agent_principles,
    validate_coding_style_profile,
    validate_lab_space,
    validate_meridian_agents_contract,
    validate_research_agent_principles,
)


@dataclass(frozen=True)
class LabSetupResult:
    status: str
    lab_root: Path
    config_home: Path | None
    coding_style_profile: Path
    research_agent_principles: Path
    written_paths: list[Path]
    blockers: list[dict[str, str]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "lab_root": str(self.lab_root),
            "config_home": str(self.config_home) if self.config_home is not None else None,
            "coding_style_profile": str(self.coding_style_profile),
            "research_agent_principles": str(self.research_agent_principles),
            "written_paths": [str(path) for path in self.written_paths],
            "blockers": list(self.blockers),
        }


def initialize_lab_readiness(*, lab_root: Path, config_home: Path | None = None) -> LabSetupResult:
    raw_root = lab_root.expanduser().resolve()
    root = raw_root.parent if raw_root.name == ".meridian" else raw_root
    resolved_config_home = config_home.expanduser().resolve() if config_home is not None else None

    coding_style_profile = migrate_coding_style_profile(config_home=resolved_config_home)
    research_agent_principles = migrate_research_agent_principles(config_home=resolved_config_home)
    written_paths = initialize_lab_space(root)

    blockers: list[dict[str, str]] = []
    _collect_profile_blockers(blockers, validate_coding_style_profile(config_home=resolved_config_home))
    _collect_profile_blockers(blockers, validate_research_agent_principles(config_home=resolved_config_home))
    _collect_contract_blockers(blockers, validate_meridian_agents_contract(root))
    _collect_lab_blockers(blockers, validate_lab_space(root))

    status = "ready" if not blockers else "needs_manual_repair"
    return LabSetupResult(
        status=status,
        lab_root=root,
        config_home=resolved_config_home,
        coding_style_profile=coding_style_profile,
        research_agent_principles=research_agent_principles,
        written_paths=written_paths,
        blockers=blockers,
    )


def format_lab_setup_result(result: LabSetupResult) -> str:
    lines = [
        f"Meridian Lab setup: {result.status}",
        "",
        f"- lab root: {result.lab_root}",
        f"- coding-style profile: {result.coding_style_profile}",
        f"- research-agent principles: {result.research_agent_principles}",
    ]
    if result.written_paths:
        lines.append("- files written or refreshed:")
        for path in result.written_paths:
            lines.append(f"  - {path}")
    else:
        lines.append("- files written or refreshed: none")
    if result.blockers:
        lines.append("")
        lines.append("Remaining blockers:")
        for blocker in result.blockers:
            lines.append(
                f"- {blocker['scope']} / {blocker['code']}: {blocker['message']} ({blocker['path']})"
            )
    else:
        lines.append("")
        lines.append("Lab readiness validation passed.")
    return "\n".join(lines).rstrip() + "\n"


def write_lab_setup_json(result: LabSetupResult, path: Path) -> Path:
    target = path.expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


def _collect_profile_blockers(blockers: list[dict[str, str]], report: Any) -> None:
    if report.status == "pass":
        return
    for finding in report.findings:
        if finding.severity == "info":
            continue
        blockers.append(
            {
                "scope": "user_profile",
                "code": finding.code,
                "path": finding.path,
                "message": finding.message,
            }
        )


def _collect_contract_blockers(blockers: list[dict[str, str]], report: Any) -> None:
    if report.status == "pass":
        return
    for finding in report.findings:
        blockers.append(
            {
                "scope": "agents_contract",
                "code": finding.code,
                "path": finding.path,
                "message": finding.message,
            }
        )


def _collect_lab_blockers(blockers: list[dict[str, str]], report: Any) -> None:
    if report.status == "pass":
        return
    for finding in report.findings:
        blockers.append(
            {
                "scope": "lab_state",
                "code": finding.code,
                "path": finding.path,
                "message": finding.message,
            }
        )
