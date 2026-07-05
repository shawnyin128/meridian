from __future__ import annotations

from pathlib import Path

from meridian.evals.adjudication_census import is_substantive_negative
from meridian.evals.adjudication_dataset import AdjudicationItem
from meridian.wiki.corpus import parse_frontmatter, split_sections, strip_frontmatter

# directory -> negative section headings to mine (same map spirit as the census)
_MINE = {
    "methods": ("Failure Modes", "Common Failure Modes"),
    "papers": ("Limitations / Uncertainty", "Limitations"),
    "topics": ("Contradictions",),
    "concepts": ("Common Failure Modes",),
}


def _affirmative_idea(title: str, kind: str) -> str:
    title = title.strip() or "this approach"
    if kind == "methods":
        return f"I want to use {title} for my setting."
    if kind == "papers":
        return f"I want to build directly on the approach in {title}."
    if kind == "concepts":
        return f"My approach relies on {title}."
    return f"I want to pursue the direction described by {title}."


def mine_bootstrap_items(wiki_root: Path, limit: int | None = None) -> list:
    items: list = []
    index = 0
    for kind, headings in _MINE.items():
        kind_dir = wiki_root / kind
        if not kind_dir.is_dir():
            continue
        for page in sorted(kind_dir.glob("*.md")):
            text = page.read_text(encoding="utf-8")
            sections = split_sections(strip_frontmatter(text))
            if not any(h in sections and is_substantive_negative(sections[h]) for h in headings):
                continue
            frontmatter = parse_frontmatter(text)
            title = str(frontmatter.get("title") or page.stem)
            page_id = f"{kind}/{page.stem}"
            index += 1
            items.append(
                AdjudicationItem(
                    id=f"boot-{index:04d}",
                    idea=_affirmative_idea(title, kind),
                    domain=kind,
                    expected={"prior_work": [], "refuted": [page_id], "corroborating": []},
                    coverage_truth="rich",
                    label_source="bootstrap",
                )
            )
            if limit is not None and len(items) >= limit:
                return items
    return items
