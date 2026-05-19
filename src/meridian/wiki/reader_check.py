from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def build_reader_check_packet(*, run_manifest: Path, out_path: Path) -> Path:
    run = json.loads(run_manifest.read_text(encoding="utf-8"))
    artifacts = dict(run.get("draft_artifacts") or {})
    paper_path = Path(str(artifacts.get("paper_page") or run.get("paper_page") or ""))
    extraction_dir = Path(str(run.get("extraction_dir") or ""))
    pages_path = extraction_dir / "pages.jsonl"

    packet = [
        "# Paper Wiki Reader Check Packet",
        "",
        "This packet is for self-iteration of the ingest mechanism. It is not asking whether the prose sounds nice.",
        "It asks whether `paper.md` can teach the paper to a new researcher, and if not, which generation mechanism failed.",
        "",
        "## Required Procedure",
        "",
        "1. Run Reader A using only the `paper.md` section below. Reader A writes a paper explanation without opening source text.",
        "2. Run Reader B using the source-grounded excerpt section below. Reader B writes a fresh paper explanation from the paper evidence.",
        "3. Compare the two explanations. Any mismatch must be attributed to a generation mechanism bucket, not fixed by hand-editing one sentence.",
        "",
        "## Output JSON Schema",
        "",
        "Return only JSON:",
        "",
        "```json",
        json.dumps(_output_schema(), indent=2),
        "```",
        "",
        "## Mechanism Buckets",
        "",
        "- `paper_page_template`: the page structure hides or misorders important understanding.",
        "- `paper_model_extraction`: method, claim, evidence, limitation, or assumption extraction is too shallow or wrong.",
        "- `source_selection`: the source excerpts or page selection omit the pages needed to understand the paper.",
        "- `evidence_linking`: the page names concepts but does not connect them to figures, tables, equations, or ablations.",
        "- `retrieval_metadata`: frontmatter, tags, aliases, source ids, or method names will retrieve the wrong context later.",
        "- `judge_rubric`: the evaluator would pass shallow output because the rubric does not demand teach-back depth.",
        "",
        "## Reader A Task: paper.md Only",
        "",
        "You are onboarding a new researcher. Read only this generated `paper.md` and explain the paper in 8-12 bullets.",
        "Your explanation must cover: core problem, mechanism, why each component exists, what evidence supports it, what remains uncertain, and what a developer would implement or test first.",
        "If `paper.md` does not let you answer something, write `unknown_from_paper_md` instead of guessing.",
        "",
        f"Path: `{paper_path}`",
        "",
        _fenced("markdown", _read_optional(paper_path)),
        "",
        "## Reader B Task: source-grounded",
        "",
        "Now ignore Reader A and read the source excerpts below. Produce the same kind of explanation, but ground it in page evidence.",
        "Focus on what the generated wiki page should have taught: mechanism, dependencies between components, equations/algorithms/tables that matter, and caveats.",
        "",
        f"Source pages: `{pages_path}`",
        "",
        _fenced("markdown", _source_excerpts(pages_path)),
        "",
        "## Reconciliation Task",
        "",
        "Compare Reader A and Reader B.",
        "For every missing, vague, or misleading point in Reader A, identify the source evidence, the likely generation mechanism failure bucket, and a testable fix.",
        "A good result should tell the developer how to improve the ingest system, not merely rewrite the current paper page.",
    ]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(packet).rstrip() + "\n", encoding="utf-8")
    return out_path


def _output_schema() -> dict[str, Any]:
    return {
        "schema_version": "paper_wiki_reader_check.v0",
        "decision": "pass | needs_refine | fail",
        "case_id": "",
        "paper_md_only_explanation": ["..."],
        "source_grounded_explanation": ["..."],
        "mismatches": [
            {
                "severity": "minor | major | blocking",
                "paper_md_understanding": "",
                "source_grounded_understanding": "",
                "source_evidence": "page / section / table / figure / equation",
                "generation_bucket": "paper_model_extraction",
                "mechanism_failure": "",
                "testable_fix": "",
            }
        ],
        "mechanism_refine_plan": ["..."],
    }


def _source_excerpts(pages_path: Path) -> str:
    if not pages_path.exists():
        return f"[missing source pages: {pages_path}]"

    pages: list[dict[str, Any]] = []
    with pages_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped:
                continue
            payload = json.loads(stripped)
            if isinstance(payload, dict):
                pages.append(payload)

    selected = _select_source_pages(pages)
    chunks = []
    for page in selected:
        page_number = page.get("page_number")
        section = page.get("section_hint") or "unknown section"
        text = " ".join(str(page.get("text") or "").split())
        if len(text) > 2200:
            text = text[:2200].rstrip() + "..."
        chunks.append(f"### p. {page_number} ({section})\n\n{text}")
    return "\n\n".join(chunks) if chunks else "[no source excerpts selected]"


def _select_source_pages(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scored: list[tuple[int, int, dict[str, Any]]] = []
    for index, page in enumerate(pages):
        text = str(page.get("text") or "")
        lowered = text.lower()
        page_number = int(page.get("page_number") or index + 1)
        score = 0
        for term in (
            "methodology",
            "activation-oriented",
            "outlier smoothing",
            "adaptive weight clustering",
            "centroid finetuning",
            "permutation",
            "pog",
            "lut",
            "algorithm",
            "table",
            "ablation",
            "kl divergence",
            "router",
            "speedup",
            "limitation",
        ):
            if term in lowered:
                score += 2
        if page_number <= 2:
            score += 1
        if score > 0:
            scored.append((score, page_number, page))
    selected = [page for _, _, page in sorted(scored, key=lambda item: (-item[0], item[1]))[:10]]
    if selected:
        return sorted(selected, key=lambda page: int(page.get("page_number") or 0))
    return pages[:8]


def _read_optional(path: Path) -> str:
    if not path or not path.exists():
        return f"[missing: {path}]"
    return path.read_text(encoding="utf-8").rstrip()


def _fenced(language: str, content: str) -> str:
    return f"```{language}\n{content}\n```"
