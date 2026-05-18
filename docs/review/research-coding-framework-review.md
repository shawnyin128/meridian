# Research Coding Loop Framework Review

## Context/Test Plan

### Raw Request

The user asked to inspect the desktop Arbor project, compare its design against their experience using Arbor for research coding, incorporate Anthropic's multi-agent research system lessons, and combine that with the current LLM Wiki direction to construct a better lightweight end-to-end research coding framework.

### Evidence Loaded

- `/Users/shawn/Desktop/arbor/README.md`
- `/Users/shawn/Desktop/arbor/AGENTS.md`
- `/Users/shawn/Desktop/arbor/docs/design/engineering-blog-inspiration.md`
- `/Users/shawn/Desktop/arbor/docs/review/multi-agent-lessons.md`
- `/Users/shawn/Desktop/meridian/docs/mvp-paper-wiki-plan.md`
- `/Users/shawn/Desktop/meridian/.codex/skills/llm-wiki/SKILL.md`
- Anthropic, "How we built our multi-agent research system"

### Problem Summary

Arbor is strong at repository continuity and managed software development, but research coding revolves around uncertain hypotheses, paper evidence, experiments, results, and idea evolution. A new framework should preserve Arbor's continuity and evidence discipline while changing the central unit of work from software feature to research-code slice.

### Goals

- Define an end-to-end research coding loop.
- Define the two-product boundary between Paper Wiki Workflow and Research Dev Agent.
- Define Paper Wiki MCP as the decoupled delivery surface for paper/wiki memory.
- Define the Research Dev Agent boundary around research-friendly code, not generic code cleanup.
- Define the two minimum dev capabilities: research-grade code and wiki gateway behavior.
- Define git checkpointing as a baseline dev capability for research rollback and impact attribution.
- Explain why Arbor's software-feature workflow does not directly fit research.
- Keep useful Arbor ideas: project guide, short-term memory, decision trace, evidence artifacts, outcome-first evaluation.
- Use Anthropic multi-agent research lessons only where they fit: broad, expensive, separable research work.
- Keep the LLM Wiki as the durable research state layer.
- Internalize source-grounded development principles from Karpathy's LLM Wiki guide, Anthropic agent engineering posts, and selected community followups.
- Preserve the full research-event surface while selecting only the highest-leverage MVP workflows.

### Non-Goals

- Do not redesign Arbor itself.
- Do not make multi-agent coding the default.
- Do not build an experiment automation platform in this step.
- Do not expand into publication/rebuttal workflow.

### Acceptance Criteria

- The framework names the core research loop from papers to ideas to code to results and back.
- The framework allows wiki-only, dev-agent-only, and integrated usage.
- The framework states that the wiki is workflow-first while the development plugin is agentic.
- The framework states that Paper Wiki can be delivered as MCP while Markdown remains the source of truth.
- The framework states that the development plugin should preserve agent freedom while constraining artifact quality, evidence, and wiki write-back.
- The framework states that the dev product must both write research-grade code and serve as the development-side entrance to the wiki.
- The framework states that research dev work should use git checkpoints as a research timeline, not only as release history.
- The framework includes source-grounded principles for context engineering, MCP/tool design, skills, and LLM Wiki maintenance.
- The framework distinguishes research wiki state, code work state, and experiment result state.
- The framework states when multi-agent research is useful and when it is harmful.
- The framework narrows the MVP to experiment design, sanity checks, result interpretation, experiment memory, and reproduction diagnosis.
- The framework includes a lightweight artifact layout.
- The framework includes development and test plans.

### Done-When Criteria

| Criterion | Minimum proof | Evidence owner |
| --- | --- | --- |
| Arbor lessons are grounded in the local Arbor repo | Framework references Arbor's actual continuity/evidence/review concepts and why feature-centric workflow mismatches research | brainstorm |
| Anthropic lessons are incorporated with boundaries | Framework includes multi-agent burst rules and avoids default parallel coding | brainstorm |
| LLM Wiki remains central | Framework uses wiki pages for papers, claims, methods, ideas, hypotheses, experiments, and results | brainstorm |
| Paper Wiki MCP delivery is explicit | Architecture defines MCP as a stable delivery surface over Markdown wiki state, with conservative read/query/context and write-back proposal boundaries | brainstorm |
| Two-product boundary is explicit | Full-system architecture separates Paper Wiki Workflow from Research Dev Agent and defines context/write-back packets | brainstorm |
| Dev-agent boundary is research-specific | Framework defines research-friendly code, wiki-aware autonomy, and thin guardrails instead of production-cleanliness or Arbor-style ceremony | brainstorm |
| Dev baseline capabilities are explicit | Architecture and framework state research-grade code and wiki gateway as minimum product requirements | brainstorm |
| Git checkpoint discipline is explicit | Framework treats staged commits as research time travel for impact rollback and evidence attribution | brainstorm |
| Source-grounded principles are captured | A dedicated principles doc extracts durable guidance from the provided sources without adopting community implementation code | brainstorm |
| MVP event scope is narrowed | Framework and event map identify high-leverage workflows and keep ordinary coding/data/repo tasks out of the default scope | brainstorm |
| Later development can test the design | Framework includes structure, scenario, and negative tests | develop/evaluate |

### Test Plan

Structure checks:

- Confirm framework docs exist.
- Confirm `docs/full-system-architecture.md` and `.html` exist.
- Confirm Paper Wiki MCP is represented in both architecture text and visual diagram.
- Confirm `docs/source-grounded-development-principles.md` exists and is referenced by `AGENTS.md`, the LLM Wiki skill, and framework docs.
- Confirm `docs/research-event-map.md` exists and separates event map from MVP scope.
- Confirm AGENTS Project Map points to them.
- Confirm feature registry references this review artifact.
- Confirm no placeholder TODOs remain.

Scenario checks for later development:

- A paper plus user note becomes wiki context for an idea.
- A dev client requests context through Paper Wiki MCP rather than depending on physical wiki page paths.
- A user idea retrieves paper/wiki/code context and becomes a bounded research-code slice.
- A coding task with ambiguous paper/method context triggers wiki lookup before implementation decisions.
- An implementation keeps purposeful redundancy for ablation/probe readability rather than collapsing variants too early.
- A dev-agent answer uses wiki context to improve both implementation choices and the user's research understanding.
- A risky research-code change prompts a checkpoint recommendation before overwriting a useful intermediate state.
- A result note can point back to the commit, command, config, and output artifact that produced it.
- A Paper Wiki MCP tool returns concise context with provenance and selection reasons instead of a large unfiltered dump.
- A wiki ingest produces a triage report before broad page mutations when contradictions or major structural changes are likely.
- A run result updates hypothesis/result pages and next-step memory.
- A failed experiment is preserved as useful negative evidence.

Negative checks for later development:

- Pure explanations should not create research workflow artifacts.
- Tightly coupled code edits should not spawn parallel agents.
- Research Dev Agent should not optimize primarily for production-style elegance or minimal duplication.
- Research Dev Agent should not run costly experiments without a learning target and evidence plan.
- Research Dev Agent should not flatten multiple exploratory moves into one opaque final diff when staged commits would preserve impact attribution.
- Dev-agent integration should not require hardcoded wiki directory knowledge when MCP is available.
- MCP write tools should not silently rewrite canonical research memory without propose/apply separation.
- Source-grounded principles should not copy followup implementation code or overfit to one community project.
- A result without command/config/metric identity should not confirm a claim.
- Weak retrieval should report uncertainty instead of fabricating support.

### Decision Trace Handoff

Key decisions:

- The central work unit is a research-code slice, not a software feature.
- Meridian is two products: Paper Wiki Workflow and Research Dev Agent.
- Paper Wiki can be delivered as an MCP server; MCP is the delivery boundary, not the source of truth.
- Source-grounded principles are now a project artifact and should inform later MCP/tool/skill/workflow design.
- The wiki remains workflow-first; the development plugin is agentic.
- The development plugin's boundary is research-friendly code and evidence, not generic simplification.
- The agent's internal exploration path should remain flexible; guardrails should be thin contracts around learning target, evidence, wiki lookup, and write-back.
- The dev plugin has three minimum capabilities: research-grade code, wiki gateway behavior, and git checkpoint discipline.
- Git history should align with experiment memory so research states can be compared and rolled back by impact.
- The MVP owns five high-leverage research workflows, not every research coding event.
- Multi-agent work is optional research burst, not default coding flow.
- LLM Wiki is the canonical research state.
- Arbor contributes continuity/evidence discipline, not its full ceremony.

Rejected options:

- Directly reuse Arbor's full managed development loop.
- Make multi-agent implementation default.
- Store research state only in review docs or chat.
- Treat all debugging, data work, evaluation harness work, and repo cleanup as first-class MVP workflows.

Allowed implementation discretion:

- Exact directory names can change if the state separation remains clear.
- First implementation may omit parallel research if the single-workflow path is not stable yet.
- Graph JSONL can be deferred if Markdown links and logs are sufficient for the first slice.
