from collections.abc import Sequence


def build_turn(entity_ids: Sequence[str], question: str) -> dict[str, object]:
    """Assemble one chat turn for the graph.

    entity_ids: entities the user referenced with @, already resolved by Core.
    question: the user's raw question text.
    Returns: the input payload passed to the orchestration graph.
    """
    return {"entities": list(entity_ids), "question": question}
