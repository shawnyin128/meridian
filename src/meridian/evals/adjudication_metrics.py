from __future__ import annotations

from dataclasses import dataclass, field

from meridian.evals.adjudication_dataset import BUCKETS


@dataclass
class AdjudicationPrediction:
    buckets: dict = field(default_factory=lambda: {b: [] for b in BUCKETS})
    coverage: str = "none"

    def total_hits(self) -> int:
        seen = set()
        for b in BUCKETS:
            seen.update(self.buckets.get(b, []) or [])
        return len(seen)


def bucket_recall(expected: list, predicted: list):
    if not expected:
        return None
    predicted_set = set(predicted or [])
    hit = sum(1 for page_id in expected if page_id in predicted_set)
    return hit / len(expected)


def _mean(values: list):
    present = [v for v in values if v is not None]
    return (sum(present) / len(present)) if present else None


def evaluate(items: list, predictions: dict) -> dict:
    per_item = []
    per_bucket_scores = {b: [] for b in BUCKETS}
    false_comfort_flags = []
    for item in items:
        pred = predictions.get(item.id, AdjudicationPrediction())
        expected = item.normalized_expected()
        row = {"id": item.id, "coverage_truth": item.coverage_truth, "coverage_pred": pred.coverage, "recall": {}}
        for b in BUCKETS:
            score = bucket_recall(expected[b], pred.buckets.get(b, []))
            row["recall"][b] = score
            per_bucket_scores[b].append(score)
        if item.coverage_truth == "none":
            gave_comfort = pred.total_hits() > 0 or pred.coverage == "rich"
            false_comfort_flags.append(1 if gave_comfort else 0)
            row["false_comfort"] = bool(gave_comfort)
        per_item.append(row)
    report = {
        "item_count": len(items),
        "refute_recall": _mean(per_bucket_scores["refuted"]),
        "prior_work_recall": _mean(per_bucket_scores["prior_work"]),
        "corroborating_recall": _mean(per_bucket_scores["corroborating"]),
        "false_comfort_rate": (sum(false_comfort_flags) / len(false_comfort_flags)) if false_comfort_flags else None,
        "per_item": per_item,
    }
    return report
