from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


CODING_STYLE_PROFILE_SCHEMA_VERSION = "meridian.coding_style_profile.v1"
CODING_STYLE_PROFILE_FILENAME = "coding-style.md"


@dataclass(frozen=True)
class CodingStyleFeedbackDecision:
    outcome: str
    scopes: list[str]
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "outcome": self.outcome,
            "scopes": list(self.scopes),
            "reason": self.reason,
        }


@dataclass(frozen=True)
class CodingStyleProfileFinding:
    severity: str
    code: str
    path: str
    message: str


@dataclass(frozen=True)
class CodingStyleProfileReport:
    status: str
    path: str
    findings: list[CodingStyleProfileFinding]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "path": self.path,
            "findings": [
                {
                    "severity": finding.severity,
                    "code": finding.code,
                    "path": finding.path,
                    "message": finding.message,
                }
                for finding in self.findings
            ],
        }


def coding_style_config_home(config_home: Path | None = None) -> Path:
    if config_home is not None:
        return config_home.expanduser().resolve()
    env_home = os.environ.get("MERIDIAN_CONFIG_HOME")
    if env_home:
        return Path(env_home).expanduser().resolve()
    return Path.home().expanduser().resolve() / ".meridian"


def coding_style_profile_path(*, config_home: Path | None = None) -> Path:
    return coding_style_config_home(config_home) / CODING_STYLE_PROFILE_FILENAME


def initialize_coding_style_profile(
    *,
    config_home: Path | None = None,
    path: Path | None = None,
    overwrite: bool = False,
) -> Path:
    target = (path or coding_style_profile_path(config_home=config_home)).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and not overwrite:
        return target
    target.write_text(_starter_profile(), encoding="utf-8")
    return target


def migrate_coding_style_profile(
    *,
    config_home: Path | None = None,
    path: Path | None = None,
) -> Path:
    target = (path or coding_style_profile_path(config_home=config_home)).expanduser().resolve()
    if not target.exists():
        return initialize_coding_style_profile(config_home=config_home, path=target)

    text = target.read_text(encoding="utf-8")
    changed = False
    prefix: list[str] = []
    suffix: list[str] = []
    if f"schema_version: {CODING_STYLE_PROFILE_SCHEMA_VERSION}" not in text:
        prefix.extend(
            [
                f"schema_version: {CODING_STYLE_PROFILE_SCHEMA_VERSION}",
                f"updated: {date.today().isoformat()}",
                "",
            ]
        )
        changed = True
    if "## Principles" not in text:
        suffix.extend(
            [
                "",
                "## Principles",
                "",
                "Add confirmed user-level preferences here.",
            ]
        )
        changed = True
    if "## Pending Review" not in text:
        suffix.extend(
            [
                "",
                "## Pending Review",
                "",
                "Use this section for ambiguous coding-style feedback that needs user confirmation.",
            ]
        )
        changed = True
    if changed:
        target.write_text("\n".join(prefix) + text.rstrip() + "\n" + "\n".join(suffix).rstrip() + "\n", encoding="utf-8")
    return target


def validate_coding_style_profile(path: Path | None = None, *, config_home: Path | None = None) -> CodingStyleProfileReport:
    target = (path or coding_style_profile_path(config_home=config_home)).expanduser().resolve()
    findings: list[CodingStyleProfileFinding] = []

    def add(severity: str, code: str, message: str) -> None:
        findings.append(CodingStyleProfileFinding(severity=severity, code=code, path=str(target), message=message))

    if not target.exists():
        add("info", "coding_style_profile_missing", "Meridian user coding-style profile is missing.")
        return CodingStyleProfileReport(status="missing", path=str(target), findings=findings)

    text = target.read_text(encoding="utf-8")
    if f"schema_version: {CODING_STYLE_PROFILE_SCHEMA_VERSION}" not in text:
        add("warning", "coding_style_profile_schema_missing", "Profile schema version is missing or stale.")
    if "## Principles" not in text:
        add("warning", "coding_style_profile_principles_missing", "Profile is missing a Principles section.")
    if "## Pending Review" not in text:
        add("warning", "coding_style_profile_pending_review_missing", "Profile is missing a Pending Review section.")
    if "```" in text:
        add("warning", "coding_style_profile_contains_code_block", "Profile should summarize style, not store full code blocks.")

    status = "pass" if not findings else "warn"
    return CodingStyleProfileReport(status=status, path=str(target), findings=findings)


def classify_coding_style_feedback(feedback: str) -> CodingStyleFeedbackDecision:
    text = " ".join(feedback.lower().split())
    if not text:
        return CodingStyleFeedbackDecision("do_not_record_task_local_only", [], "empty feedback")

    style_terms = [
        "over-engineered",
        "too many helper",
        "helper functions",
        "split this",
        "one linear",
        "linear function",
        "linear main",
        "coding style",
        "code style",
        "naming",
        "comment style",
        "test style",
        "not how i work",
        "remember this style",
    ]
    weak_terms = [
        "messy",
        "hard to maintain",
        "do not like this structure",
        "don't like this structure",
        "structure",
        "readability",
    ]
    bug_terms = [
        "crash",
        "crashes",
        "bug",
        "exception",
        "traceback",
        "wrong result",
        "fails on",
        "does not work",
    ]

    if any(term in text for term in style_terms):
        scopes = ["research_code"] if any(term in text for term in ["research", "calibration", "dataset", "probe", "ablation"]) else ["coding"]
        reason = "explicit reusable style feedback"
        if "helper" in text or "split" in text:
            reason = "explicit helper/splitting style feedback"
        return CodingStyleFeedbackDecision("record_user_level_principle", scopes, reason)
    if any(term in text for term in weak_terms) and not any(term in text for term in bug_terms):
        return CodingStyleFeedbackDecision(
            "ask_whether_to_record",
            ["coding"],
            "style concern is plausible but scope and durability are unclear",
        )
    return CodingStyleFeedbackDecision("do_not_record_task_local_only", [], "feedback appears task-local or correctness-only")


def _starter_profile() -> str:
    today = date.today().isoformat()
    return (
        "# Meridian Coding Style Profile\n"
        "\n"
        f"schema_version: {CODING_STYLE_PROFILE_SCHEMA_VERSION}\n"
        f"updated: {today}\n"
        "\n"
        "This file stores compact durable user-level coding style principles for Meridian Lab injections.\n"
        "For the full research-agent behavior contract, also read `research-agent-principles.md` in the same Meridian config directory.\n"
        "Keep entries short, scoped, and provenance-aware. Do not store full pasted code examples here.\n"
        "\n"
        "## Principles\n"
        "\n"
        "Add confirmed user-level preferences here. Each principle should include scope, principle, apply_when, avoid, positive_shape, exceptions, provenance, confidence, and updated.\n"
        "\n"
        "## Pending Review\n"
        "\n"
        "Use this section for ambiguous coding-style feedback that needs user confirmation before becoming a durable principle.\n"
    )
