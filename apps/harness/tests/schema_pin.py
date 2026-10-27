"""What a model-facing JSON schema may carry, measured against the schemas as first sent."""

from __future__ import annotations

import inspect
import json
from importlib.resources import files

from pydantic import BaseModel


def released_schema(name: str) -> dict[str, object]:
    """The JSON schema output class `name` had when it was first sent, in v0.0.23.0 or, for
    ChatDesignAnswer and ChatIdeaAnswer, in v0.0.24.0, its titles and class docstrings removed and
    every other key kept."""

    fixture = files("fixtures").joinpath("model_output_schemas.json")
    schemas = json.loads(fixture.read_text(encoding="utf-8"))
    return schemas[name]


def developer_text(node: object, schema: type[BaseModel]) -> list[str]:
    """The pydantic titles in JSON schema `node`, and the docstrings of `schema` and of the
    classes it holds that `node` repeats."""

    sent = json.dumps(node, ensure_ascii=False)
    found: list[str] = []

    def walk(value: object) -> None:
        if isinstance(value, dict):
            if isinstance(value.get("title"), str):
                found.append(f"title {value['title']}")
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(node)
    classes = {schema}
    while True:
        held = {
            kind for cls in classes for field in cls.model_fields.values()
            for kind in _classes_in(field.annotation)
        } - classes
        if not held:
            break
        classes |= held
    for cls in classes:
        doc = inspect.cleandoc(cls.__doc__ or "")
        if doc and json.dumps(doc, ensure_ascii=False)[1:-1] in sent:
            found.append(f"docstring of {cls.__name__}")
    return found


def _classes_in(annotation: object) -> set[type[BaseModel]]:
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return {annotation}
    return {kind for arg in getattr(annotation, "__args__", ()) for kind in _classes_in(arg)}
