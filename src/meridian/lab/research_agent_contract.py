from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION = "meridian.research_agent_principles.v1"
RESEARCH_AGENT_PRINCIPLES_FILENAME = "research-agent-principles.md"


@dataclass(frozen=True)
class ResearchAgentContractFinding:
    severity: str
    code: str
    path: str
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "code": self.code,
            "path": self.path,
            "message": self.message,
        }


@dataclass(frozen=True)
class ResearchAgentContractReport:
    status: str
    path: str
    findings: list[ResearchAgentContractFinding]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "path": self.path,
            "findings": [finding.to_dict() for finding in self.findings],
        }


def research_agent_config_home(config_home: Path | None = None) -> Path:
    if config_home is not None:
        return config_home.expanduser().resolve()
    env_home = os.environ.get("MERIDIAN_CONFIG_HOME")
    if env_home:
        return Path(env_home).expanduser().resolve()
    return Path.home().expanduser().resolve() / ".meridian"


def research_agent_principles_path(*, config_home: Path | None = None) -> Path:
    return research_agent_config_home(config_home) / RESEARCH_AGENT_PRINCIPLES_FILENAME


def initialize_research_agent_principles(
    *,
    config_home: Path | None = None,
    path: Path | None = None,
    overwrite: bool = False,
) -> Path:
    target = (path or research_agent_principles_path(config_home=config_home)).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and not overwrite:
        return target
    target.write_text(_starter_principles(), encoding="utf-8")
    return target


def migrate_research_agent_principles(
    *,
    config_home: Path | None = None,
    path: Path | None = None,
) -> Path:
    target = (path or research_agent_principles_path(config_home=config_home)).expanduser().resolve()
    if not target.exists():
        return initialize_research_agent_principles(config_home=config_home, path=target)

    text = target.read_text(encoding="utf-8")
    changed = False
    prefix: list[str] = []
    suffix: list[str] = []
    if f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}" not in text:
        prefix.extend(
            [
                f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}",
                f"updated: {date.today().isoformat()}",
                "",
            ]
        )
        changed = True
    if "## Research Code Style" not in text:
        suffix.extend(["", "## Research Code Style", "", *_research_code_style_lines()])
        changed = True
    if "## Implementation Integrity" not in text:
        suffix.extend(["", "## Implementation Integrity", "", *_implementation_integrity_lines()])
        changed = True
    if "## Validation Expectations" not in text:
        suffix.extend(["", "## Validation Expectations", "", *_validation_expectation_lines()])
        changed = True
    if changed:
        target.write_text(
            "\n".join(prefix) + text.rstrip() + "\n" + "\n".join(suffix).rstrip() + "\n",
            encoding="utf-8",
        )
    return target


def validate_research_agent_principles(
    path: Path | None = None,
    *,
    config_home: Path | None = None,
) -> ResearchAgentContractReport:
    target = (path or research_agent_principles_path(config_home=config_home)).expanduser().resolve()
    findings: list[ResearchAgentContractFinding] = []

    def add(severity: str, code: str, message: str) -> None:
        findings.append(ResearchAgentContractFinding(severity, code, str(target), message))

    if not target.exists():
        add("info", "research_agent_principles_missing", "Meridian research-agent principles file is missing.")
        return ResearchAgentContractReport(status="missing", path=str(target), findings=findings)

    text = target.read_text(encoding="utf-8")
    if f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}" not in text:
        add("warning", "research_agent_principles_schema_missing", "Principles schema version is missing or stale.")
    if "## Research Code Style" not in text:
        add("warning", "research_agent_principles_style_missing", "Principles are missing Research Code Style.")
    if "Prefer linear, readable code" not in text:
        add("warning", "research_agent_principles_linear_style_missing", "No linear readable-code principle found.")
    if "## Implementation Integrity" not in text:
        add("warning", "research_agent_principles_integrity_missing", "Principles are missing Implementation Integrity.")
    if "Do not silently substitute" not in text:
        add("warning", "research_agent_principles_fallback_policy_missing", "No silent-substitution policy found.")
    if "## Validation Expectations" not in text:
        add("warning", "research_agent_principles_validation_missing", "Principles are missing Validation Expectations.")
    if "```" in text:
        add("warning", "research_agent_principles_contains_code_block", "Principles should not store full code blocks.")

    status = "pass" if not findings else "warn"
    return ResearchAgentContractReport(status=status, path=str(target), findings=findings)


def _starter_principles() -> str:
    today = date.today().isoformat()
    lines = [
        "# Meridian Research Agent Principles",
        "",
        f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}",
        f"updated: {today}",
        "",
        "This user-level file is the detailed contract for research-development agents.",
        "Keep durable short preferences in `coding-style.md`; keep the full behavioral contract here.",
        "",
        "## Research Code Style",
        "",
        *_research_code_style_lines(),
        "",
        "## Implementation Integrity",
        "",
        *_implementation_integrity_lines(),
        "",
        "## Validation Expectations",
        "",
        *_validation_expectation_lines(),
    ]
    return "\n".join(lines).rstrip() + "\n"


def _research_code_style_lines() -> list[str]:
    return [
        "- Prefer linear, readable code for exploratory research slices.",
        "- Keep the main experimental or analytical flow easy to scan top to bottom.",
        "- Keep data sources, branch choices, seeds, splits, metrics, sample limits, output paths, and result identity visible near the code that uses them.",
        "- Avoid single-use parser, loader, selector, adapter, wrapper, and registry layers when they hide experimental decisions.",
        "- Use helper functions only for real reuse, risky boundary isolation, or stable external API boundaries.",
        "- Comments should explain research intent, non-obvious choices, data quirks, validity limits, and interpretation.",
    ]


def _implementation_integrity_lines() -> list[str]:
    return [
        "- Implement the requested current behavior, not an older API or older layout.",
        "- Do not silently substitute legacy behavior, fallback-only behavior, stubs, no-ops, task-marker comments, swallowed errors, or partial branches for the requested implementation.",
        "- If the requested implementation is blocked, stop and report the blocker, evidence checked, and options.",
        "- Do not decide unilaterally that the first version does not need a requested current-version path.",
        "- Fallback code is acceptable only when the primary path exists, is validated, and the fallback is explicit, or when the user explicitly approves fallback scope.",
    ]


def _validation_expectation_lines() -> list[str]:
    return [
        "- Tests must prove the primary requested path, not only the fallback path.",
        "- When a current API, data layout, or benchmark contract matters, validation must name that current contract.",
        "- If evidence is insufficient, report uncertainty instead of presenting completion.",
    ]
