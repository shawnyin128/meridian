from __future__ import annotations

from pathlib import Path

from meridian.evals.adjudication_metrics import AdjudicationPrediction
from meridian.wiki.corpus import retrieve_papers

_REFUTED_SECTIONS = {
    "Contradictions",
    "Contradicting Evidence",
    "Failure Modes",
    "Common Failure Modes",
    "Limitations / Uncertainty",
    "Limitations",
}
_PRIOR_WORK_TYPES = {"paper", "method", "topic"}


def _stance(result: dict) -> str:
    headings = {str(s.get("heading") or "") for s in (result.get("matched_sections") or [])}
    if headings & _REFUTED_SECTIONS:
        return "refuted"
    if str(result.get("type") or result.get("result_type") or "") in _PRIOR_WORK_TYPES:
        return "prior_work"
    return "corroborating"


def baseline_adjudicate(idea: str, wiki_root: Path, top_k: int = 6) -> AdjudicationPrediction:
    outcome = retrieve_papers(query=idea, wiki_root=wiki_root, top_k=top_k * 3, strategy="v1")
    buckets = {"prior_work": [], "refuted": [], "corroborating": []}
    for result in outcome.results:
        bucket = _stance(result)
        if len(buckets[bucket]) < top_k:
            buckets[bucket].append(result["page_id"])
    total = len({pid for v in buckets.values() for pid in v})
    coverage = "rich" if total >= 4 else ("thin" if total >= 1 else "none")
    return AdjudicationPrediction(buckets=buckets, coverage=coverage)
