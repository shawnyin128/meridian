---
type: plan
title: "Paper Wiki Prototype And Evaluation Plan"
status: draft
created: 2026-05-18
updated: 2026-05-18
tags:
  - llm-wiki
  - paper-wiki
  - prototype
  - evaluation
confidence: medium
---

# Paper Wiki Prototype And Evaluation Plan

## Development Priority

Meridian should build the Paper Wiki before the Research Dev Agent.

Reason:

- The Paper Wiki is the research memory substrate.
- The dev agent's wiki-gateway capability depends on a usable wiki interface.
- A weak wiki will make research coding look agentic while still forcing the agent to rediscover paper knowledge from scratch.
- The first prototype should prove that paper knowledge can be internalized, evolved, retrieved, and reviewed.

The development sequence should be:

```text
brainstorm prototype boundary
-> build minimal prototype
-> human review
-> build many evaluation cases
-> run evaluation
-> analyze failures
-> refine workflow/schema/tools
-> repeat
```

## Phase 1: Brainstorm And Prototype

Goal: build the smallest Paper Wiki prototype that can be used seriously on a few papers.

This prototype should test the product loop, not the final infrastructure.

Minimum prototype capabilities:

1. Route a user request into `ingest_paper`, `add_user_insight`, `evolve_analysis`, `retrieve_context`, `develop_idea`, or `lint_wiki`.
2. Ingest one paper into a draft paper model.
3. Separate source facts, user insights, and wiki synthesis.
4. Produce candidate pages for paper, claims, methods, concepts, ideas, and open questions.
5. Publish approved drafts to Markdown wiki pages.
6. Maintain `index.md` and `log.md`.
7. Build a context packet for a question or idea.
8. Generate a reviewable write-back proposal instead of silently rewriting canonical pages.

Prototype non-goals:

- no full Zotero live sync
- no batch ingestion
- no vector-first infrastructure
- no autonomous multi-agent pipeline
- no paper-writing or rebuttal workflow
- no Research Dev Agent integration beyond a mock context-packet consumer

## Phase 2: Human Review

Goal: make sure the prototype matches the actual research workflow before scaling tests.

Human review should inspect:

- whether the paper page helps the user understand and reuse the paper
- whether source claims are clearly separated from user judgment and synthesis
- whether the generated claim/method/concept pages are useful or noisy
- whether the draft/publish boundary feels too heavy or too loose
- whether the context packet selects pages the user agrees are relevant
- whether the wiki update would help future idea generation
- whether important uncertainty is surfaced instead of hidden

Review outputs:

- accepted behavior
- rejected behavior
- missing workflow step
- schema/frontmatter changes
- retrieval weaknesses
- examples of bad page structure
- examples of good page structure
- prototype blockers before evaluation expansion

Human review should happen before building a large benchmark. Otherwise the evaluation set may encode the wrong product behavior.

## Phase 3: Evaluation Case Construction

Goal: create many realistic test cases with detailed problem descriptions and expected results, without forcing one unique solution path.

Each test case should include:

- `id`
- `category`
- `user_request`
- `available_inputs`
- `wiki_state_before`
- `problem_description`
- `expected_result`
- `acceptable_paths`
- `must_not_do`
- `evaluation_rubric`
- `fixtures`
- `notes`

Expected results should describe outcome properties, not one exact trace.

Good expected result:

```text
The system should produce a paper draft that separates source claims from user insights, captures at least the method, evidence, limitations, and open questions, and marks unsupported claims as draft or low confidence.
```

Bad expected result:

```text
The system must first call search, then read paper.md, then create exactly four claim pages with these exact titles.
```

The case should allow multiple valid paths when the final research artifact is correct, auditable, and useful.

### Initial Evaluation Categories

1. **Paper ingest without user notes**
   - Does the system create a useful paper model with provenance?

2. **Paper ingest with user insights**
   - Does the system preserve user judgment separately from paper facts?

3. **Zotero/annotation import**
   - Does the system incorporate highlights and marginal notes without over-trusting them as source claims?

4. **Evolutionary analysis**
   - Does user feedback update structure, emphasis, links, and open questions?

5. **Contradiction handling**
   - Does a new paper or user correction expose conflicts instead of silently overwriting old claims?

6. **Context packet retrieval**
   - Does retrieval return a small, defensible packet with selection reasons, provenance, conflicts, and gaps?

7. **Idea feedback**
   - Does the wiki help refine an idea into hypotheses, comparisons, or next reading targets?

8. **Lint and maintenance**
   - Does the system find stale claims, orphan pages, missing provenance, and underdeveloped concepts?

9. **Write-back proposal**
   - Does the system propose changes for review before broad canonical mutation?

10. **Negative and ambiguous requests**
    - Does the system stop or ask for clarification when source, write intent, or evidence is insufficient?

## Phase 4: Run Evaluation

Goal: measure whether the prototype behaves like a useful Paper Wiki workflow.

Evaluation should record both final artifact quality and process behavior.

Metrics:

- paper model usefulness
- source/user/synthesis separation
- provenance quality
- context packet precision
- context packet recall, judged by missing important pages
- contradiction surfacing
- schema validity
- index/log consistency
- write-boundary correctness
- user-review readiness
- context efficiency
- failure honesty

The evaluator should avoid path overfitting:

- do not require exact page titles unless title quality is what the case tests
- do not require exact number of pages unless page granularity is what the case tests
- do not require exact retrieval order unless ranking is what the case tests
- do not require a specific tool sequence when several paths could produce the right artifact
- judge whether the final wiki state and explanation are useful, traceable, and reviewable

## Phase 5: Feedback And Refine

Evaluation failures should feed into one of four refinement buckets:

1. **Workflow fix**
   - routing, draft gate, publish gate, lint loop, user review step

2. **Schema fix**
   - frontmatter, page templates, relationship types, confidence fields, source references

3. **Retrieval fix**
   - index quality, search fields, graph expansion, reranking, context packet structure

4. **Tool/interface fix**
   - MCP tool naming, response shape, error messages, concise/detailed output, propose/apply contract

Refinement rule:

- If multiple failures share a cause, fix the workflow or schema.
- If one case fails because the expected result was too narrow, fix the test case.
- If the system succeeds through an unexpected but valid path, update `acceptable_paths` instead of penalizing it.

## Done-When For Prototype Stage

The prototype stage is done when:

- at least one paper can be ingested into a useful draft
- user insight can change the paper analysis without losing source boundaries
- a context packet can retrieve useful pages for a real idea or question
- human review identifies no blocker in the core product loop
- the first evaluation suite contains enough cases to cover ingest, insight, evolution, retrieval, lint, write-back, and ambiguity
- evaluation results produce concrete refinement actions rather than generic quality complaints

## Open Decisions

- What is the first real paper or small paper set for prototype review?
- Should the first prototype use real PDFs, markdown exports, or curated text fixtures?
- How strict should the initial publish gate be for narrow additive changes?
- Should evaluation cases live as Markdown, YAML, JSONL, or a mixed fixture directory?
- Which client should exercise the first Paper Wiki MCP surface: Codex, Claude Code, or a local test harness?
