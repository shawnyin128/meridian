# Wiki Idea-Adjudication Eval (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the task-grounded eval harness that measures whether the Paper Wiki can act as an idea-adjudication safety net (prior-work / refuted / corroborating), and produce baseline numbers + a corpus-negativity census against the real vault.

**Architecture:** A set of flat stdlib-only modules under `src/meridian/evals/` (mirroring the existing `codex_routing.py`). A negativity **census** quantifies how much genuine negative signal even exists in the corpus. A **dataset** layer defines idea→expected-hits records (bootstrap-mined + a hand gold template). A **metrics** layer computes refute-recall@k, prior-work recall@k, corroborating-recall@k, and a false-comfort rate. A **baseline adapter** wraps the current `retrieve_papers` with naive section-origin stance bucketing. A **runner** ties it together and renders a durable Markdown summary. Everything is deterministic and offline.

**Tech Stack:** Python ≥3.9, standard library only. Tests via `unittest`. Reuses `meridian.wiki.corpus` (`retrieve_papers`, `parse_frontmatter`, `strip_frontmatter`, `split_sections`).

## Global Constraints

- **Python ≥ 3.9** (repo `requires-python`). Use only `typing`/`__future__` features valid on 3.9.
- **No new dependencies.** The only runtime dependency is `PyMuPDF`. This eval must be **pure standard library** — no numpy/pandas/pytest-only constructs.
- **Tests use `unittest`** (stdlib). Run a module with `python -m unittest tests.test_adjudication_eval -v`.
- **Evals live in `src/meridian/evals/`** as flat modules named `adjudication_*.py`, mirroring `codex_routing.py` / `codex_lab_graph.py`.
- **Deterministic + offline.** No network, no LLM, no `Math.random`-style nondeterminism in core logic. Time-stamped output directories are chosen by the caller and passed in, never generated inside pure functions.
- **Outputs are durable Markdown + JSONL** (repo convention), same spirit as `src/meridian/wiki/retrieval_audit.py`.
- **Active vault (wiki_root):** `D:\research\paper-wiki\wiki` — the directory that directly contains `papers/ methods/ topics/ concepts/ claims/ evidence/ syntheses/`.
- **Retrieval API is keyword-only:** `retrieve_papers(*, query, wiki_root, top_k=5, strategy="v1") -> RetrievalResult`; `.results` is a `list[dict]` with keys `page_id` (rel path, no suffix, posix), `path`, `title`, `type`/`result_type`, `score`, `matched_sections` (list of `{"heading","score","snippet"}`), `selection_reasons`.

---

### Task 1: Corpus negativity census

Quantifies the extraction hole cheaply: how many method `Failure Modes` / paper `Limitations` / evidence / claim sections carry a **substantive negative finding** vs boilerplate ("not yet synthesized", "No summary"). This single number informs whether the REFUTED gap is extraction-bound before any retrieval work.

**Files:**
- Create: `src/meridian/evals/adjudication_census.py`
- Test: `tests/test_adjudication_eval.py`

**Interfaces:**
- Consumes: `meridian.wiki.corpus.split_sections`, `strip_frontmatter`.
- Produces: `corpus_negativity_census(wiki_root: Path) -> dict` returning
  `{"sections_scanned": int, "boilerplate": int, "substantive_negative": int, "substantive_ratio": float, "by_kind": dict[str, dict[str,int]]}`.
  Also `is_substantive_negative(text: str) -> bool`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_adjudication_eval.py
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from meridian.evals.adjudication_census import (
    corpus_negativity_census,
    is_substantive_negative,
)


class NegativityCensusTests(unittest.TestCase):
    def test_boilerplate_is_not_substantive(self):
        self.assertFalse(is_substantive_negative("Failure modes are not yet synthesized; inspect linked paper limitations."))
        self.assertFalse(is_substantive_negative("No summary."))
        self.assertFalse(is_substantive_negative(""))

    def test_real_negative_is_substantive(self):
        self.assertTrue(is_substantive_negative("SmoothQuant-like smoothing can fail on rare extremely large activations."))
        self.assertTrue(is_substantive_negative("Rotation does not improve accuracy under W4A4 and degrades KV-cache recall."))

    def test_census_counts_kinds(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "methods").mkdir()
            (root / "papers").mkdir()
            (root / "methods" / "m1.md").write_text(
                "---\ntype: method\n---\n## Failure Modes\n\n- Failure modes are not yet synthesized.\n",
                encoding="utf-8",
            )
            (root / "papers" / "p1.md").write_text(
                "---\ntype: paper\n---\n## Limitations / Uncertainty\n\n- Method fails when batch size grows and degrades throughput.\n",
                encoding="utf-8",
            )
            census = corpus_negativity_census(root)
            self.assertEqual(census["sections_scanned"], 2)
            self.assertEqual(census["substantive_negative"], 1)
            self.assertEqual(census["boilerplate"], 1)
            self.assertAlmostEqual(census["substantive_ratio"], 0.5)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_adjudication_eval.NegativityCensusTests -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'meridian.evals.adjudication_census'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/meridian/evals/adjudication_census.py
from __future__ import annotations

from pathlib import Path

from meridian.wiki.corpus import split_sections, strip_frontmatter

# Sections that are supposed to hold negative / limitation content.
_NEGATIVE_SECTIONS = {
    "Failure Modes",
    "Common Failure Modes",
    "Limitations / Uncertainty",
    "Limitations",
    "Contradictions",
    "Contradicting Evidence",
}

# Kinds scanned: directory -> the section headings that carry negatives there.
_KINDS = {
    "methods": ("Failure Modes", "Common Failure Modes"),
    "papers": ("Limitations / Uncertainty", "Limitations"),
    "topics": ("Contradictions",),
    "concepts": ("Common Failure Modes",),
}

_BOILERPLATE_MARKERS = (
    "not yet synthesized",
    "were not explicit",
    "not explicit in extracted text",
    "no summary",
    "none recorded",
    "not recorded",
    "inspect linked paper limitations",
)

_NEGATIVE_CUES = (
    "fail", "fails", "failed", "does not", "doesn't", "cannot", "can't",
    "no improvement", "worse", "degrade", "degrades", "hurts", "underperform",
    "not robust", "unstable", "breaks down", "ineffective", "insufficient",
    "do not", "no gain", "regress",
)


def is_substantive_negative(text: str) -> bool:
    cleaned = " ".join(text.split()).strip().lower()
    if len(cleaned) < 15:
        return False
    if any(marker in cleaned for marker in _BOILERPLATE_MARKERS):
        return False
    return any(cue in cleaned for cue in _NEGATIVE_CUES)


def corpus_negativity_census(wiki_root: Path) -> dict:
    scanned = 0
    boilerplate = 0
    substantive = 0
    by_kind: dict[str, dict[str, int]] = {}
    for kind, headings in _KINDS.items():
        kind_dir = wiki_root / kind
        k_scanned = k_boiler = k_sub = 0
        if kind_dir.is_dir():
            for page in sorted(kind_dir.glob("*.md")):
                sections = split_sections(strip_frontmatter(page.read_text(encoding="utf-8")))
                for heading in headings:
                    if heading not in sections:
                        continue
                    k_scanned += 1
                    if is_substantive_negative(sections[heading]):
                        k_sub += 1
                    else:
                        k_boiler += 1
        by_kind[kind] = {"scanned": k_scanned, "boilerplate": k_boiler, "substantive_negative": k_sub}
        scanned += k_scanned
        boilerplate += k_boiler
        substantive += k_sub
    ratio = (substantive / scanned) if scanned else 0.0
    return {
        "sections_scanned": scanned,
        "boilerplate": boilerplate,
        "substantive_negative": substantive,
        "substantive_ratio": ratio,
        "by_kind": by_kind,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_adjudication_eval.NegativityCensusTests -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/meridian/evals/adjudication_census.py tests/test_adjudication_eval.py
git commit -m "feat(evals): corpus negativity census for adjudication eval"
```

---

### Task 2: Adjudication dataset schema + loader + gold template

Defines the eval record and reads/writes JSONL. Bootstrap and gold records share one schema; the loader tolerates a missing gold file.

**Files:**
- Create: `src/meridian/evals/adjudication_dataset.py`
- Test: `tests/test_adjudication_eval.py` (append a `TestCase`)

**Interfaces:**
- Produces:
  - `BUCKETS = ("prior_work", "refuted", "corroborating")`
  - `@dataclass AdjudicationItem` with fields `id: str`, `idea: str`, `domain: str`, `expected: dict[str, list[str]]` (keys = BUCKETS, values = page_ids), `coverage_truth: str` (`"rich"|"thin"|"none"`), `label_source: str`.
  - `load_dataset(path: Path) -> list[AdjudicationItem]` (returns `[]` if file absent).
  - `dump_dataset(items: list[AdjudicationItem], path: Path) -> None`
  - `write_gold_template(path: Path) -> None` (writes 2 commented example rows only if `path` does not exist).

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_adjudication_eval.py
from meridian.evals.adjudication_dataset import (
    BUCKETS,
    AdjudicationItem,
    dump_dataset,
    load_dataset,
    write_gold_template,
)


class DatasetTests(unittest.TestCase):
    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bootstrap.jsonl"
            items = [
                AdjudicationItem(
                    id="adj-0001",
                    idea="Use rotation to remove activation outliers for W4A4.",
                    domain="quantization",
                    expected={"prior_work": ["papers/quarot"], "refuted": ["papers/quarot"], "corroborating": []},
                    coverage_truth="rich",
                    label_source="bootstrap",
                )
            ]
            dump_dataset(items, path)
            loaded = load_dataset(path)
            self.assertEqual(len(loaded), 1)
            self.assertEqual(loaded[0].id, "adj-0001")
            self.assertEqual(set(loaded[0].expected.keys()), set(BUCKETS))
            self.assertEqual(loaded[0].expected["refuted"], ["papers/quarot"])

    def test_load_missing_returns_empty(self):
        self.assertEqual(load_dataset(Path("does-not-exist.jsonl")), [])

    def test_gold_template_written_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "gold.jsonl"
            write_gold_template(path)
            self.assertTrue(path.exists())
            first = path.read_text(encoding="utf-8")
            write_gold_template(path)  # must not overwrite
            self.assertEqual(path.read_text(encoding="utf-8"), first)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_adjudication_eval.DatasetTests -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'meridian.evals.adjudication_dataset'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/meridian/evals/adjudication_dataset.py
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

BUCKETS = ("prior_work", "refuted", "corroborating")
_COVERAGE = ("rich", "thin", "none")


@dataclass
class AdjudicationItem:
    id: str
    idea: str
    domain: str = ""
    expected: dict = field(default_factory=lambda: {b: [] for b in BUCKETS})
    coverage_truth: str = "rich"
    label_source: str = "bootstrap"

    def normalized_expected(self) -> dict:
        return {b: list(self.expected.get(b, []) or []) for b in BUCKETS}


def _item_from_dict(raw: dict) -> AdjudicationItem:
    expected_raw = raw.get("expected") or {}
    expected = {b: list(expected_raw.get(b, []) or []) for b in BUCKETS}
    coverage = raw.get("coverage_truth", "rich")
    if coverage not in _COVERAGE:
        coverage = "rich"
    return AdjudicationItem(
        id=str(raw["id"]),
        idea=str(raw.get("idea", "")),
        domain=str(raw.get("domain", "")),
        expected=expected,
        coverage_truth=coverage,
        label_source=str(raw.get("label_source", "bootstrap")),
    )


def load_dataset(path: Path) -> list:
    if not Path(path).exists():
        return []
    items: list = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        items.append(_item_from_dict(json.loads(line)))
    return items


def dump_dataset(items: list, path: Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for item in items:
        lines.append(
            json.dumps(
                {
                    "id": item.id,
                    "idea": item.idea,
                    "domain": item.domain,
                    "expected": item.normalized_expected(),
                    "coverage_truth": item.coverage_truth,
                    "label_source": item.label_source,
                },
                ensure_ascii=False,
            )
        )
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_gold_template(path: Path) -> None:
    path = Path(path)
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    example = {
        "id": "gold-0001",
        "idea": "Describe YOUR research idea in your own words here.",
        "domain": "optional-tag",
        "expected": {
            "prior_work": ["papers/<page-id-that-already-did-this>"],
            "refuted": ["papers/<page-id-with-evidence-it-fails>"],
            "corroborating": ["claims/<page-id-supporting-your-insight>"],
        },
        "coverage_truth": "rich",
        "label_source": "hand",
    }
    header = (
        "# Gold adjudication ideas — hand-labeled by the researcher.\n"
        "# One JSON object per line (lines starting with # are ignored).\n"
        "# page-ids are wiki paths WITHOUT .md, e.g. papers/quarot, claims/claim-001.\n"
        "# For ideas the corpus should NOT cover, set coverage_truth to \"none\" and leave buckets empty.\n"
    )
    path.write_text(header + json.dumps(example, ensure_ascii=False) + "\n", encoding="utf-8")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_adjudication_eval.DatasetTests -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/meridian/evals/adjudication_dataset.py tests/test_adjudication_eval.py
git commit -m "feat(evals): adjudication dataset schema, loader, gold template"
```

---

### Task 3: Bootstrap miner

Mines candidate `(idea, refuted-item)` pairs from **substantive** negative sections (reusing Task 1's classifier), turning each real limitation/failure into an eval idea phrased in the affirmative. Honest by construction: it only emits items where the source section passes `is_substantive_negative`, so a thin corpus yields a small set — which is itself the signal.

**Files:**
- Create: `src/meridian/evals/adjudication_miner.py`
- Test: `tests/test_adjudication_eval.py` (append)

**Interfaces:**
- Consumes: `is_substantive_negative` (Task 1); `AdjudicationItem`, `BUCKETS` (Task 2); `parse_frontmatter`, `strip_frontmatter`, `split_sections`.
- Produces: `mine_bootstrap_items(wiki_root: Path, limit: int | None = None) -> list[AdjudicationItem]`. Each item: `expected["refuted"] = [page_id]`, `coverage_truth="rich"`, `label_source="bootstrap"`, `idea` = affirmative phrasing derived from the page title, deterministic `id` = `"boot-" + zero-padded index`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_adjudication_eval.py
from meridian.evals.adjudication_miner import mine_bootstrap_items


class MinerTests(unittest.TestCase):
    def test_mines_only_substantive_negatives(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "methods").mkdir()
            (root / "methods" / "rotation.md").write_text(
                "---\ntype: method\ntitle: Rotation-based quantization\n---\n"
                "## Failure Modes\n\n- Rotation does not improve W4A4 accuracy and degrades KV-cache recall.\n",
                encoding="utf-8",
            )
            (root / "methods" / "empty.md").write_text(
                "---\ntype: method\ntitle: Empty method\n---\n"
                "## Failure Modes\n\n- Failure modes are not yet synthesized.\n",
                encoding="utf-8",
            )
            items = mine_bootstrap_items(root)
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0].expected["refuted"], ["methods/rotation"])
            self.assertEqual(items[0].label_source, "bootstrap")
            self.assertTrue(items[0].idea)

    def test_limit_respected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "methods").mkdir()
            for i in range(5):
                (root / "methods" / f"m{i}.md").write_text(
                    f"---\ntype: method\ntitle: Method {i}\n---\n"
                    "## Failure Modes\n\n- This approach fails and degrades accuracy badly.\n",
                    encoding="utf-8",
                )
            self.assertEqual(len(mine_bootstrap_items(root, limit=3)), 3)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_adjudication_eval.MinerTests -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'meridian.evals.adjudication_miner'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/meridian/evals/adjudication_miner.py
from __future__ import annotations

from pathlib import Path

from meridian.evals.adjudication_census import is_substantive_negative
from meridian.evals.adjudication_dataset import BUCKETS, AdjudicationItem
from meridian.wiki.corpus import parse_frontmatter, split_sections, strip_frontmatter

# directory -> negative section headings to mine (same map spirit as the census)
_MINE = {
    "methods": ("Failure Modes", "Common Failure Modes"),
    "papers": ("Limitations / Uncertainty", "Limitations"),
    "topics": ("Contradictions",),
}


def _affirmative_idea(title: str, kind: str) -> str:
    title = title.strip() or "this approach"
    if kind == "methods":
        return f"I want to use {title} for my setting."
    if kind == "papers":
        return f"I want to build directly on the approach in {title}."
    return f"I want to pursue the direction described by {title}."


def mine_bootstrap_items(wiki_root: Path, limit: int | None = None) -> list:
    items: list = []
    index = 0
    for kind, headings in _MINE.items():
        kind_dir = wiki_root / kind
        if not kind_dir.is_dir():
            continue
        for page in sorted(kind_dir.glob("*.md")):
            text = page.read_text(encoding="utf-8")
            sections = split_sections(strip_frontmatter(text))
            if not any(h in sections and is_substantive_negative(sections[h]) for h in headings):
                continue
            frontmatter = parse_frontmatter(text)
            title = str(frontmatter.get("title") or page.stem)
            page_id = f"{kind}/{page.stem}"
            index += 1
            items.append(
                AdjudicationItem(
                    id=f"boot-{index:04d}",
                    idea=_affirmative_idea(title, kind),
                    domain=kind,
                    expected={"prior_work": [], "refuted": [page_id], "corroborating": []},
                    coverage_truth="rich",
                    label_source="bootstrap",
                )
            )
            if limit is not None and len(items) >= limit:
                return items
    return items
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_adjudication_eval.MinerTests -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/meridian/evals/adjudication_miner.py tests/test_adjudication_eval.py
git commit -m "feat(evals): bootstrap miner for adjudication refuted-labels"
```

---

### Task 4: Metrics

Pure functions: per-bucket recall@k and aggregate metrics including the **false-comfort rate** (the safety-net's most important failure: reporting coverage when the truth is none).

**Files:**
- Create: `src/meridian/evals/adjudication_metrics.py`
- Test: `tests/test_adjudication_eval.py` (append)

**Interfaces:**
- Consumes: `BUCKETS`, `AdjudicationItem` (Task 2).
- Produces:
  - `@dataclass AdjudicationPrediction` with `buckets: dict[str, list[str]]` (keys = BUCKETS, page_ids ranked) and `coverage: str` (`"rich"|"thin"|"none"`).
  - `bucket_recall(expected: list[str], predicted: list[str]) -> float | None` (None when `expected` empty).
  - `evaluate(items: list[AdjudicationItem], predictions: dict[str, AdjudicationPrediction]) -> dict` returning aggregate recalls per bucket, `false_comfort_rate`, `item_count`, and `per_item` list.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_adjudication_eval.py
from meridian.evals.adjudication_metrics import (
    AdjudicationPrediction,
    bucket_recall,
    evaluate,
)


class MetricsTests(unittest.TestCase):
    def test_bucket_recall_basic(self):
        self.assertEqual(bucket_recall(["a", "b"], ["a", "x"]), 0.5)
        self.assertEqual(bucket_recall(["a"], ["a"]), 1.0)
        self.assertIsNone(bucket_recall([], ["a"]))

    def test_evaluate_aggregates_and_false_comfort(self):
        items = [
            AdjudicationItem(id="i1", idea="x", expected={"prior_work": [], "refuted": ["m/a"], "corroborating": []}, coverage_truth="rich"),
            AdjudicationItem(id="i2", idea="y", expected={"prior_work": [], "refuted": [], "corroborating": []}, coverage_truth="none"),
        ]
        preds = {
            "i1": AdjudicationPrediction(buckets={"prior_work": [], "refuted": ["m/a"], "corroborating": []}, coverage="rich"),
            "i2": AdjudicationPrediction(buckets={"prior_work": ["m/z"], "refuted": [], "corroborating": []}, coverage="rich"),
        }
        report = evaluate(items, preds)
        self.assertEqual(report["refute_recall"], 1.0)
        self.assertEqual(report["item_count"], 2)
        # i2 truth is "none" but prediction returned a hit + rich coverage -> false comfort
        self.assertEqual(report["false_comfort_rate"], 1.0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_adjudication_eval.MetricsTests -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'meridian.evals.adjudication_metrics'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/meridian/evals/adjudication_metrics.py
from __future__ import annotations

from dataclasses import dataclass, field

from meridian.evals.adjudication_dataset import BUCKETS


@dataclass
class AdjudicationPrediction:
    buckets: dict = field(default_factory=lambda: {b: [] for b in BUCKETS})
    coverage: str = "none"

    def total_hits(self) -> int:
        seen = set()
        for b in BUCKETS:
            seen.update(self.buckets.get(b, []) or [])
        return len(seen)


def bucket_recall(expected: list, predicted: list):
    if not expected:
        return None
    predicted_set = set(predicted or [])
    hit = sum(1 for page_id in expected if page_id in predicted_set)
    return hit / len(expected)


def _mean(values: list):
    present = [v for v in values if v is not None]
    return (sum(present) / len(present)) if present else None


def evaluate(items: list, predictions: dict) -> dict:
    per_item = []
    per_bucket_scores = {b: [] for b in BUCKETS}
    false_comfort_flags = []
    for item in items:
        pred = predictions.get(item.id, AdjudicationPrediction())
        expected = item.normalized_expected()
        row = {"id": item.id, "coverage_truth": item.coverage_truth, "coverage_pred": pred.coverage, "recall": {}}
        for b in BUCKETS:
            score = bucket_recall(expected[b], pred.buckets.get(b, []))
            row["recall"][b] = score
            per_bucket_scores[b].append(score)
        if item.coverage_truth == "none":
            gave_comfort = pred.total_hits() > 0 or pred.coverage == "rich"
            false_comfort_flags.append(1 if gave_comfort else 0)
            row["false_comfort"] = bool(gave_comfort)
        per_item.append(row)
    report = {
        "item_count": len(items),
        "refute_recall": _mean(per_bucket_scores["refuted"]),
        "prior_work_recall": _mean(per_bucket_scores["prior_work"]),
        "corroborating_recall": _mean(per_bucket_scores["corroborating"]),
        "false_comfort_rate": (sum(false_comfort_flags) / len(false_comfort_flags)) if false_comfort_flags else None,
        "per_item": per_item,
    }
    return report
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_adjudication_eval.MetricsTests -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/meridian/evals/adjudication_metrics.py tests/test_adjudication_eval.py
git commit -m "feat(evals): adjudication metrics with false-comfort rate"
```

---

### Task 5: Baseline adjudication adapter

Wraps the **current** `retrieve_papers` and buckets hits by naive section origin. This is deliberately dumb — it establishes the "before" number that Phase 1 must beat and quantifies how far a positive-query→negative-page gap actually is.

**Files:**
- Create: `src/meridian/evals/adjudication_baseline.py`
- Test: `tests/test_adjudication_eval.py` (append)

**Interfaces:**
- Consumes: `retrieve_papers` (`meridian.wiki.corpus`); `AdjudicationPrediction` (Task 4); `BUCKETS`.
- Produces: `baseline_adjudicate(idea: str, wiki_root: Path, top_k: int = 6) -> AdjudicationPrediction`. A hit is `refuted` if any matched-section heading is in the refuted set; else `prior_work` if `type` in {paper, method, topic}; else `corroborating`. Coverage = `rich` if total hits ≥ 4, `thin` if 1–3, `none` if 0.

- [ ] **Step 1: Write the failing test** (uses a tiny real vault so `retrieve_papers` runs end-to-end)

```python
# append to tests/test_adjudication_eval.py
from meridian.evals.adjudication_baseline import baseline_adjudicate


class BaselineAdapterTests(unittest.TestCase):
    def _make_vault(self, root: Path):
        (root / "papers").mkdir(parents=True)
        (root / "methods").mkdir(parents=True)
        (root / "papers" / "rotation-paper.md").write_text(
            "---\ntype: paper\ntitle: Rotation Paper\nmethods:\n  - rotation quantization\n---\n"
            "## What To Remember\n\nRotation quantization for W4A4.\n"
            "## Limitations / Uncertainty\n\n- Rotation fails and degrades KV-cache recall under W4A4.\n",
            encoding="utf-8",
        )

    def test_refuted_bucket_from_limitations_section(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._make_vault(root)
            pred = baseline_adjudicate("rotation quantization W4A4", root, top_k=6)
            all_hits = set().union(*[set(v) for v in pred.buckets.values()])
            self.assertIn("papers/rotation-paper", all_hits)
            self.assertIn(pred.coverage, {"rich", "thin", "none"})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_adjudication_eval.BaselineAdapterTests -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'meridian.evals.adjudication_baseline'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/meridian/evals/adjudication_baseline.py
from __future__ import annotations

from pathlib import Path

from meridian.evals.adjudication_metrics import AdjudicationPrediction
from meridian.wiki.corpus import retrieve_papers

_REFUTED_SECTIONS = {
    "Contradictions",
    "Contradicting Evidence",
    "Failure Modes",
    "Common Failure Modes",
    "Limitations / Uncertainty",
    "Limitations",
}
_PRIOR_WORK_TYPES = {"paper", "method", "topic"}


def _stance(result: dict) -> str:
    headings = {str(s.get("heading") or "") for s in (result.get("matched_sections") or [])}
    if headings & _REFUTED_SECTIONS:
        return "refuted"
    if str(result.get("type") or result.get("result_type") or "") in _PRIOR_WORK_TYPES:
        return "prior_work"
    return "corroborating"


def baseline_adjudicate(idea: str, wiki_root: Path, top_k: int = 6) -> AdjudicationPrediction:
    outcome = retrieve_papers(query=idea, wiki_root=wiki_root, top_k=top_k * 3, strategy="v1")
    buckets = {"prior_work": [], "refuted": [], "corroborating": []}
    for result in outcome.results:
        bucket = _stance(result)
        if len(buckets[bucket]) < top_k:
            buckets[bucket].append(result["page_id"])
    total = len({pid for v in buckets.values() for pid in v})
    coverage = "rich" if total >= 4 else ("thin" if total >= 1 else "none")
    return AdjudicationPrediction(buckets=buckets, coverage=coverage)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_adjudication_eval.BaselineAdapterTests -v`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/meridian/evals/adjudication_baseline.py tests/test_adjudication_eval.py
git commit -m "feat(evals): baseline adjudication adapter over retrieve_papers"
```

---

### Task 6: Runner + summary renderer + real-vault baseline run

Ties census + dataset + baseline + metrics into one entry point and renders a durable Markdown summary. Then runs it against the real vault to produce the baseline artifact.

**Files:**
- Create: `src/meridian/evals/adjudication_runner.py`
- Test: `tests/test_adjudication_eval.py` (append)

**Interfaces:**
- Consumes: all prior tasks.
- Produces:
  - `run_adjudication_eval(*, wiki_root: Path, out_dir: Path, gold_path: Path | None = None, top_k: int = 6, bootstrap_limit: int | None = None, adapter=baseline_adjudicate) -> dict` — mines bootstrap items, loads gold (if any), runs the adapter per item, computes metrics + census, writes `out_dir/dataset.jsonl`, `out_dir/report.json`, `out_dir/summary.md`, returns the report dict (with `census` attached).
  - `render_summary(report: dict, census: dict) -> str`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_adjudication_eval.py
from meridian.evals.adjudication_runner import render_summary, run_adjudication_eval


class RunnerTests(unittest.TestCase):
    def test_end_to_end_on_tiny_vault(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "wiki"
            (root / "methods").mkdir(parents=True)
            (root / "methods" / "rotation.md").write_text(
                "---\ntype: method\ntitle: Rotation\n---\n"
                "## Failure Modes\n\n- Rotation fails and degrades accuracy under W4A4.\n",
                encoding="utf-8",
            )
            out = Path(tmp) / "run"
            report = run_adjudication_eval(wiki_root=root, out_dir=out)
            self.assertTrue((out / "summary.md").exists())
            self.assertTrue((out / "report.json").exists())
            self.assertIn("census", report)
            self.assertGreaterEqual(report["item_count"], 1)

    def test_render_summary_is_markdown(self):
        report = {"item_count": 3, "refute_recall": 0.0, "prior_work_recall": None,
                  "corroborating_recall": None, "false_comfort_rate": None, "per_item": []}
        census = {"sections_scanned": 10, "boilerplate": 9, "substantive_negative": 1,
                  "substantive_ratio": 0.1, "by_kind": {}}
        text = render_summary(report, census)
        self.assertIn("# Adjudication Eval", text)
        self.assertIn("Refute-recall", text)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_adjudication_eval.RunnerTests -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'meridian.evals.adjudication_runner'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/meridian/evals/adjudication_runner.py
from __future__ import annotations

import json
from pathlib import Path

from meridian.evals.adjudication_baseline import baseline_adjudicate
from meridian.evals.adjudication_census import corpus_negativity_census
from meridian.evals.adjudication_dataset import dump_dataset, load_dataset
from meridian.evals.adjudication_metrics import evaluate
from meridian.evals.adjudication_miner import mine_bootstrap_items


def _fmt(value) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def render_summary(report: dict, census: dict) -> str:
    lines = [
        "# Adjudication Eval — baseline",
        "",
        f"- Items evaluated: {report['item_count']}",
        f"- Refute-recall@k: {_fmt(report['refute_recall'])}",
        f"- Prior-work-recall@k: {_fmt(report['prior_work_recall'])}",
        f"- Corroborating-recall@k: {_fmt(report['corroborating_recall'])}",
        f"- False-comfort rate: {_fmt(report['false_comfort_rate'])}",
        "",
        "## Corpus negativity census",
        "",
        f"- Negative sections scanned: {census['sections_scanned']}",
        f"- Substantive negatives: {census['substantive_negative']}",
        f"- Boilerplate/empty: {census['boilerplate']}",
        f"- Substantive ratio: {_fmt(census['substantive_ratio'])}",
        "",
        "> If the substantive ratio is near zero, the REFUTED gap is extraction-bound:",
        "> Phase 1 retrieval alone cannot surface negatives the corpus never captured.",
    ]
    return "\n".join(lines) + "\n"


def run_adjudication_eval(*, wiki_root: Path, out_dir: Path, gold_path=None, top_k: int = 6,
                          bootstrap_limit=None, adapter=baseline_adjudicate) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    items = mine_bootstrap_items(wiki_root, limit=bootstrap_limit)
    if gold_path is not None:
        items = items + load_dataset(Path(gold_path))
    dump_dataset(items, out_dir / "dataset.jsonl")

    predictions = {item.id: adapter(item.idea, wiki_root, top_k=top_k) for item in items}
    report = evaluate(items, predictions)
    census = corpus_negativity_census(wiki_root)
    report["census"] = census

    (out_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (out_dir / "summary.md").write_text(render_summary(report, census), encoding="utf-8")
    return report
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_adjudication_eval.RunnerTests -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test module**

Run: `python -m unittest tests.test_adjudication_eval -v`
Expected: PASS (all tests across Tasks 1–6)

- [ ] **Step 6: Produce the real baseline artifact**

Run (from repo root):
```bash
python -c "from pathlib import Path; from meridian.evals.adjudication_runner import run_adjudication_eval; r = run_adjudication_eval(wiki_root=Path(r'D:/research/paper-wiki/wiki'), out_dir=Path('eval/adjudication/runs/2026-07-04-baseline')); print('items', r['item_count'], 'refute_recall', r['refute_recall'], 'substantive_ratio', r['census']['substantive_ratio'])"
```
Expected: prints item count + baseline refute-recall + the census ratio, and writes `eval/adjudication/runs/2026-07-04-baseline/summary.md`. **Read that summary** — it is the go/no-go signal for whether Phase 2 (stance extraction) must precede Phase 1.

- [ ] **Step 7: Write the gold template for the researcher to fill**

Run:
```bash
python -c "from pathlib import Path; from meridian.evals.adjudication_dataset import write_gold_template; write_gold_template(Path('eval/adjudication/gold-ideas.jsonl'))"
```
Then hand `eval/adjudication/gold-ideas.jsonl` to the user to add ~20–40 real ideas.

- [ ] **Step 8: Commit**

```bash
git add src/meridian/evals/adjudication_runner.py tests/test_adjudication_eval.py eval/adjudication/
git commit -m "feat(evals): adjudication runner + baseline summary + gold template"
```

---

## Self-Review

**Spec coverage:**
- §3 north-star metrics (refute-recall@k, prior-work recall, coverage calibration) → Task 4 + Task 6 render.
- §5 eval item schema, bootstrap labels, gold set, negative-space items → Tasks 2 (schema/gold), 3 (bootstrap), 4 (false_comfort covers `coverage_truth:none`).
- §5 "runs against the real vault" → Task 6 Step 6.
- Extraction-hole diagnosis (§1) → Task 1 census, surfaced in the summary.
- Baseline = current retrieval (§4 sequencing) → Task 5.
- Deferred Phase 1/2 → intentionally not in this plan.

**Placeholder scan:** No TBD/TODO; every code step is complete. The gold template's angle-bracket strings are intentional user-facing instructions inside a written file, not plan placeholders.

**Type consistency:** `AdjudicationItem` / `AdjudicationPrediction` / `BUCKETS` / `bucket_recall` / `evaluate` / `baseline_adjudicate` / `run_adjudication_eval` names and signatures match across Tasks 2→6. `page_id` used consistently as the join key. `retrieve_papers` called with keyword-only args matching the real signature.

## Notes for the implementer

- The census and baseline numbers are the *product* of this phase, not a passing test suite. A near-zero `substantive_ratio` is a **finding**, not a bug — it means we correctly detected that negatives aren't in the corpus, which redirects effort to Phase 2 (stance extraction) before Phase 1 retrieval work.
- Do not add dependencies to make metrics "nicer." Stdlib is a hard constraint.
