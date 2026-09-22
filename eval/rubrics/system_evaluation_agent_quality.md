# System Evaluation Agent Quality Rubric

## Purpose

Evaluate whether a Meridian Paper Wiki use case produced system-quality context and artifacts for a real research or coding task. This rubric is for the system evaluator, not for single-paper ingest judging.

The evaluator should score the workflow output, identify hard failures, and map findings to generalized repair buckets.

## Output Contract

Return:

- `decision`: `pass`, `needs_refine`, or `fail`
- `weighted_score`
- `dimension_scores`
- `hard_failures`
- `findings`
- `repair_buckets`
- `recommended_generalized_fixes`
- `residual_risks`
- `next_eval_case_suggestions`

## Dimensions

### 1. Task Usefulness

5: The context clearly supports the research or coding task and points to useful next reading or action.  
4: The context is usable with minor gaps.  
3: Some relevant material appears, but the user would still need broad manual search.  
2: The context is mostly title or keyword match.  
1: The context does not support the task.

### 2. Retrieval Context Quality

5: Required page families, sections, and hard-negative suppression all work.  
4: Main pages are present, with minor missing sections or ordering issues.  
3: Relevant pages appear but important result types or sections are missing.  
2: The context is sparse, redundant, or poorly routed.  
1: Retrieval returns empty or misleading context.

### 3. Compiled Knowledge Density

5: The context includes the right blend of synthesis, method, concept, claim, evidence, and source paper pages.  
4: Compiled pages are present and useful, but one role is thin.  
3: Mostly paper pages with some compiled support.  
2: Compiled layer exists but is low-density or stub-like.  
1: No compiled knowledge is used.

### 4. Provenance / Traceability

5: Every important claim or synthesis can be traced to source papers, sections, evidence, or user notes.  
4: Provenance is mostly visible with minor missing links.  
3: Provenance exists but requires manual reconstruction.  
2: Several important statements lack source paths.  
1: Source traceability is absent or misleading.

### 5. Boundary Correctness

5: Source facts, wiki synthesis, user insight, decisions, uncertainty, and debug artifacts are clearly separated.  
4: Boundaries are clear with minor labeling issues.  
3: Some boundaries are implicit.  
2: User insight or synthesis can be mistaken for source facts.  
1: A hard boundary failure occurs.

### 6. Synthesis Quality

5: Synthesis pages separate source facts from inference, include an evidence map, and expose open questions.  
4: Synthesis is useful but one required section is thin.  
3: Synthesis captures the topic but lacks strong evidence structure.  
2: Synthesis is mostly summary or duplicated paper text.  
1: Synthesis is absent or unsafe.

### 7. Concept Usefulness For Coding / Debug / Probe

5: Concept pages explain why the concept matters, implementation implications, failure modes, checks/probes, and provenance.  
4: Concepts are useful with one thin section.  
3: Concepts define background but are weak for coding or debugging.  
2: Concepts are generic notes or low-information stubs.  
1: Needed preliminary knowledge is missing.

### 8. Claim / Evidence Support Quality

5: Claim and evidence pages expose support, limits, provenance, and reliability.  
4: Claim/evidence support is mostly visible.  
3: Evidence appears but is not easy to trace.  
2: Claims are retrieved without visible evidence.  
1: Unsupported or source-quality-held material is treated as evidence.

### 9. Prompt / MCP Entry Consistency

5: Product entries expose canonical context, compact summaries, paths, provenance, and next actions consistently.  
4: Entries are consistent with minor wording or compactness issues.  
3: CLI/debug details leak into the product surface occasionally.  
2: Entry behavior depends too much on internal command knowledge.  
1: Debug artifacts or unsafe write paths appear as product outputs.

### 10. Optimization Actionability

5: Findings identify repair buckets and generalized fixes.  
4: Findings are actionable but one root cause is under-specified.  
3: Findings mix page-level and mechanism-level issues.  
2: Findings are mostly subjective criticism.  
1: No actionable repair path is provided.

## Hard Fail Rules

Mark `decision = fail` if any of these occur:

- Retrieval or selected pages expose `.drafts`, `.versions`, `review.md`, or `paper_candidate.md` as product context.
- Source-quality hold material is used as scientific evidence instead of cleanup/provenance context.
- User insight is mixed into paper source facts.
- A write operation bypasses proposal/lint gates.
- The workflow cannot trace important claims to source papers, evidence, or clearly labeled synthesis.

## Repair Buckets

- `retrieval_context`
- `retrieval_ranking`
- `knowledge_layer`
- `provenance_schema`
- `artifact_boundary`
- `source_quality_routing`
- `synthesis_quality`
- `concept_layer`
- `claim_evidence_traceability`
- `entry_contract`
- `personalization_boundary`

The evaluator should recommend mechanism-level fixes in these buckets, not one-off edits to a single page.
