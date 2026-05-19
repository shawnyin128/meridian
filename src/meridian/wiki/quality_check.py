from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class QualitySelfCheckResult:
    path: Path
    decision: str
    weighted_score: float


DIMENSION_WEIGHTS = {
    "retrieval_scenario_coverage": 1.6,
    "retrieval_taxonomy_boundary": 1.5,
    "frontmatter_body_nonduplication": 1.2,
    "retrieval_intent_quality": 1.4,
    "mechanism_teachability": 1.8,
    "component_contracts": 1.4,
    "evidence_selectivity": 1.4,
    "provenance_density": 1.2,
    "implementation_actionability": 1.2,
    "limitation_specificity": 1.0,
    "metadata_routing_integrity": 1.2,
    "candidate_record_promotion": 1.0,
    "concision_noise_control": 1.0,
}


def run_quality_self_check(*, run_manifest: Path, out_path: Path | None = None) -> QualitySelfCheckResult:
    run = json.loads(run_manifest.read_text(encoding="utf-8"))
    artifacts = dict(run.get("draft_artifacts") or {})
    paper_path = Path(str(artifacts.get("paper_page") or run.get("paper_page") or ""))
    claims_path = Path(str(artifacts.get("claims") or ""))
    methods_path = Path(str(artifacts.get("methods") or ""))
    evidence_path = Path(str(artifacts.get("evidence") or ""))
    pages_path = Path(str(run.get("extraction_dir") or "")) / "pages.jsonl"

    paper_text = _read_text(paper_path)
    frontmatter = _parse_frontmatter(paper_text)
    body = _strip_frontmatter(paper_text)
    sections = _sections(body)
    claims = _read_jsonl(claims_path)
    methods = _read_jsonl(methods_path)
    evidence = _read_jsonl(evidence_path)
    pages = _read_jsonl(pages_path)

    scenarios = _retrieval_scenarios(frontmatter, methods, claims, pages)
    scores = _score_dimensions(
        frontmatter=frontmatter,
        sections=sections,
        paper_text=paper_text,
        claims=claims,
        methods=methods,
        evidence=evidence,
        pages=pages,
        scenarios=scenarios,
    )
    weighted_score = _weighted_score(scores)
    blocking = _blocking_findings(scores)
    decision = _decision(weighted_score, blocking)

    payload = {
        "schema_version": "paper_wiki_quality_self_check.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "run_manifest": str(run_manifest),
        "paper_page": str(paper_path),
        "title": run.get("title"),
        "decision": decision,
        "weighted_score": round(weighted_score, 3),
        "score_scale": "1=misleading, 2=shallow, 3=minimally usable, 4=strong, 5=excellent",
        "dimension_scores": scores,
        "blocking_findings": blocking,
        "retrieval_scenarios": scenarios,
        "quality_buckets": _quality_buckets(scores),
        "recommended_refinements": _recommended_refinements(scores),
    }

    output = out_path or run_manifest.parent / "quality-self-check.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return QualitySelfCheckResult(path=output, decision=decision, weighted_score=weighted_score)


def _score_dimensions(
    *,
    frontmatter: dict[str, Any],
    sections: dict[str, str],
    paper_text: str,
    claims: list[dict[str, Any]],
    methods: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    pages: list[dict[str, Any]],
    scenarios: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        _scenario_coverage_score(frontmatter, sections, scenarios),
        _retrieval_taxonomy_boundary_score(frontmatter, methods),
        _frontmatter_body_nonduplication_score(frontmatter, sections),
        _retrieval_intent_quality_score(sections),
        _mechanism_teachability_score(sections),
        _component_contract_score(methods, sections),
        _evidence_selectivity_score(sections, claims),
        _provenance_density_score(sections, claims, methods),
        _implementation_actionability_score(sections),
        _limitation_specificity_score(sections, frontmatter),
        _metadata_routing_score(frontmatter, paper_text),
        _candidate_record_score(claims, methods, evidence),
        _concision_noise_score(paper_text, sections),
    ]


def _scenario_coverage_score(
    frontmatter: dict[str, Any],
    sections: dict[str, str],
    scenarios: list[dict[str, Any]],
) -> dict[str, Any]:
    retrieval_text = "\n".join(
        [
            _as_text(frontmatter.get("aliases")),
            _as_text(frontmatter.get("topics")),
            _as_text(frontmatter.get("methods")),
            _as_text(frontmatter.get("settings")),
            _as_text(frontmatter.get("datasets")),
            _as_text(frontmatter.get("metrics")),
            sections.get("When To Retrieve This Paper", ""),
            sections.get("Mechanism", ""),
            sections.get("Implementation Hooks", ""),
            sections.get("Limitations / Uncertainty", ""),
        ]
    ).lower()
    passed = 0
    misses = []
    for scenario in scenarios:
        required = [str(item).lower() for item in scenario["required_retrieval_keys"]]
        matched = [key for key in required if key and key in retrieval_text]
        if len(matched) >= max(1, min(3, len(required))):
            passed += 1
        else:
            misses.append({"scenario_id": scenario["id"], "missing_keys": sorted(set(required) - set(matched))[:6]})
    score = 1 + 4 * passed / max(len(scenarios), 1)
    return _dimension(
        "retrieval_scenario_coverage",
        score,
        "retrieval_metadata",
        "Complex downstream retrieval scenarios are covered by frontmatter and body anchors.",
        misses,
    )


def _retrieval_taxonomy_boundary_score(frontmatter: dict[str, Any], method_records: list[dict[str, Any]]) -> dict[str, Any]:
    methods = [str(item) for item in frontmatter.get("methods") or []]
    topics = [str(item) for item in frontmatter.get("topics") or []]
    settings = [str(item) for item in frontmatter.get("settings") or []]
    aliases = [str(item) for item in frontmatter.get("aliases") or []]
    component_names = {
        str(value).lower()
        for record in method_records
        for value in (record.get("name"), record.get("short_name"))
        if value
    }
    paper_specific_aliases = {alias.lower() for alias in aliases if alias and alias.lower() not in {"ptq", "llm"}}
    settings_set = {item.lower() for item in settings}
    method_set = {item.lower() for item in methods}
    topic_set = {item.lower() for item in topics}

    findings: list[str] = []
    method_component_leaks = sorted(method_set & component_names)
    if method_component_leaks:
        findings.append(f"methods_contain_specific_components:{','.join(method_component_leaks[:5])}")
    title_topic_leaks = sorted(topic_set & paper_specific_aliases)
    if title_topic_leaks:
        findings.append(f"topics_contain_title_or_alias:{','.join(title_topic_leaks[:5])}")
    generic_topics = sorted(topic for topic in topic_set if topic in {"error", "errors", "outliers", "design", "models", "methods", "language", "existing", "performance"})
    if generic_topics:
        findings.append(f"generic_topics:{','.join(generic_topics[:8])}")
    settings_in_methods = sorted(settings_set & method_set)
    settings_in_topics = sorted(settings_set & topic_set)
    if settings_in_methods:
        findings.append(f"settings_duplicated_in_methods:{','.join(settings_in_methods[:5])}")
    if settings_in_topics:
        findings.append(f"settings_duplicated_in_topics:{','.join(settings_in_topics[:5])}")
    if not methods:
        findings.append("missing_method_families")
    if not topics:
        findings.append("missing_research_topics")
    if not settings and any("quantization" in value.lower() for value in methods + topics):
        findings.append("missing_quantization_setting")

    score = 5 - 0.75 * len(findings)
    if method_component_leaks or title_topic_leaks or generic_topics:
        score = min(score, 3.0)
    return _dimension(
        "retrieval_taxonomy_boundary",
        score,
        "retrieval_metadata",
        "Frontmatter separates method families, research topics, and experimental/deployment settings without paper-specific or generic noise.",
        findings,
    )


def _frontmatter_body_nonduplication_score(frontmatter: dict[str, Any], sections: dict[str, str]) -> dict[str, Any]:
    retrieval_intent = sections.get("When To Retrieve This Paper", "")
    legacy_anchors = sections.get("Retrieval Anchors", "")
    legacy_notes = sections.get("Retrieval Notes", "")
    findings: list[str] = []
    if legacy_anchors:
        findings.append("legacy_retrieval_anchors_section_repeats_frontmatter")
    if legacy_notes:
        findings.append("legacy_retrieval_notes_section_present")
    if not retrieval_intent:
        findings.append("missing_when_to_retrieve_section")
    if re.search(r"^- (Methods|Topics|Settings|Datasets|Metrics):", retrieval_intent, flags=re.MULTILINE):
        findings.append("when_to_retrieve_contains_frontmatter_field_copy")
    frontmatter_values = {
        str(item).lower()
        for field in ("methods", "topics", "settings", "datasets", "metrics")
        for item in (frontmatter.get(field) or [])
    }
    note_lines = [line.lower() for line in retrieval_intent.splitlines() if line.strip().startswith("-")]
    copied_values = sorted(value for value in frontmatter_values if value and sum(value in line for line in note_lines) >= 2)
    if len(copied_values) >= 4:
        findings.append(f"when_to_retrieve_repeats_frontmatter_values:{','.join(copied_values[:6])}")
    score = 5 - 0.8 * len(findings)
    if legacy_anchors or legacy_notes or "when_to_retrieve_contains_frontmatter_field_copy" in findings:
        score = min(score, 3.0)
    return _dimension(
        "frontmatter_body_nonduplication",
        score,
        "paper_page_template",
        "Body retrieval intent explains use-cases while frontmatter remains the machine-readable source of truth.",
        findings,
    )


def _retrieval_intent_quality_score(sections: dict[str, str]) -> dict[str, Any]:
    intent = sections.get("When To Retrieve This Paper", "")
    lower = intent.lower()
    findings: list[str] = []
    query_examples = re.findall(r"^- Query: .+", intent, flags=re.MULTILINE)
    query_texts = [_query_text(line) for line in query_examples]
    use_reasons = re.findall(r"^\s+Use because: .+", intent, flags=re.MULTILINE)
    scope_lines = _bullets_after(intent, "Scope notes:")
    if not intent:
        findings.append("missing_when_to_retrieve_section")
    if "canonical retrieval fits:" not in lower:
        findings.append("missing_canonical_examples_header")
    if "scope notes:" not in lower:
        findings.append("missing_scope_notes_header")
    if "do not use it when:" in lower:
        findings.append("negative_rule_list_present")
    if len(query_examples) < 3:
        findings.append("too_few_canonical_query_examples")
    if len(use_reasons) < len(query_examples):
        findings.append("missing_use_because_reasons")
    if any(re.search(r"\b(this paper|the paper|the mechanism|this method|target page)\b|paper's", query.lower()) for query in query_texts):
        findings.append("query_assumes_paper_already_retrieved")
    if any(_looks_like_retrofit_component_query(query) for query in query_texts):
        findings.append("query_is_retrofit_to_component_list")
    if len(scope_lines) < 3:
        findings.append("missing_fit_distance_notes")
    for label in ("primary fit", "adjacent fit", "weak fit"):
        if label not in lower:
            findings.append(f"missing_{label.replace(' ', '_')}")
    if any(line.count(";") >= 2 for line in query_examples + use_reasons + scope_lines):
        findings.append("routing_cases_look_like_metadata_list")
    generic_phrases = [
        "questions about",
        "the method, evidence, and uncertainty described",
        "source of truth",
        "scope conditions such as",
    ]
    if any(phrase in lower for phrase in generic_phrases):
        findings.append("template_or_metadata_boilerplate")
    routing_markers = r"\b(compare|adapt|implement|probe|ablat|check|audit|cite|evidence|baseline|bottleneck|scope|setting|query|use because)\b"
    if len(re.findall(routing_markers, lower)) < 5:
        findings.append("routing_intent_lacks_actionable_markers")
    scenario_hits = sum(
        bool(re.search(pattern, lower))
        for pattern in (r"\b(compare|adapt)\b", r"\b(implement|probe|ablat)\b", r"\b(evidence|supported|experiments?)\b")
    )
    if scenario_hits < 3:
        findings.append("canonical_examples_lack_scenario_diversity")
    score = 5 - 0.65 * len(findings)
    if (
        "missing_when_to_retrieve_section" in findings
        or "template_or_metadata_boilerplate" in findings
        or "routing_cases_look_like_metadata_list" in findings
        or "negative_rule_list_present" in findings
        or "query_assumes_paper_already_retrieved" in findings
        or "query_is_retrofit_to_component_list" in findings
    ):
        score = min(score, 3.0)
    return _dimension(
        "retrieval_intent_quality",
        score,
        "paper_page_template",
        "When-to-retrieve prose gives diverse canonical query examples and fit-distance notes rather than metadata boilerplate or negative rule lists.",
        findings,
    )


def _mechanism_teachability_score(sections: dict[str, str]) -> dict[str, Any]:
    mechanism = sections.get("Mechanism", "")
    details = sections.get("Mechanism Details To Verify", "")
    remember = sections.get("What To Remember", "")
    signals = [
        bool(re.search(r"\b(inputs?|outputs?|operates on|produces)\b", mechanism, re.IGNORECASE)),
        bool(re.search(r"\bso |because|while|then|thereby|therefore\b", remember + " " + mechanism, re.IGNORECASE)),
        bool(re.search(r"\bProvenance: p\. \d+", details)),
        "not extracted deeply enough" not in details.lower(),
    ]
    score = 1 + sum(signals)
    findings = []
    if not signals[0]:
        findings.append("mechanism lacks explicit input/output contracts")
    if not signals[1]:
        findings.append("mechanism lacks causal connector explaining why it works")
    if not signals[2]:
        findings.append("mechanism details lack page provenance")
    if not signals[3]:
        findings.append("mechanism detail placeholder remains")
    return _dimension("mechanism_teachability", score, "paper_model_extraction", "paper.md teaches mechanism rather than names.", findings)


def _component_contract_score(methods: list[dict[str, Any]], sections: dict[str, str]) -> dict[str, Any]:
    if not methods:
        return _dimension("component_contracts", 1, "candidate_record_schema", "No method records.", ["missing method records"])
    complete = 0
    incomplete = []
    for method in methods:
        has_contract = all(method.get(field) for field in ("inputs", "outputs", "assumptions", "implementation_notes"))
        if has_contract:
            complete += 1
        else:
            incomplete.append(str(method.get("short_name") or method.get("name") or method.get("id")))
    mechanism_text = sections.get("Mechanism", "")
    section_bonus = 1 if (
        ("Inputs:" in mechanism_text and "Outputs:" in mechanism_text)
        or ("Operates on:" in mechanism_text and "Produces:" in mechanism_text)
    ) else 0
    score = min(5, 1 + 3 * complete / len(methods) + section_bonus)
    return _dimension("component_contracts", score, "candidate_record_schema", "Method records and prose expose component contracts.", incomplete)


def _evidence_selectivity_score(sections: dict[str, str], claims: list[dict[str, Any]]) -> dict[str, Any]:
    evidence_map = sections.get("Evidence Map", "")
    findings = []
    if "not extracted deeply enough" in evidence_map:
        findings.append("evidence takeaway placeholder remains")
    broad_claims = [
        claim.get("id")
        for claim in claims
        if _is_broad_or_noisy_claim(str(claim.get("claim") or claim.get("text") or ""))
    ]
    if broad_claims:
        findings.append(f"broad_or_noisy_claims:{','.join(str(item) for item in broad_claims[:5])}")
    has_takeaway = "Evidence takeaways:" in evidence_map and "not extracted deeply enough" not in evidence_map
    has_specific_evidence_type = bool(re.search(r"\b(table|figure|ablation|latency|perplexity|accuracy|speedup|baseline|W\d+A\d+|INT\d+)\b", evidence_map, re.IGNORECASE))
    score = 1 + sum([has_takeaway, has_specific_evidence_type, not broad_claims, len(claims) >= 2])
    return _dimension("evidence_selectivity", score, "evidence_linking", "Evidence is selective, concrete, and not just abstract claim prose.", findings)


def _provenance_density_score(
    sections: dict[str, str],
    claims: list[dict[str, Any]],
    methods: list[dict[str, Any]],
) -> dict[str, Any]:
    text = "\n".join(sections.values())
    page_refs = len(re.findall(r"\bProvenance: p\. \d+", text))
    expected = max(2, min(8, len(claims) + len(methods)))
    score = min(5, 1 + 4 * page_refs / expected)
    findings = [] if score >= 4 else [f"page_refs={page_refs}, expected_about={expected}"]
    return _dimension("provenance_density", score, "evidence_linking", "Important method and claim statements have page provenance.", findings)


def _implementation_actionability_score(sections: dict[str, str]) -> dict[str, Any]:
    hooks = sections.get("Implementation Hooks", "")
    action_verbs = len(
        re.findall(
            r"\b(implement|track|ablate|compare|verify|record|test|inspect|separate|cache|add|use|log|profile|sweep|store|measure)\b",
            hooks,
            re.IGNORECASE,
        )
    )
    generic = "Extract equations before implementation" in hooks
    score = min(5, 1 + action_verbs / 2)
    if generic and action_verbs < 4:
        score -= 0.75
    findings = []
    if action_verbs < 4:
        findings.append("implementation hooks are too sparse for research coding")
    if generic:
        findings.append("generic equation-extraction hook remains")
    return _dimension("implementation_actionability", max(1, score), "paper_page_template", "Hooks support coding/probe/ablation work.", findings)


def _limitation_specificity_score(sections: dict[str, str], frontmatter: dict[str, Any]) -> dict[str, Any]:
    limitations = sections.get("Limitations / Uncertainty", "")
    title = str(frontmatter.get("title") or "").lower()
    findings = []
    if "No explicit limitations were reliably extracted" in limitations:
        findings.append("generic no-limitations placeholder")
    if "Rotation-based methods" in limitations and not any(key in title for key in ("quarot", "spinquant", "duquant", "dfrot")):
        findings.append("rotation limitation attached to non-rotation paper")
    if "Sparse-retention methods" in limitations and "squeezellm" not in title:
        findings.append("sparse-retention limitation attached to unrelated paper")
    specific_count = len([line for line in limitations.splitlines() if line.strip().startswith("-") and "generic" not in line.lower()])
    score = min(5, 1 + specific_count)
    if findings:
        score = min(score, 2.5)
    return _dimension("limitation_specificity", score, "paper_model_extraction", "Limitations are specific to this paper and do not import unrelated caveats.", findings)


def _metadata_routing_score(frontmatter: dict[str, Any], paper_text: str) -> dict[str, Any]:
    required = ["type", "title", "status", "source_pdf", "source_id", "source_registry", "aliases", "topics", "methods", "settings", "datasets", "metrics", "claims"]
    missing = [field for field in required if not frontmatter.get(field)]
    noisy_topics = [
        topic
        for topic in frontmatter.get("topics") or []
        if str(topic).lower() in {"find", "large", "achieves", "values", "figure", "models", "error", "errors", "outliers", "design", "methods", "language"}
    ]
    untrusted = "Metadata authors: not trusted" in paper_text
    score = 5 - 0.35 * len(missing) - 0.2 * len(noisy_topics)
    findings = []
    if missing:
        findings.append(f"missing_frontmatter:{','.join(missing)}")
    if noisy_topics:
        findings.append(f"noisy_topics:{','.join(map(str, noisy_topics[:6]))}")
    if untrusted:
        findings.append("untrusted_pdf_metadata_visible")
    return _dimension("metadata_routing_integrity", max(1, score), "retrieval_metadata", "Frontmatter routes future retrieval without noisy or missing keys.", findings)


def _candidate_record_score(
    claims: list[dict[str, Any]],
    methods: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
) -> dict[str, Any]:
    findings = []
    if not claims:
        findings.append("missing_claim_records")
    if not methods:
        findings.append("missing_method_records")
    if not evidence:
        findings.append("missing_evidence_records")
    supported_claims = sum(1 for item in evidence if item.get("supports"))
    method_contracts = sum(1 for item in methods if item.get("inputs") and item.get("outputs"))
    score = 1 + min(2, supported_claims / 2) + min(2, method_contracts / max(len(methods), 1) * 2)
    return _dimension("candidate_record_promotion", score, "candidate_record_schema", "Candidate records are promotion-ready for wiki pages.", findings)


def _concision_noise_score(paper_text: str, sections: dict[str, str]) -> dict[str, Any]:
    words = len(paper_text.split())
    findings = []
    if words < 700:
        findings.append("too_short_for_complex_paper")
    if words > 1450:
        findings.append("too_long_for_retrieval_target")
    noise_patterns = [
        "emerged as",
        "fundamental bottleneck",
        "substantial interest",
        "considerable interest",
        "The core mechanism is",
        "Read it as",
    ]
    noise = [pattern for pattern in noise_patterns if pattern.lower() in paper_text.lower()]
    findings.extend(f"noise:{pattern}" for pattern in noise)
    score = 5
    if words < 700 or words > 1450:
        score -= 1
    score -= min(2, len(noise) * 0.5)
    if "Evidence takeaways were not extracted deeply enough" in sections.get("Evidence Map", ""):
        score -= 0.75
    return _dimension("concision_noise_control", max(1, score), "paper_page_template", "Page is concise and avoids filler placeholders.", findings)


def _retrieval_scenarios(
    frontmatter: dict[str, Any],
    methods: list[dict[str, Any]],
    claims: list[dict[str, Any]],
    pages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    title = str(frontmatter.get("title") or "")
    method_families = [str(item) for item in frontmatter.get("methods") or []]
    method_names = [str(item.get("short_name") or item.get("name")) for item in methods if item.get("name")]
    datasets = [str(item) for item in frontmatter.get("datasets") or []]
    metrics = [str(item) for item in frontmatter.get("metrics") or []]
    topics = [str(item) for item in frontmatter.get("topics") or []]
    settings = [str(item) for item in frontmatter.get("settings") or []]
    evidence_pages = [page.get("page_number") for page in pages if page.get("drawing_count", 0) or "Table" in str(page.get("text") or "")]
    method_label = ", ".join(method_names[:3]) or _scenario_method_label(title, method_families)
    implementation_target = _scenario_implementation_target(title, method_families)
    return [
        {
            "id": "idea_to_prior_work_context",
            "query": (
                "I have a new idea that changes the quantization/calibration objective and need papers that explain "
                "which mechanism is being modified, which assumptions must remain true, and what evidence would falsify the idea."
            ),
            "required_retrieval_keys": _dedupe(method_families[:4] + topics[:5] + settings[:3] + ["quantization", "calibration"]),
            "expected_answer_shape": "context packet with mechanism, assumptions, evidence, and uncertainty separated",
        },
        {
            "id": "implementation_probe_planning",
            "query": (
                f"I am modifying {implementation_target} and need pages that tell me how to probe {method_label}: the first functions to code, "
                "which tensors/configs to log, what ablations isolate each component, and which sanity checks prevent false positives."
            ),
            "required_retrieval_keys": _dedupe(method_names[:4] + ["implementation", "ablation", "sanity check"]),
            "expected_answer_shape": "developer-facing implementation hooks grounded in method contracts",
        },
        {
            "id": "evidence_comparison_under_constraints",
            "query": (
                "I am comparing methods under a specific low-bit or benchmark setting. Retrieve papers with the relevant datasets, "
                "metrics, baselines, speed/memory claims, and page-level evidence so I can avoid mixing systems claims with accuracy claims."
            ),
            "required_retrieval_keys": _dedupe(datasets[:5] + metrics[:5] + ["baseline", "table", "figure"]),
            "expected_answer_shape": "claim/evidence map with datasets, metrics, baselines, and provenance",
        },
        {
            "id": "failure_mode_and_scope_review",
            "query": (
                "Before citing or building on prior work in this area, retrieve pages that expose limitations and uncertainty: calibration dependence, hardware/runtime scope, "
                "equivalence assumptions, model-family restrictions, and claims that should not be generalized."
            ),
            "required_retrieval_keys": _dedupe(topics[:4] + settings[:3] + ["limitations", "uncertainty", "calibration", "hardware"]),
            "expected_answer_shape": "scope and caveat checklist that separates paper evidence from wiki synthesis",
        },
        {
            "id": "multimodal_evidence_drilldown",
            "query": (
                "I need prior work where figures, tables, algorithms, or equations carry the core argument, not only prose summaries. "
                "Retrieve the pages and candidate records that tell me where to inspect visual/math evidence."
            ),
            "required_retrieval_keys": _dedupe(["figure", "table", "algorithm", "equation"] + [f"p. {page}" for page in evidence_pages[:3]]),
            "expected_answer_shape": "ranked evidence pointers with page images and semantic reasons",
        },
    ]


def _blocking_findings(scores: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "dimension": str(score["dimension"]),
            "bucket": str(score["generation_bucket"]),
            "reason": "; ".join(str(item) for item in score.get("findings") or []),
        }
        for score in scores
        if float(score["score"]) < 3.0
    ]


def _quality_buckets(scores: list[dict[str, Any]]) -> dict[str, list[str]]:
    buckets: dict[str, list[str]] = {}
    for score in scores:
        if float(score["score"]) >= 4.0:
            continue
        bucket = str(score["generation_bucket"])
        buckets.setdefault(bucket, []).append(str(score["dimension"]))
    return buckets


def _recommended_refinements(scores: list[dict[str, Any]]) -> list[str]:
    recommendations = []
    for score in scores:
        if float(score["score"]) >= 4.0:
            continue
        recommendations.append(
            f"{score['dimension']}: improve {score['generation_bucket']} because {score.get('findings') or score.get('description')}"
        )
    return recommendations


def _decision(weighted_score: float, blocking: list[dict[str, str]]) -> str:
    if weighted_score >= 4.25 and not blocking:
        return "pass"
    if weighted_score >= 3.25:
        return "needs_refine"
    return "fail"


def _weighted_score(scores: list[dict[str, Any]]) -> float:
    total_weight = 0.0
    weighted = 0.0
    for score in scores:
        weight = float(score["weight"])
        total_weight += weight
        weighted += float(score["score"]) * weight
    return weighted / total_weight if total_weight else 0.0


def _dimension(
    dimension: str,
    score: float,
    generation_bucket: str,
    description: str,
    findings: list[Any],
) -> dict[str, Any]:
    return {
        "dimension": dimension,
        "score": round(max(1.0, min(5.0, score)), 2),
        "weight": DIMENSION_WEIGHTS[dimension],
        "generation_bucket": generation_bucket,
        "description": description,
        "findings": findings,
    }


def _parse_frontmatter(text: str) -> dict[str, Any]:
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
            data.setdefault(current_key, []).append(_unquote(line[4:].strip()))
            continue
        if ":" not in line:
            continue
        key, raw = line.split(":", 1)
        current_key = key.strip()
        value = raw.strip()
        if not value:
            data[current_key] = []
        elif value == "[]":
            data[current_key] = []
        else:
            data[current_key] = _unquote(value)
    return data


def _strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---", 4)
    if end == -1:
        return text
    return text[end + 4 :].lstrip()


def _sections(markdown: str) -> dict[str, str]:
    matches = list(re.finditer(r"^## (.+)$", markdown, flags=re.MULTILINE))
    result: dict[str, str] = {}
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        result[match.group(1).strip()] = markdown[start:end].strip()
    return result


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                records.append(payload)
    return records


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return value


def _as_text(value: object) -> str:
    if isinstance(value, list):
        return " ".join(str(item) for item in value)
    return str(value or "")


def _bullets_between(text: str, start_header: str, end_header: str) -> list[str]:
    start = text.lower().find(start_header.lower())
    if start == -1:
        return []
    end = text.lower().find(end_header.lower(), start + len(start_header))
    block = text[start + len(start_header) : end if end != -1 else len(text)]
    return [line.strip() for line in block.splitlines() if line.strip().startswith("-")]


def _bullets_after(text: str, start_header: str) -> list[str]:
    start = text.lower().find(start_header.lower())
    if start == -1:
        return []
    block = text[start + len(start_header) :]
    return [line.strip() for line in block.splitlines() if line.strip().startswith("-")]


def _query_text(line: str) -> str:
    match = re.search(r'^- Query:\s+"(.+)"$', line.strip())
    return match.group(1) if match else line


def _scenario_method_label(title: str, method_families: list[str]) -> str:
    short_name = _short_title_label(title)
    if short_name:
        return short_name
    return _human_list(method_families[:2], "the target method")


def _scenario_implementation_target(title: str, method_families: list[str]) -> str:
    short_name = _short_title_label(title)
    if short_name:
        return f"a {short_name} implementation"
    method_family = _human_list(method_families[:1], "research method")
    return f"a {method_family} implementation"


def _short_title_label(title: str) -> str:
    candidate = title.split(":", 1)[0].strip()
    if candidate and len(candidate.split()) <= 4:
        return candidate
    return ""


def _looks_like_retrofit_component_query(query: str) -> bool:
    lowered = query.lower()
    if "codebase" in lowered or "implementation" in lowered or "modifying" in lowered:
        return False
    if not re.search(r"\b(probes?|ablations?)\b", lowered):
        return False
    acronyms = re.findall(r"\b[A-Z][A-Z0-9-]{1,}\b", query)
    return len(acronyms) >= 2


def _is_broad_or_noisy_claim(text: str) -> bool:
    lowered = text.lower()
    broad = any(
        phrase in lowered
        for phrase in (
            "substantial accuracy gains",
            "broad applicability",
            "significant performance gains",
            "outperforms",
        )
    )
    if broad and not re.search(r"\b(table|figure|w\d|a\d|int\d|\d+(?:\.\d+)?\s*[×x%])\b", lowered):
        return True
    return bool(re.search(r"\bin-\s+ference|consumer-\s+grade|per-\s+formance|wikitext2\(", lowered))


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        key = item.lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result
