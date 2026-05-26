from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.corpus import build_knowledge_catalogs, build_paper_catalog, build_synthesis_catalog, parse_frontmatter, strip_frontmatter


WIKI_DIRS = (
    ".drafts/ingests",
    ".drafts/retrieval",
    ".drafts/proposals",
    ".drafts/insights",
    ".drafts/refinements",
    ".versions",
    ".index",
    "raw/sources/papers",
    "papers",
    "claims",
    "methods",
    "evidence",
    "topics",
    "concepts",
    "syntheses",
    "templates",
)


@dataclass(frozen=True)
class WikiInitResult:
    wiki_root: Path
    created_dirs: list[Path]
    created_files: list[Path]


@dataclass(frozen=True)
class SourceAuditResult:
    audit_path: Path
    source_index_path: Path
    total: int
    missing_managed: int
    sha_mismatches: int
    duplicate_sha_groups: int


@dataclass(frozen=True)
class WikiLintResult:
    report_path: Path
    status: str
    findings: list[dict[str, Any]]


def init_wiki_vault(*, wiki_root: Path, overwrite_templates: bool = False) -> WikiInitResult:
    created_dirs: list[Path] = []
    created_files: list[Path] = []
    for relative in WIKI_DIRS:
        path = wiki_root / relative
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            created_dirs.append(path)

    for path, text in _initial_files(wiki_root).items():
        if path.exists() and not (overwrite_templates and "/templates/" in path.as_posix()):
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        created_files.append(path)

    return WikiInitResult(wiki_root=wiki_root, created_dirs=created_dirs, created_files=created_files)


def audit_sources(*, wiki_root: Path, out_path: Path | None = None, source_root: Path | None = None) -> SourceAuditResult:
    sources_root = source_root or _source_root_for_wiki(wiki_root)
    registry = sources_root / "sources.jsonl"
    records = _read_jsonl(registry)
    audits = []
    sha_to_ids: dict[str, list[str]] = {}
    for record in records:
        managed = Path(str(record.get("managed_path") or ""))
        sha = str(record.get("sha256") or "")
        exists = managed.exists()
        actual_sha = _sha256(managed) if exists else None
        status = "ok"
        findings: list[str] = []
        if not exists:
            status = "missing_managed_file"
            findings.append("managed file is missing")
        elif sha and actual_sha != sha:
            status = "sha_mismatch"
            findings.append("managed file sha256 differs from registry")
        if sha:
            sha_to_ids.setdefault(sha, []).append(str(record.get("source_id") or "unknown"))
        audits.append(
            {
                "source_id": record.get("source_id"),
                "title": record.get("title"),
                "status": status,
                "findings": findings,
                "managed_path": str(managed) if managed else None,
                "original_path": record.get("original_path"),
                "sha256": sha,
                "actual_sha256": actual_sha,
            }
        )
    duplicates = {sha: ids for sha, ids in sha_to_ids.items() if sha and len(ids) > 1}
    for audit in audits:
        sha = str(audit.get("sha256") or "")
        if sha in duplicates:
            audit["findings"].append(f"duplicate sha group: {', '.join(duplicates[sha])}")
            if audit["status"] == "ok":
                audit["status"] = "duplicate_sha"

    payload = {
        "schema_version": "meridian.source_audit.v0",
        "wiki_root": str(wiki_root),
        "source_root": str(sources_root),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "registry": str(registry),
        "total": len(audits),
        "missing_managed": sum(1 for item in audits if item["status"] == "missing_managed_file"),
        "sha_mismatches": sum(1 for item in audits if item["status"] == "sha_mismatch"),
        "duplicate_sha_groups": len(duplicates),
        "sources": audits,
    }
    audit_path = out_path or wiki_root / ".index/source-audit.json"
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    source_index_path = sources_root / "index.md"
    source_index_path.parent.mkdir(parents=True, exist_ok=True)
    source_index_path.write_text(_render_source_index(payload), encoding="utf-8")
    return SourceAuditResult(
        audit_path=audit_path,
        source_index_path=source_index_path,
        total=payload["total"],
        missing_managed=payload["missing_managed"],
        sha_mismatches=payload["sha_mismatches"],
        duplicate_sha_groups=payload["duplicate_sha_groups"],
    )


def rebuild_wiki_index(*, wiki_root: Path) -> Path:
    init_wiki_vault(wiki_root=wiki_root)
    sections = [
        "# Wiki Index",
        "",
        "> Generated by `meridian wiki rebuild-index`. Edit source pages, not this generated catalog, unless you intentionally want a manual landing page.",
        "",
    ]
    for heading, directory in (
        ("Papers", "papers"),
        ("Methods", "methods"),
        ("Claims", "claims"),
        ("Evidence", "evidence"),
        ("Topics", "topics"),
        ("Concepts", "concepts"),
        ("Syntheses", "syntheses"),
    ):
        pages = sorted((wiki_root / directory).glob("*.md"))
        sections.extend([f"## {heading}", ""])
        if not pages:
            sections.append("- None yet.")
        for page in pages:
            fm = parse_frontmatter(page.read_text(encoding="utf-8"))
            title = str(fm.get("title") or page.stem)
            status = fm.get("status") or "unknown"
            review = fm.get("review_state") or fm.get("quality_gate") or ""
            suffix = f"; {review}" if review else ""
            sections.append(f"- [[{directory}/{page.stem}|{title}]] - status: {status}{suffix}")
        sections.append("")
    index_path = wiki_root / "index.md"
    index_path.write_text("\n".join(sections).rstrip() + "\n", encoding="utf-8")
    if (wiki_root / "papers").exists():
        build_paper_catalog(wiki_root=wiki_root)
    if (wiki_root / "syntheses").exists():
        build_synthesis_catalog(wiki_root=wiki_root)
    build_knowledge_catalogs(wiki_root=wiki_root)
    return index_path


def lint_wiki(*, wiki_root: Path, out_path: Path | None = None, source_root: Path | None = None) -> WikiLintResult:
    findings: list[dict[str, Any]] = []
    for relative in WIKI_DIRS:
        if not (wiki_root / relative).exists():
            findings.append({"severity": "error", "bucket": "missing_directory", "path": relative})
    if not (wiki_root / "index.md").exists():
        findings.append({"severity": "warn", "bucket": "missing_index", "path": "index.md"})
    if not (wiki_root / "log.md").exists():
        findings.append({"severity": "warn", "bucket": "missing_log", "path": "log.md"})

    for page in sorted((wiki_root / "papers").glob("*.md")):
        text = page.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        missing = [
            field
            for field in ("type", "title", "source_id", "source_pdf", "topics", "methods", "settings", "review_state")
            if not fm.get(field)
        ]
        if missing:
            findings.append(
                {
                    "severity": "warn",
                    "bucket": "paper_frontmatter_incomplete",
                    "path": str(page.relative_to(wiki_root)),
                    "missing": missing,
                }
            )
        body = strip_frontmatter(text)
        if "[[" not in body:
            findings.append(
                {
                    "severity": "info",
                    "bucket": "paper_has_no_wikilinks",
                    "path": str(page.relative_to(wiki_root)),
                }
            )

    sources_root = source_root or _source_root_for_wiki(wiki_root)
    registry = sources_root / "sources.jsonl"
    if not registry.exists():
        findings.append({"severity": "warn", "bucket": "missing_source_registry", "path": _display_path(registry, wiki_root=wiki_root)})

    status = "pass"
    if any(item["severity"] == "error" for item in findings):
        status = "fail"
    elif any(item["severity"] == "warn" for item in findings):
        status = "warn"
    payload = {
        "schema_version": "meridian.wiki_lint.v0",
        "wiki_root": str(wiki_root),
        "source_root": str(sources_root),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "findings": findings,
    }
    report_path = out_path or wiki_root / ".index/wiki-lint.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return WikiLintResult(report_path=report_path, status=status, findings=findings)


def append_wiki_log(*, wiki_root: Path, action: str, title: str, lines: list[str]) -> Path:
    log_path = wiki_root / "log.md"
    if log_path.exists():
        existing = log_path.read_text(encoding="utf-8").rstrip()
    else:
        existing = "# Wiki Log"
    date = datetime.now(timezone.utc).date().isoformat()
    body = "\n".join(f"- {line}" for line in lines)
    log_path.write_text(f"{existing}\n\n## [{date}] {action} | {title}\n\n{body}\n", encoding="utf-8")
    return log_path


def _initial_files(wiki_root: Path) -> dict[Path, str]:
    return {
        wiki_root / "index.md": "# Wiki Index\n\n## Papers\n\n- None yet.\n",
        wiki_root / "log.md": "# Wiki Log\n",
        wiki_root / "templates/paper.md": _template("paper"),
        wiki_root / "templates/claim.md": _template("claim"),
        wiki_root / "templates/method.md": _template("method"),
        wiki_root / "templates/topic.md": _template("topic"),
        wiki_root / "templates/concept.md": _template("concept"),
        wiki_root / "templates/synthesis.md": _template("synthesis"),
        wiki_root / "raw/sources/index.md": "# Source Index\n\nNo registered sources yet.\n",
    }


def _template(kind: str) -> str:
    if kind == "paper":
        return """---
type: "paper"
title: ""
status: "draft"
sources: []
aliases: []
topics: []
methods: []
settings: []
datasets: []
metrics: []
confidence: "low"
review_state: "needs_review"
---
# Paper Title
"""
    if kind == "claim":
        return """---
type: "claim"
title: ""
status: "draft"
sources: []
supports: []
contradicts: []
confidence: "low"
review_state: "candidate"
---
# Claim
"""
    if kind == "method":
        return """---
type: "method"
title: ""
status: "draft"
sources: []
related_papers: []
topics: []
confidence: "low"
review_state: "candidate"
---
# Method
"""
    if kind == "topic":
        return """---
type: "topic"
title: ""
status: "active"
sources: []
related_papers: []
related_methods: []
confidence: "medium"
---
# Topic
"""
    if kind == "concept":
        return """---
type: "concept"
title: ""
status: "active"
sources: []
source_papers: []
related_methods: []
related_topics: []
related_claims: []
related_evidence: []
prerequisite_for: []
supports: []
contradicts: []
confidence: "low"
review_state: "candidate"
evolution_state: "active"
revision_id: ""
---
# Concept

## What It Is

## Why It Matters

## Where It Appears

## Used By Methods

## Implementation Implications

## Common Failure Modes

## Minimal Checks / Probes

## Evidence / Provenance

## Related Concepts

## Open Questions

## Retrieval Hooks
"""
    return """---
type: "synthesis"
title: ""
status: "draft"
sources: []
confidence: "low"
---
# Synthesis
"""


def _render_source_index(payload: dict[str, Any]) -> str:
    lines = [
        "---",
        'type: "source_index"',
        f'updated: "{datetime.now(timezone.utc).date().isoformat()}"',
        "---",
        "# Source Index",
        "",
        f"- Total sources: {payload['total']}",
        f"- Missing managed files: {payload['missing_managed']}",
        f"- SHA mismatches: {payload['sha_mismatches']}",
        f"- Duplicate SHA groups: {payload['duplicate_sha_groups']}",
        "",
        "## Sources",
        "",
    ]
    for item in payload["sources"]:
        title = item.get("title") or item.get("source_id")
        lines.append(f"- `{item.get('source_id')}`: {title} - {item.get('status')}")
    if not payload["sources"]:
        lines.append("- None yet.")
    return "\n".join(lines).rstrip() + "\n"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if stripped:
                records.append(json.loads(stripped))
    return records


def _sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _source_root_for_wiki(wiki_root: Path) -> Path:
    try:
        from meridian.wiki.workspace import resolve_workspace

        workspace = resolve_workspace(wiki_root=wiki_root)
        if workspace is not None:
            return workspace.source_root
    except Exception:
        pass
    return wiki_root / "raw" / "sources"


def _display_path(path: Path, *, wiki_root: Path) -> str:
    try:
        return path.relative_to(wiki_root).as_posix()
    except ValueError:
        return str(path)


def slugify(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-")
    return slug[:96] or "untitled"
