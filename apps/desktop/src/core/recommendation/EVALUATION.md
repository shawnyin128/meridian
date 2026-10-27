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

## Scope-model gate (v0.0.23.0)

`gate.test.ts` measures the scope model offline on `fixtures/feed-gate.ts`, built on the owner's
sample: the five seeds split into the Draft-OPD direction (core, three seeds) and the knowledge
distillation direction (two seeds); 15 retrieved candidates with titles and abstracts; the 7 the user
later added as held-out relevance labels (Osprey, DistillSpec, Online Speculative Decoding, EAGLE,
GKD, MiniLLM, DistiLLM); 4 more on the project's subjects the user left; and off-topic retrieved
papers (Meltdown, two entanglement-distillation papers). Random negatives come from a quantization
project and a generative-models watch.

Each path is scored once: the API path with every paper's vector, the fallback with no key. The
gate fails when:

| Measure | Threshold | Why |
|---|---|---|
| precision@5 per path | 0.6 | A ranking that knows only which candidates are on topic averages 7/11 = 0.64: 3 of the top 5. |
| nDCG@10 per path | 0.8 | The same topic-only ranking averages 0.79. |
| overlap@10 of the paths, per direction | 0.8 | At most 2 of the top 10 cards change when the path switches; a random top 10 of 15 holds 6.7. |
| fallback nDCG@10 against the API ranking | 0.8 | Past the middle between a random order's 0.55 and 1; the API's first paper gains 10, its tenth 1. |
| Spearman's ρ of the paths | 0.5 | 0 for unrelated scores. |

The baselines are computed in the test itself. On stub vectors the API path reaches precision@5
0.6 and nDCG@10 0.92, the fallback 1.0 and 0.995; the gap is overlap@10 0.9 and 0.8, nDCG@10 0.89
and 0.83, ρ 0.72 and 0.68.

The gate also requires that off-topic retrieved candidates score below 0.5 on both paths, in this
refresh and in one where the distillation direction retrieved GKD and three off-topic papers, and
that every added paper scores 0.5 or more. Without a key, Osprey is delivered through the service.

**Known limit.** Spectre shares only the word "speculative" with the Draft-OPD seed, as Osprey does,
and TF-IDF gives it the higher score, so no calibration can drop Spectre below 0.5 on the fallback
while delivering Osprey. The gate checks it on the API path only.

**Vectors.** `fixtures/feed-gate-vectors.ts` holds stub SPECTER2-shaped vectors (768 numbers, a
shared offset plus subject directions) until `FROZEN_SPECTER2` is filled from one capture run
(`outputs/review/v0.0.23.0/feed/capture-vectors.mjs`, with the owner's OK, on `GATE_PAPER_IDS`).
With stub vectors the API path's numbers measure the stub's construction, not SPECTER2.

## Live measures

Core's log gets, per refresh and per scope:

- `[feed] measures <scope> path=<api|fallback|none>`: the cards that path scored last, how many show,
  how many were added, dismissed or marked known, the rates, owned papers still shown (an `error`
  line when not 0), and each direction's share of the cards shown;
- `[feed] gap <scope>`: on every API run, overlap@10, the fallback's nDCG@10 against the API ranking
  and Spearman's ρ;
- `[feed] fallback reason=<reason>`: a refresh that left the API (`warn`, `error` for `auth`).

`node scripts/feed-report.mjs [--logs <dir>] [--since <date>] [--until <date>]` prints them over a
period; the counts are cumulative, so a period counts the change from the last refresh before it to
its own last refresh.
