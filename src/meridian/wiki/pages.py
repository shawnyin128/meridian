"""Read-only access to the new-format Paper Wiki (aggregation design, 2026-09-09 / -14).

A wiki has a `schema.yaml`, paper pages under `papers/`, and aggregation pages
under each kind's directory (e.g. `topics/`, `methods/`). This module resolves
a page reference, exposes its links (parents/children/members), and computes
the page-version fingerprint the write protocol uses to detect a stale base
(spec `2026-09-14-wiki-write-protocol-design.md` sec 3.2).

Page listing and frontmatter parsing are done by
`meridian.mcp.app_library.app_native_catalog_records`, which every read-only
MCP tool (`context`, `read`, `trace`) shares.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

_GENERATED_START = re.compile(r"^\s*<!--\s*generated:([^>]*?)\s*-->\s*$")
_GENERATED_END = re.compile(r"^\s*<!--\s*/generated\s*-->\s*$")


def _default_records(wiki_root: Path) -> list[dict[str, Any]]:
    # Deferred import: meridian.mcp.app_library sits above this module (it is imported by
    # meridian.mcp.adapter, which imports this module), so importing it at module load time
    # would be circular.
    from meridian.mcp.app_library import app_native_catalog_records

    return app_native_catalog_records(wiki_root)


def resolve_vault_root(wiki_root: Path) -> Path:
    """Return the library root: the parent of `wiki/` (interface.md 0.0.14)."""
    return wiki_root.parent


def resolve_page(wiki_root: Path, page: str, *, records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Find a page record by id, relative path, title, or alias.

    Raises ``FileNotFoundError`` when nothing matches and ``ValueError`` when
    more than one page matches an ambiguous title.
    """
    raw = page.strip()
    if not raw:
        raise ValueError("page must not be empty")
    normalized = _norm(raw.removesuffix(".md"))
    records = records if records is not None else _default_records(wiki_root)
    for record in records:
        candidates = [
            str(record.get("page_id") or ""),
            str(record.get("relative_path") or "").removesuffix(".md"),
            str(record.get("title") or ""),
            *[str(item) for item in (record.get("routing") or {}).get("aliases") or []],
        ]
        if any(_norm(item.removesuffix(".md")) == normalized for item in candidates):
            return record
    matches = [record for record in records if normalized in _norm(str(record.get("title") or ""))]
    if len(matches) == 1:
        return matches[0]
    if matches:
        titles = ", ".join(str(item.get("relative_path")) for item in matches[:8])
        raise ValueError(f"ambiguous page reference: {page}; candidates: {titles}")
    raise FileNotFoundError(f"wiki page not found: {page}")


def page_children(wiki_root: Path, page_id: str, *, records: list[dict[str, Any]] | None = None) -> list[dict[str, str]]:
    """Return other aggregations whose `parents` include this page."""
    items = records if records is not None else _default_records(wiki_root)
    children = []
    for record in items:
        frontmatter = record.get("raw_frontmatter") or {}
        parents = [str(value) for value in frontmatter.get("parents") or []]
        if page_id in parents:
            children.append({"id": str(record["page_id"]), "title": str(record.get("title") or record["page_id"])})
    return children


def page_members(wiki_root: Path, page_id: str, *, records: list[dict[str, Any]] | None = None) -> list[dict[str, str]]:
    """Return papers whose memberships include this page."""
    items = records if records is not None else _default_records(wiki_root)
    members = []
    for record in items:
        for membership in record.get("_memberships") or []:
            if str(membership.get("id")) == page_id:
                members.append({"id": str(record["page_id"]), "title": str(record.get("title") or record["page_id"])})
                break
    return members


def generated_regions(body_text: str) -> tuple[dict[str, str], str]:
    """Split a page body into its named generated regions and the trailing prose.

    Returns ``(regions, prose)`` where ``regions`` maps a generated region's
    name (e.g. ``children``, ``table``, ``claims``) to its rendered content
    with the HTML comment markers removed, and ``prose`` is everything after
    the last region, unchanged.
    """
    lines = body_text.split("\n")
    regions: dict[str, str] = {}
    prose_lines: list[str] = []
    current_name: str | None = None
    current_lines: list[str] = []
    for line in lines:
        if current_name is None:
            start = _GENERATED_START.match(line)
            if start:
                current_name = start.group(1).strip() or f"region{len(regions) + 1}"
                current_lines = []
                continue
            prose_lines.append(line)
        else:
            if _GENERATED_END.match(line):
                regions[current_name] = "\n".join(current_lines).strip()
                current_name = None
                current_lines = []
            else:
                current_lines.append(line)
    if current_name is not None:
        # Unterminated region: keep it out of prose rather than losing the marker silently.
        regions[current_name] = "\n".join(current_lines).strip()
    return regions, "\n".join(prose_lines).strip()


def fingerprint_parts(text: str) -> tuple[str, str]:
    """Extract the exact `(fm, body)` text the page-version fingerprint hashes (spec sec 3.2).

    ``fm`` is the frontmatter with `\\r\\n` normalized to `\\n` and every
    top-level ``updated:`` line removed. ``body`` is everything after the
    closing fence with each ``<!-- generated:NAME -->``...``<!-- /generated
    -->`` run removed, then trimmed. A page without frontmatter has an empty
    ``fm``.
    """
    normalized = text.replace("\r\n", "\n")
    fm_text, body_text = _split_frontmatter(normalized)
    fm_lines = [line for line in fm_text.split("\n") if not line.startswith("updated:")]
    fm = "\n".join(fm_lines)
    body_lines, in_region = [], False
    for line in body_text.split("\n"):
        if not in_region and _GENERATED_START.match(line):
            in_region = True
            continue
        if in_region:
            if _GENERATED_END.match(line):
                in_region = False
            continue
        body_lines.append(line)
    body = "\n".join(body_lines).strip()
    return fm, body


def fingerprint_text(text: str) -> dict[str, str]:
    """Hash `fingerprint_parts(text)` into the `{fm, body}` page-version fingerprint."""
    fm, body = fingerprint_parts(text)
    return {"fm": _sha16(fm), "body": _sha16(body)}


def page_version(path: Path) -> dict[str, str] | None:
    """Compute a page's `{fm, body}` fingerprint (spec sec 3.2), or ``None`` if it does not exist."""
    if not path.is_file():
        return None
    return fingerprint_text(path.read_text(encoding="utf-8"))


def _split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        return "", text
    end = text.find("\n---", 4)
    if end == -1:
        return "", text
    close_line_end = text.find("\n", end + 1)
    body_start = close_line_end + 1 if close_line_end != -1 else len(text)
    return text[4:end], text[body_start:]


def _sha16(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())
