"""Scenario-facing MCP adapter for Meridian Paper Wiki and Project Workspace.

The real MCP server can wrap these functions without exposing the full CLI
command surface. Durable Wiki and repository surfaces remain the sources of
truth.
"""

from meridian.mcp.adapter import (
    apply,
    audit,
    capabilities,
    context,
    propose,
    read,
    trace,
    update,
)
from meridian.mcp.server import MeridianMCPServer, tool_definitions

__all__ = [
    "MeridianMCPServer",
    "apply",
    "audit",
    "capabilities",
    "context",
    "propose",
    "read",
    "tool_definitions",
    "trace",
    "update",
]
