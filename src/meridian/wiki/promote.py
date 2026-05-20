from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.corpus import build_paper_catalog, parse_frontmatter
from meridian.wiki.quality import QualityGate
from meridian.wiki.publish import publish_canonical_draft
from meridian.wiki.sources import SourceRecord, register_pdf_source
from meridian.wiki.vault import append_wiki_log, init_wiki_vault, rebuild_wiki_index, slugify


@dataclass(frozen=True)
class PublishRunResult:
    run_manifest: Path
    canonical_paper_path: Path
    promoted_claims: list[Path]
    promoted_methods: list[Path]
    promoted_evidence: list[Path]
    topic_pages: list[Path]
    index_path: Path
    catalog_path: Path


def publish_run_to_wiki(
    *,
    run_manifest: Path,
    wiki_root: Path,
    promote_candidates: bool = True,
    overwrite: bool = False,
) -> PublishRunResult:
    init_wiki_vault(wiki_root=wiki_root)
    run = _read_json(run_manifest)
    title = str(run.get("title") or "Untitled Paper")
    draft = dict(run.get("draft_artifacts") or {})
    paper_path = Path(str(draft.get("paper_page") or run.get("paper_page") or ""))
    if not paper_path.exists():
        raise FileNotFoundError(f"draft paper page does not exist: {paper_path}")

    quality_gate = _quality_gate_from_run(run)
    source_record = _ensure_managed_source(run=run, wiki_root=wiki_root, title=title)
    source_pdf = source_record.managed_path if source_record is not None else Path(str(run.get("source_pdf") or ""))
    canonical = dict(run.get("canonical_artifacts") or {})
    if canonical.get("paper_page") and Path(str(canonical["paper_page"])).exists():
        canonical_paper_path = Path(str(canonical["paper_page"]))
    else:
        publish_result = publish_canonical_draft(
            wiki_root=wiki_root,
            title=title,
            source_pdf=source_pdf,
            draft_paper_path=paper_path,
            draft_out_dir=run_manifest.parent,
            quality_gate=quality_gate,
            created_date=_created_date(run),
            overwrite=overwrite,
        )
        canonical_paper_path = publish_result.paper_path
        run["canonical_artifacts"] = {
            "paper_page": str(publish_result.paper_path),
            "index": str(publish_result.index_path),
            "log": str(publish_result.log_path),
        }
        run["canonical_wiki_mutated"] = True
        run["write_policy"] = "auto_publish_draft"
    if source_record is not None:
        _patch_canonical_source_frontmatter(canonical_paper_path, source_record)
        run["source_pdf"] = str(source_record.managed_path)
        run["source_management"] = {
            "mode": "managed",
            "source_id": source_record.source_id,
            "registry": str(source_record.registry_path),
            "managed_path": str(source_record.managed_path),
            "sha256": source_record.sha256,
        }

    promoted_claims: list[Path] = []
    promoted_methods: list[Path] = []
    promoted_evidence: list[Path] = []
    topic_pages: list[Path] = []
    if promote_candidates:
        promoted_methods = _promote_records(
            records_path=Path(str(draft.get("methods") or "")),
            wiki_root=wiki_root,
            directory="methods",
            type_name="method",
            paper_path=canonical_paper_path,
        )
        promoted_claims = _promote_records(
            records_path=Path(str(draft.get("claims") or "")),
            wiki_root=wiki_root,
            directory="claims",
            type_name="claim",
            paper_path=canonical_paper_path,
        )
        promoted_evidence = _promote_records(
            records_path=Path(str(draft.get("evidence") or "")),
            wiki_root=wiki_root,
            directory="evidence",
            type_name="evidence",
            paper_path=canonical_paper_path,
        )
        topic_pages = _upsert_topic_pages(wiki_root=wiki_root, paper_path=canonical_paper_path)

    index_path = rebuild_wiki_index(wiki_root=wiki_root)
    catalog = build_paper_catalog(wiki_root=wiki_root)
    append_wiki_log(
        wiki_root=wiki_root,
        action="publish",
        title=title,
        lines=[
            f"Canonical paper: [[papers/{canonical_paper_path.stem}|{title}]]",
            f"Promoted methods: {len(promoted_methods)}",
            f"Promoted claims: {len(promoted_claims)}",
            f"Promoted evidence records: {len(promoted_evidence)}",
            f"Topic pages touched: {len(topic_pages)}",
        ],
    )
    run["promotion"] = {
        "schema_version": "paper_wiki_promotion.v0",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "promote_candidates": promote_candidates,
        "methods": [str(path) for path in promoted_methods],
        "claims": [str(path) for path in promoted_claims],
        "evidence": [str(path) for path in promoted_evidence],
        "topics": [str(path) for path in topic_pages],
        "catalog": str(catalog.catalog_path),
    }
    _write_json(run_manifest, run)
    return PublishRunResult(
        run_manifest=run_manifest,
        canonical_paper_path=canonical_paper_path,
        promoted_claims=promoted_claims,
        promoted_methods=promoted_methods,
        promoted_evidence=promoted_evidence,
        topic_pages=topic_pages,
        index_path=index_path,
        catalog_path=catalog.catalog_path,
    )


def _promote_records(
    *,
    records_path: Path,
    wiki_root: Path,
    directory: str,
    type_name: str,
    paper_path: Path,
) -> list[Path]:
    if not records_path.exists():
        return []
    records = _read_jsonl(records_path)
    out_dir = wiki_root / directory
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for record in records:
        record_id = str(record.get("id") or slugify(str(record.get("name") or record.get("claim") or "record")))
        title = _record_title(record, type_name)
        path = out_dir / f"{slugify(record_id)}.md"
        path.write_text(_render_record_page(record, type_name=type_name, title=title, paper_path=paper_path), encoding="utf-8")
        paths.append(path)
    return paths


def _upsert_topic_pages(*, wiki_root: Path, paper_path: Path) -> list[Path]:
    text = paper_path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(text)
    topics = [str(item) for item in frontmatter.get("topics") or []]
    methods = [str(item) for item in frontmatter.get("methods") or []]
    title = str(frontmatter.get("title") or paper_path.stem)
    paths = []
    for topic in topics:
        path = wiki_root / "topics" / f"{slugify(topic)}.md"
        existing = path.read_text(encoding="utf-8") if path.exists() else ""
        link = f"[[papers/{paper_path.stem}|{title}]]"
        if existing:
            body = existing.rstrip()
            if link not in body:
                body += f"\n- {link}\n"
            path.write_text(body + "\n", encoding="utf-8")
        else:
            path.write_text(
                _topic_page(topic=topic, paper_link=link, methods=methods),
                encoding="utf-8",
            )
        paths.append(path)
    return paths


def _render_record_page(record: dict[str, Any], *, type_name: str, title: str, paper_path: Path) -> str:
    paper_title = str(record.get("paper_title") or paper_path.stem)
    paper_link = f"[[papers/{paper_path.stem}|{paper_title}]]"
    provenance = _format_provenance(record.get("provenance") or [])
    frontmatter = [
        "---",
        f'type: "{type_name}"',
        f'title: "{_escape(title)}"',
        'status: "draft"',
        "sources:",
        f'  - "{paper_link}"',
        f'confidence: "{_escape(str(record.get("confidence") or "low"))}"',
        f'review_state: "{_escape(str(record.get("review_state") or "candidate"))}"',
        f'candidate_id: "{_escape(str(record.get("id") or ""))}"',
        "---",
    ]
    if type_name == "method":
        body = [
            f"# {title}",
            "",
            f"- Source paper: {paper_link}",
            f"- Summary: {record.get('summary') or 'No summary.'}",
            f"- Inputs: {_join(record.get('inputs'))}",
            f"- Outputs: {_join(record.get('outputs'))}",
            f"- Assumptions: {_join(record.get('assumptions'))}",
            f"- Provenance: {provenance}",
        ]
    elif type_name == "claim":
        body = [
            f"# {title}",
            "",
            f"- Source paper: {paper_link}",
            f"- Claim: {record.get('claim') or title}",
            f"- Claim type: {record.get('claim_type') or 'unknown'}",
            f"- Evidence IDs: {_join(record.get('evidence_ids'))}",
            f"- Provenance: {provenance}",
        ]
    else:
        body = [
            f"# {title}",
            "",
            f"- Source paper: {paper_link}",
            f"- Evidence type: {record.get('evidence_type') or 'unknown'}",
            f"- Page: {record.get('page') or 'unknown'}",
            f"- Locator: {record.get('locator') or 'unknown'}",
            f"- Summary: {record.get('summary') or 'No summary.'}",
            f"- Supports: {_join(record.get('supports'))}",
        ]
    return "\n".join(frontmatter + body).rstrip() + "\n"


def _topic_page(*, topic: str, paper_link: str, methods: list[str]) -> str:
    return "\n".join(
        [
            "---",
            'type: "topic"',
            f'title: "{_escape(topic)}"',
            'status: "active"',
            "related_papers:",
            f'  - "{paper_link}"',
            "related_methods:",
            *[f'  - "{_escape(method)}"' for method in methods],
            'confidence: "medium"',
            "---",
            f"# {topic}",
            "",
            "## Related Papers",
            "",
            f"- {paper_link}",
        ]
    ).rstrip() + "\n"


def _quality_gate_from_run(run: dict[str, Any]) -> QualityGate:
    payload = dict(run.get("quality_gate") or {})
    return QualityGate(
        decision=str(payload.get("decision") or "warn"),
        review_state=str(payload.get("review_state") or "needs_review"),
        confidence=str(payload.get("confidence") or "low"),
        errors=[str(item) for item in payload.get("errors") or []],
        warnings=[str(item) for item in payload.get("warnings") or []],
    )


def _ensure_managed_source(*, run: dict[str, Any], wiki_root: Path, title: str) -> SourceRecord | None:
    management = dict(run.get("source_management") or {})
    managed_path = management.get("managed_path")
    if management.get("mode") == "managed" and managed_path and Path(str(managed_path)).exists():
        return None
    source_pdf = Path(str(run.get("input_pdf") or run.get("source_pdf") or ""))
    if not source_pdf.exists():
        return None
    return register_pdf_source(pdf_path=source_pdf, wiki_root=wiki_root, title=title)


def _patch_canonical_source_frontmatter(path: Path, source_record: SourceRecord) -> None:
    text = path.read_text(encoding="utf-8")
    replacements = {
        "source_pdf": str(source_record.managed_path),
        "source_id": source_record.source_id,
        "source_registry": str(source_record.registry_path),
    }
    for key, value in replacements.items():
        text = _replace_or_insert_frontmatter_scalar(text, key, value)
    text = _replace_or_insert_frontmatter_list(text, "sources", [str(source_record.managed_path)])
    path.write_text(text, encoding="utf-8")


def _replace_or_insert_frontmatter_scalar(text: str, key: str, value: str) -> str:
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        return text
    rendered = f'{key}: "{_escape(value)}"'
    for index in range(1, len(lines)):
        if lines[index] == "---":
            lines.insert(index, rendered)
            return "\n".join(lines) + "\n"
        if lines[index].startswith(f"{key}:"):
            lines[index] = rendered
            return "\n".join(lines) + "\n"
    return text


def _replace_or_insert_frontmatter_list(text: str, key: str, values: list[str]) -> str:
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        return text
    start = None
    end = None
    for index in range(1, len(lines)):
        if lines[index] == "---":
            end = index
            break
        if lines[index].startswith(f"{key}:"):
            start = index
            end = index + 1
            while end < len(lines) and lines[end].startswith("  - "):
                end += 1
            break
    rendered = [f"{key}:"] + [f'  - "{_escape(value)}"' for value in values]
    if start is not None and end is not None:
        lines[start:end] = rendered
        return "\n".join(lines) + "\n"
    for index in range(1, len(lines)):
        if lines[index] == "---":
            lines[index:index] = rendered
            return "\n".join(lines) + "\n"
    return text


def _record_title(record: dict[str, Any], type_name: str) -> str:
    if type_name == "claim":
        return str(record.get("claim") or record.get("id") or "Claim")
    return str(record.get("name") or record.get("summary") or record.get("id") or type_name.title())


def _format_provenance(items: list[dict[str, Any]]) -> str:
    if not items:
        return "not recorded"
    chunks = []
    for item in items:
        page = item.get("page")
        locator = item.get("locator")
        if page and locator:
            chunks.append(f"p. {page} ({locator})")
        elif page:
            chunks.append(f"p. {page}")
        elif locator:
            chunks.append(str(locator))
    return "; ".join(chunks) if chunks else "not recorded"


def _join(value: object) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value) if value else "none recorded"
    return str(value or "none recorded")


def _created_date(run: dict[str, Any]) -> str:
    created = str(run.get("created_at") or "")
    return created[:10] if len(created) >= 10 else datetime.now(timezone.utc).date().isoformat()


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    records = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if stripped:
                records.append(json.loads(stripped))
    return records
