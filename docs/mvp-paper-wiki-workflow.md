---
type: workflow
title: "MVP Paper Wiki Workflow"
status: draft
created: 2026-05-18
updated: 2026-05-18
tags:
  - llm-wiki
  - paper-wiki
  - workflow
confidence: medium
---

# MVP Paper Wiki Workflow

## Product Definition

Meridian MVP is a personal paper wiki workflow. It is not a multi-agent platform. Its job is to help one researcher internalize papers, preserve their own reading insights, evolve paper analysis over time, and reuse the accumulated wiki to generate better research ideas.

The durable product surface is an Obsidian-compatible Markdown knowledge base. The workflow may use agents internally, but the user-facing abstraction is a defined request-to-wiki-to-idea loop.

## Workflow Definition

Use Anthropic's distinction from "Building effective agents": workflows are systems where LLMs and tools are orchestrated through predefined code paths; agents are systems where LLMs dynamically direct their own processes and tool usage.

Meridian MVP should be drawn and implemented as workflows, not autonomous agents. The LLM can be augmented with retrieval, tools, and memory, but the product should keep the path explicit enough to debug:

- `routing`: classify the user request and choose a specialized workflow.
- `prompt chaining`: break paper understanding into fixed stages with gates.
- `parallelization`: run independent extraction passes for claims, methods, experiments, limitations, and user insights.
- `evaluator-optimizer`: revise paper analysis from explicit feedback and quality checks.
- `augmented LLM`: give each step a clear interface to source reading, Obsidian file operations, retrieval, graph/index/log updates, and citation checks.

Avoid autonomous agent loops in the MVP unless a workflow step is genuinely unpredictable and cannot be handled with a fixed path.

## User Needs

1. **Raw paper analysis**
   - Accept a paper PDF, arXiv link, DOI, local file, or paper metadata.
   - Extract the paper's problem, motivation, method, assumptions, claims, experiments, results, limitations, and open questions.
   - Preserve source provenance so paper-derived claims remain traceable.

2. **User insight ingestion**
   - Accept the user's reading notes, pasted insights, or Zotero annotations.
   - Separate user judgment from source claims.
   - Let user insight override what the generic paper summary should emphasize.

3. **Evolutionary paper analysis**
   - Treat first-pass analysis as a draft, not final truth.
   - Let user feedback update the analysis structure, page fields, emphasis, links, and open questions.
   - Keep enough history to understand why the analysis changed.

4. **Obsidian-first storage and management**
   - Store the wiki as Markdown with YAML frontmatter.
   - Keep raw sources immutable.
   - Use clear hierarchy for papers, claims, methods, concepts, ideas, experiments, topics, inbox, drafts, index, and log.
   - Use Obsidian CLI or direct Markdown file operations as the first storage interface.

5. **High-quality retrieval**
   - Convert user requests and ideas into retrieval intent.
   - Combine keyword search, frontmatter filters, graph links, citation links, recency/status filters, and later BM25/vector reranking when needed.
   - Return a small, defensible context packet rather than a large pile of loosely related notes.

6. **Good request interface**
   - Classify each request before acting.
   - Ask only for missing decisions that change the workflow.
   - Produce reviewable drafts before modifying canonical wiki pages when the change is broad.
   - Let valuable answers be filed back into the wiki.

## Non-Goals For MVP

- Do not build a general autonomous agents platform.
- Do not start with multi-user collaboration.
- Do not start with paper writing, rebuttal, or experiment automation.
- Do not require a database before Markdown stops being enough.
- Do not optimize for fully automatic batch ingestion before one-paper ingestion is reliable.

## Development Strategy

Build the Paper Wiki first. The Research Dev Agent depends on the wiki being useful enough to serve as a real research-memory backend.

The first development cycle should be:

1. Brainstorm and build a minimal prototype.
2. Manually review the prototype against the user's actual paper-reading and idea-generation needs.
3. Build many evaluation cases with detailed problem descriptions and expected outcome properties.
4. Run evaluation, analyze failures, refine workflow/schema/tools, and repeat.

Evaluation cases should not overspecify the unique path. They should define what a good outcome must preserve: useful wiki state, provenance, source/user/synthesis separation, context-packet quality, and reviewable writes.

## Proposed Vault Shape

```text
wiki/
  .drafts/
    ingests/
    retrieval/
    proposals/
  .index/
    papers.jsonl
    source-audit.json
    wiki-lint.json
  raw/
    sources/
      papers/
      sources.jsonl
      index.md
  inbox/
  papers/
  claims/
  methods/
  evidence/
  topics/
  ideas/
  experiments/
  syntheses/
  index.md
  log.md
  graph/
    edges.jsonl
    citations.jsonl
  templates/
```

## Core Request Types

- `ingest paper`: read a new paper and create/update wiki pages.
- `add my insight`: attach user reading insight or Zotero annotations to an existing paper analysis.
- `evolve analysis`: revise the analysis structure or page contents based on feedback.
- `retrieve context`: find relevant wiki pages for a user idea or question.
- `develop idea`: use retrieved context to generate research angles, hypotheses, paper-reading targets, or experiment sketches.
- `lint wiki`: detect stale, under-sourced, contradictory, orphaned, or low-value pages.

## Drawing Conventions

When drawing Meridian workflows:

- Draw the request router first.
- Draw fixed code paths as horizontal lanes.
- Draw LLM calls as named work steps, not as autonomous agents.
- Draw programmatic checks as gates.
- Draw retrieval, Obsidian storage, graph updates, and citation verification as tools or state stores.
- Draw feedback loops only where there are explicit evaluation criteria.
- Draw canonical wiki writes after review/publish gates.
- Keep autonomous-agent boxes out of the MVP diagram unless the user explicitly chooses that direction.

## Retrieval Policy

Retrieval should be a workflow, not a single search call:

1. Parse the user's request into intent, objects, constraints, and desired output.
2. Read `wiki/.index/papers.jsonl`, `wiki/index.md`, and relevant frontmatter.
3. Use lexical search first (`rg`, BM25, Obsidian search, or Meridian's local catalog scorer).
4. Expand through graph links: paper-to-claim, claim-to-method, method-to-idea, topic-to-paper.
5. Apply filters: status, source count, confidence, recency, user-marked importance.
6. Rerank for usefulness to the current request.
7. Return a context packet with chosen pages, why each page was selected, and what gaps remain.
8. Cite or link every major claim in the final answer.

Retrieval v0 is intentionally thin: `meridian wiki catalog` builds
`wiki/.index/papers.jsonl` from canonical paper pages, and
`meridian wiki retrieve` produces a ranked context packet from frontmatter and
high-value sections. It does not synthesize an answer, mutate canonical wiki
state, or require a vector database. Scientific/research retrieval excludes
canonical paper pages that have not passed source-fidelity validation; source
quality and source-fidelity repair queries can still retrieve those pages for
cleanup or quarantine.

## Workflow Contract

Canonical wiki writes should usually pass through a draft stage:

1. Produce a draft update plan.
2. Write or update pages in `wiki/.drafts/` for broad changes.
3. Show the user what will change when feedback matters.
4. Publish to canonical wiki pages after approval or for narrow low-risk updates.
5. Update `wiki/index.md`, `wiki/log.md`, and graph files.

Small additive updates may skip the draft stage when the user explicitly asks for direct maintenance and the provenance is clear.

## Implemented Wiki Management Surface

The current full-wiki layer starts with a Markdown/Obsidian-compatible scaffold:

- `meridian wiki init --wiki-root wiki` creates the vault directories and templates.
- `meridian wiki flow <paper.pdf> --wiki-root wiki --rubric <rubric.md>` prepares draft ingest artifacts, validation packets, and publishes a canonical paper page only when deterministic checks and source-fidelity validation pass.
- `meridian wiki publish-run <run.json> --wiki-root wiki --source-fidelity-result <result.json>` publishes an existing draft run and promotes candidate claims, methods, evidence, and topics only after source-fidelity validation passes.
- `meridian wiki source-audit --wiki-root wiki` checks managed raw sources and writes a source index.
- `meridian wiki rebuild-index --wiki-root wiki` rebuilds `wiki/index.md` and `.index/papers.jsonl`.
- `meridian wiki lint --wiki-root wiki` checks source registry, required directories, paper frontmatter, and basic link health.
- `.codex/skills/wiki-retrieve/SKILL.md` is the agent-facing retrieval workflow: run Meridian retrieval, optionally inspect with Obsidian CLI, then answer from the smallest useful set of pages.
