# Recommendation Core

This folder owns paper recommendation as one replaceable Core domain.

- `service.ts` owns the bounded, fair project/direction scheduler, provider calls and writes.
- `index.ts` is the only cross-domain import surface.
- `types.ts` defines the provider-neutral boundary.
- `profile.ts` anchors one project to its topic/focus/active path, builds tight intent clusters and
  rotates non-core directions without allowing bridge papers to average unrelated ideas together.
  It also plans each direction's queries: one seed per query, so an external multi-positive query
  cannot average away the direction's main idea, taken in anchor order through every source.
- `merge.ts` round-robin merges per-intent results, deduplicates them and attaches structured reasons.
- `pool.ts` spreads one run's delivery cap evenly over its scopes and puts each scope's pooled
  candidates before the ones fetched this run.
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

Discovery also refreshes on its own: Background's schedule runs a global refresh once a project it
can refresh was last refreshed a day ago or never, and one discovery runs at a time, so a scheduled
refresh and a user's refresh never overlap. One refresh makes at most 12 provider calls globally and
at most 3 for one project.
Projects that have never been fetched, then the least-recently fetched projects, receive the budget
first. The persisted direction cursor always protects the anchored core direction while rotating
bounded secondary slots. This makes adding projects or directions increase refresh latency rather
than silently widening a query until its main idea disappears.

Each direction's cooldown is fingerprinted from its anchor seed and project-local negatives. An
unchanged fingerprint keeps the direction cooling for six hours unless the user force-refreshes. A
project whose selected directions are all cooling still moves its cursor on, so the next refresh
selects other directions. Provider failures are isolated per direction: successful siblings still
publish, failed directions do not advance the project cursor or freshness timestamp, and the next
refresh retries the same query before the project is treated as current.

When a direction becomes due, its single provider-call slot runs the next query of its rotation: its
seeds in anchor order, each through similarity, downstream citations, references and same-author
papers, and then all of them again one page further. arXiv pages with `start`, and Semantic
Scholar citations and references with `offset`; Semantic Scholar similarity and same-author papers
ignore the page. Each direction's rotation step is stored in `.meridian/discovery/progress.json`,
which versions before 0.0.19.0 never read; a direction without a step continues past the sources
older versions recorded in `state.json`. The rotation does not add a second scheduler or multiply the
12/3 call limits. Every accepted candidate freezes factual source provenance and any actually matched
Wiki term into structured recommendation reasons.

Candidates a run fetched beyond its cap stay in the project's pool in the same file, up to 60, and
the next run offers them before anything it fetches. A project whose pool already covers a whole run
is served from it without provider calls unless the user force-refreshes. One run's cap is split
evenly over its projects; the odd shares go first to the projects that have gone longest without one,
so no project takes the cap by its place in the list. A run that finds nothing left to deliver
anywhere in its scope, with nothing put off and nothing failed, says so in `nothingNew`, beside the
latest refresh time of its projects.
