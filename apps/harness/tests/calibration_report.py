"""Print the deterministic Paper Wiki fixture calibration report as JSON."""

import json
from importlib.resources import files

from meridian_harness.evals.paper_wiki import (
    PaperWikiCalibrationExpectation,
    evaluate_paper_wiki_draft,
)
from meridian_harness.workflows.paper_wiki import PaperWikiDraft


def main() -> int:
    """Evaluate committed fixtures without loading or invoking a model."""

    cases = json.loads(
        files("fixtures").joinpath("paper_wiki_cases.json").read_text(encoding="utf-8")
    )
    reports: list[dict[str, object]] = []
    for case in cases:
        pages = {int(item["number"]) for item in case["source"]["pages"]}
        reading_refs = {
            *(f"highlight:{item['id']}" for item in case["reading"]["highlights"]),
            *(f"note:{item['id']}" for item in case["reading"]["notes"]),
        }
        if case["reading"]["remark"].strip():
            reading_refs.add("remark")
        report = evaluate_paper_wiki_draft(
            case_id=case["id"],
            draft=PaperWikiDraft.model_validate(case["candidate"]),
            available_pages=pages,
            available_reading_refs=reading_refs,
            expectation=PaperWikiCalibrationExpectation.model_validate(case["expectation"]),
        )
        reports.append(report.model_dump(mode="json", by_alias=True))
    output = {
        "schemaVersion": "meridian.paper-wiki-calibration-suite.v1",
        "passed": all(report["passed"] for report in reports),
        "cases": reports,
        "modelCalls": 0,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if output["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
