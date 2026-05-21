from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CATALOG_SCHEMA_VERSION = "meridian.paper_catalog.v0"
SYNTHESIS_CATALOG_SCHEMA_VERSION = "meridian.synthesis_catalog.v1"
KNOWLEDGE_CATALOG_SCHEMA_VERSION = "meridian.knowledge_catalog.v1"
CONTEXT_PACKET_SCHEMA_VERSION = "meridian.retrieval_context.v0"

KNOWLEDGE_DIRECTORIES = ("methods", "topics", "claims", "evidence", "concepts")

ROUTING_FIELDS = (
    "aliases",
    "topics",
    "methods",
    "settings",
    "models",
    "datasets",
    "metrics",
    "claims",
    "prerequisite_for",
    "related_methods",
    "related_topics",
    "related_concepts",
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
    "What This Page Is For": 2.2,
    "Source Facts": 2.8,
    "Wiki Synthesis": 3.0,
    "User Ideas / Decisions": 1.6,
    "Open Questions": 2.0,
    "Retrieval Hooks": 2.8,
    "Publish / Review Notes": 1.2,
    "User Insights": 2.9,
    "What It Is": 2.7,
    "Used By Papers": 2.4,
    "Failure Modes": 2.0,
    "Scope": 2.2,
    "Key Papers": 2.5,
    "Method Families": 2.4,
    "Claims": 2.2,
    "Contradictions": 2.4,
    "Claim": 2.8,
    "Supporting Evidence": 3.0,
    "Contradicting Evidence": 2.8,
    "Provenance": 2.4,
    "Evidence Item": 3.0,
    "Source": 2.6,
    "Metric or Observation": 2.8,
    "Supports": 2.7,
    "Limits": 2.4,
    "Reliability": 2.3,
    "Related Papers": 2.0,
    "Why It Matters": 2.6,
    "Where It Appears": 2.1,
    "Implementation Implications": 2.8,
    "Common Failure Modes": 2.5,
    "Minimal Checks / Probes": 2.9,
    "Evidence / Provenance": 2.6,
    "Related Concepts": 2.0,
    "Prerequisite Concepts": 2.8,
    "Key Concepts": 2.6,
    "Concept Dependencies": 2.6,
}

INTENT_SECTION_TERMS = {
    "Mechanism": {"mechanism", "design", "method", "component", "how", "compare", "comparing", "distinguish", "distinction", "regime"},
    "Mechanism Details To Verify": {"verify", "equivalent", "invariant", "equation", "transform", "preserve", "detail"},
    "Evidence Map": {
        "evidence",
        "evaluation",
        "evaluate",
        "metric",
        "metrics",
        "quality",
        "throughput",
        "speedup",
        "memory",
        "latency",
        "systems",
        "kernel",
        "cpu",
        "gpu",
        "benchmark",
    },
    "Implementation Hooks": {"implement", "implementation", "ablation", "ablations", "probe", "sanity", "code", "baseline"},
    "Source Facts": {"source", "sources", "fact", "facts", "grounded", "paper", "papers", "trace"},
    "Wiki Synthesis": {"synthesis", "overview", "answer", "research", "question", "compare", "comparison", "compiled", "context"},
    "Retrieval Hooks": {"retrieve", "retrieval", "query", "search", "read", "context", "entry"},
    "Limitations / Uncertainty": {
        "scope",
        "limitation",
        "limitations",
        "uncertainty",
        "uncertain",
        "valid",
        "regime",
        "assumption",
        "assumptions",
        "transfer",
        "distinction",
        "boundary",
        "boundaries",
        "failure",
        "failures",
        "tradeoff",
        "tradeoffs",
        "risk",
        "risks",
        "caveat",
        "caveats",
    },
    "User Insights": {"insight", "note", "idea", "implement", "implementation", "ablation", "retrieve", "remember", "connection"},
    "What It Is": {"what", "method", "topic", "mechanism", "overview", "definition"},
    "Used By Papers": {"paper", "papers", "uses", "used", "family", "compare", "survey"},
    "Failure Modes": {"failure", "failures", "limitation", "limitations", "boundary", "risk", "risks"},
    "Scope": {"scope", "overview", "survey", "topic", "family", "boundaries"},
    "Key Papers": {"paper", "papers", "survey", "overview", "baseline", "related"},
    "Claims": {"claim", "claims", "evidence", "support", "contradict"},
    "Contradictions": {"contradict", "conflict", "stale", "superseded", "disagree"},
    "Claim": {"claim", "proves", "argues", "supports", "evidence"},
    "Supporting Evidence": {"support", "supports", "supported", "evidence", "metric", "observation"},
    "Contradicting Evidence": {"contradict", "contradicts", "conflict", "negative", "counter"},
    "Provenance": {"provenance", "source", "paper", "section", "page"},
    "Evidence Item": {"evidence", "support", "supports", "supported", "metric", "observation", "result", "table", "figure"},
    "Source": {"source", "paper", "section", "page", "provenance"},
    "Metric or Observation": {"metric", "observation", "result", "table", "figure", "benchmark"},
    "Supports": {"support", "supports", "claim", "evidence"},
    "Limits": {"limit", "limits", "limitation", "scope", "boundary"},
    "Reliability": {"reliable", "reliability", "confidence", "source", "quality"},
    "Why It Matters": {"why", "matter", "matters", "motivation", "important", "background", "preliminary", "prerequisite"},
    "Where It Appears": {"where", "appears", "paper", "papers", "source", "provenance"},
    "Implementation Implications": {"implement", "implementation", "code", "coding", "baseline", "debug", "design", "ablation", "probe"},
    "Common Failure Modes": {"failure", "failures", "debug", "bug", "risk", "risks", "mismatch", "unstable"},
    "Minimal Checks / Probes": {"check", "checks", "probe", "probes", "sanity", "debug", "ablation", "validate"},
    "Evidence / Provenance": {"evidence", "provenance", "source", "paper", "claim", "support"},
    "Related Concepts": {"concept", "concepts", "background", "preliminary", "prerequisite"},
    "Prerequisite Concepts": {"concept", "concepts", "background", "preliminary", "prerequisite", "before"},
    "Key Concepts": {"concept", "concepts", "overview", "topic", "background", "preliminary"},
    "Concept Dependencies": {"concept", "concepts", "dependency", "dependencies", "prerequisite", "background"},
}

DOMAIN_LEXICON = {
    "quantization": {
        "bit",
        "calibration",
        "codebook",
        "int4",
        "outlier",
        "ptq",
        "qat",
        "quantization",
        "quantizer",
    },
    "long_context_attention": {
        "attention",
        "cache",
        "context",
        "decoding",
        "flashattention",
        "kv",
        "latency",
        "long",
        "sparse",
    },
    "preference_rl": {
        "dpo",
        "human",
        "kl",
        "policy",
        "preference",
        "reinforcement",
        "reward",
        "rlhf",
        "rollout",
        "ttrl",
    },
    "agent_workflow": {
        "agent",
        "commit",
        "environment",
        "executor",
        "planning",
        "rollback",
        "simulation",
        "speculative",
        "tool",
        "verifier",
        "workflow",
    },
    "audio_multimodal": {
        "audio",
        "encoder",
        "language",
        "modality",
        "multimodal",
        "music",
        "qwen",
        "sound",
        "speech",
    },
    "vision_representation": {
        "diffusion",
        "image",
        "jepa",
        "representation",
        "supervised",
        "video",
        "vision",
        "visual",
    },
    "scientific_ml": {
        "autodiff",
        "boundary",
        "collocation",
        "condition",
        "equation",
        "inverse",
        "pde",
        "physics",
        "pinn",
        "residual",
        "scientific",
    },
    "clustering_theory": {
        "assignment",
        "centroid",
        "cluster",
        "clustering",
        "factorization",
        "kmeans",
        "matrix",
        "objective",
        "pca",
    },
}

DOMAIN_ANCHORS = {
    "quantization": {"quantization", "quantizer", "ptq", "qat", "int4", "outlier", "codebook"},
    "long_context_attention": {"kv", "cache", "attention", "context", "decoding", "flashattention"},
    "preference_rl": {"preference", "reward", "rlhf", "ttrl", "rollout", "policy"},
    "agent_workflow": {"agent", "workflow", "tool", "verifier", "rollback", "executor"},
    "audio_multimodal": {"audio", "speech", "music", "sound", "multimodal", "qwen"},
    "vision_representation": {"vision", "visual", "video", "diffusion", "jepa", "representation"},
    "scientific_ml": {"pde", "pinn", "physics", "residual", "collocation", "scientific"},
    "clustering_theory": {"cluster", "clustering", "kmeans", "centroid", "pca", "assignment"},
}

CONTEXT_PACKET_SECTION_LIMIT = 3


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


def build_synthesis_catalog(*, wiki_root: Path, out_path: Path | None = None) -> CatalogResult:
    syntheses_dir = wiki_root / "syntheses"
    if not syntheses_dir.exists():
        raise FileNotFoundError(f"wiki syntheses directory does not exist: {syntheses_dir}")

    catalog_path = out_path or wiki_root / ".index" / "syntheses.jsonl"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)

    records = [
        _catalog_record(path, wiki_root=wiki_root, schema_version=SYNTHESIS_CATALOG_SCHEMA_VERSION)
        for path in sorted(syntheses_dir.glob("*.md"))
    ]
    with catalog_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")

    return CatalogResult(catalog_path=catalog_path, count=len(records))


def build_knowledge_catalogs(*, wiki_root: Path) -> list[CatalogResult]:
    results: list[CatalogResult] = []
    for directory in KNOWLEDGE_DIRECTORIES:
        source_dir = wiki_root / directory
        if not source_dir.exists():
            continue
        catalog_path = wiki_root / ".index" / f"{directory}.jsonl"
        catalog_path.parent.mkdir(parents=True, exist_ok=True)
        records = [
            _catalog_record(path, wiki_root=wiki_root, schema_version=KNOWLEDGE_CATALOG_SCHEMA_VERSION)
            for path in sorted(source_dir.glob("*.md"))
        ]
        with catalog_path.open("w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
        results.append(CatalogResult(catalog_path=catalog_path, count=len(records)))
    return results


def retrieve_papers(
    *,
    query: str,
    wiki_root: Path,
    catalog_path: Path | None = None,
    catalog_records: list[dict[str, Any]] | None = None,
    top_k: int = 5,
    strategy: str = "v1",
    packet_path: Path | None = None,
    result_path: Path | None = None,
) -> RetrievalResult:
    if not query.strip():
        raise ValueError("query must not be empty")
    if top_k < 1:
        raise ValueError("top_k must be >= 1")
    if strategy not in {"v0", "v1"}:
        raise ValueError("strategy must be 'v0' or 'v1'")

    catalog = catalog_records if catalog_records is not None else _load_or_build_catalog(wiki_root=wiki_root, catalog_path=catalog_path)
    query_analysis = _query_analysis(query)
    if strategy == "v0":
        scored = [_score_record(record, query=query, wiki_root=wiki_root) for record in catalog]
    else:
        scored = _score_records_v1(catalog, query=query, query_analysis=query_analysis, wiki_root=wiki_root)
    ranked = [item for item in sorted(scored, key=lambda payload: (-payload["score"], payload["title"])) if item["score"] > 0]
    results = _diversify_v1(ranked, query_analysis=query_analysis, top_k=top_k) if strategy == "v1" else ranked[:top_k]

    packet = _render_context_packet(
        query=query,
        results=results,
        wiki_root=wiki_root,
        strategy=strategy,
        query_analysis=query_analysis if strategy == "v1" else None,
    )
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
                    "strategy": strategy,
                    "query_analysis": query_analysis if strategy == "v1" else None,
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


def _catalog_record(
    path: Path,
    *,
    wiki_root: Path,
    schema_version: str = CATALOG_SCHEMA_VERSION,
) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(text)
    body = strip_frontmatter(text)
    sections = _sections_for_record(body=body, frontmatter=frontmatter)
    rel_path = path.relative_to(wiki_root)
    title = str(frontmatter.get("title") or path.stem)
    linked_source_quality = _linked_source_quality(frontmatter, wiki_root=wiki_root)

    return {
        "schema_version": schema_version,
        "page_id": rel_path.with_suffix("").as_posix(),
        "path": str(path),
        "relative_path": rel_path.as_posix(),
        "title": title,
        "corpus_type": rel_path.parts[0] if rel_path.parts else "",
        "type": frontmatter.get("type"),
        "knowledge_role": _knowledge_role(path=path, frontmatter=frontmatter),
        "status": frontmatter.get("status"),
        "review_state": frontmatter.get("review_state"),
        "quality_gate": frontmatter.get("quality_gate"),
        "quality_state": frontmatter.get("quality_state"),
        "validation_state": frontmatter.get("validation_state"),
        "trust_state": frontmatter.get("trust_state"),
        "confidence": frontmatter.get("confidence"),
        "source_id": frontmatter.get("source_id"),
        "source_pdf": frontmatter.get("source_pdf"),
        "source_registry": frontmatter.get("source_registry"),
        "source_quality_risk": frontmatter.get("source_quality_risk"),
        "source_quality_linked": linked_source_quality["linked"],
        "source_quality_sources": linked_source_quality["sources"],
        "sources": _as_list(frontmatter.get("sources")),
        "source_papers": _as_list(frontmatter.get("source_papers")),
        "related_papers": _as_list(frontmatter.get("related_papers")),
        "related_methods": _as_list(frontmatter.get("related_methods")),
        "related_topics": _as_list(frontmatter.get("related_topics")),
        "related_claims": _as_list(frontmatter.get("related_claims")),
        "related_evidence": _as_list(frontmatter.get("related_evidence")),
        "related_concepts": _as_list(frontmatter.get("related_concepts")),
        "prerequisite_for": _as_list(frontmatter.get("prerequisite_for")),
        "personalized": frontmatter.get("personalized"),
        "user_insights": _as_list(frontmatter.get("user_insights")),
        "revision_id": frontmatter.get("revision_id"),
        "revision_count": frontmatter.get("revision_count"),
        "previous_revision": frontmatter.get("previous_revision"),
        "evolution_state": frontmatter.get("evolution_state"),
        "evolution_markers": _as_list(frontmatter.get("evolution_markers")),
        "last_refinement_id": frontmatter.get("last_refinement_id"),
        "candidate_scope": frontmatter.get("candidate_scope"),
        "consolidation_target": frontmatter.get("consolidation_target"),
        "retrieval_visibility": frontmatter.get("retrieval_visibility"),
        "updated": frontmatter.get("updated"),
        "routing": {field: _as_list(frontmatter.get(field)) for field in ROUTING_FIELDS},
        "section_headings": list(sections.keys()),
        "section_previews": {
            heading: _preview(content, limit=700)
            for heading, content in sections.items()
            if heading in SECTION_WEIGHTS
        },
    }


def _linked_source_quality(frontmatter: dict[str, Any], *, wiki_root: Path) -> dict[str, Any]:
    linked_paths = []
    for field in ("sources", "source_papers", "related_papers"):
        linked_paths.extend(str(item) for item in _as_list(frontmatter.get(field)))
    source_quality_sources = []
    for linked in _dedupe(linked_paths):
        if not linked or not linked.startswith("papers/"):
            continue
        path = wiki_root / linked
        if path.suffix != ".md":
            path = path.with_suffix(".md")
        if not path.exists():
            continue
        linked_frontmatter = parse_frontmatter(path.read_text(encoding="utf-8"))
        quality_text = " ".join(
            str(linked_frontmatter.get(field) or "")
            for field in ("review_state", "quality_gate", "quality_state", "validation_state", "trust_state")
        ).lower()
        if any(token in quality_text for token in ("source_quality_hold", "needs_source_recheck", "untrusted_source_text")):
            source_quality_sources.append(linked)
    return {"linked": bool(source_quality_sources), "sources": source_quality_sources}


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
    if catalog_path is None and (wiki_root / "syntheses").exists():
        synthesis_path = wiki_root / ".index" / "syntheses.jsonl"
        build_synthesis_catalog(wiki_root=wiki_root, out_path=synthesis_path)
        with synthesis_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if stripped:
                    records.append(json.loads(stripped))
    if catalog_path is None:
        build_knowledge_catalogs(wiki_root=wiki_root)
        for directory in KNOWLEDGE_DIRECTORIES:
            knowledge_path = wiki_root / ".index" / f"{directory}.jsonl"
            if not knowledge_path.exists():
                continue
            with knowledge_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    stripped = line.strip()
                    if stripped:
                        records.append(json.loads(stripped))
    return records


def _knowledge_role(*, path: Path, frontmatter: dict[str, Any]) -> str:
    page_type = str(frontmatter.get("type") or "")
    review_state = str(frontmatter.get("review_state") or "").lower()
    if page_type == "method" and re.search(r"-method-\d+$", path.stem):
        return "candidate_method_record"
    if page_type in {"claim", "evidence"} and (
        frontmatter.get("candidate_id") or review_state in {"candidate", "auto_extracted", "source_text_insufficient"}
    ):
        return "candidate_record"
    if page_type in {"method", "topic", "claim", "evidence", "concept", "synthesis", "method-family", "comparison", "decision", "research-question"}:
        return "compiled_knowledge"
    return "source_page"


def _score_record(record: dict[str, Any], *, query: str, wiki_root: Path) -> dict[str, Any]:
    query_tokens = _tokens(query)
    query_norm = _norm(query)
    path = Path(str(record["path"]))
    if not path.is_absolute() and not path.exists():
        path = wiki_root / path
    if "_section_contents" in record:
        sections = dict(record.get("_section_contents") or {})
    else:
        body = strip_frontmatter(path.read_text(encoding="utf-8"))
        sections = split_sections(body)
    section_search = _section_search(record, sections)

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
        cached = section_search.get(heading)
        section_score = (
            _cached_text_score(query_tokens, query_norm, cached, weight=weight)
            if cached is not None
            else _text_score(query_tokens, query_norm, content, weight=weight)
        )
        intent_boost = _section_intent_boost(query_tokens, heading, weight=weight, content=content)
        section_score += intent_boost
        if section_score > 0:
            score += section_score
            section_hits.append(
                {
                    "heading": heading,
                    "score": round(section_score, 3),
                    "snippet": _preview(content[:1200], limit=260),
                }
            )

    matched_source_types = ["user_insight"] if any(item.get("heading") == "User Insights" for item in section_hits) else []
    return {
        "page_id": record["page_id"],
        "title": title,
        "path": str(path),
        "relative_path": record.get("relative_path"),
        "canonical_path": record.get("relative_path"),
        "score": round(score, 3),
        "matched_frontmatter": matched_fields,
        "matched_sections": sorted(section_hits, key=lambda item: -item["score"])[: len(SECTION_WEIGHTS)],
        "selection_reasons": _dedupe(reasons),
        "routing": record.get("routing") or {},
        "review_state": record.get("review_state"),
        "quality_gate": record.get("quality_gate"),
        "quality_state": record.get("quality_state"),
        "validation_state": record.get("validation_state"),
        "trust_state": record.get("trust_state"),
        "confidence": record.get("confidence"),
        "type": record.get("type") or "paper",
        "result_type": record.get("type") or "paper",
        "corpus_type": record.get("corpus_type"),
        "knowledge_role": record.get("knowledge_role"),
        "source_id": record.get("source_id"),
        "source_quality_risk": record.get("source_quality_risk"),
        "source_quality_linked": record.get("source_quality_linked"),
        "source_quality_sources": record.get("source_quality_sources") or [],
        "source_papers": record.get("source_papers") or [],
        "related_methods": record.get("related_methods") or [],
        "related_topics": record.get("related_topics") or [],
        "related_claims": record.get("related_claims") or [],
        "related_evidence": record.get("related_evidence") or [],
        "related_concepts": record.get("related_concepts") or [],
        "prerequisite_for": record.get("prerequisite_for") or [],
        "matched_source_types": matched_source_types,
        "revision_id": record.get("revision_id"),
        "revision_count": record.get("revision_count"),
        "previous_revision": record.get("previous_revision"),
        "evolution_state": record.get("evolution_state"),
        "evolution_markers": record.get("evolution_markers") or [],
        "last_refinement_id": record.get("last_refinement_id"),
        "candidate_scope": record.get("candidate_scope"),
        "consolidation_target": record.get("consolidation_target"),
        "retrieval_visibility": record.get("retrieval_visibility"),
    }


def _section_search(record: dict[str, Any], sections: dict[str, str]) -> dict[str, dict[str, Any]]:
    cached = record.get("_section_search")
    if isinstance(cached, dict):
        return cached
    cached = {
        heading: {
            "content": content,
            "norm": _norm(content),
            "tokens": _tokens(content),
        }
        for heading, content in sections.items()
    }
    record["_section_search"] = cached
    return cached


def _score_records_v1(
    catalog: list[dict[str, Any]],
    *,
    query: str,
    query_analysis: dict[str, Any],
    wiki_root: Path,
) -> list[dict[str, Any]]:
    query_tokens = set(query_analysis["tokens"])
    document_tokens = [
        _token_list(_record_search_text(record, wiki_root=wiki_root))
        for record in catalog
    ]
    idf = _idf(query_tokens, document_tokens)
    avg_len = sum(len(tokens) for tokens in document_tokens) / len(document_tokens) if document_tokens else 1.0

    scored = [
        _score_record_v1(
            record,
            query=query,
            query_analysis=query_analysis,
            wiki_root=wiki_root,
            idf=idf,
            avg_len=avg_len,
        )
        for record in catalog
    ]
    return _apply_graph_expansion(scored, query_analysis=query_analysis)


def _score_record_v1(
    record: dict[str, Any],
    *,
    query: str,
    query_analysis: dict[str, Any],
    wiki_root: Path,
    idf: dict[str, float],
    avg_len: float,
) -> dict[str, Any]:
    base = _score_record(record, query=query, wiki_root=wiki_root)
    query_tokens = set(query_analysis["tokens"])
    sections = _record_sections(record, wiki_root=wiki_root)
    routing = record.get("routing") or {}
    reasons = list(base.get("selection_reasons") or [])

    score = float(base.get("score") or 0.0) * 0.45
    title = str(record.get("title") or "")
    title_score = _bm25(query_tokens, _token_list(title), idf=idf, avg_len=8.0) * 3.2
    title_score += _query_phrase_score(query_analysis, title, weight=7.0)
    if title_score:
        score += title_score
        reasons.append("BM25 title")

    field_weights = {
        "aliases": 4.0,
        "methods": 5.5,
        "topics": 4.8,
        "settings": 4.2,
        "datasets": 3.0,
        "metrics": 2.8,
        "models": 2.4,
        "claims": 1.8,
    }
    matched_fields: dict[str, list[str]] = dict(base.get("matched_frontmatter") or {})
    for field, values in routing.items():
        field_hits = []
        field_score = 0.0
        for value in _as_list(values):
            text = str(value)
            tokens = _token_list(text)
            bm25 = _bm25(query_tokens, tokens, idf=idf, avg_len=max(avg_len * 0.08, 4.0))
            phrase = _phrase_score(query_tokens, str(query_analysis["norm"]), text, weight=field_weights.get(field, 1.0))
            phrase += _query_phrase_score(query_analysis, text, weight=field_weights.get(field, 1.0) * 1.6)
            contribution = bm25 * field_weights.get(field, 1.0) + phrase
            if contribution > 0:
                field_score += contribution
                field_hits.append(text)
        if field_hits:
            score += field_score
            matched_fields[field] = _dedupe(list(matched_fields.get(field) or []) + field_hits)
            reasons.append(f"field-weighted {field}")

    section_hits = []
    desired_sections = set(query_analysis.get("desired_sections") or [])
    for heading, weight in SECTION_WEIGHTS.items():
        content = sections.get(heading, "")
        if not content:
            continue
        section_weight = weight * (1.45 if heading in desired_sections else 1.0)
        section_score = _bm25(
            query_tokens,
            _token_list(content),
            idf=idf,
            avg_len=max(avg_len * 0.35, 60.0),
        ) * section_weight
        section_score += _query_phrase_score(query_analysis, content, weight=section_weight * 0.8)
        section_score += _section_intent_boost(query_tokens, heading, weight=section_weight, content=content)
        if section_score > 0 or heading in desired_sections:
            section_hits.append(
                {
                    "heading": heading,
                    "score": round(section_score, 3),
                    "snippet": _best_snippet(content, query_tokens, limit=260),
                }
            )
            score += section_score

    query_domains = set(query_analysis.get("domains") or [])
    record_domains = _record_domains(record, sections=sections)
    if query_domains:
        overlap = query_domains & record_domains
        if overlap:
            score += 18.0 * len(overlap)
            reasons.append("domain/facet alignment")
        elif record_domains:
            score -= 12.0
            reasons.append("domain/facet mismatch penalty")

    contrast_settings = set(query_analysis.get("contrast_settings") or [])
    if contrast_settings:
        record_settings = {str(value).lower() for value in _as_list(routing.get("settings"))}
        exact_settings = contrast_settings & record_settings
        if exact_settings:
            score += 45.0 * len(exact_settings)
            reasons.append("contrast-setting exact match")
            if len(exact_settings) == 1 and len(record_settings) <= 3:
                score += 35.0
                reasons.append("contrast-setting exemplar")
            if len(record_settings) > 4:
                score -= min(len(record_settings) - 4, 4) * 18.0
                reasons.append("overbroad setting penalty")
        else:
            score -= 24.0
            reasons.append("missing requested setting contrast")

    unrequested_penalty = _unrequested_family_penalty(query_analysis=query_analysis, record=record)
    if unrequested_penalty:
        score -= unrequested_penalty
        reasons.append("unrequested method-family penalty")

    quality_gate = str(record.get("quality_gate") or "").lower()
    quality_state = str(record.get("quality_state") or "").lower()
    validation_state = str(record.get("validation_state") or "").lower()
    review_state = str(record.get("review_state") or "").lower()
    confidence = str(record.get("confidence") or "").lower()
    source_quality_risk = str(record.get("source_quality_risk") or "").lower()
    is_source_quality_problem = any(
        token in " ".join([quality_gate, review_state, confidence])
        for token in ("hold", "fail", "low", "source_quality")
    ) or source_quality_risk == "true" or quality_state == "source_quality_hold" or validation_state == "needs_source_recheck" or bool(record.get("source_quality_linked"))
    if query_analysis.get("source_quality_query"):
        if is_source_quality_problem:
            score += 35.0
            reasons.append("source-quality cleanup target")
    elif is_source_quality_problem:
        score *= 0.25
        reasons.append("source-quality evidence guard")

    knowledge_role = str(record.get("knowledge_role") or "")
    identity_match = _identity_boost(str(query_analysis["norm"]), title, _as_list((record.get("routing") or {}).get("aliases")))
    if knowledge_role == "candidate_method_record" and not identity_match:
        score *= 0.2
        reasons.append("candidate method-record suppression")
    retrieval_visibility = str(record.get("retrieval_visibility") or "").lower()
    if retrieval_visibility == "suppressed_unless_exact_identity" and not identity_match:
        score *= 0.05
        reasons.append("consolidated candidate suppression")

    result_type = str(record.get("type") or "")
    corpus_type = str(record.get("corpus_type") or record.get("relative_path") or "")
    desired_sections = set(query_analysis.get("desired_sections") or [])
    if corpus_type.startswith("syntheses") and desired_sections & {
        "Scope",
        "Key Papers",
        "Method Families",
        "Evidence Map",
        "Source Facts",
        "Wiki Synthesis",
        "Retrieval Hooks",
    }:
        score += 760.0
        reasons.append("synthesis-layer route")
    if knowledge_role == "compiled_knowledge":
        if result_type == "method" and desired_sections & {"Mechanism", "Implementation Hooks", "Failure Modes", "What It Is"}:
            score += 700.0
            reasons.append("knowledge-layer method route")
        if result_type == "concept" and desired_sections & {
            "What It Is",
            "Why It Matters",
            "Implementation Implications",
            "Common Failure Modes",
            "Minimal Checks / Probes",
            "Prerequisite Concepts",
            "Concept Dependencies",
        }:
            score += 640.0
            reasons.append("knowledge-layer concept route")
        if result_type == "topic" and desired_sections & {"Scope", "Key Papers", "Method Families", "Retrieval Hooks"}:
            score += 420.0
            reasons.append("knowledge-layer topic route")
    if result_type in {"claim", "evidence"} and knowledge_role in {"compiled_knowledge", "candidate_record"} and desired_sections & {
        "Evidence Map",
        "Supporting Evidence",
        "Evidence Item",
        "Provenance",
        "Claims",
        "Contradictions",
    }:
        score += 520.0
        reasons.append("knowledge-layer evidence route")

    base_sections = {str(item.get("heading") or ""): item for item in base.get("matched_sections") or []}
    for item in section_hits:
        previous = base_sections.get(str(item.get("heading") or ""))
        if previous is None or float(item.get("score") or 0.0) > float(previous.get("score") or 0.0):
            base_sections[str(item["heading"])] = item

    base.update(
        {
            "score": round(max(score, 0.0), 3),
            "strategy": "v1",
            "knowledge_role": knowledge_role or base.get("knowledge_role"),
            "matched_frontmatter": matched_fields,
            "matched_sections": sorted(base_sections.values(), key=lambda item: -float(item.get("score") or 0.0))[
                : len(SECTION_WEIGHTS)
            ],
            "selection_reasons": _dedupe(reasons),
            "detected_domains": sorted(record_domains),
            "matched_source_types": _dedupe(
                list(base.get("matched_source_types") or [])
                + (["user_insight"] if any(item.get("heading") == "User Insights" for item in base_sections.values()) else [])
            ),
        }
    )
    return base


def _apply_graph_expansion(scored: list[dict[str, Any]], *, query_analysis: dict[str, Any]) -> list[dict[str, Any]]:
    query_facets = {str(item).lower() for item in query_analysis.get("facet_terms") or []}
    seeds = sorted(scored, key=lambda item: -float(item.get("score") or 0.0))[:8]
    seed_facets: set[str] = set()
    for seed in seeds:
        if float(seed.get("score") or 0.0) <= 0:
            continue
        routing = seed.get("routing") or {}
        for field in ("topics", "methods", "settings"):
            for value in _as_list(routing.get(field)):
                normalized = str(value).lower()
                if normalized in query_facets or query_facets & set(_tokens(normalized)):
                    seed_facets.add(normalized)
    if not seed_facets:
        return scored
    for item in scored:
        routing = item.get("routing") or {}
        shared = []
        for field in ("topics", "methods", "settings"):
            for value in _as_list(routing.get(field)):
                if str(value).lower() in seed_facets:
                    shared.append(str(value))
        if shared:
            item["score"] = round(float(item.get("score") or 0.0) + min(len(shared), 3) * 5.0, 3)
            item["graph_expansion_facets"] = _dedupe(shared)
            item["selection_reasons"] = _dedupe(list(item.get("selection_reasons") or []) + ["graph/facet expansion"])
    return scored


def _diversify_v1(
    ranked: list[dict[str, Any]],
    *,
    query_analysis: dict[str, Any],
    top_k: int,
) -> list[dict[str, Any]]:
    if len(ranked) <= top_k:
        return ranked
    selected: list[dict[str, Any]] = []
    desired_sections = set(query_analysis.get("desired_sections") or [])
    forced_types: list[set[str]] = []
    if desired_sections & {"Implementation Implications", "Common Failure Modes", "Minimal Checks / Probes", "Prerequisite Concepts", "Concept Dependencies"}:
        forced_types.append({"concept"})
    if desired_sections & {"Mechanism", "Implementation Hooks", "Failure Modes", "What It Is"}:
        forced_types.append({"method"})
        forced_types.append({"concept"})
        forced_types.append({"evidence"})
    if desired_sections & {"Scope", "Key Papers", "Method Families", "Source Facts", "Wiki Synthesis", "Open Questions", "Retrieval Hooks"}:
        forced_types.append({"synthesis", "method-family", "comparison", "research-question", "decision"})
        forced_types.append({"topic"})
    if desired_sections & {"Evidence Map", "Supporting Evidence", "Evidence Item", "Provenance", "Claims", "Contradictions"}:
        forced_types.append({"claim"})
        forced_types.append({"evidence"})
    if desired_sections & {"Evidence Map", "Implementation Hooks", "Key Papers", "Source", "Provenance"}:
        forced_types.append({"paper"})
    deduped_forced_types = []
    seen_forced_types = set()
    for result_types in forced_types:
        key = tuple(sorted(result_types))
        if key not in seen_forced_types:
            seen_forced_types.add(key)
            deduped_forced_types.append(result_types)
    forced_types = deduped_forced_types
    remaining = list(ranked)
    for result_types in forced_types:
        if len(selected) >= top_k:
            break
        allow_source_quality = bool(query_analysis.get("source_quality_query"))
        candidate = next(
            (
                item
                for item in remaining
                if str(item.get("result_type") or item.get("type") or "") in result_types
                or (str(item.get("corpus_type") or "").startswith("syntheses") and result_types & {"synthesis", "method-family"})
            ),
            None,
        )
        if candidate is not None and _is_source_quality_result(candidate) and not allow_source_quality:
            candidate = next(
                (
                    item
                    for item in remaining
                    if (
                        str(item.get("result_type") or item.get("type") or "") in result_types
                        or (
                            str(item.get("corpus_type") or "").startswith("syntheses")
                            and result_types & {"synthesis", "method-family"}
                        )
                    )
                    and not _is_source_quality_result(item)
                ),
                None,
            )
        if candidate is not None:
            remaining.remove(candidate)
            candidate["selection_reasons"] = _dedupe(list(candidate.get("selection_reasons") or []) + ["knowledge-layer intent preselection"])
            selected.append(candidate)
    query_phrases = [str(phrase) for phrase in query_analysis.get("phrases") or [] if _is_high_value_phrase(str(phrase))]
    query_tokens = set(query_analysis.get("tokens") or [])
    coverage_targets = set(query_phrases)
    contrast_settings = set(query_analysis.get("contrast_settings") or [])
    for setting in contrast_settings:
        coverage_targets.add(f"setting:{setting}")
    for token in query_tokens:
        if token in {
            "diffusion",
            "survey",
            "jepa",
            "kv",
            "cache",
            "retention",
            "weight",
            "activation",
            "kernel",
            "gpu",
            "cpu",
            "throughput",
            "speculative",
            "agent",
            "audio",
            "pde",
            "clustering",
            "centroid",
        }:
            coverage_targets.add(token)
    if not coverage_targets:
        return (selected + remaining)[:top_k]

    covered: set[str] = set()
    while remaining and len(selected) < top_k:
        def rerank_score(item: dict[str, Any]) -> tuple[float, str]:
            item_facets = _coverage_facets(item, coverage_targets=coverage_targets, contrast_settings=contrast_settings)
            new_facets = item_facets - covered
            diversity_bonus = min(len(new_facets), 4) * 85.0
            return (float(item.get("score") or 0.0) + diversity_bonus, str(item.get("title") or ""))

        best = max(remaining, key=rerank_score)
        remaining.remove(best)
        selected.append(best)
        best_facets = _coverage_facets(best, coverage_targets=coverage_targets, contrast_settings=contrast_settings)
        if best_facets - covered:
            best["selection_reasons"] = _dedupe(list(best.get("selection_reasons") or []) + ["coverage/diversity rerank"])
            best["coverage_facets"] = sorted(best_facets - covered)
        covered |= best_facets
    return selected


def _is_source_quality_result(item: dict[str, Any]) -> bool:
    quality_text = " ".join(
        str(item.get(field) or "")
        for field in ("review_state", "quality_gate", "quality_state", "validation_state", "trust_state")
    ).lower()
    return (
        any(token in quality_text for token in ("source_quality_hold", "needs_source_recheck", "untrusted_source_text"))
        or bool(item.get("source_quality_linked"))
        or str(item.get("source_quality_risk") or "").lower() == "true"
    )


def _coverage_facets(
    item: dict[str, Any],
    *,
    coverage_targets: set[str],
    contrast_settings: set[str],
) -> set[str]:
    item_text = _result_text(item)
    facets = {facet for facet in coverage_targets if not facet.startswith("setting:") and facet in item_text}
    if contrast_settings:
        routing = item.get("routing") or {}
        record_settings = {str(value).lower() for value in _as_list(routing.get("settings"))}
        for setting in contrast_settings & record_settings:
            if len(record_settings) <= 3:
                facets.add(f"setting:{setting}")
    return facets


def _result_text(item: dict[str, Any]) -> str:
    routing = item.get("routing") or {}
    fields = [str(item.get("title") or "")]
    for values in routing.values():
        fields.extend(str(value) for value in _as_list(values))
    for section in item.get("matched_sections") or []:
        fields.append(str(section.get("heading") or ""))
        fields.append(str(section.get("snippet") or ""))
    return _norm(" ".join(fields))


def _is_high_value_phrase(phrase: str) -> bool:
    tokens = phrase.split()
    if len(tokens) < 2:
        return False
    low_value = {
        "want reduce",
        "find baselines",
        "retrieve papers",
        "need papers",
        "actual systems",
        "new visual",
    }
    return phrase not in low_value and any(len(token) > 3 for token in tokens)


def _section_intent_boost(query_tokens: set[str], heading: str, *, weight: float, content: str) -> float:
    if not content:
        return 0.0
    intent_terms = INTENT_SECTION_TERMS.get(heading, set())
    overlap = query_tokens & intent_terms
    if not overlap:
        return 0.0
    return weight * (3.0 + min(len(overlap), 3) * 1.25)


def _render_context_packet(
    *,
    query: str,
    results: list[dict[str, Any]],
    wiki_root: Path,
    strategy: str = "v1",
    query_analysis: dict[str, Any] | None = None,
) -> str:
    lines = [
        "---",
        f'schema_version: "{CONTEXT_PACKET_SCHEMA_VERSION}"',
        f'query: "{query.replace(chr(34), chr(92) + chr(34))}"',
        f'strategy: "{strategy}"',
        f'wiki_root: "{wiki_root}"',
        "---",
        f"# Retrieval Context Packet: {query}",
        "",
        "> This packet is a ranked reading plan, not a synthesized answer. Use it to choose wiki pages and sections before answering or writing back.",
        "",
    ]
    if query_analysis:
        lines.extend(
            [
                "## Query Analysis",
                "",
                f"- Detected domains: {', '.join(query_analysis.get('domains') or ['none'])}",
                f"- Desired sections: {', '.join(query_analysis.get('desired_sections') or ['none'])}",
                f"- Source-quality query: `{bool(query_analysis.get('source_quality_query'))}`",
                "",
            ]
        )
    if not results:
        lines.extend(["## Results", "", "- No matching wiki pages found."])
        return "\n".join(lines).rstrip() + "\n"

    lines.extend(["## Results", ""])
    for index, result in enumerate(results, start=1):
        lines.extend(
            [
                f"### {index}. {result['title']}",
                "",
                f"- Page: `{result.get('relative_path') or result['path']}`",
                f"- Canonical path: `{result.get('canonical_path') or result.get('relative_path') or result['path']}`",
                f"- Corpus type: `{result.get('corpus_type') or 'canonical'}`",
                f"- Result type: `{result.get('result_type') or result.get('type') or 'paper'}`",
                f"- Knowledge role: `{result.get('knowledge_role') or 'canonical'}`",
                f"- Source types matched: {', '.join(result.get('matched_source_types') or ['source_or_wiki'])}",
                f"- Revision: `{result.get('revision_id') or 'unversioned'}`; evolution state: `{result.get('evolution_state') or 'none'}`",
                f"- Score: `{result['score']}`",
                f"- Review state: `{result.get('review_state')}`; quality gate: `{result.get('quality_gate')}`; quality state: `{result.get('quality_state')}`; validation state: `{result.get('validation_state')}`; trust state: `{result.get('trust_state')}`; confidence: `{result.get('confidence')}`",
                f"- Selection reasons: {', '.join(result.get('selection_reasons') or ['lexical overlap'])}",
                f"- Detected domains: {', '.join(result.get('detected_domains') or ['unknown'])}",
                f"- Matched frontmatter: {_format_matched_frontmatter(result.get('matched_frontmatter') or {})}",
                "- Read first:",
            ]
        )
        if result.get("result_type") == "concept":
            source_papers = ", ".join(str(item) for item in (result.get("source_papers") or [])[:5]) or "none"
            related_methods = ", ".join(str(item) for item in (result.get("related_methods") or [])[:5]) or "none"
            prerequisite_for = ", ".join(str(item) for item in (result.get("prerequisite_for") or [])[:5]) or "none"
            lines.extend(
                [
                    f"- Concept provenance papers: {source_papers}",
                    f"- Related methods: {related_methods}",
                    f"- Prerequisite for: {prerequisite_for}",
                ]
            )
        for section in (result.get("matched_sections") or [])[:CONTEXT_PACKET_SECTION_LIMIT]:
            snippet = str(section.get("snippet") or "").replace("\n", " ")
            lines.append(f"  - `{section['heading']}`: {snippet}")
        if not result.get("matched_sections"):
            lines.append("  - `What To Remember`: inspect the page summary before using this result.")
        if "user_insight" in set(result.get("matched_source_types") or []):
            lines.append("- Boundary warning: matched `User Insights`; this is user-supplied context, not paper source fact or scientific evidence.")
        if result.get("source_quality_linked"):
            linked = ", ".join(str(item) for item in (result.get("source_quality_sources") or []))
            lines.append(f"- Source-quality warning: this result links to source-quality hold material ({linked}); do not use it as scientific evidence.")
        evolution_markers = {str(item) for item in result.get("evolution_markers") or []}
        evolution_state = str(result.get("evolution_state") or "")
        if evolution_state in {"stale", "needs_source_recheck", "superseded"} or evolution_markers & {"stale", "superseded", "conflicting_synthesis", "needs_source_recheck"}:
            markers = sorted(evolution_markers | ({evolution_state} if evolution_state else set()))
            lines.append(f"- Evolution warning: this page has active evolution markers: {', '.join(markers)}.")
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


def _cached_text_score(
    query_tokens: set[str],
    query_norm: str,
    cached: dict[str, Any],
    *,
    weight: float,
) -> float:
    text_norm = str(cached.get("norm") or "")
    if not text_norm:
        return 0.0
    tokens = cached.get("tokens")
    if not isinstance(tokens, set):
        tokens = set(tokens or [])
        cached["tokens"] = tokens
    score = sum(weight for token in query_tokens if len(token) > 2 and token in tokens)
    if query_norm and query_norm in text_norm:
        score += weight * 4
    return score


def _query_analysis(query: str) -> dict[str, Any]:
    tokens = sorted(_tokens(query))
    token_set = set(tokens)
    norm = _norm(query)
    desired_sections = []
    for heading, terms in INTENT_SECTION_TERMS.items():
        if token_set & terms:
            desired_sections.append(heading)
    if not desired_sections:
        desired_sections = ["What To Remember", "Mechanism"]

    domains = []
    for domain, terms in DOMAIN_LEXICON.items():
        anchors = DOMAIN_ANCHORS.get(domain, set())
        anchor_hits = token_set & anchors
        term_hits = token_set & terms
        phrase_hit = any(len(term.split()) > 1 and term in norm for term in terms)
        if anchor_hits and (len(term_hits) >= 2 or phrase_hit or len(anchor_hits) >= 2):
            domains.append(domain)

    source_quality_query = (
        "source quality" in norm
        or "source-quality" in query.lower()
        or bool(token_set & {"cleanup", "extraction", "metadata", "ocr", "weak"})
        and bool(token_set & {"source", "metadata", "ocr", "cleanup"})
    )
    contrast_settings = []
    if "quantization" in token_set:
        has_weight_only = "weight only" in norm or "weight-only" in query.lower()
        has_weight_activation = (
            "weight activation" in norm
            or "weight-activation" in query.lower()
            or "activation weight" in norm
            or "activation and weight" in norm
        )
        if has_weight_only and has_weight_activation:
            contrast_settings = ["weight-only quantization", "weight-activation quantization"]
    phrases = _ngrams(tokens, min_n=2, max_n=3)
    facet_terms = sorted(set(tokens + phrases))
    return {
        "tokens": tokens,
        "norm": norm,
        "domains": sorted(domains),
        "desired_sections": desired_sections,
        "source_quality_query": source_quality_query,
        "contrast_settings": contrast_settings,
        "phrases": phrases,
        "facet_terms": facet_terms,
    }


def _record_sections(record: dict[str, Any], *, wiki_root: Path) -> dict[str, str]:
    if "_section_contents" in record:
        return dict(record.get("_section_contents") or {})
    path = Path(str(record["path"]))
    if not path.is_absolute() and not path.exists():
        path = wiki_root / path
    text = path.read_text(encoding="utf-8")
    return _sections_for_record(body=strip_frontmatter(text), frontmatter=parse_frontmatter(text))


def _sections_for_record(*, body: str, frontmatter: dict[str, Any]) -> dict[str, str]:
    sections = split_sections(body)
    if sections:
        return sections
    page_type = str(frontmatter.get("type") or "")
    if page_type not in {"claim", "evidence"}:
        return sections
    compact = _compact_candidate_sections(body)
    if page_type == "claim":
        return {
            "Claim": compact.get("Claim") or body.strip(),
            "Supporting Evidence": compact.get("Evidence IDs") or compact.get("Supports") or "No supporting evidence ids recorded.",
            "Provenance": compact.get("Provenance") or compact.get("Source paper") or "No provenance recorded.",
            "Confidence": str(frontmatter.get("confidence") or "unknown"),
        }
    return {
        "Evidence Item": compact.get("Summary") or compact.get("Evidence type") or body.strip(),
        "Source": compact.get("Source paper") or "No source paper recorded.",
        "Metric or Observation": compact.get("Summary") or compact.get("Evidence type") or compact.get("Page") or "No metric or observation recorded.",
        "Supports": compact.get("Supports") or "No supported claim recorded.",
        "Reliability": f"confidence={frontmatter.get('confidence') or 'unknown'}; review_state={frontmatter.get('review_state') or 'unknown'}",
    }


def _compact_candidate_sections(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in body.splitlines():
        match = re.match(r"^-\s+([^:]+):\s*(.*)$", line.strip())
        if match:
            fields[match.group(1).strip()] = match.group(2).strip()
    return fields


def _record_search_text(record: dict[str, Any], *, wiki_root: Path) -> str:
    sections = _record_sections(record, wiki_root=wiki_root)
    routing = record.get("routing") or {}
    routing_text = " ".join(
        " ".join(str(value) for value in _as_list(values))
        for values in routing.values()
    )
    section_text = " ".join(sections.get(heading, "") for heading in SECTION_WEIGHTS)
    return " ".join([str(record.get("title") or ""), routing_text, section_text])


def _record_domains(record: dict[str, Any], *, sections: dict[str, str]) -> set[str]:
    routing = record.get("routing") or {}
    routing_text = " ".join(
        " ".join(str(value) for value in _as_list(values))
        for values in routing.values()
    )
    text = " ".join([str(record.get("title") or ""), routing_text])
    token_set = _tokens(text)
    norm = _norm(text)
    domains = set()
    for domain, terms in DOMAIN_LEXICON.items():
        anchors = DOMAIN_ANCHORS.get(domain, set())
        anchor_hits = token_set & anchors
        term_hits = token_set & terms
        phrase_hit = any(len(term.split()) > 1 and term in norm for term in terms)
        if anchor_hits and (len(term_hits) >= 2 or phrase_hit or len(anchor_hits) >= 2):
            domains.add(domain)
    return domains


def _query_phrase_score(query_analysis: dict[str, Any], text: str, *, weight: float) -> float:
    text_norm = _norm(text)
    if not text_norm:
        return 0.0
    score = 0.0
    for phrase in query_analysis.get("phrases") or []:
        if phrase in text_norm:
            score += weight * min(len(str(phrase).split()), 3)
    return score


def _unrequested_family_penalty(*, query_analysis: dict[str, Any], record: dict[str, Any]) -> float:
    query_tokens = set(query_analysis.get("tokens") or [])
    routing = record.get("routing") or {}
    text = " ".join(
        str(value).lower()
        for field in ("aliases", "topics", "methods", "settings")
        for value in _as_list(routing.get(field))
    )
    penalty = 0.0
    if "speculative" not in query_tokens and "speculative decoding" in text:
        penalty += 90.0
    if not ({"kernel", "gpu", "cpu", "throughput", "runtime"} & query_tokens) and "attention kernel" in text:
        penalty += 12.0
    if "quantization" not in query_tokens and "quantization" in text and "kv-cache quantization" not in text:
        penalty += 12.0
    return penalty


def _idf(query_tokens: set[str], documents: list[list[str]]) -> dict[str, float]:
    total = len(documents)
    result = {}
    for token in query_tokens:
        containing = sum(1 for doc in documents if token in set(doc))
        result[token] = 1.0 if total == 0 else math.log(1 + (total - containing + 0.5) / (containing + 0.5))
    return result


def _bm25(
    query_tokens: set[str],
    document_tokens: list[str],
    *,
    idf: dict[str, float],
    avg_len: float,
    k1: float = 1.2,
    b: float = 0.75,
) -> float:
    if not query_tokens or not document_tokens:
        return 0.0
    length = len(document_tokens)
    counts: dict[str, int] = {}
    for token in document_tokens:
        if token in query_tokens:
            counts[token] = counts.get(token, 0) + 1
    score = 0.0
    for token, freq in counts.items():
        denom = freq + k1 * (1 - b + b * (length / max(avg_len, 1.0)))
        score += idf.get(token, 1.0) * ((freq * (k1 + 1)) / denom)
    return score


def _token_list(text: str) -> list[str]:
    stop = _stopwords()
    return [token for token in re.findall(r"[a-z0-9]+", text.lower()) if token not in stop and len(token) > 1]


def _ngrams(tokens: list[str], *, min_n: int, max_n: int) -> list[str]:
    grams = []
    for size in range(min_n, max_n + 1):
        for index in range(0, max(len(tokens) - size + 1, 0)):
            grams.append(" ".join(tokens[index : index + size]))
    return grams


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
    stop = _stopwords()
    return {token for token in re.findall(r"[a-z0-9]+", text.lower()) if token not in stop and len(token) > 1}


def _stopwords() -> set[str]:
    return {
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
        "which",
        "what",
        "where",
        "when",
        "would",
        "could",
        "should",
        "also",
        "than",
        "only",
        "just",
    }


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
