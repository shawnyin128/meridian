"""Several projects in one workspace: each keeps its own space, and agents name the project they work for."""

from __future__ import annotations

import hashlib
import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from meridian.cli import main
from meridian.lab.focus_hook import run_lab_focus_hook
from meridian.lab.state import initialize_lab_space
from meridian.mcp.server import MeridianMCPServer

_EXPERIMENT = (
    "---\ntype: research-experiment\nid: probe\nvalidity: valid\nprimary_target: {node}\n---\n"
    "# Experiment: Probe\n\n## Question\n\nDoes it hold?\n\n## Command / Config / Output\n\n- command: `run`\n\n"
    "## Result\n\nPositive.\n\n## Validity\n\n`valid`\n\n## Interpretation\n\nKeep going.\n"
)


def _space(root: Path, folder: str, project_id: str, name: str, thread: str) -> Path:
    """Writes a project space as the App and an agent leave it: manifest, plan, journal, Lab state, one thread."""

    space = root / folder
    (space / "control").mkdir(parents=True)
    surfaces = {
        "plan": {"path": f"{folder}/control/plan.json", "writer": "meridian-app"},
        "changes": {"path": f"{folder}/control/changes.json", "writer": "meridian-app"},
        "graph": {"path": f"{folder}/graph/graph.json", "writer": "workspace"},
        "events": {"path": f"{folder}/events/events.json", "writer": "workspace"},
        "ideas": {"path": f"{folder}/ideas/ideas.json", "writer": "workspace"},
    }
    (space / "workspace.json").write_text(json.dumps({
        "schema_version": "meridian.workspace.v1", "project": {"id": project_id, "name": name}, "surfaces": surfaces,
    }), encoding="utf-8")
    (space / "control/plan.json").write_text(json.dumps({
        "schema_version": "meridian.project-plan.v1", "revision": f"rev-{project_id}", "updated_at": "2026-10-20T00:00:00Z",
        "project": {"id": project_id, "name": name}, "tasks": [{"id": f"{project_id}-task", "title": f"{name} task"}],
        "milestones": [],
    }), encoding="utf-8")
    (space / "control/changes.json").write_text(json.dumps({
        "schema_version": "meridian.workspace-changes.v1", "project_id": project_id, "epoch": f"epoch-{project_id}",
        "next_sequence": 2,
        "ideas": [{
            "id": f"{project_id}-idea", "title": f"{name} idea", "body": "b", "archived": False, "created": "2026-10-20",
            "updated": "2026-10-20", "node": f"{thread}.A", "source": {"chat_title": "chat"},
        }],
        "changes": [{
            "sequence": 1, "at": "2026-10-20T00:00:00Z", "kind": "project.snapshot", "summary": f"{name} snapshot",
            "refs": [{"kind": "project", "id": project_id}],
        }],
    }), encoding="utf-8")
    for records in ("threads", "experiments", "proposals"):
        (space / records).mkdir()
        (space / records / "index.md").write_text(f"# {records}\n", encoding="utf-8")
    (space / "state.md").write_text(
        f"---\ntype: lab-state\nactive_thread: {thread}\nactive_nodes: [{thread}.A]\n---\n", encoding="utf-8"
    )
    (space / "threads" / f"{thread}.md").write_text(
        f"---\ntype: research-thread\ntitle: {name}\n---\n# Research Thread: {name}\n\n## Approach Tree\n\n"
        f"### Node A: {name} root\n\n- mode: `unresolved`\n\n#### Next Action\n\nProbe.\n",
        encoding="utf-8",
    )
    (space / "experiments/probe.md").write_text(_EXPERIMENT.format(node=f"{thread}.A"), encoding="utf-8")
    return space


def _tree(folder: Path) -> dict[str, str]:
    return {
        str(path.relative_to(folder)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(folder.rglob("*"))
        if path.is_file() and "projects" not in path.relative_to(folder).parts[:1]
    }


class WorkspaceSpacesTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        config_home = TemporaryDirectory()
        self.addCleanup(config_home.cleanup)
        environment = patch.dict("os.environ", {"MERIDIAN_CONFIG_HOME": config_home.name})
        environment.start()
        self.addCleanup(environment.stop)
        self.root = Path(temporary.name).resolve()
        self.first = _space(self.root, ".meridian", "p1", "First", "kv")
        self.second = _space(self.root, ".meridian/projects/p2", "p2", "Second", "tree")
        self.server = MeridianMCPServer(default_workspace_root=self.root)

    def _call(self, name: str, arguments: dict[str, object]) -> dict:
        response = self.server.handle_message({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments},
        })
        return json.loads(response["result"]["content"][0]["text"])

    def test_status_without_project_lists_the_projects_to_choose_from(self) -> None:
        status = self._call("meridian.workspace_status", {})
        self.assertEqual(status["status"], "choose_project")
        self.assertEqual(status["projects"], [{"id": "p1", "name": "First"}, {"id": "p2", "name": "Second"}])

    def test_every_other_workspace_and_lab_call_without_project_names_the_projects(self) -> None:
        calls = {
            "meridian.workspace_plan": {},
            "meridian.workspace_changes": {},
            "meridian.workspace_idea": {"idea_id": "p1-idea"},
            "meridian.workspace_event_add": {"event_id": "e", "title": "t", "kind": "note", "source": "x.md"},
            "meridian.workspace_idea_add": {"idea_id": "i", "title": "t", "body": "b"},
            "meridian.workspace_idea_file_add": {"file_id": "f", "idea_id": "i", "path": "x.md"},
            "meridian.workspace_task_add": {"task_id": "t", "title": "t"},
            "meridian.lab_graph": {},
            "meridian.lab_node": {"node_id": "kv.A"},
            "meridian.lab_update": {"packet": {"schema": "meridian.lab.update.v1"}},
            "meridian.lab_result": {
                "node_id": "kv.A", "event_id": "e", "summary": "s", "source": "x.md", "impact": "supports",
            },
        }
        before = _tree(self.root)
        for name, arguments in calls.items():
            with self.subTest(tool=name):
                payload = self._call(name, arguments)
                self.assertEqual(payload["error_code"], "project_required")
                self.assertEqual(payload["projects"], [{"id": "p1", "name": "First"}, {"id": "p2", "name": "Second"}])
                self.assertIn("p1 (First), p2 (Second)", payload["message"])
        self.assertEqual(_tree(self.root), before)

    def test_an_unknown_project_is_refused_with_the_list(self) -> None:
        payload = self._call("meridian.workspace_plan", {"project": "p9"})
        self.assertEqual(payload["error_code"], "project_required")
        self.assertIn("no project 'p9'", payload["message"])

    def test_each_project_reads_only_its_own_plan_changes_ideas_and_graph(self) -> None:
        for project, other in (("p1", "p2"), ("p2", "p1")):
            with self.subTest(project=project):
                status = self._call("meridian.workspace_status", {"project": project})
                self.assertEqual(status["project"]["id"], project)
                plan = self._call("meridian.workspace_plan", {"project": project})
                self.assertEqual([task["id"] for task in plan["tasks"]], [f"{project}-task"])
                changes = self._call("meridian.workspace_changes", {"project": project})
                self.assertEqual(changes["project_id"], project)
                self.assertTrue(changes["next_cursor"].startswith(f"epoch-{project}:"))
                for change in changes["changes"]:
                    for expansion in change["expand"]:
                        self.assertEqual(expansion["arguments"].get("project"), project)
                idea = self._call("meridian.workspace_idea", {"project": project, "idea_id": f"{project}-idea"})
                self.assertEqual(idea["project_id"], project)
                missing = self._call("meridian.workspace_idea", {"project": project, "idea_id": f"{other}-idea"})
                self.assertEqual(missing["error_code"], "workspace_protocol_error")
                thread = "kv" if project == "p1" else "tree"
                graph = self._call("meridian.lab_graph", {"project": project})
                self.assertEqual([node["id"] for node in graph["graph"]["nodes"]], [f"{thread}.A"])
                node = self._call("meridian.lab_node", {"project": project, "node_id": f"{thread}.A"})
                self.assertEqual([item["id"] for item in node["linked_ideas"]], [f"{project}-idea"])

    def test_writes_for_one_project_land_in_its_space_and_leave_the_other_byte_for_byte(self) -> None:
        first_before = _tree(self.first)
        event = self._call("meridian.workspace_event_add", {
            "project": "p2", "event_id": "e1", "title": "Second probe", "kind": "result",
            "source": ".meridian/projects/p2/experiments/probe.md", "date": "2026-10-21",
        })
        idea = self._call("meridian.workspace_idea_add", {"project": "p2", "idea_id": "i1", "title": "Second idea", "body": "b"})
        attached = self._call("meridian.workspace_idea_file_add", {
            "project": "p2", "file_id": "f1", "idea_id": "i1", "path": ".meridian/projects/p2/experiments/probe.md",
        })
        task = self._call("meridian.workspace_task_add", {"project": "p2", "task_id": "t1", "title": "Second step"})
        result = self._call("meridian.lab_result", {
            "project": "p2", "node_id": "tree.A", "event_id": "r1", "date": "2026-10-21", "summary": "Probe supports it",
            "source": ".meridian/projects/p2/experiments/probe.md", "impact": "supports", "state": "supported",
        })
        update = self._call("meridian.lab_update", {"project": "p2", "packet": {
            "schema": "meridian.lab.update.v1", "intent": "create_branch", "target_thread": "tree",
            "changes": [
                {"op": "create_node", "node_id": "tree.B", "title": "Branch", "parent": "tree.A"},
                {"op": "activate_node", "node_id": "tree.B"},
            ],
            "user_confirmation": {"required_for": ["create_node"], "status": "accepted"},
        }})

        self.assertEqual(event["path"], ".meridian/projects/p2/events/events.json")
        self.assertEqual(idea["path"], ".meridian/projects/p2/ideas/ideas.json")
        self.assertEqual(attached["path"], ".meridian/projects/p2/ideas/files.json")
        self.assertEqual(task["path"], ".meridian/projects/p2/tasks/tasks.json")
        self.assertEqual(result["status"], "applied")
        self.assertEqual(update["status"], "applied")
        self.assertEqual(_tree(self.first), first_before)
        graph = json.loads((self.second / "graph/graph.json").read_text(encoding="utf-8"))
        self.assertEqual(graph["lab_root"], ".meridian/projects/p2")
        self.assertEqual({node["id"] for node in graph["nodes"]}, {"tree.A", "tree.B"})
        self.assertEqual(
            graph["supporting_artifacts"]["tree.A"][0]["path"], ".meridian/projects/p2/experiments/probe.md"
        )
        events = json.loads((self.second / "events/events.json").read_text(encoding="utf-8"))["events"]
        self.assertEqual(
            {item["source"] for item in events},
            {".meridian/projects/p2/experiments/probe.md", ".meridian/projects/p2/threads/tree.md"},
        )
        self.assertEqual(self._call("meridian.lab_graph", {"project": "p1"})["graph"]["nodes"][0]["id"], "kv.A")

    def test_a_nested_protocol_file_is_not_evidence(self) -> None:
        payload = self._call("meridian.workspace_event_add", {
            "project": "p1", "event_id": "e1", "title": "t", "kind": "note",
            "source": ".meridian/projects/p2/control/plan.json",
        })
        self.assertIn("not a protocol projection", payload["message"])

    def test_a_workspace_with_one_space_needs_no_project(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _space(root, ".meridian", "p1", "Only", "kv")
            server = MeridianMCPServer(default_workspace_root=root)
            response = server.handle_message({
                "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {"name": "meridian.workspace_plan", "arguments": {}},
            })
            plan = json.loads(response["result"]["content"][0]["text"])
            self.assertEqual(plan["project"]["id"], "p1")

    def test_the_session_hook_lists_the_projects_instead_of_one_focus(self) -> None:
        report = run_lab_focus_hook({"cwd": str(self.root), "hook_event_name": "SessionStart"})
        self.assertEqual(report.splitlines(), [
            "Meridian workspace: 2 projects. Pass `project` (one id below) to every workspace_* and lab_* call.",
            "- p1: First (1 node(s) active)",
            "- p2: Second (1 node(s) active)",
        ])

    def test_the_cli_takes_project_for_workspace_and_lab_commands(self) -> None:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            refused = main(["workspace", "plan", "--root", str(self.root)])
            planned = main(["workspace", "plan", "--root", str(self.root), "--project", "p2"])
            refreshed = main(["lab", "graph-refresh", "--lab-root", str(self.root), "--project", "p2"])
        self.assertEqual(refused, 1)
        self.assertIn("p1 (First), p2 (Second)", err.getvalue())
        self.assertEqual(planned, 0)
        self.assertIn('"p2-task"', out.getvalue())
        self.assertEqual(refreshed, 0)
        self.assertTrue((self.second / "graph/graph.json").exists())
        self.assertFalse((self.first / "graph/graph.json").exists())

    def test_a_lab_cannot_be_started_in_a_space_the_app_did_not_create(self) -> None:
        with self.assertRaises(FileNotFoundError):
            initialize_lab_space(self.root / ".meridian/projects/p3", inject_agents_contract=False)
        self.assertFalse((self.root / ".meridian/projects/p3").exists())


if __name__ == "__main__":
    unittest.main()
