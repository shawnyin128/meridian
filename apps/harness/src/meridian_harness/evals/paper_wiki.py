"""Deterministic calibration checks for structured Paper Wiki drafts."""

from __future__ import annotations

import re
from collections import Counter
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from meridian_harness.workflows.paper_wiki import PaperWikiDraft

PaperWikiCalibrationDimensionId = Literal[
    "grounding",
    "separation",
    "retrieval",
    "mechanism",
    "evidence",
    "implementation",
    "uncertainty",
]


class PaperWikiCalibrationExpectation(BaseModel):
    """Case-specific coverage expected from a fixed calibration fixture."""

    model_config = ConfigDict(extra="forbid")

    required_pages: list[int] = Field(default_factory=list)
    required_reading_refs: list[str] = Field(default_factory=list)
    require_limitations: bool = False


class PaperWikiCalibrationFinding(BaseModel):
    """One actionable deterministic quality failure."""

    model_config = ConfigDict(extra="forbid")

    dimension: PaperWikiCalibrationDimensionId
    code: str
    path: str
    message: str


class PaperWikiCalibrationDimension(BaseModel):
    """Pass/fail summary for one stable rubric dimension."""

    model_config = ConfigDict(extra="forbid")

    id: PaperWikiCalibrationDimensionId
    passed: bool


class PaperWikiCalibrationReport(BaseModel):
    """Portable zero-cost result for one fixed Paper Wiki case."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: str = Field(
        default="meridian.paper-wiki-calibration.v1",
        alias="schemaVersion",
    )
    case_id: str = Field(alias="caseId")
    passed: bool
    dimensions: list[PaperWikiCalibrationDimension]
    findings: list[PaperWikiCalibrationFinding]


_DEICTIC_QUERY = re.compile(
    r"\b(this paper|the paper|this method|the method|this approach|the approach)\b"
    r"|这篇论文|本文|该论文|这个方法|该方法",
    re.IGNORECASE,
)
_GENERIC_VALUES = {
    "apply the method",
    "input",
    "input representation",
    "method",
    "output",
    "output representation",
    "reported claim",
    "reported evidence",
    "reported result",
    "reported setting",
    "result",
}


def _normalized(value: str) -> str:
    return " ".join(value.casefold().split()).strip(" .,:;!?，。；：！？")


def _duplicates(values: list[str]) -> list[str]:
    counts = Counter(_normalized(value) for value in values)
    return sorted(value for value, count in counts.items() if value and count > 1)


def _page_anchored(draft: PaperWikiDraft) -> list[tuple[str, list[int]]]:
    rows: list[tuple[str, list[int]]] = [
        ("problem", draft.problem.pages),
        *((f"what_to_remember[{index}]", item.pages)
          for index, item in enumerate(draft.what_to_remember)),
        *((f"retrieval.fits[{index}]", item.pages)
          for index, item in enumerate(draft.retrieval.fits)),
        *((f"mechanism[{index}]", item.pages)
          for index, item in enumerate(draft.mechanism)),
        *((f"mechanism_details_to_verify[{index}]", item.pages)
          for index, item in enumerate(draft.mechanism_details_to_verify)),
        *((f"evidence[{index}]", item.pages)
          for index, item in enumerate(draft.evidence)),
        *((f"implementation_hooks[{index}]", item.pages)
          for index, item in enumerate(draft.implementation_hooks)),
        *((f"limitations[{index}]", item.pages)
          for index, item in enumerate(draft.limitations)),
    ]
    return rows


def evaluate_paper_wiki_draft(
    *,
    case_id: str,
    draft: PaperWikiDraft,
    available_pages: set[int],
    available_reading_refs: set[str],
    expectation: PaperWikiCalibrationExpectation | None = None,
) -> PaperWikiCalibrationReport:
    """Score one validated draft without a model call or mutable state."""

    expected = expectation or PaperWikiCalibrationExpectation()
    findings: list[PaperWikiCalibrationFinding] = []

    def fail(
        dimension: PaperWikiCalibrationDimensionId,
        code: str,
        path: str,
        message: str,
    ) -> None:
        findings.append(PaperWikiCalibrationFinding(
            dimension=dimension,
            code=code,
            path=path,
            message=message,
        ))

    cited_pages: set[int] = set()
    for path, pages in _page_anchored(draft):
        cited_pages.update(pages)
        unknown = set(pages) - available_pages
        if unknown:
            fail("grounding", "unknown-page", path, f"Unknown source pages: {sorted(unknown)}")
    missing_expected_pages = set(expected.required_pages) - cited_pages
    if missing_expected_pages:
        fail(
            "grounding",
            "missing-case-page",
            "draft",
            f"Required fixture pages were not cited: {sorted(missing_expected_pages)}",
        )

    cited_reading_refs: set[str] = set()
    source_statements = {
        _normalized(draft.problem.text),
        *(_normalized(item.text) for item in draft.what_to_remember),
        *(_normalized(item.text) for item in draft.mechanism_details_to_verify),
        *(_normalized(item.text) for item in draft.limitations),
    }
    for index, observation in enumerate(draft.user_observations):
        cited_reading_refs.update(observation.reading_refs)
        unknown = set(observation.reading_refs) - available_reading_refs
        if unknown:
            fail(
                "separation",
                "unknown-reading-ref",
                f"user_observations[{index}]",
                f"Unknown reading references: {sorted(unknown)}",
            )
        if _normalized(observation.text) in source_statements:
            fail(
                "separation",
                "insight-copies-source",
                f"user_observations[{index}].text",
                "A user insight must not duplicate a source or synthesis statement.",
            )
    missing_reading_refs = set(expected.required_reading_refs) - cited_reading_refs
    if missing_reading_refs:
        fail(
            "separation",
            "missing-case-reading-ref",
            "user_observations",
            "Required fixture reading records were not represented: "
            f"{sorted(missing_reading_refs)}",
        )

    queries = [item.query for item in draft.retrieval.fits]
    duplicate_queries = _duplicates(queries)
    if duplicate_queries:
        fail(
            "retrieval",
            "duplicate-query",
            "retrieval.fits",
            f"Retrieval queries must be distinct: {duplicate_queries}",
        )
    for index, fit in enumerate(draft.retrieval.fits):
        if _DEICTIC_QUERY.search(fit.query):
            fail(
                "retrieval",
                "deictic-query",
                f"retrieval.fits[{index}].query",
                "A retrieval query must make sense before the target paper is in context.",
            )
        if _normalized(fit.query) == _normalized(fit.use_because):
            fail(
                "retrieval",
                "query-rationale-duplicate",
                f"retrieval.fits[{index}]",
                "The routing rationale must explain the fit instead of repeating the query.",
            )
    scope_notes = draft.retrieval.scope_notes
    duplicate_scope_notes = _duplicates([
        scope_notes.primary_fit, scope_notes.adjacent_fit, scope_notes.weak_fit,
    ])
    if duplicate_scope_notes:
        fail(
            "retrieval",
            "duplicate-scope-distance",
            "retrieval.scope_notes",
            "Primary, adjacent, and weak fit must express different retrieval distances.",
        )

    duplicate_mechanisms = _duplicates([item.name for item in draft.mechanism])
    if duplicate_mechanisms:
        fail(
            "mechanism",
            "duplicate-component",
            "mechanism",
            f"Mechanism component names must be distinct: {duplicate_mechanisms}",
        )
    for index, item in enumerate(draft.mechanism):
        fields = [item.input, item.transformation, item.output, item.dependency]
        generic = sorted({_normalized(value) for value in fields} & _GENERIC_VALUES)
        if generic:
            fail(
                "mechanism",
                "generic-contract",
                f"mechanism[{index}]",
                f"Mechanism fields are placeholders rather than a component contract: {generic}",
            )
        if _duplicates(fields):
            fail(
                "mechanism",
                "duplicate-contract-field",
                f"mechanism[{index}]",
                "Input, transformation, output, and dependency must carry distinct information.",
            )

    for index, item in enumerate(draft.evidence):
        fields = [item.claim, item.setting, item.finding]
        generic = sorted({_normalized(value) for value in fields} & _GENERIC_VALUES)
        if generic:
            fail(
                "evidence",
                "generic-evidence",
                f"evidence[{index}]",
                f"Evidence fields are placeholders: {generic}",
            )
        if _duplicates(fields):
            fail(
                "evidence",
                "duplicate-evidence-field",
                f"evidence[{index}]",
                "Claim, setting, and finding must carry distinct information.",
            )

    for index, item in enumerate(draft.implementation_hooks):
        if _normalized(item.task) == _normalized(item.first_check):
            fail(
                "implementation",
                "duplicate-first-check",
                f"implementation_hooks[{index}]",
                "The first check must be a concrete validation step, not a copy of the task.",
            )
    if expected.require_limitations and not draft.limitations:
        fail(
            "uncertainty",
            "missing-case-limitation",
            "limitations",
            "This fixture requires its source-grounded limitation to remain explicit.",
        )

    dimension_ids: list[PaperWikiCalibrationDimensionId] = [
        "grounding", "separation", "retrieval", "mechanism", "evidence",
        "implementation", "uncertainty",
    ]
    failed_dimensions = {finding.dimension for finding in findings}
    dimensions = [
        PaperWikiCalibrationDimension(id=dimension, passed=dimension not in failed_dimensions)
        for dimension in dimension_ids
    ]
    return PaperWikiCalibrationReport(
        case_id=case_id,
        passed=not findings,
        dimensions=dimensions,
        findings=findings,
    )
