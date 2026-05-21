# System Evaluation Agent MVP

## Purpose

The System Evaluation Agent reviews a complete Meridian Paper Wiki use case. It is not a single-paper judge and it is not a replacement for human calibration. Its job is to reduce manual review by turning a use-wiki or update-wiki run into structured quality findings and mechanism-level repair buckets.

It evaluates whether retrieval context, selected canonical pages, and optional proposal or synthesis output actually support a research or coding task.

## What It Evaluates

- Task usefulness: whether the returned context helps the stated task.
- Retrieval quality: whether required page families and sections are present.
- Compiled knowledge density: whether the context uses synthesis, method, topic, concept, claim, and evidence pages instead of only paper summaries.
- Provenance: whether important statements can be traced to source papers, evidence, or labeled user insight.
- Boundary correctness: whether source facts, wiki synthesis, user insights, uncertainty, and debug artifacts remain separate.
- Product entry behavior: whether Prompt/MCP outputs expose canonical artifacts and hide internal artifacts.
- Optimization actionability: whether findings map to reusable repair mechanisms.

## What It Does Not Evaluate

- It does not prove paper-level scientific correctness.
- It does not replace human review for high-impact claims.
- It does not mutate canonical wiki pages.
- It does not call an API judge in the MVP. It writes a judge packet so Codex, Claude Code, or a future API/local judge can review the same case.

## CLI

```bash
meridian wiki system-evaluate \
  --wiki-root wiki \
  --case case.json \
  --context context.json \
  --out wiki/.drafts/evaluations/<case-id>/ \
  --rubric eval/rubrics/system_evaluation_agent_quality.md
```

Optional inputs:

- `--selected-page`: include canonical pages that were read after retrieval.
- `--proposal`: include a proposal or synthesis output.
- `--audit`: include audit summaries.
- `--overwrite`: replace an existing evaluation directory.

Outputs:

- `system-evaluation.json`: machine-readable decision, scores, findings, repair buckets, and recommended generalized fixes.
- `system-evaluation.md`: readable brief.
- `judge-packet.md`: packet for Codex/Claude/API/local judge review.

## Continuous Optimization Role

The continuous optimization loop should use this evaluator after a realistic task run:

1. Run retrieval or MCP context.
2. Read the highest-value canonical pages.
3. Generate any write-back proposal if the task produces durable value.
4. Run `system-evaluate`.
5. Convert findings into generalized fixes:
   - retrieval/context failures -> retrieval ranking or context packing
   - missing compiled pages -> knowledge or concept layer repair
   - weak traceability -> provenance schema and claim/evidence repair
   - boundary failures -> artifact boundary or source-quality routing
   - weak synthesis -> write-back schema or evolution repair

Human calibration is still useful when the deterministic scaffold passes but the semantic quality feels weak, or when the repair choice changes product boundaries.

## Batch Optimization Loop

For repeated use, run:

```bash
meridian wiki system-optimize-eval \
  --wiki-root wiki \
  --cases eval/cases/system_evaluation_optimization_loop.jsonl \
  --out-dir eval/runs/system-optimization-r1 \
  --rubric eval/rubrics/system_evaluation_agent_quality.md
```

This command runs retrieval for each case, evaluates every context, aggregates repair buckets, and writes an `optimization_plan.md`.

Use `--baseline-run` to compare a candidate run against a previous run. See `docs/system-evaluation-optimization-loop.md` for the full round schema.
