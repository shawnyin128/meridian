from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from meridian.lab.graph import LAB_GRAPH_SCHEMA_VERSION, materialize_lab_graph


class LabGraphTests(unittest.TestCase):
    def test_materialize_graph_uses_core_research_nodes_only(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            (lab / "state.md").write_text(
                "---\n"
                "type: lab-state\n"
                "active_thread: kv-compression\n"
                "active_path: [kv-compression.A, kv-compression.B]\n"
                "---\n"
                "# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            (lab / "threads/kv-compression.md").write_text(
                "---\n"
                "type: research-thread\n"
                "title: KV Compression\n"
                "active_node: B\n"
                "---\n"
                "# Research Thread: KV Compression\n\n"
                "## Approach Tree\n\n"
                "### Node A: Idea seed\n\n"
                "- mode: `supported`\n"
                "- active: false\n\n"
                "#### Experiments\n\n"
                "- `exp-01`\n\n"
                "#### Next Action\n\n"
                "Continue toward the repair node.\n\n"
                "### Node B: Repair scoring\n\n"
                "- mode: `repairable`\n"
                "- active: true\n"
                "- parent: A\n\n"
                "#### Supporting Artifacts\n\n"
                "| Type | ID | Title | Impact | Path |\n"
                "| --- | --- | --- | --- | --- |\n"
                "| experiment | exp-02 | Scoring probe | supports | .meridian/experiments/exp-02.md |\n\n"
                "#### Next Action\n\n"
                "Run the amortized scoring probe.\n",
                encoding="utf-8",
            )
            (lab / "experiments/exp-01.md").write_text(
                "---\ntype: research-experiment\nid: exp-01\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )
            (lab / "experiments/exp-02.md").write_text(
                "---\ntype: research-experiment\nid: exp-02\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )

            graph = materialize_lab_graph(root).graph

            self.assertEqual(graph["schema"], LAB_GRAPH_SCHEMA_VERSION)
            self.assertEqual(graph["active_thread"], "kv-compression")
            self.assertEqual(graph["active_path"], ["kv-compression.A", "kv-compression.B"])
            self.assertEqual([node["id"] for node in graph["nodes"]], ["kv-compression.A", "kv-compression.B"])
            self.assertEqual(graph["nodes"][1]["state"], "repairable")
            self.assertTrue(graph["nodes"][1]["active"])
            self.assertEqual(graph["node_details"]["kv-compression.B"]["next_action"], "Run the amortized scoring probe.")
            artifact_ids = [item["id"] for item in graph["supporting_artifacts"]["kv-compression.B"]]
            self.assertEqual(artifact_ids, ["exp-02"])


if __name__ == "__main__":
    unittest.main()
