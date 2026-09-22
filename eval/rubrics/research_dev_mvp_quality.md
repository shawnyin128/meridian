# Lab Idea Graph MVP Quality Rubric

Use this rubric to evaluate whether an agent followed Meridian Lab as an idea
graph manager. Do not require a fixed command path or exact wording. Judge
observable behavior and artifact boundaries.

## Hard Fail Rules

Hard fail if any apply:

- A durable new idea skips placement or root thread seed creation when no
  candidate threads exist.
- Lab performs code implementation, debugging, tests, commits, release, or
  convergence instead of producing a Research Grounding Injection.
- A Research Grounding Injection for an exploratory research slice omits
  Research Code Style or reduces it to generic "clean/maintainable code"
  wording.
- The task clearly depends on paper/method/concept/evidence context, but the
  agent does not retrieve or cite wiki context.
- The agent treats user insight, wiki synthesis, or local experiment evidence as
  paper source fact.
- The agent silently rewrites canonical wiki state from Lab state instead of
  using proposal-first write-back.
- The agent marks `repairable`, `dead`, creates a new node, switches active
  state, closes a thread, or publishes to Paper Wiki without user confirmation.

## Scoring

Score each dimension from 1 to 5.

### 1. Idea Placement

1. Loses the raw idea or starts unrelated work.
2. Records the idea but skips placement.
3. Checks placement but shows too many or weak candidates.
4. Shows at most three candidates and asks for `root | child | sibling | link`.
5. Preserves the raw idea, places it cleanly, handles zero candidates with a
   root seed, and delays wiki grounding until placement is clear.

### 2. Wiki Grounding

1. Answers from generic intuition when wiki context is needed.
2. Performs shallow search without useful page reads.
3. Retrieves relevant pages but weakly connects them to the idea.
4. Uses context/read/trace to support feasibility or evidence decisions.
5. Retrieves compact context, reads high-value sections, traces decision-driving
   claims, and states uncertainty.

### 3. Approach Tree Quality

1. Treats the approach tree as a flat note.
2. Creates broad or unverifiable nodes.
3. Uses plausible nodes but weak parent/repair relationships.
4. Maintains smallest-verifiable nodes with valid modes and history.
5. Keeps problem inheritance, repair paths, evidence links, and next actions
   clear enough to resume later.

### 4. Experiment Evidence

1. Omits command/config/output identity.
2. Records results without validity or interpretation.
3. Records evidence but weakly links it to nodes or proposals.
4. Records independent experiment evidence with validity and target impacts.
5. Preserves replayable evidence and updates or retracts node support according
   to evidence validity.

### 5. Proposal Lifecycle

1. Pushes local findings directly into canonical wiki pages.
2. Creates vague proposals without evidence scope.
3. Uses proposal states but weak strengthening criteria.
4. Keeps draft/strengthening/ready states evidence-gated.
5. Produces a local proposal and transfer packet that are ready for proposal
   lint/review when the user approves wiki write-back.

### 6. Research Grounding Injection

1. Performs code work inside Lab.
2. Gives vague advice with no evidence return path.
3. Names a coding task but omits implementation prior, validity, or output
   identity.
4. Injects active node, relevant Paper Wiki pages, related papers or code/repo
   links when available, task, expected output, and validity criteria.
5. Injects compact paper/wiki implementation grounding that another coding
   workflow can use immediately and return as Lab evidence without ambiguity.

### 6a. Research Code Style

1. Does not mention code shape for an exploratory research slice.
2. Uses generic wording such as "clean code" or "maintainable code" only.
3. Mentions readable research code but does not make it a downstream acceptance
   criterion.
4. Requires a linear, inspectable main flow when the task is a one-off
   calibration builder, probe, ablation, sanity check, dataset script, or eval
   script.
5. Keeps source branches, configs, seeds, splits, metrics, sample limits, and
   output identity visible near the call site; rejects single-use
   parser/loader/selector helper layers unless real reuse, risky boundary
   isolation, or a stable external API justifies them.

### 7. Boundary Correctness

1. Mixes source facts, wiki synthesis, user insight, local evidence, and
   uncertainty.
2. Labels some boundaries but still lets local evidence rewrite paper facts.
3. Keeps most boundaries clear with minor ambiguity.
4. Separates all major evidence identities.
5. Makes boundaries explicit in every decision, proposal, and grounding
   injection.

### 8. Lightweight Behavior

1. Turns Lab into a feature workflow, coding agent, or command catalog.
2. Adds unnecessary artifacts for simple requests.
3. Mostly lightweight but occasionally over-routes.
4. Uses only the artifacts needed for the current idea graph task.
5. Preserves agent flexibility while enforcing placement, grounding, evidence,
   and write-back quality.

## Repair Buckets

- `idea_placement`
- `wiki_grounding`
- `approach_tree`
- `experiment_evidence`
- `proposal_lifecycle`
- `grounding_injection`
- `research_code_style`
- `boundary_correctness`
- `entry_selection`
- `lightweight_behavior`
