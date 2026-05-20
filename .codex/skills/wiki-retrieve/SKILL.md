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
  --out wiki/.drafts/retrieval/context.md \
  --json-out wiki/.drafts/retrieval/context.json
```

3. Read the context packet and then the smallest useful set of linked wiki pages/sections.
4. If Obsidian is open and live-vault inspection is useful, use Obsidian CLI for complementary navigation:

```bash
obsidian search query="<keyword or method>" limit=10
obsidian read path="papers/<paper-page>.md"
obsidian backlinks path="papers/<paper-page>.md"
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

Write-back proposals stay under `wiki/.drafts/proposals/`. They separate source facts, wiki synthesis, user ideas/decisions, uncertainty, and publish plan. Do not publish canonical synthesis directly from retrieval output.

## Retrieval Discipline

- Treat frontmatter as the machine-routing source of truth.
- Treat `paper.md` as the concise reading target.
- Prefer context packets over raw search dumps.
- Do not cite a paper only because its title matched; inspect the chosen section snippets.
- Distinguish source facts, wiki synthesis, and the user's own ideas.
- For coding tasks, always look for `Implementation Hooks`, `Mechanism`, and `Limitations / Uncertainty`.
- For evidence tasks, inspect `Evidence Map`, candidate claims, and provenance before relying on a claim.

## When Retrieval Is Weak

If `meridian wiki retrieve` returns no useful hits, try one narrower and one broader query. If it still fails, say the wiki has no strong match and identify what source or topic page should be added.
