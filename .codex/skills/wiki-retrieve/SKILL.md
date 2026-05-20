---
name: wiki-retrieve
description: Use when a research or coding task should consult Meridian's Paper Wiki to find relevant papers, mechanisms, claims, methods, evidence, source-quality holds, or implementation hooks before answering or changing code.
---

# Wiki Retrieve

Use this skill when the user's request could benefit from the accumulated Paper Wiki, especially for research ideas, paper-to-code work, ablation design, reproduction diagnosis, literature comparison, or "what prior work should I check?" questions.

## Workflow

1. Identify the user's retrieval intent: idea/design comparison, implementation/probe, evidence check, limitation/scope check, source cleanup, or synthesis.
2. Run Meridian retrieval first:

```bash
meridian wiki retrieve "<standalone research query>" \
  --wiki-root wiki \
  --strategy v1 \
  --out wiki/.drafts/retrieval/context.md \
  --json-out wiki/.drafts/retrieval/context.json
```

3. Read the context packet and then the smallest useful set of linked wiki pages/sections.
4. If Obsidian is open and live-vault inspection is useful, use Obsidian CLI for complementary navigation. This includes `obsidian search` for live keyword checks:

```bash
obsidian vault="wiki" search query="<keyword or method>" limit=10
obsidian vault="wiki" read path="papers/<paper-page>.md"
obsidian vault="wiki" backlinks path="papers/<paper-page>.md"
```

5. Answer with page references and explain why each paper matters for the user's task.
6. If the answer creates durable synthesis, comparison, decision, or idea state, create a draft write-back proposal rather than leaving it only in chat:

```bash
meridian wiki propose-writeback \
  --wiki-root wiki \
  --query "<standalone research query>" \
  --context wiki/.drafts/retrieval/context.json \
  --title "<draft synthesis title>" \
  --proposal-type synthesis
```

Write-back proposals stay under `wiki/.drafts/proposals/` and now include `proposal.md`, `proposal.json`, `source_context.json`, and `publish_plan.md`. They separate source facts, wiki synthesis, user ideas/decisions, uncertainty, and publish plan. Do not publish canonical synthesis directly from retrieval output.

Before canonical publish, validate and apply explicitly:

```bash
meridian wiki proposal-lint wiki/.drafts/proposals/<slug>/proposal.json --wiki-root wiki
meridian wiki publish-proposal wiki/.drafts/proposals/<slug>/proposal.json --wiki-root wiki
```

Use `--proposal-type method-family`, `comparison`, `decision`, or `research-question` when those better describe the durable artifact. Put the user's hypothesis or decision in `--user-note` or `--user-note-file`; it must remain in `User Ideas / Decisions`, not `Source Facts`.

## Retrieval Discipline

- Treat frontmatter as the machine-routing source of truth.
- Treat `paper.md` as the concise reading target.
- Prefer context packets over raw search dumps.
- Use retrieval v1 by default. v1 adds field-weighted scoring, section-aware ranking, controlled-vocabulary normalization, capped graph/facet expansion, source-quality routing, hard-distractor suppression, and compact context packet construction. Use `--strategy v0` only for baseline comparison.
- Retrieval now searches paper pages and published synthesis-layer pages by default. Check `result_type` before treating a hit as source evidence; synthesis pages are higher-level interpretation and should point back to source papers.
- Do not cite a paper only because its title matched; inspect the chosen section snippets.
- Distinguish source facts, wiki synthesis, and the user's own ideas.
- For coding tasks, always look for `Implementation Hooks`, `Mechanism`, and `Limitations / Uncertainty`.
- For evidence tasks, inspect `Evidence Map`, candidate claims, and provenance before relying on a claim.

## Evaluation / Regression

When retrieval behavior changes, run the optimization evaluator against the main wiki:

```bash
meridian wiki retrieval-optimize-eval eval/cases/retrieval_optimization_v1.jsonl \
  --wiki-root wiki \
  --out-dir eval/runs/<run-id>/ \
  --rubric eval/rubrics/retrieval_optimization_quality.md \
  --top-k 8 \
  --overwrite
```

Use the generated judge packets to review whether v1 improves research usefulness over v0. Prefer generalized fixes to query parsing, facets, section scoring, graph expansion, source-quality routing, or packet construction over hand-editing a single case result.

## When Retrieval Is Weak

If `meridian wiki retrieve` returns no useful hits, try one narrower and one broader query. If it still fails, say the wiki has no strong match and identify what source or topic page should be added.
