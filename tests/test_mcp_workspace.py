from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from meridian.mcp import adapter
from meridian.mcp.server import MeridianMCPServer


class MCPWorkspaceTests(unittest.TestCase):
    def _workspace(self, root: Path) -> Path:
        meridian_root = root / ".meridian"
        (meridian_root / "control").mkdir(parents=True)
        (meridian_root / "experiments").mkdir(parents=True)
        (meridian_root / "threads").mkdir(parents=True)
        (meridian_root / "proposals").mkdir(parents=True)
        (meridian_root / "workspace.json").write_text(
            json.dumps(
                {
                    "schema_version": "meridian.workspace.v1",
                    "project": {"id": "project-1", "name": "Shared research"},
                    "surfaces": {
                        "plan": {
                            "path": ".meridian/control/plan.json",
                            "writer": "meridian-app",
                        },
                        "changes": {
                            "path": ".meridian/control/changes.json",
                            "writer": "meridian-app",
                        },
                        "graph": {
                            "path": ".meridian/graph/graph.json",
                            "writer": "workspace",
                        },
                        "events": {
                            "path": ".meridian/events/events.json",
                            "writer": "workspace",
                        },
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        plan = meridian_root / "control/plan.json"
        plan.write_text(
            json.dumps(
                {
                    "schema_version": "meridian.project-plan.v1",
                    "revision": "revision-1",
                    "updated_at": "2026-09-16T00:00:00Z",
                    "project": {"id": "project-1", "name": "Shared research"},
                    "tasks": [{"id": "task-1", "title": "Run probe"}],
                    "milestones": [],
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (meridian_root / "control/changes.json").write_text(
            json.dumps(
                {
                    "schema_version": "meridian.workspace-changes.v1",
                    "project_id": "project-1",
                    "epoch": "mcp-feed",
                    "next_sequence": 3,
                    "ideas": [
                        {
                            "id": "idea-1",
                            "title": "Probe the root idea",
                            "body": "Run the smallest discriminating probe.",
                            "archived": False,
                            "created": "2026-09-15",
                            "updated": "2026-09-16",
                            "node": "direction.A",
                            "source": {"chat_title": "Probe discussion"},
                        }
                    ],
                    "changes": [
                        {
                            "sequence": 1,
                            "at": "2026-09-15T00:00:00Z",
                            "kind": "project.snapshot",
                            "summary": "Project snapshot created",
                            "refs": [{"kind": "project", "id": "project-1"}],
                        },
                        {
                            "sequence": 2,
                            "at": "2026-09-16T00:00:00Z",
                            "kind": "idea.node_linked",
                            "summary": "Idea linked to root node",
                            "refs": [
                                {"kind": "project", "id": "project-1"},
                                {"kind": "idea", "id": "idea-1"},
                                {"kind": "node", "id": "direction.A"},
                            ],
                        },
                    ],
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (meridian_root / "experiments/probe.md").write_text(
            "---\n"
            "type: research-experiment\n"
            "id: probe\n"
            "validity: valid\n"
            "primary_target: direction.A\n"
            "---\n"
            "# Experiment: Probe\n\n"
            "## Question\n\nDoes the first probe support the root idea?\n\n"
            "## Command / Config / Output\n\n- command: `run-probe`\n- output: `results/probe.json`\n\n"
            "## Result\n\nThe probe completed with a positive signal.\n\n"
            "## Validity\n\n`valid`\n\n"
            "## Interpretation\n\nThe root idea remains worth pursuing.\n",
            encoding="utf-8",
        )
        (meridian_root / "state.md").write_text(
            "---\ntype: lab-state\nactive_thread: direction\nactive_path: [direction.A]\n---\n# State\n",
            encoding="utf-8",
        )
        (meridian_root / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
        (meridian_root / "experiments/index.md").write_text(
            "# Experiments\n", encoding="utf-8"
        )
        (meridian_root / "proposals/index.md").write_text(
            "# Proposals\n", encoding="utf-8"
        )
        (meridian_root / "threads/direction.md").write_text(
            "---\ntype: research-thread\ntitle: Direction\nactive_node: A\n---\n"
            "# Research Thread: Direction\n\n"
            "## Approach Tree\n\n"
            "### Node A: Root idea\n\n"
            "- mode: `unresolved`\n"
            "- active: true\n\n"
            "#### Next Action\n\n"
            "Run the first probe.\n",
            encoding="utf-8",
        )
        return plan

    def _call(
        self, server: MeridianMCPServer, name: str, arguments: dict[str, object]
    ) -> tuple[dict, dict]:
        response = server.handle_message(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
        )
        self.assertIsNotNone(response)
        result = response["result"]
        payload = json.loads(result["content"][0]["text"])
        return result, payload

    def test_tool_results_warn_only_after_code_on_disk_changes(self) -> None:
        with patch("meridian.mcp.server.source_stamp", return_value=100):
            server = MeridianMCPServer()
            current, _ = self._call(server, "meridian.capabilities", {})
            unknown_current = server.handle_message(
                {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "missing"}}
            )["result"]
        with patch("meridian.mcp.server.source_stamp", return_value=200):
            stale, payload = self._call(server, "meridian.capabilities", {})
            unknown_stale = server.handle_message(
                {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "missing"}}
            )["result"]

        self.assertEqual(len(current["content"]), 1)
        self.assertEqual(len(unknown_current["content"]), 1)
        self.assertIn("tools", payload)
        self.assertEqual(len(stale["content"]), 2)
        self.assertIn("restart the agent session", stale["content"][1]["text"])
        self.assertTrue(unknown_stale["isError"])
        self.assertIn("restart the agent session", unknown_stale["content"][1]["text"])

    def test_registry_and_capabilities_expose_workspace_tools(self) -> None:
        server = MeridianMCPServer()
        response = server.handle_message(
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        )
        names = {tool["name"] for tool in response["result"]["tools"]}

        self.assertTrue(
            {
                "meridian.workspace_status",
                "meridian.workspace_plan",
                "meridian.workspace_event_add",
            }.issubset(names)
        )
        capabilities = adapter.capabilities(detail="full")
        workspace_tools = {
            tool["name"]
            for tool in capabilities["tools"]
            if tool["workflow"] == "Project Workspace"
        }
        self.assertEqual(
            workspace_tools,
            {
                "meridian.workspace_status",
                "meridian.workspace_plan",
                "meridian.workspace_event_add",
                "meridian.workspace_idea_add",
            },
        )
        coding_tools = {
            tool["name"]
            for tool in capabilities["tools"]
            if tool["workflow"] == "Coding Context"
        }
        self.assertEqual(
            coding_tools,
            {
                "meridian.workspace_changes",
                "meridian.workspace_idea",
                "meridian.lab_node",
            },
        )
        self.assertTrue(coding_tools.issubset(names))
        lab_tools = {
            tool["name"] for tool in capabilities["tools"] if tool["workflow"] == "Lab"
        }
        self.assertEqual(
            lab_tools,
            {"meridian.lab_graph", "meridian.lab_update", "meridian.lab_result"},
        )
        self.assertTrue(lab_tools.issubset(names))

    def test_tools_read_plan_and_append_source_backed_event_without_mutating_plan(
        self,
    ) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = self._workspace(root)
            plan_before = plan.read_bytes()
            server = MeridianMCPServer(default_workspace_root=root)

            _, status = self._call(server, "meridian.workspace_status", {})
            _, plan_payload = self._call(server, "meridian.workspace_plan", {})
            _, event = self._call(
                server,
                "meridian.workspace_event_add",
                {
                    "event_id": "probe-complete",
                    "date": "2026-09-16",
                    "title": "Probe completed",
                    "kind": "result",
                    "detail": "Latency dropped 12ms",
                    "source": ".meridian/experiments/probe.md",
                    "node": "direction.A",
                },
            )
            _, duplicate = self._call(
                server,
                "meridian.workspace_event_add",
                {
                    "event_id": "probe-complete",
                    "date": "2026-09-16",
                    "title": "Probe completed",
                    "kind": "result",
                    "detail": "Latency dropped 12ms",
                    "source": ".meridian/experiments/probe.md",
                    "node": "direction.A",
                },
            )
            _, after = self._call(server, "meridian.workspace_status", {})

            self.assertEqual(status["status"], "ready")
            self.assertEqual(plan_payload["revision"], "revision-1")
            self.assertEqual(event["status"], "created")
            self.assertEqual(event["event"]["kind"], "result")
            self.assertEqual(event["event"]["text"], "Probe completed")
            self.assertEqual(event["event"]["detail"], "Latency dropped 12ms")
            self.assertIn("at", event["event"])
            self.assertEqual(duplicate["status"], "unchanged")
            self.assertEqual(after["surfaces"]["events"]["event_count"], 1)
            self.assertEqual(plan.read_bytes(), plan_before)

    def test_idea_add_records_agent_ideas_idempotently_and_rejects_conflicts(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = self._workspace(root)
            plan_before = plan.read_bytes()
            server = MeridianMCPServer(default_workspace_root=root)
            arguments = {
                "idea_id": "prefix-cache-eviction",
                "date": "2026-09-21",
                "title": "Evict prefix cache by reuse distance",
                "body": "Replace LRU with reuse-distance scoring for shared prefixes.",
                "context": "Claude Code session on cache eviction",
                "node": "direction.A",
            }

            _, created = self._call(server, "meridian.workspace_idea_add", arguments)
            _, repeated = self._call(server, "meridian.workspace_idea_add", arguments)
            conflict, _ = self._call(
                server, "meridian.workspace_idea_add", {**arguments, "body": "Something else."},
            )

            self.assertEqual(created["status"], "created")
            self.assertEqual(repeated["status"], "unchanged")
            self.assertTrue(conflict["isError"])
            stored = json.loads((root / ".meridian/ideas/ideas.json").read_text(encoding="utf-8"))
            self.assertEqual(stored["schema_version"], "meridian.workspace-agent-ideas.v1")
            self.assertEqual([idea["id"] for idea in stored["ideas"]], ["prefix-cache-eviction"])
            self.assertEqual(stored["ideas"][0]["context"], "Claude Code session on cache eviction")
            self.assertEqual(plan.read_bytes(), plan_before)

    def test_coding_context_reads_cursor_then_expands_only_referenced_entities(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            server = MeridianMCPServer(default_workspace_root=root)

            _, changes = self._call(
                server,
                "meridian.workspace_changes",
                {"cursor": "mcp-feed:1"},
            )
            _, idea = self._call(
                server,
                "meridian.workspace_idea",
                {"idea_id": "idea-1"},
            )
            _, node = self._call(
                server,
                "meridian.lab_node",
                {"node_id": "direction.A"},
            )

            self.assertEqual(changes["cursor_status"], "ok")
            self.assertEqual([item["sequence"] for item in changes["changes"]], [2])
            self.assertEqual(
                [item["tool"] for item in changes["changes"][0]["expand"]],
                ["meridian.workspace_plan", "meridian.workspace_idea", "meridian.lab_node"],
            )
            self.assertEqual(idea["idea"]["body"], "Run the smallest discriminating probe.")
            self.assertEqual(node["node"]["id"], "direction.A")
            self.assertEqual(node["linked_ideas"][0]["id"], "idea-1")

    def test_explicit_workspace_root_and_invalid_source_return_structured_results(
        self,
    ) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            root.mkdir()
            self._workspace(root)
            server = MeridianMCPServer(default_workspace_root=Path(tmp) / "wrong")

            result, plan = self._call(
                server,
                "meridian.workspace_plan",
                {"workspace_root": str(root)},
            )
            _, changes = self._call(
                server,
                "meridian.workspace_changes",
                {"workspace_root": str(root), "cursor": "mcp-feed:1"},
            )
            error_result, error = self._call(
                server,
                "meridian.workspace_event_add",
                {
                    "workspace_root": str(root),
                    "event_id": "missing-evidence",
                    "title": "Should fail",
                    "kind": "note",
                    "source": "results/missing.json",
                },
            )

            self.assertNotIn("isError", result)
            self.assertEqual(plan["revision"], "revision-1")
            self.assertTrue(all(
                expansion["arguments"]["workspace_root"] == str(root)
                for expansion in changes["changes"][0]["expand"]
            ))
            self.assertTrue(error_result["isError"])
            self.assertEqual(error["error_code"], "workspace_protocol_error")
            self.assertIn("existing file", error["message"])

    def test_lab_tools_read_graph_and_apply_only_confirmed_agent_owned_state(
        self,
    ) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = self._workspace(root)
            plan_before = plan.read_bytes()
            server = MeridianMCPServer(default_workspace_root=root)

            _, before = self._call(server, "meridian.lab_graph", {})
            _, rejected = self._call(
                server,
                "meridian.lab_update",
                {
                    "packet": {
                        "schema": "meridian.lab.update.v1",
                        "intent": "create_branch",
                        "target_thread": "direction",
                        "changes": [
                            {
                                "op": "create_node",
                                "node_id": "direction.B",
                                "title": "Repair branch",
                                "parent": "direction.A",
                            }
                        ],
                        "user_confirmation": {
                            "required_for": ["create_node"],
                            "status": "missing",
                        },
                    }
                },
            )
            _, applied = self._call(
                server,
                "meridian.lab_update",
                {
                    "packet": {
                        "schema": "meridian.lab.update.v1",
                        "intent": "create_branch",
                        "target_thread": "direction",
                        "changes": [
                            {
                                "op": "create_node",
                                "node_id": "direction.B",
                                "title": "Repair branch",
                                "parent": "direction.A",
                                "next_action": "Run the repair probe.",
                            },
                            {
                                "op": "activate_node",
                                "node_id": "direction.B",
                            },
                        ],
                        "user_confirmation": {
                            "required_for": ["create_node"],
                            "status": "accepted",
                        },
                    }
                },
            )
            _, after = self._call(server, "meridian.lab_graph", {})

            self.assertEqual(before["health"]["status"], "pass")
            self.assertEqual(rejected["status"], "rejected")
            self.assertEqual(applied["status"], "applied")
            self.assertIn(
                "direction.B", {node["id"] for node in after["graph"]["nodes"]}
            )
            self.assertIn(
                ("direction.A", "direction.B"),
                {(edge["source"], edge["target"]) for edge in after["graph"]["edges"]},
            )
            self.assertEqual(
                after["graph"]["active_nodes"], ["direction.A", "direction.B"]
            )
            self.assertEqual(plan.read_bytes(), plan_before)

    def test_lab_result_projects_existing_experiment_atomically_without_mutating_plan(
        self,
    ) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = self._workspace(root)
            plan_before = plan.read_bytes()
            server = MeridianMCPServer(default_workspace_root=root)

            _, result = self._call(
                server,
                "meridian.lab_result",
                {
                    "node_id": "direction.A",
                    "event_id": "probe-result",
                    "date": "2026-09-16",
                    "summary": "First probe supports the root idea",
                    "source": ".meridian/experiments/probe.md",
                    "impact": "supports",
                    "state": "supported",
                    "next_action": "Run the second probe.",
                },
            )
            _, duplicate = self._call(
                server,
                "meridian.lab_result",
                {
                    "node_id": "direction.A",
                    "event_id": "probe-result",
                    "date": "2026-09-16",
                    "summary": "First probe supports the root idea",
                    "source": ".meridian/experiments/probe.md",
                    "impact": "supports",
                    "state": "supported",
                    "next_action": "Run the second probe.",
                },
            )
            _, graph = self._call(server, "meridian.lab_graph", {})

            self.assertEqual(result["status"], "applied")
            self.assertEqual(duplicate["status"], "unchanged")
            self.assertEqual(result["event"]["status"], "created")
            self.assertEqual(duplicate["event"]["status"], "unchanged")
            self.assertIn(".meridian/events/events.json", result["written_paths"])
            self.assertEqual(duplicate["written_paths"], [])
            node = next(
                item for item in graph["graph"]["nodes"] if item["id"] == "direction.A"
            )
            self.assertEqual(node["state"], "supported")
            self.assertIn(
                "probe", graph["graph"]["node_details"]["direction.A"]["experiments"]
            )
            artifacts = graph["graph"]["supporting_artifacts"]["direction.A"]
            self.assertEqual([item["id"] for item in artifacts], ["probe"])
            events = json.loads(
                (root / ".meridian/events/events.json").read_text(encoding="utf-8")
            )
            self.assertEqual(len(events["events"]), 1)
            self.assertEqual(plan.read_bytes(), plan_before)

    def test_lab_result_rejects_incomplete_evidence_before_any_projection_write(
        self,
    ) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = self._workspace(root)
            plan_before = plan.read_bytes()
            thread = root / ".meridian/threads/direction.md"
            thread_before = thread.read_bytes()
            (root / ".meridian/experiments/probe.md").write_text(
                "---\ntype: research-experiment\nid: probe\nvalidity: valid\nprimary_target: direction.A\n---\n# Experiment: Probe\n",
                encoding="utf-8",
            )
            server = MeridianMCPServer(default_workspace_root=root)

            tool_result, error = self._call(
                server,
                "meridian.lab_result",
                {
                    "node_id": "direction.A",
                    "event_id": "incomplete-probe",
                    "summary": "This must not be projected",
                    "source": ".meridian/experiments/probe.md",
                    "impact": "supports",
                },
            )

            self.assertTrue(tool_result["isError"])
            self.assertEqual(error["error_code"], "workspace_protocol_error")
            self.assertIn("missing durable evidence sections", error["message"])
            self.assertFalse((root / ".meridian/events/events.json").exists())
            self.assertFalse((root / ".meridian/graph/graph.json").exists())
            self.assertEqual(thread.read_bytes(), thread_before)
            self.assertEqual(plan.read_bytes(), plan_before)

    def test_lab_result_rolls_back_node_and_graph_when_event_commit_fails(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = self._workspace(root)
            plan_before = plan.read_bytes()
            thread = root / ".meridian/threads/direction.md"
            thread_before = thread.read_bytes()
            server = MeridianMCPServer(default_workspace_root=root)

            with patch(
                "meridian.lab.result.commit_workspace_event",
                side_effect=OSError("projection failed"),
            ):
                tool_result, error = self._call(
                    server,
                    "meridian.lab_result",
                    {
                        "node_id": "direction.A",
                        "event_id": "rollback-probe",
                        "summary": "This write will be rolled back",
                        "source": ".meridian/experiments/probe.md",
                        "impact": "updates",
                        "state": "supported",
                    },
                )

            self.assertTrue(tool_result["isError"])
            self.assertIn("projection failed", error["message"])
            self.assertEqual(thread.read_bytes(), thread_before)
            self.assertFalse((root / ".meridian/events/events.json").exists())
            self.assertFalse((root / ".meridian/graph/graph.json").exists())
            self.assertEqual(plan.read_bytes(), plan_before)

    def test_lab_result_preserves_confirmation_gate_before_writing(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = self._workspace(root)
            plan_before = plan.read_bytes()
            thread = root / ".meridian/threads/direction.md"
            thread_before = thread.read_bytes()
            server = MeridianMCPServer(default_workspace_root=root)

            tool_result, result = self._call(
                server,
                "meridian.lab_result",
                {
                    "node_id": "direction.A",
                    "event_id": "dead-without-confirmation",
                    "summary": "Probe would close the branch",
                    "source": ".meridian/experiments/probe.md",
                    "impact": "refutes",
                    "state": "dead",
                },
            )

            self.assertNotIn("isError", tool_result)
            self.assertEqual(result["status"], "rejected")
            self.assertEqual(
                result["validation"]["findings"][0]["code"], "confirmation_required"
            )
            self.assertEqual(thread.read_bytes(), thread_before)
            self.assertFalse((root / ".meridian/events/events.json").exists())
            self.assertFalse((root / ".meridian/graph/graph.json").exists())
            self.assertEqual(plan.read_bytes(), plan_before)

    def test_lab_result_does_not_turn_invalid_evidence_into_a_node_claim(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = self._workspace(root)
            plan_before = plan.read_bytes()
            thread = root / ".meridian/threads/direction.md"
            thread_before = thread.read_bytes()
            experiment = root / ".meridian/experiments/probe.md"
            experiment.write_text(
                experiment.read_text(encoding="utf-8")
                .replace("validity: valid", "validity: invalid")
                .replace("`valid`", "`invalid`"),
                encoding="utf-8",
            )
            server = MeridianMCPServer(default_workspace_root=root)

            tool_result, error = self._call(
                server,
                "meridian.lab_result",
                {
                    "node_id": "direction.A",
                    "event_id": "invalid-probe",
                    "summary": "Invalid probe must not support the node",
                    "source": ".meridian/experiments/probe.md",
                    "impact": "supports",
                    "state": "supported",
                },
            )

            self.assertTrue(tool_result["isError"])
            self.assertIn("only valid experiment evidence", error["message"])
            self.assertEqual(thread.read_bytes(), thread_before)
            self.assertFalse((root / ".meridian/events/events.json").exists())
            self.assertFalse((root / ".meridian/graph/graph.json").exists())
            self.assertEqual(plan.read_bytes(), plan_before)

    NEW_EXPERIMENT = {
        "title": "Second probe",
        "validity": "valid",
        "question": "Does eviction keep accuracy?",
        "command": "python probe.py --evict 0.5; output runs/second.json",
        "result": "Accuracy stayed within 0.2 points.",
        "interpretation": "Supports eviction at 0.5; says nothing about longer contexts.",
    }

    def test_lab_result_writes_a_new_experiment_record_and_attaches_it(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            server = MeridianMCPServer(default_workspace_root=root)

            _, result = self._call(
                server,
                "meridian.lab_result",
                {
                    "node_id": "direction.A",
                    "event_id": "second-probe",
                    "summary": "Second probe supports eviction",
                    "source": ".meridian/experiments/second.md",
                    "impact": "supports",
                    "experiment": self.NEW_EXPERIMENT,
                },
            )
            _, graph = self._call(server, "meridian.lab_graph", {})

            self.assertEqual(result["status"], "applied")
            self.assertIn(".meridian/experiments/second.md", result["written_paths"])
            self.assertEqual(result["evidence"]["id"], "second")
            self.assertEqual(result["evidence"]["primary_target"], "direction.A")
            record = (root / ".meridian/experiments/second.md").read_text(encoding="utf-8")
            self.assertIn("type: research-experiment", record)
            self.assertIn("Accuracy stayed within 0.2 points.", record)
            self.assertIn(
                "second", graph["graph"]["node_details"]["direction.A"]["experiments"]
            )

    def test_lab_result_removes_the_new_record_when_the_result_is_rejected(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            thread = root / ".meridian/threads/direction.md"
            thread_before = thread.read_bytes()
            server = MeridianMCPServer(default_workspace_root=root)

            _, result = self._call(
                server,
                "meridian.lab_result",
                {
                    "node_id": "direction.A",
                    "event_id": "second-probe-dead",
                    "summary": "Would close the branch",
                    "source": ".meridian/experiments/second.md",
                    "impact": "refutes",
                    "state": "dead",
                    "experiment": self.NEW_EXPERIMENT,
                },
            )

            self.assertEqual(result["status"], "rejected")
            self.assertFalse((root / ".meridian/experiments/second.md").exists())
            self.assertEqual(thread.read_bytes(), thread_before)
            self.assertFalse((root / ".meridian/events/events.json").exists())

    def test_lab_result_never_overwrites_an_existing_record(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._workspace(root)
            existing = root / ".meridian/experiments/probe.md"
            existing_before = existing.read_bytes()
            server = MeridianMCPServer(default_workspace_root=root)

            tool_result, error = self._call(
                server,
                "meridian.lab_result",
                {
                    "node_id": "direction.A",
                    "event_id": "overwrite-probe",
                    "summary": "Must not replace the record",
                    "source": ".meridian/experiments/probe.md",
                    "impact": "supports",
                    "experiment": self.NEW_EXPERIMENT,
                },
            )

            self.assertTrue(tool_result["isError"])
            self.assertIn("already exists", error["message"])
            self.assertEqual(existing.read_bytes(), existing_before)
            self.assertFalse((root / ".meridian/events/events.json").exists())

    def test_lab_result_rejects_malformed_new_records_without_writing(self) -> None:
        cases = {
            "unknown field": ({**self.NEW_EXPERIMENT, "notes": "x"}, ".meridian/experiments/second.md", "unknown fields"),
            "empty result": ({**self.NEW_EXPERIMENT, "result": " "}, ".meridian/experiments/second.md", "non-empty result"),
            "bad validity": ({**self.NEW_EXPERIMENT, "validity": "maybe"}, ".meridian/experiments/second.md", "validity"),
            "outside experiments": (self.NEW_EXPERIMENT, ".meridian/notes/second.md", "experiments/<id>.md"),
            "escaping path": (self.NEW_EXPERIMENT, ".meridian/experiments/../second.md", "experiments/<id>.md"),
            "index": (self.NEW_EXPERIMENT, ".meridian/experiments/index.md", "experiments/<id>.md"),
        }
        for label, (experiment, source, message) in cases.items():
            with self.subTest(label), TemporaryDirectory() as tmp:
                root = Path(tmp)
                self._workspace(root)
                before = sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))
                server = MeridianMCPServer(default_workspace_root=root)

                tool_result, error = self._call(
                    server,
                    "meridian.lab_result",
                    {
                        "node_id": "direction.A",
                        "event_id": "malformed",
                        "summary": "Must not write",
                        "source": source,
                        "impact": "supports",
                        "experiment": experiment,
                    },
                )

                self.assertTrue(tool_result["isError"])
                self.assertIn(message, error["message"])
                self.assertEqual(
                    sorted(path.relative_to(root).as_posix() for path in root.rglob("*")), before
                )


if __name__ == "__main__":
    unittest.main()
