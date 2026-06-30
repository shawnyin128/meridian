from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from meridian.lab.graph import LAB_GRAPH_SCHEMA_VERSION, materialize_lab_graph


class LabGraphTests(unittest.TestCase):
    def _write_minimal_lab(self, root: Path) -> None:
        lab = root / ".meridian"
        (lab / "threads").mkdir(parents=True)
        (lab / "experiments").mkdir()
        (lab / "proposals").mkdir()
        (lab / "state.md").write_text(
            "---\ntype: lab-state\nactive_thread: kv-compression\nactive_path: [kv-compression.A]\n---\n# State\n",
            encoding="utf-8",
        )
        (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
        (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
        (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
        (lab / "threads/kv-compression.md").write_text(
            "---\ntype: research-thread\ntitle: KV Compression\nactive_node: A\n---\n"
            "# Research Thread: KV Compression\n\n"
            "## Approach Tree\n\n"
            "### Node A: Idea seed\n\n"
            "- mode: `unresolved`\n"
            "- active: true\n\n"
            "#### Next Action\n\n"
            "Define the first probe.\n",
            encoding="utf-8",
        )

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
                "- parent: kv-compression.A\n\n"
                "#### Supporting Artifacts\n\n"
                "| Type | ID | Title | Impact | Path |\n"
                "| --- | --- | --- | --- | --- |\n"
                "| experiment | exp-02 | Scoring probe | supports | .meridian/experiments/exp-02.md |\n\n"
                "#### Next Action\n\n"
                "Run the amortized scoring probe.\n\n"
                "## Graph Relations\n\n"
                "| Source | Relation | Target | Strength | Note |\n"
                "| --- | --- | --- | --- | --- |\n"
                "| kv-compression.A | blocks | kv-compression.C | weak | Missing scoring budget. |\n",
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
            nodes_by_id = {node["id"]: node for node in graph["nodes"]}
            self.assertFalse(nodes_by_id["kv-compression.A"]["active"])
            self.assertTrue(nodes_by_id["kv-compression.A"]["on_active_path"])
            self.assertEqual(graph["nodes"][1]["state"], "repairable")
            self.assertTrue(nodes_by_id["kv-compression.B"]["active"])
            self.assertTrue(nodes_by_id["kv-compression.B"]["on_active_path"])
            self.assertEqual(graph["node_details"]["kv-compression.B"]["next_action"], "Run the amortized scoring probe.")
            node_a_artifact_ids = [item["id"] for item in graph["supporting_artifacts"]["kv-compression.A"]]
            self.assertEqual(node_a_artifact_ids, ["exp-01"])
            artifact_ids = [item["id"] for item in graph["supporting_artifacts"]["kv-compression.B"]]
            self.assertEqual(artifact_ids, ["exp-02"])
            parent_edges = [
                edge
                for edge in graph["edges"]
                if edge["source"] == "kv-compression.A" and edge["target"] == "kv-compression.B"
            ]
            self.assertEqual(len(parent_edges), 1)
            self.assertEqual(parent_edges[0]["kind"], "continues")
            relation_edges = [
                edge
                for edge in graph["edges"]
                if edge["source"] == "kv-compression.A" and edge["target"] == "kv-compression.C"
            ]
            self.assertEqual(len(relation_edges), 1)
            self.assertEqual(relation_edges[0]["kind"], "blocks")
            self.assertEqual(relation_edges[0]["strength"], "weak")

    def test_materialize_graph_normalizes_raw_parent_refs(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "state.md").write_text(
                "---\n"
                "type: lab-state\n"
                "active_thread: kv-compression\n"
                "active_path: []\n"
                "---\n"
                "# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "threads/kv-compression.md").write_text(
                "---\n"
                "type: research-thread\n"
                "title: KV Compression\n"
                "---\n"
                "# Research Thread: KV Compression\n\n"
                "## Approach Tree\n\n"
                "### Node A: Idea seed\n\n"
                "- mode: `supported`\n\n"
                "### Node B: Repair scoring\n\n"
                "- mode: `repairable`\n"
                "- parent: A\n",
                encoding="utf-8",
            )

            graph = materialize_lab_graph(root).graph

            parent_edges = [
                edge
                for edge in graph["edges"]
                if edge["source"] == "kv-compression.A" and edge["target"] == "kv-compression.B"
            ]
            self.assertEqual(len(parent_edges), 1)
            self.assertEqual(parent_edges[0]["kind"], "continues")

    def test_write_lab_graph_creates_generated_artifacts(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            from meridian.lab.graph import write_lab_graph

            result = write_lab_graph(root)

            graph_path = root / ".meridian/graph/graph.json"
            health_path = root / ".meridian/graph/graph-health.json"
            schema_path = root / ".meridian/graph/graph.schema.json"
            self.assertTrue(graph_path.exists())
            self.assertTrue(health_path.exists())
            self.assertTrue(schema_path.exists())
            payload = json.loads(graph_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema"], LAB_GRAPH_SCHEMA_VERSION)
            self.assertEqual(result.health["status"], "pass")

    def test_graph_health_fails_dangling_edge(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            thread = root / ".meridian/threads/kv-compression.md"
            thread.write_text(
                thread.read_text(encoding="utf-8")
                + "\n## Graph Relations\n\n"
                + "| Source | Relation | Target | Strength | Note |\n"
                + "| --- | --- | --- | --- | --- |\n"
                + "| kv-compression.A | related_to | kv-compression.missing | weak | broken |\n",
                encoding="utf-8",
            )

            from meridian.lab.graph import materialize_lab_graph

            result = materialize_lab_graph(root)
            codes = [finding["code"] for finding in result.health["findings"]]
            self.assertIn("dangling_edge_target", codes)
            self.assertEqual(result.health["status"], "fail")

    def test_check_lab_graph_warns_when_generated_graph_missing(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            from meridian.lab.graph import check_lab_graph

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("graph_json_missing", codes)
            self.assertEqual(health["status"], "warn")

    def test_check_lab_graph_fails_corrupt_generated_graph(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            graph_dir = root / ".meridian/graph"
            graph_dir.mkdir()
            (graph_dir / "graph.json").write_text("{not json", encoding="utf-8")

            from meridian.lab.graph import check_lab_graph

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("graph_json_invalid", codes)
            self.assertEqual(health["status"], "fail")

    def test_check_lab_graph_fails_generated_graph_that_is_not_object(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            graph_dir = root / ".meridian/graph"
            graph_dir.mkdir()
            (graph_dir / "graph.json").write_text("[]", encoding="utf-8")

            from meridian.lab.graph import check_lab_graph

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("graph_json_not_object", codes)
            self.assertEqual(health["status"], "fail")

    def test_check_lab_graph_fails_incomplete_generated_graph_payload(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            graph_dir = root / ".meridian/graph"
            graph_dir.mkdir()
            (graph_dir / "graph.json").write_text(
                json.dumps({"schema": LAB_GRAPH_SCHEMA_VERSION}),
                encoding="utf-8",
            )

            from meridian.lab.graph import check_lab_graph

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("missing_top_level_field", codes)
            self.assertEqual(health["status"], "fail")

    def test_graph_health_fails_malformed_supporting_artifacts_without_crashing(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            result = materialize_lab_graph(root)
            payload = dict(result.graph)
            payload["supporting_artifacts"] = {"kv-compression.A": ["not an artifact object"]}

            from meridian.lab.graph import check_lab_graph_payload

            try:
                health = check_lab_graph_payload(payload, lab_root=root / ".meridian")
            except Exception as exc:  # pragma: no cover - assertion message carries the regression.
                self.fail(f"check_lab_graph_payload crashed: {exc}")
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("invalid_supporting_artifact", codes)
            self.assertEqual(health["status"], "fail")

    def test_check_lab_graph_warns_when_generated_graph_is_stale(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            from meridian.lab.graph import check_lab_graph, write_lab_graph

            write_lab_graph(root)
            thread = root / ".meridian/threads/kv-compression.md"
            thread.write_text(
                thread.read_text(encoding="utf-8")
                + "\n### Node B: Follow-up probe\n\n"
                + "- mode: `unresolved`\n"
                + "- parent: A\n",
                encoding="utf-8",
            )

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("graph_json_stale", codes)
            self.assertEqual(health["status"], "warn")


if __name__ == "__main__":
    unittest.main()
