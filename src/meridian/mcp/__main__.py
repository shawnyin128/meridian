from __future__ import annotations

import sys

from meridian.mcp import adapter, server


if __name__ == "__main__":
    argv = sys.argv[1:]
    if not argv or argv[0] in {"-h", "--help"}:
        print(
            "usage: python -m meridian.mcp {serve,capabilities,context,read,trace,update,propose,apply,audit} ...\n\n"
            "Product MCP entry:\n"
            "  serve        start the stdio MCP server\n\n"
            "JSON bridge / smoke tools:\n"
            "  capabilities context read trace update propose apply audit\n\n"
            "Examples:\n"
            "  python -m meridian.mcp serve --wiki-root wiki\n"
            "  python -m meridian.mcp capabilities --detail full"
        )
        raise SystemExit(0)
    if argv and argv[0] == "serve":
        raise SystemExit(server.main(argv[1:]))
    raise SystemExit(adapter.main(argv))
