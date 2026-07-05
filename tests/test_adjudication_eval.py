from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from meridian.evals.adjudication_census import (
    corpus_negativity_census,
    is_substantive_negative,
)
from meridian.evals.adjudication_dataset import (
    BUCKETS,
    AdjudicationItem,
    dump_dataset,
    load_dataset,
    write_gold_template,
)
from meridian.evals.adjudication_miner import mine_bootstrap_items
from meridian.evals.adjudication_baseline import baseline_adjudicate
from meridian.evals.adjudication_metrics import (
    AdjudicationPrediction,
    bucket_recall,
    evaluate,
)
from meridian.evals.adjudication_runner import render_summary, run_adjudication_eval


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


class BaselineAdapterTests(unittest.TestCase):
    def _make_vault(self, root: Path):
        (root / "papers").mkdir(parents=True)
        (root / "methods").mkdir(parents=True)
        (root / "papers" / "rotation-paper.md").write_text(
            "---\ntype: paper\ntitle: Rotation Paper\nmethods:\n  - rotation quantization\nvalidation_state: source_fidelity_pass\ntrust_state: source_verified\n---\n"
            "## What To Remember\n\nRotation quantization for W4A4.\n"
            "## Limitations / Uncertainty\n\n- Rotation fails and degrades KV-cache recall under W4A4.\n",
            encoding="utf-8",
        )

    def test_refuted_bucket_from_limitations_section(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._make_vault(root)
            pred = baseline_adjudicate("rotation quantization W4A4", root, top_k=6)
            self.assertIn("papers/rotation-paper", pred.buckets["refuted"])
            self.assertEqual(pred.coverage, "thin")


class RunnerTests(unittest.TestCase):
    def test_end_to_end_on_tiny_vault(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "wiki"
            (root / "methods").mkdir(parents=True)
            (root / "papers").mkdir(parents=True)
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
