# Wiki Write-back and Synthesis Layer

The write-back layer turns useful retrieval work into durable wiki artifacts without publishing unreviewed chat answers as facts.

## Product Boundary

Retrieval answers a question for the current interaction. Write-back preserves the parts that should compound:

- a synthesis across retrieved papers
- a comparison between method families
- a method-family reading plan
- a research decision with explicit evidence
- an open research question with source context

The MVP is proposal-first. `propose-writeback` writes drafts under `wiki/.drafts/proposals/`; `publish-proposal` is a separate command gated by `proposal-lint`.

## Proposal Flow

1. Retrieve context:

```bash
meridian wiki retrieve "<research intent>" \
  --wiki-root wiki \
  --strategy v1 \
  --out wiki/.drafts/retrieval/<slug>/context.md \
  --json-out wiki/.drafts/retrieval/<slug>/context.json
```

2. Create a write-back proposal:

```bash
meridian wiki propose-writeback \
  --wiki-root wiki \
  --query "<research intent>" \
  --context wiki/.drafts/retrieval/<slug>/context.json \
  --title "<synthesis title>" \
  --proposal-type synthesis \
  --user-note "My current interpretation or decision."
```

Supported proposal types:

- `synthesis`
- `comparison`
- `method-family`
- `decision`
- `research-question`

The command writes:

```text
wiki/.drafts/proposals/<proposal-slug>/
  proposal.md
  proposal.json
  source_context.json
  publish_plan.md
```

3. Lint before publishing:

```bash
meridian wiki proposal-lint wiki/.drafts/proposals/<proposal-slug>/proposal.json \
  --wiki-root wiki
```

4. Publish after lint passes:

```bash
meridian wiki publish-proposal wiki/.drafts/proposals/<proposal-slug>/proposal.json \
  --wiki-root wiki
```

This writes `wiki/syntheses/<proposal-slug>.md`, updates `wiki/index.md`, appends to `wiki/log.md`, and rebuilds `wiki/.index/syntheses.jsonl`.

## Canonical Synthesis Schema

Published synthesis-layer pages use the same section contract across page types:

- `What This Page Is For`
- `Source Facts`
- `Wiki Synthesis`
- `User Ideas / Decisions`
- `Evidence Map`
- `Open Questions`
- `Retrieval Hooks`
- `Publish / Review Notes`

Required frontmatter:

- `type`
- `title`
- `status`
- `created`
- `updated`
- `proposal_id`
- `query`
- `source_papers`
- `source_sections`
- `source_context`
- `user_inputs`
- `confidence`
- `review_state`
- `tags`
- `aliases`
- `topics`
- `methods`
- `related`

## Boundary Contract

`Source Facts` are facts copied or extracted from retrieved wiki pages and source artifacts. They need provenance.

`Wiki Synthesis` is the current interpretation across sources. It may infer relationships, but it is not a paper claim unless the source fact section supports it.

`User Ideas / Decisions` contains user notes, hypotheses, preferences, and decisions. These must never be attributed to paper authors.

`Open Questions` contains uncertainty, missing source checks, and weak retrieval signals.

Source-quality holds are allowed in proposals only as cleanup/provenance context. They cannot be promoted as scientific evidence.

## Retrieval Integration

`meridian wiki catalog --wiki-root wiki` now builds both:

- `wiki/.index/papers.jsonl`
- `wiki/.index/syntheses.jsonl`

`meridian wiki retrieve` loads both catalogs by default and marks each result with its result type. This lets future queries retrieve both original paper pages and higher-level synthesis pages.

## Obsidian Usage

Open `/Users/shawn/Desktop/meridian/wiki` as the vault. Published synthesis pages live under `syntheses/` and link back to their source paper pages with wikilinks, so Obsidian backlinks/graph can show how papers support a durable synthesis.

## Future MCP Surface

The MCP delivery layer should expose these surfaces without changing the Markdown source of truth:

- `search` / `context`: return retrieval packets over papers and syntheses
- `read`: read a canonical wiki page
- `propose`: create a draft write-back proposal
- `validate`: run proposal lint
- `apply`: publish a lint-passing proposal with explicit overwrite control

MCP should preserve propose/apply separation.
