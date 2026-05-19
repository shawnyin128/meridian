---
name: paper-ingest
description: Use when generating, evaluating, or refining Meridian Paper Wiki ingest outputs from research papers, especially paper.md, claim/method/evidence records, reader self-check packets, retrieval metadata, and calibration-driven ingest quality improvements.
---

# Paper Ingest

## Purpose

Turn a raw research paper into retrieval-ready Paper Wiki state. The output should help a researcher understand and reuse the paper without rereading it, while keeping source facts, synthesis, and uncertainty separable.

This skill governs the cognitive workflow. Python code should handle deterministic extraction, source management, frontmatter, JSONL records, and file writes.

## Quality Bar

`paper.md` must pass the new-researcher test:

> If a capable new researcher reads only `paper.md`, can they explain what the paper does, why it works, what evidence supports it, what is uncertain, and what they would implement or test first?

Fail outputs that rely on generic claims such as "addresses outliers", "improves quantization", or a list of component names without mechanism.

## Required Separation

- Source fact: what the paper says, with page/section/table/figure/equation provenance.
- Wiki synthesis: what the ingest infers about mechanism, scope, relationship to other papers, or research usefulness.
- User insight: user annotations or decisions; never attribute these to the paper.
- Candidate records: draft objects for later promotion, not confirmed wiki truth.

## Paper Model

Extract these objects before writing prose:

- identity: title, authors when available, source id, managed PDF path
- problem: exact bottleneck or gap, not a broad field motivation
- method: named method plus component contracts
- mechanism facts: equations, algorithms, figures, tables, or setting constraints that explain how it works
- evidence map: claims tied to datasets, metrics, baselines, ablations, or systems measurements
- assumptions: calibration data, hardware setting, equivalence transform, sparsity/runtime overhead, or benchmark scope
- limitations and uncertainty: what should not be overgeneralized
- retrieval anchors: method names, aliases, task setting, model family, datasets, metrics, and concepts
- implementation hooks: first functions, probes, ablations, and sanity checks a research developer would need

## Mechanism Contract

For each important method/component, capture:

- input: what object it operates on
- transformation: what changes
- output: what representation or behavior is produced
- dependency: what must be true for it to work
- evidence: where the paper supports the component
- implementation hook: what to code or test first

Mechanism names alone are not content. If the page says "AOS, ACCF, POG, LUT" or "rotation, permutation, quantization" without the contract above, the ingest has not succeeded.

## paper.md Shape

Keep `paper.md` concise. It is the durable retrieval target, not the full review packet.

Use this order:

1. frontmatter with retrieval metadata
2. `What To Remember`: one concrete mechanism-centered paragraph
3. `Retrieval Anchors`: method/concepts/datasets/metrics/source pointers
4. `Mechanism`: component contracts
5. `Mechanism Details To Verify`: source-grounded equations/algorithms/figures/settings
6. `Evidence Map`: only high-value claims and evidence takeaways
7. `Implementation Hooks`: coding/probe/ablation notes
8. `Limitations / Uncertainty`
9. `Candidate Records`: paths to JSONL records and full review artifacts

Avoid:

- broad abstract restatement
- raw table dumps
- full page-by-page evidence lists
- visual index for every page
- repeated contribution sentences already represented as claim records
- prose that says "read it as a mechanism paper" without giving the mechanism

## Retrieval Metadata

Frontmatter should support future idea-driven retrieval:

- `type`, `title`, `status`, `created`, `updated`
- `source_id`, `source_pdf`, `source_registry`, `sources`
- `tags`, `aliases`, `topics`, `methods`, `datasets`, `metrics`
- `claims`, `confidence`, `review_state` or equivalent publish state when available

Prefer semantic aliases such as method acronyms and title variants. Avoid decorative metadata.

## Self-Check

Use three separately inspectable self-check roles as the convergence loop:

- Understanding agent: uses `reader-check.md` to compare a `paper.md`-only teach-back with a source-grounded reading and attributes mismatches to skill/generation buckets.
- Quality agent: uses `quality-self-check.json` to score human readability, information density, and retrieval coverage under complex downstream research scenarios.
- Structural agent: uses `structural-self-check.json` to score structural completeness of run manifests, artifacts, frontmatter, sections, candidate records, provenance, extraction outputs, and source management.

Keep these roles separate. Do not let structural pass/fail replace semantic understanding or quality evaluation, and do not bury schema completeness failures inside prose-quality findings.

The understanding agent loop is:

1. Reader A explains the paper from `paper.md` only.
2. Reader B explains it from source excerpts.
3. Compare against the scored rubric.
4. Attribute failures to generation mechanism buckets.
5. Refine the skill, schema, or deterministic code.
6. Rerun the calibration set.

Do not fix one paper by hand unless the fix also improves the ingest mechanism.

## Convergence Criteria

The ingest workflow is converged for a calibration round when:

- paper titles and retrieval anchors are correct enough to route future queries
- method summaries are causal and not table/figure noise
- core mechanism details have provenance
- claims are not dominated by raw table rows or generic background
- `paper.md` is concise and non-redundant
- reader self-check would identify only paper-specific gaps, not repeated workflow failures
