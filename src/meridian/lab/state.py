from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from meridian.lab.research_agent_contract import inject_meridian_agents_contract
from meridian.wiki.corpus import parse_frontmatter, strip_frontmatter


ALLOWED_NODE_MODES = {"unresolved", "repairable", "supported", "dead"}
ALLOWED_PROPOSAL_STATES = {"draft", "strengthening", "ready", "published", "rejected", "archived"}
ALLOWED_EXPERIMENT_VALIDITY = {"valid", "invalid", "uncertain"}

LAB_INIT_TEMPLATE_MAP = {
    "state.md": "state.md",
    "threads/index.md": "threads-index.md",
    "experiments/index.md": "experiments-index.md",
    "proposals/index.md": "proposals-index.md",
}


@dataclass(frozen=True)
class LabValidationFinding:
    severity: str
    code: str
    path: str
    message: str


@dataclass(frozen=True)
class LabValidationReport:
    status: str
    root: str
    findings: list[LabValidationFinding]

    @property
    def errors(self) -> list[LabValidationFinding]:
        return [finding for finding in self.findings if finding.severity == "error"]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "root": self.root,
            "findings": [
                {
                    "severity": finding.severity,
                    "code": finding.code,
                    "path": finding.path,
                    "message": finding.message,
                }
                for finding in self.findings
            ],
        }


def validate_lab_space(root: Path) -> LabValidationReport:
    """Validate a lightweight `.meridian/` research space.

    This is an internal release/debug helper for tests and future tooling. It is
    intentionally not a product CLI, MCP server, or workflow engine.
    """

    lab_root = root if root.name == ".meridian" else root / ".meridian"
    findings: list[LabValidationFinding] = []

    def add(severity: str, code: str, path: Path | str, message: str) -> None:
        findings.append(
            LabValidationFinding(
                severity=severity,
                code=code,
                path=_display_path(path, lab_root=lab_root),
                message=message,
            )
        )

    if not lab_root.exists():
        add("error", "missing_lab_root", lab_root, "Missing `.meridian/` research space.")
        return LabValidationReport(status="fail", root=str(lab_root), findings=findings)

    required_files = [
        lab_root / "state.md",
        lab_root / "threads/index.md",
        lab_root / "experiments/index.md",
        lab_root / "proposals/index.md",
    ]
    for path in required_files:
        if not path.exists():
            add("error", "missing_required_file", path, "Required Lab navigation/state file is missing.")

    for directory in [lab_root / "threads", lab_root / "experiments", lab_root / "proposals"]:
        if not directory.exists():
            add("error", "missing_required_directory", directory, "Required Lab directory is missing.")

    state_frontmatter = _frontmatter(lab_root / "state.md")
    active_thread = str(state_frontmatter.get("active_thread") or "").strip()

    threads = _markdown_records(lab_root / "threads")
    experiments = _markdown_records(lab_root / "experiments")
    proposals = _markdown_records(lab_root / "proposals")

    thread_ids = {path.stem for path in threads}
    experiment_ids = _experiment_ids(experiments)

    if active_thread and active_thread not in thread_ids:
        add(
            "error",
            "active_thread_missing",
            lab_root / "state.md",
            f"active_thread `{active_thread}` does not match a thread file.",
        )

    for path in threads:
        text = path.read_text(encoding="utf-8")
        frontmatter = parse_frontmatter(text)
        if frontmatter.get("type") != "research-thread":
            add("error", "invalid_thread_type", path, "Thread frontmatter must use `type: research-thread`.")
        active_node = str(frontmatter.get("active_node") or "").strip()
        nodes = _extract_nodes(strip_frontmatter(text))
        if not nodes:
            add("error", "thread_without_nodes", path, "Thread must contain at least one approach node.")
        if active_node and active_node not in nodes:
            add("error", "active_node_missing", path, f"active_node `{active_node}` is not present in the approach tree.")
        for node_id, mode in nodes.items():
            if mode not in ALLOWED_NODE_MODES:
                add(
                    "error",
                    "invalid_node_mode",
                    path,
                    f"Node `{node_id}` uses mode `{mode}`; allowed modes are {sorted(ALLOWED_NODE_MODES)}.",
                )

    for path in experiments:
        frontmatter = _frontmatter(path)
        if frontmatter.get("type") != "research-experiment":
            add("error", "invalid_experiment_type", path, "Experiment frontmatter must use `type: research-experiment`.")
        validity = str(frontmatter.get("validity") or "uncertain").strip()
        if validity not in ALLOWED_EXPERIMENT_VALIDITY:
            add(
                "error",
                "invalid_experiment_validity",
                path,
                f"Experiment validity `{validity}` is not one of {sorted(ALLOWED_EXPERIMENT_VALIDITY)}.",
            )

    for path in proposals:
        text = path.read_text(encoding="utf-8")
        frontmatter = parse_frontmatter(text)
        if frontmatter.get("type") != "research-finding-proposal":
            add("error", "invalid_proposal_type", path, "Proposal frontmatter must use `type: research-finding-proposal`.")
        state = str(frontmatter.get("state") or "draft").strip()
        if state not in ALLOWED_PROPOSAL_STATES:
            add(
                "error",
                "invalid_proposal_state",
                path,
                f"Proposal state `{state}` is not one of {sorted(ALLOWED_PROPOSAL_STATES)}.",
            )
        source_experiments = _as_list(frontmatter.get("source_experiments"))
        target_wiki_pages = _as_list(frontmatter.get("target_wiki_pages"))
        if state in {"ready", "published"}:
            if not source_experiments:
                add("error", "ready_proposal_without_experiments", path, "Ready/published proposals need source experiments.")
            if not target_wiki_pages:
                add("error", "ready_proposal_without_wiki_target", path, "Ready/published proposals need target wiki pages.")
            if "## Wiki Transfer Gate" not in text:
                add("error", "ready_proposal_without_transfer_gate", path, "Ready/published proposals need a Wiki Transfer Gate section.")
        for experiment_id in source_experiments:
            if experiment_id and experiment_id not in experiment_ids:
                add(
                    "error",
                    "proposal_experiment_missing",
                    path,
                    f"Source experiment `{experiment_id}` is not present under experiments/.",
                )

    status = "fail" if any(finding.severity == "error" for finding in findings) else "pass"
    return LabValidationReport(status=status, root=str(lab_root), findings=findings)


def initialize_lab_space(root: Path, *, overwrite: bool = False, inject_agents_contract: bool = True) -> list[Path]:
    """Create the minimal `.meridian/` skeleton used by Lab lazy init.

    This is an internal helper for release/debug checks and agent workflows. It
    does not add a product CLI, MCP surface, database, daemon, or router.
    """

    lab_root = root if root.name == ".meridian" else root / ".meridian"
    template_root = Path(__file__).resolve().parents[1] / "templates" / "research-dev"
    today = date.today().isoformat()
    written: list[Path] = []

    for directory in [lab_root, lab_root / "threads", lab_root / "experiments", lab_root / "proposals"]:
        directory.mkdir(parents=True, exist_ok=True)

    for relative_path, template_name in LAB_INIT_TEMPLATE_MAP.items():
        target = lab_root / relative_path
        if target.exists() and not overwrite:
            continue
        template = (template_root / template_name).read_text(encoding="utf-8")
        content = template.replace("YYYY-MM-DD", today)
        target.write_text(content, encoding="utf-8")
        written.append(target)

    if inject_agents_contract:
        target = lab_root.parent / "AGENTS.md"
        before = target.read_text(encoding="utf-8") if target.exists() else None
        agents_path = inject_meridian_agents_contract(lab_root.parent)
        after = agents_path.read_text(encoding="utf-8")
        if before != after and agents_path not in written:
            written.append(agents_path)

    return written


def _markdown_records(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(path for path in directory.glob("*.md") if path.name != "index.md")


def _frontmatter(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return parse_frontmatter(path.read_text(encoding="utf-8"))


def _extract_nodes(markdown: str) -> dict[str, str]:
    matches = list(re.finditer(r"^### Node\s+([^:\n]+).*?$", markdown, flags=re.MULTILINE))
    nodes: dict[str, str] = {}
    for index, match in enumerate(matches):
        node_id = match.group(1).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        body = markdown[start:end]
        mode_match = re.search(r"^\s*-\s*mode:\s*`?([a-z_]+)`?", body, flags=re.MULTILINE)
        nodes[node_id] = mode_match.group(1).strip() if mode_match else ""
    return nodes


def _experiment_ids(paths: list[Path]) -> set[str]:
    result: set[str] = set()
    for path in paths:
        frontmatter = _frontmatter(path)
        experiment_id = str(frontmatter.get("id") or "").strip()
        result.add(experiment_id or path.stem)
        result.add(path.stem)
    return result


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    raw = str(value).strip()
    if not raw or raw == "[]":
        return []
    if raw.startswith("[") and raw.endswith("]"):
        return [item.strip().strip('"').strip("'") for item in raw[1:-1].split(",") if item.strip()]
    return [raw]


def _display_path(path: Path | str, *, lab_root: Path) -> str:
    path = Path(path)
    try:
        return str(path.relative_to(lab_root))
    except ValueError:
        return str(path)
