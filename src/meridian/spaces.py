"""Project spaces: where each project bound to one workspace keeps its records.

The first project of a workspace keeps ``.meridian/``; every later one keeps
``.meridian/projects/<id>/`` with the same layout. Only the Meridian App creates a space, by
writing its ``workspace.json``.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

ROOT_SPACE = PurePosixPath(".meridian")
NESTED_SPACES = ROOT_SPACE / "projects"
SPACE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")


class ProjectChoiceError(ValueError):
    """Raised when a workspace call does not name a project the workspace holds.

    ``projects`` lists the workspace's projects, each as ``{"id", "name"}``, for the agent to choose from.
    """

    def __init__(self, message: str, projects: list[dict[str, str]]) -> None:
        listed = ", ".join(f"{item['id'] or '?'} ({item['name']})" for item in projects) or "none"
        super().__init__(f"{message}: {listed}")
        self.projects = projects


@dataclass(frozen=True)
class ProjectSpace:
    """One project space: the workspace ``repository`` and the space ``folder`` relative to it."""

    repository: Path
    folder: PurePosixPath

    @property
    def lab_root(self) -> Path:
        """The space's folder on disk, the Lab root of its project."""
        return self.repository / self.folder

    def path(self, relative: str) -> PurePosixPath:
        """The workspace-relative path of ``relative`` inside this space."""
        return self.folder / relative


def _project_of(manifest: Path) -> dict[str, str] | None:
    """The ``{"id", "name"}`` the manifest at ``manifest`` names, or None when it cannot be read."""
    try:
        value: Any = json.loads(manifest.read_text(encoding="utf-8"))
        project = value["project"]
        if isinstance(project["id"], str) and project["id"] and isinstance(project["name"], str):
            return {"id": project["id"], "name": project["name"]}
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return None


def workspace_projects(repository: Path) -> list[tuple[ProjectSpace, dict[str, str] | None]]:
    """Every space of the workspace at ``repository`` with the project its manifest names.

    The root space comes first when ``.meridian/workspace.json`` exists, then each
    ``.meridian/projects/<id>/`` holding a manifest, by folder name. A manifest that cannot be
    read pairs its space with None.
    """

    found: list[tuple[ProjectSpace, dict[str, str] | None]] = []
    if (repository / ROOT_SPACE / "workspace.json").is_file():
        found.append((ProjectSpace(repository, ROOT_SPACE), _project_of(repository / ROOT_SPACE / "workspace.json")))
    nested = repository / NESTED_SPACES
    if nested.is_dir():
        for folder in sorted(nested.iterdir(), key=lambda item: item.name):
            if SPACE_ID.fullmatch(folder.name) and (folder / "workspace.json").is_file():
                space = ProjectSpace(repository, NESTED_SPACES / folder.name)
                found.append((space, _project_of(folder / "workspace.json")))
    return found


def _listed(found: list[tuple[ProjectSpace, dict[str, str] | None]]) -> list[dict[str, str]]:
    return [
        project if project is not None else {"id": "", "name": f"{space.folder.as_posix()} (unreadable manifest)"}
        for space, project in found
    ]


def resolve_space(root: Path, project: str | None = None) -> ProjectSpace:
    """The project space a workspace call made at ``root`` for ``project`` works in.

    ``root`` is a repository, its ``.meridian`` folder, or a nested space folder, which names its
    space itself. With ``project``, the id of a project the workspace holds, the call works in that
    project's space. Without it, a repository with no space or one space works in that one, and a
    repository with several raises :class:`ProjectChoiceError` listing them. ``root`` must exist.
    """

    resolved = root.expanduser().resolve()
    if resolved.name == ROOT_SPACE.name:
        repository, named = resolved.parent, ROOT_SPACE
    elif resolved.parent.name == NESTED_SPACES.name and resolved.parent.parent.name == ROOT_SPACE.name:
        repository, named = resolved.parent.parent.parent, NESTED_SPACES / resolved.name
    else:
        repository, named = resolved, None
    found = workspace_projects(repository)
    if project is not None:
        wanted = project.strip()
        for space, held in found:
            if held is not None and held["id"] == wanted:
                if named is not None and space.folder != named:
                    break
                return space
        raise ProjectChoiceError(
            f"this workspace holds no project {wanted!r}; pass one of the projects listed",
            _listed(found),
        )
    if named is not None:
        return ProjectSpace(repository, named)
    if len(found) <= 1:
        return found[0][0] if found else ProjectSpace(repository, ROOT_SPACE)
    raise ProjectChoiceError(
        "this workspace holds several projects; pass project with the id of the one this work is for",
        _listed(found),
    )


def repository_of(lab_root: Path) -> Path:
    """The workspace the space folder ``lab_root``, ``.meridian`` or ``.meridian/projects/<id>``, belongs to."""
    if lab_root.parent.name == NESTED_SPACES.name and lab_root.parent.parent.name == ROOT_SPACE.name:
        return lab_root.parent.parent.parent
    return lab_root.parent


def folder_of(lab_root: Path) -> str:
    """The space folder ``lab_root`` relative to its workspace, with ``/`` between its parts."""
    return lab_root.relative_to(repository_of(lab_root)).as_posix()
