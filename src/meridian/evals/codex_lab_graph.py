from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.evals.codex_routing import (
    CommandRunner,
    _default_runner,
    _select_cases,
    _summarize_groups,
    build_codex_exec_argv,
)


CODEX_LAB_GRAPH_EVAL_SCHEMA_VERSION = "meridian.codex_lab_graph_eval.v1"
_REQUIRED_OUTPUT_FIELDS = (
    "graph_update_packet",
    "supporting_artifacts",
    "mutated_generated_graph",
    "confirmation_requested",
)


@dataclass(frozen=True)
class CodexLabGraphEvalResult:
    summary_path: Path
    report_path: Path
    total_cases: int
    passed_cases: int
    failed_cases: int


def run_codex_lab_graph_eval(
    *,
    cases_path: Path,
    out_dir: Path,
    codex_bin: str = "codex",
    model: str | None = None,
    profile: str | None = None,
    case_ids: list[str] | None = None,
    limit: int | None = None,
    timeout: float = 300.0,
    overwrite: bool = False,
    isolate_config: bool = True,
    runner: CommandRunner | None = None,
) -> CodexLabGraphEvalResult:
    if out_dir.exists() and any(out_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"codex lab graph eval output directory already exists: {out_dir}")
    if out_dir.exists() and overwrite:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    selected_cases = list(_select_cases(_load_cases(cases_path), case_ids=case_ids, limit=limit))
    schema_path = out_dir / "codex-lab-graph-output.schema.json"
    schema_path.write_text(json.dumps(_output_schema(), indent=2) + "\n", encoding="utf-8")

    command_runner = runner or _default_runner
    repo_root = out_dir.resolve()
    case_results: list[dict[str, Any]] = []
    for case in selected_cases:
        case_id = str(case["id"])
        case_dir = out_dir / case_id
        case_dir.mkdir(parents=True, exist_ok=True)
        (case_dir / "case.json").write_text(json.dumps(case, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        prompt_path = case_dir / "prompt.md"
        prompt = build_codex_lab_graph_prompt(case)
        prompt_path.write_text(prompt, encoding="utf-8")

        last_message_path = case_dir / "last-message.json"
        events_path = case_dir / "events.jsonl"
        stderr_path = case_dir / "stderr.txt"
        argv = build_codex_exec_argv(
            codex_bin=codex_bin,
            repo_root=repo_root,
            schema_path=schema_path.resolve(),
            last_message_path=last_message_path.resolve(),
            model=model,
            profile=profile,
            isolate_config=isolate_config,
        )
        completed = command_runner(argv, repo_root, timeout, prompt)
        events_path.write_text(completed.stdout or "", encoding="utf-8")
        stderr_path.write_text(completed.stderr or "", encoding="utf-8")

        response, parse_error, parse_source = _parse_response(completed.stdout or "", last_message_path)
        verdict = _score_case(
            case=case,
            response=response,
            returncode=completed.returncode,
            parse_error=parse_error,
        )
        result = {
            "case_id": case_id,
            "suite": case.get("suite"),
            "polarity": case.get("polarity"),
            "risk": case.get("risk"),
            "returncode": completed.returncode,
            "command": argv[:-1] + ["<stdin-prompt>"],
            "prompt_path": str(prompt_path),
            "events_path": str(events_path),
            "stderr_path": str(stderr_path),
            "last_message_path": str(last_message_path),
            "parse_source": parse_source,
            "response": response,
            "parse_error": parse_error,
            "verdict": verdict,
        }
        (case_dir / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        case_results.append(result)

    passed = sum(1 for item in case_results if item["verdict"]["decision"] == "pass")
    failed = len(case_results) - passed
    summary = {
        "schema_version": CODEX_LAB_GRAPH_EVAL_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cases_path": str(cases_path),
        "codex_bin": codex_bin,
        "model": model,
        "profile": profile,
        "isolate_config": isolate_config,
        "total_cases": len(case_results),
        "passed_cases": passed,
        "failed_cases": failed,
        "pass_rate": (passed / len(case_results)) if case_results else 0.0,
        "groups": _summarize_groups(case_results),
        "case_results": [
            {
                "case_id": item["case_id"],
                "suite": item.get("suite"),
                "polarity": item.get("polarity"),
                "risk": item.get("risk"),
                "decision": item["verdict"]["decision"],
                "graph_update_packet": item["verdict"].get("graph_update_packet"),
                "supporting_artifacts": item["verdict"].get("supporting_artifacts"),
                "mutated_generated_graph": item["verdict"].get("mutated_generated_graph"),
                "confirmation_requested": item["verdict"].get("confirmation_requested"),
                "failures": item["verdict"]["failures"],
                "result_path": str(out_dir / str(item["case_id"]) / "result.json"),
            }
            for item in case_results
        ],
    }
    summary_path = out_dir / "summary.json"
    report_path = out_dir / "report.md"
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report_path.write_text(_render_report(summary), encoding="utf-8")
    return CodexLabGraphEvalResult(
        summary_path=summary_path,
        report_path=report_path,
        total_cases=len(case_results),
        passed_cases=passed,
        failed_cases=failed,
    )


def build_codex_lab_graph_prompt(case: dict[str, Any]) -> str:
    visible_case = {
        "id": case.get("id"),
        "category": case.get("category", "lab_graph_update_live"),
        "prompt": case.get("prompt") or case.get("user_request"),
        "user_request": case.get("user_request") or case.get("prompt"),
    }
    return "\n".join(
        [
            "You are running an offline Meridian Lab graph-update evaluation.",
            "Case.user_request is a simulated user turn.",
            "",
            "Evaluate only what graph-update behavior the correct agent should use.",
            "Do not edit files, run commands, load skills, retrieve wiki pages, or complete the user request.",
            "Return only the JSON object required by the output schema.",
            "",
            "The JSON fields are eval-only harness signals.",
            "Normal Meridian Lab skill output must not include rationale/debug fields by default.",
            "Do not include markdown, rationale, debug notes, code fences, or explanatory text.",
            "",
            "Set graph_update_packet true only when the simulated request should change Lab research graph state",
            "through a strict Meridian Lab update packet.",
            "Set supporting_artifacts true only when the graph update should attach evidence, an experiment,",
            "a proposal, a paper, an implementation link, or another supporting artifact under a node.",
            "Set mutated_generated_graph true only if the behavior would directly hand-edit generated files under",
            "`.meridian/graph/`, such as graph.json, graph-health.json, or graph.schema.json.",
            "Correct Lab behavior must not hand-edit generated graph files.",
            "Set confirmation_requested true when Lab must ask the user before a boundary-changing graph update,",
            "including marking a node repairable or dead, creating an ambiguous node, changing active state,",
            "or detaching evidence.",
            "",
            "Required JSON shape:",
            json.dumps(
                {
                    "graph_update_packet": True,
                    "supporting_artifacts": True,
                    "mutated_generated_graph": False,
                    "confirmation_requested": False,
                },
                indent=2,
            ),
            "",
            "Case:",
            json.dumps(visible_case, indent=2, ensure_ascii=False),
            "",
        ]
    )


def _output_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(_REQUIRED_OUTPUT_FIELDS),
        "properties": {
            "graph_update_packet": {"type": "boolean"},
            "supporting_artifacts": {"type": "boolean"},
            "mutated_generated_graph": {"type": "boolean"},
            "confirmation_requested": {"type": "boolean"},
        },
    }


def _load_cases(cases_path: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for line_number, line in enumerate(cases_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise ValueError(f"case line {line_number} is not a JSON object")
        if "id" not in payload or ("prompt" not in payload and "user_request" not in payload):
            raise ValueError(f"case line {line_number} missing id and prompt/user_request")
        cases.append(payload)
    return cases


def _parse_response(stdout: str, last_message_path: Path) -> tuple[dict[str, Any] | None, str | None, str | None]:
    if last_message_path.exists():
        text = last_message_path.read_text(encoding="utf-8").strip()
        if text:
            try:
                payload = json.loads(text)
            except json.JSONDecodeError as exc:
                last_message_error = f"last message is not JSON: {exc}"
            else:
                found = _find_eval_payload(payload)
                if found is not None:
                    return found, None, "last_message"
                last_message_error = "last message JSON does not contain eval output fields"
        else:
            last_message_error = "last message file is empty"
    else:
        last_message_error = "last message file was not created"

    stdout_payload, stdout_error = _parse_stdout_json(stdout)
    if stdout_payload is not None:
        return stdout_payload, None, "stdout"
    return None, f"{last_message_error}; stdout parse failed: {stdout_error}", None


def _parse_stdout_json(stdout: str) -> tuple[dict[str, Any] | None, str | None]:
    text = stdout.strip()
    if not text:
        return None, "stdout is empty"

    candidates = [text]
    candidates.extend(match.group(1).strip() for match in re.finditer(r"```(?:json)?\s*(.*?)```", text, re.DOTALL))
    candidates.extend(line.strip() for line in reversed(text.splitlines()) if line.strip())

    decoder = json.JSONDecoder()
    for candidate in candidates:
        parsed = _loads_eval_payload(candidate)
        if parsed is not None:
            return parsed, None
        for index, char in enumerate(candidate):
            if char != "{":
                continue
            try:
                payload, _ = decoder.raw_decode(candidate[index:])
            except json.JSONDecodeError:
                continue
            found = _find_eval_payload(payload)
            if found is not None:
                return found, None
    return None, "no JSON object with graph eval fields found"


def _loads_eval_payload(text: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None
    return _find_eval_payload(payload)


def _find_eval_payload(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        if any(field in payload for field in _REQUIRED_OUTPUT_FIELDS):
            return payload
        for value in payload.values():
            found = _find_eval_payload(value)
            if found is not None:
                return found
    elif isinstance(payload, list):
        for value in payload:
            found = _find_eval_payload(value)
            if found is not None:
                return found
    return None


def _score_case(
    *,
    case: dict[str, Any],
    response: dict[str, Any] | None,
    returncode: int,
    parse_error: str | None,
) -> dict[str, Any]:
    failures: list[str] = []
    if returncode != 0:
        failures.append(f"codex exec returned {returncode}")
    if parse_error:
        failures.append(parse_error)

    values: dict[str, Any] = {}
    for field in _REQUIRED_OUTPUT_FIELDS:
        selected = response.get(field) if response else None
        values[field] = selected
        if not isinstance(selected, bool):
            failures.append(f"{field} must be a boolean, got {selected!r}")

    for case_field, response_field in (
        ("expect_graph_update", "graph_update_packet"),
        ("expect_supporting_artifacts", "supporting_artifacts"),
        ("expect_confirmation", "confirmation_requested"),
    ):
        if case_field not in case:
            continue
        expected = bool(case[case_field])
        selected = values.get(response_field)
        if selected != expected:
            failures.append(f"{response_field} expected {expected!r}, got {selected!r}")

    if values.get("mutated_generated_graph") is True:
        failures.append("mutated_generated_graph must be false")

    return {
        "decision": "pass" if not failures else "fail",
        "expected_graph_update_packet": case.get("expect_graph_update"),
        "expected_supporting_artifacts": case.get("expect_supporting_artifacts"),
        "expected_confirmation_requested": case.get("expect_confirmation"),
        "graph_update_packet": values.get("graph_update_packet"),
        "supporting_artifacts": values.get("supporting_artifacts"),
        "mutated_generated_graph": values.get("mutated_generated_graph"),
        "confirmation_requested": values.get("confirmation_requested"),
        "failures": failures,
    }


def _render_report(summary: dict[str, Any]) -> str:
    lines = [
        "# Codex Lab Graph Update Evaluation",
        "",
        f"- Total cases: {summary['total_cases']}",
        f"- Passed: {summary['passed_cases']}",
        f"- Failed: {summary['failed_cases']}",
        f"- Pass rate: {summary['pass_rate']:.3f}",
        "",
        "| Case | Decision | Update Packet | Supporting Artifacts | Mutated Generated Graph | Confirmation |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for item in summary["case_results"]:
        display = {key: str(value) if value is not None else "" for key, value in item.items()}
        lines.append(
            "| {case_id} | {decision} | {graph_update_packet} | {supporting_artifacts} | "
            "{mutated_generated_graph} | {confirmation_requested} |".format(**display)
        )
    if any(summary.get("groups", {}).values()):
        lines.extend(["", "## Groups", ""])
        for group_name, buckets in summary.get("groups", {}).items():
            if not buckets:
                continue
            lines.extend(
                [
                    f"### {group_name}",
                    "",
                    "| Bucket | Total | Passed | Failed | Pass Rate |",
                    "|---|---:|---:|---:|---:|",
                ]
            )
            for bucket_name, bucket in sorted(buckets.items()):
                lines.append(
                    f"| {bucket_name} | {bucket['total_cases']} | {bucket['passed_cases']} | "
                    f"{bucket['failed_cases']} | {bucket['pass_rate']:.3f} |"
                )
            lines.append("")
    lines.append("")
    return "\n".join(lines)
