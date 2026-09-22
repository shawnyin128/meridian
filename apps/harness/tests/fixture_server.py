"""Zero-cost stdio fixture used by the Electron-to-Harness end-to-end test."""

from __future__ import annotations

import sys

from meridian_harness.evals.paper_wiki import evaluate_paper_wiki_draft
from meridian_harness.protocol import ProtocolViolation, require_object
from meridian_harness.server import JsonLineServer, RequestContext
from meridian_harness.workflows.paper_wiki import PaperWikiDraft


def _text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ProtocolViolation(f"{label} must be a non-empty string")
    return value


def _propose(context: RequestContext, value: object) -> object:
    params = require_object(value, "paper-wiki fixture params")
    target_id = _text(params.get("targetId"), "targetId")
    scope_digest = _text(params.get("scopeDigest"), "scopeDigest")
    action = params.get("action")
    if action not in {"create", "update"}:
        raise ProtocolViolation("action must be create or update")

    paper = require_object(context.read("papers.get", {"id": target_id}), "paper")
    source = require_object(context.read("papers.source", {"id": target_id}), "source")
    require_object(context.read("papers.reading", {"id": target_id}), "reading")
    require_object(context.read("wiki.page", {"id": f"papers/{target_id}"}), "wiki")
    title = _text(paper.get("title"), "paper title")
    pages = source.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ProtocolViolation("source pages must be a non-empty list")

    draft = PaperWikiDraft(
        problem={
            "text": "A review proposal must cross the real desktop and Harness boundary safely.",
            "pages": [1],
        },
        what_to_remember=[{
            "text": (
                f"The zero-cost fixture crossed the Electron, Core, and Python "
                f"Harness boundary for {title}."
            ),
            "pages": [1],
        }],
        retrieval={
            "fits": [
                {
                    "query": "How does Meridian isolate model orchestration from vault writes?",
                    "use_because": "The fixture exercises the Core callback boundary.",
                    "pages": [1],
                },
                {
                    "query": "What should be tested before applying a generated Wiki proposal?",
                    "use_because": "The fixture returns an unapplied review proposal.",
                    "pages": [1],
                },
                {
                    "query": (
                        "How can an Electron-to-Python Harness path be verified "
                        "without model cost?"
                    ),
                    "use_because": "The fixture uses a zero-cost structured result.",
                    "pages": [1],
                },
            ],
            "scope_notes": {
                "primary_fit": "Desktop-to-Harness proposal-boundary verification.",
                "adjacent_fit": "Structured-output and callback integration tests.",
                "weak_fit": "Scientific conclusions about a research method.",
            },
        },
        mechanism=[{
            "name": "Authorized Core callback",
            "input": "A paper identifier from the confirmed plan.",
            "transformation": "Core returns only the source data authorized for the run.",
            "output": "A bounded source packet for proposal generation.",
            "dependency": "The scope digest and target must match the confirmed plan.",
            "pages": [1],
        }],
        mechanism_details_to_verify=[{
            "text": "The callback path returns at least one numbered source page.",
            "pages": [1],
        }],
        evidence=[{
            "claim": "The proposal path crosses Electron, Core, and Python.",
            "setting": "The zero-cost fixture server and one extracted source page.",
            "finding": "All authorized callbacks complete before a review-only draft is returned.",
            "pages": [1],
        }],
        implementation_hooks=[{
            "task": "Run the fixture RPC path before testing a paid provider.",
            "first_check": "Verify the returned proposal remains unapplied until explicit review.",
            "pages": [1],
        }],
        limitations=[],
        user_observations=[],
        open_questions=[],
    )
    quality = evaluate_paper_wiki_draft(
        case_id=target_id,
        draft=draft,
        available_pages={1},
        available_reading_refs=set(),
    )
    return {
        "schemaVersion": "meridian.paper-wiki-draft.v2",
        "workflow": "paper-wiki",
        "targetId": target_id,
        "scopeDigest": scope_digest,
        "action": action,
        "draft": draft.model_dump(mode="json"),
        "quality": quality.model_dump(mode="json", by_alias=True),
        "reviewRequired": True,
        "applied": False,
    }


if __name__ == "__main__":
    JsonLineServer(methods={"paper-wiki.propose": _propose}).serve(
        source=sys.stdin,
        output=sys.stdout,
    )
