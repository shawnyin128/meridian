from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.concepts import run_concept_audit
from meridian.wiki.final_product import final_product_check
from meridian.wiki.knowledge import run_knowledge_audit
from meridian.wiki.vault import audit_sources, lint_wiki

HEALTH_SCHEMA_VERSION = "meridian.wiki_health.v0"
HEALTH_MODEL_VERSION = "0.2.0"


@dataclass(frozen=True)
class WikiHealthResult:
    report_path: Path
    markdown_path: Path
    html_path: Path
    repair_plan_path: Path | None
    health_level: str
    overall_score: int
    hard_failures: list[dict[str, Any]]
    dimensions: list[dict[str, Any]]


def run_wiki_health(
    *,
    wiki_root: Path,
    profile: str = "daily",
    out_path: Path | None = None,
    markdown_path: Path | None = None,
    html_path: Path | None = None,
    repair_plan: bool = False,
    repair_plan_path: Path | None = None,
) -> WikiHealthResult:
    wiki_root = wiki_root.expanduser().resolve()
    index_dir = wiki_root / ".index"
    index_dir.mkdir(parents=True, exist_ok=True)

    source = audit_sources(wiki_root=wiki_root)
    lint = lint_wiki(wiki_root=wiki_root)
    knowledge = run_knowledge_audit(
        wiki_root=wiki_root,
        brief_path=index_dir / "knowledge-audit.md",
    )
    concept = run_concept_audit(
        wiki_root=wiki_root,
        brief_path=index_dir / "concept-audit.md",
    )
    final = final_product_check(
        wiki_root=wiki_root,
        brief_path=index_dir / "final-product-check.md",
    )

    inputs = {
        "source_audit": _read_json(source.audit_path),
        "wiki_lint": _read_json(lint.report_path),
        "knowledge_audit": _read_json(knowledge.report_path),
        "concept_audit": _read_json(concept.report_path),
        "final_product_check": _read_json(final.report_path),
    }
    dimensions = _score_dimensions(inputs)
    hard_failures = _hard_failures(inputs)
    overall_score = _overall_score(dimensions)
    repair_queue = _repair_queue(inputs)
    health_level = _health_level(
        overall_score=overall_score,
        hard_failures=hard_failures,
        repair_queue=repair_queue,
    )
    top_insight = _top_insight(dimensions=dimensions, repair_queue=repair_queue, hard_failures=hard_failures)

    payload = {
        "schema_version": HEALTH_SCHEMA_VERSION,
        "health_model_version": HEALTH_MODEL_VERSION,
        "created_at": _now(),
        "wiki_root": str(wiki_root),
        "profile": profile,
        "health_level": health_level,
        "overall_score": overall_score,
        "main_insight": top_insight,
        "dimensions": dimensions,
        "hard_failures": hard_failures,
        "repair_queue": repair_queue,
        "input_reports": {
            "source_audit": str(source.audit_path),
            "wiki_lint": str(lint.report_path),
            "knowledge_audit": str(knowledge.report_path),
            "concept_audit": str(concept.report_path),
            "final_product_check": str(final.report_path),
        },
        "scoring_contract": _scoring_contract(),
    }

    report_path = out_path or index_dir / "wiki-health.json"
    markdown = markdown_path or index_dir / "wiki-health.md"
    html = html_path or index_dir / "wiki-health.html"
    repair_path = repair_plan_path or wiki_root / ".drafts" / "health" / _health_run_slug(payload) / "repair-plan.md"

    _write_json(report_path, payload)
    markdown.write_text(_render_markdown(payload), encoding="utf-8")
    html.write_text(_render_html(payload), encoding="utf-8")
    written_repair_path: Path | None = None
    if repair_plan:
        repair_path.parent.mkdir(parents=True, exist_ok=True)
        repair_path.write_text(_render_repair_plan(payload), encoding="utf-8")
        written_repair_path = repair_path

    return WikiHealthResult(
        report_path=report_path,
        markdown_path=markdown,
        html_path=html,
        repair_plan_path=written_repair_path,
        health_level=health_level,
        overall_score=overall_score,
        hard_failures=hard_failures,
        dimensions=dimensions,
    )


def _score_dimensions(inputs: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    source = inputs["source_audit"]
    lint = inputs["wiki_lint"]
    knowledge_metrics = dict(inputs["knowledge_audit"].get("metrics") or {})
    concept_metrics = dict(inputs["concept_audit"].get("metrics") or {})
    final_metrics = dict(inputs["final_product_check"].get("metrics") or {})

    missing = _int(source.get("missing_managed"))
    sha_mismatch = _int(source.get("sha_mismatches"))
    duplicate_sha = _int(source.get("duplicate_sha_groups"))
    evidence_without_source = _int(knowledge_metrics.get("evidence_without_source_provenance"))
    source_quality_misuse = _int(knowledge_metrics.get("source_quality_misuse")) + _int(
        concept_metrics.get("source_quality_contamination")
    )

    trust_sub = [
        _sub("Sources", _deduct(100, missing * 25 + sha_mismatch * 25 + duplicate_sha * 10, cap=100), f"{source.get('total', 0)} managed sources, {missing} missing, {sha_mismatch} SHA mismatch."),
        _sub("Provenance", _deduct(100, evidence_without_source * 15, cap=60), f"{evidence_without_source} evidence records without source provenance."),
        _sub("Boundaries", 0 if source_quality_misuse else 94, f"{source_quality_misuse} source-quality contamination findings."),
    ]

    lint_findings = list(inputs["wiki_lint"].get("findings") or [])
    no_link_papers = sum(1 for item in lint_findings if dict(item).get("bucket") == "paper_has_no_wikilinks")
    frontmatter_gaps = _int(knowledge_metrics.get("pages_with_frontmatter_gaps"))
    required_section_gaps = _int(knowledge_metrics.get("pages_with_required_section_gaps"))
    draft_leaks = _catalog_boundary_leaks(wiki_root=Path(str(inputs["source_audit"].get("wiki_root") or ".")))
    surface_sub = [
        _sub("Canonical Corpus", _deduct(100, frontmatter_gaps * 5 + required_section_gaps * 3, cap=60), "Canonical pages are parseable and indexed."),
        _sub("Product Boundary", 0 if draft_leaks else 95, f"{len(draft_leaks)} draft/version paths detected in normal catalog."),
        _sub("Navigation", _deduct(100, no_link_papers * 10, cap=50), f"{no_link_papers} paper pages reported with no wikilinks."),
    ]

    counts = dict(final_metrics.get("counts") or knowledge_metrics.get("counts") or {})
    corpus_types = _present_corpus_types(counts)
    coverage_score = round(100 * len(corpus_types) / 7) if corpus_types else 0
    syntheses = _int(counts.get("syntheses"))
    methods_requiring = _int(concept_metrics.get("methods_requiring_prerequisite_concepts"))
    methods_with_prereqs = _int(concept_metrics.get("methods_with_prerequisite_concepts"))
    prereq_ratio = methods_with_prereqs / methods_requiring if methods_requiring else 1.0
    task_score = round(min(95, 55 + prereq_ratio * 35 + min(syntheses, 40) * 0.25))
    context_sub = [
        _sub("Retrieval Coverage", coverage_score, f"{', '.join(corpus_types) or 'no'} corpus types present."),
        _sub("Task Usefulness", task_score, f"{methods_with_prereqs} / {methods_requiring} prerequisite methods linked; {syntheses} syntheses."),
        _sub("Explanation", 80, "Context packets expose result types; why-to-read hints can improve."),
    ]

    duplicate_aliases = _int(knowledge_metrics.get("duplicate_method_topic_alias_groups"))
    claims_without_evidence = _int(knowledge_metrics.get("claims_without_evidence"))
    low_info = _int(knowledge_metrics.get("low_information_pages")) + _int(concept_metrics.get("low_information_concept_stubs"))
    graph_sub = [
        _sub("Method/Topic Clarity", _deduct(100, duplicate_aliases * 2, cap=45), f"{duplicate_aliases} duplicate method/topic alias groups."),
        _sub("Concept Coverage", round(55 + prereq_ratio * 40) if methods_requiring else 95, f"{methods_with_prereqs} / {methods_requiring} methods needing prerequisites have concept links."),
        _sub("Claim Trace", _deduct(100, claims_without_evidence * 10 + evidence_without_source * 15, cap=70), f"{claims_without_evidence} claims without evidence; {evidence_without_source} evidence without source provenance."),
        _sub("Stub Suppression", _deduct(100, low_info * 10, cap=70), f"{low_info} low-information pages reported."),
    ]

    findings_count = sum(len(list(inputs[name].get("findings") or [])) for name in ("knowledge_audit", "concept_audit", "final_product_check"))
    synthesis_missing_sources = _int(knowledge_metrics.get("syntheses_without_source_papers"))
    growth_sub = [
        _sub("Repair Queue", _deduct(92, max(0, findings_count - 5), cap=35), f"{findings_count} deterministic findings mapped to repair buckets."),
        _sub("Synthesis Evolution", _deduct(min(92, 50 + syntheses), synthesis_missing_sources * 10, cap=45), f"{syntheses} syntheses; {synthesis_missing_sources} without source papers."),
        _sub("Revision Readiness", 76 if inputs["final_product_check"].get("status") == "warn" else 88, "Proposal and revision paths are available."),
    ]

    return [
        _dimension("Trust", 0.22, trust_sub, "Source safety, provenance, and boundary correctness."),
        _dimension("Surface", 0.16, surface_sub, "Canonical page cleanliness and product artifact boundaries."),
        _dimension("Context", 0.22, context_sub, "Retrieval usefulness for research, coding, evidence, and synthesis tasks."),
        _dimension("Graph", 0.25, graph_sub, "Method/topic/concept/claim/evidence connectivity and density."),
        _dimension("Growth", 0.15, growth_sub, "Repair queue, synthesis evolution, and proposal/revision readiness."),
    ]


def _repair_queue(inputs: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    knowledge_metrics = dict(inputs["knowledge_audit"].get("metrics") or {})
    concept_metrics = dict(inputs["concept_audit"].get("metrics") or {})
    lint_findings = list(inputs["wiki_lint"].get("findings") or [])
    queue: list[dict[str, Any]] = []
    duplicate_aliases = _int(knowledge_metrics.get("duplicate_method_topic_alias_groups"))
    if duplicate_aliases:
        queue.append(
            _repair(
                "Consolidate duplicate method/topic aliases",
                "knowledge_graph",
                "high",
                f"{duplicate_aliases} duplicate method/topic alias groups can split retrieval across competing pages.",
                "Generate a knowledge repair proposal and publish low-risk backlink/role updates.",
            )
        )
    methods_requiring = _int(concept_metrics.get("methods_requiring_prerequisite_concepts"))
    methods_with_prereqs = _int(concept_metrics.get("methods_with_prerequisite_concepts"))
    if methods_requiring and methods_with_prereqs < methods_requiring:
        queue.append(
            _repair(
                "Improve prerequisite concept coverage",
                "concept_coverage",
                "high",
                f"{methods_with_prereqs} of {methods_requiring} methods needing prerequisite concepts have links.",
                "Prioritize high-value method-family pages used by coding/debug/probe queries.",
            )
        )
    claims_without_evidence = _int(knowledge_metrics.get("claims_without_evidence"))
    if claims_without_evidence:
        queue.append(
            _repair(
                "Repair claim evidence gaps",
                "claim_evidence_traceability",
                "medium",
                f"{claims_without_evidence} claims lack linked evidence.",
                "Attach source-grounded evidence or mark claims as needs_evidence.",
            )
        )
    no_link_papers = sum(1 for item in lint_findings if dict(item).get("bucket") == "paper_has_no_wikilinks")
    if no_link_papers:
        queue.append(
            _repair(
                "Link isolated paper pages",
                "canonical_linking",
                "medium",
                f"{no_link_papers} paper pages have no wikilinks.",
                "Add low-risk topic, method, and concept backlinks.",
            )
        )
    source_quality_misuse = _int(knowledge_metrics.get("source_quality_misuse")) + _int(
        concept_metrics.get("source_quality_contamination")
    )
    if source_quality_misuse:
        queue.insert(
            0,
            _repair(
                "Remove source-quality contamination",
                "source_boundary",
                "critical",
                f"{source_quality_misuse} source-quality contamination findings.",
                "Demote contaminated evidence and require source re-check before publishing.",
            ),
        )
    return queue[:8]


def _hard_failures(inputs: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    source = inputs["source_audit"]
    knowledge_metrics = dict(inputs["knowledge_audit"].get("metrics") or {})
    concept_metrics = dict(inputs["concept_audit"].get("metrics") or {})
    failures: list[dict[str, Any]] = []
    if _int(source.get("missing_managed")):
        failures.append({"code": "missing_source", "message": f"{source.get('missing_managed')} managed source files are missing."})
    if _int(source.get("sha_mismatches")):
        failures.append({"code": "source_sha_mismatch", "message": f"{source.get('sha_mismatches')} managed source files have SHA mismatches."})
    if _int(knowledge_metrics.get("source_quality_misuse")):
        failures.append({"code": "source_quality_misuse", "message": "Source-quality hold is being used as evidence."})
    if _int(concept_metrics.get("source_quality_contamination")):
        failures.append({"code": "concept_source_quality_contamination", "message": "Concept layer includes source-quality contamination."})
    leaks = _catalog_boundary_leaks(wiki_root=Path(str(source.get("wiki_root") or ".")))
    if leaks:
        failures.append({"code": "retrieval_boundary_leak", "message": f"{len(leaks)} draft/version paths are present in normal catalog.", "paths": leaks[:10]})
    return failures


def _health_level(*, overall_score: int, hard_failures: list[dict[str, Any]], repair_queue: list[dict[str, Any]]) -> str:
    if hard_failures:
        return "blocked"
    if overall_score < 55:
        return "blocked"
    if overall_score < 70:
        return "degraded"
    if overall_score < 86 or repair_queue:
        return "usable_with_warnings"
    if overall_score < 94:
        return "usable"
    return "excellent"


def _top_insight(
    *,
    dimensions: list[dict[str, Any]],
    repair_queue: list[dict[str, Any]],
    hard_failures: list[dict[str, Any]],
) -> str:
    if hard_failures:
        return f"Wiki health is blocked by {hard_failures[0]['code']}: {hard_failures[0]['message']}"
    weakest = min(dimensions, key=lambda item: int(item["score"]))
    if repair_queue:
        top = repair_queue[0]
        return f"The wiki is usable now; the highest-leverage repair is {top['title'].lower()} in {top['bucket']}."
    return f"The wiki is healthy; the weakest dimension is {weakest['name']} at {weakest['score']}."


def _overall_score(dimensions: list[dict[str, Any]]) -> int:
    return round(sum(float(item["weight"]) * int(item["score"]) for item in dimensions))


def _dimension(name: str, weight: float, subdimensions: list[dict[str, Any]], summary: str) -> dict[str, Any]:
    score = round(sum(int(item["score"]) for item in subdimensions) / len(subdimensions)) if subdimensions else 0
    return {
        "name": name,
        "score": score,
        "weight": weight,
        "summary": summary,
        "subdimensions": subdimensions,
    }


def _sub(name: str, score: int, signal: str) -> dict[str, Any]:
    return {"name": name, "score": max(0, min(100, int(score))), "signal": signal}


def _repair(title: str, bucket: str, severity: str, evidence: str, next_action: str) -> dict[str, Any]:
    return {
        "title": title,
        "bucket": bucket,
        "severity": severity,
        "evidence": evidence,
        "next_action": next_action,
    }


def _deduct(base: int, deduction: int | float, *, cap: int) -> int:
    return max(0, round(base - min(float(deduction), cap)))


def _present_corpus_types(counts: dict[str, Any]) -> list[str]:
    labels = ["papers", "methods", "topics", "concepts", "claims", "evidence", "syntheses"]
    return [label for label in labels if _int(counts.get(label)) > 0]


def _catalog_boundary_leaks(*, wiki_root: Path) -> list[str]:
    leaks: list[str] = []
    index_dir = wiki_root / ".index"
    for path in index_dir.glob("*.jsonl"):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            relative = str(item.get("relative_path") or item.get("path") or "")
            if ".drafts/" in relative or ".versions/" in relative:
                leaks.append(relative)
    return leaks


def _scoring_contract() -> dict[str, Any]:
    return {
        "deterministic_first": True,
        "llm_judge_in_default_path": False,
        "hard_failures_override_score": True,
        "compare_only_with_same_health_model_version": True,
        "dimensions": ["Trust", "Surface", "Context", "Graph", "Growth"],
    }


def _render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Meridian Wiki Health",
        "",
        f"Model: `{payload['health_model_version']}`",
        f"Created: `{payload['created_at']}`",
        f"Health level: `{payload['health_level']}`",
        f"Overall score: `{payload['overall_score']} / 100`",
        "",
        "## Main Insight",
        "",
        str(payload["main_insight"]),
        "",
        "## Health Dimensions",
        "",
        "| Dimension | Score | Summary |",
        "|---|---:|---|",
    ]
    for dimension in payload["dimensions"]:
        lines.append(f"| {dimension['name']} | {dimension['score']} | {dimension['summary']} |")
    lines.extend(["", "## Subdimensions", ""])
    for dimension in payload["dimensions"]:
        lines.append(f"### {dimension['name']}: {dimension['score']}")
        lines.extend(["", "| Subdimension | Score | Signal |", "|---|---:|---|"])
        for sub in dimension["subdimensions"]:
            lines.append(f"| {sub['name']} | {sub['score']} | {sub['signal']} |")
        lines.append("")
    lines.extend(["## What Needs Attention", ""])
    queue = list(payload.get("repair_queue") or [])
    if not queue:
        lines.append("No deterministic repair items found.")
    for index, item in enumerate(queue, start=1):
        lines.extend(
            [
                f"{index}. **{item['title']}** (`{item['bucket']}`, {item['severity']})",
                f"   - Evidence: {item['evidence']}",
                f"   - Next fix: {item['next_action']}",
                "",
            ]
        )
    lines.extend(["## Hard Failures", ""])
    failures = list(payload.get("hard_failures") or [])
    if not failures:
        lines.append("No hard failures detected.")
    for item in failures:
        lines.append(f"- `{item['code']}`: {item['message']}")
    lines.append("")
    return "\n".join(lines)


def _render_repair_plan(payload: dict[str, Any]) -> str:
    lines = [
        "# Wiki Health Repair Plan",
        "",
        f"Source health report: `{payload['input_reports'].get('wiki_health', 'wiki-health.json')}`",
        "",
    ]
    for index, item in enumerate(payload.get("repair_queue") or [], start=1):
        lines.extend(
            [
                f"## {index}. {item['title']}",
                "",
                f"- Severity: `{item['severity']}`",
                f"- Bucket: `{item['bucket']}`",
                f"- Evidence: {item['evidence']}",
                f"- Next action: {item['next_action']}",
                "",
            ]
        )
    if not payload.get("repair_queue"):
        lines.append("No repair items found.")
    return "\n".join(lines)


def _render_html(payload: dict[str, Any]) -> str:
    dimensions = "\n".join(_dimension_html(dimension) for dimension in payload["dimensions"])
    repairs = "\n".join(_repair_html(index, item) for index, item in enumerate(payload.get("repair_queue") or [], start=1))
    if not repairs:
        repairs = "<p>No deterministic repair items found.</p>"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Meridian Wiki Health</title>
  <style>
    :root {{--bg:#f6f5f1;--ink:#202124;--muted:#656761;--line:#d9d7cf;--panel:#fff;--good:#167a4a;--warn:#a76500;--blue:#245f9f;}}
    * {{ box-sizing: border-box; }}
    body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ max-width:1180px; margin:0 auto; padding:30px 24px 46px; }}
    header {{ display:grid; grid-template-columns:1fr auto; gap:24px; align-items:end; padding-bottom:20px; border-bottom:1px solid var(--line); }}
    h1 {{ margin:0 0 6px; font-size:30px; letter-spacing:0; }}
    h2 {{ margin:0 0 14px; font-size:17px; letter-spacing:0; }}
    h3 {{ margin:0 0 6px; font-size:15px; letter-spacing:0; }}
    p {{ margin:0; color:var(--muted); }}
    .score {{ text-align:right; min-width:190px; }}
    .score strong {{ display:block; font-size:42px; line-height:1; color:var(--warn); }}
    .score span {{ display:inline-block; margin-top:8px; padding:4px 9px; border:1px solid #d6a348; color:#7b4d00; background:#fff7e6; border-radius:6px; font-size:13px; font-weight:650; }}
    .lede {{ margin-top:20px; padding:18px; border:1px solid #d6c28e; border-left:6px solid var(--warn); background:#fffaf0; border-radius:8px; }}
    .lede b {{ color:var(--ink); }}
    .grid {{ display:grid; grid-template-columns:1.1fr .9fr; gap:18px; margin-top:18px; }}
    section {{ background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px; }}
    .issues {{ display:grid; gap:12px; }}
    .issue {{ display:grid; grid-template-columns:30px 1fr; gap:12px; padding:13px 0; border-top:1px solid var(--line); }}
    .issue:first-child {{ border-top:0; padding-top:0; }}
    .rank {{ width:26px; height:26px; display:grid; place-items:center; border-radius:50%; background:#f0e4c8; color:#775000; font-weight:700; font-size:13px; }}
    .tag {{ display:inline-block; margin-left:7px; padding:2px 6px; border-radius:5px; background:#eef2f6; color:#475467; font-size:12px; font-weight:600; }}
    .dimensions {{ display:grid; gap:12px; }}
    details.dimension {{ border:1px solid var(--line); border-radius:8px; background:#fbfbf8; overflow:hidden; }}
    details.dimension summary {{ display:grid; grid-template-columns:120px minmax(120px,1fr) 46px 18px; gap:12px; align-items:center; padding:12px; cursor:pointer; list-style:none; }}
    details.dimension summary::-webkit-details-marker {{ display:none; }}
    details.dimension summary::after {{ content:"+"; grid-column:4; grid-row:1; justify-self:end; color:var(--muted); font-weight:700; }}
    details.dimension[open] summary::after {{ content:"-"; }}
    .dimension-body {{ padding:0 12px 12px; }}
    .q-name {{ font-weight:650; color:#30312e; }}
    .bar {{ height:10px; background:#ecebe6; border-radius:999px; overflow:hidden; }}
    .fill {{ height:100%; background:var(--blue); }}
    details.dimension:nth-child(1) .fill {{ background:var(--good); }}
    details.dimension:nth-child(4) .fill, details.dimension:nth-child(5) .fill {{ background:var(--warn); }}
    .q-score {{ grid-column:3; text-align:right; color:var(--muted); font-variant-numeric:tabular-nums; font-weight:650; }}
    .sub {{ display:grid; grid-template-columns:1fr 34px; gap:8px; align-items:center; padding:9px 0; border-top:1px solid var(--line); font-size:13px; }}
    .sub:first-of-type {{ border-top:0; }}
    .sub small {{ display:block; color:var(--muted); font-size:12px; margin-top:2px; }}
    .sub-score {{ text-align:right; font-variant-numeric:tabular-nums; color:var(--muted); font-weight:650; }}
    footer {{ margin-top:18px; color:var(--muted); font-size:13px; }}
    @media (max-width:860px) {{ header,.grid{{display:block;}} .score{{text-align:left;margin-top:18px;}} .grid section{{margin-top:16px;}} details.dimension summary{{grid-template-columns:1fr 46px 18px;gap:8px;}} details.dimension summary .bar{{grid-column:1/-1;}} details.dimension summary::after{{grid-column:3;}} .q-score{{text-align:left;}} }}
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Meridian Wiki Health</h1>
        <p>{_escape_html(payload['health_model_version'])} · deterministic scoring · {_escape_html(payload['profile'])}</p>
      </div>
      <div class="score">
        <strong>{payload['overall_score']}</strong>
        <span>{_escape_html(payload['health_level'])}</span>
      </div>
    </header>
    <div class="lede"><p><b>Main insight:</b> {_escape_html(str(payload['main_insight']))}</p></div>
    <div class="grid">
      <section><h2>What Needs Attention</h2><div class="issues">{repairs}</div></section>
      <section><h2>Health Dimensions</h2><div class="dimensions">{dimensions}</div></section>
    </div>
    <footer>Generated by <code>meridian wiki health</code>. Default health is deterministic and does not call an LLM.</footer>
  </main>
</body>
</html>
"""


def _dimension_html(dimension: dict[str, Any]) -> str:
    subs = "\n".join(
        f'<div class="sub"><div>{_escape_html(sub["name"])}<small>{_escape_html(sub["signal"])}</small></div><div class="sub-score">{sub["score"]}</div></div>'
        for sub in dimension["subdimensions"]
    )
    return f"""<details class="dimension">
  <summary>
    <div class="q-name">{_escape_html(dimension['name'])}</div>
    <div class="bar"><div class="fill" style="width:{dimension['score']}%"></div></div>
    <div class="q-score">{dimension['score']}</div>
  </summary>
  <div class="dimension-body">
    <p>{_escape_html(dimension['summary'])}</p>
    {subs}
  </div>
</details>"""


def _repair_html(index: int, item: dict[str, Any]) -> str:
    return f"""<div class="issue">
  <div class="rank">{index}</div>
  <div>
    <h3>{_escape_html(item['title'])}<span class="tag">{_escape_html(item['bucket'])}</span></h3>
    <p>{_escape_html(item['evidence'])} {_escape_html(item['next_action'])}</p>
  </div>
</div>"""


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _health_run_slug(payload: dict[str, Any]) -> str:
    return f"{str(payload['created_at'])[:10]}-{payload['overall_score']}-{payload['health_level']}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
