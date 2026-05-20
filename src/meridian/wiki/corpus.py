from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CATALOG_SCHEMA_VERSION = "meridian.paper_catalog.v0"
CONTEXT_PACKET_SCHEMA_VERSION = "meridian.retrieval_context.v0"

ROUTING_FIELDS = (
    "aliases",
    "topics",
    "methods",
    "settings",
    "models",
    "datasets",
    "metrics",
    "claims",
)

SECTION_WEIGHTS = {
    "What To Remember": 3.0,
    "When To Retrieve This Paper": 2.8,
    "Paper Positioning": 1.6,
    "Mechanism": 2.6,
    "Mechanism Details To Verify": 2.1,
    "Evidence Map": 2.2,
    "Implementation Hooks": 2.4,
    "Limitations / Uncertainty": 1.6,
}

INTENT_SECTION_TERMS = {
    "Mechanism": {"mechanism", "design", "method", "component", "how"},
    "Mechanism Details To Verify": {"verify", "equivalent", "invariant", "equation", "transform", "preserve", "detail"},
    "Evidence Map": {"evidence", "throughput", "speedup", "memory", "latency", "systems", "kernel", "cpu", "gpu", "benchmark"},
    "Implementation Hooks": {"implement", "implementation", "ablation", "ablations", "probe", "sanity", "code", "baseline"},
    "Limitations / Uncertainty": {"scope", "limitation", "limitations", "valid", "regime", "assumption", "transfer", "distinction"},
}


@dataclass(frozen=True)
class CatalogResult:
    catalog_path: Path
    count: int


@dataclass(frozen=True)
class RetrievalResult:
    packet_path: Path | None
    result_path: Path | None
    results: list[dict[str, Any]]


def build_paper_catalog(*, wiki_root: Path, out_path: Path | None = None) -> CatalogResult:
    papers_dir = wiki_root / "papers"
    if not papers_dir.exists():
        raise FileNotFoundError(f"wiki papers directory does not exist: {papers_dir}")

    catalog_path = out_path or wiki_root / ".index" / "papers.jsonl"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)

    records = [_catalog_record(path, wiki_root=wiki_root) for path in sorted(papers_dir.glob("*.md"))]
    with catalog_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")

    return CatalogResult(catalog_path=catalog_path, count=len(records))


def retrieve_papers(
    *,
    query: str,
    wiki_root: Path,
    catalog_path: Path | None = None,
    top_k: int = 5,
    packet_path: Path | None = None,
    result_path: Path | None = None,
) -> RetrievalResult:
    if not query.strip():
        raise ValueError("query must not be empty")
    if top_k < 1:
        raise ValueError("top_k must be >= 1")

    catalog = _load_or_build_catalog(wiki_root=wiki_root, catalog_path=catalog_path)
    scored = [_score_record(record, query=query, wiki_root=wiki_root) for record in catalog]
    results = [item for item in sorted(scored, key=lambda payload: (-payload["score"], payload["title"])) if item["score"] > 0]
    results = results[:top_k]

    packet = _render_context_packet(query=query, results=results, wiki_root=wiki_root)
    if packet_path is not None:
        packet_path.parent.mkdir(parents=True, exist_ok=True)
        packet_path.write_text(packet, encoding="utf-8")
    if result_path is not None:
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text(
            json.dumps(
                {
                    "schema_version": CONTEXT_PACKET_SCHEMA_VERSION,
                    "query": query,
                    "wiki_root": str(wiki_root),
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "results": results,
                },
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
    return RetrievalResult(packet_path=packet_path, result_path=result_path, results=results)


def _catalog_record(path: Path, *, wiki_root: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(text)
    body = strip_frontmatter(text)
    sections = split_sections(body)
    rel_path = path.relative_to(wiki_root)
    title = str(frontmatter.get("title") or path.stem)

    return {
        "schema_version": CATALOG_SCHEMA_VERSION,
        "page_id": rel_path.with_suffix("").as_posix(),
        "path": str(path),
        "relative_path": rel_path.as_posix(),
        "title": title,
        "type": frontmatter.get("type"),
        "status": frontmatter.get("status"),
        "review_state": frontmatter.get("review_state"),
        "quality_gate": frontmatter.get("quality_gate"),
        "confidence": frontmatter.get("confidence"),
        "source_id": frontmatter.get("source_id"),
        "source_pdf": frontmatter.get("source_pdf"),
        "source_registry": frontmatter.get("source_registry"),
        "updated": frontmatter.get("updated"),
        "routing": {field: _as_list(frontmatter.get(field)) for field in ROUTING_FIELDS},
        "section_headings": list(sections.keys()),
        "section_previews": {
            heading: _preview(content, limit=700)
            for heading, content in sections.items()
            if heading in SECTION_WEIGHTS
        },
    }


def _load_or_build_catalog(*, wiki_root: Path, catalog_path: Path | None) -> list[dict[str, Any]]:
    effective_path = catalog_path or wiki_root / ".index" / "papers.jsonl"
    if not effective_path.exists():
        build_paper_catalog(wiki_root=wiki_root, out_path=effective_path)
    records = []
    with effective_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if stripped:
                records.append(json.loads(stripped))
    return records


def _score_record(record: dict[str, Any], *, query: str, wiki_root: Path) -> dict[str, Any]:
    query_tokens = _tokens(query)
    query_norm = _norm(query)
    path = Path(str(record["path"]))
    if not path.is_absolute() and not path.exists():
        path = wiki_root / path
    body = strip_frontmatter(path.read_text(encoding="utf-8"))
    sections = split_sections(body)

    score = 0.0
    matched_fields: dict[str, list[str]] = {}
    reasons: list[str] = []

    title = str(record.get("title") or "")
    title_hits = _text_score(query_tokens, query_norm, title, weight=4.0)
    if title_hits > 0:
        score += title_hits
        reasons.append("title/alias match")
    identity_hits = _identity_boost(query_norm, title, _as_list((record.get("routing") or {}).get("aliases")))
    if identity_hits > 0:
        score += identity_hits
        reasons.append("exact identity match")

    routing = record.get("routing") or {}
    field_weights = {
        "aliases": 4.0,
        "methods": 5.0,
        "topics": 4.4,
        "settings": 4.0,
        "datasets": 3.5,
        "metrics": 3.0,
        "models": 2.5,
        "claims": 1.6,
    }
    for field, values in routing.items():
        hits = []
        for value in _as_list(values):
            field_score = _phrase_score(query_tokens, query_norm, str(value), weight=field_weights.get(field, 1.0))
            if field_score > 0:
                score += field_score
                hits.append(str(value))
        if hits:
            matched_fields[field] = _dedupe(hits)
            reasons.append(f"frontmatter {field}")

    section_hits = []
    for heading, weight in SECTION_WEIGHTS.items():
        content = sections.get(heading, "")
        section_score = _text_score(query_tokens, query_norm, content, weight=weight)
        intent_boost = _section_intent_boost(query_tokens, heading, weight=weight, content=content)
        section_score += intent_boost
        if section_score > 0:
            score += section_score
            section_hits.append(
                {
                    "heading": heading,
                    "score": round(section_score, 3),
                    "snippet": _best_snippet(content, query_tokens),
                }
            )

    return {
        "page_id": record["page_id"],
        "title": title,
        "path": str(path),
        "relative_path": record.get("relative_path"),
        "score": round(score, 3),
        "matched_frontmatter": matched_fields,
        "matched_sections": sorted(section_hits, key=lambda item: -item["score"])[:5],
        "selection_reasons": _dedupe(reasons),
        "routing": record.get("routing") or {},
        "review_state": record.get("review_state"),
        "quality_gate": record.get("quality_gate"),
        "confidence": record.get("confidence"),
        "source_id": record.get("source_id"),
    }


def _section_intent_boost(query_tokens: set[str], heading: str, *, weight: float, content: str) -> float:
    if not content:
        return 0.0
    intent_terms = INTENT_SECTION_TERMS.get(heading, set())
    overlap = query_tokens & intent_terms
    if not overlap:
        return 0.0
    return weight * (3.0 + min(len(overlap), 3) * 1.25)


def _render_context_packet(*, query: str, results: list[dict[str, Any]], wiki_root: Path) -> str:
    lines = [
        "---",
        f'schema_version: "{CONTEXT_PACKET_SCHEMA_VERSION}"',
        f'query: "{query.replace(chr(34), chr(92) + chr(34))}"',
        f'wiki_root: "{wiki_root}"',
        "---",
        f"# Retrieval Context Packet: {query}",
        "",
        "> This packet is a ranked reading plan, not a synthesized answer. Use it to choose wiki pages and sections before answering or writing back.",
        "",
    ]
    if not results:
        lines.extend(["## Results", "", "- No matching paper pages found."])
        return "\n".join(lines).rstrip() + "\n"

    lines.extend(["## Results", ""])
    for index, result in enumerate(results, start=1):
        lines.extend(
            [
                f"### {index}. {result['title']}",
                "",
                f"- Page: `{result.get('relative_path') or result['path']}`",
                f"- Score: `{result['score']}`",
                f"- Review state: `{result.get('review_state')}`; quality gate: `{result.get('quality_gate')}`; confidence: `{result.get('confidence')}`",
                f"- Selection reasons: {', '.join(result.get('selection_reasons') or ['lexical overlap'])}",
                f"- Matched frontmatter: {_format_matched_frontmatter(result.get('matched_frontmatter') or {})}",
                "- Read first:",
            ]
        )
        for section in result.get("matched_sections") or []:
            snippet = str(section.get("snippet") or "").replace("\n", " ")
            lines.append(f"  - `{section['heading']}`: {snippet}")
        if not result.get("matched_sections"):
            lines.append("  - `What To Remember`: inspect the page summary before using this result.")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _format_matched_frontmatter(matches: dict[str, list[str]]) -> str:
    if not matches:
        return "none"
    chunks = []
    for field, values in matches.items():
        chunks.append(f"{field}=[{', '.join(values[:5])}]")
    return "; ".join(chunks)


def _phrase_score(query_tokens: set[str], query_norm: str, value: str, *, weight: float) -> float:
    value_norm = _norm(value)
    if not value_norm:
        return 0.0
    value_tokens = _tokens(value)
    overlap = len(query_tokens & value_tokens)
    if value_norm in query_norm:
        return weight * (2.0 + min(len(value_tokens), 4) * 0.25)
    if overlap == 0:
        return 0.0
    return weight * (overlap / max(len(value_tokens), 1))


def _identity_boost(query_norm: str, title: str, aliases: list[Any]) -> float:
    candidates = [str(alias) for alias in aliases]
    candidates.extend(_title_specific_aliases(title))
    boost = 0.0
    for candidate in _dedupe(candidates):
        if not _is_discriminative_identity(candidate):
            continue
        candidate_norm = _norm(candidate)
        if not candidate_norm:
            continue
        if re.search(rf"\b{re.escape(candidate_norm)}\b", query_norm):
            boost = max(boost, 90.0)
        elif candidate_norm in query_norm:
            boost = max(boost, 60.0)
    return boost


def _title_specific_aliases(title: str) -> list[str]:
    cleaned_title = re.sub(r"^[A-Z][A-Za-z]+(?: et al\.)? - \d{4} - ", "", title)
    aliases = []
    for match in re.findall(r"\b[A-Z][A-Za-z0-9]*(?:[-#][A-Za-z0-9]+)?\b", cleaned_title):
        if _is_discriminative_identity(match):
            aliases.append(match)
    return _dedupe(aliases)[:4]


def _is_discriminative_identity(value: str) -> bool:
    normalized = _norm(value)
    if not normalized or len(normalized) < 4:
        return False
    generic = {
        "post training",
        "quantization aware",
        "outlier free",
        "training free",
        "large language",
        "low bit",
        "weight only",
        "weight activation",
        "activation aware",
        "efficient",
        "fast",
        "simple",
        "technical report",
        "survey",
        "llm",
        "llms",
        "ptq",
        "qat",
        "cpu",
        "gpu",
        "lut",
    }
    if normalized in generic:
        return False
    tokens = normalized.split()
    if len(tokens) > 4:
        return False
    return any(character.isupper() for character in value[1:]) or value.isupper() or any(character.isdigit() for character in value) or "#" in value


def _text_score(query_tokens: set[str], query_norm: str, text: str, *, weight: float) -> float:
    text_norm = _norm(text)
    if not text_norm:
        return 0.0
    score = 0.0
    for token in query_tokens:
        if len(token) > 2 and re.search(rf"\b{re.escape(token)}\b", text_norm):
            score += weight
    if query_norm and query_norm in text_norm:
        score += weight * 4
    return score


def _best_snippet(text: str, query_tokens: set[str], *, limit: int = 260) -> str:
    cleaned = " ".join(text.split())
    if not cleaned:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    ranked = sorted(
        sentences,
        key=lambda sentence: len(_tokens(sentence) & query_tokens),
        reverse=True,
    )
    snippet = ranked[0] if ranked and len(_tokens(ranked[0]) & query_tokens) else cleaned
    return _preview(snippet, limit=limit)


def _preview(text: str, *, limit: int) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip() + "..."


def parse_frontmatter(text: str) -> dict[str, Any]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    lines = text[4:end].splitlines()
    data: dict[str, Any] = {}
    current_key: str | None = None
    for line in lines:
        if not line.strip():
            continue
        if line.startswith("  - ") and current_key:
            data.setdefault(current_key, []).append(_parse_scalar(line[4:].strip()))
            continue
        if ":" not in line:
            continue
        key, raw = line.split(":", 1)
        current_key = key.strip()
        value = raw.strip()
        if not value or value == "[]":
            data[current_key] = []
        else:
            data[current_key] = _parse_scalar(value)
    return data


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---", 4)
    if end == -1:
        return text
    return text[end + 4 :].lstrip()


def split_sections(markdown: str) -> dict[str, str]:
    matches = list(re.finditer(r"^## (.+)$", markdown, flags=re.MULTILINE))
    result: dict[str, str] = {}
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        result[match.group(1).strip()] = markdown[start:end].strip()
    return result


def _parse_scalar(value: str) -> Any:
    if value == "null":
        return None
    if value == "true":
        return True
    if value == "false":
        return False
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return value[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return value


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _tokens(text: str) -> set[str]:
    stop = {
        "the",
        "and",
        "for",
        "that",
        "this",
        "with",
        "from",
        "into",
        "need",
        "want",
        "paper",
        "papers",
        "method",
        "methods",
        "using",
        "about",
        "around",
        "before",
        "after",
    }
    return {token for token in re.findall(r"[a-z0-9]+", text.lower()) if token not in stop and len(token) > 1}


def _norm(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        key = item.lower()
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result
