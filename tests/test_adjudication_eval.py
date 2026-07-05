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
