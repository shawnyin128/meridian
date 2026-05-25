---
type: design
title: "Source-Grounded Development Principles"
status: draft
created: 2026-05-18
updated: 2026-05-18
tags:
  - llm-wiki
  - research-dev-agent
  - mcp
  - context-engineering
confidence: medium
sources:
  - "https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
  - "https://www.anthropic.com/engineering/code-execution-with-mcp"
  - "https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills"
  - "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
  - "https://www.anthropic.com/engineering/swe-bench-sonnet"
  - "https://www.anthropic.com/engineering/building-effective-agents"
  - "https://www.anthropic.com/engineering/writing-tools-for-agents"
---

# Source-Grounded Development Principles

This note distills product and engineering principles from Karpathy's LLM Wiki gist, selected community followups, and Anthropic engineering posts. It intentionally avoids adopting concrete implementation code from community followups.

## Core LLM Wiki Method

The core method is not RAG over raw documents. It is a persistent compilation loop:

```text
raw sources -> wiki pages -> index/log/schema -> query/lint/write-back -> stronger wiki
```

Adopt these as invariants:

- Raw sources are immutable and remain the source of truth.
- The wiki is a durable compiled knowledge layer, not a transient answer cache.
- The schema makes the agent a disciplined maintainer rather than a generic chatbot.
- Ingest should update affected pages, not only create one source summary.
- Valuable query results should become durable pages when they add synthesis, comparison, or decisions.
- Lint is a first-class workflow: contradiction checks, stale-claim checks, orphan checks, missing-concept checks, and provenance checks.
- `index.md` and `log.md` are not decorative. They are navigation state for humans and agents.

## Context Engineering Principles

Context is a scarce resource. Meridian should optimize for high-signal context rather than large context.

Adopt:

- Use progressive disclosure everywhere: metadata first, selected pages second, full source only when needed.
- Prefer a small context packet with selection reasons over broad retrieval dumps.
- Separate stable instructions, workflow state, selected evidence, and raw tool output.
- Keep long-horizon work coherent through structured notes and durable wiki state, not through ever-growing chat history.
- Let capable agents explore just-in-time, but give them good retrieval primitives.
- Avoid prompt rules that hardcode too many branches. Use clear heuristics, examples, and tool contracts instead.

## MCP And Tool Design Principles

Paper Wiki as MCP should expose research memory through agent-ergonomic tools, not raw filesystem coupling.

Adopt:

- Build a few high-impact tools, not thin wrappers around every internal operation.
- Name and namespace tools by user task boundaries, such as `wiki.search_research_memory` or `wiki.build_context_packet`.
- Return meaningful, semantic context: page title, type, claim, confidence, source, why selected, conflict/gap status.
- Support `concise` and `detailed` response modes.
- Use pagination, filters, and truncation with helpful continuation hints.
- Return actionable validation errors that teach the agent how to retry.
- Keep write tools conservative: propose/apply separation before broad canonical edits.
- Prefer code-executable MCP access for complex composition, filtering, joins, and repeated operations.

Do not expose low-level implementation details unless they are needed for follow-up tool calls.

## Skills And Progressive Disclosure

Skills should capture reusable procedural knowledge without forcing all context into every task.

Adopt:

- Keep `SKILL.md` lean and move specialized guidance into referenced files as the project grows.
- Treat skill `name` and `description` as routing-critical.
- Add scripts only when deterministic code is better than token-generation.
- Evolve skills from observed failures and successful workflows.
- Test skills against representative tasks, not toy prompts.

For Meridian, this means the LLM Wiki skill should encode durable rules, while paper-ingest, context-packet, MCP-server, and lab skills can become separate, progressively loaded capabilities.

## Research Dev Agent Principles

The dev side needs agentic freedom, but the artifacts must be research-grade.

Adopt:

- Use the simplest scaffold that lets the model inspect, decide, run, and recover.
- Give the agent autonomy over the path, not autonomy over the evidence contract.
- Ground progress in environmental feedback: tests, logs, metrics, diffs, plots, and wiki evidence.
- Prefer research-friendly code over production-minimal code.
- Require a learning target before expensive experiments.
- Treat wiki lookup as a first-class move when paper definitions, prior failed paths, or method details matter.
- Preserve failed attempts when they change the next research decision.

Avoid:

- forcing every research coding task through a heavy Arbor-like workflow
- over-constraining the agent with brittle state-machine prompts
- accepting passing tests as sufficient research interpretation

## Community Followup Lessons Worth Adopting

Useful experience signals from the gist followups:

- **Triage-first ingest**: before writing wiki pages, produce a report of new pages, extensions, contradictions, and reconciliation options.
- **Contradictions need human-visible judgment points**: contested claims should surface alternatives instead of silently picking a side.
- **Source drift checks**: raw sources can carry checksums or stable source IDs so the linter can detect changed sources.
- **Walk-up discovery**: tools should resolve the active wiki from subdirectories and handle ambiguous candidates explicitly.
- **Identity, level, and relationship are real problems**: duplicate concepts, flat importance, and untyped "related" links degrade the wiki over time.
- **Claim-first structure can help**: extracting citable claims before concepts may make concept importance and hierarchy easier to infer.
- **Self-healing lint loops are valuable**: stale claims, orphan links, contradictions, and data gaps should become recurring maintenance targets.
- **Progressive onboarding matters**: a `quickstart` plus `next` style orientation can make the system easier to adopt than exposing all commands at once.
- **Local-first still matters**: markdown/git/offline operation should remain the default unless scale forces a database.
- **Git as research time travel**: staged commits and branches are especially valuable in research because failed or unclear paths can later become useful evidence.
- **Do not overfit to the hype**: many followups are implementation pitches. Adopt only empirically useful patterns that fit Meridian's paper-wiki plus research-dev boundary.

## Implications For Meridian

For the Paper Wiki:

- Keep Markdown as source of truth.
- Deliver via MCP for decoupling.
- Start with `search_research_memory`, `build_context_packet`, `read_wiki_page`, `propose_write_back`, and controlled ingest entrypoints.
- Add triage-first ingest before broad automated page writes.
- Add typed relationships gradually: supports, contradicts, refines, implements, evaluates, extends.

For the Research Dev Agent:

- Consume wiki context through MCP whenever available.
- Use wiki context to make coding decisions and explain research implications.
- Keep tool use flexible, but require evidence identity: command, config, metric, source pages, result path.
- Encourage meaningful git checkpoints at hypothesis, probe, ablation, result, and risky-refactor boundaries.
- Keep checkpoint history impact-readable: separate hypothesis logic, instrumentation, mechanical cleanup, and generated artifacts.
- Write back through proposals, not silent canonical rewrites.

For evaluation:

- Evaluate with realistic research tasks: paper-to-code, result-to-claim, failed reproduction, ambiguous method detail, stale wiki contradiction.
- Track whether the agent chose the wiki when it should have.
- Track context efficiency, not just answer quality.
- Review transcripts and tool traces for missed wiki lookups, redundant tool calls, bloated outputs, and silent assumptions.
