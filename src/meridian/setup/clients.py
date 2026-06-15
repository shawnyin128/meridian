from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from meridian import __version__

MCP_SERVER_NAME = "meridian-paper-wiki"
PRODUCT_SKILLS = ["meridian", "wiki", "lab"]


@dataclass(frozen=True)
class ClientInstall:
    client: str
    source_root: Path | None
    cache_root: Path | None
    cache_state: str
    version: str | None
    manifest_path: Path | None
    mcp_config_path: Path | None
    skills: dict[str, str]
    configured_server: dict[str, Any] | None
    error: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "client": self.client,
            "source_root": str(self.source_root) if self.source_root else None,
            "cache_root": str(self.cache_root) if self.cache_root else None,
            "cache_state": self.cache_state,
            "version": self.version,
            "manifest_path": str(self.manifest_path) if self.manifest_path else None,
            "mcp_config_path": str(self.mcp_config_path) if self.mcp_config_path else None,
            "skills": self.skills,
            "configured_server": self.configured_server,
            "error": self.error,
        }


def inspect_client_installs(
    project_root: Path,
    home: Path | None = None,
    clients: list[str] | None = None,
) -> list[ClientInstall]:
    selected = ["codex", "claude"] if clients is None else clients
    user_home = (home or Path.home()).expanduser()
    root = project_root.expanduser()
    return [_inspect_client(client, project_root=root, home=user_home) for client in selected]


def _inspect_client(client: str, *, project_root: Path, home: Path) -> ClientInstall:
    source_root = _source_root(project_root, client)
    cache_base = _cache_base(home, client)
    cache_root = cache_base / __version__
    manifest_path = _manifest_path(source_root, client)
    if not cache_root.exists():
        return ClientInstall(
            client=client,
            source_root=source_root if source_root.exists() else None,
            cache_root=cache_root,
            cache_state="missing",
            version=None,
            manifest_path=manifest_path if manifest_path.exists() else None,
            mcp_config_path=None,
            skills={skill: "missing" for skill in PRODUCT_SKILLS},
            configured_server=None,
        )

    skills = {
        skill: _skill_state(cache_root / "skills" / skill / "SKILL.md")
        for skill in PRODUCT_SKILLS
    }
    mcp_config_path = cache_root / ".mcp.json"
    configured_server: dict[str, Any] | None = None
    error: str | None = None
    if mcp_config_path.exists():
        try:
            payload = json.loads(mcp_config_path.read_text(encoding="utf-8"))
            configured_server = _parse_configured_server(payload)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            error = str(exc)

    return ClientInstall(
        client=client,
        source_root=source_root if source_root.exists() else None,
        cache_root=cache_root,
        cache_state="installed",
        version=__version__,
        manifest_path=manifest_path if manifest_path.exists() else None,
        mcp_config_path=mcp_config_path if mcp_config_path.exists() else None,
        skills=skills,
        configured_server=configured_server,
        error=error,
    )


def _source_root(project_root: Path, client: str) -> Path:
    if client == "codex":
        return project_root / "plugins/codex/meridian"
    if client == "claude":
        return project_root / "plugins/claude-code/meridian"
    raise ValueError(f"unknown Meridian client: {client}")


def _cache_base(home: Path, client: str) -> Path:
    if client == "codex":
        return home / ".codex/plugins/cache/meridian/meridian"
    if client == "claude":
        return home / ".claude/plugins/cache/meridian/meridian"
    raise ValueError(f"unknown Meridian client: {client}")


def _manifest_path(source_root: Path, client: str) -> Path:
    if client == "codex":
        return source_root / ".codex-plugin/plugin.json"
    if client == "claude":
        return source_root / ".claude-plugin/plugin.json"
    raise ValueError(f"unknown Meridian client: {client}")


def _parse_configured_server(payload: dict[str, Any]) -> dict[str, Any]:
    server = payload["mcpServers"][MCP_SERVER_NAME]
    if not isinstance(server, dict):
        raise ValueError(f"Configured server '{MCP_SERVER_NAME}' is not a mapping.")
    if "command" not in server or "args" not in server:
        raise ValueError(f"Configured server '{MCP_SERVER_NAME}' is missing command and/or args.")
    if not isinstance(server["command"], str):
        raise ValueError(f"Configured server '{MCP_SERVER_NAME}' command must be a string.")
    if not isinstance(server["args"], list):
        raise ValueError(f"Configured server '{MCP_SERVER_NAME}' args must be a list.")
    return dict(server)


def _skill_state(path: Path) -> str:
    if not path.exists():
        return "missing"
    try:
        path.read_text(encoding="utf-8")
    except OSError:
        return "unreadable"
    if path.is_dir():
        return "unreadable"
    return "readable"
