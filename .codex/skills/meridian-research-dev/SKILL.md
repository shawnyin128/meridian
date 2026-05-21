---
name: meridian-research-dev
description: Use when a research coding task should use Meridian Paper Wiki context to design experiments, implement paper methods, debug broken runs, preserve evidence, or write research findings back to the wiki.
---

# Meridian Research Dev

Use this skill for research coding. Keep it lightweight: retrieve the wiki when
research context matters, then let the agent inspect, run, diagnose, and edit
normally.

## Workflows

### Idea To Experiment Design

Use when the user has a research idea or suspected mechanism.

Minimum completion:

- Retrieve Paper Wiki context first.
- Read the most relevant method, concept, claim, evidence, or synthesis pages.
- State the research question and expected learning.
- Propose the smallest experiment, controls, ablations, probes, and sanity checks.
- Name command/config/output identity when known.

Example:

```text
The user wants to test whether a cache-retention idea can improve long-context decoding. Retrieve method and concept context, inspect the repo enough to know available scripts and metrics, then produce the minimum experiment plan and sanity checks.
```

### Paper Or Method To Implementation

Use when the user wants a paper method or method family implemented in a repo.

Minimum completion:

- Retrieve paper, method, prerequisite concept, and evidence context.
- Read implementation hooks, failure modes, and minimal checks before editing.
- Inspect the smallest relevant code surface.
- Write research-friendly code: readable, explicit, observable, and easy to ablate.
- Preserve useful knobs and probe hooks.

Example:

```text
The user asks to implement a paper method. Use the wiki to understand mechanism and assumptions, then adapt the repo with clear experiment knobs, sanity checks, and a note about what evidence would validate the implementation.
```

### Broken Run To Sanity Check / Debug

Use when a run, metric, baseline, or reproduction is failing.

Minimum completion:

- Classify likely failure buckets.
- Retrieve method failure modes, prerequisite concepts, and evidence definitions.
- Inspect logs, configs, data path, metric implementation, and relevant code.
- Rank debug hypotheses.
- Propose or run cheap probes before expensive reruns.
- Interpret what each check rules in or out.

Example:

```text
The user reports that a baseline number is far below the paper. Retrieve paper/evidence context and method assumptions, inspect eval protocol and configs, then produce a mismatch diagnosis and the smallest sanity checks.
```

## Wiki Retrieval Contract

Retrieve wiki context before coding when the task depends on paper methods,
metric definitions, prerequisite mechanisms, implementation hooks, failure modes,
prior user insights, claim support, or reproduction details.

Preferred MCP tools:

- `meridian.context` for compact research/coding context.
- `meridian.read` for selected canonical page sections.
- `meridian.trace` for provenance, evidence, quality, or evolution state.

If MCP is unavailable, use the local execution primitive:

```bash
PYTHONPATH=src python3 -m meridian.mcp context --wiki-root wiki --query "<research/coding intent>"
```

## Artifacts

Use Markdown artifacts when a task has durable value:

- `Research Dev Context Packet`
- `Experiment / Evidence Plan`
- `Dev Write-back Packet`

Templates live in:

```text
src/meridian/templates/research-dev/
```

## Evidence And Write-back

For experiments or results, preserve command, config, environment, output path,
metric definition, and interpretation. If the finding should survive the chat,
create a Paper Wiki proposal through `meridian.propose`; apply only after lint
passes.

Keep boundaries clear:

- paper source facts come from papers and evidence records
- wiki synthesis is revisable interpretation
- user insight is user-supplied context
- local experiment results are evidence from the user's repo, not paper facts

## Git Checkpoints

Suggest a checkpoint when a hypothesis implementation becomes runnable, a probe
or ablation layer is added, a result changes the next decision, or a risky
refactor could erase useful exploratory state.

