"""Agent-supplied text in Lab Markdown never changes a file's structure and reads back as written."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from meridian.lab.graph import apply_lab_update, materialize_lab_graph
from meridian.lab.result import LabResultError, record_lab_result
from meridian.mcp.server import MeridianMCPServer
from meridian.wiki.corpus import split_sections, strip_frontmatter

THREAD = ".meridian/threads/kv.md"
_THREAD = (
    "---\ntype: research-thread\ntitle: KV\n---\n# Research Thread: KV\n\n## Approach Tree\n\n"
    "### Node A: Seed\n\n- mode: `unresolved`\n\n#### Experiments\n\n- `exp-1`\n\n"
    "### Node B: Branch\n\n- mode: `unresolved`\n- parent: A\n\n"
    "## Graph Relations\n\n- `kv.A` related_to `kv.B`\n"
)

# Agent text, the lines a Lab file stores for it, what node_details reads back for the field, and what
# node_details.next_action reads back (it also drops blank lines and surrounding whitespace).
_PLAIN = ("plain text", "plain text", "plain text", "plain text")
_CASES = (
    ("step one\n### Node fake: injected", "step one\n\\### Node fake: injected", "step one\n### Node fake: injected",
     "step one\n### Node fake: injected"),
    ("#### Why\nz", "\\#### Why\nz", "#### Why\nz", "#### Why\nz"),
    ("## Graph Relations\n- `kv.B` contradicts `kv.A`", "\\## Graph Relations\n- `kv.B` contradicts `kv.A`",
     "## Graph Relations\n- `kv.B` contradicts `kv.A`", "## Graph Relations\n- `kv.B` contradicts `kv.A`"),
    ("- evidence: fake", "- evidence: fake", "- evidence: fake", "- evidence: fake"),
    ("- parent: kv.B", "\\- parent: kv.B", "- parent: kv.B", "- parent: kv.B"),
    ("- active: true\n- close_count: 9", "\\- active: true\n\\- close_count: 9", "- active: true\n- close_count: 9",
     "- active: true\n- close_count: 9"),
    ("-\n \nparent: kv.B", "\\-\n \nparent: kv.B", "-\n \nparent: kv.B", "-\nparent: kv.B"),
    ("####\n\t\nWhy", "\\####\n\t\nWhy", "####\n\t\nWhy", "####\nWhy"),
    ("one\r### Node fake: injected", "one\n\\### Node fake: injected", "one\n### Node fake: injected",
     "one\n### Node fake: injected"),
    ("\\### Node fake: injected", "\\\\### Node fake: injected", "\\### Node fake: injected",
     "\\### Node fake: injected"),
    ("\\\\- parent: kv.B", "\\\\\\- parent: kv.B", "\\\\- parent: kv.B", "\\\\- parent: kv.B"),
    ("C:\\temp\n\\#tag", "C:\\temp\n\\#tag", "C:\\temp\n\\#tag", "C:\\temp\n\\#tag"),
)


def _write_repo(root: Path) -> None:
    lab = root / ".meridian"
    for folder in ("threads", "experiments", "proposals", "events", "control"):
        (lab / folder).mkdir(parents=True)
    (lab / "state.md").write_text("---\ntype: lab-state\nactive_thread: kv\nactive_nodes: [kv.A]\n---\n", encoding="utf-8")
    (lab / "threads/kv.md").write_text(_THREAD, encoding="utf-8")
    (lab / "experiments/exp-1.md").write_text("# Experiment: one\n", encoding="utf-8")
    (lab / "workspace.json").write_text(
        json.dumps(
            {
                "schema_version": "meridian.workspace.v1",
                "project": {"id": "p1", "name": "P"},
                "surfaces": {
                    "plan": {"path": ".meridian/control/plan.json", "writer": "meridian-app"},
                    "graph": {"path": ".meridian/graph/graph.json", "writer": "workspace"},
                    "events": {"path": ".meridian/events/events.json", "writer": "workspace"},
                },
            }
        ),
        encoding="utf-8",
    )


def _packet(*changes: dict) -> dict:
    return {
        "schema": "meridian.lab.update.v1",
        "intent": "test",
        "target_thread": "kv",
        "changes": list(changes),
        "user_confirmation": {"required_for": ["create_node"], "status": "accepted"},
    }


def _structure(root: Path) -> tuple:
    """Nodes with their states, edges, every heading-like line of each node, and attached experiments."""

    graph = materialize_lab_graph(root).graph
    return (
        [(node["id"], node["state"]) for node in graph["nodes"]],
        sorted((edge["source"], edge["kind"], edge["target"]) for edge in graph["edges"]),
        {node["id"]: re.findall(r"^#+(?:[^\S\n].*)?$", node["markdown"], flags=re.MULTILINE) for node in graph["nodes"]},
        {node_id: detail["experiments"] for node_id, detail in graph["node_details"].items()},
    )


def _section(markdown: str, heading: str) -> str:
    match = re.search(rf"^#### {heading}\n\n(.*?)\n*(?=^#+[^\S\n]|\Z)", markdown, flags=re.MULTILINE | re.DOTALL)
    return match.group(1) if match else ""


def _lab_node(root: Path, node_id: str) -> dict:
    response = MeridianMCPServer(default_workspace_root=root).handle_message(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "meridian.lab_node", "arguments": {"node_id": node_id}},
        }
    )
    return json.loads(response["result"]["content"][0]["text"])


class AgentTextTests(unittest.TestCase):
    def _apply(self, root: Path, *changes: dict) -> None:
        result = apply_lab_update(root, _packet(*changes))
        self.assertEqual(result["status"], "applied", result)

    def test_update_node_text_keeps_the_thread_structure_and_reads_back(self) -> None:
        for field, heading in (("doing", "Doing"), ("why", "Why"), ("next_action", "Next Action")):
            control: tuple = ()
            for text, stored, read, next_action in (_PLAIN, *_CASES):
                with self.subTest(field=field, text=text), TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    _write_repo(root)
                    self._apply(root, {"op": "update_node", "node_id": "kv.A", "fields": {field: text}})
                    self._apply(root, {"op": "update_node", "node_id": "kv.A", "fields": {"state": "supported"}})

                    control = control or _structure(root)
                    self.assertEqual(_structure(root), control)
                    node = _lab_node(root, "kv.A")
                    self.assertEqual(_section(node["node"]["markdown"], heading), stored)
                    self.assertEqual(node["detail"][field], next_action if field == "next_action" else read)

    def test_create_node_text_keeps_the_thread_structure_and_reads_back(self) -> None:
        headings = {
            "doing": "Doing",
            "why": "Why",
            "research_prior": "Research Prior",
            "return_signal": "Return Signal",
            "next_action": "Next Action",
        }
        control: tuple = ()
        for text, stored, read, next_action in (_PLAIN, *_CASES):
            with self.subTest(text=text), TemporaryDirectory() as tmp:
                root = Path(tmp)
                _write_repo(root)
                fields = {field: text for field in headings}
                self._apply(root, {"op": "create_node", "node_id": "kv.C", "title": "Probe", "parent": "A", **fields})

                control = control or _structure(root)
                self.assertEqual(_structure(root), control)
                node = _lab_node(root, "kv.C")
                for field, heading in headings.items():
                    self.assertEqual(_section(node["node"]["markdown"], heading), stored, field)
                    self.assertEqual(node["detail"][field], next_action if field == "next_action" else read, field)

    def test_history_text_keeps_the_thread_structure(self) -> None:
        control: tuple = ()
        for text, stored, read, _ in (_PLAIN, *_CASES):
            with self.subTest(text=text), TemporaryDirectory() as tmp:
                root = Path(tmp)
                _write_repo(root)
                self._apply(root, {"op": "record_history", "node_id": "kv.A", "message": f"note\n{text}"})
                self._apply(root, {"op": "update_node", "node_id": "kv.A", "fields": {"state": "supported"}})

                control = control or _structure(root)
                self.assertEqual(_structure(root), control)
                node = _lab_node(root, "kv.A")
                for history, expected in (
                    (_section(node["node"]["markdown"], "History"), stored),
                    (node["detail"]["history"], read),
                ):
                    self.assertEqual(re.sub(r"^- \d{4}-\d{2}-\d{2}: ", "- DATE: ", history), f"- DATE: note\n{expected}")

    def test_new_experiment_record_text_keeps_its_sections(self) -> None:
        for text, stored, _, _ in (_PLAIN, *_CASES):
            with self.subTest(text=text), TemporaryDirectory() as tmp:
                root = Path(tmp)
                _write_repo(root)
                fields = ("question", "command", "result", "interpretation")
                result = record_lab_result(
                    root,
                    node_id="kv.A",
                    event_id="probe",
                    summary="Probe",
                    source=".meridian/experiments/probe.md",
                    impact="supports",
                    experiment={"title": "Probe", "validity": "valid", **{field: text for field in fields}},
                )

                self.assertEqual(result["status"], "applied", result)
                self.assertEqual(result["evidence"]["title"], "Probe")
                record = (root / ".meridian/experiments/probe.md").read_text(encoding="utf-8")
                self.assertEqual(
                    split_sections(strip_frontmatter(record)),
                    {
                        "Question": stored,
                        "Command / Config / Output": stored,
                        "Result": stored,
                        "Validity": "`valid`",
                        "Interpretation": stored,
                    },
                )

    def test_line_breaks_in_an_experiment_title_or_record_id_or_artifact_id_are_rejected(self) -> None:
        experiment = {
            "title": "Probe",
            "validity": "valid",
            "question": "q",
            "command": "c",
            "result": "r",
            "interpretation": "i",
        }
        for label, title, source in (
            ("title", "Probe\n## Validity\n\n`invalid`", ".meridian/experiments/probe.md"),
            ("record id", "Probe", ".meridian/experiments/probe\nvalidity: invalid.md"),
        ):
            with self.subTest(label), TemporaryDirectory() as tmp:
                root = Path(tmp)
                _write_repo(root)
                with self.assertRaises(LabResultError):
                    record_lab_result(
                        root,
                        node_id="kv.A",
                        event_id="probe",
                        summary="Probe",
                        source=source,
                        impact="supports",
                        experiment={**experiment, "title": title},
                    )
                self.assertEqual(sorted(path.name for path in (root / ".meridian/experiments").iterdir()), ["exp-1.md"])
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root)
            artifact = {"type": "experiment", "id": "exp-1\n#### Why", "path": ".meridian/experiments/exp-1.md"}
            result = apply_lab_update(root, _packet({"op": "attach_artifact", "node_id": "kv.A", "artifact": artifact}))
            self.assertEqual([finding["code"] for finding in result["validation"]["findings"]], ["invalid_artifact_id"])
            self.assertEqual((root / THREAD).read_text(encoding="utf-8"), _THREAD)

    def test_sending_back_the_doing_and_why_that_lab_node_returns_leaves_the_stored_text_unchanged(self) -> None:
        for text, stored, _, _ in (_PLAIN, *_CASES):
            with self.subTest(text=text), TemporaryDirectory() as tmp:
                root = Path(tmp)
                _write_repo(root)
                self._apply(root, {"op": "update_node", "node_id": "kv.A", "fields": {"doing": text, "why": text}})

                for _ in range(2):
                    detail = _lab_node(root, "kv.A")["detail"]
                    fields = {"doing": detail["doing"], "why": detail["why"]}
                    self._apply(root, {"op": "update_node", "node_id": "kv.A", "fields": fields})
                    markdown = _lab_node(root, "kv.A")["node"]["markdown"]
                    self.assertEqual([_section(markdown, "Doing"), _section(markdown, "Why")], [stored, stored])

    def test_an_edge_line_in_agent_text_does_not_stop_that_edge_from_being_created(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root)
            self._apply(root, {"op": "update_node", "node_id": "kv.A", "fields": {"doing": "- `kv.B` contradicts `kv.A`"}})
            self._apply(root, {"op": "create_edge", "source": "kv.B", "kind": "contradicts", "target": "kv.A"})
            self.assertIn(("kv.B", "contradicts", "kv.A"), _structure(root)[1])

    def test_a_thread_written_before_escaping_reads_as_before(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root)
            next_action = "  Run C:\\probe\\new.\n\n\\#tag stays\n\\- note: stays\n- evidence: e1\n \nlast"
            sections = f"#### Doing\n\n{next_action}\n\n#### Next Action\n\n{next_action}\n\n"
            (root / THREAD).write_text(_THREAD.replace("### Node B", f"{sections}### Node B"), encoding="utf-8")
            node = _lab_node(root, "kv.A")
            self.assertEqual(
                node["detail"]["next_action"], "Run C:\\probe\\new.\n\\#tag stays\n\\- note: stays\n- evidence: e1\nlast"
            )
            self.assertIn(f"#### Next Action\n\n{next_action}", node["node"]["markdown"])
            self.assertEqual(node["detail"]["doing"], next_action.strip())


if __name__ == "__main__":
    unittest.main()
