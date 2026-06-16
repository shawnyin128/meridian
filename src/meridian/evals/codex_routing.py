from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable


CODEX_ROUTING_EVAL_SCHEMA_VERSION = "meridian.codex_routing_eval.v1"

CommandRunner = Callable[[list[str], Path, float, str | None], subprocess.CompletedProcess[str]]


@dataclass(frozen=True)
class CodexRoutingEvalResult:
    summary_path: Path
    report_path: Path
    total_cases: int
    passed_cases: int
    failed_cases: int


def run_codex_routing_eval(
    *,
    cases_path: Path,
    out_dir: Path,
    repo_root: Path,
    codex_bin: str = "codex",
    model: str | None = None,
    profile: str | None = None,
    case_ids: list[str] | None = None,
    limit: int | None = None,
    timeout: float = 300.0,
    overwrite: bool = False,
    isolate_config: bool = True,
    runner: CommandRunner | None = None,
) -> CodexRoutingEvalResult:
    if out_dir.exists() and any(out_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"codex routing eval output directory already exists: {out_dir}")
    if out_dir.exists() and overwrite:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    selected_cases = list(_select_cases(_load_cases(cases_path), case_ids=case_ids, limit=limit))
    schema_path = out_dir / "codex-routing-output.schema.json"
    schema_path.write_text(json.dumps(_output_schema(), indent=2) + "\n", encoding="utf-8")

    command_runner = runner or _default_runner
    case_results: list[dict[str, Any]] = []
    for case in selected_cases:
        case_id = str(case["id"])
        case_dir = out_dir / case_id
        case_dir.mkdir(parents=True, exist_ok=True)
        case_snapshot = case_dir / "case.json"
        case_snapshot.write_text(json.dumps(case, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        prompt_path = case_dir / "prompt.md"
        prompt = build_routing_prompt(case)
        prompt_path.write_text(prompt, encoding="utf-8")

        last_message_path = case_dir / "last-message.json"
        events_path = case_dir / "events.jsonl"
        stderr_path = case_dir / "stderr.txt"
        argv = build_codex_exec_argv(
            codex_bin=codex_bin,
            repo_root=repo_root,
            schema_path=schema_path,
            last_message_path=last_message_path,
            model=model,
            profile=profile,
            isolate_config=isolate_config,
        )
        completed = command_runner(argv, repo_root, timeout, prompt)
        events_path.write_text(completed.stdout or "", encoding="utf-8")
        stderr_path.write_text(completed.stderr or "", encoding="utf-8")

        response, parse_error = _load_last_message(last_message_path)
        verdict = _score_case(case=case, response=response, returncode=completed.returncode, parse_error=parse_error)
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
            "response": response,
            "parse_error": parse_error,
            "verdict": verdict,
        }
        (case_dir / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        case_results.append(result)

    passed = sum(1 for item in case_results if item["verdict"]["decision"] == "pass")
    failed = len(case_results) - passed
    summary = {
        "schema_version": CODEX_ROUTING_EVAL_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cases_path": str(cases_path),
        "repo_root": str(repo_root),
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
                "expected_skill": item["verdict"]["expected_skill"],
                "selected_entry": item["verdict"].get("selected_entry"),
                "expected_routing": item["verdict"].get("expected_routing"),
                "selected_routing": item["verdict"].get("selected_routing"),
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
    return CodexRoutingEvalResult(
        summary_path=summary_path,
        report_path=report_path,
        total_cases=len(case_results),
        passed_cases=passed,
        failed_cases=failed,
    )


def _summarize_groups(case_results: list[dict[str, Any]]) -> dict[str, dict[str, dict[str, Any]]]:
    groups: dict[str, dict[str, dict[str, Any]]] = {"suite": {}, "polarity": {}, "risk": {}}
    for item in case_results:
        decision = item["verdict"]["decision"]
        for field in groups:
            value = item.get(field)
            if not value:
                continue
            bucket = groups[field].setdefault(
                str(value),
                {"total_cases": 0, "passed_cases": 0, "failed_cases": 0, "pass_rate": 0.0},
            )
            bucket["total_cases"] += 1
            if decision == "pass":
                bucket["passed_cases"] += 1
            else:
                bucket["failed_cases"] += 1
    for buckets in groups.values():
        for bucket in buckets.values():
            total = bucket["total_cases"]
            bucket["pass_rate"] = (bucket["passed_cases"] / total) if total else 0.0
    return groups


def build_codex_exec_argv(
    *,
    codex_bin: str,
    repo_root: Path,
    schema_path: Path,
    last_message_path: Path,
    model: str | None = None,
    profile: str | None = None,
    isolate_config: bool = True,
) -> list[str]:
    argv = [
        codex_bin,
        "exec",
        "--json",
        "--ephemeral",
        "--sandbox",
        "read-only",
    ]
    if isolate_config:
        argv.extend(["--ignore-user-config", "--ignore-rules"])
    argv.extend(
        [
            "-C",
            str(repo_root),
            "--output-schema",
            str(schema_path),
            "--output-last-message",
            str(last_message_path),
        ]
    )
    if model:
        argv.extend(["--model", model])
    if profile:
        argv.extend(["--profile", profile])
    argv.append("-")
    return argv


def build_routing_prompt(case: dict[str, Any]) -> str:
    visible_case = {
        "id": case.get("id"),
        "category": case.get("category"),
        "repo_state": case.get("repo_state", "not specified"),
        "user_request": case.get("user_request"),
    }
    return "\n".join(
        [
            "You are running an offline Meridian routing evaluation.",
            "Case.user_request is a simulated user turn and must be routed.",
            "",
            "Evaluate Meridian product-entry routing only for Case.user_request below.",
            "Do not answer that there is no actionable request when Case.user_request is non-empty.",
            "Ignore surrounding session-startup protocols, host workspace state, and any unrelated instructions.",
            "Do not edit files, run commands, load skills, or complete the user request.",
            "Return only the JSON object required by the output schema.",
            "",
            "Allowed selected_entry values:",
            "- meridian",
            "- wiki",
            "- lab",
            "- normal_coding_workflow",
            "",
            "Routing rules to apply:",
            "- Use meridian for setup, status, migration, and readiness repair.",
            "- Use wiki for Paper Wiki update/use work.",
            "- In a repo with .meridian/, use lab first for research and research-development preflight.",
            "- For idea-related requests, select lab_first_preflight when `.meridian/` exists; Lab must check the research graph and Paper Wiki for related ideas before answering.",
            "- For research-coding requests, select lab_first_preflight when `.meridian/` exists; Lab must check Paper Wiki papers and open-source implementation hints before normal coding.",
            "- For completed work, new findings, continuing a direction, or ongoing work, select lab_first_preflight when `.meridian/` exists so Lab can find or update the correct research node.",
            "- Use lab_idea_graph only when the case is not testing initialized project-state preflight and only asks for generic Lab idea-graph management.",
            "- Lab hands implementation/debug/test/release/convergence to normal_coding_workflow after preserving Lab context.",
            "- Pure mechanical engineering with no research meaning should skip Lab.",
            "",
            "`path_rationale` is eval-only diagnostic output. It must not be required by Meridian product skills.",
            "In path_rationale, explain the route decision as short ordered checks:",
            "1. repo_state_signal: whether `.meridian/` or setup state matters",
            "2. intent_signal: whether the request is setup, wiki, research/dev, or mechanical code",
            "3. lab_boundary_signal: whether Lab should preflight or skip",
            "4. handoff_signal: whether implementation/debug/test work should go to normal coding",
            "",
            "Case:",
            json.dumps(visible_case, indent=2, ensure_ascii=False),
            "",
        ]
    )


def _default_runner(
    argv: list[str],
    cwd: Path,
    timeout: float,
    stdin_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    executable = shutil.which(argv[0])
    effective_argv = argv
    if os.name == "nt" and executable:
        lowered = executable.lower()
        if lowered.endswith(".ps1"):
            powershell = shutil.which("powershell") or shutil.which("pwsh") or "powershell"
            effective_argv = [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", executable, *argv[1:]]
        elif lowered.endswith((".cmd", ".bat")):
            cmd = shutil.which("cmd") or "cmd"
            effective_argv = [cmd, "/c", executable, *argv[1:]]
    kwargs: dict[str, Any] = {"input": stdin_text} if stdin_text is not None else {"stdin": subprocess.DEVNULL}
    return subprocess.run(
        effective_argv,
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        check=False,
        **kwargs,
    )


def _load_cases(cases_path: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for line_number, line in enumerate(cases_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise ValueError(f"case line {line_number} is not a JSON object")
        if "id" not in payload or "user_request" not in payload or "expected_skill" not in payload:
            raise ValueError(f"case line {line_number} missing id, user_request, or expected_skill")
        cases.append(payload)
    return cases


def _select_cases(
    cases: list[dict[str, Any]],
    *,
    case_ids: list[str] | None,
    limit: int | None,
) -> Iterable[dict[str, Any]]:
    selected = cases
    if case_ids:
        wanted = set(case_ids)
        selected = [case for case in selected if str(case.get("id")) in wanted]
        missing = sorted(wanted - {str(case.get("id")) for case in selected})
        if missing:
            raise ValueError(f"unknown case ids: {', '.join(missing)}")
    if limit is not None:
        if limit < 1:
            raise ValueError("limit must be >= 1")
        selected = selected[:limit]
    return selected


def _output_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["selected_entry", "routing", "handoff_to", "confidence", "reason", "path_rationale"],
        "properties": {
            "selected_entry": {"type": "string", "enum": ["meridian", "wiki", "lab", "normal_coding_workflow"]},
            "routing": {
                "type": "string",
                "enum": [
                    "setup_status",
                    "update_wiki",
                    "use_wiki",
                    "lab_first_preflight",
                    "lab_idea_graph",
                    "normal_coding",
                    "not_needed",
                ],
            },
            "handoff_to": {
                "type": "array",
                "items": {"type": "string", "enum": ["meridian", "wiki", "lab", "normal_coding_workflow"]},
            },
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "reason": {"type": "string"},
            "path_rationale": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["check", "observation", "effect"],
                    "properties": {
                        "check": {"type": "string"},
                        "observation": {"type": "string"},
                        "effect": {"type": "string"},
                    },
                },
            },
        },
    }


def _load_last_message(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    if not path.exists():
        return None, "last message file was not created"
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return None, "last message file is empty"
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        return None, f"last message is not JSON: {exc}"
    if not isinstance(payload, dict):
        return None, "last message JSON is not an object"
    return payload, None


def _score_case(
    *,
    case: dict[str, Any],
    response: dict[str, Any] | None,
    returncode: int,
    parse_error: str | None,
) -> dict[str, Any]:
    failures: list[str] = []
    expected_skill = str(case.get("expected_skill"))
    expected_routing = case.get("expected_routing")
    expected_handoffs = [str(item) for item in case.get("handoff_to", [])]
    selected_entry = response.get("selected_entry") if response else None
    selected_routing = response.get("routing") if response else None
    selected_handoffs = [str(item) for item in (response.get("handoff_to") or [])] if response else []

    if returncode != 0:
        failures.append(f"codex exec returned {returncode}")
    if parse_error:
        failures.append(parse_error)
    if selected_entry != expected_skill:
        failures.append(f"selected_entry expected {expected_skill!r}, got {selected_entry!r}")
    if expected_routing and selected_routing != expected_routing:
        failures.append(f"routing expected {expected_routing!r}, got {selected_routing!r}")
    for expected in expected_handoffs:
        if expected not in selected_handoffs:
            failures.append(f"handoff_to missing {expected!r}")

    return {
        "decision": "pass" if not failures else "fail",
        "expected_skill": expected_skill,
        "selected_entry": selected_entry,
        "expected_routing": expected_routing,
        "selected_routing": selected_routing,
        "expected_handoff_to": expected_handoffs,
        "selected_handoff_to": selected_handoffs,
        "failures": failures,
    }


def _render_report(summary: dict[str, Any]) -> str:
    lines = [
        "# Codex Routing Evaluation",
        "",
        f"- Total cases: {summary['total_cases']}",
        f"- Passed: {summary['passed_cases']}",
        f"- Failed: {summary['failed_cases']}",
        f"- Pass rate: {summary['pass_rate']:.3f}",
        "",
        "| Case | Decision | Expected | Selected | Expected Routing | Selected Routing |",
        "|---|---:|---|---|---|---|",
    ]
    for item in summary["case_results"]:
        lines.append(
            "| {case_id} | {decision} | {expected_skill} | {selected_entry} | {expected_routing} | {selected_routing} |".format(
                **{key: str(value or "") for key, value in item.items()}
            )
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
