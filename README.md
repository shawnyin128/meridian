# Meridian

Meridian is a Paper Wiki prototype. The first implemented path is one-paper
ingest:

```bash
meridian wiki ingest /path/to/paper.pdf --out wiki/.drafts/ingests/<paper-slug>/
```

The default command creates draft-only artifacts and does not publish canonical
wiki pages, update indexes, or run the later Research Dev Agent.

To exercise the confidence-gated wiki path, provide a wiki root and publish
mode:

```bash
meridian wiki ingest /path/to/paper.pdf \
  --out wiki/.drafts/ingests/<paper-slug>/ \
  --wiki-root wiki \
  --publish-mode auto
```

This publishes a canonical draft paper page when the quality gate does not fail,
updates `wiki/index.md` and `wiki/log.md`, and records whether the page still
needs review.

The preferred prototype path is the full flow:

```bash
meridian wiki flow /path/to/paper.pdf \
  --out wiki/.drafts/ingests/<paper-slug>/ \
  --wiki-root wiki \
  --rubric eval/rubrics/paper_wiki_quality_v0.md
```

This runs ingest, publishes a canonical draft when allowed, builds a bounded
LLM-as-Judge packet, and writes `flow.json`. After a judge produces JSON, record
and converge it:

```bash
meridian wiki judge-record wiki/.drafts/ingests/<paper-slug>/run.json judge-result.json
meridian wiki converge wiki/.drafts/ingests/<paper-slug>/run.json
```

To prepare an LLM-as-Judge input packet:

```bash
meridian wiki judge-pack wiki/.drafts/ingests/<paper-slug>/run.json \
  --rubric eval/rubrics/paper_wiki_quality_v0.md \
  --out wiki/.drafts/ingests/<paper-slug>/judge-packet.md
```

To run a JSONL evaluation set through the full flow and prepare one judge packet
per case:

```bash
meridian wiki eval eval/cases/paper_ingest_quality.example.jsonl \
  --out-dir eval/runs/<run-id>/ \
  --mode flow \
  --rubric eval/rubrics/paper_wiki_quality_v0.md
```

`--mode flow` writes per-case `flow.json`, `run.json`, `judge-packet.md`, a
case snapshot, and a shared draft wiki under `<out-dir>/wiki` unless `--wiki-root`
is provided.
