from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from meridian.wiki.quality import QualityGate
from meridian.wiki.vault import init_wiki_vault


@dataclass(frozen=True)
class PublishResult:
    paper_path: Path
    index_path: Path
    log_path: Path


def publish_canonical_draft(
    *,
    wiki_root: Path,
    title: str,
    source_pdf: Path,
    draft_paper_path: Path,
    draft_out_dir: Path,
    quality_gate: QualityGate,
    created_date: str,
    overwrite: bool = False,
) -> PublishResult:
    init_wiki_vault(wiki_root=wiki_root)
    papers_dir = wiki_root / "papers"
    papers_dir.mkdir(parents=True, exist_ok=True)
    canonical_paper_path = papers_dir / f"{_slugify(title)}.md"

    if canonical_paper_path.exists() and not overwrite:
        raise FileExistsError(f"canonical paper page already exists: {canonical_paper_path}")

    draft_text = draft_paper_path.read_text(encoding="utf-8")
    canonical_text = _canonicalize_paper_text(
        draft_text=draft_text,
        source_pdf=source_pdf,
        draft_out_dir=draft_out_dir,
        quality_gate=quality_gate,
    )
    canonical_paper_path.write_text(canonical_text, encoding="utf-8")

    index_path = wiki_root / "index.md"
    log_path = wiki_root / "log.md"
    _upsert_index_entry(
        index_path=index_path,
        paper_path=canonical_paper_path,
        title=title,
        quality_gate=quality_gate,
    )
    _append_log_entry(
        log_path=log_path,
        title=title,
        source_pdf=source_pdf,
        paper_path=canonical_paper_path,
        draft_out_dir=draft_out_dir,
        quality_gate=quality_gate,
        created_date=created_date,
    )

    return PublishResult(
        paper_path=canonical_paper_path,
        index_path=index_path,
        log_path=log_path,
    )


def _canonicalize_paper_text(
    *,
    draft_text: str,
    source_pdf: Path,
    draft_out_dir: Path,
    quality_gate: QualityGate,
) -> str:
    replacements = {
        "status: \"draft\"": "status: \"draft\"",
        "confidence: \"low\"": f"confidence: \"{quality_gate.confidence}\"",
        "write_policy: \"review_before_publish\"": "write_policy: \"auto_publish_draft\"",
        "canonical_wiki_mutated: false": "canonical_wiki_mutated: true",
    }
    text = draft_text
    for old, new in replacements.items():
        text = text.replace(old, new, 1)

    insert = (
        f"review_state: \"{quality_gate.review_state}\"\n"
        f"quality_gate: \"{quality_gate.decision}\"\n"
        f"raw_source: \"{source_pdf}\"\n"
        f"draft_artifact_root: \"{draft_out_dir}\"\n"
    )
    return text.replace("---\n# ", f"{insert}---\n# ", 1)


def _upsert_index_entry(
    *,
    index_path: Path,
    paper_path: Path,
    title: str,
    quality_gate: QualityGate,
) -> None:
    if index_path.exists():
        text = index_path.read_text(encoding="utf-8")
    else:
        text = "# Wiki Index\n\n## Papers\n\n"

    entry = (
        f"- [[papers/{paper_path.stem}|{title}]]"
        f" - status: draft; review_state: {quality_gate.review_state};"
        f" quality_gate: {quality_gate.decision}\n"
    )
    lines = [line for line in text.splitlines() if f"[[papers/{paper_path.stem}|" not in line]

    if "## Papers" not in lines:
        lines.extend(["", "## Papers", ""])
    insert_at = lines.index("## Papers") + 1
    lines.insert(insert_at, entry.rstrip())
    index_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _append_log_entry(
    *,
    log_path: Path,
    title: str,
    source_pdf: Path,
    paper_path: Path,
    draft_out_dir: Path,
    quality_gate: QualityGate,
    created_date: str,
) -> None:
    if log_path.exists():
        existing = log_path.read_text(encoding="utf-8").rstrip()
    else:
        existing = "# Wiki Log"

    entry = (
        f"\n\n## [{created_date}] ingest | {title}\n\n"
        f"- Source PDF: `{source_pdf}`\n"
        f"- Canonical draft: [[papers/{paper_path.stem}|{title}]]\n"
        f"- Draft artifacts: `{draft_out_dir}`\n"
        f"- Quality gate: `{quality_gate.decision}`\n"
        f"- Review state: `{quality_gate.review_state}`\n"
    )
    if quality_gate.warnings:
        entry += "- Warnings: " + ", ".join(f"`{warning}`" for warning in quality_gate.warnings) + "\n"
    if quality_gate.errors:
        entry += "- Errors: " + ", ".join(f"`{error}`" for error in quality_gate.errors) + "\n"

    log_path.write_text(existing + entry, encoding="utf-8")


def _slugify(title: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-")
    return slug or f"paper-{date.today().isoformat()}"
