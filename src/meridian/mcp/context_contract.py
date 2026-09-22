from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CONTEXT_SCHEMA_VERSION = "meridian.context.v1"

_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+#/-]*|[\u3400-\u9fff]")


def build_context_packet(
    *,
    query: str,
    results: list[dict[str, Any]],
    layout: str,
    top_k: int,
    max_chars_per_result: int,
    warnings: list[str],
    records_by_id: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build the stable context packet shared by MCP and future Core callbacks."""
    records = records_by_id or {}
    items = [
        _context_result(
            result,
            record=records.get(str(result.get("page_id") or "")),
            query=query,
            max_chars=max_chars_per_result,
        )
        for result in results
    ]
    return {
        "schema_version": CONTEXT_SCHEMA_VERSION,
        "query": query,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {"kind": "paper_wiki", "layout": layout},
        "budget": {
            "max_results": top_k,
            "max_chars_per_result": max_chars_per_result,
            "returned_results": len(items),
            "result_limit_reached": len(items) >= top_k,
        },
        "results": items,
        "warnings": warnings,
    }


def _context_result(
    result: dict[str, Any],
    *,
    record: dict[str, Any] | None,
    query: str,
    max_chars: int,
) -> dict[str, Any]:
    relative_path = str(result.get("canonical_path") or result.get("relative_path") or "")
    page_id = str(result.get("page_id") or Path(relative_path).with_suffix("").as_posix())
    result_type = str(result.get("result_type") or result.get("type") or "paper")
    section_chars = max(80, int(max_chars * 0.35))
    sections = _selected_sections(result=result, record=record, query=query, max_chars=section_chars)
    excerpt_chars = max(1, max_chars - sum(len(item["snippet"]) for item in sections))
    excerpt_source = _record_excerpt(record, result) or (sections[0]["snippet"] if sections else "")
    provenance = _provenance(result=result, record=record, relative_path=relative_path)
    selection_reasons = [str(item) for item in result.get("selection_reasons") or []]
    candidate_reason = str((record or {}).get("_candidate_reason") or "")
    if candidate_reason and candidate_reason not in selection_reasons:
        selection_reasons.append(candidate_reason)
    return {
        "id": f"wiki:{page_id}",
        "uri": f"meridian://wiki/{page_id}",
        "title": str(result.get("title") or page_id),
        "result_type": result_type,
        "knowledge_role": str(result.get("knowledge_role") or _knowledge_role(result_type)),
        "score": float(result.get("score") or 0.0),
        "selection_reasons": selection_reasons,
        "excerpt": _trim(excerpt_source, max_chars=excerpt_chars),
        "sections": sections,
        "memberships": list((record or {}).get("_memberships") or []),
        "provenance": provenance,
    }


def _selected_sections(
    *,
    result: dict[str, Any],
    record: dict[str, Any] | None,
    query: str,
    max_chars: int,
) -> list[dict[str, Any]]:
    matched = []
    for item in result.get("matched_sections") or []:
        heading = str(item.get("heading") or "").strip()
        snippet = str(item.get("snippet") or "").strip()
        if heading and snippet:
            matched.append(
                {
                    "heading": heading,
                    "snippet": _trim(snippet, max_chars=max_chars),
                    "score": float(item.get("score") or 0.0),
                    "layer": _section_layer(heading),
                }
            )
    if matched:
        return matched[:2]

    raw_sections = (record or {}).get("_section_contents") or {}
    if not isinstance(raw_sections, dict):
        return []
    query_tokens = _tokens(query)
    ranked = []
    for order, (heading, content) in enumerate(raw_sections.items()):
        text = str(content).strip()
        if not text:
            continue
        overlap = len(query_tokens & _tokens(f"{heading} {text}"))
        ranked.append((overlap, -order, str(heading), text))
    ranked.sort(reverse=True)
    return [
        {
            "heading": heading,
            "snippet": _trim(text, max_chars=max_chars),
            "score": float(overlap),
            "layer": _section_layer(heading),
        }
        for overlap, _order, heading, text in ranked[:2]
    ]


def _provenance(
    *,
    result: dict[str, Any],
    record: dict[str, Any] | None,
    relative_path: str,
) -> dict[str, Any]:
    source = record or result
    provenance: dict[str, Any] = {"canonical_path": relative_path}
    for key in ("source_id", "source_pdf"):
        value = source.get(key) or result.get(key)
        if value not in (None, ""):
            provenance[key] = str(value)
    sources = _strings(source.get("sources") or result.get("sources"))
    if sources:
        provenance["sources"] = sources
    trust = {
        key: str(value)
        for key in (
            "confidence",
            "review_state",
            "quality_state",
            "validation_state",
            "trust_state",
            "evolution_state",
        )
        if (value := source.get(key) or result.get(key)) not in (None, "")
    }
    if trust:
        provenance["trust"] = trust
    return provenance


def _record_excerpt(record: dict[str, Any] | None, result: dict[str, Any]) -> str:
    if record:
        for candidate in (record.get("abstract"), record.get("_body")):
            if candidate:
                return str(candidate)
    return str(result.get("title") or "")


def _section_layer(heading: str) -> str:
    normalized = heading.strip().lower()
    if normalized in {"user insights", "user insight provenance", "user ideas / decisions"}:
        return "user_insight"
    if normalized in {"wiki synthesis", "personalized interpretation", "cross-paper connections"}:
        return "wiki_synthesis"
    if normalized in {"open questions", "unresolved", "未解决"}:
        return "open_question"
    if normalized in {
        "source facts",
        "evidence map",
        "evidence / provenance",
        "supporting evidence",
        "contradicting evidence",
    }:
        return "source_fact"
    return "page_content"


def _knowledge_role(result_type: str) -> str:
    return "paper_analysis" if result_type == "paper" else "compiled_knowledge"


def _tokens(value: str) -> set[str]:
    return {token.lower() for token in _TOKEN.findall(value)}


def _strings(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item not in (None, "")]
    if value in (None, ""):
        return []
    return [str(value)]


def _trim(value: str, *, max_chars: int) -> str:
    compact = re.sub(r"\n{3,}", "\n\n", value.strip())
    if len(compact) <= max_chars:
        return compact
    return compact[: max_chars - 1].rstrip() + "…"
