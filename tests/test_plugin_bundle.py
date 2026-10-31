"""Tests for the Meridian core that the Claude Code plugin carries in its lib/ folder."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

from meridian import __version__

PLUGIN = Path("plugins/claude-code/meridian")
LIB = PLUGIN / "lib"
RUN = LIB / "run.py"


def bundled_files(root: Path) -> dict[str, bytes]:
    """Every file under `root` except bytecode caches, by its path relative to `root`."""
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc"
    }


def without_site(*args: str) -> subprocess.CompletedProcess[str]:
    """Runs this Python with no site-packages at all, as on a machine where no Meridian or PyYAML is installed."""
    return subprocess.run([sys.executable, "-S", "-I", *args], capture_output=True, text=True, timeout=60, check=False)


class PluginBundleTests(unittest.TestCase):
    def test_the_bundled_core_is_an_exact_copy_of_src_meridian(self) -> None:
        self.assertEqual(bundled_files(LIB / "meridian"), bundled_files(Path("src/meridian")))

    def test_the_bundled_core_and_pyyaml_import_where_nothing_is_installed(self) -> None:
        probe = (
            "import sys; sys.path.insert(0, sys.argv[1]); import meridian, yaml; "
            "print(meridian.__file__); print(yaml.__file__); print(yaml.safe_load('a: [1]'))"
        )
        result = without_site("-c", probe, str(LIB.resolve()))

        self.assertEqual(result.returncode, 0, result.stderr)
        core, pyyaml, loaded = result.stdout.splitlines()
        self.assertTrue(Path(core).is_relative_to(LIB.resolve()), core)
        self.assertTrue(Path(pyyaml).is_relative_to(LIB.resolve()), pyyaml)
        self.assertEqual(loaded, "{'a': [1]}")
        self.assertTrue((LIB / "yaml" / "LICENSE").is_file())

    def test_the_launcher_runs_a_bundled_module_where_nothing_is_installed(self) -> None:
        result = without_site(str(RUN), "meridian", "--version")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(__version__, result.stdout)

    def test_the_mcp_server_and_both_hooks_start_through_the_launcher_without_a_shell(self) -> None:
        launch = ["${CLAUDE_PLUGIN_ROOT}/lib/run.py"]
        server = json.loads((PLUGIN / ".mcp.json").read_text(encoding="utf-8"))["mcpServers"]["meridian-paper-wiki"]
        self.assertEqual(server["command"], "python")
        self.assertEqual(server["args"], [*launch, "meridian.mcp", "serve"])

        hooks = json.loads((PLUGIN / "hooks/hooks.json").read_text(encoding="utf-8"))["hooks"]
        self.assertEqual(set(hooks), {"SessionStart", "UserPromptSubmit"})
        for event, groups in hooks.items():
            with self.subTest(event=event):
                (hook,) = [hook for group in groups for hook in group["hooks"]]
                self.assertEqual(hook["command"], "python")
                self.assertEqual(hook["args"], [*launch, "meridian", "lab", "focus", "--hook"])
                self.assertNotIn("shell", hook)

        root = str(PLUGIN.resolve())
        server_help = [arg.replace("${CLAUDE_PLUGIN_ROOT}", root) for arg in server["args"][:-1]]
        result = without_site(*server_help, "--help")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_the_bin_command_runs_the_bundled_core(self) -> None:
        env = {"PATH": os.pathsep.join([str(Path(sys.executable).parent), "/usr/bin", "/bin"])}
        result = subprocess.run(
            [str(PLUGIN / "bin" / "meridian"), "--version"], capture_output=True, text=True, timeout=60, env=env, check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(__version__, result.stdout)
        self.assertTrue((PLUGIN / "bin" / "meridian.cmd").is_file())

    def test_the_skills_call_the_plugin_command_not_an_installed_python_module(self) -> None:
        for skill in sorted((PLUGIN / "skills").rglob("*.md")):
            with self.subTest(skill=skill.as_posix()):
                self.assertNotIn("python -m meridian", skill.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
