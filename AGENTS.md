# Meridian Agent Guide

## Project Goal

Meridian builds a personally usable Paper Wiki and Lab research-development
layer. The system should internalize raw papers, incorporate the user's reading
insights, evolve paper analysis through feedback, and feed accumulated wiki
knowledge back into idea generation, feasibility review, implementation
grounding, and local research findings.

Current product boundary:

- Paper Wiki owns source-grounded ingest, canonical Markdown knowledge,
  retrieval, synthesis, quality checks, and write-back proposals.
- Lab owns local research idea graph state, approach nodes, experiment
  evidence, research grounding injections, and local finding proposals.
- Meridian setup owns initialization, status, migration, MCP readiness, and
  research-agent contract scaffolding.

## Project Constraints

This project follows the LLM Wiki development pattern. Before planning,
designing, implementing, or reviewing changes that affect raw source ingestion,
generated wiki pages, schema conventions, Obsidian vault layout, page
frontmatter, indexing, logging, query behavior, lint behavior, citations, or
cross-links, load and follow the project skill at
`.codex/skills/llm-wiki/SKILL.md`.

Use the focused project skills for Paper Wiki work:

- `.codex/skills/paper-ingest/SKILL.md`
- `.codex/skills/wiki-retrieve/SKILL.md`
- `.codex/skills/wiki-personalize/SKILL.md`
- `.codex/skills/wiki-evolve/SKILL.md`
- `.codex/skills/wiki-knowledge/SKILL.md`
- `.codex/skills/wiki-concept/SKILL.md`

Use the product-facing plugin skills for runtime behavior:

- `plugins/codex/meridian/skills/meridian/SKILL.md`: setup, status, updates,
  and migrations.
- `plugins/codex/meridian/skills/wiki/SKILL.md`: Paper Wiki Update Wiki and
  Use Wiki workflows.
- `plugins/codex/meridian/skills/lab/SKILL.md`: Lab idea graph, wiki-grounded
  feasibility, approach trees, experiment evidence, local findings, and
  research grounding injections.

Architecture constraints:

- Raw sources are immutable.
- The Markdown wiki is the durable, LLM-maintained compiled knowledge layer.
- `AGENTS.md`, templates, and page frontmatter define the operating schema.
- Important queries and ingests should compound into wiki pages, index updates,
  and append-only log entries.
- Prefer small, auditable Markdown-first changes before adding custom
  infrastructure.

<!-- ARBOR HOOKLESS RUNTIME CONTRACT START -->
Arbor hookless runtime contract:

Arbor package scripts live under the installed Arbor skill root at
skills/arbor/scripts. Resolve the newest installed Arbor skill root from the
runtime cache, for example
%USERPROFILE%/.codex/plugins/cache/arbor/arbor/*/skills/arbor on Codex or
~/.claude/plugins/cache/arbor/arbor/*/skills/arbor on Claude Code. Do not look
for these scripts under <project-root>/scripts or <plugin-root>/scripts. Use a
direct Python executable for Arbor context helpers. On Windows, do not wrap
these commands in conda run; it can recode captured stdout and corrupt large
UTF-8 context packets. If python is not on PATH, call the absolute interpreter
directly, such as <conda-base>/python.exe.

Arbor startup: before answering a non-trivial project task or resume question,
run python <arbor-skill-root>/scripts/run_session_startup_hook.py --root
<project-root>. If that script is unavailable, manually read in this order:
AGENTS.md; recent formatted git log; .arbor/memory.md; git status --short.

Arbor finalization: before the final response for a non-trivial task, handoff,
or dirty-worktree turn, run python
<arbor-skill-root>/scripts/run_hookless_finalization.py --root <project-root>.
That command runs the Stop-equivalent maintenance path first, then emits memory
hygiene and AGENTS Project Map drift context, including the Git commit
convention reminder. Use its output to decide whether any additional
.arbor/memory.md or AGENTS.md edit is needed.

Before creating a commit, draft a Conventional Commits 1.0.0 subject and run
python <arbor-skill-root>/scripts/check_git_commit_convention.py --message
"<subject>". Do not create native git hooks from Arbor unless the user
explicitly asks for that separate integration.

Do not register or repair project hooks unless the user explicitly asks for
legacy hook repair. Arbor context is orientation and recovery only; it must not
choose planning, debugging, review, or branch-finishing methodology by itself.
<!-- ARBOR HOOKLESS RUNTIME CONTRACT END -->

## Project Map

- `.agents/`: Codex marketplace manifest for the Meridian plugin package.
- `.arbor/`: Arbor recovery memory and workflow state.
- `.claude-plugin/`: Claude Code marketplace manifest for the Meridian plugin
  package.
- `.codex/`: project-local Meridian development skills; Arbor no longer uses
  Codex project hooks by default.
- `.github/`: GitHub Actions workflows, including VS Code extension release
  asset packaging.
- `docs/`: durable product, architecture, workflow, evaluation, and review
  documentation.
- `eval/`: Paper Wiki and Lab evaluation cases and LLM-as-Judge rubrics.
- `plugins/`: Codex, Claude Code, and VS Code plugin packages.
- `pyproject.toml`: Python package metadata and `meridian` console script
  entrypoint.
- `README.md`: user-facing setup, update, and workflow entry documentation.
- `src/`: Meridian Python source for Paper Wiki, Lab, MCP, setup, templates,
  and evaluation helpers.
- `tests/`: Python test suite for CLI, ingest, retrieval, setup, Lab graph,
  MCP, and evaluation behavior.
