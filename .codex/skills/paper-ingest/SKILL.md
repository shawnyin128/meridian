---
name: paper-ingest
description: Use when generating, evaluating, or refining Meridian Paper Wiki ingest outputs from research papers, especially canonical paper pages, internal paper candidates, claim/method/evidence records, reader self-check packets, retrieval metadata, and calibration-driven ingest quality improvements.
---

# Paper Ingest

## Purpose

Turn a raw research paper into retrieval-ready Paper Wiki state. The product output is the canonical paper page under `wiki/papers/`, plus managed source state and catalog/index/log updates. Draft ingest files remain audit artifacts. The output should help a researcher understand and reuse the paper without rereading it, while keeping source facts, synthesis, and uncertainty separable.

This skill governs the cognitive workflow. Python code should handle deterministic extraction, source management, frontmatter, JSONL records, and file writes.

## Quality Bar

The canonical paper page must pass the new-researcher test:

> If a capable new researcher reads only `wiki/papers/<paper>.md`, can they explain what the paper does, why it works, what evidence supports it, what is uncertain, and what they would implement or test first?

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

## Canonical Page Shape

Keep the canonical paper page concise. It is the durable retrieval target, not the full review packet. The draft run file `wiki/.drafts/ingests/<run>/paper.md` currently mirrors this shape as an internal `paper_candidate` for publish replay, but it is not the product page and should not be used as a user-facing reading target.

Use this order:

1. frontmatter with retrieval metadata
2. `What To Remember`: one concrete mechanism-centered paragraph
3. `When To Retrieve This Paper`: canonical retrieval examples plus fit-distance notes; do not repeat frontmatter lists
4. `Mechanism`: component contracts
5. `Mechanism Details To Verify`: source-grounded equations/algorithms/figures/settings
6. `Evidence Map`: only high-value claims and evidence takeaways
7. `Implementation Hooks`: coding/probe/ablation notes
8. `Limitations / Uncertainty`
9. `Candidate Records`: paths to candidate JSONL records only; keep review/debug packets in manifests, not the canonical page body

Avoid:

- broad abstract restatement
- raw table dumps
- full page-by-page evidence lists
- visual index for every page
- repeated contribution sentences already represented as claim records
- prose that says "read it as a mechanism paper" without giving the mechanism
- a `Retrieval Anchors` section that copies `methods`, `topics`, `settings`, `datasets`, or `metrics` from frontmatter
- a `Retrieval Notes` section that only says to consult frontmatter or repeats metadata without semantic routing value
- a body `Source` block in `paper.md` that repeats `source_pdf`, `source_id`, `source_registry`, `page_count`, or `model_strategy` already present in frontmatter/run artifacts

## Artifact Boundary

Default user-facing ingest/flow output should report:

- managed source PDF
- canonical paper wiki page when published
- quality gate and review state
- index/log/catalog update status
- internal artifact root for audit

Do not present these as product outputs unless debugging is explicitly requested:

- `review.md`
- `judge-packet.md`
- `reader-check.md`
- `quality-self-check.json`
- `structural-self-check.json`
- extraction page files
- draft `paper.md` / `paper_candidate`

Use `--verbose-artifacts` when internal paths are needed. The run/flow manifest must classify artifact roles with `source_artifacts`, `product_artifacts`, `internal_artifacts`, `debug_artifacts`, `validation_artifacts`, and `retrieval_visibility`.

## Retrieval Metadata

Frontmatter is the machine-readable retrieval source of truth. Body prose can explain when the page should or should not be retrieved, but it must not become a second metadata source.

Frontmatter should support future idea-driven retrieval:

- `type`, `title`, `status`, `created`, `updated`
- `source_id`, `source_pdf`, `source_registry`, `sources`
- `tags`, `aliases`, `topics`, `methods`, `settings`, `datasets`, `metrics`
- `claims`, `confidence`, `review_state` or equivalent publish state when available

Use distinct retrieval fields:

- `methods`: reusable technique families such as `post-training quantization`, `rotation-based quantization`, `non-uniform weight quantization`, `expert-aware quantization`. Do not put only paper-specific components here.
- `topics`: research problems, objects, or phenomena such as `activation outliers`, `quantization error`, `expert routing`, `calibration data selection`.
- `settings`: experimental, model, or deployment conditions such as `weight-only quantization`, `weight-activation quantization`, `KV-cache quantization`, `MoE setting`, `LUT/kernel setting`.
- `aliases`: paper title variants, acronyms, and exact component names such as `CodeQuant`, `AOS`, `EBSS`, `QEP`.

Prefer controlled/global vocabulary entries before inventing a paper-specific topic. Avoid title-as-topic, generic one-word topics such as `error`, `design`, `outliers`, or labels that duplicate another field.

`When To Retrieve This Paper` quality bar:

- Start with `Canonical retrieval fits:` and include 3-4 diverse examples.
- Each example should have a `Query: "..."` line and a `Use because:` line.
- Query examples must be plausible standalone retrieval requests before the page is already in context. Avoid deictic prompts such as `this paper`, `the mechanism`, or component-only probes that read like the generator already knew the target page.
- Examples should portray expected behavior across idea/design comparison, implementation/probe/ablation, and evidence/comparison scenarios.
- Include `Scope notes:` with `Primary fit`, `Adjacent fit`, and `Weak fit`.
- Scope notes should express retrieval distance, not a laundry list of negative rules.
- Avoid `Do not use it when:` as a section header; prefer canonical examples and fit-distance notes.
- Do not say only "see frontmatter"; retrieval code can already read frontmatter.

## Source Management

Every ingest or calibration run should register the raw PDF as managed source state when a wiki root is available, even when canonical publishing is disabled. Source management is separate from canonical wiki mutation:

- `source_pdf`, `source_id`, `source_registry`, and `sources` belong in frontmatter.
- The managed raw source and registry make the ingest replayable and prevent PDFs from being indexed only by ad hoc desktop paths.
- Eval/calibration runs may use a per-case wiki root for source registration while still keeping `publish_mode=never`.
- If extracted text is too sparse, scanned, or only a cover/notice page, generate a source-quality hold instead of paper knowledge. The hold should be retrievable for OCR/replacement/source-cleanup workflows and must not promote scientific claims.

## User Insight Boundary

User insights are added after canonical ingest through `meridian wiki add-insight`, not by editing source-grounded paper sections directly. If a user says `paper.md` is shallow, wrong, or missing something, preserve their raw note, publish it to `## User Insights`, and require source re-check before rewriting `What To Remember`, `Mechanism`, or `Evidence Map`.

## Calibration Lessons

Optimize the ingest mechanism, not one paper at a time. Library-scale calibration should check at least:

- title extraction from PDF metadata, first useful page text, and Zotero-style filenames;
- controlled/global vocabulary reuse for methods, topics, and settings;
- source-quality holds for bad PDFs instead of hallucinated summaries;
- morphology-robust retrieval examples that read like plausible standalone user requests;
- structural source-management completeness alongside content quality.
- full-library runs, not only representative samples; optimize against rare domains, books, surveys, and non-ML technical PDFs that appear in the user's real Zotero library.
- domain-agnostic fallback contracts: if a paper is outside the known controlled vocabulary, still produce inputs, outputs, assumptions, and implementation checks grounded in the extracted method pages instead of leaving `paper-specific research method` empty.
- retrieval scenarios must not default to quantization/calibration. Use domain-specific scenarios when the page is alignment/RL, attention/Transformer, agents, continuous-depth models, surveys, audio-language models, systems, or other non-quantization work; otherwise fall back to generic research mechanism/evidence/scope scenarios.

## Self-Check

Use three separately inspectable self-check roles as the convergence loop:

- Understanding agent: uses `reader-check.md` to compare a `paper.md`-only teach-back with a source-grounded reading and attributes mismatches to skill/generation buckets.
- Quality agent: uses `quality-self-check.json` to score human readability, information density, and retrieval coverage under complex downstream research scenarios.
- Structural agent: uses `structural-self-check.json` to score structural completeness of run manifests, artifacts, frontmatter, sections, candidate records, provenance, extraction outputs, and source management.

All three agents must cover retrieval schema quality:

- Understanding agent checks whether a reader can explain why the page should be retrieved and whether `methods`, `topics`, `settings`, `aliases`, and candidate records have distinct roles.
- Quality agent scores retrieval taxonomy boundaries, frontmatter/body non-duplication, and the quality of `When To Retrieve This Paper`; it should fail pages where paper-specific method components replace reusable method families, topics are generic/title-derived, or body retrieval text is only boilerplate or negative-rule laundry lists.
- Structural agent checks that frontmatter is the source of truth and that body `When To Retrieve This Paper` has canonical retrieval examples plus scope notes without duplicating frontmatter field lists.
- Structural agent checks product-boundary integrity: canonical page is the retrieval target, draft `paper.md` is an internal candidate, and `review.md`/self-check/judge files are not exposed as daily wiki entries.

Keep these roles separate. Do not let structural pass/fail replace semantic understanding or quality evaluation, and do not bury schema completeness failures inside prose-quality findings.

All three roles must use complete rubric contracts:

- every dimension has a weight, 1-5 score anchors, evidence requirements, and failure examples;
- hard-fail rules override weighted averages;
- outputs must include evidence, rationale, repair bucket, recommended fixes, and calibration notes;
- packets and result JSON must be portable across Codex/Claude direct execution, future API execution, and local vLLM execution.

The first executable backend is `agent-executed`: Meridian generates rubric packets and expected JSON paths, then the active Codex or Claude Code agent reads the packet, reasons with the current model, writes the result JSON, and asks Meridian to aggregate. The `fake` backend exists only for deterministic tests. API and vLLM backends are reserved extension points and must preserve the same packet/result contract.

Use these CLI surfaces for the three-agent loop:

- `meridian wiki self-check-run <run.json> --backend agent-executed` prepares per-paper packets and deterministic structural results.
- `meridian wiki self-check-aggregate <self-check-manifest.json>` validates understanding/quality result JSON plus structural output and writes the combined decision.
- `meridian wiki self-check-eval <eval_manifest.json> --backend agent-executed` prepares the same loop across a calibration set; with `--backend fake` it runs a deterministic orchestration smoke test.

Self-check artifacts live under `self-check/` and include `self-check-manifest.json`, `understanding-agent.md`, `quality-agent.md`, `structural-self-check.json`, optional `understanding-result.json` / `quality-result.json`, and `self-check-summary.json`. Calibration runs write `self-check-eval-summary.json`.

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
