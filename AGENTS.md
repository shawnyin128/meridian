# Meridian Agent Guide

This project follows the LLM Wiki development pattern.

Before planning, designing, implementing, or reviewing changes that affect raw source ingestion, generated wiki pages, schema conventions, Obsidian vault layout, page frontmatter, indexing, logging, query behavior, lint behavior, citations, or cross-links, load and follow the project skill at:

`/Users/shawn/Desktop/meridian/.codex/skills/llm-wiki/SKILL.md`

For product-facing Paper Wiki usage, use the unified entry skill:

`/Users/shawn/Desktop/meridian/.codex/skills/meridian-paper-wiki/SKILL.md`

It exposes the two product workflows: Update Wiki and Use Wiki. Treat CLI commands as execution primitives below the Prompt/Skill and MCP entries.

Before generating, evaluating, or refining paper ingest outputs such as `paper.md`, claim/method/evidence records, reader self-check packets, retrieval metadata, or calibration-driven ingest quality, also load:

`/Users/shawn/Desktop/meridian/.codex/skills/paper-ingest/SKILL.md`

Before using the accumulated wiki to retrieve papers, claims, methods, or implementation hooks for a research/coding request, load:

`/Users/shawn/Desktop/meridian/.codex/skills/wiki-retrieve/SKILL.md`

Before adding or publishing user paper-reading insights, corrections, implementation notes, retrieval hints, or Zotero-style annotation imports, load:

`/Users/shawn/Desktop/meridian/.codex/skills/wiki-personalize/SKILL.md`

Before refining, versioning, publishing, or reviewing evolved canonical wiki pages, load:

`/Users/shawn/Desktop/meridian/.codex/skills/wiki-evolve/SKILL.md`

Before auditing, repairing, publishing, retrieving, or evolving method/topic/claim/evidence/synthesis knowledge-layer pages, load:

`/Users/shawn/Desktop/meridian/.codex/skills/wiki-knowledge/SKILL.md`

Before adding, auditing, publishing, retrieving, or evaluating preliminary-knowledge concept pages, load:

`/Users/shawn/Desktop/meridian/.codex/skills/wiki-concept/SKILL.md`

Before handling research coding requests that should use Paper Wiki context for experiment design, paper-method implementation, sanity checks, debugging, result interpretation, or wiki write-back, load:

`/Users/shawn/Desktop/meridian/.codex/skills/lab/SKILL.md`

Current MVP direction:

- Build a personally usable paper wiki, not a general multi-agent platform.
- Optimize for internalizing raw papers, incorporating the user's Zotero annotations and reading insights, evolving paper analysis through feedback, and feeding the accumulated wiki back into idea generation.
- Treat the system as a well-defined workflow with strong request handling, retrieval, storage, and review boundaries.
- Use `/Users/shawn/Desktop/meridian/docs/mvp-paper-wiki-workflow.md` as the current product/workflow reference.

Default architecture:

- Raw sources are immutable.
- The Markdown wiki is the durable, LLM-maintained compiled knowledge layer.
- `AGENTS.md`, templates, and page frontmatter define the operating schema.
- Important queries and ingests should compound into wiki pages, index updates, and append-only log entries.

Prefer small, auditable Markdown-first changes before adding custom infrastructure.

## Startup Protocol

On fresh or resumed sessions, load Arbor project context before making project-level decisions:

1. Read this `AGENTS.md`.
2. Check git history when the project is a git repository.
3. Read `.arbor/memory.md`.
4. Check current workspace status when available.

## Project Map

- `.arbor/memory.md`: short-term Arbor session memory and in-flight workflow pointer.
- `.arbor/workflow/features.json`: Arbor workflow status index for the active planning/development queue.
- `.codex/hooks.json`: project-local Arbor hook intents.
- `.codex/skills/meridian-paper-wiki/SKILL.md`: product-facing Paper Wiki entry skill for Update Wiki and Use Wiki workflows.
- `.codex/skills/llm-wiki/SKILL.md`: project skill for LLM Wiki development principles.
- `.codex/skills/paper-ingest/SKILL.md`: project skill for high-quality paper ingest outputs and reader self-check convergence.
- `.codex/skills/wiki-retrieve/SKILL.md`: project skill for using Meridian retrieval and Obsidian CLI to find paper-wiki context for research work.
- `.codex/skills/wiki-personalize/SKILL.md`: project skill for adding, linting, publishing, and retrieving user-supplied paper insights without source-fact contamination.
- `.codex/skills/wiki-evolve/SKILL.md`: project skill for refinement proposals, revision snapshots, evolution-state warnings, and canonical page versioning.
- `.codex/skills/wiki-knowledge/SKILL.md`: project skill for knowledge-layer audit, repair proposal, safe publish, and retrieval discipline across method/topic/claim/evidence/synthesis pages.
- `.codex/skills/wiki-concept/SKILL.md`: project skill for preliminary-knowledge concept-layer audit, publish, retrieval, and evaluation.
- `.codex/skills/lab/SKILL.md`: product-facing Lab skill for wiki-aware experiment design, paper-method implementation, and broken-run sanity/debug workflows.
- `pyproject.toml`: Python package metadata and `meridian` console script entrypoint.
- `src/meridian/`: Paper Wiki prototype CLI implementation for `meridian wiki ...`.
- `src/meridian/lab/`: lightweight Lab release/debug helpers for validating `.meridian/` research-space state without adding a product CLI or MCP surface.
- `src/meridian/mcp/`: scenario-facing MCP adapter and stdio server exposing `context`, `read`, `trace`, `update`, `propose`, `apply`, and `audit`.
- `src/meridian/templates/research-dev/`: Markdown templates for Research Dev `.meridian/` research-space state, context packets, experiment evidence, and finding proposals.
- `tests/`: unit tests for CLI ingest, eval, and human review recording.
- `wiki/`: Obsidian-compatible Markdown wiki artifacts, managed raw sources, canonical pages, generated indexes, and draft workspaces.
- `eval/`: Paper Wiki evaluation case examples and LLM-as-Judge rubrics.
- `README.md`: minimal CLI usage note.
- `docs/mvp-paper-wiki-workflow.md`: current MVP product/workflow reference.
- `docs/mvp-paper-wiki-plan.md`: current brainstormed MVP boundary, development plan, and test plan.
- `docs/paper-wiki-prototype-evaluation-plan.md`: Paper Wiki-first prototype, manual review, evaluation case, and refine loop plan.
- `docs/wiki-evaluation-set-and-judge-rubric.md`: current evaluation set strategy and LLM-as-Judge rubric contract.
- `docs/final-llm-wiki-product-spec.md`: final Paper Wiki product specification for compiled knowledge, synthesis growth, retrieval policy, quality states, and artifact boundaries.
- `docs/wiki-product-entry-contract.md`: product entry contract defining Prompt/Skill and MCP entries across Update Wiki and Use Wiki.
- `docs/wiki-mcp-entry-design.md`: MCP entry tool surface and adapter design for Paper Wiki.
- `docs/wiki-entry-demo.md`: small release demo for Prompt/Skill and MCP entry workflows.
- `docs/final-llm-wiki-product-quality-brief.md`: latest deterministic final-product readiness brief and residual bottlenecks.
- `docs/wiki-layer-test-strategy.md`: layered source/canonical/retrieval test strategy, retrieval scenario metrics, judge rubric usage, calibration, and release gates.
- `docs/wiki-product-dataflow-and-artifact-boundaries.md`: product-level source/canonical/draft/debug/retrieval artifact taxonomy and dataflow boundaries.
- `docs/user-insight-personalization-mvp.md`: user insight schema, add/lint/publish workflow, source-fact boundary, retrieval behavior, and future Zotero adapter boundary.
- `docs/wiki-evolution-mvp.md`: refinement schema, lint/publish workflow, revision snapshots, evolution-state retrieval behavior, and source-fact correction rules.
- `docs/knowledge-layer-schema.md`: canonical schema for paper/method/topic/claim/evidence/synthesis/decision knowledge-layer pages.
- `docs/knowledge-layer-optimization-brief.md`: latest knowledge-layer audit, repair, retrieval, and remaining-limit summary for the main wiki.
- `docs/retrieval-smoke-quality-brief.md`: latest tracked retrieval smoke quality summary over representative canonical quantization wiki pages.
- `docs/real-library-retrieval-audit-brief.md`: latest tracked per-paper retrieval audit over the current real canonical wiki.
- `docs/retrieval-optimization-research.md`: retrieval v1 design research, option tradeoffs, and backend roadmap for Markdown-first paper-wiki retrieval.
- `docs/retrieval-v1-quality-brief.md`: current v0 versus optimized v1 quality evidence, run artifacts, convergence conclusion, and remaining bottlenecks.
- `docs/wiki-writeback-synthesis-layer.md`: query write-back, proposal lint, publish, and synthesis-layer schema contract.
- `docs/paper-wiki-mvp-delivery-boundaries.md`: current boundaries for query write-back, Obsidian CLI, future MCP delivery, Zotero/user notes, and MVP release gates.
- `docs/main-wiki-productization-quality-brief.md`: current main Obsidian vault productization status, source/canonical/retrieval gates, graph health, quality deltas, and remaining limitations.
- `docs/mvp-workflow.html`: simplified visual workflow diagram.
- `docs/research-coding-framework.md`: lightweight end-to-end research coding framework that combines LLM Wiki state, Arbor continuity ideas, and bounded multi-agent research bursts.
- `docs/research-dev-use-cases.md`: Research Dev scenario map defining idea-to-experiment, paper-to-implementation, broken-run debug, result interpretation, reproduction diagnosis, and write-back use cases.
- `docs/research-dev-mvp-plan.md`: lightweight Research Dev MVP plan covering artifact schemas, skill behavior, wiki retrieval, write-back, checkpointing, and evaluation.
- `docs/research-dev-state-model.md`: canonical Research Dev `.meridian/` state model for threads, approach nodes, experiments, local finding proposals, active pointers, placement, and write-back boundaries.
- `docs/lab-system-optimization.md`: Lab system optimization brief covering state validation, local finding to wiki transfer, and longitudinal replay evaluation.
- `docs/research-coding-framework.html`: visual diagram for the research coding loop.
- `docs/full-system-architecture.md`: two-product boundary for Paper Wiki Workflow and Research Dev Agent.
- `docs/full-system-architecture.html`: full visual architecture showing standalone and integrated usage modes.
- `docs/source-grounded-development-principles.md`: source-grounded design principles from Karpathy's LLM Wiki gist, Anthropic agent engineering posts, and selected community followup lessons.
- `docs/research-event-map.md`: research coding event taxonomy and MVP high-leverage workflow boundary.
- `docs/concept-layer-schema.md`: canonical schema for preliminary-knowledge concept pages under `wiki/concepts/`.
- `docs/concept-layer-optimization-brief.md`: latest concept-layer main-wiki audit, publish, and retrieval evaluation summary.
- `docs/review/`: Arbor review/context artifacts for managed planning and later develop/evaluate rounds.
