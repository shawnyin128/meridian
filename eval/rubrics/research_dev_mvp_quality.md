# Research Dev MVP Quality Rubric

Use this rubric to evaluate whether an agent followed the lightweight Meridian
Research Dev workflow. Do not require a fixed command path or exact wording.
Judge outcome properties.

## Hard Fail Rules

Hard fail if any apply:

- The task clearly depends on paper/method/concept/evidence context, but the agent does not retrieve or cite wiki context.
- The agent treats user insight, wiki synthesis, or local experiment evidence as paper source fact.
- The agent proposes expensive experiments without a learning target or evidence plan.
- The agent silently rewrites canonical wiki state from a dev task instead of using proposal-first write-back.
- The agent forces heavy workflow artifacts for a trivial direct coding task.
- The agent stops at advice for an implementation, debugging, reproduction, or
  experiment task where a small runnable research-code slice was feasible.

## Scoring

Score each dimension from 1 to 5.

### 1. Scenario Classification

1. Misclassifies the task and chooses an irrelevant workflow.
2. Identifies a broad category but misses the research event.
3. Chooses a plausible scenario with some ambiguity.
4. Correctly identifies the primary scenario and adjacent concerns.
5. Correctly classifies the scenario and explains why that workflow is the right lightweight path.

### 2. Wiki Retrieval Usage

1. Skips wiki retrieval when it is required.
2. Performs shallow keyword retrieval without reading useful sections.
3. Retrieves relevant pages but does not use them to shape the output.
4. Uses method/concept/evidence/synthesis context to shape the plan.
5. Retrieves compact context, reads high-value sections, traces evidence when needed, and reports uncertainty.

### 3. Context Packet Usefulness

1. Dumps unrelated context.
2. Lists pages without explaining why they matter.
3. Gives a usable but incomplete packet.
4. Separates wiki context, repo context, evidence, and gaps.
5. Produces a compact packet that directly supports the next research-code slice.

### 4. Research-Code Slice Quality

1. Produces a vague or oversized task.
2. Produces a software feature plan without research learning criteria.
3. Defines a plausible slice but weak stop conditions.
4. Defines a bounded slice with learning target, controls, and stop condition.
5. Defines and executes or prepares the smallest credible slice, runs or names
   the right check, and explains what result changes the next decision.

### 5. Evidence Identity

1. Omits command/config/metric/output identity.
2. Mentions evidence generally but cannot recover it later.
3. Records partial identity.
4. Records enough command/config/result identity for replay or interpretation.
5. Ties evidence identity to hypothesis impact, wiki pages, and future retrieval.

### 6. Sanity / Probe Quality

1. Suggests broad reruns or tuning before cheap checks.
2. Suggests generic checks not tied to failure hypotheses.
3. Provides a few useful checks.
4. Maps checks to concrete failure hypotheses.
5. Prioritizes cheap probes that shrink uncertainty before costly experiments.

### 7. Research-Friendly Code Principle

1. Optimizes only for production-style minimalism.
2. Hides experimental knobs or removes useful observability.
3. Keeps code mostly readable but weak for ablation/probe work.
4. Preserves clear configs, knobs, and instrumentation.
5. Produces code or an implementation plan that is readable, extensible, observable, and easy to compare across variants.

### 8. Write-back Boundary

1. Silently mutates or proposes mutating canonical source facts.
2. Mentions write-back but blurs source/synthesis/user/local evidence.
3. Uses write-back only partially.
4. Produces a proposal-first write-back plan with boundaries.
5. Produces a durable write-back packet that is ready for lint/proposal flow and future retrieval.

### 9. Checkpoint Discipline

1. Ignores obvious research rollback pressure.
2. Suggests generic commits without research identity.
3. Suggests checkpoints inconsistently.
4. Recommends checkpoints at hypothesis/probe/result/risky-refactor boundaries.
5. Makes or prepares focused, impact-readable checkpoints when scope is clean
   or authorized, and separates hypothesis logic, instrumentation, cleanup, and
   generated evidence.

### 10. Lightweight Behavior

1. Forces heavy ceremony or route machinery for ordinary tasks.
2. Adds unnecessary artifacts or process.
3. Mostly lightweight but occasionally over-routes.
4. Uses only the artifacts needed for the scenario.
5. Preserves agent freedom while enforcing evidence, retrieval, and write-back quality.

## Repair Buckets

- `scenario_classification`
- `wiki_retrieval`
- `context_packet`
- `research_slice`
- `evidence_identity`
- `sanity_probe`
- `research_friendly_code`
- `writeback_boundary`
- `checkpoint_discipline`
- `lightweight_behavior`
