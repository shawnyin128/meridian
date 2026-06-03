---
type: development-handoff-packet
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_type: lab_idea_graph
confidence: medium
---

# Development Handoff Packet

## Active Thread / Node

## Wiki Context Used

## Development Question

## Evidence To Produce

- command:
- config:
- output:
- metric:
- validity criteria:

## Research Code Style

- Applies to exploratory research slice: yes | no
- Expected shape:
  - prefer one readable main flow when building a one-off calibration,
    dataset, probe, ablation, sanity-check, or eval path
  - keep source branches, configs, seeds, splits, metrics, sample limits, and
    output identity visible near the call site
  - avoid single-use parser/loader/selector helper layers unless they express
    real reuse, risky boundary isolation, or a stable external API
- Downstream acceptance criterion:

## Return To Lab

State what result would update the node, experiment evidence, or proposal.

## Boundary Notes

- Lab does not implement code, run tests, create commits, release, or converge.
- The coding workflow owns implementation/debug/test execution.
- Lab records returned evidence and handles Paper Wiki proposal boundaries.
