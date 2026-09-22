from __future__ import annotations

import json
import re
import unittest
from collections import Counter
from pathlib import Path


class SkillMcpEvalAssetTests(unittest.TestCase):
    def test_agent_behavior_cases_are_balanced_and_contract_complete(self) -> None:
        path = Path("eval/cases/skill_mcp_agent_behavior_v1.jsonl")
        cases = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

        self.assertGreaterEqual(len(cases), 30)
        self.assertEqual(len(cases), len({case["id"] for case in cases}))
        required = {
            "id",
            "cohort",
            "pilot",
            "fixture",
            "user_request",
            "expected_skill",
            "first_tool_one_of",
            "required_outcomes",
            "mutation",
            "max_tool_calls",
        }
        for case in cases:
            self.assertFalse(required - set(case), case["id"])
            self.assertTrue(case["user_request"].strip(), case["id"])
            self.assertGreaterEqual(case["max_tool_calls"], 1, case["id"])

        cohorts = Counter(case["cohort"] for case in cases)
        for cohort in ("setup", "wiki_use", "wiki_update", "coding", "lab", "recovery"):
            self.assertGreaterEqual(cohorts[cohort], 3, cohort)
        self.assertGreaterEqual(sum(case["pilot"] for case in cases), 12)

        tutorial_cases = [case for case in cases if case.get("tutorial")]
        self.assertEqual(len(tutorial_cases), 20)
        self.assertEqual(Counter(case["locale"] for case in tutorial_cases), {"en": 10, "zh": 10})
        self.assertTrue(all(case["pilot"] for case in tutorial_cases))

        for locale in ("en", "zh"):
            source = Path(f"apps/desktop/src/renderer/messages/{locale}/settings.ts").read_text(
                encoding="utf-8"
            )
            prompt_matches = re.findall(r"\bprompt: '((?:\\.|[^'])*)'", source)
            tutorial_prompts = {
                case["user_request"] for case in tutorial_cases if case["locale"] == locale
            }
            source_prompts = {prompt.replace("\\'", "'") for prompt in prompt_matches}
            self.assertEqual(source_prompts, tutorial_prompts, locale)

        contracts = {
            "initialize-repository": ("meridian", "meridian.workspace_status", set()),
            "search-wiki": (
                "wiki",
                "meridian.context",
                {"meridian.context", "meridian.read", "meridian.trace"},
            ),
            "wiki-copilot": (
                "wiki",
                "meridian.context",
                {"meridian.context", "meridian.read", "meridian.trace"},
            ),
            "update-wiki": ("wiki", "meridian.update", {"meridian.update"}),
            "manage-wiki": (
                "wiki",
                "meridian.audit",
                {"meridian.audit", "meridian.propose"},
            ),
            "inspect-research-graph": (
                "lab",
                "meridian.lab_graph",
                {"meridian.lab_graph", "meridian.lab_node"},
            ),
            "next-research-move": (
                "lab",
                "meridian.lab_graph",
                {"meridian.workspace_plan", "meridian.lab_graph", "meridian.context"},
            ),
            "summarize-experiments": (
                "lab",
                "meridian.lab_graph",
                {"meridian.lab_graph", "meridian.lab_node"},
            ),
            "wiki-guided-coding": (
                "meridian-coding",
                "meridian.workspace_changes",
                {"meridian.workspace_changes", "meridian.workspace_plan", "meridian.context"},
            ),
            "read-app-next-steps": (
                "meridian-coding",
                "meridian.workspace_changes",
                {"meridian.workspace_changes", "meridian.workspace_plan"},
            ),
        }
        by_id = {case["id"]: case for case in tutorial_cases}
        for suffix, (skill, first_tool, required_tools) in contracts.items():
            english = by_id[f"tutorial-en-{suffix}"]
            chinese = by_id[f"tutorial-zh-{suffix}"]
            for case in (english, chinese):
                self.assertEqual(case["expected_skill"], skill, case["id"])
                self.assertIn(first_tool, case["first_tool_one_of"], case["id"])
                self.assertTrue(
                    required_tools <= set(case.get("required_tools", [])), case["id"]
                )
            for field in ("cohort", "fixture", "expected_skill", "mutation", "max_tool_calls"):
                self.assertEqual(english[field], chinese[field], f"{suffix}: {field}")

        text = path.read_text(encoding="utf-8")
        self.assertIn("prompt-injection", text)
        self.assertIn("reset_required", text)
        self.assertIn("idempotency", text)
        self.assertIn("source-fidelity", text)
        self.assertIn("App-created canonical paper", text)

    def test_agent_behavior_rubric_covers_live_model_gate(self) -> None:
        rubric = Path("eval/rubrics/skill_mcp_agent_behavior_v1.md").read_text(encoding="utf-8")

        for expected in (
            "Deterministic dimensions",
            "Semantic dimensions",
            "Hard failures",
            "State/result agreement",
            "fixture_or_eval",
        ):
            self.assertIn(expected, rubric)


if __name__ == "__main__":
    unittest.main()
