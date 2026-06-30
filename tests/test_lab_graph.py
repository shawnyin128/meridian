from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from meridian.cli import main
from meridian.framework_check import run_framework_check
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

    def test_lab_templates_include_graph_sections(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]

        state_template = (repo_root / "src/meridian/templates/research-dev/state.md").read_text(encoding="utf-8")
        thread_template = (repo_root / "src/meridian/templates/research-dev/thread.md").read_text(encoding="utf-8")

        self.assertIn("active_path:", state_template)
        self.assertIn("## Graph Relations", thread_template)
        self.assertIn("#### Supporting Artifacts", thread_template)
        self.assertLess(thread_template.index("## Approach Tree"), thread_template.index("### Node A"))
        self.assertLess(thread_template.index("### Node A"), thread_template.index("## Graph Relations"))

    def test_lab_skill_documents_generated_graph_boundary(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        skill_paths = [
            repo_root / "plugins/codex/meridian/skills/lab/SKILL.md",
            repo_root / "plugins/claude-code/meridian/skills/lab/SKILL.md",
        ]

        for skill_path in skill_paths:
            with self.subTest(skill=skill_path):
                skill_text = skill_path.read_text(encoding="utf-8")
                self.assertIn("strict update packet", skill_text)
                self.assertIn("graph.json", skill_text)
                self.assertIn("Do not hand-edit generated graph files", skill_text)

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
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            properties = schema["properties"]
            expected_top_level_types = {
                "generated_at": "string",
                "lab_root": "string",
                "source_files": "array",
                "active_thread": "string",
                "active_path": "array",
                "nodes": "array",
                "edges": "array",
                "node_details": "object",
                "supporting_artifacts": "object",
                "health": "object",
            }
            self.assertEqual(properties["schema"]["const"], LAB_GRAPH_SCHEMA_VERSION)
            for field, expected_type in expected_top_level_types.items():
                self.assertEqual(properties[field]["type"], expected_type)

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

    def test_graph_health_fails_active_path_missing_edge(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            state = root / ".meridian/state.md"
            state.write_text(
                "---\n"
                "type: lab-state\n"
                "active_thread: kv-compression\n"
                "active_path: [kv-compression.A, kv-compression.B]\n"
                "---\n"
                "# State\n",
                encoding="utf-8",
            )
            thread = root / ".meridian/threads/kv-compression.md"
            thread.write_text(
                thread.read_text(encoding="utf-8")
                + "\n### Node B: Follow-up probe\n\n"
                + "- mode: `unresolved`\n",
                encoding="utf-8",
            )

            from meridian.lab.graph import materialize_lab_graph

            result = materialize_lab_graph(root)
            codes = [finding["code"] for finding in result.health["findings"]]
            self.assertIn("active_path_edge_missing", codes)
            self.assertEqual(result.health["status"], "fail")

    def test_graph_health_fails_missing_node_detail(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            result = materialize_lab_graph(root)
            payload = json.loads(json.dumps(result.graph))
            payload["node_details"].pop("kv-compression.A")

            from meridian.lab.graph import check_lab_graph_payload

            health = check_lab_graph_payload(payload, lab_root=root / ".meridian")
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("node_detail_missing", codes)
            self.assertEqual(health["status"], "fail")

    def test_graph_health_fails_missing_markdown_anchor(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            result = materialize_lab_graph(root)
            payload = json.loads(json.dumps(result.graph))
            payload["nodes"][0]["markdown_anchor"] = "missing-anchor"

            from meridian.lab.graph import check_lab_graph_payload

            health = check_lab_graph_payload(payload, lab_root=root / ".meridian")
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("markdown_anchor_missing", codes)
            self.assertEqual(health["status"], "fail")

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

    def test_check_lab_graph_fails_invalid_generated_graph_encoding(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            graph_dir = root / ".meridian/graph"
            graph_dir.mkdir()
            (graph_dir / "graph.json").write_bytes(b"\xff")

            from meridian.lab.graph import check_lab_graph

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("graph_json_invalid_encoding", codes)
            self.assertEqual(health["status"], "fail")

    def test_check_lab_graph_fails_unreadable_generated_graph_path(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            graph_path = root / ".meridian/graph/graph.json"
            graph_path.mkdir(parents=True)

            from meridian.lab.graph import check_lab_graph

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("graph_json_unreadable", codes)
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

    def test_check_lab_graph_fails_empty_list_supporting_artifacts(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            from meridian.lab.graph import check_lab_graph, write_lab_graph

            write_lab_graph(root)
            graph_path = root / ".meridian/graph/graph.json"
            payload = json.loads(graph_path.read_text(encoding="utf-8"))
            payload["supporting_artifacts"] = []
            graph_path.write_text(json.dumps(payload), encoding="utf-8")

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("invalid_supporting_artifacts", codes)
            self.assertEqual(health["status"], "fail")

    def test_check_lab_graph_fails_wrong_source_files_type(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            from meridian.lab.graph import check_lab_graph, write_lab_graph

            write_lab_graph(root)
            graph_path = root / ".meridian/graph/graph.json"
            payload = json.loads(graph_path.read_text(encoding="utf-8"))
            payload["source_files"] = "bad"
            graph_path.write_text(json.dumps(payload), encoding="utf-8")

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("invalid_source_files", codes)
            self.assertEqual(health["status"], "fail")

    def test_check_lab_graph_fails_wrong_health_type(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            from meridian.lab.graph import check_lab_graph, write_lab_graph

            write_lab_graph(root)
            graph_path = root / ".meridian/graph/graph.json"
            payload = json.loads(graph_path.read_text(encoding="utf-8"))
            payload["health"] = []
            graph_path.write_text(json.dumps(payload), encoding="utf-8")

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertIn("invalid_health", codes)
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

    def test_check_lab_graph_ignores_volatile_generated_fields_for_stale_check(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            from meridian.lab.graph import check_lab_graph, write_lab_graph

            write_lab_graph(root)
            graph_path = root / ".meridian/graph/graph.json"
            payload = json.loads(graph_path.read_text(encoding="utf-8"))
            payload["generated_at"] = "2099-01-01T00:00:00Z"
            payload["health"] = {"status": "mutated", "finding_count": 999}
            graph_path.write_text(json.dumps(payload), encoding="utf-8")

            health = check_lab_graph(root)
            codes = [finding["code"] for finding in health["findings"]]
            self.assertNotIn("graph_json_stale", codes)
            self.assertEqual(health["status"], "pass")

    def test_validate_update_packet_rejects_missing_confirmation(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "mark_repairable",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {"state": "repairable"},
                    }
                ],
                "user_confirmation": {"required_for": ["state:repairable"], "status": "missing"},
            }

            report = validate_lab_update_packet(root, packet)

            self.assertEqual(report["status"], "fail")
            self.assertIn("confirmation_required", [finding["code"] for finding in report["findings"]])

    def test_validate_update_packet_accepts_artifact_attach(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            (root / ".meridian/experiments/exp-02.md").write_text(
                "---\ntype: research-experiment\nid: exp-02\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "attach_experiment",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "attach_artifact",
                        "node_id": "kv-compression.A",
                        "artifact": {
                            "type": "experiment",
                            "id": "exp-02",
                            "title": "Probe",
                            "impact": "supports",
                            "path": ".meridian/experiments/exp-02.md",
                        },
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            report = validate_lab_update_packet(root, packet)

            self.assertEqual(report["status"], "pass")
            self.assertEqual(report["findings"], [])

    def test_apply_update_writes_markdown_and_graph(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            thread = root / ".meridian/threads/kv-compression.md"
            thread.write_text(
                thread.read_text(encoding="utf-8")
                + "\n\n### Node B: Follow-up probe\n\n"
                + "- mode: `unresolved`\n"
                + "- parent: A\n",
                encoding="utf-8",
            )
            (root / ".meridian/experiments/exp-02.md").write_text(
                "---\ntype: research-experiment\nid: exp-02\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )
            from meridian.lab.graph import apply_lab_update

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "apply_experiment_result",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {
                            "state": "supported",
                            "next_action": "Run the follow-up scoring probe.",
                        },
                    },
                    {
                        "op": "attach_artifact",
                        "node_id": "kv-compression.A",
                        "artifact": {
                            "type": "experiment",
                            "id": "exp-02",
                            "title": "Scoring probe",
                            "impact": "supports",
                            "path": ".meridian/experiments/exp-02.md",
                        },
                    },
                    {
                        "op": "record_history",
                        "node_id": "kv-compression.A",
                        "message": "Attached exp-02 and updated next action.",
                    },
                    {
                        "op": "set_active_path",
                        "path": ["kv-compression.A", "kv-compression.B"],
                    },
                ],
                "user_confirmation": {"required_for": ["set_active_path"], "status": "accepted"},
            }

            result = apply_lab_update(root, packet)

            self.assertEqual(result["schema"], "meridian.lab.apply_update.v1")
            self.assertEqual(result["status"], "applied")
            self.assertEqual(result["validation"]["status"], "pass")
            self.assertEqual(result["graph_health"]["status"], "pass")
            self.assertIn(".meridian/state.md", result["written_paths"])
            self.assertIn(".meridian/threads/kv-compression.md", result["written_paths"])
            self.assertIn(".meridian/graph/graph.json", result["written_paths"])
            state_text = (root / ".meridian/state.md").read_text(encoding="utf-8")
            self.assertIn("active_path: [kv-compression.A, kv-compression.B]", state_text)
            thread_text = (root / ".meridian/threads/kv-compression.md").read_text(encoding="utf-8")
            self.assertIn("- mode: `supported`", thread_text)
            self.assertIn("#### Next Action\n\nRun the follow-up scoring probe.", thread_text)
            self.assertIn("#### Supporting Artifacts", thread_text)
            self.assertIn(
                "| experiment | exp-02 | Scoring probe | supports | .meridian/experiments/exp-02.md |",
                thread_text,
            )
            self.assertRegex(thread_text, r"- \d{4}-\d{2}-\d{2}: Attached exp-02 and updated next action\.")
            graph_path = root / ".meridian/graph/graph.json"
            self.assertTrue(graph_path.exists())
            graph = json.loads(graph_path.read_text(encoding="utf-8"))
            self.assertEqual(graph["active_path"], ["kv-compression.A", "kv-compression.B"])
            self.assertEqual(graph["nodes"][0]["state"], "supported")
            self.assertEqual(
                graph["node_details"]["kv-compression.A"]["next_action"],
                "Run the follow-up scoring probe.",
            )
            self.assertIn(
                {
                    "type": "experiment",
                    "id": "exp-02",
                    "title": "Scoring probe",
                    "impact": "supports",
                    "path": ".meridian/experiments/exp-02.md",
                },
                graph["supporting_artifacts"]["kv-compression.A"],
            )

    def test_cli_lab_graph_refresh_and_check(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            refresh_status = main(["lab", "graph-refresh", "--lab-root", str(root)])
            check_status = main(["lab", "graph-check", "--lab-root", str(root)])

            self.assertEqual(refresh_status, 0)
            self.assertEqual(check_status, 0)
            self.assertTrue((root / ".meridian/graph/graph.json").exists())

    def test_cli_lab_apply_update_from_json_file(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            packet_path = root / "packet.json"
            packet_path.write_text(
                json.dumps(
                    {
                        "schema": "meridian.lab.update.v1",
                        "intent": "mark_supported",
                        "target_thread": "kv-compression",
                        "changes": [
                            {
                                "op": "update_node",
                                "node_id": "kv-compression.A",
                                "fields": {"state": "supported"},
                            }
                        ],
                        "user_confirmation": {"required_for": [], "status": "not_required"},
                    }
                ),
                encoding="utf-8",
            )

            status = main(["lab", "apply-update", str(packet_path), "--lab-root", str(root)])

            self.assertEqual(status, 0)
            thread_text = (root / ".meridian/threads/kv-compression.md").read_text(encoding="utf-8")
            self.assertIn("- mode: `supported`", thread_text)

    def test_cli_lab_apply_update_bad_json_out_does_not_mutate(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            thread = root / ".meridian/threads/kv-compression.md"
            before = thread.read_text(encoding="utf-8")
            packet_path = root / "packet.json"
            packet_path.write_text(
                json.dumps(
                    {
                        "schema": "meridian.lab.update.v1",
                        "intent": "mark_supported",
                        "target_thread": "kv-compression",
                        "changes": [
                            {
                                "op": "update_node",
                                "node_id": "kv-compression.A",
                                "fields": {"state": "supported"},
                            }
                        ],
                        "user_confirmation": {"required_for": [], "status": "not_required"},
                    }
                ),
                encoding="utf-8",
            )
            bad_json_out = root / "existing-output-dir"
            bad_json_out.mkdir()

            status = main(
                [
                    "lab",
                    "apply-update",
                    str(packet_path),
                    "--lab-root",
                    str(root),
                    "--json-out",
                    str(bad_json_out),
                ]
            )

            self.assertEqual(status, 1)
            self.assertEqual(thread.read_text(encoding="utf-8"), before)
            self.assertFalse((root / ".meridian/graph").exists())

    def test_cli_lab_apply_update_rejected_packet_writes_no_files(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            packet_path = root / "packet.json"
            packet_path.write_text(
                json.dumps(
                    {
                        "schema": "meridian.lab.update.v1",
                        "intent": "bad_apply",
                        "target_thread": "kv-compression",
                        "changes": [
                            {
                                "op": "update_node",
                                "node_id": "kv-compression.A",
                                "fields": {"unexpected": "value"},
                            }
                        ],
                        "user_confirmation": {"required_for": [], "status": "not_required"},
                    }
                ),
                encoding="utf-8",
            )
            before = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }

            status = main(["lab", "apply-update", str(packet_path), "--lab-root", str(root)])

            after = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }
            self.assertEqual(status, 1)
            self.assertEqual(after, before)
            self.assertFalse((root / ".meridian/graph").exists())

    def test_cli_lab_graph_refresh_bad_json_out_does_not_write_graph(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            bad_json_out = root / "existing-output-dir"
            bad_json_out.mkdir()

            status = main(["lab", "graph-refresh", "--lab-root", str(root), "--json-out", str(bad_json_out)])

            self.assertEqual(status, 1)
            self.assertFalse((root / ".meridian/graph").exists())

    def test_cli_lab_export_graph_writes_required_json_out(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            out_path = root / "exported-graph.json"

            status = main(["lab", "export-graph", "--lab-root", str(root), "--json-out", str(out_path)])

            self.assertEqual(status, 0)
            payload = json.loads(out_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema"], LAB_GRAPH_SCHEMA_VERSION)
            self.assertEqual(payload["health"]["status"], "pass")

    def test_framework_check_lab_state_warns_when_graph_json_missing(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)

            report = run_framework_check(project_root=root, lab_root=root)

            lab_state = next(category for category in report.categories if category.name == "Lab State")
            codes = [finding.code for finding in lab_state.findings]
            self.assertIn("lab_graph_json_missing", codes)
            self.assertEqual(lab_state.status, "warn")

    def test_framework_check_lab_state_fails_dangling_graph_state(self) -> None:
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

            report = run_framework_check(project_root=root, lab_root=root)

            lab_state = next(category for category in report.categories if category.name == "Lab State")
            critical_codes = [finding.code for finding in lab_state.findings if finding.severity == "critical"]
            self.assertIn("lab_dangling_edge_target", critical_codes)
            self.assertEqual(lab_state.status, "fail")

    def test_apply_update_stays_inside_node_before_graph_relations(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            thread = root / ".meridian/threads/kv-compression.md"
            thread.write_text(
                thread.read_text(encoding="utf-8").rstrip()
                + "\n\n## Graph Relations\n\n"
                + "| Source | Relation | Target | Strength | Note |\n"
                + "| --- | --- | --- | --- | --- |\n",
                encoding="utf-8",
            )
            (root / ".meridian/experiments/exp-02.md").write_text(
                "---\ntype: research-experiment\nid: exp-02\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )
            from meridian.lab.graph import apply_lab_update

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "apply_before_graph_relations",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {
                            "state": "supported",
                            "next_action": "Keep graph relations outside the node.",
                        },
                    },
                    {
                        "op": "attach_artifact",
                        "node_id": "kv-compression.A",
                        "artifact": {
                            "type": "experiment",
                            "id": "exp-02",
                            "title": "Boundary probe",
                            "impact": "supports",
                            "path": ".meridian/experiments/exp-02.md",
                        },
                    },
                    {
                        "op": "record_history",
                        "node_id": "kv-compression.A",
                        "message": "Confirmed same-level headings close node edits.",
                    },
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)

            self.assertEqual(result["status"], "applied")
            thread_text = thread.read_text(encoding="utf-8")
            graph_relations_index = thread_text.index("## Graph Relations")
            self.assertLess(thread_text.index("#### Next Action"), graph_relations_index)
            self.assertLess(thread_text.index("#### Supporting Artifacts"), graph_relations_index)
            self.assertLess(thread_text.index("#### History"), graph_relations_index)
            self.assertNotIn("#### Supporting Artifacts", thread_text[graph_relations_index:])
            self.assertNotIn("#### History", thread_text[graph_relations_index:])

    def test_apply_update_writes_nothing_when_invalid(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            before = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }
            from meridian.lab.graph import apply_lab_update

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "bad_apply",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {"unexpected": "value"},
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)
            after = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }

            self.assertEqual(result["schema"], "meridian.lab.apply_update.v1")
            self.assertEqual(result["status"], "rejected")
            self.assertEqual(result["validation"]["status"], "fail")
            self.assertEqual(result["written_paths"], [])
            self.assertEqual(after, before)
            self.assertFalse((root / ".meridian/graph").exists())

    def test_apply_update_rejects_attach_artifact_missing_id_without_writing(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            (root / ".meridian/experiments/exp-empty.md").write_text(
                "---\ntype: research-experiment\nid: exp-empty\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )
            before = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }
            from meridian.lab.graph import apply_lab_update

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "attach_experiment_missing_id",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "attach_artifact",
                        "node_id": "kv-compression.A",
                        "artifact": {
                            "type": "experiment",
                            "id": " ",
                            "title": "Missing ID probe",
                            "impact": "supports",
                            "path": ".meridian/experiments/exp-empty.md",
                        },
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)
            after = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }

            self.assertEqual(result["status"], "rejected")
            self.assertEqual(result["written_paths"], [])
            self.assertEqual(after, before)
            self.assertFalse((root / ".meridian/graph").exists())
            codes = [finding["code"] for finding in result["validation"]["findings"]]
            self.assertIn("missing_artifact_id", codes)

    def test_apply_update_rejects_valid_but_unsupported_apply_field_without_writing(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            before = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }
            from meridian.lab.graph import apply_lab_update

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "unsupported_title_apply",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {"title": "Retitled idea seed"},
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)
            after = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }

            self.assertEqual(result["status"], "rejected")
            self.assertEqual(result["written_paths"], [])
            self.assertEqual(after, before)
            self.assertFalse((root / ".meridian/graph").exists())
            codes = [finding["code"] for finding in result["validation"]["findings"]]
            self.assertIn("unsupported_apply_field", codes)

    def test_apply_update_rejects_valid_but_unsupported_apply_op_without_writing(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            thread = root / ".meridian/threads/kv-compression.md"
            thread.write_text(
                thread.read_text(encoding="utf-8")
                + "\n\n### Node B: Follow-up probe\n\n"
                + "- mode: `unresolved`\n"
                + "- parent: A\n",
                encoding="utf-8",
            )
            before = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }
            from meridian.lab.graph import apply_lab_update

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "unsupported_create_edge_apply",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "create_edge",
                        "source": "kv-compression.A",
                        "target": "kv-compression.B",
                        "kind": "related_to",
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            result = apply_lab_update(root, packet)
            after = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }

            self.assertEqual(result["status"], "rejected")
            self.assertEqual(result["written_paths"], [])
            self.assertEqual(after, before)
            self.assertFalse((root / ".meridian/graph").exists())
            codes = [finding["code"] for finding in result["validation"]["findings"]]
            self.assertIn("unsupported_apply_op", codes)

    def test_validate_update_packet_rejects_missing_target_thread(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "attach_experiment",
                "target_thread": " ",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {"state": "supported"},
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            report = validate_lab_update_packet(root, packet)

            self.assertEqual(report["status"], "fail")
            self.assertIn("missing_target_thread", [finding["code"] for finding in report["findings"]])

    def test_validate_update_packet_rejects_missing_artifact_path(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "attach_experiment",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "attach_artifact",
                        "node_id": "kv-compression.A",
                        "artifact": {
                            "type": "experiment",
                            "id": "exp-02",
                            "title": "Probe",
                            "impact": "supports",
                            "path": " ",
                        },
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            report = validate_lab_update_packet(root, packet)

            self.assertEqual(report["status"], "fail")
            self.assertIn("missing_artifact_path", [finding["code"] for finding in report["findings"]])

    def test_validate_update_packet_rejects_invalid_create_edge_fields(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "create_edge",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "create_edge",
                        "source": "kv compression.A",
                        "target": " ",
                        "kind": "not_a_kind",
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            report = validate_lab_update_packet(root, packet)
            codes = [finding["code"] for finding in report["findings"]]

            self.assertEqual(report["status"], "fail")
            self.assertIn("invalid_edge_source", codes)
            self.assertIn("missing_edge_target", codes)
            self.assertIn("invalid_edge_kind", codes)

    def test_validate_update_packet_rejects_update_edge_missing_nodes_and_kind(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "update_edge",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_edge",
                        "source": "kv-compression.missing",
                        "target": "kv-compression.also_missing",
                        "kind": " ",
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            report = validate_lab_update_packet(root, packet)
            codes = [finding["code"] for finding in report["findings"]]

            self.assertEqual(report["status"], "fail")
            self.assertIn("edge_source_missing", codes)
            self.assertIn("edge_target_missing", codes)
            self.assertIn("missing_edge_kind", codes)

    def test_validate_update_packet_requires_confirmation_for_boundary_ops(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "boundary_moves",
                "target_thread": "kv-compression",
                "changes": [
                    {"op": "create_node", "node_id": "kv-compression.B"},
                    {"op": "set_active_thread", "thread_id": "kv-compression"},
                    {"op": "set_active_path", "path": ["kv-compression.A"]},
                    {
                        "op": "detach_artifact",
                        "node_id": "kv-compression.A",
                        "artifact_id": "exp-01",
                        "artifact_type": "experiment",
                    },
                ],
                "user_confirmation": {
                    "required_for": ["create_node", "set_active_thread", "set_active_path", "detach_artifact"],
                    "status": "missing",
                },
            }

            report = validate_lab_update_packet(root, packet)
            confirmation_findings = [
                finding for finding in report["findings"] if finding["code"] == "confirmation_required"
            ]

            self.assertEqual(report["status"], "fail")
            self.assertEqual(len(confirmation_findings), 4)

    def test_validate_update_packet_rejects_bad_required_node_ids(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            (root / ".meridian/experiments/exp-02.md").write_text(
                "---\ntype: research-experiment\nid: exp-02\nvalidity: valid\n---\n# Experiment\n",
                encoding="utf-8",
            )
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "validate_node_ids",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": " ",
                        "fields": {"state": "supported"},
                    },
                    {
                        "op": "attach_artifact",
                        "node_id": "kv compression.A",
                        "artifact": {
                            "type": "experiment",
                            "id": "exp-02",
                            "title": "Probe",
                            "impact": "supports",
                            "path": ".meridian/experiments/exp-02.md",
                        },
                    },
                    {"op": "create_node", "node_id": "kv-compression.A"},
                ],
                "user_confirmation": {"required_for": ["create_node"], "status": "accepted"},
            }

            report = validate_lab_update_packet(root, packet)
            codes = [finding["code"] for finding in report["findings"]]

            self.assertEqual(report["status"], "fail")
            self.assertIn("missing_node_id", codes)
            self.assertIn("invalid_node_id", codes)
            self.assertIn("node_already_exists", codes)

    def test_validate_update_packet_rejects_invalid_accepted_set_active_path(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "set_active_path",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "set_active_path",
                        "path": ["kv-compression.A", "kv compression.B", "kv-compression.missing"],
                    }
                ],
                "user_confirmation": {"required_for": ["set_active_path"], "status": "accepted"},
            }

            report = validate_lab_update_packet(root, packet)
            codes = [finding["code"] for finding in report["findings"]]

            self.assertEqual(report["status"], "fail")
            self.assertIn("invalid_active_path_node", codes)
            self.assertIn("active_path_node_missing", codes)

    def test_validate_update_packet_rejects_unknown_update_field_without_writing_files(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            before = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "update_node",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {
                            "unexpected": "value",
                            "title": " ",
                            "doing": ["not", "a", "string"],
                        },
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            report = validate_lab_update_packet(root, packet)
            after = {
                path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                for path in root.rglob("*")
                if path.is_file()
            }
            codes = [finding["code"] for finding in report["findings"]]

            self.assertEqual(report["status"], "fail")
            self.assertIn("invalid_update_field", codes)
            self.assertIn("invalid_update_field_value", codes)
            self.assertEqual(after, before)

    def test_validate_update_packet_rejects_scoped_confirmation_mismatch(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "confirm_mismatch",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "update_node",
                        "node_id": "kv-compression.A",
                        "fields": {"state": "repairable"},
                    },
                    {"op": "create_node", "node_id": "kv-compression.B"},
                ],
                "user_confirmation": {"required_for": ["state:dead", "set_active_path"], "status": "accepted"},
            }

            report = validate_lab_update_packet(root, packet)
            confirmation_findings = [
                finding for finding in report["findings"] if finding["code"] == "confirmation_required"
            ]

            self.assertEqual(report["status"], "fail")
            self.assertEqual(len(confirmation_findings), 2)

    def test_validate_update_packet_rejects_windows_style_missing_artifact_path(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "attach_experiment",
                "target_thread": "kv-compression",
                "changes": [
                    {
                        "op": "attach_artifact",
                        "node_id": "kv-compression.A",
                        "artifact": {
                            "type": "experiment",
                            "id": "exp-missing",
                            "title": "Missing probe",
                            "impact": "supports",
                            "path": ".meridian\\experiments\\exp-missing.md",
                        },
                    }
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            report = validate_lab_update_packet(root, packet)

            self.assertEqual(report["status"], "fail")
            self.assertIn("artifact_path_missing", [finding["code"] for finding in report["findings"]])

    def test_validate_update_packet_rejects_bad_boundary_op_payloads(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "bad_boundary_payloads",
                "target_thread": "kv-compression",
                "changes": [
                    {"op": "set_active_thread", "thread_id": "missing-thread"},
                    {"op": "detach_artifact", "node_id": "kv-compression.A", "artifact_id": "exp-01"},
                    {"op": "record_history", "message": " "},
                ],
                "user_confirmation": {
                    "required_for": ["set_active_thread", "detach_artifact"],
                    "status": "accepted",
                },
            }

            report = validate_lab_update_packet(root, packet)
            codes = [finding["code"] for finding in report["findings"]]

            self.assertEqual(report["status"], "fail")
            self.assertIn("active_thread_missing", codes)
            self.assertIn("missing_artifact_type", codes)
            self.assertIn("missing_history_text", codes)

    def test_lab_package_exports_validate_update_packet(self) -> None:
        from meridian.lab import validate_lab_update_packet

        self.assertTrue(callable(validate_lab_update_packet))

    def test_lab_package_exports_apply_update(self) -> None:
        from meridian.lab import apply_lab_update

        self.assertTrue(callable(apply_lab_update))

    def test_lab_package_exports_graph_check_and_write(self) -> None:
        from meridian.lab import check_lab_graph, write_lab_graph

        self.assertTrue(callable(check_lab_graph))
        self.assertTrue(callable(write_lab_graph))

    def test_validate_update_packet_rejects_record_history_bad_node_ids(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "record_history",
                "target_thread": "kv-compression",
                "changes": [
                    {"op": "record_history", "node_id": " ", "message": "Observed a useful result."},
                    {"op": "record_history", "node_id": "kv compression.A", "message": "Observed a useful result."},
                    {"op": "record_history", "node_id": "kv-compression.missing", "message": "Observed a useful result."},
                ],
                "user_confirmation": {"required_for": [], "status": "not_required"},
            }

            report = validate_lab_update_packet(root, packet)
            codes = [finding["code"] for finding in report["findings"]]

            self.assertEqual(report["status"], "fail")
            self.assertIn("missing_node_id", codes)
            self.assertIn("invalid_node_id", codes)
            self.assertIn("node_missing", codes)

    def test_validate_update_packet_rejects_active_path_missing_edge(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_minimal_lab(root)
            thread = root / ".meridian/threads/kv-compression.md"
            thread.write_text(
                thread.read_text(encoding="utf-8")
                + "\n### Node B: Independent option\n\n"
                + "- mode: `unresolved`\n",
                encoding="utf-8",
            )
            from meridian.lab.graph import validate_lab_update_packet

            packet = {
                "schema": "meridian.lab.update.v1",
                "intent": "set_active_path",
                "target_thread": "kv-compression",
                "changes": [
                    {"op": "set_active_path", "path": ["kv-compression.A", "kv-compression.B"]},
                ],
                "user_confirmation": {"required_for": ["set_active_path"], "status": "accepted"},
            }

            report = validate_lab_update_packet(root, packet)

            self.assertEqual(report["status"], "fail")
            self.assertIn("active_path_edge_missing", [finding["code"] for finding in report["findings"]])


if __name__ == "__main__":
    unittest.main()
