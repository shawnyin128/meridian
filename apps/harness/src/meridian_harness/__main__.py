"""Command-line entry point for the Meridian Harness stdio service."""

from .server import run_stdio


def main() -> None:
    """Start the JSON Lines protocol loop."""
    run_stdio()


if __name__ == "__main__":
    main()
