"""Scenario-facing MCP adapter for Meridian Paper Wiki.

The real MCP server can wrap these functions without exposing the full CLI
command surface. The Markdown wiki remains the source of truth.
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

__all__ = [
    "apply",
    "audit",
    "capabilities",
    "context",
    "propose",
    "read",
    "trace",
    "update",
]
