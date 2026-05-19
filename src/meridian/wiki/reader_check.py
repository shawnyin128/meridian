from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def build_reader_check_packet(*, run_manifest: Path, out_path: Path) -> Path:
    run = json.loads(run_manifest.read_text(encoding="utf-8"))
    artifacts = dict(run.get("draft_artifacts") or {})
    paper_path = Path(str(artifacts.get("paper_page") or run.get("paper_page") or ""))
    claims_path = Path(str(artifacts.get("claims") or ""))
    methods_path = Path(str(artifacts.get("methods") or ""))
    evidence_path = Path(str(artifacts.get("evidence") or ""))
    extraction_dir = Path(str(run.get("extraction_dir") or ""))
    pages_path = extraction_dir / "pages.jsonl"

    packet = [
        "# Paper Wiki Reader Check Packet",
        "",
        "Schema version: `paper_wiki_reader_check.v2`",
        "",
        "This packet is for self-iteration of the ingest mechanism. It is not asking whether the prose sounds nice.",
        "It asks whether `paper.md` can teach the paper to a new researcher, and if not, which generation mechanism failed.",
        "",
        "## Run Context",
        "",
        _fenced("json", json.dumps(_run_context(run), indent=2)),
        "",
        "## Required Procedure",
        "",
        "1. Run Reader A using only the `paper.md` section below. Reader A must write a teach-back explanation without opening source text or candidate JSONL.",
        "2. Run Reader B using the source-grounded excerpt section below. Reader B must write a fresh paper explanation from paper evidence, ignoring Reader A.",
        "3. Run the mandatory checklist. Every item must be marked `pass`, `weak`, `fail`, or `not_applicable`; `weak` and `fail` require evidence and a generation bucket.",
        "4. Score the rubric dimensions using the anchored 1-5 scale. Scores must cite packet evidence and explain the gap between Reader A and Reader B.",
        "5. Compare Reader A and Reader B across all comparison dimensions. Missing causality, missing implementation detail, vague mechanism names, or unsupported confidence are mismatches.",
        "6. Audit retrieval/frontmatter and candidate records. A packet can teach the paper but still fail as LLM Wiki state if future retrieval would miss or distort it.",
        "7. Specifically audit the retrieval taxonomy: `methods` are reusable method families, `topics` are research problems/objects, `settings` are experimental/deployment/model conditions, and exact component names belong in aliases or candidate method records.",
        "8. Specifically audit frontmatter/body duplication: frontmatter is the machine-readable retrieval source of truth; `When To Retrieve This Paper` should explain positive and negative semantic routing intent, not copy frontmatter lists.",
        "9. Produce the output JSON only. Do not rewrite `paper.md`; recommend mechanism-level fixes and tests.",
        "",
        "## Minimum Bar",
        "",
        "- A new researcher should understand what problem the paper solves, how the method works, why each component exists, what evidence supports it, and what remains uncertain.",
        "- Mechanism names alone are not explanations. If a component is named but its inputs, transformation, output, dependency, and failure mode are absent, mark it at least `weak`.",
        "- Claims and evidence must stay separate. Do not let a polished source-grounded explanation hide that `paper.md` failed to teach the same thing.",
        "- Retrieval must be tested as future use: would a later idea/query about method, dataset, metric, limitation, or implementation retrieve this page for the right reason?",
        "- Retrieval schema must be tested as taxonomy: paper-specific titles/components are aliases or records, not reusable topics/method families; weight-only, weight-activation, KV-cache, MoE, hardware, and similar conditions belong in settings.",
        "- Body retrieval prose must not duplicate frontmatter. If `Retrieval Anchors` or `Retrieval Notes` simply repeats methods/topics/settings/datasets/metrics, mark the template at least `weak`.",
        "- `When To Retrieve This Paper` must contain both positive use cases and negative routing cases; a section that only says to consult frontmatter is template noise.",
        "",
        "## Mandatory Checklist",
        "",
        _checklist_markdown(),
        "",
        "## Comparison Dimensions",
        "",
        _comparison_dimensions_markdown(),
        "",
        "## Detailed Rubric",
        "",
        _rubric_markdown(),
        "",
        "## Scoring and Decision",
        "",
        "- Use rubric scores from 1 to 5. A score of 3 means minimally usable but not yet good enough for scaling.",
        "- Compute `weighted_score` as the weighted average of rubric dimension scores.",
        "- `pass`: weighted score >= 4.2, no blocking checklist failure, no major Reader A/B mechanism gap, and retrieval/frontmatter audit is at least `weak`.",
        "- `needs_refine`: weighted score 3.0-4.19 or one or more major gaps that are fixable by ingest/schema/rubric changes.",
        "- `fail`: weighted score < 3.0, fabricated source fact, missing core method, broken provenance, invalid schema, or retrieval metadata likely routes future work to the wrong context.",
        "- Use `blocking` severity when a future researcher could implement, cite, or decide incorrectly from `paper.md` alone.",
        "",
        "## Output JSON Schema",
        "",
        "Return only JSON:",
        "",
        "```json",
        json.dumps(_output_schema(), indent=2),
        "```",
        "",
        "## Mechanism Buckets",
        "",
        "- `paper_page_template`: the page structure hides or misorders important understanding.",
        "- `paper_model_extraction`: method, claim, evidence, limitation, or assumption extraction is too shallow or wrong.",
        "- `source_selection`: the source excerpts or page selection omit the pages needed to understand the paper.",
        "- `evidence_linking`: the page names concepts but does not connect them to figures, tables, equations, or ablations.",
        "- `retrieval_metadata`: frontmatter, tags, aliases, source ids, or method names will retrieve the wrong context later.",
        "- `judge_rubric`: the evaluator would pass shallow output because the rubric does not demand teach-back depth.",
        "- `source_management`: raw source identity, managed path, registry, or immutable source contract is missing or confusing.",
        "- `candidate_record_schema`: claims/methods/evidence JSONL lacks fields needed for downstream promotion or retrieval.",
        "",
        "## Reader A Task: paper.md Only",
        "",
        "You are onboarding a new researcher. Read only this generated `paper.md` and explain the paper in 10-14 bullets.",
        "Your explanation must cover: core problem, mechanism, why each component exists, component dependencies, key equations/algorithms/figures/tables, evidence, limitations, uncertainty, and what a developer would implement or test first.",
        "If `paper.md` does not let you answer something, write `unknown_from_paper_md` instead of guessing.",
        "",
        f"Path: `{paper_path}`",
        "",
        _fenced("markdown", _read_optional(paper_path)),
        "",
        "## Reader B Task: source-grounded",
        "",
        "Now ignore Reader A and read the source excerpts below. Produce the same kind of explanation, but ground it in page evidence.",
        "Focus on what the generated wiki page should have taught: mechanism, dependencies between components, equations/algorithms/tables that matter, and caveats.",
        "",
        f"Source pages: `{pages_path}`",
        "",
        _fenced("markdown", _source_excerpts(pages_path)),
        "",
        "## Candidate Record Audit Inputs",
        "",
        "Use these only after Reader A and Reader B are written. They test whether downstream wiki promotion and retrieval have enough structured state.",
        "",
        f"Claims: `{claims_path}`",
        "",
        _fenced("jsonl", _jsonl_preview(claims_path, max_records=8)),
        "",
        f"Methods: `{methods_path}`",
        "",
        _fenced("jsonl", _jsonl_preview(methods_path, max_records=8)),
        "",
        f"Evidence: `{evidence_path}`",
        "",
        _fenced("jsonl", _jsonl_preview(evidence_path, max_records=10)),
        "",
        "## Reconciliation Task",
        "",
        "Compare Reader A and Reader B.",
        "For every missing, vague, or misleading point in Reader A, identify the source evidence, the likely generation mechanism failure bucket, and a testable fix.",
        "Then compare the candidate records against both explanations: check whether important methods, claims, evidence, limitations, and retrieval keys have structured records.",
        "A good result should tell the developer how to improve the ingest system, not merely rewrite the current paper page.",
    ]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(packet).rstrip() + "\n", encoding="utf-8")
    return out_path


def _output_schema() -> dict[str, Any]:
    return {
        "schema_version": "paper_wiki_reader_check.v2",
        "decision": "pass | needs_refine | fail",
        "case_id": "",
        "weighted_score": 0.0,
        "calibration_confidence": "low | medium | high",
        "one_sentence_verdict": "",
        "paper_md_only_explanation": ["..."],
        "source_grounded_explanation": ["..."],
        "rubric_scores": [
            {
                "dimension": "mechanism_depth",
                "score": 0,
                "weight": 2.0,
                "anchor": "1 | 2 | 3 | 4 | 5",
                "paper_md_evidence": "",
                "source_evidence": "page / section / table / figure / equation",
                "gap_reason": "",
                "generation_bucket": "paper_model_extraction",
            }
        ],
        "checklist_results": [
            {
                "check_id": "mechanism_causality",
                "status": "pass | weak | fail | not_applicable",
                "score": "0 | 1 | 2 | not_applicable",
                "severity": "minor | major | blocking",
                "reader_a_evidence": "",
                "source_evidence": "page / section / table / figure / equation",
                "generation_bucket": "paper_model_extraction",
                "testable_fix": "",
            }
        ],
        "dimension_comparison": [
            {
                "dimension": "mechanism_causality",
                "paper_md_score": 0,
                "source_grounded_score": 0,
                "gap": "none | minor | major | blocking",
                "missing_or_misleading_detail": "",
                "source_evidence": "",
                "generation_bucket": "paper_model_extraction",
            }
        ],
        "retrieval_metadata_audit": {
            "frontmatter_status": "pass | weak | fail",
            "source_management_status": "pass | weak | fail",
            "retrieval_key_status": "pass | weak | fail",
            "taxonomy_boundary_status": "pass | weak | fail",
            "frontmatter_body_duplication_status": "pass | weak | fail",
            "when_to_retrieve_quality_status": "pass | weak | fail",
            "missing_keys": ["..."],
            "overlapping_or_misplaced_keys": ["..."],
            "notes": "",
        },
        "candidate_record_audit": {
            "claims_status": "pass | weak | fail",
            "methods_status": "pass | weak | fail",
            "evidence_status": "pass | weak | fail",
            "missing_records": ["..."],
            "overbroad_records": ["..."],
        },
        "mismatches": [
            {
                "severity": "minor | major | blocking",
                "paper_md_understanding": "",
                "source_grounded_understanding": "",
                "source_evidence": "page / section / table / figure / equation",
                "generation_bucket": "paper_model_extraction",
                "mechanism_failure": "",
                "testable_fix": "",
            }
        ],
        "hard_failures": [
            {
                "failure_type": "fabrication | missing_core_method | broken_provenance | invalid_schema | misleading_retrieval",
                "evidence": "",
                "generation_bucket": "paper_model_extraction",
            }
        ],
        "false_confidence_flags": ["..."],
        "mechanism_refine_plan": ["..."],
        "regression_tests_to_add": ["..."],
    }


def _run_context(run: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": run.get("schema_version"),
        "case_id": run.get("eval_case_id"),
        "title": run.get("title"),
        "quality_gate": run.get("quality_gate"),
        "paper_model": run.get("paper_model"),
        "source_management": run.get("source_management"),
        "canonical_wiki_mutated": run.get("canonical_wiki_mutated"),
    }


def _checklist_markdown() -> str:
    rows = [
        (
            "source_identity",
            "Raw source identity is stable: source id/path/registry/hash are visible when managed.",
        ),
        (
            "frontmatter_retrieval",
            "Frontmatter has type/status/review state/source ids/tags/aliases/topics/methods/settings enough for future retrieval.",
        ),
        (
            "retrieval_taxonomy_boundary",
            "`methods` are reusable method families, `topics` are research problems/objects, `settings` are conditions; paper-specific names are aliases or records.",
        ),
        (
            "frontmatter_body_source_of_truth",
            "Frontmatter is the machine-readable retrieval source of truth; `When To Retrieve This Paper` gives semantic routing intent and does not duplicate frontmatter field lists.",
        ),
        (
            "when_to_retrieve_quality",
            "`When To Retrieve This Paper` contains concrete positive and negative routing cases that clarify when this paper should and should not be used.",
        ),
        (
            "paper_positioning",
            "The page states the exact problem, scope, target setting, and non-goals without generic filler.",
        ),
        (
            "mechanism_causality",
            "The core method is explained as a causal chain, not a list of named components.",
        ),
        (
            "component_contracts",
            "Each key component has inputs, transformation, outputs, dependency, and why it exists.",
        ),
        (
            "equation_algorithm_grounding",
            "Important equations, algorithms, figures, and tables are tied to mechanism meaning and provenance.",
        ),
        (
            "evidence_mapping",
            "Main claims are mapped to experiments, datasets, metrics, baselines, tables, or ablations.",
        ),
        (
            "implementation_readiness",
            "A developer could identify the first implementation/probe/sanity checks from the page.",
        ),
        (
            "limitations_uncertainty",
            "Limitations, caveats, missing evidence, and confidence gaps are explicit.",
        ),
        (
            "source_vs_synthesis",
            "Source facts, wiki synthesis, and user insight are not collapsed into one voice.",
        ),
        (
            "candidate_records",
            "Claims/methods/evidence JSONL contain the important objects without broad filler records dominating.",
        ),
    ]
    return "\n".join(f"- `{check_id}`: {description}" for check_id, description in rows)


def _comparison_dimensions_markdown() -> str:
    rows = [
        ("problem_scope", "Does Reader A recover the same target problem and scope as Reader B?"),
        ("mechanism_causality", "Does Reader A explain why the method works, or only name components?"),
        ("component_dependencies", "Does Reader A know which components depend on or condition each other?"),
        ("math_algorithm_semantics", "Does Reader A know what the important formulas/algorithms do?"),
        ("visual_table_semantics", "Does Reader A preserve the meaning of key figures/tables?"),
        ("claim_evidence_alignment", "Does Reader A connect each main claim to the right evidence type?"),
        ("experimental_setting", "Does Reader A retain datasets, metrics, baselines, quantization/eval settings, or task constraints when important?"),
        ("limitations_and_scope", "Does Reader A avoid overgeneralizing beyond the paper evidence?"),
        ("implementation_probe_value", "Could Reader A guide coding, probes, ablations, or sanity checks?"),
        ("retrieval_future_use", "Would future wiki queries retrieve and use this paper for the right concepts?"),
        ("retrieval_taxonomy_boundary", "Do methods/topics/settings have non-overlapping meanings, or are they mixed into one noisy keyword list?"),
        ("frontmatter_body_duplication", "Does the body explain when-to-retrieve intent instead of repeating frontmatter lists?"),
        ("when_to_retrieve_quality", "Does the body give useful positive and negative routing cases, or only generic template text?"),
    ]
    return "\n".join(f"- `{dimension}`: {description}" for dimension, description in rows)


def _rubric_markdown() -> str:
    rows = [
        (
            "teachback_completeness",
            1.5,
            "Reader A recovers the paper's problem, method, evidence, limitations, and next-use value from `paper.md` alone.",
        ),
        (
            "mechanism_depth",
            2.0,
            "The page explains causal mechanism, component contracts, dependencies, and failure modes rather than listing names.",
        ),
        (
            "evidence_alignment",
            1.5,
            "Claims are tied to the right experiments, metrics, baselines, figures, tables, algorithms, or equations.",
        ),
        (
            "provenance_auditability",
            1.25,
            "Important statements can be audited back to page, section, table, figure, equation, or source record.",
        ),
        (
            "implementation_usefulness",
            1.5,
            "A researcher/developer can infer what to implement, probe, ablate, or sanity-check first.",
        ),
        (
            "retrieval_readiness",
            1.25,
            "Frontmatter, aliases, tags, topics, and candidate records make future idea-driven retrieval likely to find this page for the right reasons.",
        ),
        (
            "retrieval_taxonomy_boundary",
            1.25,
            "Methods, topics, settings, aliases, and candidate records have distinct roles and do not collapse into overlapping or paper-specific labels.",
        ),
        (
            "frontmatter_body_source_of_truth",
            1.0,
            "Frontmatter is the machine-readable retrieval source of truth; body when-to-retrieve intent explains use-cases rather than copying metadata lists.",
        ),
        (
            "when_to_retrieve_quality",
            1.0,
            "The when-to-retrieve section gives concrete positive and negative routing guidance for future human readers and context builders.",
        ),
        (
            "uncertainty_calibration",
            1.0,
            "The page exposes uncertainty, caveats, weak evidence, and scope boundaries without false confidence.",
        ),
        (
            "candidate_record_quality",
            1.0,
            "Claims, methods, and evidence JSONL represent useful objects with enough structure for later promotion.",
        ),
    ]
    scale = [
        "1 = unusable or misleading; core paper understanding is absent.",
        "2 = partial; important facts appear, but causal understanding or provenance is missing.",
        "3 = minimally usable; a reader can orient, but must reopen the paper for key method/evidence details.",
        "4 = strong; the page can teach the paper with only local uncertainties or missing edge details.",
        "5 = excellent; the page is source-grounded, retrieval-ready, and directly useful for research decisions.",
    ]
    lines = [
        "Score each dimension from 1 to 5 with the listed weight. Do not give a 4 or 5 unless Reader A's `paper.md`-only explanation demonstrates that level.",
        "",
        "Anchors:",
        *[f"- {anchor}" for anchor in scale],
        "",
        "Dimensions:",
    ]
    lines.extend(f"- `{dimension}` (weight {weight:g}): {description}" for dimension, weight, description in rows)
    return "\n".join(lines)


def _source_excerpts(pages_path: Path) -> str:
    if not pages_path.exists():
        return f"[missing source pages: {pages_path}]"

    pages: list[dict[str, Any]] = []
    with pages_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped:
                continue
            payload = json.loads(stripped)
            if isinstance(payload, dict):
                pages.append(payload)

    selected = _select_source_pages(pages)
    chunks = []
    for page in selected:
        page_number = page.get("page_number")
        section = page.get("section_hint") or "unknown section"
        text = " ".join(str(page.get("text") or "").split())
        if len(text) > 2200:
            text = text[:2200].rstrip() + "..."
        chunks.append(f"### p. {page_number} ({section})\n\n{text}")
    return "\n\n".join(chunks) if chunks else "[no source excerpts selected]"


def _select_source_pages(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scored: list[tuple[int, int, dict[str, Any]]] = []
    for index, page in enumerate(pages):
        text = str(page.get("text") or "")
        lowered = text.lower()
        page_number = int(page.get("page_number") or index + 1)
        score = 0
        for term in (
            "methodology",
            "activation-oriented",
            "outlier smoothing",
            "adaptive weight clustering",
            "centroid finetuning",
            "permutation",
            "pog",
            "lut",
            "algorithm",
            "table",
            "ablation",
            "kl divergence",
            "router",
            "speedup",
            "limitation",
        ):
            if term in lowered:
                score += 2
        if page_number <= 2:
            score += 1
        if score > 0:
            scored.append((score, page_number, page))
    selected = [page for _, _, page in sorted(scored, key=lambda item: (-item[0], item[1]))[:10]]
    if selected:
        return sorted(selected, key=lambda page: int(page.get("page_number") or 0))
    return pages[:8]


def _read_optional(path: Path) -> str:
    if not path or not path.exists():
        return f"[missing: {path}]"
    return path.read_text(encoding="utf-8").rstrip()


def _jsonl_preview(path: Path, *, max_records: int) -> str:
    if not path or not path.exists() or path.is_dir():
        return f"[missing: {path}]"

    records: list[str] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped:
                continue
            records.append(stripped)
            if len(records) >= max_records:
                break
    return "\n".join(records) if records else "[no records]"


def _fenced(language: str, content: str) -> str:
    return f"```{language}\n{content}\n```"
