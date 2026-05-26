# Paper Wiki Workspace Config

Meridian separates the user's Paper Wiki library from the current shell window.
This matters for the common flow where a user opens Codex or Claude Code,
uploads a PDF, and asks Meridian to ingest it. The source should not remain tied
to a transient upload/download path.

## Layout

Initialize a workspace with:

```bash
meridian wiki init --library-root ~/MeridianPaperWiki
```

The library root contains:

```text
MeridianPaperWiki/
  meridian-wiki.json
  sources/
    sources.jsonl
    index.md
    papers/
    assets/
    notes/
  wiki/
    papers/
    syntheses/
    concepts/
    methods/
    claims/
    evidence/
    .drafts/
    .index/
```

`sources/` is the managed immutable source store. `wiki/` is the canonical
Markdown vault and Obsidian entry.

## User-Level Active Workspace

The init command records the active workspace at:

```text
~/.meridian/paper-wiki-workspaces.json
```

Set `MERIDIAN_CONFIG_HOME` to move that user config for tests or isolated
environments. Set `MERIDIAN_WIKI_WORKSPACE` or `MERIDIAN_LIBRARY_ROOT` to
override the active workspace for one process.

Discovery order:

1. Explicit `--library-root`.
2. Explicit `--wiki-root` for backward compatibility.
3. `MERIDIAN_WIKI_WORKSPACE` or `MERIDIAN_LIBRARY_ROOT`.
4. Nearest `meridian-wiki.json` found by walking upward from the current
   directory.
5. User-level active workspace.

## Ingest Behavior

After a workspace exists:

```bash
meridian wiki ingest /path/to/uploaded.pdf --publish-mode auto
```

Meridian copies the PDF into `<library-root>/sources/papers/`, records the
original path and SHA in `<library-root>/sources/sources.jsonl`, writes draft
artifacts under `<library-root>/wiki/.drafts/`, and publishes canonical pages
under `<library-root>/wiki/` when the requested publish mode allows it.

The original PDF is never mutated. Canonical wiki pages should point to the
managed source path.

For a Zotero export, pass the exported folder, commonly named `My Library`:

```bash
meridian wiki ingest-folder "/path/to/My Library" --publish-mode auto
```

Meridian recursively discovers PDFs, writes per-paper internal ingest runs under
`<library-root>/wiki/.drafts/ingests/batches/`, stores a `batch.json` summary,
and reports only the product-level batch status by default. The managed source
PDFs and canonical paper pages are the user-facing artifacts.

## Prompt And MCP Entries

The Prompt/Skill entry should ask for a library root on first use when no active
workspace exists. After that, Update Wiki workflows can ingest uploaded PDFs
without repeating paths.

The MCP server also defaults to the active workspace:

```bash
PYTHONPATH=src python3 -m meridian.mcp serve
```

Clients can still pass `wiki_root` per tool call when intentionally targeting a
specific vault.

## Compatibility

Legacy commands that pass `--wiki-root wiki` still work and use
`wiki/raw/sources/` unless that wiki root belongs to a configured workspace.
This keeps existing tests and local vaults usable while making workspace config
the product path.
