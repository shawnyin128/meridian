---
type: "method"
title: "recurrent transformer"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Dehghani-et-al-2019-Universal-Transformers.md"
source_papers:
  - "papers/Dehghani-et-al-2019-Universal-Transformers.md"
related_papers:
  - "papers/Dehghani-et-al-2019-Universal-Transformers.md"
related_methods:
related_topics:
  - "transformer architecture"
  - "recurrent computation"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-6789199ca2"
---
# recurrent transformer

## What It Is

This is a compiled method-family page for `recurrent transformer`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Dehghani-et-al-2019-Universal-Transformers|Dehghani et al. - 2019 - Universal Transformers]]: ### Dehghani et al. - 2019 - Universal Transformers - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/runtime tradeoff. - Operates on: token embeddings; query/key/value proj...

## Used By Papers

- [[papers/Dehghani-et-al-2019-Universal-Transformers]]

## Implementation Hooks

- [[papers/Dehghani-et-al-2019-Universal-Transformers|Dehghani et al. - 2019 - Universal Transformers]]: - Dehghani et al. - 2019 - Universal Transformers: Unit test attention mask, positional bias shape, Q/K/V projection shapes, and sequence-length extrapolation cases. - KV-cache: Verify K/V tensor shapes, position indices...

## Failure Modes

- [[papers/Dehghani-et-al-2019-Universal-Transformers|Dehghani et al. - 2019 - Universal Transformers]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...

## Evidence

- [[papers/Dehghani-et-al-2019-Universal-Transformers|Dehghani et al. - 2019 - Universal Transformers]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/State-reuse-dynamics|State reuse dynamics]]
- [[concepts/Position-encoding-extrapolation|Position encoding extrapolation]]
