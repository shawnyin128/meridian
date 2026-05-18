from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator


REQUIRED_CASE_FIELDS = {
    "id",
    "category",
    "paper_path",
    "problem_description",
    "expected_result",
    "acceptable_paths",
    "must_not_do",
    "evaluation_rubric",
}


def iter_cases(cases_path: Path) -> Iterator[dict[str, object]]:
    if not cases_path.exists():
        raise FileNotFoundError(f"case file does not exist: {cases_path}")

    with cases_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                case = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSONL at line {line_number}: {exc}") from exc

            if not isinstance(case, dict):
                raise ValueError(f"case line {line_number} must be an object")

            missing = sorted(REQUIRED_CASE_FIELDS - set(case))
            if missing:
                raise ValueError(
                    f"case line {line_number} missing required fields: {', '.join(missing)}"
                )

            yield case


def write_eval_manifest(
    cases_path: Path,
    out_dir: Path,
    results: list[dict[str, object]],
    mode: str = "ingest",
    rubric_path: Path | None = None,
    wiki_root: Path | None = None,
) -> Path:
    manifest_path = out_dir / "eval_manifest.json"
    payload = {
        "schema_version": "paper_wiki_eval.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cases_path": str(cases_path),
        "mode": mode,
        "rubric": str(rubric_path) if rubric_path else None,
        "wiki_root": str(wiki_root) if wiki_root else None,
        "judging_policy": "llm-as-judge-with-human-calibration",
        "results": results,
    }
    manifest_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return manifest_path
