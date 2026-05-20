# Meridian Agent Guide

This project follows the LLM Wiki development pattern.

Before planning, designing, implementing, or reviewing changes that affect raw source ingestion, generated wiki pages, schema conventions, Obsidian vault layout, page frontmatter, indexing, logging, query behavior, lint behavior, citations, or cross-links, load and follow the project skill at:

`/Users/shawn/Desktop/meridian/.codex/skills/llm-wiki/SKILL.md`

Before generating, evaluating, or refining paper ingest outputs such as `paper.md`, claim/method/evidence records, reader self-check packets, retrieval metadata, or calibration-driven ingest quality, also load:

`/Users/shawn/Desktop/meridian/.codex/skills/paper-ingest/SKILL.md`

Before using the accumulated wiki to retrieve papers, claims, methods, or implementation hooks for a research/coding request, load:

`/Users/shawn/Desktop/meridian/.codex/skills/wiki-retrieve/SKILL.md`

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
- `.codex/skills/llm-wiki/SKILL.md`: project skill for LLM Wiki development principles.
- `.codex/skills/paper-ingest/SKILL.md`: project skill for high-quality paper ingest outputs and reader self-check convergence.
- `.codex/skills/wiki-retrieve/SKILL.md`: project skill for using Meridian retrieval and Obsidian CLI to find paper-wiki context for research work.
- `pyproject.toml`: Python package metadata and `meridian` console script entrypoint.
- `src/meridian/`: Paper Wiki prototype CLI implementation for `meridian wiki ...`.
- `tests/`: unit tests for CLI ingest, eval, and human review recording.
- `wiki/`: Obsidian-compatible Markdown wiki artifacts, managed raw sources, canonical pages, generated indexes, and draft workspaces.
- `eval/`: Paper Wiki evaluation case examples and LLM-as-Judge rubrics.
- `README.md`: minimal CLI usage note.
- `docs/mvp-paper-wiki-workflow.md`: current MVP product/workflow reference.
- `docs/mvp-paper-wiki-plan.md`: current brainstormed MVP boundary, development plan, and test plan.
- `docs/paper-wiki-prototype-evaluation-plan.md`: Paper Wiki-first prototype, manual review, evaluation case, and refine loop plan.
- `docs/wiki-evaluation-set-and-judge-rubric.md`: current evaluation set strategy and LLM-as-Judge rubric contract.
- `docs/wiki-layer-test-strategy.md`: layered source/canonical/retrieval test strategy, retrieval scenario metrics, judge rubric usage, calibration, and release gates.
- `docs/retrieval-smoke-quality-brief.md`: latest tracked retrieval smoke quality summary over representative canonical quantization wiki pages.
- `docs/real-library-retrieval-audit-brief.md`: latest tracked per-paper retrieval audit over the current real canonical wiki.
- `docs/paper-wiki-mvp-delivery-boundaries.md`: current boundaries for query write-back, Obsidian CLI, future MCP delivery, Zotero/user notes, and MVP release gates.
- `docs/main-wiki-productization-quality-brief.md`: current main Obsidian vault productization status, source/canonical/retrieval gates, graph health, quality deltas, and remaining limitations.
- `docs/mvp-workflow.html`: simplified visual workflow diagram.
- `docs/research-coding-framework.md`: lightweight end-to-end research coding framework that combines LLM Wiki state, Arbor continuity ideas, and bounded multi-agent research bursts.
- `docs/research-coding-framework.html`: visual diagram for the research coding loop.
- `docs/full-system-architecture.md`: two-product boundary for Paper Wiki Workflow and Research Dev Agent.
- `docs/full-system-architecture.html`: full visual architecture showing standalone and integrated usage modes.
- `docs/source-grounded-development-principles.md`: source-grounded design principles from Karpathy's LLM Wiki gist, Anthropic agent engineering posts, and selected community followup lessons.
- `docs/research-event-map.md`: research coding event taxonomy and MVP high-leverage workflow boundary.
- `docs/review/`: Arbor review/context artifacts for managed planning and later develop/evaluate rounds.
