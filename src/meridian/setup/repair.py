from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from meridian.setup.clients import MCP_SERVER_NAME
from meridian.setup.doctor import RepairAction


@dataclass(frozen=True)
class RepairResult:
    client: str
    target: Path
    backup_path: Path
    command: str
    args: list[str]
    applied: bool
    restart_required: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "client": self.client,
            "target": str(self.target),
            "backup_path": str(self.backup_path),
            "command": self.command,
            "args": self.args,
            "applied": self.applied,
            "restart_required": self.restart_required,
        }


def plan_mcp_repair(*, client: str, mcp_config_path: Path, command: str, args: list[str]) -> RepairAction:
    return RepairAction(client=client, target=mcp_config_path, command=command, args=args)


def _backup_path_for(path: Path, timestamp: str) -> Path:
    base = path.with_name(f"{path.name}.bak-{timestamp}")
    backup_path = base
    if not backup_path.exists():
        return backup_path

    suffix = 1
    while True:
        backup_path = path.with_name(f"{base.name}-{suffix}")
        if not backup_path.exists():
            return backup_path
        suffix += 1


def apply_mcp_repair(
    *,
    client: str,
    mcp_config_path: Path,
    command: str,
    args: list[str],
    timestamp: str | None = None,
) -> RepairResult:
    stamp = timestamp or datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_path = _backup_path_for(mcp_config_path, stamp)
    original = mcp_config_path.read_text(encoding="utf-8")
    backup_path.write_text(original, encoding="utf-8")
    payload = json.loads(original)
    if not isinstance(payload, dict):
        payload = {}
    servers = payload.get("mcpServers")
    if not isinstance(servers, dict):
        payload["mcpServers"] = {}
        servers = payload["mcpServers"]
    else:
        # keep existing dict and normalize nested object shape by clobbering target key
        payload["mcpServers"] = servers
    payload["mcpServers"][MCP_SERVER_NAME] = {"command": command, "args": args}
    mcp_config_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return RepairResult(
        client=client,
        target=mcp_config_path,
        backup_path=backup_path,
        command=command,
        args=args,
        applied=True,
        restart_required=True,
    )