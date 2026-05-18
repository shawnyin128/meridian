# Paper Wiki Evaluation Set and LLM-as-Judge Rubric

## Purpose

The evaluation target is not a paper summary. It is whether ingest turns a paper into useful, auditable, retrieval-ready wiki state that can compound over time.

The stable path should not require human review for every paper. Human input is used for calibration, hard cases, user insight, and sampled audits. The default judgment loop is:

```text
paper ingest output
  -> structural checks
  -> LLM-as-Judge quality review
  -> confidence-gated publish/refine decision
  -> sampled human calibration
```

## What Must Be Evaluated

Evaluate the whole wiki packet, not just `review.md`:

- canonical or draft `paper.md`
- claim candidates
- method/concept candidates
- evidence records
- provenance
- index/log updates
- quality gate decision
- optional review packet when generated

## Evaluation Set Design

Start with 8-12 curated papers, then grow to 25-40 once the rubric stabilizes. The first set should be small enough for manual calibration but diverse enough to expose failure modes.

### Required Case Types

| Case type | Why it matters | Expected stress |
| --- | --- | --- |
| Method paper | Core MVP target | method decomposition, algorithm details, assumptions |
| Benchmark-heavy paper | Prevent shallow summaries | datasets, metrics, baselines, fairness caveats |
| Math/formula-heavy paper | Implementation relevance | equation provenance, reduction/order/masking details |
| Figure-critical paper | Multimodal ingest | figures/tables affect claims |
| Survey/position paper | Avoid over-splitting | concept mapping, relation graph, weak claims |
| Contradiction paper | Wiki evolution | detects conflict with existing claims |
| Reproduction paper | Research dev bridge | hidden details, implementation traps, env/data/checkpoint notes |
| User-annotated paper | Personal wiki value | separates source fact from user insight |
| Low-quality extraction paper | Robustness | quality gate should trigger review |
| Adjacent but irrelevant paper | Retrieval discipline | avoids polluting core concepts |

### Case Schema

Each JSONL case should define outcome properties, not one exact answer:

```json
{
  "id": "method-moe-quant-001",
  "category": "paper_ingest_quality",
  "paper_path": "raw/papers/example.pdf",
  "wiki_context_path": "eval/fixtures/wiki_context/moe_quant_minimal/",
  "problem_description": "Ingest a method paper about MoE quantization into a paper wiki.",
  "expected_result": "A retrieval-ready paper page, claim/evidence graph, method candidates, index/log updates, and a quality gate decision.",
  "acceptable_paths": [
    "May publish canonical draft if quality gate is pass or warn.",
    "May generate review packet if visual evidence or provenance is uncertain.",
    "May keep weak claims inside the paper page instead of creating claim pages."
  ],
  "must_not_do": [
    "Do not mark wiki synthesis as source fact.",
    "Do not publish high-confidence claims without provenance.",
    "Do not require human review when only low-risk draft metadata changed."
  ],
  "evaluation_rubric": [
    "source_fidelity",
    "provenance_quality",
    "object_decomposition",
    "retrieval_readiness",
    "wiki_integration",
    "uncertainty_and_gate"
  ],
  "judge_prompt_variant": "paper_wiki_quality_v0",
  "notes": "Use human calibration for the first run."
}
```

## LLM-as-Judge Inputs

The judge should receive a bounded packet:

```text
case.json
run.json
paper.md
claims.jsonl
methods.jsonl
evidence.jsonl
index/log diff
selected source evidence:
  - page text snippets
  - page images or figure/table crops when available
  - user notes if present
existing wiki context packet:
  - relevant paper/concept/claim pages
```

Do not give the judge the entire wiki by default. The evaluation should also test whether the ingest created good retrieval surfaces, so the context packet should be explicit.

The CLI path for producing these packets from a JSONL case file is:

```bash
meridian wiki eval eval/cases/paper_ingest_quality.example.jsonl \
  --out-dir eval/runs/<run-id>/ \
  --mode flow \
  --rubric eval/rubrics/paper_wiki_quality_v0.md
```

Each case writes a `*.case.json` snapshot next to the eval manifest and a per-case directory containing `flow.json`, `run.json`, `judge-packet.md`, draft artifacts, and extraction artifacts. This keeps the judge input replayable without making the expected path unique in the case definition.

After judge JSON files are available, record and converge the whole run:

```bash
meridian wiki eval-converge eval/runs/<run-id>/eval_manifest.json
meridian wiki eval-summary eval/runs/<run-id>/eval_manifest.json
```

Human calibration is appended separately:

```bash
meridian wiki eval-calibrate eval/runs/<run-id>/eval_manifest.json \
  --case-id <case-id> \
  --human-decision agree \
  --bucket paper_model \
  --notes "Judge matched human review."
```

## Rubric Dimensions

Score each dimension from 1 to 5.

| Dimension | 1 | 3 | 5 |
| --- | --- | --- | --- |
| Source fidelity | Fabricates or distorts paper claims | Mostly faithful with minor ambiguity | Faithful; separates paper claims from inference |
| Provenance quality | Claims lack page/section support | Important claims have rough page support | Claims/methods/evidence have inspectable page/table/figure locators |
| Paper model depth | Shallow abstract-level summary | Captures problem/method/results | Captures assumptions, mechanism, evidence strength, limitations, and research implications |
| Object decomposition | Everything dumped into one note | Some claims/methods separated | Paper, claims, methods, evidence, concepts, and synthesis candidates are cleanly separated |
| Retrieval readiness | Future query unlikely to find it | Metadata exists but sparse | Frontmatter, aliases, topics, methods, models, datasets, and links support targeted retrieval |
| Wiki integration | Isolated page | Some candidate links | Updates/index/log/cross-links fit existing wiki without pollution |
| Uncertainty handling | Overconfident | Some caveats | Explicit uncertainty, weak evidence, conflicts, and quality gate behavior |
| Human-gate discipline | Requires review for everything or nothing | Reasonable but inconsistent | Human review only for low-confidence, conflict, synthesis, or user-insight cases |
| Research usefulness | Generic summary | Useful for recall | Helps decide implementation, experiments, hypotheses, or follow-up reading |
| Format/schema validity | Invalid files | Mostly valid but inconsistent | Valid Markdown/YAML/JSONL with stable machine-readable fields |

## Pass Policy

Use weighted scoring:

```text
source_fidelity: 2x
provenance_quality: 2x
paper_model_depth: 2x
object_decomposition: 1x
retrieval_readiness: 1.5x
wiki_integration: 1x
uncertainty_handling: 1.5x
human_gate_discipline: 1x
research_usefulness: 2x
format_schema_validity: blocking
```

Suggested decision:

- `pass`: weighted score >= 4.0 and no blocking issue
- `needs_refine`: weighted score 3.0-3.9 or one serious but local issue
- `fail`: weighted score < 3.0, invalid schema, missing provenance on core claims, or source hallucination

Blocking issues:

- fabricated claim presented as paper fact
- invalid JSONL/YAML preventing retrieval
- canonical publish without provenance for major claims
- source/user/synthesis boundary collapsed
- quality gate says pass despite obvious extraction or provenance failure

## Judge Output Schema

The judge should emit JSON:

```json
{
  "schema_version": "paper_wiki_judge_result.v0",
  "case_id": "...",
  "decision": "pass | needs_refine | fail",
  "weighted_score": 0.0,
  "dimension_scores": {
    "source_fidelity": 0,
    "provenance_quality": 0,
    "paper_model_depth": 0,
    "object_decomposition": 0,
    "retrieval_readiness": 0,
    "wiki_integration": 0,
    "uncertainty_handling": 0,
    "human_gate_discipline": 0,
    "research_usefulness": 0,
    "format_schema_validity": 0
  },
  "blocking_issues": [],
  "findings": [
    {
      "severity": "critical | major | minor",
      "dimension": "provenance_quality",
      "artifact": "claims.jsonl",
      "problem": "...",
      "evidence": "...",
      "suggested_fix": "..."
    }
  ],
  "calibration_questions_for_human": [],
  "recommended_refine_bucket": "workflow | schema | extraction | multimodal_understanding | retrieval | judge_rubric | other"
}
```

## Calibration Loop

The first evaluation round should be human-calibrated:

1. Run 3-5 papers through ingest.
2. Run LLM judge on each packet.
3. Human reviews judge findings, not every paper from scratch.
4. Record where the judge is too harsh, too lenient, or missing research value.
5. Update rubric and ingest skill.
6. Expand to 8-12 papers.

After calibration, human review should be exception-based:

- judge decision is `fail`
- judge and quality gate disagree strongly
- paper affects important existing synthesis
- user notes/annotations conflict with source reading
- sampled audit, e.g. 1 in every 5 ingests
