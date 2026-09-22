# Continuous System Optimization Quality Rubric

## Purpose

Judge whether a continuous optimization round improved Meridian Paper Wiki as a system rather than as a local case fix.

## Dimensions

1. Evidence-based lever selection
   - Top levers are chosen from audit, retrieval, MCP, source, or product evidence.
   - The brief explains why the selected levers affect real research or coding use.

2. Generalized mechanism repair
   - Fixes change reusable behavior such as retrieval routing, audit semantics, provenance schema, consolidation, or proposal linting.
   - The round does not rely on manually rewriting a single page to pass a case.

3. Retrieval context usefulness
   - Context includes the right mix of synthesis, method, concept, claim, evidence, and source paper pages for the query.
   - Context remains compact and avoids debug artifacts.

4. Traceability and boundary preservation
   - Source facts, wiki synthesis, user insights, and uncertainty stay labeled.
   - `source_papers` means paper provenance; broader compiled pages stay in `sources` or related fields.

5. Before/after evidence
   - The round reports deterministic metrics, audit deltas, changed artifacts, and residuals.
   - Failing cases are diagnosed into repair buckets.

6. Convergence judgment
   - Remaining residuals are named and classified as blocker or non-blocker.
   - The next likely high-leverage direction is explicit.

## Hard Failures

- Fix hardcodes a query, paper title, or eval case instead of improving a mechanism.
- Retrieval returns internal `.drafts` or `.versions` artifacts as product context.
- Source-quality hold material is promoted as scientific evidence.
- User insight is mixed into paper source facts.
- The round has only reports and no actual optimization.

