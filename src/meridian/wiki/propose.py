"""Agent-facing submission of Wiki claim proposals (spec 2026-09-14, interface.md).

Builds the non-human proposal envelope, validates it locally, computes the
`base` page versions, and writes it atomically to the App's proposal inbox.
Everything past that point — staleness, anchor/quote verification, review,
and the actual write — is Core's job (interface.md "On-disk transport").
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any

from meridian.wiki.claims import ProposalValidationError, validate_claim_ops
from meridian.wiki.pages import page_version, resolve_vault_root

PROTOCOL_VERSION = 1
PRODUCER_ID = "skill.meridian"


def submit_wiki_proposal(
    *,
    wiki_root: Path,
    ops: list[dict[str, Any]],
    title: str,
    project: str,
    node: str | None = None,
    rationale: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Validate a claim-only proposal and write it to `.meridian/proposal-inbox/`."""
    if not isinstance(title, str) or not title.strip():
        raise ProposalValidationError("title is required")
    if not isinstance(project, str) or not project.strip():
        raise ProposalValidationError("trigger.project is required: a conclusion comes from a project")
    validate_claim_ops(ops)

    vault_root = resolve_vault_root(wiki_root)
    named_pages = _named_pages(ops)
    base = {page: page_version(wiki_root / f"{page}.md") for page in named_pages}

    key = f"{_slugify(title)}-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    producer: dict[str, Any] = {"kind": "ai", "id": PRODUCER_ID}
    if model:
        producer["model"] = model
    trigger: dict[str, Any] = {"kind": "experiment", "project": project}
    if node:
        trigger["node"] = node

    envelope: dict[str, Any] = {
        "protocol": PROTOCOL_VERSION,
        "key": key,
        "producer": producer,
        "trigger": trigger,
        "title": title,
        "base": base,
        "ops": ops,
    }
    if rationale:
        envelope["rationale"] = rationale

    inbox_dir = vault_root / ".meridian" / "proposal-inbox"
    inbox_dir.mkdir(parents=True, exist_ok=True)
    target = inbox_dir / f"{key}.json"
    tmp_path = target.with_name(f".{target.name}.tmp")
    tmp_path.write_text(json.dumps(envelope, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp_path, target)

    return {"key": key, "path": str(target), "named_pages": named_pages, "envelope": envelope}


def _named_pages(ops: list[dict[str, Any]]) -> list[str]:
    """Pages an op names directly, plus a page a claim ref inside it points at (spec sec 2.1)."""
    pages: list[str] = []
    for op in ops:
        page = op.get("page")
        if isinstance(page, str):
            pages.append(page)
        conflict = op.get("conflict")
        if isinstance(conflict, dict):
            against = conflict.get("against")
            if isinstance(against, dict) and against.get("kind") == "claim":
                ref = str(against.get("ref") or "")
                if "#" in ref:
                    pages.append(ref.split("#", 1)[0])
    seen: list[str] = []
    for page in pages:
        if page not in seen:
            seen.append(page)
    return seen


def _slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return slug[:60] or "proposal"
