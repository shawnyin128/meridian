---
name: lab
description: "Use when managing research ideas as an idea graph: place new ideas, ground them with Meridian Paper Wiki context, maintain approach trees, attach experiment evidence, and prepare reusable findings for wiki write-back. Do not use for code implementation, debugging, test repair, release, or git convergence; hand those to the normal coding workflow."
---

# Meridian Lab

Use this skill for research idea graph management. Lab keeps the target repo's
`.meridian/` research space organized, uses Paper Wiki to ground ideas, and
turns reusable local findings into proposal-ready packets.

Lab is not a coding agent, workflow engine, MCP product, or setup assistant.
When work needs code edits, debugging, tests, commits, release, or convergence,
produce a compact development handoff and let the user's normal coding flow
take over.

## Runtime Load Boundary

Use Lab only when this `lab/SKILL.md` file was actually loaded by the active
runtime. If the runtime reports that the Lab skill path is missing or
unreadable, stop and use `meridian` setup/status to diagnose plugin path drift.
Do not continue from remembered Lab semantics.

## Behavior Priority

- Manage ideas, approach nodes, experiment evidence, and local finding
  proposals.
- Before finalizing a Lab plan, run the Research Prior Gate for any method,
  prompt, metric, eval, ablation, probe, failure, or baseline slot in the plan.
- Use Paper Wiki MCP grounding as the default path for research-prior slots;
  preserve `checked`, `missing`, `deferred`, or `not_needed` state explicitly.
- Keep implementation details as research context, not as Lab-owned code work.
- Ask before boundary-changing state moves: creating a new node, marking
  `repairable` or `dead`, switching active thread/node, closing/reopening a
  thread, publishing to Paper Wiki, or handing off ambiguous development scope.
- Keep Lab findings local until a finding proposal is `ready`; use `wiki` for
  Paper Wiki update/use work.

## Research Prior Gate

Before presenting a Lab plan, approach node, experiment design, feasibility
judgment, or development handoff, scan it for research-prior slots:

- `method`
- `prompt`
- `metric`
- `eval`
- `ablation`
- `probe`
- `failure`
- `baseline`

For every slot that affects research interpretation:

1. Call `meridian.context` with a compact research intent before relying on
   chat intuition or local repo evidence.
2. Use `meridian.read` for selected page sections when context returns a paper,
   method, concept, claim, evidence page, synthesis, or user insight that could
   change the plan.
3. Use `meridian.trace` when a decision depends on provenance, evidence
   quality, trust state, or source support.
4. Record the slot as `checked` when grounding is useful, `missing` when the
   lookup has no strong grounding, `deferred` only with a stated reason, or
   `not_needed` only for local engineering that does not change research
   interpretation.

Do not treat missing prior as failure. Preserve the attempted query and agent
judgment, then ask before accepting the under-grounded path.

## Lazy Init

Lab uses lazy init. The user does not need to initialize Lab before sharing an
idea.

At the start of any Lab workflow:

- Check whether the target repo has `.meridian/`.
- If it is missing, ask once before creating the Lab research space.
- On confirmation, create only the minimal skeleton:
  - `.meridian/state.md`
  - `.meridian/memory.md`
  - `.meridian/threads/index.md`
  - `.meridian/experiments/index.md`
  - `.meridian/proposals/index.md`
- Continue the user's original idea or evidence-management task after the
  skeleton exists.
- Create thread, experiment, and proposal files only when the current workflow
  needs them.
- A new durable research idea needs a thread seed. If `.meridian/` exists but
  there are no thread candidates, ask to create a root thread seed instead of
  treating the task as direct development.

Example:

```text
The user shares a new KV-cache compression idea in a repo with no `.meridian/`.
Ask to create the Lab research space, create the minimal skeleton after
confirmation, place the idea as a root thread seed, then retrieve Paper Wiki
context for feasibility.
```

## Workflows

### New Idea Placement / Thread Seed

Use when the user shares a new idea, intuition, hypothesis, or side direction.

Minimum completion:

- Preserve the raw idea.
- Check existing `.meridian/threads/` only and show at most three placement
  candidates.
- If there are no existing thread candidates, say so and present `root` as the
  safe placement. Do not skip thread creation just because no thread exists.
- Ask the user to choose `root`, `child`, `sibling`, or `link`.
- Create a thread seed for `root` or `link`; attach to the existing thread for
  `child` or `sibling`.
- After placement, run the Research Prior Gate before feasibility or experiment
  planning if the idea contains method, prompt, metric, eval, ablation, probe,
  failure, or baseline slots.
- Ask before switching the active thread or active node.

Example:

```text
The user gets a tokenizer-pruning idea while thinking about KV-cache
compression. Compare it against existing research threads, ask where it belongs,
create a thread seed if needed, then use Paper Wiki only after placement.
```

### Wiki-Grounded Feasibility Review

Use when the user asks whether an idea, path, repair, or experiment direction is
plausible.

Minimum completion:

- Start from the active thread/node or newly placed idea.
- Retrieve compact Paper Wiki context with `meridian.context`.
- Read selected canonical pages with `meridian.read` when the feasibility
  judgment depends on a paper, method, concept, claim, or evidence section.
- Trace provenance with `meridian.trace` when a claim would affect a decision.
- Separate source facts, wiki synthesis, user insight, local experiment
  evidence, and uncertainty.
- End with a next research move: refine the node, design evidence, create a
  proposal, or prepare a development handoff.

Example:

```text
The user asks whether a repair path is credible. Retrieve relevant mechanism
and failure-boundary pages, summarize what supports or weakens the path, and
identify the smallest evidence needed next.
```

### Research Prior Classification

Use when a Lab plan, approach node, experiment design, prompt, metric, baseline,
ablation, probe, evaluation protocol, or failure interpretation contains a
research-prior slot.

Minimum completion:

- Classify the prior status as `needed`, `checked`, `missing`, `deferred`, or
  `not_needed`.
- Use triggers exactly: `method`, `prompt`, `metric`, `eval`, `ablation`,
  `probe`, `failure`, or `baseline`.
- For each research-bearing trigger, call `meridian.context` before finalizing
  the plan; do not set a numeric lookup cap.
- Mark pure local engineering as `not_needed` unless it changes research
  interpretation.
- If prior is `missing`, record the attempted query and the agent judgment, then
  ask for user confirmation before treating the under-grounded judgment as the
  current path.
- Keep prior separate from experiment evidence: prior shapes design; evidence
  changes node support.

Example:

```text
The user wants an LLM-as-Judge rubric. Treat prompt and metric design as
Research Prior triggers, retrieve Paper Wiki context, and record `missing` if no
strong prompt-practice grounding exists. Offer the smallest local calibration
probe, but ask before accepting the under-grounded design.
```

### Approach Tree Exploration

Use when the user is exploring a research thread.

Minimum completion:

- Maintain an approach tree whose nodes are the smallest verifiable methods.
- Use node modes exactly: `unresolved`, `repairable`, `supported`, `dead`.
- Record Research Prior state for nodes that depend on method, prompt, metric,
  eval, ablation, probe, failure, or baseline choices.
- Record assumptions, relevant experiments, key history, and next action.
- Automatically update same-node facts when evidence is strong enough.
- Ask before marking a node `repairable` or `dead`, creating a new node,
  changing active node, closing or reopening a thread, or killing a path.
- Confirm thread close with the user, then write a final summary and extract
  reusable findings into local proposals.

Example:

```text
The current method fails, but the failure appears explainable. Record the
evidence, ask whether the node is repairable, then ask before creating child
repair candidates.
```

### Experiment Evidence Recording

Use when the user wants to preserve the result, validity, or interpretation of
an experiment.

Minimum completion:

- Record experiments as independent evidence records under
  `.meridian/experiments/`.
- Include question, primary target, targets and impacts, command/config/output,
  result, validity, and interpretation.
- Record Research Prior state when the experiment design depends on a metric,
  baseline, prompt, evaluation protocol, ablation, probe, or failure claim.
- Link experiments to nodes or proposals instead of copying results everywhere.
- If an experiment is invalid, preserve it as evidence and retract any
  same-node support that depended only on that invalid evidence.
- If more code or reruns are needed, create a development handoff instead of
  doing that work inside Lab.

Example:

```text
The user reports an ablation result. Record the command/config/output identity,
link the result to the active node, update support only if the evidence is
valid, and note what a coding workflow should do next.
```

### Finding Proposal / Wiki Write-back

Use when local research produces a reusable finding.

Minimum completion:

- Create a local finding proposal under `.meridian/proposals/`.
- Use proposal states exactly: `draft`, `strengthening`, `ready`, `published`,
  `rejected`, `archived`.
- Let proposals request strengthening experiments using the same experiment
  schema.
- Move a proposal to `ready` only when evidence covers the key scope.
- Convert `ready` local proposals into Paper Wiki draft proposals; publish
  canonical wiki updates only after user confirmation and lint/review.
- Use a Wiki Transfer Packet when moving local evidence toward Paper Wiki.

Example:

```text
A local experiment shows dynamic KV eviction needs amortized scoring. Create a
local proposal, list scope-strengthening evidence, and only transfer it to the
Paper Wiki draft path when ready.
```

### Development Handoff

Use when the next useful action is implementation, debugging, testing, running
experiments, commit management, release, or convergence.

Minimum completion:

- Name the current thread/node or idea that motivates the work.
- Include the Paper Wiki context that shaped the decision.
- Include relevant Research Prior blocks when implementation depends on a
  method, prompt, metric, baseline, or evaluation convention.
- State the smallest development question or task.
- Preserve evidence identity needed by Lab: expected command/config/output,
  metrics, validity criteria, and what result would update the node.
- Hand off to the normal coding workflow; do not perform code edits, run tests,
  create commits, or manage release inside Lab.

Example:

```text
The idea graph says Node A needs a probe implementation. Produce a handoff that
names the node, wiki context, expected evidence, and done-when signal, then let
the coding workflow implement and verify it.
```

Common request labels map to these workflows:

- `Idea Placement`
- `Idea Feasibility Review`
- `Approach Tree Exploration`
- `Experiment Evidence Recording`
- `Finding Proposal / Wiki Write-back`
- `Development Handoff`

## Wiki Retrieval Contract

Retrieve wiki context after idea placement before feasibility judgment or
experiment planning whenever the placed idea has a research-prior slot. These
slots include paper methods, metric definitions, prerequisite mechanisms,
implementation hooks, failure modes, prior user insights, claim support, or
reproduction details.

For Research Prior triggers, MCP grounding is the default before a final Lab
plan: method, prompt, metric, eval, ablation, probe, failure, or baseline. A
missing result is still a valid state: record `missing`, preserve the attempted
query, and ask before using agent judgment as an under-grounded decision.

Default MCP grounding path:

- `meridian.context` for compact research context.
- `meridian.read` for selected canonical page sections.
- `meridian.trace` for provenance, evidence, quality, or evolution state.

If MCP is unavailable, use the local execution primitive:

```bash
PYTHONPATH=src python3 -m meridian.mcp context --query "<research intent>"
```

## Wiki Health Signals

If idea grounding returns weak method, concept, synthesis, or evidence support,
treat that as a wiki signal rather than a reason to overfit the Lab answer:

- missing prerequisite concepts: note a `concept_coverage` gap
- many competing method pages: note a `knowledge_graph` consolidation gap
- unsupported claims: note a `claim_evidence_traceability` gap
- no synthesis for a recurring design question: note a `growth` gap

Continue the idea-graph task with the best available context, but include the
gap in the Lab Context Packet and ask before creating a Paper Wiki repair or
write-back proposal.

## Artifacts

Use Markdown artifacts when a task has durable value:

- `.meridian/state.md`
- `.meridian/memory.md`
- `.meridian/threads/index.md`
- `.meridian/threads/<thread>.md`
- `.meridian/experiments/index.md`
- `.meridian/experiments/<experiment>.md`
- `.meridian/proposals/index.md`
- `.meridian/proposals/<proposal>.md`
- `Lab Context Packet` for compact wiki and idea-graph context
- `Development Handoff Packet` for implementation/debug/test work that should
  leave Lab
- `Wiki Transfer Packet` for ready local findings moving toward Paper Wiki

Templates live in:

```text
src/meridian/templates/research-dev/
```

## Evidence And Write-back

For experiments or results, preserve command, config, environment, output path,
metric definition, and interpretation. Write back only through a Paper Wiki
proposal when a local finding becomes a reusable proposal that is `ready`.
Never edit canonical wiki pages directly from Lab state.

Keep boundaries clear:

- paper source facts come from papers and evidence records
- wiki synthesis is revisable interpretation
- user insight is user-supplied context
- research threads, nodes, experiments, and local proposals are Lab working
  state
- local experiment results are evidence from the user's repo, not paper facts
- development handoffs are instructions for another workflow, not completed
  code work
