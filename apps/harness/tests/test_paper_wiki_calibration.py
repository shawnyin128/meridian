"""Zero-cost quality calibration for fixed Paper Wiki drafts."""

import copy
import json
import unittest
from importlib.resources import files

from meridian_harness.evals.paper_wiki import (
    PaperWikiCalibrationExpectation,
    PaperWikiCalibrationReport,
    evaluate_paper_wiki_draft,
)
from meridian_harness.workflows.paper_wiki import PaperWikiDraft


def _cases() -> list[dict[str, object]]:
    value = json.loads(
        files("fixtures").joinpath("paper_wiki_cases.json").read_text(encoding="utf-8")
    )
    if not isinstance(value, list):
        raise AssertionError("Paper Wiki calibration fixture must be a list")
    return value


def _available(case: dict[str, object]) -> tuple[set[int], set[str]]:
    source = case["source"]
    reading = case["reading"]
    if not isinstance(source, dict) or not isinstance(reading, dict):
        raise AssertionError("Calibration source and reading must be objects")
    pages = source["pages"]
    highlights = reading["highlights"]
    notes = reading["notes"]
    if (
        not isinstance(pages, list)
        or not isinstance(highlights, list)
        or not isinstance(notes, list)
    ):
        raise AssertionError("Calibration source and reading collections must be lists")
    page_ids = {
        int(page["number"])
        for page in pages
        if isinstance(page, dict) and isinstance(page.get("number"), int)
    }
    reading_refs = {
        *(f"highlight:{item['id']}" for item in highlights if isinstance(item, dict)),
        *(f"note:{item['id']}" for item in notes if isinstance(item, dict)),
    }
    if isinstance(reading.get("remark"), str) and reading["remark"].strip():
        reading_refs.add("remark")
    return page_ids, reading_refs


def _report(case: dict[str, object]) -> PaperWikiCalibrationReport:
    pages, reading_refs = _available(case)
    return evaluate_paper_wiki_draft(
        case_id=str(case["id"]),
        draft=PaperWikiDraft.model_validate(case["candidate"]),
        available_pages=pages,
        available_reading_refs=reading_refs,
        expectation=PaperWikiCalibrationExpectation.model_validate(case["expectation"]),
    )


class PaperWikiCalibrationTests(unittest.TestCase):
    def test_all_fixed_cases_pass_every_dimension(self) -> None:
        for case in _cases():
            with self.subTest(case=case["id"]):
                report = _report(case)
                self.assertTrue(report.passed, report.model_dump(mode="json"))
                self.assertTrue(all(dimension.passed for dimension in report.dimensions))
                self.assertEqual(report.findings, [])

    def test_detects_generic_content(self) -> None:
        case = copy.deepcopy(_cases()[0])
        candidate = case["candidate"]
        if not isinstance(candidate, dict):
            raise AssertionError("Calibration candidate must be an object")
        mechanism = candidate["mechanism"]
        evidence = candidate["evidence"]
        if not isinstance(mechanism, list) or not isinstance(evidence, list):
            raise AssertionError("Calibration candidate collections must be lists")
        first_mechanism = mechanism[0]
        first_evidence = evidence[0]
        if not isinstance(first_mechanism, dict) or not isinstance(first_evidence, dict):
            raise AssertionError("Calibration entries must be objects")
        first_mechanism["transformation"] = "Apply the method"
        first_evidence["finding"] = "Reported evidence"

        report = _report(case)
        self.assertFalse(report.passed)
        self.assertEqual(
            {finding.code for finding in report.findings},
            {"generic-contract", "generic-evidence"},
        )

    def test_detects_deictic_queries_and_scope_leaks(self) -> None:
        case = copy.deepcopy(_cases()[1])
        candidate = case["candidate"]
        if not isinstance(candidate, dict):
            raise AssertionError("Calibration candidate must be an object")
        retrieval = candidate["retrieval"]
        observations = candidate["user_observations"]
        evidence = candidate["evidence"]
        if not isinstance(retrieval, dict) or not isinstance(retrieval["fits"], list):
            raise AssertionError("Calibration retrieval must contain fits")
        if not isinstance(observations, list) or not isinstance(evidence, list):
            raise AssertionError("Calibration candidate collections must be lists")
        retrieval["fits"][0]["query"] = "What does this paper prove?"
        observations[0]["reading_refs"] = ["note:unknown"]
        evidence[0]["pages"] = [99]

        report = _report(case)
        self.assertFalse(report.passed)
        self.assertTrue({
            "deictic-query", "unknown-reading-ref", "missing-case-reading-ref", "unknown-page",
        }.issubset({finding.code for finding in report.findings}))


if __name__ == "__main__":
    unittest.main()
