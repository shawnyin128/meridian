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
