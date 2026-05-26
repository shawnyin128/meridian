# Wiki Health Model

Version: `0.2.0`

`meridian wiki health` answers whether a Paper Wiki is usable, trustworthy, and
repairable without calling an LLM in the default path.

## Command

```bash
meridian wiki health --wiki-root wiki --repair-plan
```

To enable the HTML report's **Run Check** button, start the local bridge:

```bash
meridian wiki health-ui --wiki-root wiki
```

The bridge binds to `127.0.0.1:8765` by default. It exposes only the wiki
health run/status endpoints and uses a single-flight lock, so repeated clicks
while a check is running return "already running" instead of launching duplicate
checks.

Default outputs:

```text
wiki/.index/wiki-health.json
wiki/.index/wiki-health.md
wiki/.index/wiki-health.html
wiki/.drafts/health/<run>/repair-plan.md   # only with --repair-plan
```

## Health Levels

- `excellent`: strong health and no meaningful repair queue.
- `usable`: ready for daily use with low residual risk.
- `usable_with_warnings`: daily-use ready, but has clear repair priorities.
- `degraded`: usable only with caution.
- `blocked`: hard failure or very low score.

## Dimensions

Each dimension has a summary score and expandable subdimension scores.

| Dimension | Meaning |
|---|---|
| Trust | Source safety, provenance, and source-fact/user/synthesis boundaries. |
| Surface | Canonical page cleanliness and product artifact boundaries. |
| Context | Retrieval usefulness for research, coding, evidence, and synthesis tasks. |
| Graph | Method/topic/concept/claim/evidence connectivity and density. |
| Growth | Repair queue, synthesis evolution, and proposal/revision readiness. |

## Scoring Contract

The default score is deterministic and model-versioned.

- Missing managed source: fixed deduction and hard-fail candidate.
- SHA mismatch: fixed deduction and hard-fail candidate.
- Source-quality contamination: hard fail.
- Draft/version catalog leakage: hard fail.
- Duplicate method/topic aliases: bounded graph deduction.
- Missing prerequisite concept links: proportional graph/context deduction.
- Claim without evidence: bounded traceability deduction.
- Evidence without source provenance: provenance deduction and hard-fail candidate.

Scores should only be compared across runs with the same
`health_model_version`.

## Agent Use

Health does not repair the wiki. It produces a repair queue. Agents should only
consume the top repair candidates, generate proposals when content judgment is
needed, and rerun health to compare deltas.
