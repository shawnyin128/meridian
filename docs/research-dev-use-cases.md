---
type: product-design
title: "Lab Idea Graph Use Cases"
status: draft
created: 2026-05-21
updated: 2026-06-03
tags:
  - lab
  - idea-graph
  - llm-wiki
  - mcp
  - use-cases
confidence: medium
---

# Lab Idea Graph Use Cases

Lab is Meridian's idea-graph product surface. It is not a coding agent and does
not own implementation, debugging, tests, commits, release, or convergence. Lab
uses Paper Wiki to ground research ideas, keeps `.meridian/` state in the
target repo, and hands off code work to the user's normal coding workflow.

## Product Boundary

Paper Wiki owns long-term compiled knowledge: papers, methods, concepts,
claims, evidence, syntheses, user insights, retrieval context, and proposal-first
write-back.

Lab owns local research exploration state:

- Research Threads
- Approach Nodes
- Research Prior blocks
- Experiment evidence
- Finding Proposals
- Lab Context Packets
- Development Handoff Packets
- Wiki Transfer Packets
- User Coding Style Principles for development handoffs

The two products communicate through MCP and explicit artifacts. Lab should
consume Paper Wiki through `meridian.context`, `meridian.read`, and
`meridian.trace` whenever research context matters. Lab should write back
through `meridian.propose` and `meridian.apply`, not by silently editing
canonical wiki pages.

## Scenario 1: Idea Placement

Use when the user shares a new idea, intuition, hypothesis, or side direction.

Workflow:

1. Preserve the raw idea.
2. Check existing `.meridian/threads/` placement candidates.
3. Show at most three candidates.
4. If there are no candidates, present `root` as the safe placement.
5. Ask for `root`, `child`, `sibling`, or `link`.
6. Create or update the thread/node after confirmation.
7. Run Paper Wiki grounding after placement when context matters.

Done when the idea has a clear placement and does not become a Paper Wiki source
fact.

## Scenario 2: Wiki-Grounded Feasibility Review

Use when the user asks whether an idea, repair path, approach node, or
experiment direction is plausible.

Workflow:

1. Start from the active thread/node or newly placed idea.
2. Retrieve Paper Wiki context.
3. Read selected canonical pages and trace decision-driving claims when needed.
4. Separate source facts, wiki synthesis, user insight, local evidence, and
   uncertainty.
5. Identify the smallest evidence needed next.
6. Create a development handoff only if code/debug/test work is the next step.

Done when the user can see why the idea is supported, weakened, uncertain, or
ready for a handoff.

## Scenario 3: Approach Tree Exploration

Use when the user is working through a research thread.

Workflow:

1. Keep nodes as the smallest verifiable methods.
2. Use only `unresolved`, `repairable`, `supported`, and `dead`.
3. Record Research Prior state when the node depends on method, prompt, metric,
   evaluation, ablation, probe, baseline, or failure interpretation choices.
4. Record assumptions, relevant experiments, key history, and next action.
5. Update same-node facts automatically when evidence is strong enough.
6. Ask before `repairable`, `dead`, new node creation, active state switch,
   thread close, or thread reopen.

Done when the approach graph can be resumed from the node history and evidence
links.

## Scenario 4: Research Prior Grounding

Use when Lab is shaping a research-bearing method, prompt, metric, evaluation
protocol, baseline, ablation, probe, or failure interpretation.

Workflow:

1. Scan the Lab plan for `method`, `prompt`, `metric`, `eval`, `ablation`,
   `probe`, `failure`, or `baseline` slots.
2. For each research-bearing slot, call `meridian.context` before finalizing the
   plan.
3. Use `meridian.read` or `meridian.trace` when returned pages or provenance
   could change the decision.
4. Classify the prior status as `checked`, `missing`, `deferred`, or
   `not_needed`; use `needed` only as a temporary marker while planning.
5. Record page references and how the prior changes the plan.
6. If the prior is `missing`, record the query and agent judgment, then ask for
   user confirmation before treating the under-grounded judgment as the current
   path.
7. Keep Research Prior separate from experiment evidence.

Done when each research-bearing decision has a prior status and later Lab work
can recover whether the decision was grounded, missing, deferred, or local-only.

For official benchmark, baseline, eval, metric, score, or leaderboard work, add
an `Official Benchmark Fidelity` block before finalizing the plan. It must
capture official runner entrypoint, task source / split source, config defaults,
metric function, aggregation granularity, local wrapper changes, and official
metric versus derived diagnostic labels. Ask for benchmark faithfulness review,
not general code quality review.

## Scenario 5: Experiment Evidence Recording

Use when a run, result, failed path, log, or observation should update the idea
graph.

Workflow:

1. Record an independent experiment under `.meridian/experiments/`.
2. Preserve question, target, command/config/output identity, result, validity,
   and interpretation.
3. Record Research Prior state when the experiment design depends on a metric,
   baseline, prompt, evaluation protocol, ablation, probe, or failure claim.
4. Link the experiment to affected nodes or proposals.
5. Retract support if invalid evidence was the only support.
6. Create a local finding proposal if the result is reusable.

Done when future Lab or Wiki work can recover what happened and what the result
does or does not prove.

## Scenario 6: Finding Proposal / Wiki Write-back

Use when local research produces a reusable finding.

Workflow:

1. Create or update a local proposal under `.meridian/proposals/`.
2. Keep the proposal in `draft` or `strengthening` until scope evidence is
   sufficient.
3. Link strengthening experiments.
4. Move to `ready` only when evidence covers the key scope.
5. Create a Wiki Transfer Packet before Paper Wiki draft transfer.
6. Publish canonical wiki updates only through `wiki` after user confirmation,
   lint, and review.

Done when the local finding is evidence-gated and ready for proposal-first Paper
Wiki transfer, or clearly blocked by missing evidence.

## Scenario 7: Development Handoff

Use when the next useful step is implementation, debugging, tests, reruns,
commits, release, or convergence.

Workflow:

1. Name the active thread/node or raw idea.
2. Include Paper Wiki context that shaped the decision.
3. Include relevant Research Prior blocks when implementation depends on a
   method, prompt, metric, baseline, or evaluation convention.
4. Include Official Benchmark Fidelity when implementation depends on official
   benchmark or metric compatibility.
5. State the development question.
6. Read relevant user-level coding-style principles from the Meridian
   coding-style profile when available, and include a compact
   `User Coding Style Principles` section.
7. Add `Research Code Style` when the task is an exploratory research slice:
   prefer one readable main flow, keep source branches/configs/seeds/splits/
   metrics/sample limits visible, and avoid single-use parser/loader/selector
   helper layers unless they represent real reuse, risky boundary isolation, or
   a stable external API.
8. Define expected command/config/output identity.
9. Define validity criteria and result-to-node update rules.
10. Hand off to the normal coding workflow, which must enforce the research-code
   style as an acceptance criterion if final code shape matters.

Done when the coding workflow has enough context to act and Lab has a clear
expectation for what evidence should return.

## MVP Priority

Build and evaluate these Lab-owned scenarios first:

1. Idea Placement
2. Wiki-Grounded Feasibility Review
3. Approach Tree Exploration
4. Experiment Evidence Recording
5. Finding Proposal / Wiki Write-back

Keep these outside Lab as handoff destinations:

- code implementation
- debugging
- tests
- commits
- release
- convergence

## Evaluation Dimensions

- idea placement quality
- wiki grounding quality
- research prior classification and missing-prior handling
- approach tree quality
- experiment evidence identity
- proposal lifecycle discipline
- development handoff quality
- user coding-style principle relevance
- source fact / synthesis / user insight / local evidence boundaries
- lightweight behavior
