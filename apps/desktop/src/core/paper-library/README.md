# Paper library Core

This domain owns PDF admission, bibliographic metadata extraction, paper-page updates, table column
rules, search/faceting, and personal reading state.

Raw PDF bytes remain immutable under the vault source layer. Paper pages and reading state are
changed only by Core stores through the domain's provider-neutral functions. Other domains import
paper-library behavior through `index.ts`; `metadata/` is private implementation detail.
