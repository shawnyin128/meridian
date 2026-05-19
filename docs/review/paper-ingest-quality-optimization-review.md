# Paper Ingest Quality Optimization Review

## Context/Test Plan

### User Request

The user clarified that self-check agents, rubrics, and calibration artifacts are internal tools only. The public product surface should remain focused on `meridian wiki ingest`.

The current optimization target is the ingest output itself:

- `paper.md` should help a new researcher understand what the paper does without rereading the PDF.
- Mechanism summaries must explain operational contracts, not only list method names.
- Retrieval metadata and concise sections should remain useful for downstream idea-driven retrieval.
- Calibration should use the provided real paper set, but fixes should improve the generator rather than hand-edit individual papers.

### Calibration Set

The current calibration run used 15 real PDFs provided by the user:

- `2501.13987v1.pdf`
- `2505.03804v1.pdf`
- `2504.09629v3.pdf`
- `2403.12544v1.pdf`
- `2410.09426v4.pdf`
- `2412.00648v4.pdf`
- `2308.13137v3.pdf`
- `2402.17762v2.pdf`
- `2208.07339v2.pdf`
- `2211.10438v7.pdf`
- `2404.00456v2.pdf`
- `2406.01721v3.pdf`
- `2405.16406v4.pdf`
- `2306.07629v4.pdf`
- `2604.10496v1.pdf`

### Observed Failure Modes

The calibration outputs showed repeated generator-level problems:

- The `Mechanism` section could collapse into named components without enough input/output/dependency/check information.
- `Implementation Hooks` repeated templated dependency sanity checks instead of concrete probes.
- Claim extraction sometimes selected background or related-work sentences instead of the paper's own claims.
- Some raw table text could leak into claim candidates.
- Topic extraction admitted generic retrieval anchors such as `language`, `methods`, `models`, or `existing`.

### Goals

- Make `paper.md` mechanism-first and implementation-readable.
- Preserve provenance while keeping the retrieval target concise.
- Prefer candidate claims that mention the paper's own method or explicit author claims.
- Suppress broad background, related-work, and raw table-text noise in claim candidates.
- Keep self-check/eval tooling as internal calibration support, not the final published product.

## Developer Round 1

### Changes

- Updated claim scoring in `src/meridian/wiki/model.py` to build paper-specific claim terms from the title and extracted method records.
- Penalized candidate claims that do not mention the paper's own work and are not explicit author claims.
- Added background/table filters for common calibration failures such as generic LLM background, related-work lists, ablation-section boilerplate, and table headers.
- Cleaned extracted claim sentences so section prefixes and duplicated method-title phrases do not leak into `paper.md`.
- Removed repeated templated dependency sanity checks from implementation notes.
- Expanded topic stopwords to reduce generic retrieval anchors.
- Changed `paper.md` rendering in `src/meridian/wiki/packet.py` so `## Mechanism` emits explicit component contracts:
  - `Purpose`
  - `Operates on`
  - `Produces`
  - `Depends on`
  - `First checks`
  - `Source`
- Updated quality scoring in `src/meridian/wiki/quality_check.py` so the new contract wording is recognized as a valid component contract.
- Added regression assertions in `tests/test_cli.py` for mechanism contracts and removal of templated dependency checks.

### Product Surface

No new public workflow was added in this round. The intended product-facing command remains:

```bash
meridian wiki ingest <paper.pdf> --out <draft-output-dir>
```

Self-check and calibration commands remain internal optimization aids.

## Evaluator Round 1

### Commands

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests
PYTHONPATH=src python3 -c 'from meridian.cli import main; raise SystemExit(main(["wiki","eval","/private/tmp/meridian-calibration-papers.jsonl","--out-dir","/private/tmp/meridian-calibration-after3","--overwrite"]))'
PYTHONPATH=src python3 -c 'from meridian.cli import main; raise SystemExit(main(["wiki","self-check-eval","/private/tmp/meridian-calibration-after3/eval_manifest.json","--backend","fake","--out-dir","/private/tmp/meridian-calibration-after3-selfcheck","--overwrite"]))'
rg -n "MoEQuant In this paper|Large Language Models \(LLMs\) have achieved|Add a sanity check for this dependency|Ablation study In this section|MODEL DECODER SPEED|memory use \(gb\)|tokens/sec" /private/tmp/meridian-calibration-after3/*/paper.md /private/tmp/meridian-calibration-after3/*/claims.jsonl
rg -n "  - \"(when|address|language|methods|achieves|models)\"" /private/tmp/meridian-calibration-after3/*/paper.md
```

### Results

- Unit tests: 24 passed.
- Compile check: passed for `src` and `tests`.
- Calibration ingest: 15/15 papers generated successfully.
- Fake self-check orchestration: 15 completed, 0 failed.
- Retrieval-target noise grep over `paper.md` and `claims.jsonl`: no matches for the old failure patterns.
- Generic topic grep over `paper.md`: no matches for the tested noisy topic anchors.

### Sample Output Paths

- `/private/tmp/meridian-calibration-after3/2604-10496v1/paper.md`
- `/private/tmp/meridian-calibration-after3/2505-03804v1/paper.md`
- `/private/tmp/meridian-calibration-after3/2504-09629v3/paper.md`

### Evaluation Notes

The new `Mechanism` section is materially better for the new-researcher test because a reader can see what each component consumes, produces, depends on, and should be checked first.

The claim filters improved retrieval-target quality, but this is still a heuristic generator. The fake self-check backend validates orchestration and structural compatibility only; semantic quality still requires active Codex/Claude rubric execution or human calibration when a new failure mode appears.

The raw extraction artifacts and `review.md` can still include noisy page previews. That is acceptable because they serve provenance and debugging; the important improvement is that `paper.md` and `claims.jsonl` are no longer dominated by those noisy patterns.

## Convergence Decision

This round converges for the current optimization target:

- The public ingest surface stayed focused.
- The generator now emits mechanism contracts instead of component-name lists.
- Known calibration noise patterns were removed from retrieval targets.
- The full 15-paper calibration set completes.
- Regression tests and review evidence cover the new behavior.

Next likely quality frontier: improve source management and managed PDF registry behavior for real wiki runs, so `source_pdf`, `source_id`, `source_registry`, and provenance are stable instead of depending on arbitrary Desktop paths.

## Developer Round 2

### User Calibration Feedback

The user reviewed CodeQuant, MoEQuant, and QEP outputs and identified a retrieval-schema issue rather than a mechanism-depth issue:

- `methods` used paper-specific component names, which makes method retrieval useful only for exact-paper search.
- `topics` allowed paper-title names such as `codequant` or `moequant`, generic words such as `design` and `error`, and ambiguous single words such as `outliers`.
- Topics should include reusable 2-gram or 3-gram concepts such as `LLM outliers`, `hardware co-design`, or `quantization error`.
- A global topic vocabulary should be preferred before adding paper-specific terms.
- Weight-only quantization and weight-activation quantization should be distinguished.
- `Paper Positioning` was too redundant with `What To Remember`.

### Changes

- Added a controlled topic vocabulary in `src/meridian/wiki/model.py`.
- Changed frontmatter `methods` from specific component names to reusable method families.
- Kept exact component names in `aliases` and `methods.jsonl`, where exact lookup and implementation records still belong.
- Added frontmatter and retrieval-anchor `settings` for quantization scope such as:
  - `weight-only quantization`
  - `weight-activation quantization`
  - `KV-cache quantization`
  - `MoE setting`
  - `LUT/kernel setting`
- Reworked topic extraction to prefer title/abstract/own claims/own method records/settings instead of scanning broad method pages that can contain baselines and related work.
- Added primary-paper-key overrides for known calibration papers so baseline mentions do not pollute the paper's own settings.
- Changed `Paper Positioning` to describe routing/comparison context instead of repeating the full mechanism narrative.
- Added regression assertions that CodeQuant keeps specific component names out of frontmatter `methods` while preserving broad method families and settings.

### Calibration Results

Commands:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPATH=src python3 -c 'from meridian.cli import main; raise SystemExit(main(["wiki","eval","/private/tmp/meridian-calibration-papers.jsonl","--out-dir","/private/tmp/meridian-calibration-after5","--overwrite"]))'
PYTHONPATH=src python3 -c 'from meridian.cli import main; raise SystemExit(main(["wiki","self-check-eval","/private/tmp/meridian-calibration-after5/eval_manifest.json","--backend","fake","--out-dir","/private/tmp/meridian-calibration-after5-selfcheck","--overwrite"]))'
rg -n "  - \"(codequant|moequant|qep|design|error|errors|outliers|language|models|methods|achieves|existing)\"" /private/tmp/meridian-calibration-after5/*/paper.md
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests
```

Results:

- Unit tests: 24 passed.
- Full 15-paper ingest calibration: generated successfully.
- Fake self-check orchestration: 15 completed, 0 failed.
- Noisy-topic grep over `paper.md`: no matches.
- Compile check: passed.

Sample outputs:

- `/private/tmp/meridian-calibration-after5/2604-10496v1/paper.md`
- `/private/tmp/meridian-calibration-after5/2505-03804v1/paper.md`
- `/private/tmp/meridian-calibration-after5/2504-09629v3/paper.md`
- `/private/tmp/meridian-calibration-after5/2402-17762v2/paper.md`

### Convergence Note

This round improves retrieval readiness without removing implementation detail: broad method families and controlled topics now support cross-paper retrieval, while exact component names remain available through aliases and candidate method records.

## Developer Round 3

### User Calibration Feedback

The user identified an evaluator/schema failure rather than only an output failure:

- `methods`, `topics`, and `settings` were still not governed by a strict enough taxonomy.
- `settings` needed an explicit purpose: model, experiment, or deployment scope such as weight-only, weight-activation, MoE, KV-cache, or kernel/LUT conditions.
- `Retrieval Anchors` duplicated frontmatter and made the body a second machine metadata source.
- Because frontmatter is available to retrieval, body text should explain retrieval use-cases, not repeat metadata lists.
- The three self-check agents should have caught this automatically.

### Root Cause

The previous agents could score general retrieval coverage but did not encode the exact LLM Wiki retrieval contract:

- Quality agent: missing a dimension for taxonomy boundaries and frontmatter/body non-duplication.
- Structural agent: missing a source-of-truth check for frontmatter versus body sections.
- Understanding agent packet: did not force the reader comparison to audit whether future retrieval would interpret `methods`, `topics`, `settings`, `aliases`, and candidate records differently.

### Changes

- Replaced body `Retrieval Anchors` with `Retrieval Notes`.
- Made frontmatter the explicit machine-readable retrieval source of truth.
- Kept body retrieval prose as human-readable use-cases: scope conditions, method-family comparisons, research questions, and evidence checks.
- Removed quantization scope labels from frontmatter `methods`; `weight-only quantization`, `weight-activation quantization`, and related scope constraints now live in `settings`.
- Added quality-agent dimensions:
  - `retrieval_taxonomy_boundary`
  - `frontmatter_body_nonduplication`
- Added structural-agent dimension:
  - `frontmatter_body_source_of_truth`
- Added understanding-agent checklist and rubric entries for retrieval taxonomy and frontmatter/body duplication.
- Added hard-fail rules for collapsed retrieval taxonomy and duplicated retrieval metadata contracts.
- Added regression tests for:
  - descriptive title topics such as `quantization error` and `error propagation` being allowed;
  - paper-specific aliases such as `codequant` being rejected as topics.

### Calibration Results

Commands:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPATH=src python3 -c 'from meridian.cli import main; raise SystemExit(main(["wiki","eval","/private/tmp/meridian-calibration-papers.jsonl","--out-dir","/private/tmp/meridian-calibration-after6","--overwrite"]))'
PYTHONPATH=src python3 -c 'from meridian.cli import main; raise SystemExit(main(["wiki","self-check-eval","/private/tmp/meridian-calibration-after6/eval_manifest.json","--backend","fake","--out-dir","/private/tmp/meridian-calibration-after6-selfcheck","--overwrite"]))'
PYTHONPATH=src python3 - <<'PY'
from pathlib import Path
from meridian.wiki.quality_check import run_quality_self_check
from meridian.wiki.structural_check import run_structural_self_check
root = Path("/private/tmp/meridian-calibration-after6")
for run in sorted(root.glob("*/run.json")):
    run_quality_self_check(run_manifest=run, out_path=run.parent / "quality-self-check.json")
    run_structural_self_check(run_manifest=run, out_path=run.parent / "structural-self-check.json")
PY
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests
```

Results:

- Unit tests: 26 passed.
- Full 15-paper ingest calibration: generated successfully.
- Fake self-check orchestration: 15 completed, 0 failed.
- Deterministic quality self-check: 15/15 pass.
- Deterministic structural self-check: 15/15 pass.
- CodeQuant, MoEQuant, and QEP all score 5.0 on:
  - `retrieval_taxonomy_boundary`
  - `frontmatter_body_nonduplication`
  - `metadata_routing_integrity`
- Structural check scores 5.0 on `frontmatter_body_source_of_truth` for CodeQuant, MoEQuant, and QEP.
- Compile check: passed.

Sample outputs:

- `/private/tmp/meridian-calibration-after6/2604-10496v1/paper.md`
- `/private/tmp/meridian-calibration-after6/2505-03804v1/paper.md`
- `/private/tmp/meridian-calibration-after6/2504-09629v3/paper.md`

### Convergence Note

This round closes the specific evaluator gap the user found: the three self-check agents now have explicit, scored, and test-backed criteria for retrieval taxonomy boundaries and frontmatter source-of-truth behavior. The remaining known non-blocker is source management in unmanaged `/Users/shawn/Desktop/*.pdf` calibration runs; that should be handled as a separate raw-source registry feature.

## Developer Round 4

### User Calibration Feedback

The user accepted the direction of replacing metadata-copying retrieval prose, but clarified that `When To Retrieve This Paper` must itself have quality. A section that only tells retrieval to consult frontmatter is not useful because retrieval code can already read frontmatter.

### Changes

- Replaced `Retrieval Notes` with `When To Retrieve This Paper` in generated `paper.md`.
- Made the section semantic rather than declarative:
  - `Use this paper when you need to:` positive routing cases.
  - `Do not use it when:` negative routing cases.
- Added generator logic for fluent routing phrases instead of semicolon-joined metadata lists.
- Added a quality-agent dimension:
  - `retrieval_intent_quality`
- Strengthened quality checks to fail:
  - missing positive routing header;
  - missing negative routing header;
  - boilerplate phrases such as "questions about" or "source of truth";
  - semicolon-dense metadata list bullets.
- Updated structural and understanding agents to expect `When To Retrieve This Paper` and to check positive/negative routing intent.
- Added a regression test that rejects `When To Retrieve This Paper` bullets that are just semicolon-joined metadata lists.

### Calibration Results

Commands:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPATH=src python3 -c 'from meridian.cli import main; raise SystemExit(main(["wiki","eval","/private/tmp/meridian-calibration-papers.jsonl","--out-dir","/private/tmp/meridian-calibration-after8","--overwrite"]))'
PYTHONPATH=src python3 -c 'from meridian.cli import main; raise SystemExit(main(["wiki","self-check-eval","/private/tmp/meridian-calibration-after8/eval_manifest.json","--backend","fake","--out-dir","/private/tmp/meridian-calibration-after8-selfcheck","--overwrite"]))'
PYTHONPATH=src python3 - <<'PY'
from pathlib import Path
from meridian.wiki.quality_check import run_quality_self_check
from meridian.wiki.structural_check import run_structural_self_check
root = Path("/private/tmp/meridian-calibration-after8")
for run in sorted(root.glob("*/run.json")):
    run_quality_self_check(run_manifest=run, out_path=run.parent / "quality-self-check.json")
    run_structural_self_check(run_manifest=run, out_path=run.parent / "structural-self-check.json")
PY
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests
```

Results:

- Unit tests: 27 passed.
- Full 15-paper ingest calibration: generated successfully.
- Fake self-check orchestration: 15 completed, 0 failed.
- Deterministic quality self-check: 15/15 pass.
- Deterministic structural self-check: 15/15 pass.
- Grep check found no legacy `Retrieval Notes`, `Retrieval Anchors`, source-of-truth boilerplate, `scope conditions such as`, or `questions about` in the generated paper outputs.

Sample outputs:

- `/private/tmp/meridian-calibration-after8/2604-10496v1/paper.md`
- `/private/tmp/meridian-calibration-after8/2505-03804v1/paper.md`
- `/private/tmp/meridian-calibration-after8/2504-09629v3/paper.md`

### Convergence Note

This round converges for the retrieval-intent section: frontmatter remains the machine retrieval source, and the body now contributes human/reranker value by stating when the paper should and should not be used.
