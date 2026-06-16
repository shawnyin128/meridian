from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian import __version__
from meridian.lab import (
    coding_style_profile_path,
    research_agent_principles_path,
    validate_coding_style_profile,
    validate_lab_space,
    validate_research_agent_principles,
)
from meridian.setup.doctor import build_setup_doctor_report
from meridian.wiki.workspace import resolve_workspace


FRAMEWORK_CHECK_SCHEMA_VERSION = "meridian.framework_check.v0"
FRAMEWORK_CHECK_CATEGORIES = [
    "Product Surface",
    "Plugin Bundle",
    "Runtime",
    "Workspace",
    "Artifact Boundary",
    "User Profile",
    "Lab State",
    "Docs And Evals",
]
MCP_RUNTIME_CATEGORY = "MCP Runtime"
PRODUCT_SKILLS = {"meridian", "wiki", "lab"}
SUPPORT_SKILLS = {
    "llm-wiki",
    "paper-ingest",
    "wiki-concept",
    "wiki-evolve",
    "wiki-knowledge",
    "wiki-personalize",
    "wiki-retrieve",
}

LAB_SKILL_RELATIVE_PATH = Path("skills/lab/SKILL.md")
MCP_SERVER_NAME = "meridian-paper-wiki"
MCP_SERVER_COMMAND = "python"
MCP_SERVER_ARGS = ["-m", "meridian.mcp", "serve"]


@dataclass(frozen=True)
class FrameworkFinding:
    category: str
    severity: str
    fixability: str
    code: str
    message: str
    next_action: str

    def to_dict(self) -> dict[str, str]:
        return {
            "category": self.category,
            "severity": self.severity,
            "fixability": self.fixability,
            "code": self.code,
            "message": self.message,
            "next_action": self.next_action,
        }


@dataclass(frozen=True)
class FrameworkCategory:
    name: str
    status: str
    findings: list[FrameworkFinding]

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "status": self.status,
            "findings": [finding.to_dict() for finding in self.findings],
        }


@dataclass(frozen=True)
class FrameworkCheckReport:
    status: str
    project_root: Path
    categories: list[FrameworkCategory]
    generated_at: str

    def to_dict(self) -> dict[str, object]:
        findings = [finding for category in self.categories for finding in category.findings]
        return {
            "schema_version": FRAMEWORK_CHECK_SCHEMA_VERSION,
            "generated_at": self.generated_at,
            "project_root": str(self.project_root),
            "status": self.status,
            "summary": {
                "categories": len(self.categories),
                "pass": sum(1 for category in self.categories if category.status == "pass"),
                "warn": sum(1 for category in self.categories if category.status == "warn"),
                "fail": sum(1 for category in self.categories if category.status == "fail"),
                "critical": sum(1 for finding in findings if finding.severity == "critical"),
                "degraded": sum(1 for finding in findings if finding.severity == "degraded"),
                "info": sum(1 for finding in findings if finding.severity == "info"),
            },
            "categories": [category.to_dict() for category in self.categories],
        }


def run_framework_check(
    *,
    project_root: Path,
    library_root: Path | None = None,
    wiki_root: Path | None = None,
    lab_root: Path | None = None,
    require_workspace: bool = False,
    include_mcp_runtime: bool = False,
) -> FrameworkCheckReport:
    root = project_root.expanduser().resolve()
    categories = [
        _product_surface_category(root),
        _plugin_bundle_category(root),
        _runtime_category(),
        _workspace_category(root, library_root=library_root, wiki_root=wiki_root, require_workspace=require_workspace),
        _artifact_boundary_category(library_root=library_root, wiki_root=wiki_root),
        _user_profile_category(),
        _lab_state_category(lab_root),
        _docs_and_evals_category(root),
    ]
    if include_mcp_runtime:
        categories.append(_mcp_runtime_setup_category(root))
    status = "fail" if any(category.status == "fail" for category in categories) else (
        "warn" if any(category.status == "warn" for category in categories) else "pass"
    )
    return FrameworkCheckReport(
        status=status,
        project_root=root,
        categories=categories,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


def write_framework_report(report: FrameworkCheckReport, path: Path) -> Path:
    target = path.expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(format_framework_report_markdown(report), encoding="utf-8")
    return target


def write_framework_json(report: FrameworkCheckReport, path: Path) -> Path:
    target = path.expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


def format_framework_report_markdown(report: FrameworkCheckReport) -> str:
    payload = report.to_dict()
    summary = dict(payload["summary"])  # type: ignore[arg-type]
    lines = [
        "# Meridian Framework Check",
        "",
        f"- Status: `{report.status}`",
        f"- Project root: `{report.project_root}`",
        f"- Generated: `{report.generated_at}`",
        "",
        "## Summary",
        "",
        f"- Categories: {summary['categories']}",
        f"- Pass: {summary['pass']}",
        f"- Warn: {summary['warn']}",
        f"- Fail: {summary['fail']}",
        f"- Critical findings: {summary['critical']}",
        f"- Degraded findings: {summary['degraded']}",
        "",
        "## Categories",
        "",
    ]
    for category in report.categories:
        lines.append(f"### {category.name}: {category.status}")
        if not category.findings:
            lines.append("")
            lines.append("- pass")
            lines.append("")
            continue
        lines.append("")
        for finding in category.findings:
            lines.append(
                f"- `{finding.severity}` / `{finding.fixability}` / `{finding.code}`: "
                f"{finding.message} Next action: {finding.next_action}"
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _product_surface_category(root: Path) -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    category = "Product Surface"
    local_skill_root = root / ".codex/skills"
    local_skills = _child_dir_names(local_skill_root)
    leaked_product = sorted(PRODUCT_SKILLS & local_skills)
    if leaked_product:
        _add(
            findings,
            category,
            "critical",
            "confirm",
            "repo_local_product_skill_shadowing",
            f"Repo-local product skills shadow installed plugin skills: {', '.join(leaked_product)}.",
            "Remove product-skill copies from .codex/skills and keep them only in plugin packages.",
        )
    missing_support = sorted(SUPPORT_SKILLS - local_skills)
    if missing_support:
        _add(
            findings,
            category,
            "degraded",
            "manual",
            "support_skill_missing",
            f"Expected internal support skills are missing from .codex/skills: {', '.join(missing_support)}.",
            "Restore missing support skills or update the framework check if the support surface changed.",
        )
    for package_root in [root / "plugins/codex/meridian/skills", root / "plugins/claude-code/meridian/skills"]:
        package_skills = _child_dir_names(package_root)
        if package_skills != PRODUCT_SKILLS:
            _add(
                findings,
                category,
                "critical",
                "manual",
                "plugin_product_skill_surface_drift",
                f"{_rel(package_root, root)} exposes {sorted(package_skills)} instead of {sorted(PRODUCT_SKILLS)}.",
                "Keep plugin packages limited to meridian, wiki, and lab product skills.",
            )
    return _category(category, findings)


def _plugin_bundle_category(root: Path) -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    category = "Plugin Bundle"
    version_file = root / "VERSION"
    pyproject = root / "pyproject.toml"
    versions: dict[str, str] = {"core": __version__}
    if version_file.exists():
        versions["VERSION"] = version_file.read_text(encoding="utf-8").strip()
    else:
        _add(findings, category, "critical", "manual", "missing_version_file", "VERSION is missing.", "Restore VERSION.")
    if pyproject.exists():
        match = re.search(r'^version\s*=\s*"([^"]+)"', pyproject.read_text(encoding="utf-8"), flags=re.MULTILINE)
        if match:
            versions["pyproject"] = match.group(1)
        else:
            _add(
                findings,
                category,
                "critical",
                "manual",
                "missing_pyproject_version",
                "pyproject.toml does not expose a project version.",
                "Add or repair the project version field.",
            )
    for label, path in [
        ("codex_plugin", root / "plugins/codex/meridian/.codex-plugin/plugin.json"),
        ("claude_plugin", root / "plugins/claude-code/meridian/.claude-plugin/plugin.json"),
    ]:
        if not path.exists():
            _add(findings, category, "critical", "manual", f"missing_{label}", f"{_rel(path, root)} is missing.", "Restore the plugin manifest.")
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            versions[label] = str(payload.get("version") or "")
        except json.JSONDecodeError:
            _add(findings, category, "critical", "manual", f"invalid_{label}", f"{_rel(path, root)} is not valid JSON.", "Fix the plugin manifest JSON.")
    if len(set(versions.values())) > 1:
        _add(
            findings,
            category,
            "critical",
            "manual",
            "version_surface_mismatch",
            f"Version surfaces disagree: {versions}.",
            "Align core, VERSION, pyproject, and plugin manifest versions before release.",
        )
    for skill_name in sorted(PRODUCT_SKILLS):
        codex = root / "plugins/codex/meridian/skills" / skill_name / "SKILL.md"
        claude = root / "plugins/claude-code/meridian/skills" / skill_name / "SKILL.md"
        if not codex.exists() or not claude.exists():
            continue
        if codex.read_text(encoding="utf-8") != claude.read_text(encoding="utf-8"):
            _add(
                findings,
                category,
                "critical",
                "manual",
                "plugin_skill_copy_mismatch",
                f"Codex and Claude Code copies differ for `{skill_name}`.",
                "Synchronize product skill copies across plugin packages.",
            )
    for path in [root / "plugins/codex/meridian/.mcp.json", root / "plugins/claude-code/meridian/.mcp.json"]:
        if not path.exists():
            _add(findings, category, "degraded", "manual", "missing_mcp_config", f"{_rel(path, root)} is missing.", "Restore MCP config or document why the package no longer ships MCP.")
            continue
        try:
            mcp_config = json.loads(path.read_text(encoding="utf-8"))
            server = mcp_config["mcpServers"][MCP_SERVER_NAME]
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            _add(findings, category, "critical", "manual", "invalid_mcp_config", f"{_rel(path, root)} has an invalid Meridian MCP server entry: {exc}.", "Restore the plugin MCP config with the Meridian server entry.")
            continue
        if server.get("command") != MCP_SERVER_COMMAND or server.get("args") != MCP_SERVER_ARGS:
            _add(
                findings,
                category,
                "degraded",
                "manual",
                "mcp_config_entrypoint_drift",
                f"{_rel(path, root)} starts `{server.get('command')}` with args `{server.get('args')}`.",
                "Update the plugin MCP entrypoint to `python -m meridian.mcp serve`, reinstall the plugin, and restart the client session.",
            )
    for item in lab_skill_path_diagnostics(root):
        state = item["state"]
        label = item["label"]
        path = item["path"]
        if state == "readable":
            _add(
                findings,
                category,
                "info",
                "manual",
                "lab_skill_path_readable",
                f"{label} Lab skill is readable: {path}.",
                "No action required.",
            )
        elif state == "unknown":
            _add(
                findings,
                category,
                "info",
                "manual",
                "lab_skill_path_unknown",
                f"{label} Lab skill path could not be inspected in this runtime: {path}.",
                "If Lab cannot load in that client, run Meridian setup/status from that client after plugin update.",
            )
        elif state == "missing":
            severity = "critical" if str(label).startswith("source") else "degraded"
            _add(
                findings,
                category,
                severity,
                "manual",
                "lab_skill_path_missing",
                f"{label} Lab skill is missing: {path}.",
                "Repair or reinstall the Meridian plugin package, then restart the client session.",
            )
        elif state == "unreadable":
            _add(
                findings,
                category,
                "critical",
                "manual",
                "lab_skill_path_unreadable",
                f"{label} Lab skill exists but is not readable: {path}.",
                "Treat this as Meridian setup drift; repair permissions or reinstall the plugin before using Lab.",
            )
        elif state == "version_drift":
            _add(
                findings,
                category,
                "degraded",
                "manual",
                "lab_skill_cache_version_drift",
                f"{label} latest visible cache version is {item.get('version')} but core is {__version__}.",
                "Update/reinstall the Meridian plugin and restart the client session.",
            )
    return _category(category, findings)


def lab_skill_path_diagnostics(project_root: Path, *, home: Path | None = None) -> list[dict[str, str]]:
    """Return readable/missing/unreadable/unknown diagnostics for Lab skill paths."""
    root = project_root.expanduser().resolve()
    user_home = (home or Path.home()).expanduser().resolve()
    diagnostics: list[dict[str, str]] = []
    codex_cache_root = user_home / ".codex/plugins/cache/meridian/meridian"
    claude_cache_root = user_home / ".claude/plugins/cache/meridian/meridian"
    codex_marketplace_root = user_home / ".codex/.tmp/marketplaces/meridian/plugins/codex/meridian"
    claude_marketplace_root = user_home / ".claude/plugins/marketplaces/meridian/plugins/claude-code/meridian"
    for label, path, visible_root in [
        ("source_codex", root / "plugins/codex/meridian" / LAB_SKILL_RELATIVE_PATH, root),
        ("source_claude", root / "plugins/claude-code/meridian" / LAB_SKILL_RELATIVE_PATH, root),
        ("codex_cache_current", codex_cache_root / __version__ / LAB_SKILL_RELATIVE_PATH, codex_cache_root),
        ("claude_cache_current", claude_cache_root / __version__ / LAB_SKILL_RELATIVE_PATH, claude_cache_root),
        ("codex_marketplace", codex_marketplace_root / LAB_SKILL_RELATIVE_PATH, codex_marketplace_root),
        ("claude_marketplace", claude_marketplace_root / LAB_SKILL_RELATIVE_PATH, claude_marketplace_root),
    ]:
        diagnostics.append(_lab_skill_path_record(label, path, visible_root=visible_root))
    for label, base in [
        ("codex_cache_latest", user_home / ".codex/plugins/cache/meridian/meridian"),
        ("claude_cache_latest", user_home / ".claude/plugins/cache/meridian/meridian"),
    ]:
        latest = _latest_version_dir(base)
        if latest is None:
            diagnostics.append(
                {
                    "label": label,
                    "path": str(base),
                    "state": "unknown",
                    "version": "",
                }
            )
            continue
        if latest.name != __version__:
            diagnostics.append(
                {
                    "label": label,
                    "path": str(latest),
                    "state": "version_drift",
                    "version": latest.name,
                }
            )
    return diagnostics


def _lab_skill_path_record(label: str, path: Path, *, visible_root: Path) -> dict[str, str]:
    state = _readability_state(path, visible_root=visible_root)
    return {
        "label": label,
        "path": str(path),
        "state": state,
        "version": __version__ if state == "readable" else "",
    }


def _readability_state(path: Path, *, visible_root: Path) -> str:
    if not path.exists():
        return "unknown" if not visible_root.exists() else "missing"
    try:
        if not path.is_file():
            return "unreadable"
        path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return "unreadable"
    return "readable"


def _latest_version_dir(base: Path) -> Path | None:
    if not base.exists():
        return None
    candidates = [child for child in base.iterdir() if child.is_dir()]
    if not candidates:
        return None
    return max(candidates, key=lambda path: _version_sort_key(path.name))


def _version_sort_key(value: str) -> tuple[int, ...]:
    parts: list[int] = []
    for part in value.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(-1)
    return tuple(parts)


def _runtime_category() -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    category = "Runtime"
    try:
        from meridian.mcp import adapter as mcp_adapter
        from meridian.mcp import server as mcp_server
    except Exception as exc:  # noqa: BLE001 - framework report should explain runtime import failures.
        _add(
            findings,
            category,
            "critical",
            "manual",
            "mcp_import_failed",
            f"MCP runtime import failed: {exc}.",
            "Fix the MCP package import path or optional dependency handling.",
        )
        return _category(category, findings)
    if getattr(mcp_server, "SERVER_VERSION", __version__) != __version__:
        _add(
            findings,
            category,
            "critical",
            "manual",
            "mcp_version_mismatch",
            "MCP server version does not match Meridian core version.",
            "Align mcp.server SERVER_VERSION with the package version.",
        )
    expected_tools = {
        "meridian.capabilities",
        "meridian.context",
        "meridian.read",
        "meridian.trace",
        "meridian.update",
        "meridian.propose",
        "meridian.apply",
        "meridian.audit",
    }
    mcp_adapter.capabilities(detail="full")
    tools = {str(item.get("name")) for item in mcp_server.tool_definitions() if isinstance(item, dict)}
    missing = sorted(expected_tools - tools)
    extra = sorted(tools - expected_tools)
    if missing or extra:
        _add(
            findings,
            category,
            "critical",
            "manual",
            "mcp_tool_surface_drift",
            f"MCP tool surface drift. Missing: {missing}; extra: {extra}.",
            "Keep MCP tools small and scenario-facing across Use Wiki and Update Wiki.",
        )
    return _category(category, findings)


def _mcp_runtime_setup_category(root: Path) -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    report = build_setup_doctor_report(project_root=root)
    for item in report.findings:
        severity = "critical" if item.get("severity") == "critical" else "degraded"
        client = item.get("client")
        message = str(item.get("message") or "MCP runtime setup finding.")
        if client:
            message = f"{client}: {message}"
        _add(
            findings,
            MCP_RUNTIME_CATEGORY,
            severity,
            "manual",
            str(item.get("code") or "mcp_runtime_setup_finding"),
            message,
            str(item.get("next_action") or "Run `meridian setup doctor` for setup details."),
        )
    if not findings:
        _add(
            findings,
            MCP_RUNTIME_CATEGORY,
            "info",
            "manual",
            "mcp_runtime_ready",
            "MCP runtime setup doctor reported no findings.",
            "No action required.",
        )
    return _category(MCP_RUNTIME_CATEGORY, findings)


def _workspace_category(
    root: Path,
    *,
    library_root: Path | None,
    wiki_root: Path | None,
    require_workspace: bool,
) -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    category = "Workspace"
    workspace = resolve_workspace(library_root=library_root, wiki_root=wiki_root)
    if workspace is None:
        severity = "critical" if require_workspace else "info"
        _add(
            findings,
            category,
            severity,
            "manual",
            "workspace_not_configured",
            "No active Paper Wiki workspace is configured for this check.",
            "Run `meridian wiki init --library-root <library-root>` or pass --library-root/--wiki-root.",
        )
        return _category(category, findings)
    for label, path in [
        ("library root", workspace.library_root),
        ("source root", workspace.source_root),
        ("wiki root", workspace.wiki_root),
    ]:
        if not path.exists():
            _add(
                findings,
                category,
                "critical",
                "manual",
                f"missing_{label.replace(' ', '_')}",
                f"Configured {label} does not exist: {path}.",
                "Repair the workspace config or reinitialize the library root.",
            )
    if workspace.config_path is None or not workspace.config_path.exists():
        _add(
            findings,
            category,
            "critical",
            "manual",
            "missing_workspace_config",
            "Workspace config meridian-wiki.json is missing.",
            "Reinitialize or migrate the Paper Wiki library root.",
        )
    if _is_relative_to(workspace.library_root, root):
        _add(
            findings,
            category,
            "degraded",
            "manual",
            "workspace_inside_dev_repo",
            "Active Paper Wiki library root is inside the Meridian development repo.",
            "Move user wiki data to an external library root and update the active workspace config.",
        )
    return _category(category, findings)


def _artifact_boundary_category(*, library_root: Path | None, wiki_root: Path | None) -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    category = "Artifact Boundary"
    workspace = resolve_workspace(library_root=library_root, wiki_root=wiki_root)
    if workspace is None:
        _add(
            findings,
            category,
            "info",
            "manual",
            "artifact_boundary_skipped",
            "No workspace was available, so canonical catalog artifact-boundary checks were skipped.",
            "Pass --library-root or --wiki-root when checking a real Paper Wiki.",
        )
        return _category(category, findings)
    index_dir = workspace.wiki_root / ".index"
    if not index_dir.exists():
        _add(
            findings,
            category,
            "degraded",
            "manual",
            "missing_wiki_index",
            "Wiki .index directory is missing.",
            "Run `meridian wiki catalog --wiki-root <wiki-root>`.",
        )
        return _category(category, findings)
    bad_records: list[str] = []
    for path in sorted(index_dir.glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            record_path = str(record.get("path") or record.get("canonical_path") or "")
            if "/.drafts/" in record_path or "/.versions/" in record_path:
                bad_records.append(f"{path.name}:{record_path}")
    if bad_records:
        _add(
            findings,
            category,
            "critical",
            "manual",
            "internal_artifact_indexed",
            f"Canonical indexes include internal artifacts: {bad_records[:5]}.",
            "Rebuild catalogs and fix retrieval indexing to exclude drafts and versions.",
        )
    return _category(category, findings)


def _lab_state_category(lab_root: Path | None) -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    category = "Lab State"
    if lab_root is None:
        _add(
            findings,
            category,
            "info",
            "manual",
            "lab_state_not_checked",
            "No Lab target repo was provided, so `.meridian/` validation was skipped.",
            "Pass --lab-root <repo> when checking Lab readiness for a research project.",
        )
        return _category(category, findings)
    report = validate_lab_space(lab_root)
    for item in report.findings:
        _add(
            findings,
            category,
            "critical" if item.severity == "error" else "degraded",
            "confirm" if item.code == "missing_lab_root" else "manual",
            f"lab_{item.code}",
            item.message,
            "Initialize or repair the minimal `.meridian/` research-space skeleton.",
        )
    return _category(category, findings)


def _user_profile_category() -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    category = "User Profile"
    coding_report = validate_coding_style_profile()
    if coding_report.status == "missing":
        _add(
            findings,
            category,
            "info",
            "confirm",
            "coding_style_profile_missing",
            f"User coding-style profile is missing: {coding_style_profile_path()}.",
            "Run Meridian setup/status to create the starter coding-style profile when style handoffs are needed.",
        )
    elif coding_report.status == "pass":
        _add(
            findings,
            category,
            "info",
            "manual",
            "coding_style_profile_ready",
            f"User coding-style profile is readable: {coding_report.path}.",
            "No action required.",
        )
    else:
        for item in coding_report.findings:
            _add(
                findings,
                category,
                "degraded",
                "confirm",
                item.code,
                item.message,
                "Run Meridian setup/status to migrate the coding-style profile without deleting user text.",
            )

    principles_report = validate_research_agent_principles()
    if principles_report.status == "missing":
        _add(
            findings,
            category,
            "info",
            "confirm",
            "research_agent_principles_missing",
            f"Research-agent principles are missing: {research_agent_principles_path()}.",
            "Run Meridian setup/status to create the research-agent principles reference.",
        )
    elif principles_report.status == "pass":
        _add(
            findings,
            category,
            "info",
            "manual",
            "research_agent_principles_ready",
            f"Research-agent principles are readable: {principles_report.path}.",
            "No action required.",
        )
    else:
        for item in principles_report.findings:
            _add(
                findings,
                category,
                "degraded",
                "confirm",
                item.code,
                item.message,
                "Run Meridian setup/status to migrate the research-agent principles without deleting user text.",
            )
    return _category(category, findings)


def _docs_and_evals_category(root: Path) -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    category = "Docs And Evals"
    required_paths = [
        root / "README.md",
        root / "docs/plugin-distribution.md",
        root / "docs/research-dev-state-model.md",
        root / "eval/cases/meridian_skill_behavior_quality.jsonl",
        root / "eval/rubrics/meridian_skill_behavior_quality.md",
    ]
    for path in required_paths:
        if not path.exists():
            _add(
                findings,
                category,
                "degraded",
                "manual",
                "missing_release_surface",
                f"Expected release/framework surface is missing: {_rel(path, root)}.",
                "Restore the doc or eval asset, or update the framework check when the surface changes.",
            )
    readme = root / "README.md"
    if readme.exists():
        text = readme.read_text(encoding="utf-8")
        for marker in ("meridian", "wiki", "lab"):
            if marker not in text:
                _add(
                    findings,
                    category,
                    "degraded",
                    "manual",
                    "readme_missing_product_entry",
                    f"README does not mention the `{marker}` product entry.",
                    "Keep README aligned with the three-entry user model.",
                )
    return _category(category, findings)


def _category(name: str, findings: list[FrameworkFinding]) -> FrameworkCategory:
    status = "fail" if any(finding.severity == "critical" for finding in findings) else (
        "warn" if any(finding.severity == "degraded" for finding in findings) else "pass"
    )
    return FrameworkCategory(name=name, status=status, findings=findings)


def _add(
    findings: list[FrameworkFinding],
    category: str,
    severity: str,
    fixability: str,
    code: str,
    message: str,
    next_action: str,
) -> None:
    findings.append(
        FrameworkFinding(
            category=category,
            severity=severity,
            fixability=fixability,
            code=code,
            message=message,
            next_action=next_action,
        )
    )


def _child_dir_names(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {child.name for child in path.iterdir() if child.is_dir() and (child / "SKILL.md").exists()}


def _rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False
