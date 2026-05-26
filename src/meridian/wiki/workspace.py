from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.vault import WikiInitResult, init_wiki_vault


WORKSPACE_CONFIG_FILENAME = "meridian-wiki.json"
WORKSPACE_SCHEMA_VERSION = "meridian.paper_wiki_workspace.v1"
USER_CONFIG_SCHEMA_VERSION = "meridian.paper_wiki_user_config.v1"


@dataclass(frozen=True)
class PaperWikiWorkspace:
    library_root: Path
    source_root: Path
    wiki_root: Path
    config_path: Path | None
    source_policy: str = "copy_into_managed_store"


@dataclass(frozen=True)
class WorkspaceInitResult:
    workspace: PaperWikiWorkspace
    wiki_result: WikiInitResult
    created_dirs: list[Path]
    created_files: list[Path]
    user_config_path: Path | None


def default_user_config_path() -> Path:
    base = os.environ.get("MERIDIAN_CONFIG_HOME")
    if base:
        return Path(base).expanduser() / "paper-wiki-workspaces.json"
    return Path.home() / ".meridian" / "paper-wiki-workspaces.json"


def init_workspace(
    *,
    library_root: Path,
    wiki_root: Path | None = None,
    source_root: Path | None = None,
    set_default: bool = True,
    overwrite: bool = False,
    overwrite_templates: bool = False,
) -> WorkspaceInitResult:
    library = library_root.expanduser().resolve()
    wiki = (wiki_root.expanduser().resolve() if wiki_root is not None else library / "wiki")
    sources = (source_root.expanduser().resolve() if source_root is not None else library / "sources")
    config_path = library / WORKSPACE_CONFIG_FILENAME

    created_dirs: list[Path] = []
    created_files: list[Path] = []
    for path in (library, sources, sources / "papers", sources / "assets", sources / "notes"):
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            created_dirs.append(path)

    registry = sources / "sources.jsonl"
    if not registry.exists():
        registry.write_text("", encoding="utf-8")
        created_files.append(registry)
    source_index = sources / "index.md"
    if not source_index.exists():
        source_index.write_text("# Source Index\n\nNo registered sources yet.\n", encoding="utf-8")
        created_files.append(source_index)

    if config_path.exists() and not overwrite:
        existing = load_workspace_config(config_path)
        if existing.wiki_root != wiki or existing.source_root != sources:
            raise FileExistsError(
                f"workspace config already exists with different paths: {config_path}"
            )
    else:
        payload = _workspace_payload(
            library_root=library,
            source_root=sources,
            wiki_root=wiki,
        )
        config_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        created_files.append(config_path)

    wiki_result = init_wiki_vault(wiki_root=wiki, overwrite_templates=overwrite_templates)
    workspace = PaperWikiWorkspace(
        library_root=library,
        source_root=sources,
        wiki_root=wiki,
        config_path=config_path,
    )
    user_config_path = None
    if set_default:
        user_config_path = register_user_workspace(workspace, make_active=True)

    return WorkspaceInitResult(
        workspace=workspace,
        wiki_result=wiki_result,
        created_dirs=created_dirs + wiki_result.created_dirs,
        created_files=created_files + wiki_result.created_files,
        user_config_path=user_config_path,
    )


def load_workspace_config(path: Path) -> PaperWikiWorkspace:
    config_path = path.expanduser().resolve()
    if config_path.is_dir():
        config_path = config_path / WORKSPACE_CONFIG_FILENAME
    payload = json.loads(config_path.read_text(encoding="utf-8"))
    library_root = Path(str(payload.get("library_root") or config_path.parent)).expanduser().resolve()
    source_root = Path(str(payload.get("source_root") or library_root / "sources")).expanduser().resolve()
    wiki_root = Path(str(payload.get("wiki_root") or library_root / "wiki")).expanduser().resolve()
    return PaperWikiWorkspace(
        library_root=library_root,
        source_root=source_root,
        wiki_root=wiki_root,
        config_path=config_path,
        source_policy=str(payload.get("source_policy") or "copy_into_managed_store"),
    )


def resolve_workspace(
    *,
    library_root: Path | None = None,
    wiki_root: Path | None = None,
    cwd: Path | None = None,
    require: bool = False,
) -> PaperWikiWorkspace | None:
    if library_root is not None:
        return load_workspace_config(library_root)

    if wiki_root is not None:
        raw_wiki = wiki_root.expanduser()
        wiki = raw_wiki.resolve()
        configured = _workspace_for_explicit_wiki_root(wiki)
        if configured is not None:
            return configured
        return PaperWikiWorkspace(
            library_root=raw_wiki.parent,
            source_root=raw_wiki / "raw" / "sources",
            wiki_root=raw_wiki,
            config_path=None,
        )

    env_workspace = os.environ.get("MERIDIAN_WIKI_WORKSPACE") or os.environ.get("MERIDIAN_LIBRARY_ROOT")
    if env_workspace:
        return load_workspace_config(Path(env_workspace))

    discovered = _discover_workspace_config(cwd or Path.cwd())
    if discovered is not None:
        return load_workspace_config(discovered)

    user_config = _read_user_config(default_user_config_path())
    active = user_config.get("active_library_root")
    if active:
        return load_workspace_config(Path(str(active)))

    if require:
        raise FileNotFoundError(
            "No Meridian Paper Wiki workspace is configured. Run "
            "`meridian wiki init --library-root <library-root>` or pass `--wiki-root`."
        )
    return None


def register_user_workspace(workspace: PaperWikiWorkspace, *, make_active: bool = True) -> Path:
    path = default_user_config_path()
    payload = _read_user_config(path)
    workspaces = [
        item
        for item in payload.get("workspaces", [])
        if str(item.get("library_root")) != str(workspace.library_root)
    ]
    workspaces.append(
        {
            "library_root": str(workspace.library_root),
            "config_path": str(workspace.config_path or workspace.library_root / WORKSPACE_CONFIG_FILENAME),
            "wiki_root": str(workspace.wiki_root),
            "source_root": str(workspace.source_root),
        }
    )
    payload.update(
        {
            "schema_version": USER_CONFIG_SCHEMA_VERSION,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "workspaces": sorted(workspaces, key=lambda item: str(item.get("library_root"))),
        }
    )
    if make_active:
        payload["active_library_root"] = str(workspace.library_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def workspace_for_cli(*, library_root: Path | None, wiki_root: Path | None) -> PaperWikiWorkspace:
    workspace = resolve_workspace(library_root=library_root, wiki_root=wiki_root)
    if workspace is None:
        raise FileNotFoundError(
            "No Paper Wiki workspace is configured. Run "
            "`meridian wiki init --library-root <library-root>` first, or pass `--wiki-root`."
        )
    return workspace


def _workspace_for_explicit_wiki_root(wiki_root: Path) -> PaperWikiWorkspace | None:
    candidates = [
        wiki_root / WORKSPACE_CONFIG_FILENAME,
        wiki_root.parent / WORKSPACE_CONFIG_FILENAME,
        wiki_root.parent.parent / WORKSPACE_CONFIG_FILENAME if wiki_root.parent != wiki_root.parent.parent else None,
    ]
    for candidate in candidates:
        if candidate is None or not candidate.exists():
            continue
        workspace = load_workspace_config(candidate)
        if workspace.wiki_root == wiki_root:
            return workspace
    return None


def _discover_workspace_config(start: Path) -> Path | None:
    current = start.expanduser().resolve()
    if current.is_file():
        current = current.parent
    for candidate_root in (current, *current.parents):
        candidate = candidate_root / WORKSPACE_CONFIG_FILENAME
        if candidate.exists():
            return candidate
    return None


def _read_user_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "schema_version": USER_CONFIG_SCHEMA_VERSION,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "workspaces": [],
        }
    return json.loads(path.read_text(encoding="utf-8"))


def _workspace_payload(*, library_root: Path, source_root: Path, wiki_root: Path) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "schema_version": WORKSPACE_SCHEMA_VERSION,
        "created_at": now,
        "updated_at": now,
        "library_root": str(library_root),
        "source_root": str(source_root),
        "wiki_root": str(wiki_root),
        "source_policy": "copy_into_managed_store",
        "source_registry": str(source_root / "sources.jsonl"),
    }
