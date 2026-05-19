from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RubricDimension:
    id: str
    weight: float
    description: str
    anchors: dict[int, str]
    evidence_required: list[str]
    failure_examples: list[str]


@dataclass(frozen=True)
class HardFailRule:
    id: str
    description: str
    evidence_required: str
    repair_bucket: str


@dataclass(frozen=True)
class AgentRubric:
    agent: str
    schema_version: str
    purpose: str
    score_scale: str
    pass_threshold: float
    refine_threshold: float
    dimensions: list[RubricDimension]
    hard_fail_rules: list[HardFailRule]
    output_schema_version: str

    def to_json(self) -> dict[str, Any]:
        return {
            "agent": self.agent,
            "schema_version": self.schema_version,
            "purpose": self.purpose,
            "score_scale": self.score_scale,
            "pass_threshold": self.pass_threshold,
            "refine_threshold": self.refine_threshold,
            "output_schema_version": self.output_schema_version,
            "dimensions": [
                {
                    "id": dimension.id,
                    "weight": dimension.weight,
                    "description": dimension.description,
                    "anchors": {str(score): anchor for score, anchor in dimension.anchors.items()},
                    "evidence_required": dimension.evidence_required,
                    "failure_examples": dimension.failure_examples,
                }
                for dimension in self.dimensions
            ],
            "hard_fail_rules": [
                {
                    "id": rule.id,
                    "description": rule.description,
                    "evidence_required": rule.evidence_required,
                    "repair_bucket": rule.repair_bucket,
                }
                for rule in self.hard_fail_rules
            ],
        }


def rubric_for(agent: str) -> AgentRubric:
    try:
        return RUBRICS[agent]
    except KeyError as exc:
        raise ValueError(f"unknown self-check agent: {agent}") from exc


def rubric_json(agent: str) -> str:
    return json.dumps(rubric_for(agent).to_json(), indent=2, ensure_ascii=False)


def expected_result_schema(agent: str) -> dict[str, Any]:
    rubric = rubric_for(agent)
    return {
        "schema_version": rubric.output_schema_version,
        "agent": rubric.agent,
        "decision": "pass | needs_refine | fail",
        "weighted_score": 0.0,
        "confidence": "low | medium | high",
        "one_sentence_verdict": "",
        "dimension_scores": [
            {
                "dimension": dimension.id,
                "score": 0,
                "weight": dimension.weight,
                "anchor": "1 | 2 | 3 | 4 | 5",
                "evidence": "artifact path, page, section, claim id, method id, scenario id, or exact excerpt",
                "rationale": "",
                "repair_bucket": "paper_model_extraction | evidence_linking | retrieval_metadata | paper_page_template | source_selection | candidate_record_schema | source_management | structural_schema | judge_rubric",
            }
            for dimension in rubric.dimensions
        ],
        "hard_failures": [
            {
                "rule_id": "",
                "severity": "blocking",
                "evidence": "",
                "repair_bucket": "",
                "testable_fix": "",
            }
        ],
        "findings": [
            {
                "severity": "minor | major | blocking",
                "dimension": "",
                "problem": "",
                "evidence": "",
                "repair_bucket": "",
                "suggested_fix": "",
            }
        ],
        "recommended_repairs": ["..."],
        "calibration_notes": ["..."],
    }


def complete_result_template(agent: str) -> dict[str, Any]:
    schema = expected_result_schema(agent)
    schema["hard_failures"] = []
    schema["findings"] = []
    schema["recommended_repairs"] = []
    schema["calibration_notes"] = []
    return schema


def _anchors(topic: str) -> dict[int, str]:
    return {
        1: f"Misleading or absent {topic}; a future researcher would make wrong decisions.",
        2: f"Present but shallow {topic}; important dependencies or evidence are missing.",
        3: f"Minimally usable {topic}; enough for orientation but not enough for confident reuse.",
        4: f"Strong {topic}; source-grounded, specific, and useful for research work.",
        5: f"Excellent {topic}; teaches the nuance, caveats, evidence strength, and next action.",
    }


UNDERSTANDING_RUBRIC = AgentRubric(
    agent="understanding",
    schema_version="paper_wiki_understanding_rubric.v1",
    output_schema_version="paper_wiki_understanding_result.v1",
    purpose=(
        "Judge whether paper.md alone lets a capable new researcher reconstruct the paper, "
        "then compare that reconstruction to source-grounded understanding and attribute gaps."
    ),
    score_scale="1=misleading, 2=shallow, 3=usable orientation, 4=strong teach-back, 5=source-faithful expert handoff",
    pass_threshold=4.2,
    refine_threshold=3.0,
    dimensions=[
        RubricDimension(
            "teachback_completeness",
            1.5,
            "Reader A can explain problem, method, evidence, limitations, and first implementation/probe steps from paper.md alone.",
            _anchors("teach-back completeness"),
            ["paper.md explanation", "source-grounded explanation", "missing unknown_from_paper_md fields"],
            ["The summary names a method but cannot say what it operates on.", "Implementation hooks are absent from Reader A."],
        ),
        RubricDimension(
            "mechanism_causality",
            2.0,
            "The method is represented as a causal chain with inputs, transformation, outputs, dependencies, and failure modes.",
            _anchors("mechanism causality"),
            ["Mechanism section", "method records", "source pages for equations/algorithms/figures"],
            ["Component list without why each component exists.", "Reader A reverses dependency order between components."],
        ),
        RubricDimension(
            "source_alignment",
            2.0,
            "Reader A's interpretation agrees with Reader B's source-grounded interpretation on central claims and scope.",
            _anchors("source alignment"),
            ["Reader A/B mismatch table", "page or section evidence for every major mismatch"],
            ["paper.md implies a stronger claim than the paper supports.", "A benchmark or setting is attributed to the wrong experiment."],
        ),
        RubricDimension(
            "evidence_reasoning",
            1.4,
            "The page separates claims from evidence and explains what tables, figures, algorithms, or equations actually support.",
            _anchors("evidence reasoning"),
            ["Evidence Map", "claims.jsonl", "evidence.jsonl", "source page/table/figure references"],
            ["Accuracy claim without dataset/metric/baseline.", "Figure is listed but its argumentative role is unknown."],
        ),
        RubricDimension(
            "retrieval_schema_understanding",
            1.1,
            "Reader A understands why the page should be retrieved from frontmatter plus canonical query examples and fit-distance notes, and does not confuse method families, research topics, settings, aliases, or exact component records.",
            _anchors("retrieval schema understanding"),
            ["paper.md frontmatter", "When To Retrieve This Paper", "candidate method records", "Reader A retrieval explanation"],
            ["Reader A treats a paper title as a topic.", "Reader A cannot distinguish weight-only from weight-activation setting.", "Specific components appear as the only method family."],
        ),
        RubricDimension(
            "uncertainty_and_scope",
            1.1,
            "The page states what is uncertain, setting-dependent, not causal, or not safe to generalize.",
            _anchors("uncertainty and scope"),
            ["Limitations / Uncertainty", "Reader A/B caveat comparison"],
            ["No caveats for calibration-dependent PTQ.", "Systems claim treated as universal without hardware scope."],
        ),
        RubricDimension(
            "repair_attribution",
            1.0,
            "Failures are attributed to actionable generation buckets rather than vague rewrite requests.",
            _anchors("repair attribution"),
            ["generation_bucket fields", "testable_fix fields", "recommended repairs"],
            ["Finding says 'make better summary' with no source/evidence bucket.", "Repair cannot be turned into a regression test."],
        ),
    ],
    hard_fail_rules=[
        HardFailRule("fabricated_source_fact", "paper.md teaches a claim contradicted or unsupported by source excerpts.", "source page evidence and paper.md excerpt", "paper_model_extraction"),
        HardFailRule("missing_core_method", "Reader A cannot identify the paper's core method or central mechanism.", "paper.md-only explanation", "paper_page_template"),
        HardFailRule("major_reader_mismatch", "Reader A and Reader B disagree on a central mechanism, claim, or limitation.", "Reader A/B comparison with page evidence", "paper_model_extraction"),
        HardFailRule("broken_provenance_for_core_claim", "A core claim cannot be traced to page, section, table, figure, or equation evidence.", "claim/evidence id and source page check", "evidence_linking"),
    ],
)


QUALITY_RUBRIC = AgentRubric(
    agent="quality",
    schema_version="paper_wiki_quality_rubric.v1",
    output_schema_version="paper_wiki_quality_result.v1",
    purpose=(
        "Judge whether paper.md is a human-friendly, high-density, retrieval-ready research memory artifact "
        "that remains useful under complex downstream idea, implementation, and comparison scenarios."
    ),
    score_scale="1=misleading/noisy, 2=low-density, 3=usable but fragile, 4=strong retrieval memory, 5=excellent research handoff",
    pass_threshold=4.25,
    refine_threshold=3.0,
    dimensions=[
        RubricDimension(
            "human_readability",
            1.2,
            "The page is easy for a researcher to read without filler, awkward boilerplate, or table dumps.",
            _anchors("human readability"),
            ["What To Remember", "Mechanism", "Evidence Map", "word count and repeated-phrase check"],
            ["Abstract-like boilerplate.", "Dense list of names with no explanation.", "Raw table fragments dominate the page."],
        ),
        RubricDimension(
            "information_density",
            1.5,
            "Most sentences carry mechanism, evidence, caveat, implementation, or retrieval value.",
            _anchors("information density"),
            ["paper.md body", "candidate records", "repeated/generic phrase audit"],
            ["Long paragraphs say only that the paper improves performance.", "Several sections repeat the same contribution sentence."],
        ),
        RubricDimension(
            "retrieval_precision",
            1.6,
            "The page will be retrieved for the right reasons and not because of noisy generic topics.",
            _anchors("retrieval precision"),
            ["frontmatter topics/methods/datasets/metrics", "retrieval scenarios", "noisy topic audit"],
            ["Generic topics like 'models' dominate.", "Method alias missing so exact method query fails."],
        ),
        RubricDimension(
            "retrieval_taxonomy_boundary",
            1.5,
            "Frontmatter cleanly separates method families, research topics, and experimental/deployment settings; exact component names remain aliases or method records rather than replacing reusable method families.",
            _anchors("retrieval taxonomy boundary"),
            ["frontmatter methods/topics/settings/aliases", "methods.jsonl", "source evidence for setting"],
            ["`methods` contains only paper-specific component names.", "`topics` contains the paper title or generic words like error/design/outliers.", "`settings` duplicates topics or methods instead of constraining scope."],
        ),
        RubricDimension(
            "frontmatter_body_nonduplication",
            1.1,
            "Frontmatter is the machine-readable retrieval source of truth, while body when-to-retrieve intent explains use-cases rather than copying methods/topics/settings/datasets/metrics lists.",
            _anchors("frontmatter/body non-duplication"),
            ["paper.md frontmatter", "When To Retrieve This Paper section"],
            ["Body has a `Retrieval Anchors` list that repeats frontmatter.", "`When To Retrieve This Paper` restates every frontmatter field instead of explaining retrieval scenarios."],
        ),
        RubricDimension(
            "retrieval_intent_quality",
            1.3,
            "The when-to-retrieve section gives diverse canonical query examples plus fit-distance notes for human readers, rerankers, and future context builders.",
            _anchors("retrieval intent quality"),
            ["When To Retrieve This Paper", "complex retrieval scenarios", "frontmatter settings/methods/topics"],
            ["Section only says to consult frontmatter.", "Uses a negative-rule laundry list.", "Examples are generic and do not show query plus use-because behavior."],
        ),
        RubricDimension(
            "retrieval_coverage",
            1.4,
            "Complex downstream scenarios can find mechanism, evidence, limitations, implementation hooks, and source pointers.",
            _anchors("retrieval coverage"),
            ["scenario results", "required retrieval keys", "section coverage"],
            ["Implementation query finds the paper but not what to code.", "Evidence comparison query lacks metrics/baselines."],
        ),
        RubricDimension(
            "research_actionability",
            1.5,
            "The page helps design probes, ablations, implementation checks, or next research questions.",
            _anchors("research actionability"),
            ["Implementation Hooks", "Limitations / Uncertainty", "method implementation notes"],
            ["Hooks are generic 'read equations'.", "No ablation or sanity-check guidance."],
        ),
        RubricDimension(
            "claim_evidence_selectivity",
            1.4,
            "The page promotes only high-value claims and ties them to the right evidence instead of listing everything.",
            _anchors("claim/evidence selectivity"),
            ["Evidence Map", "claims.jsonl", "evidence.jsonl"],
            ["Every table row becomes a claim.", "A broad claim lacks dataset/metric/baseline."],
        ),
        RubricDimension(
            "uncertainty_signal",
            1.0,
            "Uncertainty and scope warnings are specific enough to guide citation or implementation decisions.",
            _anchors("uncertainty signal"),
            ["Limitations / Uncertainty", "calibration/hardware/model-family caveats"],
            ["Generic 'more work is needed'.", "No limitation for a proxy objective."],
        ),
    ],
    hard_fail_rules=[
        HardFailRule("keyword_stuffed_retrieval", "The page contains many retrieval keys but cannot answer a complex scenario precisely.", "scenario miss evidence", "retrieval_metadata"),
        HardFailRule("low_density_summary", "Most prose is generic abstract restatement with little mechanism/evidence/actionability.", "paper.md excerpts", "paper_page_template"),
        HardFailRule("misleading_retrieval_metadata", "Frontmatter routes future queries to the wrong method, setting, dataset, or claim.", "frontmatter and source evidence", "retrieval_metadata"),
        HardFailRule("collapsed_retrieval_taxonomy", "Methods, topics, and settings collapse into overlapping or paper-specific labels that make cross-paper retrieval unreliable.", "frontmatter and retrieval scenario evidence", "retrieval_metadata"),
        HardFailRule("frontmatter_body_duplicate_contract", "The body duplicates frontmatter retrieval lists instead of treating frontmatter as source of truth.", "paper.md section evidence", "paper_page_template"),
        HardFailRule("missing_canonical_retrieval_examples", "The page lacks diverse canonical query examples and therefore does not teach the expected retrieval behavior.", "When To Retrieve This Paper section", "paper_page_template"),
        HardFailRule("unsupported_action_guidance", "Implementation or research advice is not grounded in source facts or candidate records.", "hook text and missing provenance", "evidence_linking"),
    ],
)


STRUCTURAL_RUBRIC = AgentRubric(
    agent="structural",
    schema_version="paper_wiki_structural_rubric.v1",
    output_schema_version="paper_wiki_structural_self_check.v0",
    purpose=(
        "Judge whether the ingest state is complete, machine-readable, source-managed, and recoverable enough "
        "for later wiki promotion, retrieval, audit, and calibration."
    ),
    score_scale="1=broken, 2=incomplete, 3=recoverable, 4=stable, 5=complete and replayable",
    pass_threshold=4.25,
    refine_threshold=3.0,
    dimensions=[
        RubricDimension("run_manifest_contract", 1.4, "run.json exposes stable paths, schema version, quality gate, paper model counts, and source management.", _anchors("run manifest contract"), ["run.json"], ["Missing draft_artifacts.", "Alias paths disagree."]),
        RubricDimension("artifact_existence", 1.5, "All required draft/canonical artifacts exist, are non-empty, and are linked from the manifest.", _anchors("artifact existence"), ["run.json paths", "filesystem"], ["methods.jsonl missing.", "canonical path declared but absent."]),
        RubricDimension("frontmatter_schema", 1.4, "paper.md frontmatter contains complete machine-routing metadata with correct scalar/list types.", _anchors("frontmatter schema"), ["paper.md frontmatter"], ["source_id missing.", "claims is scalar instead of list."]),
        RubricDimension("frontmatter_body_source_of_truth", 1.1, "Frontmatter remains the machine-readable retrieval source of truth and body when-to-retrieve examples do not duplicate its field lists.", _anchors("frontmatter/body source of truth"), ["paper.md frontmatter", "When To Retrieve This Paper section"], ["Retrieval Anchors repeats methods/topics/settings.", "When-to-retrieve section lacks canonical examples or scope notes."]),
        RubricDimension("section_schema", 1.2, "paper.md preserves required durable sections in the expected order with non-empty content.", _anchors("section schema"), ["paper.md headings"], ["Mechanism section missing.", "Candidate Records empty."]),
        RubricDimension("candidate_jsonl_schema", 1.4, "claims/methods/evidence JSONL records have required fields for later promotion.", _anchors("candidate JSONL schema"), ["claims.jsonl", "methods.jsonl", "evidence.jsonl"], ["method has no inputs/outputs.", "invalid JSONL line."]),
        RubricDimension("provenance_linkage", 1.3, "Records and prose link claims/methods/evidence to valid pages and evidence ids.", _anchors("provenance linkage"), ["provenance fields", "pages.jsonl"], ["claim links to missing evidence id.", "page reference outside page range."]),
        RubricDimension("extraction_consistency", 1.3, "pages.jsonl and page images are complete enough to replay source-grounded review.", _anchors("extraction consistency"), ["extraction/pages.jsonl", "page-images"], ["page image missing.", "page_count mismatch."]),
        RubricDimension("source_management", 1.1, "Raw PDF is immutable, registered, hashable, and consistent with frontmatter/source registry.", _anchors("source management"), ["source registry", "managed PDF", "frontmatter source fields"], ["source id absent from registry.", "managed path missing."]),
    ],
    hard_fail_rules=[
        HardFailRule("missing_required_artifact", "A required artifact path is missing or empty.", "run manifest and filesystem", "artifact_write"),
        HardFailRule("missing_critical_frontmatter", "Critical routing/source frontmatter is absent.", "paper.md frontmatter", "frontmatter"),
        HardFailRule("missing_required_section", "A required paper.md section is missing.", "paper.md headings", "paper_page_template"),
        HardFailRule("duplicated_retrieval_sections", "paper.md uses body retrieval lists as a second metadata source instead of source-of-truth frontmatter plus when-to-retrieve intent.", "paper.md headings and section content", "paper_page_template"),
        HardFailRule("invalid_candidate_jsonl", "Candidate records cannot be parsed or lack required promotion fields.", "JSONL parse/schema evidence", "candidate_record_schema"),
        HardFailRule("broken_source_registry", "Managed source identity is absent or inconsistent.", "source registry and source_management fields", "source_management"),
    ],
)


RUBRICS = {
    "understanding": UNDERSTANDING_RUBRIC,
    "quality": QUALITY_RUBRIC,
    "structural": STRUCTURAL_RUBRIC,
}
