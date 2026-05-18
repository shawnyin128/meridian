---
type: architecture
title: "Meridian LLM Wiki System Architecture"
status: draft
created: 2026-05-12
updated: 2026-05-12
tags:
  - llm-wiki
  - architecture
confidence: medium
---

# Meridian LLM Wiki System Architecture

Meridian should be built as a Markdown-first research state compiler. Raw material enters the system, the agent integrates it into a persistent wiki, and the human reviews the evolving research state in Obsidian or another Markdown workspace.

The key architectural choice is that the wiki is the durable product surface. Retrieval, search, and chat are support mechanisms.

## System Layers

1. **Input Channels**
   - GPT / Claude / Codex conversations
   - Zotero notes and bibliography exports
   - Papers, clipped articles, web pages, NotebookLM outputs
   - Experiment plans, repo notes, logs, charts, and observations

2. **Raw Source Store**
   - Immutable `raw/` files
   - Locally mirrored assets in `raw/assets/`
   - Source manifests or lightweight metadata when needed
   - No silent rewrites by the agent

3. **Integration Workspace**
   - Inbox for newly captured material
   - Classification into source, idea, claim, paper, project, decision, or synthesis updates
   - Human-reviewable diffs before broad rewrites
   - Provenance and contradiction checks

4. **Compiled Wiki**
   - Markdown pages with YAML frontmatter
   - Obsidian-compatible links
   - `index.md` as content catalog
   - `log.md` as append-only chronological history
   - Templates for stable page shape

5. **Operations**
   - `capture`: place material into inbox or raw source store
   - `ingest`: integrate one source into the wiki
   - `query`: answer from existing wiki pages and optionally file durable outputs
   - `lint`: find stale, orphaned, contradictory, or under-sourced pages
   - `plan`: convert current research state into next reading or experiment actions

6. **Control Plane**
   - `AGENTS.md` and `.codex/skills/llm-wiki/SKILL.md`
   - Page templates and frontmatter conventions
   - Diff, citation, and logging rules
   - Future local CLI helpers only when repeated manual work justifies them

## MVP Directory Shape

```text
raw/
  assets/
  sources/
wiki/
  index.md
  log.md
  inbox/
  templates/
  sources/
  ideas/
  claims/
  concepts/
  projects/
  decisions/
docs/
  architecture.md
  system-architecture.html
AGENTS.md
.codex/skills/llm-wiki/SKILL.md
```

## First Implementation Milestone

The first useful system should not start with a database or a standalone app. It should start with a disciplined vault shape and three reliable agent workflows:

1. Ingest one source into `raw/` and `wiki/`.
2. Query the wiki through `index.md` and `rg`.
3. Run a lint pass that produces specific page updates or a compact review report.

Once those workflows become repetitive, add local scripts for validation, index generation, and link checking.
