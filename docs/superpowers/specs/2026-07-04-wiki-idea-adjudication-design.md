# Paper Wiki: Idea-to-Literature Adjudication — Design

- Date: 2026-07-04
- Status: approved — ready for implementation planning (Phase 0 first)
- Active vault: `D:\research\paper-wiki` (papers 283, methods 356, topics 151, concepts 29, claims 1135, evidence 2737, syntheses 61)
- Scope of this spec: Phase 0 (eval) + Phase 1 (retrieval adjudication slice). Phase 2 (stance extraction) is sketched and **deliberately deferred** — it cannot be responsibly specified until Phase 0 produces numbers.

---

## 1. Problem

The user's actual use of the Paper Wiki is **not paper retrieval**. It is:

> "I come with my own research idea, and I want the wiki to be a safety net / a knowledgeable advisor — tell me (a) what's already been done so I don't repeat it, (b) what's been **proven not to work** so I don't step on the mine, and (c) where my insight is **corroborated** by a paper."

This is **idea-to-literature adjudication**: match a user-stated idea against the space of what the literature *claims and found*, split by **epistemic stance**.

The current system is structurally mismatched to this on two axes, confirmed by reading the code:

1. **Extraction is stance-blind.** In `src/meridian/wiki/model.py`, `claim_type` values are provenance categories (`source_claim`, `extraction_gap`, `source_quality_gap`) — never epistemic polarity. Negative / refuted / abandoned findings are captured only where a paper was **hand-coded** (see the per-paper limitation strings around `model.py:3428–3665`); otherwise the extractor punts (`model.py:3718` "Limitations were not explicit"). **So for any non-curated paper, the "proven not to work" signal is largely absent from the corpus.**

2. **Retrieval cannot bridge a positive query to a negative page.** In `src/meridian/wiki/corpus.py`, the `Contradictions` / `Contradicting Evidence` / `Failure Modes` sections are weighted, but they are only boosted when the **query** contains negative intent words (`corpus.py` intent lexicon: `contradict/negative/counter → Contradicting Evidence`). A positively-phrased idea ("I want to use X for Y") contains no negative words, so BM25 + the hand-tuned lexicon will **never surface "X was shown not to work."** The `contrast_settings` mechanism is hard-coded to a single case (weight-only vs weight-activation quantization).

Net: the system is **assertion-oriented** (positive contributions); the use case is **adjudication-oriented** (avoid-the-negative + corroborate). The "stance" axis the use case runs on does not exist end-to-end.

### Why not "fix quality first"

The system already scores high on its **own** quality metrics (100% claim→evidence, source-fidelity gate, 5-dimension health at usable/excellent, 92.8% retrieval recall) yet is nearly useless for this use case — because those metrics measure a quality definition that doesn't serve adjudication. "Fix quality first" would pour more effort into the wrong definition (this is structural weakness #4: over-invested measurement, under-invested intelligence). Instead: **let the use case define quality, build the eval that measures *that*, then fix foundation only along the axis the eval shows is broken.**

---

## 2. Goals / Non-Goals

### Goals
- Given a free-text research idea, return three clearly separated buckets:
  - **PRIOR-WORK** — someone already did approximately this (novelty/repeat risk).
  - **REFUTED** — evidence this direction was tried and failed / shown not to work (the mine).
  - **CORROBORATING** — independent evidence that supports the user's specific insight.
- Make the safety net **honestly calibrated**: when corpus coverage for an idea is thin, say so, loudly. A safety net that is silently full of holes is worse than none.
- Establish a **task-grounded eval** whose headline number is **refute-recall@k** (of the corpus's idea-killing evidence, how much do we surface), plus coverage calibration.

### Non-Goals (YAGNI — explicitly out of scope)
- **Not** re-extracting the whole corpus or replacing the heuristic pipeline wholesale (Phase 2 is narrow and eval-gated).
- **Not** improving the concept seed catalog / prerequisite layer (that serves the *implement/reproduce* use case, not this one — structural weakness #2, deferred).
- **Not** adding new health/audit dimensions (weakness #4 — actively stop adding here).
- **Not** a general semantic search engine. Only idea→literature adjudication.
- **Not** building an embedding index in Phase 1 unless the eval proves query-expansion is insufficient.

---

## 3. North-star metric (the reframe)

Replace the current headline (paper keyword recall@1 = 92.8%, which measures "find a paper using its own keywords" — circular and optimistic) with:

- **Refute-recall@k** — primary. Over a labeled set of ideas, of the corpus items that genuinely contradict/kill an idea, what fraction appear in the top-k REFUTED bucket. High-cost false negatives live here.
- **Prior-work recall@k** — of the corpus items that constitute prior work for an idea, fraction surfaced.
- **Coverage calibration** — when the system reports "low coverage," is that honest (does a held-out check confirm the corpus really is thin there)? Measured as calibration error between reported-confidence and actual-recall.
- **Precision / noise** — secondary; adjudication tolerates some over-retrieval (user is scanning a safety net), but not so much that REFUTED becomes unreadable.

---

## 4. Architecture — three phases, eval-first

```
Phase 0  Adjudication eval harness        <- build FIRST; it is the quality bar
   |        (labeled idea -> {prior-work, refuted, corroborating} items)
   v
Phase 1  Idea-adjudication retrieval mode  <- thin vertical slice over EXISTING corpus
   |        (query expansion + stance-aware multi-query + 3-bucket output + calibration)
   v        measure against Phase 0
Phase 2  Stance/polarity extraction        <- DEFERRED; build only where Phase 0 shows holes
            (add `polarity` to claim records; incremental LLM pass over existing papers)
```

The ordering is the whole point: Phase 1 runs over the corpus as-is and the eval tells us exactly how much of the REFUTED bucket is missing because of *retrieval* vs missing because of *extraction*. That split decides the size and shape of Phase 2.

---

## 5. Phase 0 — Adjudication eval harness (detailed)

**Where:** extend the existing eval area (`eval/runs/…` already hosts `retrieval_audit`). New harness: `eval/adjudication/`.

**Eval item schema** (one JSONL record per labeled idea):
```json
{
  "id": "adj-0001",
  "idea": "Free-text research idea in the user's own phrasing.",
  "domain": "optional tag",
  "expected": {
    "prior_work":   ["wiki/papers/...", "wiki/methods/..."],
    "refuted":      ["wiki/evidence/...", "wiki/claims/...", "wiki/papers/...#Limitations"],
    "corroborating":["wiki/claims/...", "wiki/evidence/..."]
  },
  "coverage_truth": "rich | thin | none",
  "label_source": "bootstrap | hand"
}
```

**How to get labels without a huge annotation project (bootstrap-first):**
1. **Bootstrap from existing structure.** The schema already has `contradicts` / `limits` on evidence, `Contradictions` sections on topics, `Failure Modes` on methods, `Limitations / Uncertainty` on papers. Programmatically mine these to generate candidate `(idea, refuted-item)` pairs: take a page's stated limitation/contradiction, and phrase the *positive* idea it argues against as the eval `idea`. This yields a first REFUTED-labeled set cheaply.
2. **Small hand-labeled gold set.** The user contributes ~20–40 real ideas from their own research (exactly the situations they'd want the advisor for), each hand-labeled with the items they'd consider a correct hit. This is the trustworthy core; the bootstrap set is the volume.
3. **Negative-space items.** Deliberately include ideas the corpus does **not** cover, labeled `coverage_truth: none`, to test that the system says "I don't have this" rather than hallucinating comfort.

**Metrics module** computes refute-recall@k, prior-work recall@k, corroborating recall@k, coverage-calibration error, and a per-idea breakdown. Output: `eval/adjudication/runs/<date>/summary.md` (same durable-Markdown convention as the existing audits).

**Corpus (confirmed):** the real corpus lives at `D:\research\paper-wiki` (**not** in this repo — this repo's knowledge audit shows papers=1, `Isolated-Paper.md`). Verified accessible with 283 papers, 1135 claims, 2737 evidence, 356 methods, 151 topics, 29 concepts, 61 syntheses. Phase 0 and Phase 1 run against this vault via `wiki_root`.

---

## 6. Phase 1 — Idea-adjudication retrieval mode (detailed)

### Interface
A new operation, surfaced as an MCP tool `meridian.adjudicate` (sibling of `context`/`read`/`trace` in `src/meridian/mcp/adapter.py`) and a `commands`-level entry so it is CLI-runnable and eval-drivable.

- **Input:** `idea` (free text, required), `wiki_root` (optional), `top_k` per bucket (default 6).
- **Output:** structured JSON + a Markdown packet with three labeled sections:
  - `PRIOR-WORK` — "someone already did ~this"
  - `REFUTED` — "evidence this doesn't work"
  - `CORROBORATING` — "evidence your insight holds"
  - plus a `COVERAGE` header: an explicit honesty signal (`rich | thin | none`) with the reasoning ("matched N papers across M methods; contradiction pages sparse in this area").

Each item carries provenance (source paper, section, page) reusing the existing `trace` fields — the advisor must be auditable, consistent with the four-boundary contract.

### Retrieval unit
Not whole papers. The unit is **claim / evidence / failure-mode / limitation** records (they already exist as pages/records: `wiki/claims/`, `wiki/evidence/`, methods' `Failure Modes`, papers' `Limitations`). Adjudication is a statement-level operation.

### Semantic mechanism — **DECISION (recommended default; confirm in review)**
The core difficulty is bridging a **positively-phrased idea** to a **negatively-phrased page**. Three options, ordered by how well they preserve the deterministic / lightweight moat:

- **[RECOMMENDED] Option 3 — LLM query expansion at call time.** The agent (already an LLM, no new dependency) rewrites the idea into: paraphrases, likely method/term names, and **explicit negations / failure phrasings** ("X fails when…", "X does not improve…", "ablation removing X hurts…"). Run several BM25 queries (reuse `corpus.retrieve_papers` v1), union + stance-tag the hits. The **index stays deterministic and git-friendly**; semantics live in the query layer. Cheapest, most aligned with the architecture.
- **Option 1 — Local pinned embedding model.** Precompute vectors at index-build time into `.index/`, cosine + BM25 fusion. Preserves offline/reproducible, but adds a heavy model dependency to a currently pure-Python system (tension with "lightweight").
- **Option 2 — Embedding API.** Best recall, but adds a network/service dependency + per-query cost and breaks the offline-deterministic property (their moat).

**Plan:** ship Option 3 in Phase 1. If Phase 0 shows Option 3's refute-recall is insufficient *and* the gap is retrieval-bound (not extraction-bound), escalate to Option 1 as a documented, eval-gated follow-up. Do not pay the embedding dependency on faith.

### Stance tagging in Phase 1 (pre-extraction)
Until Phase 2 adds a real `polarity` field, stance is assigned heuristically at query time from **where** a hit came from + light cues: hits from `Contradictions`/`Failure Modes`/`Limitations`/`contradicts`/`limits` → REFUTED candidate; hits from method/paper contribution sections overlapping the idea → PRIOR-WORK; hits that affirm the idea's specific mechanism → CORROBORATING. This is intentionally provisional — Phase 0 will quantify how leaky it is, which is the signal for Phase 2.

### Composition with existing retrieval
`adjudicate` builds on `retrieve_papers` (v1) rather than replacing it; the existing `context` tool and its 92.8% eval are untouched. This is additive and reversible.

---

## 7. Phase 2 — Stance/polarity extraction (sketch, DEFERRED)

Only specified enough to show the arc; **not** to be built until Phase 0 numbers justify it and show the gap is extraction-bound.

- Add `polarity: supports | refutes | abandoned | mixed | unknown` to the claim candidate schema (`claim_candidate.v0` → `.v1`) and to promoted claim/evidence pages.
- Run an **incremental LLM pass over already-ingested papers** (not a full re-ingest): read paper source text + existing extracted records, emit stance-typed claims, especially mining ablation tables and limitations for "tried and failed" findings as first-class REFUTED evidence.
- Feed these back into Phase 1's REFUTED bucket, replacing the provisional heuristic stance tagging.
- Respects existing discipline: proposal-first, source-provenance preserved, source-fidelity gate unchanged.

The exact size (all 283 papers vs the subset where Phase 0 shows holes) is a Phase-0 output, not a guess made now.

---

## 8. Decisions (resolved 2026-07-04)

1. **Semantic mechanism for Phase 1** — ✅ **Option 3, LLM query expansion.** Embeddings remain a documented, eval-gated escalation only.
2. **Eval corpus access** — ✅ **`D:\research\paper-wiki`**, verified accessible (§5).
3. **Gold-set size** — ✅ ~20–40 hand-labeled real ideas from the user as the trustworthy core; bootstrap set carries volume. (User contributes the ideas during Phase 0.)

---

## 9. Risks

- **Garbage-in / false comfort.** If extraction lacks the negative signal, a slick 3-bucket UI can *look* authoritative while REFUTED is empty for the wrong reason. Mitigation: the COVERAGE honesty signal is a first-class output, and Phase 0's negative-space items (`coverage_truth: none`) directly test for false comfort.
- **Provisional stance leakage (Phase 1).** Heuristic stance tagging will mislabel some hits. Mitigation: Phase 0 measures it; it's a stopgap, not the destination.
- **Dependency creep vs the moat.** Escalating to embeddings would compromise offline-determinism. Mitigation: it's eval-gated, not default.
- **Labeling burden.** Bootstrap set carries volume so the user's hand-labeling stays small.

---

## 10. Testing strategy

- Unit: query-expansion produces negation/failure variants; stance tagger routes known section origins to the right bucket; coverage signal thresholds.
- Integration: `adjudicate` end-to-end on a fixture vault (a handful of synthetic papers with planted prior-work / refuted / corroborating items) → asserts each lands in the right bucket and that a planted `none`-coverage idea reports thin coverage.
- Eval: Phase 0 harness run over the real vault; refute-recall@k is the gate for deciding Phase 2.

---

## 11. Open questions

- Should PRIOR-WORK and CORROBORATING be merged when the same paper both did it and thus supports the insight, or kept distinct with a cross-reference? (Lean: distinct, cross-referenced — they answer different user questions: "am I scooped?" vs "is my hunch right?")
- Does the user want write-back — i.e., when adjudication finds a strong corroboration/refutation, propose a durable synthesis page? (Lean: yes, but as an opt-in follow-up, reusing the existing proposal-first path; out of scope for Phase 1.)
```
