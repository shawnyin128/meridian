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
