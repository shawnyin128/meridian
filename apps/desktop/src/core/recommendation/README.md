# Recommendation Core

This folder owns paper recommendation as one replaceable Core domain.

- `service.ts` owns the bounded, fair project/direction scheduler, provider calls and writes.
- `index.ts` is the only cross-domain import surface.
- `types.ts` defines the provider-neutral boundary.
- `profile.ts` anchors one project to its topic/focus/active path, builds tight intent clusters and
  rotates non-core directions without allowing bridge papers to average unrelated ideas together.
  It also selects one anchor-ranked representative per direction for provider retrieval, preventing
  an external multi-positive query from averaging away the direction's main idea.
- `merge.ts` round-robin merges per-intent results, deduplicates them and attaches structured reasons.
- `signals.ts` re-ranks one source response against the project anchor and read-only canonical Wiki
  topic/method memberships; it never writes recommendation state back into Wiki pages.
- `evaluation.ts` owns the inspectable offline metrics and stage-two quality gate.
- `providers/` contains external API adapters; the Semantic Scholar adapter normalizes similarity,
  citation, reference and same-author candidates behind one `RecommendationProvider` boundary.
- `scoring.ts` owns the ranking semantics shared by watch and discovery projections.
- `fixtures/` contains deterministic evaluation samples, not user knowledge or generated wiki pages.
- `EVALUATION.md` records reproducible sample construction and live-provider quality observations.

The renderer does not call providers and providers do not write the vault. Only the service publishes
provider-neutral results through the narrow `VaultStore` discovery methods. This keeps algorithm,
transport, persistence and presentation independently replaceable.

Stage two keeps intent labels and evaluation reports as derived App state. It does not publish them
as Paper Wiki topics or methods. A recommendation can read paper metadata, but merely retrieving,
ranking or rating a candidate never mutates the immutable source or canonical Wiki layer.

The discovery screen exposes those derived directions without duplicating recommendation logic. A
user can inspect their seed papers, set the core direction, disable or re-enable a direction, and
force-refresh one project. These preferences live in `.meridian/state.json`; the derived cluster
identity remains reproducible from project papers and feedback.

One explicit refresh makes at most 12 provider calls globally and at most 3 for one project.
Projects that have never been fetched, then the least-recently fetched projects, receive the budget
first. The persisted direction cursor always protects the anchored core direction while rotating
bounded secondary slots. This makes adding projects or directions increase refresh latency rather
than silently widening a query until its main idea disappears.

Each request is fingerprinted from the selected representative and project-local negatives. An
unchanged fingerprint is reused for six hours unless the user force-refreshes. Provider failures are
isolated per direction: successful siblings still publish, failed directions do not advance the
project cursor or freshness timestamp, and the next refresh retries them before the project is
treated as current.

When a core direction becomes due, its single provider-call slot rotates through similarity,
downstream citations, references and same-author papers, always choosing the least-covered source.
Secondary directions keep their slots on similarity retrieval. Source coverage is stored alongside
the existing request fingerprints, so stage three does not add an unbounded second scheduler or
multiply the 12/3 call limits. Every accepted candidate freezes factual source provenance and any
actually matched Wiki term into structured recommendation reasons.
