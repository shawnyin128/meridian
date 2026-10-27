from __future__ import annotations

import json
import random
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from meridian.lab import materialize_lab_graph
from meridian.mcp.server import MeridianMCPServer

NOTE_LINES = [
    "加速比在长回答上更稳定，短回答里验证开销占比更高。",
    "作者只在 A100 上测了吞吐，没有报告 H100 的数。",
    "和 [[methods/draft-heads]] 的结论一致：接受率比草稿模型大小更关键。",
    "附录里的消融显示温度 1.0 时收益明显下降。",
    "代码开源，复现脚本需要改两处路径。",
    "K 按通道量化、V 按 token 量化，误差主要来自少数离群通道。",
    "长上下文评测只覆盖了 32K，以上的长度没有数据。",
    "批大小超过 16 之后收益基本消失，需要自己验证。",
]


def write_lab_state(lab: Path, active_nodes: list[str]) -> None:
    for folder in ("threads", "experiments"):
        (lab / folder).mkdir(parents=True, exist_ok=True)
    (lab / "state.md").write_text(
        f"---\ntype: lab-state\nactive_thread: kv-quant\nactive_nodes: [{', '.join(active_nodes)}]\n---\n# State\n",
        encoding="utf-8",
    )


def write_scaled_lab(lab: Path, nodes: int) -> None:
    """Write three threads holding ``nodes`` generated nodes in total, with their experiment records.

    Each node has a mode, a parent, Why, Next Action, tasks, two to seven history lines and, for
    closed nodes, experiment records and a conclusion.
    """

    rng = random.Random(721)
    threads = {"kv-quant": "KV cache 量化", "long-context-eval": "长上下文评测", "spec-decoding-ext": "推测解码扩展"}
    per_thread = nodes // len(threads)
    write_lab_state(lab, ["kv-quant.N01", "long-context-eval.N02"])
    task_count = 0
    exp_count = 0
    for slug, title in threads.items():
        parts = [
            "---", "type: research-thread", f"title: {title}", "status: open", "---", "",
            f"# Research Thread: {title}", "", "## Root Problem", "", rng.choice(NOTE_LINES), "", "## Approach Tree", "",
        ]
        raws = [f"N{i:02d}" for i in range(per_thread)]
        for i, raw in enumerate(raws):
            parent = None if i == 0 else raws[rng.randrange(0, i)]
            mode = rng.choice(["unresolved", "unresolved", "supported", "repairable", "dead"])
            lines = [f"### Node {raw}: {title} 节点 {raw}", ""]
            if mode in {"supported", "dead"}:
                lines.append("- close_count: 1")
            lines.append(f"- mode: `{mode}`")
            if parent:
                lines.append(f"- parent: {parent}")
            lines += ["", "#### Why", "", rng.choice(NOTE_LINES), "", "#### Next Action", "", rng.choice(NOTE_LINES), ""]
            tasks = [f"task-gen-{task_count + k:03d}" for k in range(rng.randint(0, 2))]
            task_count += len(tasks)
            if tasks:
                lines += ["#### Tasks", "", *[f"- `{task}`" for task in tasks], ""]
            experiments = []
            for _ in range(rng.randint(0, 2) if mode != "unresolved" else rng.randint(0, 1)):
                eid = f"exp-gen-{exp_count:03d}"
                exp_count += 1
                experiments.append(eid)
                (lab / "experiments" / f"{eid}.md").write_text(
                    "\n".join([
                        "---", "type: research-experiment", f"id: {eid}", "validity: valid", f"primary_target: {slug}.{raw}",
                        "---", "", f"# Experiment: 生成实验 {eid}", "", "## Question", "", rng.choice(NOTE_LINES), "",
                        "## Command / Config / Output", "", f"python bench.py --exp {eid}", "", "## Result", "",
                        rng.choice(NOTE_LINES), "", "## Validity", "", "`valid`", "", "## Interpretation", "",
                        rng.choice(NOTE_LINES), "",
                    ]),
                    encoding="utf-8",
                )
            if experiments:
                lines += ["#### Supporting Artifacts", "", "| Type | ID | Title | Impact | Path |", "| --- | --- | --- | --- | --- |"]
                lines += [f"| experiment | {eid} | 生成实验 {eid} | supports | .meridian/experiments/{eid}.md |" for eid in experiments]
                lines += ["", "#### Experiments", "", *[f"- `{eid}`" for eid in experiments], ""]
            history = [f"- 2026-10-{rng.randint(1, 26):02d}: {rng.choice(NOTE_LINES)}" for _ in range(rng.randint(2, 7))]
            lines += ["#### History", "", *sorted(history), ""]
            if mode in {"supported", "dead"} and experiments:
                lines += ["#### Conclusion", "", f'- text: "{rng.choice(NOTE_LINES)}"', "- concluded: 2026-10-20",
                          f'- evidence: ["{experiments[0]}"]', ""]
            parts.append("\n".join(lines))
        relations = [
            f"- {raws[rng.randrange(per_thread)]} supports_direction {raws[rng.randrange(per_thread)]}"
            for _ in range(per_thread // 5)
        ]
        parts += ["## Graph Relations", "", *relations, ""]
        (lab / "threads" / f"{slug}.md").write_text("\n".join(parts), encoding="utf-8")


class LabGraphToolTests(unittest.TestCase):
    def _call(self, root: Path, arguments: dict[str, object]) -> tuple[dict, str]:
        server = MeridianMCPServer(default_workspace_root=root)
        response = server.handle_message(
            {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "meridian.lab_graph", "arguments": arguments}}
        )
        result = response["result"]
        return result, result["content"][0]["text"]

    def _two_node_lab(self, root: Path) -> None:
        lab = root / ".meridian"
        write_lab_state(lab, ["kv-quant.B"])
        (lab / "threads/kv-quant.md").write_text(
            "---\ntype: research-thread\ntitle: KV\n---\n# Research Thread: KV\n\n## Approach Tree\n\n"
            "### Node A: Baseline\n\n- mode: `supported`\n\n#### Next Action\n\nKeep as control.\n\n"
            "#### History\n\n- 2026-10-01: Baseline measured at 1.9x.\n\n"
            "### Node B: Per-channel keys\n\n- mode: `unresolved`\n- parent: A\n\n#### Why\n\nOutlier channels.\n\n"
            "## Graph Relations\n\n- B contradicts A\n",
            encoding="utf-8",
        )

    def test_lab_graph_lists_each_node_and_edge_without_its_content_by_default(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._two_node_lab(root)

            result, text = self._call(root, {})
            payload = json.loads(text)

            self.assertFalse(result.get("isError"))
            self.assertEqual(payload["schema_version"], "meridian.mcp_lab_graph_compact.v1")
            self.assertEqual(
                payload["graph"],
                {
                    "active_thread": "kv-quant",
                    "active_nodes": ["kv-quant.B"],
                    "nodes": [
                        {"id": "kv-quant.A", "title": "Baseline", "state": "supported", "parent": None, "active": False},
                        {"id": "kv-quant.B", "title": "Per-channel keys", "state": "unresolved", "parent": "kv-quant.A", "active": True},
                    ],
                    "edges": [
                        {"source": "kv-quant.A", "target": "kv-quant.B", "kind": "continues"},
                        {"source": "kv-quant.B", "target": "kv-quant.A", "kind": "contradicts"},
                    ],
                },
            )
            self.assertEqual(payload["health"]["status"], "pass")
            self.assertNotIn("Baseline measured", text)
            self.assertNotIn("Outlier channels", text)

    def test_lab_graph_with_full_detail_returns_every_node_s_content(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._two_node_lab(root)

            _, text = self._call(root, {"detail": "full"})
            payload = json.loads(text)
            expected = materialize_lab_graph(root)

            self.assertEqual(payload["schema_version"], "meridian.mcp_lab_graph.v1")
            payload["graph"].pop("generated_at")
            expected.graph.pop("generated_at")
            self.assertEqual(payload["graph"], expected.graph)
            self.assertEqual(payload["health"], expected.health)
            self.assertIn("Baseline measured", payload["graph"]["node_details"]["kv-quant.A"]["history"])

    def test_lab_graph_rejects_an_unknown_detail(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._two_node_lab(root)

            result, text = self._call(root, {"detail": "everything"})

            self.assertTrue(result.get("isError"))
            self.assertIn("detail", text)

    def test_default_lab_graph_stays_a_small_fraction_of_the_full_graph_on_a_real_sized_lab(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_scaled_lab(root / ".meridian", 60)

            _, compact = self._call(root, {})
            _, full = self._call(root, {"detail": "full"})
            compact_bytes = len(compact.encode("utf-8"))
            full_bytes = len(full.encode("utf-8"))
            node_count = len(json.loads(compact)["graph"]["nodes"])

            self.assertEqual(node_count, 60)
            self.assertEqual(json.loads(full)["health"]["status"], "pass")
            self.assertGreater(full_bytes, 100_000)
            self.assertLessEqual(compact_bytes, full_bytes * 0.15)
            self.assertLessEqual(compact_bytes / node_count, 400)


if __name__ == "__main__":
    unittest.main()
