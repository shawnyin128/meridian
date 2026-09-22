# Project discovery evaluation

Evaluated on 2026-09-17. Offline samples are metadata-only fixtures: they do not download source
PDFs, generate Wiki pages, or mutate the durable knowledge layer.

## Product-owner sample

Five supplied papers seed one project profile:

- `2605.29343` Draft-OPD
- `2604.14084` TIP
- `2605.26844` Token Teachability
- `2510.15982` AMiD
- `2505.04560` ABKD

`2609.09338` Osprey is held out as an unseen, relevant speculative-drafter candidate.

Core splits the five papers into two complete-link directions: three OPD/token-teachability papers
and two general knowledge-distillation papers. The project anchor makes the Draft-OPD direction
core. The complete cluster remains inspectable, but retrieval uses its anchor-ranked representative
paper rather than sending every member as an equally weighted positive seed.

## Live provider observation

Semantic Scholar was queried live on 2026-09-17 with a top-20 limit:

- all three OPD papers together returned 20 strongly OPD-oriented candidates, but Osprey was absent;
- Draft-OPD alone returned 20 speculative-decoding candidates and placed Osprey at rank 8;
- AMiD alone returned 20 broader knowledge-distillation candidates, preserving the secondary
  direction instead of mixing it into the speculative-drafter query.

This comparison caught a second averaging failure inside an otherwise coherent cluster. Stage two
therefore uses multiple papers to establish and explain a direction, then one project-aligned
representative to query the current provider. Stored reasons name only the seed actually sent. Live
API output remains observational and is intentionally not committed as a mutable snapshot.

## Deterministic quality gate

The offline gate measures candidate recall, project relevance, novelty, reason correctness,
direction diversity, and negative-feedback responsiveness. The regression corpus covers:

1. the owner-supplied OPD/general-KD split and held-out Osprey flow;
2. RAG versus molecular graph retrieval inside one project;
3. post-training quantization versus parameter-efficient fine-tuning;
4. one coherent causal-representation direction that must not be over-split;
5. a bridge paper that must not merge unrelated endpoints.

`service.test.ts` additionally verifies project-local negative feedback, exact representative-seed
explanations, request cooldown, forced refresh, per-direction failure isolation, retry priority,
and the 12-call global fairness budget. `STAGE_TWO_THRESHOLDS` is the explicit regression gate.

## Scale, control, and recovery gate

- one refresh makes at most 12 provider calls globally and at most 3 for one project;
- never-fetched and least-recent projects receive budget first;
- the core direction is protected while secondary directions rotate;
- users can set a different core direction or disable a direction, with preferences persisted only
  in App state;
- an unchanged direction request is cooled down for six hours unless explicitly forced;
- a failed direction does not discard successful siblings and remains eligible for the next retry;
- project deletion, feedback, and direction controls stay project-local.

These guarantees make a larger workspace increase coverage latency instead of query width, request
volume, or cross-project leakage.

## Stage three source and knowledge-signal gate

Stage three keeps the same 12-call global and 3-call project budgets. For an unchanged core
direction, deterministic tests verify this sequence across due or forced refreshes:

1. semantic-similarity recommendations;
2. downstream citations;
3. references;
4. same-author papers.

An ordinary repeat inside the six-hour cooldown makes no request. Secondary directions stay on the
similarity source, so source exploration cannot consume an additional slot or replace another
project's turn. The provider fixture tests cover the three Academic Graph response shapes, arXiv
normalization, author-branch interleaving, and one-HTTP-request routing per provider call.

Canonical topic and method memberships from project-linked Paper Wiki pages are projected into the
project profile read-only and retained on their exact seeds. Candidate ranking combines the
explicit project anchor, the single representative seed, provider relevance, and memberships from
that intent only. Tests verify that another direction's Wiki terms cannot leak into this one, that
only terms truly present in a candidate become a stored `wiki` reason, and that the source becomes a
stored `source` reason. Recommendation, feedback, source coverage, and reasons remain App state; no
test writes a recommendation signal into a Wiki page.
