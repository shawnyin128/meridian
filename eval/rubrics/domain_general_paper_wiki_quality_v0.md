# Domain-General Paper Wiki Quality Rubric v0

This rubric judges whether a generated `paper.md` is useful as durable Paper Wiki state across research domains, not only for quantization papers.

## Scoring

Use a 1-5 score for each dimension:

- 5: excellent, directly useful for research retrieval and paper understanding.
- 4: strong, small omissions but no workflow-breaking failure.
- 3: minimally usable, needs refinement before scaling.
- 2: shallow or misleading in important places.
- 1: unsafe, mostly wrong, or not useful as wiki memory.

Weighted score:

| Dimension | Weight |
| --- | ---: |
| New researcher teach-back | 1.8 |
| Domain-specific mechanism | 1.7 |
| Retrieval taxonomy boundaries | 1.5 |
| Standalone retrieval intent | 1.4 |
| Source facts / synthesis / uncertainty separation | 1.4 |
| Evidence map quality | 1.4 |
| Implementation usefulness | 1.2 |
| Cross-domain contamination control | 1.2 |
| Source management and provenance | 1.1 |
| Concision and noise control | 1.0 |

Weighted pass thresholds:

- Pass: weighted score >= 4.5 and no hard fail.
- Weak pass: weighted score >= 4.0 with only local repair buckets.
- Needs refine: weighted score < 4.0 or any dimension below 3.5.
- Fail: any hard fail.

## Hard Fails

Hard fail the paper ingest if any applies:

- `paper.md` promotes scientific claims from a source-quality hold or unreadable PDF.
- A non-quantization paper is routed primarily as quantization because of incidental words like `centroid`, `low precision`, or `calibration`.
- The page cannot support a new researcher teach-back of what the paper does, why the method works, and what evidence matters.
- `methods`, `topics`, `settings`, and `aliases` collapse into a title/component list rather than reusable retrieval fields.
- `When To Retrieve This Paper` contains queries that require the target paper to already be in context, such as `this paper`, `the mechanism`, or component-only lists.
- The generated page mixes source facts, wiki synthesis, and uncertainty so a downstream agent cannot tell what the paper actually says.

## Dimension Anchors

### New Researcher Teach-Back

5: A capable researcher can explain the paper's problem, core mechanism, assumptions, evidence, limitations, and first experiment from `paper.md` alone.

3: The page gives the right broad topic and some components, but a researcher would need the PDF to understand the mechanism.

1: The page is mostly abstract restatement, contribution copying, or component-name listing.

Evidence requirement: cite `What To Remember`, `Mechanism`, `Evidence Map`, and `Implementation Hooks`.

Repair bucket: `paper_model`.

### Domain-Specific Mechanism

5: The method contract fits the domain: e.g. attention kernels expose IO/scheduling/precision; RLHF exposes preference objective/reference-policy assumptions; PINN exposes PDE residuals and boundary conditions; surveys expose taxonomy and primary-evidence followups.

3: The mechanism is plausible but generic and misses the domain's decisive objects.

1: The mechanism imports another domain's template.

Evidence requirement: compare method contracts against the paper's domain and section provenance.

Repair bucket: `mechanism_contract`.

### Retrieval Taxonomy Boundaries

5: `methods` are reusable technique families, `topics` are research problems/phenomena, `settings` are experimental/deployment conditions, and `aliases` contain exact titles/acronyms/components.

3: Mostly separated, but one field contains title-derived or overly generic labels.

1: Retrieval fields are duplicates or paper-specific component dumps.

Evidence requirement: inspect frontmatter and candidate method names.

Repair bucket: `retrieval_metadata`.

### Standalone Retrieval Intent

5: `When To Retrieve This Paper` contains plausible standalone research queries across idea comparison, implementation/probe planning, evidence checking, and scope review, plus fit-distance notes.

3: Queries are usable but narrow or partially title-aware.

1: Queries read as post-hoc prompts that already know the paper or component names.

Evidence requirement: quote or summarize query examples without requiring external context.

Repair bucket: `paper_page_template`.

### Source Facts / Synthesis / Uncertainty Separation

5: Source claims have page/section provenance; wiki interpretation is marked as synthesis; limitations and uncertainty do not masquerade as paper claims.

3: Provenance exists but some synthesis is blended with source facts.

1: The page states inferred mechanisms or limitations as if the paper proved them.

Evidence requirement: inspect provenance and uncertainty sections.

Repair bucket: `evidence_linking`.

### Evidence Map Quality

5: Evidence focuses on the domain's decisive metrics, datasets, baselines, tables, figures, equations, or systems measurements.

3: Evidence identifies broad metrics but does not separate claim types.

1: Evidence is just abstract claims or generic benchmark words.

Evidence requirement: cite evidence takeaways and candidate claims/evidence records.

Repair bucket: `evidence_extraction`.

### Implementation Usefulness

5: Hooks tell a research developer what to code, log, ablate, sanity-check, and reproduce first for this domain.

3: Hooks are plausible but generic.

1: Hooks are absent or unrelated to the domain.

Evidence requirement: inspect `Implementation Hooks` and method record `implementation_notes`.

Repair bucket: `implementation_hooks`.

### Cross-Domain Contamination Control

5: No unrelated domain vocabulary appears in routing, mechanism, evidence, or limitations unless the paper actually needs that comparison.

3: Minor irrelevant terms appear but do not control routing.

1: Main route is contaminated, e.g. clustering becomes quantization, PDE becomes RL, agent workflow becomes token decoding, or audio-language becomes vision-language.

Evidence requirement: inspect frontmatter and route examples.

Repair bucket: `domain_detection`.

### Source Management and Provenance

5: Managed source fields, registry path, source id, extraction artifacts, and candidate record paths are complete and replayable.

3: Main source fields exist but secondary artifacts are incomplete.

1: PDF is only an ad hoc path or provenance is missing.

Evidence requirement: inspect frontmatter, `run.json`, and source registry.

Repair bucket: `source_management`.

### Concision and Noise Control

5: Dense, concrete, no abstract filler, no duplicated frontmatter body metadata.

3: A few generic sentences remain but do not block use.

1: Mostly filler or redundant restatement.

Evidence requirement: inspect body sections for boilerplate.

Repair bucket: `paper_page_template`.

## Required Judge Output

Write JSON:

```json
{
  "schema_version": "domain_general_paper_wiki_judge_result.v0",
  "case_id": "",
  "decision": "pass | weak_pass | needs_refine | fail",
  "weighted_score": 0.0,
  "dimension_scores": [
    {
      "dimension": "new_researcher_teach_back",
      "score": 0,
      "weight": 1.8,
      "evidence": "",
      "repair_bucket": "paper_model"
    }
  ],
  "hard_fails": [],
  "cross_domain_contamination": [],
  "best_generalized_fix": "",
  "notes": ""
}
```
