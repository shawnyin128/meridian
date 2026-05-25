---
type: product-design
title: "Research Dev Use Cases"
status: draft
created: 2026-05-21
updated: 2026-05-21
tags:
  - research-dev-agent
  - llm-wiki
  - mcp
  - use-cases
confidence: medium
---

# Research Dev Use Cases

This document defines the first product scenarios for Meridian's Research Dev side.
The goal is not to build a generic coding agent. The goal is a wiki-aware research
development workflow that helps a researcher move from idea, paper, or result to
clear research code, evidence, interpretation, git checkpoints, and durable wiki
memory.

## Product Boundary

Research Dev is the upper layer above Paper Wiki.

Research Dev state now lives in a target-repo `.meridian/` research space. The
primary artifacts are Research Threads, Approach Nodes, Experiments, and Finding
Proposals. Legacy Idea Cards are superseded for new durable work; see
`docs/research-dev-state-model.md`.

Paper Wiki owns:

- source-managed papers
- canonical paper/method/concept/claim/evidence/synthesis pages
- retrieval context
- proposal-first write-back
- user insight and evolution

Research Dev owns:

- research coding intent handling
- lightweight idea capture, triage, and evolution
- repo/code/config/log inspection
- experiment and sanity-check planning
- research-friendly implementation
- result interpretation
- git checkpoint recommendations
- write-back packets to Paper Wiki

The two products communicate through MCP and explicit artifacts. Research Dev
should consume Paper Wiki through `meridian.context`, `meridian.read`, and
`meridian.trace` whenever research context matters. Research Dev should write
back through `meridian.propose` and `meridian.apply`, not by silently editing
canonical wiki pages.

## Design Influences

From Arbor, keep:

- project-local orientation through `AGENTS.md`
- short-term unresolved memory
- evidence discipline
- outcome-first evaluation
- decision trace for important research moves
- git checkpoints as recoverable state

Do not copy Arbor's full feature workflow. Research work is centered on a
hypothesis under uncertainty, not a software feature reaching done.

From Superpowers-style capability packaging, keep:

- scenario-facing skills rather than low-level command lists
- progressive disclosure
- project-local setup
- user-facing examples
- small entry surface

Do not reduce Research Dev to a bag of commands. The product unit is a research
development scenario.

## Entry Model

The user enters through one mental door:

```text
Research Dev Request
```

The system classifies the request into one primary scenario:

1. Idea Capture / Triage / Evolution
2. Idea to Experiment Design
3. Paper or Method to Implementation
4. Broken Run to Sanity Check / Debug
5. Logs or Results to Interpretation
6. Paper Repo to Reproduction Diagnosis
7. Experiment to Memory / Wiki Write-back

MVP should prioritize the first four scenarios. They provide the shortest path
to proving that Paper Wiki can actively improve research coding without turning
every half-formed idea into canonical wiki state.

## Shared Dev Artifacts

Every non-trivial Research Dev scenario may produce these artifacts.

### Research Thread

Purpose: keep one research problem, active node, approach tree, grounding,
experiments, and final summary.

Default target-repo path:

```text
.meridian/threads/<thread-slug>.md
```

Minimum fields:

- root problem
- placement relation
- wiki grounding
- approach tree
- active node
- thread final summary

### Experiment

Purpose: preserve an independent evidence record.

Default target-repo path:

```text
.meridian/experiments/<experiment-id>.md
```

Minimum fields:

- question
- primary target
- targets and impacts
- command/config/output
- result
- validity
- interpretation

### Finding Proposal

Purpose: mature a reusable local finding before Paper Wiki write-back.

Default target-repo path:

```text
.meridian/proposals/<proposal-slug>.md
```

Minimum fields:

- reusable finding
- evidence
- scope checklist
- strengthening experiments
- state
- target wiki pages
- transfer notes

### Research Dev Context Packet

Purpose: combine wiki and repo context before coding or experiment planning.

Minimum fields:

- user intent
- classified scenario
- retrieved wiki pages
- selected repo files/configs/logs
- why each item matters
- source facts
- wiki synthesis
- user insights
- uncertainty and gaps
- recommended next move

### Experiment / Evidence Plan

Purpose: define the smallest research-code slice that can teach something.

Minimum fields:

- research question
- hypothesis or suspected failure mode
- smallest runnable slice
- controls
- ablations or probes
- sanity checks
- command/config/output identity
- expected observation
- stop condition

### Research Code Change

Purpose: make code that supports research exploration.

Quality bar:

- readable and inspectable
- easy to extend with ablations, probes, metrics, and variants
- explicit about configs, seeds, datasets, metrics, and output paths
- preserves purposeful redundancy when it improves comparison or observation
- avoids premature production-style cleanup

### Dev Write-back Packet

Purpose: turn code and experiment evidence into durable research memory.

Minimum fields:

- what changed
- commit or diff identity when available
- command/config/environment identity
- result artifact paths
- metric definitions
- interpretation
- hypothesis impact
- affected wiki pages
- proposed wiki update
- next decision

## Scenario 1: Idea Capture / Triage / Evolution

User examples:

```text
I have a hunch that KV-cache compression should preserve attention sink tokens differently from retrieval-critical tokens.
```

```text
This failure makes me suspect the method depends on calibration outliers. Track this idea and decide whether it is worth testing.
```

Workflow:

1. Preserve the raw idea.
2. Normalize it into a testable hypothesis.
3. Retrieve Paper Wiki context when prior work, methods, concepts, evidence, or failure modes matter.
4. Summarize support, contradiction, novelty risk, implementation risk, and missing evidence.
5. Decide whether it should become a root, child, sibling, or linked thread
   seed.
6. Place durable ideas into the `.meridian/` research space as a thread seed or
   an approach node.
7. Write back only durable findings through local finding proposals and then
   Paper Wiki proposals.

Wiki use:

- `meridian.context` for related papers, methods, concepts, evidence, and syntheses.
- `meridian.read` for the pages that materially affect the feasibility read.
- `meridian.trace` when the idea depends on a claim or evidence item.

Outputs:

- Research Thread seed
- optional Research Dev Context Packet
- optional Experiment / Evidence Plan
- optional Dev Write-back Packet after evidence exists

Done when:

- raw idea and normalized hypothesis are separated
- wiki grounding is present when it matters
- feasibility is explicit instead of assumed
- placement and active-thread decision are explicit
- raw idea does not become a Paper Wiki source fact

## Scenario 2: Idea To Experiment Design

User examples:

```text
I want to test whether KV-cache compression should preserve attention sink tokens. Design the smallest useful experiment.
```

```text
I think activation outlier smoothing might explain this quantization failure. What should I run first?
```

Workflow:

1. Retrieve Paper Wiki context for the idea.
2. Read relevant method, concept, claim, evidence, and synthesis pages.
3. Inspect the target repo only enough to understand available models, data, metrics, and scripts.
4. Produce the smallest experiment plan that can change the next research decision.
5. Identify controls, ablations, probes, and sanity checks.
6. Recommend whether a git checkpoint is due before implementation.

Wiki use:

- `meridian.context` for related methods, concepts, evidence, and prior syntheses.
- `meridian.read` for method implementation hooks and concept minimal checks.
- `meridian.trace` for claim/evidence support when the design depends on a paper claim.

Outputs:

- Research Dev Context Packet
- Experiment / Evidence Plan

Done when:

- the research question is explicit
- the minimum experiment is smaller than the full idea
- controls and sanity checks are named
- the expected learning is clear
- wiki evidence and uncertainty are separated

## Scenario 3: Paper Or Method To Implementation

User examples:

```text
Implement the core method from this paper in my repo, but keep it easy to ablate and probe.
```

```text
Connect this method family to my training framework without hiding the experimental knobs.
```

Workflow:

1. Retrieve the paper, method family, prerequisite concepts, and evidence.
2. Read implementation hooks, assumptions, failure modes, and minimal checks.
3. Inspect current repo entrypoints, configs, data flow, and metric definitions.
4. Propose the smallest integration surface.
5. Implement research-friendly code with explicit knobs and probe hooks.
6. Add or recommend sanity checks.
7. Prepare a write-back packet if implementation reveals hidden details or wiki gaps.

Wiki use:

- paper pages explain what the paper is actually doing.
- method pages compile cross-paper mechanisms and implementation hooks.
- concept pages provide prerequisite mechanisms and debug checks.
- evidence pages identify metrics, baselines, and scope limits.

Outputs:

- Research Dev Context Packet
- Implementation Plan
- Research Code Change
- Sanity Check Plan
- optional Dev Write-back Packet

Done when:

- code is readable to the researcher
- experiment knobs are explicit
- ablations/probes can be added without surgery
- assumptions are visible
- implementation choices are traceable to wiki context or repo constraints

## Scenario 4: Broken Run To Sanity Check / Debug

User examples:

```text
The loss is not decreasing. Diagnose whether the training loop, data, metric, or method assumption is broken.
```

```text
My baseline is far below the paper. Find the most likely mismatch before I waste more GPU.
```

Workflow:

1. Classify the failure: code, data, metric, config, environment, paper assumption, or result interpretation.
2. Retrieve wiki concepts, method failure modes, paper assumptions, and evidence definitions.
3. Inspect relevant code, configs, logs, and outputs.
4. Build a ranked debug hypothesis list.
5. Run or propose minimal probes and sanity checks.
6. Interpret what each check rules in or out.
7. Write back durable discoveries or hidden implementation details.

Wiki use:

- concept pages provide minimal checks and common failure modes.
- method pages provide assumptions and known fragile points.
- paper/evidence pages provide expected metric behavior and reported scope.
- user insights may flag known local caveats, but must stay labeled as user-supplied.

Outputs:

- Debug Hypothesis List
- Sanity Check Plan
- Patch or Probe
- Interpretation
- optional Dev Write-back Packet

Done when:

- the debug path narrows the problem space
- each check maps to a failure hypothesis
- expensive reruns are avoided until cheap checks pass
- paper evidence and user assumptions are not mixed

## Scenario 4: Logs Or Results To Interpretation

User examples:

```text
Here are three runs. Tell me what this says about the hypothesis and what to run next.
```

```text
This ablation changed accuracy but not latency. Interpret whether the method still matters.
```

Workflow:

1. Read logs, metrics, configs, commands, and output paths.
2. Retrieve relevant paper claims, method pages, evidence records, and prior syntheses.
3. Check metric definitions and comparability.
4. Decide whether the result supports, weakens, or fails to answer the hypothesis.
5. Produce the next research decision.
6. Write back durable result memory.

Outputs:

- Result Interpretation
- Decision Note
- Dev Write-back Packet

Done when:

- result identity is complete
- the interpretation is tied to a hypothesis
- caveats are explicit
- future retrieval can find the result

## Scenario 5: Paper Repo To Reproduction Diagnosis

User examples:

```text
I cannot reproduce the reported number from this paper repo. Diagnose the likely gap.
```

```text
Extract the hidden implementation details from the official repo and compare them to the paper page.
```

Workflow:

1. Retrieve paper claims, datasets, metrics, baselines, limitations, and hidden-detail notes.
2. Inspect repo configs, preprocessing, checkpoints, eval protocol, and environment assumptions.
3. Build a mismatch matrix.
4. Propose minimal reproduction sanity checks.
5. Decide whether continued reproduction is worthwhile.
6. Write back confirmed hidden details or source-recheck needs.

Outputs:

- Reproduction Gap Matrix
- Diagnosis Plan
- Evidence Notes
- optional Wiki Refinement Proposal

Done when:

- mismatch causes are separated by category
- each suspected gap has evidence or a check
- the agent does not blindly tune hyperparameters

## Scenario 6: Experiment To Memory / Wiki Write-back

User examples:

```text
This experiment is done. Record what it means so future work can retrieve it.
```

```text
We learned this probe is not useful. Preserve that failed path.
```

Workflow:

1. Gather purpose, command, config, environment, commit, outputs, metrics, and logs.
2. Interpret the result.
3. Identify affected paper, method, concept, claim, evidence, or synthesis pages.
4. Generate a write-back proposal.
5. Publish only through lint-gated wiki workflow.

Outputs:

- Experiment Note
- Result-to-Claim Link
- Wiki Proposal
- Git Checkpoint Suggestion

Done when:

- the result is recoverable
- the interpretation is not only in chat
- failed paths become useful negative evidence
- source facts, wiki synthesis, and user decisions remain separate

## MVP Prioritization

Build first:

1. Idea to Experiment Design
2. Paper or Method to Implementation
3. Broken Run to Sanity Check / Debug

Defer until the first three are stable:

4. Logs or Results to Interpretation
5. Paper Repo to Reproduction Diagnosis
6. Experiment to Memory / Wiki Write-back

The first implementation should probably be a project skill:

```text
.codex/skills/meridian-research-dev/SKILL.md
```

The skill should call Paper Wiki MCP for research context and then use ordinary
repo inspection, shell commands, tests, and git discipline for development work.
It should not require a new service or database.

The MVP plan lives in `docs/research-dev-mvp-plan.md`. Treat that plan plus this
use-case map as the source for future Research Dev skill, template, and
evaluation changes.

## Evaluation Cases

Initial evaluation should use realistic tasks:

- Given a method idea, retrieve wiki context and produce a bounded experiment plan.
- Given a paper method, implement a small research-friendly scaffold with probe hooks.
- Given a broken metric, retrieve relevant failure concepts and design sanity checks.
- Given a run result, produce interpretation and a write-back proposal.
- Given a reproduction mismatch, separate paper, repo, data, metric, and environment causes.

Quality dimensions:

- wiki lookup happens when research context matters
- context packet is compact and relevant
- plan has a learning target
- code remains research-friendly
- evidence identity is complete
- interpretation is more than test pass/fail
- write-back proposal preserves source/synthesis/user boundaries
- git checkpoint recommendation appears before risky research-state changes
