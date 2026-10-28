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

    ``projects`` lists the workspace's spaces for the agent to choose from, each as ``{"id", "name",
    "space"}`` with the project's id and name and the space folder. When the Meridian vault says
    which space a project with several is bound to, each of them carries ``bound``.
    """

    def __init__(self, message: str, projects: list[dict[str, Any]]) -> None:
        listed = ", ".join(_named(item) for item in projects) or "none"
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


def _named(item: dict[str, Any]) -> str:
    if "bound" not in item:
        return f"{item['id'] or '?'} ({item['name']})"
    return f"{item['id']} ({item['name']}, {item['space']}{', bound' if item['bound'] else ''})"


_PAGE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def vault_binding(vault: Path, project_id: str, repository: Path) -> PurePosixPath | None:
    """The space folder of ``repository`` that the vault's page for project ``project_id`` binds.

    The page at ``<vault>/wiki/projects/<id>.md`` binds the root space with ``workspace_root`` or
    ``workspace_ssh`` and a nested one with ``shared_workspace``; the bound folder is compared with
    ``repository`` as the machine running this sees it. Returns None when the page is missing,
    cannot be read, or binds the project elsewhere.
    """

    from meridian.wiki.corpus import FrontmatterError, parse_frontmatter

    if not _PAGE_ID.fullmatch(project_id):
        return None
    try:
        front = parse_frontmatter((vault / "wiki" / "projects" / f"{project_id}.md").read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, FrontmatterError):
        return None
    ssh = front.get("workspace_ssh")
    shared = front.get("shared_workspace")
    if isinstance(front.get("workspace_root"), str):
        location, folder = front["workspace_root"], ROOT_SPACE
    elif isinstance(ssh, dict) and isinstance(ssh.get("path"), str):
        location, folder = ssh["path"], ROOT_SPACE
    elif isinstance(shared, dict) and isinstance(shared.get("space"), str) and SPACE_ID.fullmatch(shared["space"]):
        location = shared.get("root") if isinstance(shared.get("root"), str) else shared.get("path")
        folder = NESTED_SPACES / shared["space"]
    else:
        return None
    if not isinstance(location, str) or Path(location).expanduser().resolve() != repository:
        return None
    return folder


def _bound(found: list[tuple[ProjectSpace, dict[str, str] | None]], vault: Path | None) -> dict[str, PurePosixPath]:
    """The folder each project of ``found`` holding several spaces is bound to, as ``vault`` records it."""
    counts: dict[str, int] = {}
    for _, project in found:
        if project is not None:
            counts[project["id"]] = counts.get(project["id"], 0) + 1
    if vault is None or not found:
        return {}
    repository = found[0][0].repository
    bound: dict[str, PurePosixPath] = {}
    for project_id, count in counts.items():
        folder = vault_binding(vault, project_id, repository) if count > 1 else None
        if folder is not None and any(space.folder == folder for space, held in found if held and held["id"] == project_id):
            bound[project_id] = folder
    return bound


def _listed(found: list[tuple[ProjectSpace, dict[str, str] | None]], vault: Path | None) -> list[dict[str, Any]]:
    bound = _bound(found, vault)
    listed: list[dict[str, Any]] = []
    for space, project in found:
        folder = space.folder.as_posix()
        if project is None:
            listed.append({"id": "", "name": f"{folder} (unreadable manifest)", "space": folder})
            continue
        entry: dict[str, Any] = {**project, "space": folder}
        if project["id"] in bound:
            entry["bound"] = bound[project["id"]] == space.folder
        listed.append(entry)
    return listed


def resolve_space(root: Path, project: str | None = None, vault: Path | None = None) -> ProjectSpace:
    """The project space a workspace call made at ``root`` for ``project`` works in.

    ``root`` is a repository, its ``.meridian`` folder, or a nested space folder, which names its
    space itself. With ``project``, the id of a project the workspace holds, the call works in that
    project's space; of several, in the one the Meridian vault at ``vault`` binds it to. Without
    ``project``, a repository with no space works in the root space, and one whose spaces all
    belong to one project works in that project's space the same way. Anything else, a project
    with several spaces and no vault saying which is bound included, raises
    :class:`ProjectChoiceError` listing the spaces.
    """

    resolved = root.expanduser().resolve()
    if resolved.name == ROOT_SPACE.name:
        repository, named = resolved.parent, ROOT_SPACE
    elif resolved.parent.name == NESTED_SPACES.name and resolved.parent.parent.name == ROOT_SPACE.name:
        repository, named = resolved.parent.parent.parent, NESTED_SPACES / resolved.name
    else:
        repository, named = resolved, None
    found = workspace_projects(repository)
    if project is None:
        ids = {held["id"] for _, held in found if held is not None}
        if named is not None:
            return ProjectSpace(repository, named)
        if not found:
            return ProjectSpace(repository, ROOT_SPACE)
        if len(ids) != 1 or any(held is None for _, held in found):
            raise ProjectChoiceError(
                "this workspace holds several projects; pass project with the id of the one this work is for",
                _listed(found, vault),
            )
        project = next(iter(ids))
    wanted = project.strip()
    owned = [space for space, held in found if held is not None and held["id"] == wanted]
    if named is not None and any(space.folder == named for space in owned):
        return ProjectSpace(repository, named)
    if named is None and len(owned) == 1:
        return owned[0]
    if named is None and owned:
        folder = vault_binding(vault, wanted, repository) if vault is not None else None
        chosen = next((space for space in owned if space.folder == folder), None)
        if chosen is not None:
            return chosen
        raise ProjectChoiceError(
            f"project {wanted!r} has several spaces here and no Meridian vault says which it is bound to; "
            "ask the user which space this work is for",
            _listed(found, vault),
        )
    raise ProjectChoiceError(
        f"this workspace holds no project {wanted!r}; pass one of the projects listed",
        _listed(found, vault),
    )


def space_root(root: Path, project: str | None, vault: Path | None) -> Path:
    """The root a workspace or Lab call takes for ``project``, with ``vault`` as for resolve_space.

    It is ``root`` itself while that settles the space alone (it names a space, or the workspace
    holds at most one), else the resolved space folder. Raises as :func:`resolve_space` does.
    """

    resolved = root.expanduser().resolve()
    names_space = resolved.name == ROOT_SPACE.name or resolved.parent.name == NESTED_SPACES.name
    if project is None and (names_space or len(workspace_projects(resolved)) <= 1):
        return root
    return resolve_space(root, project, vault).lab_root


def repository_of(lab_root: Path) -> Path:
    """The workspace the space folder ``lab_root``, ``.meridian`` or ``.meridian/projects/<id>``, belongs to."""
    if lab_root.parent.name == NESTED_SPACES.name and lab_root.parent.parent.name == ROOT_SPACE.name:
        return lab_root.parent.parent.parent
    return lab_root.parent


def folder_of(lab_root: Path) -> str:
    """The space folder ``lab_root`` relative to its workspace, with ``/`` between its parts."""
    return lab_root.relative_to(repository_of(lab_root)).as_posix()
