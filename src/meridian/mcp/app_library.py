from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from meridian.wiki.corpus import parse_frontmatter, split_sections, strip_frontmatter

_CANONICAL_DIRS = ("papers", "syntheses", "methods", "topics", "concepts", "claims", "evidence")
_GENERATED_REGION = re.compile(
    r"<!-- generated:[^>]+-->.*?<!-- /generated -->",
    flags=re.DOTALL,
)
_SEARCH_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+#/-]*|[\u3400-\u9fff]")
_CATALOG_CACHE: dict[str, tuple[tuple[tuple[str, int, int], ...], list[dict[str, Any]]]] = {}
_CATALOG_CACHE_LIMIT = 8


def is_app_native_wiki(wiki_root: Path) -> bool:
    """Return whether a wiki carries the desktop aggregation schema."""
    schema_path = wiki_root / "schema.yaml"
    if not schema_path.is_file():
        return False
    try:
        schema = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
    except yaml.YAMLError:
        return False
    return isinstance(schema, dict) and isinstance(schema.get("kinds"), dict)


def app_native_catalog_records(wiki_root: Path) -> list[dict[str, Any]]:
    """Read the desktop Markdown layout into retrieval catalog records without writing indexes."""
    schema_path = wiki_root / "schema.yaml"
    schema = yaml.safe_load(schema_path.read_text(encoding="utf-8")) or {}
    kinds = schema.get("kinds") if isinstance(schema, dict) else {}
    kind_dirs = {
        str(spec.get("dir")): str(kind)
        for kind, spec in (kinds or {}).items()
        if isinstance(spec, dict) and spec.get("dir")
    }
    directories = list(dict.fromkeys([*_CANONICAL_DIRS, *kind_dirs.keys()]))
    signature = _catalog_signature(wiki_root=wiki_root, schema_path=schema_path, directories=directories)
    cache_key = str(wiki_root.resolve())
    cached = _CATALOG_CACHE.get(cache_key)
    if cached is not None and cached[0] == signature:
        return cached[1]
    pages: dict[str, dict[str, Any]] = {}
    for directory in directories:
        source_dir = wiki_root / directory
        if not source_dir.is_dir():
            continue
        for path in sorted(source_dir.glob("*.md")):
            relative_path = path.relative_to(wiki_root).as_posix()
            page_id = path.relative_to(wiki_root).with_suffix("").as_posix()
            text = path.read_text(encoding="utf-8")
            frontmatter = parse_frontmatter(text)
            body = _GENERATED_REGION.sub("", strip_frontmatter(text)).strip()
            result_type = str(
                frontmatter.get("type")
                or frontmatter.get("kind")
                or kind_dirs.get(directory)
                or directory.rstrip("s")
            )
            pages[page_id] = {
                "page_id": page_id,
                "path": str(path),
                "relative_path": relative_path,
                "canonical_path": relative_path,
                "title": str(frontmatter.get("title") or path.stem),
                "type": result_type,
                "corpus_type": directory,
                "knowledge_role": "paper_analysis" if result_type == "paper" else "compiled_knowledge",
                "frontmatter": frontmatter,
                "_body": body,
                "_section_contents": split_sections(body),
            }

    records = []
    for page_id, page in pages.items():
        frontmatter = page["frontmatter"]
        memberships = _memberships(frontmatter.get("memberships"), pages=pages)
        result_type = str(page["type"])
        topics = [item["title"] for item in memberships if item["kind"] == "topic"]
        methods = [item["title"] for item in memberships if item["kind"] == "method"]
        body = str(page["_body"])
        routing = {
            "aliases": _strings(frontmatter.get("aliases")),
            "topics": _dedupe([*_strings(frontmatter.get("topics")), *topics]),
            "methods": _dedupe([*_strings(frontmatter.get("methods")), *methods]),
            "settings": _strings(frontmatter.get("settings")),
            "models": _strings(frontmatter.get("models")),
            "datasets": _strings(frontmatter.get("datasets")),
            "metrics": _strings(frontmatter.get("metrics")),
            "claims": _dedupe([
                *_strings(frontmatter.get("claims")),
                *_strings(frontmatter.get("abstract")),
                body,
            ]),
            "prerequisite_for": _strings(frontmatter.get("prerequisite_for")),
            "related_methods": _strings(frontmatter.get("related_methods")),
            "related_topics": _strings(frontmatter.get("related_topics")),
            "related_concepts": _strings(frontmatter.get("related_concepts")),
        }
        record = {
            key: value
            for key, value in page.items()
            if key != "frontmatter"
        }
        record.update(
            {
                "routing": routing,
                "raw_frontmatter": frontmatter,
                "status": frontmatter.get("status"),
                "review_state": frontmatter.get("review_state"),
                "quality_gate": frontmatter.get("quality_gate"),
                "quality_state": frontmatter.get("quality_state"),
                "validation_state": frontmatter.get("validation_state"),
                "trust_state": frontmatter.get("trust_state"),
                "confidence": frontmatter.get("confidence"),
                "source_id": frontmatter.get("source_id"),
                "source_pdf": frontmatter.get("source_pdf") or frontmatter.get("pdf"),
                "sources": _strings(frontmatter.get("sources")),
                "source_papers": _strings(frontmatter.get("source_papers")),
                "related_papers": _strings(frontmatter.get("related_papers")),
                "related_methods": _strings(frontmatter.get("related_methods")),
                "related_topics": _strings(frontmatter.get("related_topics")),
                "related_claims": _strings(frontmatter.get("related_claims")),
                "related_evidence": _strings(frontmatter.get("related_evidence")),
                "related_concepts": _strings(frontmatter.get("related_concepts")),
                "prerequisite_for": _strings(frontmatter.get("prerequisite_for")),
                "evolution_state": frontmatter.get("evolution_state"),
                "evolution_markers": _strings(frontmatter.get("evolution_markers")),
                "updated": frontmatter.get("updated"),
                "abstract": frontmatter.get("abstract"),
                "_memberships": memberships,
                "section_headings": list(page["_section_contents"].keys()),
            }
        )
        records.append(record)
    if len(_CATALOG_CACHE) >= _CATALOG_CACHE_LIMIT and cache_key not in _CATALOG_CACHE:
        _CATALOG_CACHE.pop(next(iter(_CATALOG_CACHE)))
    _CATALOG_CACHE[cache_key] = (signature, records)
    return records


def app_native_candidates(
    records: list[dict[str, Any]],
    *,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    """Prefilter an App library and retain membership neighbors for precise, bounded ranking."""
    query_tokens = _tokens(query)
    query_text = " ".join(query.lower().split())
    scored = [
        (_search_score(record, query_tokens=query_tokens, query_text=query_text), order, record)
        for order, record in enumerate(records)
    ]
    seeds = [item for item in sorted(scored, key=lambda item: (-item[0], item[1])) if item[0] > 0]
    seed_ids = {str(item[2]["page_id"]) for item in seeds[:limit]}
    related_ids = set(seed_ids)
    for record in records:
        page_id = str(record["page_id"])
        targets = {str(item["id"]) for item in record.get("_memberships") or []}
        if page_id in seed_ids or targets & seed_ids:
            related_ids.update(targets)
            related_ids.add(page_id)
    candidates = [
        record
        for _score, _order, record in seeds
        if str(record["page_id"]) in related_ids
    ]
    held = {str(record["page_id"]) for record in candidates}
    candidates.extend(
        record
        for record in records
        if str(record["page_id"]) in related_ids and str(record["page_id"]) not in held
    )
    return [
        {
            **record,
            "_candidate_reason": (
                "lexical match" if str(record["page_id"]) in seed_ids else "membership neighbor of lexical match"
            ),
        }
        for record in candidates[:limit]
    ]


def _memberships(value: Any, *, pages: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    memberships = []
    for item in value:
        if not isinstance(item, dict) or not item.get("in"):
            continue
        target_id = str(item["in"])
        target = pages.get(target_id)
        memberships.append(
            {
                "id": target_id,
                "kind": str((target or {}).get("type") or "unknown"),
                "title": str((target or {}).get("title") or target_id),
            }
        )
    return memberships


def _catalog_signature(
    *,
    wiki_root: Path,
    schema_path: Path,
    directories: list[str],
) -> tuple[tuple[str, int, int], ...]:
    paths = [schema_path]
    for directory in directories:
        source_dir = wiki_root / directory
        if source_dir.is_dir():
            paths.extend(sorted(source_dir.glob("*.md")))
    return tuple(
        (path.relative_to(wiki_root).as_posix(), stat.st_mtime_ns, stat.st_size)
        for path in paths
        if path.is_file()
        for stat in [path.stat()]
    )


def _search_score(record: dict[str, Any], *, query_tokens: set[str], query_text: str) -> float:
    title = str(record.get("title") or "")
    routing = record.get("routing") or {}
    routed = " ".join(
        str(item)
        for values in routing.values()
        for item in (values if isinstance(values, list) else [values])
    )
    title_tokens = _tokens(title)
    routed_tokens = _tokens(routed)
    score = len(query_tokens & title_tokens) * 5.0 + len(query_tokens & routed_tokens) * 2.0
    if query_text and query_text in title.lower():
        score += 12.0
    elif query_text and query_text in routed.lower():
        score += 5.0
    return score


def _tokens(value: str) -> set[str]:
    return {token.lower() for token in _SEARCH_TOKEN.findall(value)}


def _strings(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item not in (None, "")]
    if value in (None, ""):
        return []
    return [str(value)]


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value.strip()))
