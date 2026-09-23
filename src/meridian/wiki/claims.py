"""Shape-only validation for agent-submitted Wiki claim proposals.

Interface decisions (interface.md 0.0.14, binding over the spec):
- agents may submit only the six claim ops;
- a non-human `addClaim`/`reviseClaim` needs at least one `experiment`
  evidence item (stricter than the spec, which also accepts `source`/`wiki`);
- `personal` evidence is human-only and is rejected from every op.

This module checks shape only: required fields, closed op/evidence kinds, and
the two rules above. Referential checks (does the claim exist, is the
evidence anchor real, is the proposal's base stale) are Core's job once the
envelope reaches `.meridian/proposal-inbox/` (spec sec 3.3, 4.3, 7.1).
"""

from __future__ import annotations

import re
from typing import Any

CLAIM_OPS = ("addClaim", "reviseClaim", "addEvidence", "markConflict", "resolveConflict", "retractClaim")
EVIDENCE_KINDS = ("source", "wiki", "experiment", "note", "personal")
CONFLICT_TARGET_KINDS = ("claim", "source", "experiment")
CONFLICT_OUTCOMES = ("revised", "split", "retracted", "dismissed")

_CLAIM_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_CLAIM_REF = re.compile(r"^[^\s#]+/[^\s#]+#[a-z0-9][a-z0-9-]{0,63}$")


class ProposalValidationError(ValueError):
    """A wiki_propose call did not carry a valid, agent-eligible claim proposal."""


def validate_claim_ops(ops: Any) -> None:
    """Raise :class:`ProposalValidationError` unless every op is a valid claim op."""
    if not isinstance(ops, list) or not ops:
        raise ProposalValidationError("ops must be a non-empty list of claim operations")
    for index, op in enumerate(ops):
        if not isinstance(op, dict):
            raise ProposalValidationError(f"ops[{index}] must be an object")
        kind = op.get("op")
        if kind not in CLAIM_OPS:
            raise ProposalValidationError(
                f"ops[{index}]: agents may only submit claim ops {list(CLAIM_OPS)}, got {kind!r}"
            )
        _VALIDATORS[kind](op, index)


def _fail(index: int, op_name: str, message: str) -> None:
    raise ProposalValidationError(f"ops[{index}] ({op_name}): {message}")


def _require_line(op: dict[str, Any], index: int, key: str) -> str:
    value = op.get(key)
    if not isinstance(value, str) or not value.strip() or "\n" in value:
        _fail(index, str(op.get("op")), f"{key!r} must be a single non-empty line")
    return value


def _require_page_id(op: dict[str, Any], index: int, key: str = "page") -> str:
    value = _require_line(op, index, key)
    if "/" not in value:
        _fail(index, str(op.get("op")), f"{key!r} must be a '<dir>/<slug>' page id")
    return value


def _require_claim_id(op: dict[str, Any], index: int, key: str = "claim") -> str:
    value = op.get(key)
    if not isinstance(value, str) or not _CLAIM_ID.match(value):
        _fail(index, str(op.get("op")), f"{key!r} must match ^[a-z0-9][a-z0-9-]{{0,63}}$")
    return value


def _validate_evidence_list(evidence: Any, index: int, op_name: str, *, min_items: int) -> int:
    """Validate an evidence array and return how many `experiment` items it has."""
    if not isinstance(evidence, list) or len(evidence) < min_items:
        _fail(index, op_name, f"evidence must be a list of at least {min_items} item(s)")
    experiment_count = 0
    for item_index, item in enumerate(evidence):
        if not isinstance(item, dict):
            _fail(index, op_name, f"evidence[{item_index}] must be an object")
        kind = item.get("kind")
        if kind not in EVIDENCE_KINDS:
            _fail(index, op_name, f"evidence[{item_index}].kind must be one of {list(EVIDENCE_KINDS)}")
        if kind == "personal":
            _fail(index, op_name, f"evidence[{item_index}] is personal; only a human may write personal evidence")
        elif kind == "experiment":
            if not item.get("project"):
                _fail(index, op_name, f"experiment evidence[{item_index}] needs project")
            if not item.get("node") and not item.get("conclusion"):
                _fail(index, op_name, f"experiment evidence[{item_index}] needs node or conclusion")
            experiment_count += 1
        elif kind == "source":
            for field in ("paper", "page", "quote"):
                if not item.get(field):
                    _fail(index, op_name, f"source evidence[{item_index}] needs {field}")
        elif kind == "wiki":
            if not item.get("ref"):
                _fail(index, op_name, f"wiki evidence[{item_index}] needs ref")
        elif kind == "note":
            if not item.get("paper"):
                _fail(index, op_name, f"note evidence[{item_index}] needs paper")
            if not item.get("highlight") and not item.get("note"):
                _fail(index, op_name, f"note evidence[{item_index}] needs highlight or note")
    return experiment_count


def _validate_add_claim(op: dict[str, Any], index: int) -> None:
    _require_page_id(op, index, "page")
    claim = op.get("claim")
    if not isinstance(claim, dict):
        _fail(index, "addClaim", "claim must be an object")
    if not isinstance(claim.get("id"), str) or not _CLAIM_ID.match(claim["id"]):
        _fail(index, "addClaim", "claim.id must match ^[a-z0-9][a-z0-9-]{0,63}$")
    text = claim.get("text")
    if not isinstance(text, str) or not text.strip() or "\n" in text:
        _fail(index, "addClaim", "claim.text must be a single non-empty line")
    experiment_count = _validate_evidence_list(claim.get("evidence"), index, "addClaim", min_items=1)
    if experiment_count < 1:
        _fail(index, "addClaim", "needs at least one experiment evidence item")


def _validate_revise_claim(op: dict[str, Any], index: int) -> None:
    _require_page_id(op, index, "page")
    _require_claim_id(op, index, "claim")
    _require_line(op, index, "text")
    experiment_count = _validate_evidence_list(op.get("evidence") or [], index, "reviseClaim", min_items=1)
    if experiment_count < 1:
        _fail(index, "reviseClaim", "needs at least one experiment evidence item")


def _validate_add_evidence(op: dict[str, Any], index: int) -> None:
    _require_page_id(op, index, "page")
    _require_claim_id(op, index, "claim")
    _validate_evidence_list(op.get("evidence"), index, "addEvidence", min_items=1)


def _validate_mark_conflict(op: dict[str, Any], index: int) -> None:
    _require_page_id(op, index, "page")
    _require_claim_id(op, index, "claim")
    conflict = op.get("conflict")
    if not isinstance(conflict, dict):
        _fail(index, "markConflict", "conflict must be an object")
    if not isinstance(conflict.get("id"), str) or not _CLAIM_ID.match(conflict["id"]):
        _fail(index, "markConflict", "conflict.id must match ^[a-z0-9][a-z0-9-]{0,63}$")
    against = conflict.get("against")
    if not isinstance(against, dict) or against.get("kind") not in CONFLICT_TARGET_KINDS:
        _fail(index, "markConflict", f"conflict.against.kind must be one of {list(CONFLICT_TARGET_KINDS)}")
    if against["kind"] == "claim":
        ref = against.get("ref")
        if not isinstance(ref, str) or not _CLAIM_REF.match(ref):
            _fail(index, "markConflict", "conflict.against.ref must be '<page id>#<claim id>'")
    elif against["kind"] == "source":
        for field in ("paper", "page", "quote"):
            if not against.get(field):
                _fail(index, "markConflict", f"conflict.against needs {field}")
    else:
        if not against.get("project"):
            _fail(index, "markConflict", "conflict.against needs project")
        if not against.get("node") and not against.get("conclusion"):
            _fail(index, "markConflict", "conflict.against needs node or conclusion")
    note = conflict.get("note")
    if not isinstance(note, str) or not note.strip() or "\n" in note:
        _fail(index, "markConflict", "conflict.note must be a single non-empty line")


def _validate_resolve_conflict(op: dict[str, Any], index: int) -> None:
    _require_page_id(op, index, "page")
    _require_claim_id(op, index, "claim")
    _require_claim_id(op, index, "conflict")
    if op.get("outcome") not in CONFLICT_OUTCOMES:
        _fail(index, "resolveConflict", f"outcome must be one of {list(CONFLICT_OUTCOMES)}")
    _require_line(op, index, "note")


def _validate_retract_claim(op: dict[str, Any], index: int) -> None:
    _require_page_id(op, index, "page")
    _require_claim_id(op, index, "claim")
    _require_line(op, index, "reason")


_VALIDATORS = {
    "addClaim": _validate_add_claim,
    "reviseClaim": _validate_revise_claim,
    "addEvidence": _validate_add_evidence,
    "markConflict": _validate_mark_conflict,
    "resolveConflict": _validate_resolve_conflict,
    "retractClaim": _validate_retract_claim,
}
