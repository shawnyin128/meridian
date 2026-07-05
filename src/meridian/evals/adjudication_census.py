from __future__ import annotations

from pathlib import Path

from meridian.wiki.corpus import split_sections, strip_frontmatter

# Sections that are supposed to hold negative / limitation content.
_NEGATIVE_SECTIONS = {
    "Failure Modes",
    "Common Failure Modes",
    "Limitations / Uncertainty",
    "Limitations",
    "Contradictions",
    "Contradicting Evidence",
}

# Kinds scanned: directory -> the section headings that carry negatives there.
_KINDS = {
    "methods": ("Failure Modes", "Common Failure Modes"),
    "papers": ("Limitations / Uncertainty", "Limitations"),
    "topics": ("Contradictions",),
    "concepts": ("Common Failure Modes",),
}

_BOILERPLATE_MARKERS = (
    "not yet synthesized",
    "were not explicit",
    "not explicit in extracted text",
    "no summary",
    "none recorded",
    "not recorded",
    "inspect linked paper limitations",
)

_NEGATIVE_CUES = (
    "fail", "fails", "failed", "does not", "doesn't", "cannot", "can't",
    "no improvement", "worse", "degrade", "degrades", "hurts", "underperform",
    "not robust", "unstable", "breaks down", "ineffective", "insufficient",
    "do not", "no gain", "regress",
)


def is_substantive_negative(text: str) -> bool:
    cleaned = " ".join(text.split()).strip().lower()
    if len(cleaned) < 15:
        return False
    if any(marker in cleaned for marker in _BOILERPLATE_MARKERS):
        return False
    return any(cue in cleaned for cue in _NEGATIVE_CUES)


def corpus_negativity_census(wiki_root: Path) -> dict:
    scanned = 0
    boilerplate = 0
    substantive = 0
    by_kind: dict[str, dict[str, int]] = {}
    for kind, headings in _KINDS.items():
        kind_dir = wiki_root / kind
        k_scanned = k_boiler = k_sub = 0
        if kind_dir.is_dir():
            for page in sorted(kind_dir.glob("*.md")):
                sections = split_sections(strip_frontmatter(page.read_text(encoding="utf-8")))
                for heading in headings:
                    if heading not in sections:
                        continue
                    k_scanned += 1
                    if is_substantive_negative(sections[heading]):
                        k_sub += 1
                    else:
                        k_boiler += 1
        by_kind[kind] = {"scanned": k_scanned, "boilerplate": k_boiler, "substantive_negative": k_sub}
        scanned += k_scanned
        boilerplate += k_boiler
        substantive += k_sub
    ratio = (substantive / scanned) if scanned else 0.0
    return {
        "sections_scanned": scanned,
        "boilerplate": boilerplate,
        "substantive_negative": substantive,
        "substantive_ratio": ratio,
        "by_kind": by_kind,
    }
