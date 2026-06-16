# Lab-First Positive Case Suite

This suite turns the research-project routing principle into concrete live
routing cases. It keeps the original 3 Lab-first positives and adds 30 more,
for 33 positive cases total.

## Principle Coverage

- Research ideas should enter Lab first, then check the research graph and
  Paper Wiki for related ideas and papers.
- Research coding should enter Lab first when it carries research meaning:
  Lab finds the node, checks Paper Wiki papers, checks open-source
  implementation hints when available, then hands off to normal coding.
- New ideas are recorded by Lab.
- Continuing a direction requires Lab to find the matching research node.
- Completed work, new ideas, and findings that attach to the research graph
  update or create the appropriate research node.
- Ongoing work is placed under the correct research node and updates node
  state, evidence, confidence, and next actions.

## Positive Cases

| Case | Risk Bucket | Expected Handoff | Core Expected Behavior |
|---|---|---|---|
| `lab-initialized-research-dev-preflight` | `code_grounding_required` | `normal_coding_workflow` | Find active node, check Paper Wiki, check open-source implementation hints, hand off probe implementation. |
| `lab-initialized-failure-analysis-preflight` | `research_state_continuity` | `lab` | Find experiment node, interpret regression, preserve evidence, hand off debug only after a concrete engineering action exists. |
| `setup-after-ready-code-boundary` | `code_grounding_required` | `normal_coding_workflow` | Setup is done; route probe through Lab, ground with wiki/code prior, then hand off coding. |
| `lab-positive-new-idea-placement` | `research_state_continuity` | `lab` | Record sudden idea, check existing graph and wiki, place or ask to create root node. |
| `lab-positive-continue-research-direction` | `research_state_continuity` | `lab` | Find the matching node for an existing research direction and restore state. |
| `lab-positive-completed-work-node-update` | `node_state_update` | `lab` | Attach completed probe result to the active research node. |
| `lab-positive-idea-attaches-existing-node` | `node_state_update` | `lab` | Attach a new related idea to an existing node without duplicating state. |
| `lab-positive-current-work-state-update` | `node_state_update` | `lab` | Move current work to the correct research node and update state rationale. |
| `lab-positive-approach-tree-expansion` | `wiki_grounding_required` | `lab` | Expand approach tree after node lookup and Paper Wiki grounding. |
| `lab-positive-baseline-selection` | `wiki_grounding_required` | `lab` | Choose baselines from node context and related paper prior. |
| `lab-positive-eval-protocol-design` | `wiki_grounding_required` | `lab` | Design eval protocol from hypothesis node and wiki prior. |
| `lab-positive-bug-vs-research-signal` | `research_state_continuity` | `lab` | Decide whether a regression is implementation bug or research signal. |
| `lab-positive-next-experiment-plan` | `node_state_update` | `lab` | Use previous runs to update next experiment plan. |
| `lab-positive-prune-dead-approach` | `node_state_update` | `lab` | Decide whether an approach node should be dead, paused, or continued. |
| `lab-positive-revive-old-node-from-paper` | `wiki_grounding_required` | `lab` | Use a new wiki paper to evaluate reviving an old node. |
| `lab-positive-run-evidence-record` | `node_state_update` | `lab` | Record run result and metric tradeoff as local experiment evidence. |
| `lab-positive-metric-definition` | `wiki_grounding_required` | `lab` | Define primary/secondary metrics from hypothesis node and paper prior. |
| `lab-positive-probe-observation-plan` | `code_grounding_required` | `lab` | Define probe observations using wiki and open-source implementation grounding before any later implementation handoff. |
| `lab-positive-leakage-check` | `research_state_continuity` | `lab` | Check suspicious benchmark gain for leakage or invalid eval. |
| `lab-positive-paper-grounded-feasibility` | `wiki_grounding_required` | `lab` | Use Paper Wiki to judge active idea feasibility and contradictions. |
| `lab-positive-related-work-risk` | `wiki_grounding_required` | `lab` | Assess whether related work already covers the idea. |
| `lab-positive-method-prior-code-check` | `code_grounding_required` | `lab` | Before coding, find similar method papers and public implementation hints. |
| `lab-positive-failed-path-comparison` | `research_state_continuity` | `lab` | Compare failed approach nodes using evidence and wiki prior. |
| `lab-positive-local-finding-proposal` | `node_state_update` | `lab` | Decide whether a local finding stays attached to the node or becomes a wiki proposal later. |
| `lab-positive-handoff-after-plan` | `code_grounding_required` | `normal_coding_workflow` | Organize Lab context and produce a precise coding handoff. |
| `lab-positive-experiment-return-contract` | `development_handoff` | `normal_coding_workflow` | Define the evidence contract coding must return. |
| `lab-positive-active-node-context-loss` | `research_state_continuity` | `lab` | Recover active-node context, decisions, evidence, and wiki grounding. |
| `lab-positive-conflicting-evidence` | `node_state_update` | `lab` | Reconcile conflicting runs and update node confidence/state. |
| `lab-positive-hypothesis-refinement` | `node_state_update` | `lab` | Refine hypothesis from failed result while preserving lineage. |
| `lab-positive-benchmark-selection` | `wiki_grounding_required` | `lab` | Select validation benchmarks from related paper prior. |
| `lab-positive-implementation-scope` | `code_grounding_required` | `normal_coding_workflow` | Define minimal research-scoped implementation and code grounding before handoff. |
| `lab-positive-result-to-next-action` | `node_state_update` | `lab` | Convert a metric tradeoff into node state and next research action. |
| `lab-positive-writeback-boundary` | `node_state_update` | `lab` | Decide whether a Lab finding stays local or becomes a future wiki proposal. |

## Current Local Deterministic Check

The deterministic asset test now requires at least 30 positive
`lab_first_preflight` cases, all tagged with:

- `suite: lab_first_routing`
- `polarity: positive`
- a risk bucket such as `wiki_grounding_required`, `code_grounding_required`,
  `research_state_continuity`, or `node_state_update`

## Live Codex Results

Initial live run before the Research Project Grounding Gate:

- run: `eval/runs/codex-routing-0.6.0-positive-33`
- total cases: 33
- passed: 18
- failed: 15
- pass rate: 0.545
- main failure mode: Codex selected `lab` correctly, but labeled many
  idea/node/evidence/state cases as `lab_idea_graph` instead of
  `lab_first_preflight`, which meant the evaluation prompt had not made the
  research-project grounding principle explicit enough.

After adding the Research Project Grounding Gate and tightening the live
routing prompt:

- run: `eval/runs/codex-routing-0.6.0-positive-33-after-grounding`
- total cases: 33
- passed: 33
- failed: 0
- pass rate: 1.0
- risk bucket pass rates:
  - `code_grounding_required`: 6/6
  - `wiki_grounding_required`: 8/8
  - `research_state_continuity`: 7/7
  - `node_state_update`: 11/11
  - `development_handoff`: 1/1
