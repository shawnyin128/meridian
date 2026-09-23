"""Scenario-facing MCP adapter for Meridian Paper Wiki and Project Workspace.

The real MCP server can wrap these functions without exposing the full CLI
command surface. Durable Wiki and repository surfaces remain the sources of
truth.
"""

from meridian.mcp.adapter import (
    audit,
    capabilities,
    context,
    read,
    trace,
    wiki_propose,
    wiki_proposal_status,
)
from meridian.mcp.server import MeridianMCPServer, tool_definitions

__all__ = [
    "MeridianMCPServer",
    "audit",
    "capabilities",
    "context",
    "read",
    "tool_definitions",
    "trace",
    "wiki_propose",
    "wiki_proposal_status",
]
