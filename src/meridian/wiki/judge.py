from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def build_judge_packet(
    *,
    run_manifest: Path,
    rubric_path: Path,
    out_path: Path,
    case_path: Path | None = None,
) -> Path:
    run = json.loads(run_manifest.read_text(encoding="utf-8"))
    packet_parts = [
        "# Paper Wiki Judge Packet",
        "",
        "## Rubric",
        "",
        _read_optional(rubric_path),
        "",
        "## Run Manifest",
        "",
        "```json",
        json.dumps(run, indent=2),
        "```",
    ]

    if case_path is not None:
        packet_parts.extend(["", "## Evaluation Case", "", _read_optional(case_path)])

    for label, path in _artifact_paths(run).items():
        packet_parts.extend(
            [
                "",
                f"## Artifact: {label}",
                "",
                f"Path: `{path}`",
                "",
                _fenced_artifact(Path(path)),
            ]
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(packet_parts).rstrip() + "\n", encoding="utf-8")
    return out_path


def _artifact_paths(run: dict[str, Any]) -> dict[str, str]:
    paths: dict[str, str] = {}
    for label, path in dict(run.get("draft_artifacts") or {}).items():
        paths[f"draft.{label}"] = str(path)
    for label, path in dict(run.get("canonical_artifacts") or {}).items():
        paths[f"canonical.{label}"] = str(path)
    return paths


def _read_optional(path: Path) -> str:
    if not path.exists():
        return f"[missing: {path}]"
    return path.read_text(encoding="utf-8").rstrip()


def _fenced_artifact(path: Path) -> str:
    suffix = path.suffix.lower()
    fence = "json" if suffix in {".json", ".jsonl"} else "markdown"
    return f"```{fence}\n{_read_optional(path)}\n```"
