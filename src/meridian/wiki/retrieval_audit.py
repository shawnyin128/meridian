from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.corpus import build_paper_catalog, retrieve_papers, split_sections, strip_frontmatter


RETRIEVAL_AUDIT_SCHEMA_VERSION = "meridian.wiki_retrieval_audit.v0"
RETRIEVAL_AUDIT_SUMMARY_SCHEMA_VERSION = "meridian.wiki_retrieval_audit_summary.v0"


@dataclass(frozen=True)
class RetrievalAuditResult:
    manifest_path: Path
    summary_path: Path
    summary_markdown_path: Path
    paper_count: int
    query_count: int
    query_recall_at_k: float


def run_retrieval_audit(
    *,
    wiki_root: Path,
    out_dir: Path,
    catalog_path: Path | None = None,
    top_k: int = 5,
    queries_per_paper: int = 3,
    max_papers: int | None = None,
    overwrite: bool = False,
) -> RetrievalAuditResult:
    if top_k < 1:
        raise ValueError("top_k must be >= 1")
    if queries_per_paper < 1:
        raise ValueError("queries_per_paper must be >= 1")
    if max_papers is not None and max_papers < 1:
        raise ValueError("max_papers must be >= 1 when provided")
    if out_dir.exists() and any(out_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"retrieval audit output directory already exists: {out_dir}")
    if out_dir.exists() and overwrite:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    catalog = build_paper_catalog(wiki_root=wiki_root, out_path=catalog_path)
    records = _load_catalog(catalog.catalog_path)
    if max_papers is not None:
        records = records[:max_papers]
    _attach_section_cache(records=records, wiki_root=wiki_root)

    paper_results: list[dict[str, Any]] = []
    for record in records:
        paper_id = str(record.get("page_id") or record.get("relative_path") or record.get("title"))
        paper_dir = out_dir / _safe_id(paper_id)
        paper_dir.mkdir(parents=True, exist_ok=True)
        query_specs = generate_audit_queries(record)[:queries_per_paper]
        query_results = []
        for index, query_spec in enumerate(query_specs, start=1):
            query_dir = paper_dir / f"query-{index:02d}-{query_spec['intent']}"
            context_path = query_dir / "context.md"
            context_json_path = query_dir / "context.json"
            retrieval = retrieve_papers(
                query=query_spec["query"],
                wiki_root=wiki_root,
                catalog_path=catalog.catalog_path,
                catalog_records=records,
                top_k=top_k,
                packet_path=context_path,
                result_path=context_json_path,
            )
            query_results.append(
                score_audit_query(
                    target=record,
                    query_spec=query_spec,
                    results=retrieval.results,
                    context_path=context_path,
                    context_json_path=context_json_path,
                )
            )
        paper_results.append(score_audit_paper(record=record, query_results=query_results, paper_dir=paper_dir))

    summary = summarize_audit_results(paper_results=paper_results)
    manifest_path = out_dir / "retrieval_audit_manifest.json"
    summary_path = out_dir / "retrieval_audit_summary.json"
    summary_markdown_path = out_dir / "retrieval_audit_summary.md"
    manifest = {
        "schema_version": RETRIEVAL_AUDIT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "wiki_root": str(wiki_root),
        "catalog": str(catalog.catalog_path),
        "catalog_count": catalog.count,
        "audited_papers": len(records),
        "top_k": top_k,
        "queries_per_paper": queries_per_paper,
        "summary": summary,
        "papers": paper_results,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    summary_payload = {
        "schema_version": RETRIEVAL_AUDIT_SUMMARY_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "manifest": str(manifest_path),
        **summary,
    }
    summary_path.write_text(json.dumps(summary_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    summary_markdown_path.write_text(render_audit_summary_markdown(summary_payload, paper_results), encoding="utf-8")
    return RetrievalAuditResult(
        manifest_path=manifest_path,
        summary_path=summary_path,
        summary_markdown_path=summary_markdown_path,
        paper_count=len(records),
        query_count=int(summary["query_count"]),
        query_recall_at_k=float(summary["query_recall_at_k"]),
    )


def _attach_section_cache(*, records: list[dict[str, Any]], wiki_root: Path) -> None:
    for record in records:
        path = Path(str(record.get("path") or ""))
        if not path.is_absolute() and not path.exists():
            path = wiki_root / path
        if not path.exists():
            continue
        body = strip_frontmatter(path.read_text(encoding="utf-8"))
        record["_section_contents"] = {
            heading: content
            for heading, content in split_sections(body).items()
            if heading in {
                "What To Remember",
                "When To Retrieve This Paper",
                "Paper Positioning",
                "Mechanism",
                "Mechanism Details To Verify",
                "Evidence Map",
                "Implementation Hooks",
                "Limitations / Uncertainty",
            }
        }


def generate_audit_queries(record: dict[str, Any]) -> list[dict[str, Any]]:
    routing = dict(record.get("routing") or {})
    title = str(record.get("title") or record.get("page_id") or "this paper")
    methods = _clean_values(routing.get("methods"))
    topics = _clean_values(routing.get("topics"))
    settings = _clean_values(routing.get("settings"))
    datasets = _clean_values(routing.get("datasets"))
    metrics = _clean_values(routing.get("metrics"))
    aliases = _clean_values(routing.get("aliases"))
    claims = _clean_values(routing.get("claims"))

    identity = _identity_term(title, aliases)
    method_terms = _join_terms(methods[:2] + topics[:2] + settings[:1], fallback=title)
    implementation_terms = _join_terms([identity] + methods[:2] + aliases[:1] + settings[:1], fallback=method_terms)
    evidence_terms = _join_terms(methods[:1] + topics[:2] + settings[:1] + datasets[:1] + metrics[:1], fallback=method_terms)
    scope_terms = _join_terms(settings[:2] + topics[:2] + claims[:1], fallback=method_terms)
    sparse = not (methods or topics or settings or datasets or metrics)
    sparsity_note = " This page has sparse routing metadata, so retrieval may depend on title/body text." if sparse else ""

    queries = [
        {
            "intent": "method_design",
            "query": (
                f"I am looking for the paper or closely related work on {identity} about {method_terms}. "
                "Retrieve pages that explain the core mechanism, what problem the method is meant to solve, "
                f"and how it relates to nearby methods.{sparsity_note}"
            ),
            "source_fields": _source_fields(methods=methods, topics=topics, settings=settings),
            "metadata_sparse": sparse,
        },
        {
            "intent": "implementation_probe",
            "query": (
                f"Before implementing or probing {implementation_terms}, I need papers with mechanism details, "
                "implementation hooks, ablations, sanity checks, or assumptions that would affect a research codebase."
            ),
            "source_fields": _source_fields(methods=methods, aliases=aliases, settings=settings),
            "metadata_sparse": sparse,
        },
        {
            "intent": "evidence_scope",
            "query": (
                f"I need evidence and scope limits for {identity} and {evidence_terms}. "
                "Retrieve papers that show the relevant datasets, metrics, baselines, limitations, or regimes where the result should not be overgeneralized."
            ),
            "source_fields": _source_fields(
                methods=methods[:1],
                topics=topics,
                settings=settings[:1],
                datasets=datasets,
                metrics=metrics,
            ),
            "metadata_sparse": sparse,
        },
        {
            "intent": "limitation_boundary",
            "query": (
                f"I am checking whether {identity} and {scope_terms} transfer to a new research setting. "
                "Retrieve papers with limitations, assumptions, or taxonomy boundaries that would prevent invalid comparisons."
            ),
            "source_fields": _source_fields(settings=settings, topics=topics, claims=claims),
            "metadata_sparse": sparse,
        },
    ]
    return queries


def score_audit_query(
    *,
    target: dict[str, Any],
    query_spec: dict[str, Any],
    results: list[dict[str, Any]],
    context_path: Path,
    context_json_path: Path,
) -> dict[str, Any]:
    target_path = str(target.get("relative_path") or "")
    target_index = next(
        (index for index, result in enumerate(results, start=1) if str(result.get("relative_path") or "") == target_path),
        None,
    )
    target_result = results[target_index - 1] if target_index is not None else None
    neighbor_results = [result for result in results if str(result.get("relative_path") or "") != target_path]
    neighbor_scores = [_neighbor_reasonableness(target, result) for result in neighbor_results[:3]]
    weak_neighbors = [item for item in neighbor_scores if not item["reasonable"]]
    target_fields = set((target_result or {}).get("matched_frontmatter") or {})
    target_sections = [item.get("heading") for item in (target_result or {}).get("matched_sections") or []]
    title_or_alias_only = bool(target_result) and target_fields.issubset({"aliases"}) and not target_sections
    hard_fails = []
    warnings = []
    if target_index is None:
        hard_fails.append("target_not_retrieved")
    elif target_index > 3:
        warnings.append("target_rank_below_top_3")
    if title_or_alias_only:
        warnings.append("target_retrieved_only_by_alias_without_section_support")
    if query_spec.get("metadata_sparse"):
        warnings.append("target_metadata_sparse")
    if neighbor_results and len(weak_neighbors) == len(neighbor_scores):
        warnings.append("top_neighbors_have_no_routing_overlap")

    return {
        "intent": query_spec["intent"],
        "query": query_spec["query"],
        "source_fields": query_spec.get("source_fields") or {},
        "context_packet": str(context_path),
        "context_json": str(context_json_path),
        "target_page": target_path,
        "target_found": target_index is not None,
        "target_rank": target_index,
        "target_score": target_result.get("score") if target_result else None,
        "target_matched_frontmatter": target_result.get("matched_frontmatter") if target_result else {},
        "target_matched_sections": target_sections,
        "retrieved_pages": [str(result.get("relative_path") or "") for result in results],
        "neighbors": neighbor_scores,
        "reasonable_neighbor_count": sum(1 for item in neighbor_scores if item["reasonable"]),
        "weak_neighbors": weak_neighbors,
        "hard_fails": hard_fails,
        "warnings": warnings,
        "decision": "fail" if hard_fails else ("needs_review" if warnings else "pass"),
    }


def score_audit_paper(
    *,
    record: dict[str, Any],
    query_results: list[dict[str, Any]],
    paper_dir: Path,
) -> dict[str, Any]:
    found = [result for result in query_results if result["target_found"]]
    ranks = [int(result["target_rank"]) for result in found if result["target_rank"] is not None]
    hard_fails = sorted({fail for result in query_results for fail in result.get("hard_fails") or []})
    warnings = sorted({warning for result in query_results for warning in result.get("warnings") or []})
    routing = dict(record.get("routing") or {})
    metadata_sparse = not any(_clean_values(routing.get(field)) for field in ("methods", "topics", "settings", "datasets", "metrics"))
    decision = "fail" if hard_fails else ("needs_review" if warnings or metadata_sparse else "pass")
    return {
        "page_id": record.get("page_id"),
        "relative_path": record.get("relative_path"),
        "title": record.get("title"),
        "review_state": record.get("review_state"),
        "quality_gate": record.get("quality_gate"),
        "confidence": record.get("confidence"),
        "paper_dir": str(paper_dir),
        "metadata_sparse": metadata_sparse,
        "query_count": len(query_results),
        "target_found_queries": len(found),
        "target_recall": len(found) / len(query_results) if query_results else None,
        "best_rank": min(ranks) if ranks else None,
        "average_rank": sum(ranks) / len(ranks) if ranks else None,
        "hard_fails": hard_fails,
        "warnings": warnings,
        "decision": decision,
        "queries": query_results,
    }


def summarize_audit_results(*, paper_results: list[dict[str, Any]]) -> dict[str, Any]:
    query_results = [query for paper in paper_results for query in paper.get("queries") or []]
    found_queries = [query for query in query_results if query.get("target_found")]
    top1_queries = [query for query in query_results if query.get("target_rank") == 1]
    ranks = [int(query["target_rank"]) for query in found_queries if query.get("target_rank") is not None]
    decisions: dict[str, int] = {}
    for paper in paper_results:
        decision = str(paper.get("decision") or "unknown")
        decisions[decision] = decisions.get(decision, 0) + 1
    warning_counts: dict[str, int] = {}
    for paper in paper_results:
        for warning in paper.get("warnings") or []:
            warning_counts[warning] = warning_counts.get(warning, 0) + 1
    return {
        "paper_count": len(paper_results),
        "query_count": len(query_results),
        "paper_decisions": decisions,
        "query_recall_at_k": len(found_queries) / len(query_results) if query_results else 0.0,
        "query_recall_at_1": len(top1_queries) / len(query_results) if query_results else 0.0,
        "paper_full_recall_rate": (
            sum(1 for paper in paper_results if paper.get("target_recall") == 1.0) / len(paper_results)
            if paper_results
            else 0.0
        ),
        "average_target_rank": sum(ranks) / len(ranks) if ranks else None,
        "metadata_sparse_count": sum(1 for paper in paper_results if paper.get("metadata_sparse")),
        "warning_counts": warning_counts,
        "failed_papers": [
            {
                "title": paper.get("title"),
                "relative_path": paper.get("relative_path"),
                "hard_fails": paper.get("hard_fails"),
                "warnings": paper.get("warnings"),
                "target_recall": paper.get("target_recall"),
            }
            for paper in paper_results
            if paper.get("decision") != "pass"
        ],
    }


def render_audit_summary_markdown(summary: dict[str, Any], paper_results: list[dict[str, Any]]) -> str:
    lines = [
        "---",
        'type: "retrieval_audit_summary"',
        f'created: "{datetime.now(timezone.utc).date().isoformat()}"',
        "---",
        "# Retrieval Audit Summary",
        "",
        "This audit asks whether each canonical paper can be recovered from plausible research-intent queries generated from its own wiki metadata and sections.",
        "",
        "## Metrics",
        "",
        f"- Papers audited: {summary.get('paper_count')}",
        f"- Queries run: {summary.get('query_count')}",
        f"- Query recall at k: {_fmt(summary.get('query_recall_at_k'))}",
        f"- Query recall at 1: {_fmt(summary.get('query_recall_at_1'))}",
        f"- Paper full-recall rate: {_fmt(summary.get('paper_full_recall_rate'))}",
        f"- Average target rank: {_fmt(summary.get('average_target_rank'))}",
        f"- Metadata-sparse papers: {summary.get('metadata_sparse_count')}",
        f"- Paper decisions: `{json.dumps(summary.get('paper_decisions') or {}, ensure_ascii=False, sort_keys=True)}`",
        "",
        "## Warning Counts",
        "",
    ]
    warning_counts = dict(summary.get("warning_counts") or {})
    if warning_counts:
        for key, count in sorted(warning_counts.items(), key=lambda item: (-item[1], item[0])):
            lines.append(f"- `{key}`: {count}")
    else:
        lines.append("- No warnings.")
    lines.extend(["", "## Papers Needing Review", ""])
    failed = [paper for paper in paper_results if paper.get("decision") != "pass"]
    if failed:
        for paper in failed:
            lines.extend(
                [
                    f"### {paper.get('title')}",
                    "",
                    f"- Page: `{paper.get('relative_path')}`",
                    f"- Decision: `{paper.get('decision')}`; recall: `{_fmt(paper.get('target_recall'))}`; best rank: `{paper.get('best_rank')}`",
                    f"- Hard fails: `{', '.join(paper.get('hard_fails') or []) or 'none'}`",
                    f"- Warnings: `{', '.join(paper.get('warnings') or []) or 'none'}`",
                    "",
                ]
            )
    else:
        lines.append("- No papers need review under deterministic audit checks.")
    lines.extend(["", "## Per-Paper Snapshot", ""])
    for paper in paper_results:
        lines.append(
            f"- `{paper.get('decision')}` | recall `{_fmt(paper.get('target_recall'))}` | best rank `{paper.get('best_rank')}` | {paper.get('title')}"
        )
    return "\n".join(lines).rstrip() + "\n"


def _load_catalog(catalog_path: Path) -> list[dict[str, Any]]:
    records = []
    with catalog_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if stripped:
                records.append(json.loads(stripped))
    return records


def _neighbor_reasonableness(target: dict[str, Any], neighbor: dict[str, Any]) -> dict[str, Any]:
    target_terms = _routing_terms(target)
    neighbor_terms = _routing_terms(neighbor)
    overlap = sorted(target_terms & neighbor_terms)
    return {
        "relative_path": neighbor.get("relative_path"),
        "title": neighbor.get("title"),
        "score": neighbor.get("score"),
        "shared_terms": overlap[:12],
        "reasonable": bool(overlap),
    }


def _routing_terms(record: dict[str, Any]) -> set[str]:
    routing = dict(record.get("routing") or {})
    terms: set[str] = set()
    for field in ("methods", "topics", "settings", "datasets", "metrics", "models"):
        for value in _clean_values(routing.get(field)):
            terms.update(_tokens(value))
    return {term for term in terms if len(term) > 2}


def _source_fields(**fields: list[str]) -> dict[str, list[str]]:
    return {key: values for key, values in fields.items() if values}


def _identity_term(title: str, aliases: list[str]) -> str:
    title_lower = title.lower()
    for alias in aliases:
        cleaned = alias.strip()
        if len(cleaned) >= 3 and cleaned.lower() in title_lower and not cleaned.lower().startswith("untitled"):
            return cleaned
    title_aliases = _title_specific_aliases(title)
    if title_aliases:
        return title_aliases[0]
    for alias in aliases:
        cleaned = alias.strip()
        if len(cleaned) >= 3 and not cleaned.lower().startswith("untitled"):
            return cleaned
    return title


def _title_specific_aliases(title: str) -> list[str]:
    generic = {
        "LLM",
        "LLMs",
        "KV",
        "CPU",
        "GPU",
        "PTQ",
        "QAT",
        "AI",
        "ML",
        "NLP",
        "VLM",
        "LUT",
        "Post-Training",
        "Quantization-Aware",
        "Outlier-Free",
        "Training-Free",
        "Activation-aware",
        "Weight-Only",
        "Low-Bit",
        "Technical",
        "Report",
        "Survey",
    }
    cleaned_title = re.sub(r"^[A-Z][A-Za-z]+(?: et al\.)? - \d{4} - ", "", title)
    aliases = []
    for match in re.findall(r"\b[A-Z][A-Za-z0-9]*(?:[-#][A-Za-z0-9]+)?\b", cleaned_title):
        if match in generic:
            continue
        has_method_shape = (
            any(character.isupper() for character in match[1:])
            or match.isupper()
            or "#" in match
            or bool(re.fullmatch(r"[A-Z]+-[A-Z0-9]+", match))
        )
        if has_method_shape:
            aliases.append(match)
    return _clean_values(aliases)[:4]


def _clean_values(values: Any) -> list[str]:
    if values is None:
        return []
    if isinstance(values, list):
        raw = values
    else:
        raw = [values]
    cleaned = []
    for value in raw:
        text = str(value).strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _join_terms(values: list[str], *, fallback: str) -> str:
    cleaned = _clean_values(values)
    if not cleaned:
        return fallback
    if len(cleaned) == 1:
        return cleaned[0]
    return ", ".join(cleaned[:-1]) + f", and {cleaned[-1]}"


def _safe_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-")[:160] or "paper"


def _tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", value.lower()) if len(token) > 2}


def _fmt(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.3f}"
    if value is None:
        return "n/a"
    return str(value)
