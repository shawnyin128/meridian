from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

BUCKETS = ("prior_work", "refuted", "corroborating")
_COVERAGE = ("rich", "thin", "none")


@dataclass
class AdjudicationItem:
    id: str
    idea: str
    domain: str = ""
    expected: dict = field(default_factory=lambda: {b: [] for b in BUCKETS})
    coverage_truth: str = "rich"
    label_source: str = "bootstrap"

    def normalized_expected(self) -> dict:
        return {b: list(self.expected.get(b, []) or []) for b in BUCKETS}


def _item_from_dict(raw: dict) -> AdjudicationItem:
    expected_raw = raw.get("expected") or {}
    expected = {b: list(expected_raw.get(b, []) or []) for b in BUCKETS}
    coverage = raw.get("coverage_truth", "rich")
    if coverage not in _COVERAGE:
        coverage = "rich"
    return AdjudicationItem(
        id=str(raw["id"]),
        idea=str(raw.get("idea", "")),
        domain=str(raw.get("domain", "")),
        expected=expected,
        coverage_truth=coverage,
        label_source=str(raw.get("label_source", "bootstrap")),
    )


def load_dataset(path: Path) -> list:
    if not Path(path).exists():
        return []
    items: list = []
    for lineno, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            items.append(_item_from_dict(json.loads(line)))
        except (json.JSONDecodeError, KeyError) as exc:
            print(f"warning: skipping malformed dataset line {lineno} in {path}: {exc}", file=sys.stderr)
    return items


def dump_dataset(items: list, path: Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for item in items:
        lines.append(
            json.dumps(
                {
                    "id": item.id,
                    "idea": item.idea,
                    "domain": item.domain,
                    "expected": item.normalized_expected(),
                    "coverage_truth": item.coverage_truth,
                    "label_source": item.label_source,
                },
                ensure_ascii=False,
            )
        )
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_gold_template(path: Path) -> None:
    path = Path(path)
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    example = {
        "id": "gold-0001",
        "idea": "Describe YOUR research idea in your own words here.",
        "domain": "optional-tag",
        "expected": {
            "prior_work": ["papers/<page-id-that-already-did-this>"],
            "refuted": ["papers/<page-id-with-evidence-it-fails>"],
            "corroborating": ["claims/<page-id-supporting-your-insight>"],
        },
        "coverage_truth": "rich",
        "label_source": "hand",
    }
    header = (
        "# Gold adjudication ideas — hand-labeled by the researcher.\n"
        "# One JSON object per line (lines starting with # are ignored).\n"
        "# page-ids are wiki paths WITHOUT .md, e.g. papers/quarot, claims/claim-001.\n"
        "# For ideas the corpus should NOT cover, set coverage_truth to \"none\" and leave buckets empty.\n"
    )
    path.write_text(header + json.dumps(example, ensure_ascii=False) + "\n", encoding="utf-8")
