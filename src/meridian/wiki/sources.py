from __future__ import annotations

import hashlib
import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SourceRecord:
    source_id: str
    source_type: str
    title: str | None
    original_path: Path
    managed_path: Path
    sha256: str
    registry_path: Path

    def to_json(self) -> dict[str, Any]:
        return {
            "schema_version": "paper_source.v0",
            "source_id": self.source_id,
            "source_type": self.source_type,
            "title": self.title,
            "original_path": str(self.original_path),
            "managed_path": str(self.managed_path),
            "sha256": self.sha256,
            "registered_at": datetime.now(timezone.utc).isoformat(),
        }


def infer_wiki_root_from_out_dir(out_dir: Path) -> Path | None:
    parts = out_dir.resolve().parts
    if ".drafts" not in parts:
        return None
    index = parts.index(".drafts")
    if index == 0:
        return None
    return Path(*parts[:index])


def register_pdf_source(
    pdf_path: Path,
    wiki_root: Path,
    title: str | None = None,
    source_root: Path | None = None,
) -> SourceRecord:
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF does not exist: {pdf_path}")
    digest = _sha256(pdf_path)
    source_id = f"paper-pdf-{digest[:12]}"
    sources_root = source_root or wiki_root / "raw" / "sources"
    papers_dir = sources_root / "papers"
    papers_dir.mkdir(parents=True, exist_ok=True)
    managed_path = papers_dir / f"{source_id}-{_slugify(title or pdf_path.stem)}.pdf"
    if not managed_path.exists():
        shutil.copy2(pdf_path, managed_path)

    registry_path = sources_root / "sources.jsonl"
    record = SourceRecord(
        source_id=source_id,
        source_type="paper_pdf",
        title=title,
        original_path=pdf_path,
        managed_path=managed_path,
        sha256=digest,
        registry_path=registry_path,
    )
    _upsert_registry_record(registry_path, record)
    return record


def _sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _upsert_registry_record(path: Path, record: SourceRecord) -> None:
    records: list[dict[str, Any]] = []
    if path.exists():
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if not stripped:
                    continue
                payload = json.loads(stripped)
                if payload.get("source_id") != record.source_id:
                    records.append(payload)
    records.append(record.to_json())
    with path.open("w", encoding="utf-8") as handle:
        for payload in records:
            handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def _slugify(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-")
    return slug[:96] or "paper"
