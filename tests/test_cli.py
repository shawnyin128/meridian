from __future__ import annotations

import json
import io
import os
import subprocess
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from meridian import __version__
from meridian.cli import main
from meridian.framework_check import (
    FRAMEWORK_CHECK_CATEGORIES,
    MCP_RUNTIME_CATEGORY,
    lab_skill_path_diagnostics,
    run_framework_check,
)
from meridian.lab import initialize_lab_space, validate_lab_space
from meridian.mcp import adapter as mcp_adapter
from meridian.mcp import harness as mcp_harness
from meridian.mcp import server as mcp_server
from meridian.setup.runtime import (
    CommandResult,
    RuntimeCandidate,
    default_runtime_candidates,
    resolve_meridian_runtime,
)
from meridian.setup.clients import inspect_client_installs
from meridian.setup.doctor import build_setup_doctor_report, format_setup_doctor
from meridian.setup.repair import apply_mcp_repair, plan_mcp_repair

PRODUCT_SKILL_NAMES = ["meridian", "wiki", "lab", "meridian-coding"]
AGENT_PLUGIN_SKILL_ROOT = Path("plugins/agent/meridian/skills")
CODEX_PLUGIN_SKILL_ROOT = Path("plugins/codex/meridian/skills")
CLAUDE_PLUGIN_SKILL_ROOT = Path("plugins/claude-code/meridian/skills")


def _run_cli_capture(args: list[str], env: dict[str, str] | None = None) -> tuple[int, str, str]:
    stdout = StringIO()
    stderr = StringIO()
    env_context = patch.dict(os.environ, env) if env is not None else patch.dict(os.environ, {})
    with env_context, redirect_stdout(stdout), redirect_stderr(stderr):
        exit_code = main(args)
    return exit_code, stdout.getvalue(), stderr.getvalue()


def _run_mcp_adapter_capture(args: list[str], env: dict[str, str] | None = None) -> tuple[int, str, str]:
    stdout = StringIO()
    stderr = StringIO()
    env_context = patch.dict(os.environ, env) if env is not None else patch.dict(os.environ, {})
    with env_context, redirect_stdout(stdout), redirect_stderr(stderr):
        try:
            exit_code = mcp_adapter.main(args)
        except SystemExit as exc:
            exit_code = int(exc.code or 0)
    return exit_code, stdout.getvalue(), stderr.getvalue()


def _mcp_frame(message: dict[str, object]) -> bytes:
    payload = json.dumps(message).encode("utf-8")
    return b"Content-Length: " + str(len(payload)).encode("ascii") + b"\r\n\r\n" + payload


def _mcp_framed_responses(raw: bytes) -> list[dict[str, object]]:
    responses: list[dict[str, object]] = []
    offset = 0
    while offset < len(raw):
        header_end = raw.index(b"\r\n\r\n", offset)
        header = raw[offset:header_end]
        length = int(header.split(b":", 1)[1].strip())
        body_start = header_end + 4
        body_end = body_start + length
        responses.append(json.loads(raw[body_start:body_end].decode("utf-8")))
        offset = body_end
    return responses


class CliTests(unittest.TestCase):
    def test_plugin_version_surfaces_are_aligned(self) -> None:
        # The skills and MCP (plugins and Python core) share VERSION; the desktop app has its own version.
        expected = Path("VERSION").read_text(encoding="utf-8").strip()
        self.assertRegex(expected, r"^\d+\.\d+\.\d+$")
        self.assertEqual(__version__, expected)
        self.assertEqual(mcp_server.SERVER_VERSION, expected)

        pyproject_version = ""
        for line in Path("pyproject.toml").read_text(encoding="utf-8").splitlines():
            if line.startswith("version = "):
                pyproject_version = line.split("=", 1)[1].strip().strip('"')
                break
        self.assertEqual(pyproject_version, expected)

        codex_plugin = json.loads(
            Path("plugins/codex/meridian/.codex-plugin/plugin.json").read_text(encoding="utf-8")
        )
        claude_plugin = json.loads(
            Path("plugins/claude-code/meridian/.claude-plugin/plugin.json").read_text(encoding="utf-8")
        )
        agent_plugin = json.loads(Path("plugins/agent/meridian/plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(codex_plugin["version"], expected)
        self.assertEqual(claude_plugin["version"], expected)
        self.assertEqual(agent_plugin["version"], expected)

        exit_code, stdout, stderr = _run_cli_capture(["--version"])
        self.assertEqual(exit_code, 0, stderr)
        self.assertEqual(stdout.strip(), f"meridian {expected}")

    def test_desktop_app_version_surfaces_are_aligned(self) -> None:
        desktop = json.loads(Path("apps/desktop/package.json").read_text(encoding="utf-8"))["version"]
        self.assertRegex(desktop, r"^\d+\.\d+\.\d+$")
        lock = json.loads(Path("package-lock.json").read_text(encoding="utf-8"))
        self.assertEqual(lock["packages"]["apps/desktop"]["version"], desktop)

    def test_python_module_entrypoints_execute_cli_main(self) -> None:
        env = os.environ.copy()
        src_path = str((Path.cwd() / "src").resolve())
        env["PYTHONPATH"] = src_path if not env.get("PYTHONPATH") else f"{src_path}{os.pathsep}{env['PYTHONPATH']}"

        meridian = subprocess.run(
            [sys.executable, "-m", "meridian", "--version"],
            cwd=Path.cwd(),
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        cli_module = subprocess.run(
            [sys.executable, "-m", "meridian.cli", "--version"],
            cwd=Path.cwd(),
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        cli_help = subprocess.run(
            [sys.executable, "-m", "meridian.cli", "wiki", "--help"],
            cwd=Path.cwd(),
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(meridian.returncode, 0, meridian.stderr)
        self.assertEqual(meridian.stdout.strip(), f"meridian {__version__}")
        self.assertEqual(cli_module.returncode, 0, cli_module.stderr)
        self.assertEqual(cli_module.stdout.strip(), f"meridian {__version__}")
        self.assertEqual(cli_help.returncode, 0, cli_help.stderr)
        self.assertIn("usage: meridian wiki", cli_help.stdout)

    def test_wiki_status_reports_active_workspace_and_core(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_home = root / "config"
            library = root / "paper-library"
            status_json = root / "status.json"

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                self.assertEqual(main(["wiki", "init", "--library-root", str(library)]), 0)
                exit_code, stdout, stderr = _run_cli_capture(
                    ["wiki", "status", "--json-out", str(status_json)]
                )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Workspace status: configured", stdout)
            self.assertIn("Active wiki root:", stdout)
            self.assertIn("Managed source root:", stdout)
            payload = json.loads(status_json.read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "configured")
            self.assertEqual(Path(payload["wiki_root"]).resolve(), (library / "wiki").resolve())
            self.assertEqual(Path(payload["source_root"]).resolve(), (library / "sources").resolve())
            self.assertIn("repo-local PYTHONPATH=<repo>/src python3 -m meridian", payload["resolver_order"])

    def test_mcp_json_bridge_context_reports_needs_init_without_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "empty-config"
            exit_code, stdout, stderr = _run_mcp_adapter_capture(
                ["context", "--query", "agent workflow goals"],
                env={"MERIDIAN_CONFIG_HOME": str(config_home)},
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("needs_init", stderr)
        self.assertIn("meridian wiki init --library-root", stderr)

    def test_product_wiki_skill_uses_reliable_context_entry(self) -> None:
        for root in (CODEX_PLUGIN_SKILL_ROOT, CLAUDE_PLUGIN_SKILL_ROOT):
            skill = root / "wiki/SKILL.md"
            self.assertTrue(skill.exists())
            text = skill.read_text(encoding="utf-8")
            self.assertIn("meridian.mcp context", text)
            self.assertIn("meridian wiki status", text)
            self.assertIn("MERIDIAN_CORE_ROOT", text)
            self.assertIn("do not\nstart with broad `rg`", text)
            self.assertIn("What owns the Wiki", text)
            self.assertIn("never imports a paper, never creates or restructures\nan aggregation", text)
            self.assertIn("meridian.wiki_propose", text)
            self.assertIn("meridian.wiki_proposal_status", text)
            self.assertIn("Never send any other kind of op; the tool rejects it", text)

    def test_product_wiki_skill_documents_audit_signals(self) -> None:
        for root in (CODEX_PLUGIN_SKILL_ROOT, CLAUDE_PLUGIN_SKILL_ROOT, AGENT_PLUGIN_SKILL_ROOT):
            text = (root / "wiki/SKILL.md").read_text(encoding="utf-8")
            self.assertIn("Audit / Signals", text)
            self.assertIn("open-conflict", text)
            self.assertIn("cannot repair or restructure the wiki", text)

    def test_meridian_setup_skill_exists(self) -> None:
        skill = CODEX_PLUGIN_SKILL_ROOT / "meridian/SKILL.md"
        self.assertTrue(skill.exists())
        text = skill.read_text(encoding="utf-8")
        self.assertIn("Entry Boundary", text)
        self.assertIn("Status Check", text)
        self.assertIn("Initialize", text)
        self.assertIn("Migration Check", text)
        self.assertIn("python -m meridian wiki status", text)
        self.assertIn("meridian-wiki.json", text)
        self.assertIn("needs_migration", text)
        self.assertIn("needs_lab_init", text)
        self.assertIn("Lab state separately", text)
        self.assertIn("minimal Lab skeleton", text)
        self.assertIn("create the minimal Lab skeleton during setup", text)
        self.assertIn("Do not report overall `ready`", text)
        self.assertIn("This is setup initialization, not a Lab workflow", text)
        self.assertIn("It must not create thread", text)
        self.assertIn("plugin cache/manifest", text)
        self.assertIn("workspace schema", text)
        self.assertIn("delegate those to wiki and lab", text)
        self.assertIn("hand off to the normal coding workflow", text)
        self.assertIn("unreadable `lab/SKILL.md` path", text)
        self.assertIn("remembered Lab semantics", text)
        self.assertIn("coding-style profile", text)
        self.assertIn("Coding Style Feedback Gate", text)
        self.assertIn("MERIDIAN_CONFIG_HOME", text)
        self.assertIn("~/.meridian/", text)
        self.assertIn("coding-style.md", text)
        self.assertIn("research-agent-principles.md", text)
        self.assertNotIn("wants to ingest, retrieve, code, or record experiments", text)

    def test_setup_doctor_skill_and_docs_policy_is_documented(self) -> None:
        meridian = (CODEX_PLUGIN_SKILL_ROOT / "meridian/SKILL.md").read_text(encoding="utf-8")
        lab = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        wiki = (CODEX_PLUGIN_SKILL_ROOT / "wiki/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("python -m meridian setup doctor", meridian)
        self.assertIn("python -m meridian setup repair-mcp", meridian)
        self.assertIn("skill_visible_but_mcp_unavailable", meridian)
        self.assertIn("no_valid_meridian_runtime", meridian)
        self.assertIn("paper_wiki_grounding", lab)
        self.assertIn("fallback_grounding", lab)
        self.assertIn("repair_available", lab)
        self.assertIn("external_primary_sources_only_after_explicit_user_choice", lab)
        self.assertIn("Use Wiki blocked", wiki)
        self.assertIn("do not\nanswer from web search or broad file search", wiki)

    def test_meridian_product_skill_behavior_boundaries(self) -> None:
        meridian = (CODEX_PLUGIN_SKILL_ROOT / "meridian/SKILL.md").read_text(encoding="utf-8")
        wiki = (CODEX_PLUGIN_SKILL_ROOT / "wiki/SKILL.md").read_text(encoding="utf-8")
        lab = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("Entry Boundary", meridian)
        self.assertIn("Framework Check", meridian)
        self.assertIn("python -m meridian framework-check", meridian)
        self.assertIn("If the user asks to ingest, retrieve, answer from papers", meridian)
        self.assertIn("Do not continue the normal work", meridian)
        self.assertIn("inside this setup skill after the setup issue is resolved", meridian)
        self.assertIn("Report Paper Wiki/plugin state", meridian)
        self.assertIn("Lab state separately", meridian)
        self.assertIn("needs_lab_init", meridian)
        self.assertIn("create the minimal Lab skeleton during setup", meridian)
        self.assertIn("Do not defer this to `lab`", meridian)
        self.assertIn("unreadable `lab/SKILL.md` path", meridian)
        self.assertIn("plugin path drift", meridian)
        self.assertIn("code implementation, debugging, tests, commits, release, or", meridian)
        self.assertIn("hand off to the normal coding workflow", meridian)
        self.assertIn("coding-style profile", meridian)
        self.assertIn("Coding Style Feedback Gate", meridian)
        self.assertNotIn("wants to ingest, retrieve, code, or record experiments", meridian)

        self.assertIn("Behavior Priority", wiki)
        self.assertIn("Start from the user's intent, not from CLI discovery", wiki)
        self.assertIn("do not present raw command lists", wiki)
        self.assertIn("product answer", wiki)
        self.assertIn("Agent execution resolver", wiki)
        self.assertNotIn("MCP server entry:", wiki)

        self.assertIn("Behavior Priority", lab)
        self.assertIn("Lab-First Routing Gate", lab)
        self.assertIn("When the target repo has `.meridian/`, default to Lab-first preflight", lab)
        self.assertIn("Research Project Grounding Gate", lab)
        self.assertIn("For idea-related requests, Lab must first check the research graph and Paper Wiki", lab)
        self.assertIn("For research-coding requests, Lab must check Paper Wiki papers and open-source implementation", lab)
        self.assertIn("For ongoing work, Lab must place it under the correct research node", lab)
        self.assertIn("lab_route: use", lab)
        self.assertIn("lab_route: skip", lab)
        self.assertIn("Pure mechanical engineering may skip Lab", lab)
        self.assertIn("research development requests must not bypass Lab", lab)
        self.assertIn("Runtime Load Boundary", lab)
        self.assertIn("Do not continue from remembered Lab semantics", lab)
        self.assertIn("Lab is not a coding agent", lab)
        self.assertIn("Research Grounding Injection", lab)
        self.assertIn("User Coding Style Principles", lab)
        self.assertIn("Coding Style Feedback Gate", lab)
        self.assertIn("record_user_level_principle", lab)
        self.assertIn("ask_whether_to_record", lab)
        self.assertIn("Do not use for code implementation", lab)

    def test_meridian_plugin_skill_copies_match_repo_skills(self) -> None:
        for skill_name in PRODUCT_SKILL_NAMES:
            agent = (AGENT_PLUGIN_SKILL_ROOT / skill_name / "SKILL.md").read_text(encoding="utf-8")
            codex = (CODEX_PLUGIN_SKILL_ROOT / skill_name / "SKILL.md").read_text(encoding="utf-8")
            claude = (CLAUDE_PLUGIN_SKILL_ROOT / skill_name / "SKILL.md").read_text(encoding="utf-8")
            self.assertEqual(agent, codex, skill_name)
            self.assertEqual(claude, codex, skill_name)

    def test_meridian_plugin_skill_frontmatter_is_loader_safe(self) -> None:
        for root in (AGENT_PLUGIN_SKILL_ROOT, CODEX_PLUGIN_SKILL_ROOT, CLAUDE_PLUGIN_SKILL_ROOT):
            for skill_name in PRODUCT_SKILL_NAMES:
                skill = root / skill_name / "SKILL.md"
                text = skill.read_text(encoding="utf-8")
                self.assertTrue(text.startswith("---\n"), str(skill))
                frontmatter = text.split("---", 2)[1]
                fields = {}
                for line in frontmatter.splitlines():
                    if ": " in line:
                        key, value = line.split(": ", 1)
                        fields[key] = value
                self.assertEqual(skill_name, fields.get("name"), str(skill))
                description = fields.get("description", "")
                self.assertTrue(description, str(skill))
                if ": " in description:
                    self.assertTrue(
                        (description.startswith('"') and description.endswith('"'))
                        or (description.startswith("'") and description.endswith("'")),
                        f"{skill} has a description with ': ' that must be quoted for YAML loaders",
                    )

    def test_product_skills_route_health_findings(self) -> None:
        wiki = (CODEX_PLUGIN_SKILL_ROOT / "wiki/SKILL.md").read_text(encoding="utf-8")
        lab = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("Audit / Signals", wiki)
        self.assertIn("thin-aggregation", wiki)
        self.assertIn("claim-without-evidence", wiki)
        self.assertIn("Wiki Health Signals", lab)

    def test_framework_check_reports_stable_categories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake_home = Path(tmp) / "home"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(Path(tmp) / "config")}):
                with patch.object(Path, "home", return_value=fake_home):
                    report = run_framework_check(project_root=Path.cwd())

        self.assertEqual(report.to_dict()["schema_version"], "meridian.framework_check.v0")
        self.assertEqual([category.name for category in report.categories], FRAMEWORK_CHECK_CATEGORIES)
        category_status = {category.name: category.status for category in report.categories}
        self.assertEqual(category_status["Product Surface"], "pass")
        self.assertEqual(category_status["Plugin Bundle"], "pass")
        self.assertEqual(category_status["Runtime"], "pass")
        self.assertEqual(category_status["Workspace"], "pass")
        self.assertEqual(category_status["Lab State"], "pass")

        info_codes = {
            finding.code
            for category in report.categories
            for finding in category.findings
            if finding.severity == "info"
        }
        self.assertIn("workspace_not_configured", info_codes)
        self.assertIn("lab_state_not_checked", info_codes)
        self.assertIn("lab_skill_path_readable", info_codes)
        self.assertIn("coding_style_profile_missing", info_codes)

    def test_framework_check_include_mcp_runtime_adds_setup_findings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake_home = Path(tmp) / "home"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(Path(tmp) / "config")}):
                with patch.object(Path, "home", return_value=fake_home):
                    report = run_framework_check(project_root=Path.cwd(), include_mcp_runtime=True)

        category_names = [category.name for category in report.categories]
        self.assertEqual(category_names[: len(FRAMEWORK_CHECK_CATEGORIES)], FRAMEWORK_CHECK_CATEGORIES)
        self.assertEqual(category_names[-1], MCP_RUNTIME_CATEGORY)
        mcp_runtime = next(category for category in report.categories if category.name == MCP_RUNTIME_CATEGORY)
        self.assertGreaterEqual(len(mcp_runtime.findings), 1)

    def test_framework_check_mcp_runtime_translates_setup_findings(self) -> None:
        fake_report = types.SimpleNamespace(
            findings=[
                {
                    "severity": "critical",
                    "client": "codex",
                    "code": "skill_visible_but_mcp_unavailable",
                    "message": "launcher failed",
                    "next_action": "repair codex",
                },
                {
                    "severity": "degraded",
                    "client": "claude",
                    "code": "needs_plugin_install",
                    "message": "cache missing",
                    "next_action": "install claude",
                },
            ]
        )
        with patch("meridian.framework_check.build_setup_doctor_report", return_value=fake_report):
            report = run_framework_check(project_root=Path.cwd(), include_mcp_runtime=True)

        mcp_runtime = next(category for category in report.categories if category.name == MCP_RUNTIME_CATEGORY)
        by_code = {finding.code: finding for finding in mcp_runtime.findings}
        self.assertEqual(by_code["skill_visible_but_mcp_unavailable"].severity, "critical")
        self.assertEqual(by_code["skill_visible_but_mcp_unavailable"].message, "codex: launcher failed")
        self.assertEqual(by_code["needs_plugin_install"].severity, "degraded")
        self.assertEqual(by_code["needs_plugin_install"].message, "claude: cache missing")

    def test_framework_check_mcp_runtime_reports_ready_when_setup_has_no_findings(self) -> None:
        fake_report = types.SimpleNamespace(findings=[])
        with patch("meridian.framework_check.build_setup_doctor_report", return_value=fake_report):
            report = run_framework_check(project_root=Path.cwd(), include_mcp_runtime=True)

        mcp_runtime = next(category for category in report.categories if category.name == MCP_RUNTIME_CATEGORY)
        self.assertEqual(mcp_runtime.status, "pass")
        self.assertEqual(len(mcp_runtime.findings), 1)
        self.assertEqual(mcp_runtime.findings[0].severity, "info")
        self.assertEqual(mcp_runtime.findings[0].code, "mcp_runtime_ready")

    def test_setup_runtime_resolver_selects_sys_executable(self) -> None:
        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            joined = " ".join(argv)
            if "import sys, meridian" in joined:
                return CommandResult(0, f"C:/Python/python.exe\n{__version__}\n", "")
            if "-m meridian.mcp --help" in joined:
                return CommandResult(0, "usage: python -m meridian.mcp", "")
            if "-m meridian.mcp capabilities --detail summary" in joined:
                return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
            return CommandResult(1, "", f"unexpected argv: {argv}")

        candidates = [
            RuntimeCandidate(
                label="current Python",
                command="C:/Python/python.exe",
                args_prefix=[],
                source="sys_executable",
            )
        ]

        report = resolve_meridian_runtime(candidates=candidates, runner=runner)

        self.assertIsNotNone(report.selected)
        self.assertEqual(report.selected.command, "C:/Python/python.exe")
        self.assertTrue(report.selected.import_ok)
        self.assertTrue(report.selected.mcp_help_ok)
        self.assertTrue(report.selected.capabilities_ok)
        self.assertEqual(report.selected.version, __version__)

    def test_setup_runtime_resolver_rejects_missing_python3(self) -> None:
        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            return CommandResult(127, "", "python3: command not found")

        candidates = [
            RuntimeCandidate(label="python3", command="python3", args_prefix=[], source="path")
        ]

        report = resolve_meridian_runtime(candidates=candidates, runner=runner)

        self.assertIsNone(report.selected)
        self.assertEqual(report.candidates[0].error_code, "mcp_launcher_command_not_found")
        self.assertFalse(report.candidates[0].exists)

    def test_setup_runtime_resolver_prefers_valid_meridian_python_env(self) -> None:
        calls: list[list[str]] = []

        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            calls.append(argv)
            if argv[0] == "C:/bad/python.exe":
                return CommandResult(0, "C:/bad/python.exe\n", "No module named meridian")
            if argv[0] == "C:/good/python.exe" and "-c" in argv:
                return CommandResult(0, f"C:/good/python.exe\n{__version__}\n", "")
            if argv[0] == "C:/good/python.exe" and "--help" in argv:
                return CommandResult(0, "usage: python -m meridian.mcp", "")
            if argv[0] == "C:/good/python.exe" and "capabilities" in argv:
                return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
            return CommandResult(1, "", f"unexpected argv: {argv}")

        candidates = [
            RuntimeCandidate(label="current Python", command="C:/bad/python.exe", args_prefix=[], source="sys_executable"),
            RuntimeCandidate(label="MERIDIAN_PYTHON", command="C:/good/python.exe", args_prefix=[], source="env"),
        ]

        report = resolve_meridian_runtime(candidates=candidates, runner=runner)

        self.assertEqual(report.selected.command, "C:/good/python.exe")
        self.assertEqual(report.candidates[0].error_code, "mcp_launcher_import_failed")
        self.assertGreaterEqual(len(calls), 4)

    def test_setup_runtime_resolver_default_candidates_respects_empty_env_override(self) -> None:
        with patch.dict(os.environ, {"MERIDIAN_PYTHON": "C:/ignored/python"}):
            candidates = default_runtime_candidates(env={})

        self.assertFalse(any(candidate.source == "env" for candidate in candidates))
        self.assertFalse(any(candidate.label == "MERIDIAN_PYTHON" for candidate in candidates))

    def test_setup_runtime_resolver_empty_candidates_does_not_probe(self) -> None:
        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            raise AssertionError(f"runner was called unexpectedly: {argv}")

        report = resolve_meridian_runtime(candidates=[], runner=runner)

        self.assertIsNone(report.selected)
        self.assertEqual(report.candidates, [])

    def test_setup_client_inspector_finds_codex_and_claude_caches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            for package, manifest_dir in [
                ("plugins/codex/meridian", ".codex-plugin"),
                ("plugins/claude-code/meridian", ".claude-plugin"),
            ]:
                package_root = root / package
                (package_root / manifest_dir).mkdir(parents=True)
                (package_root / manifest_dir / "plugin.json").write_text(
                    json.dumps({"name": "meridian", "version": __version__}),
                    encoding="utf-8",
                )
            for cache_root in [
                home / ".codex/plugins/cache/meridian/meridian" / __version__,
                home / ".claude/plugins/cache/meridian/meridian" / __version__,
            ]:
                (cache_root / "skills/meridian").mkdir(parents=True)
                (cache_root / "skills/wiki").mkdir(parents=True)
                (cache_root / "skills/lab").mkdir(parents=True)
                for skill in ["meridian", "wiki", "lab"]:
                    (cache_root / "skills" / skill / "SKILL.md").write_text(
                        f"# {skill}\n",
                        encoding="utf-8",
                    )
                (cache_root / ".mcp.json").write_text(
                    json.dumps(
                        {
                            "mcpServers": {
                                "meridian-paper-wiki": {
                                    "command": "python3",
                                    "args": ["-m", "meridian.mcp", "serve"],
                                }
                            }
                        }
                    ),
                    encoding="utf-8",
                )

            installs = {
                item.client: item for item in inspect_client_installs(project_root=root, home=home, clients=["codex", "claude"])
            }

        self.assertEqual(installs["codex"].cache_state, "installed")
        self.assertEqual(installs["claude"].cache_state, "installed")
        self.assertEqual(installs["codex"].skills["lab"], "readable")
        self.assertEqual(installs["codex"].configured_server["command"], "python3")

    def test_setup_client_inspector_reports_missing_plugin_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            installs = inspect_client_installs(
                project_root=Path(tmp) / "project",
                home=Path(tmp) / "home",
                clients=["codex"],
            )

        self.assertEqual(installs[0].client, "codex")
        self.assertEqual(installs[0].cache_state, "missing")
        self.assertIsNone(installs[0].mcp_config_path)

    def test_setup_client_inspector_allows_empty_client_list(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            installs = inspect_client_installs(project_root=Path(tmp) / "project", home=Path(tmp) / "home", clients=[])

        self.assertEqual(installs, [])

    def test_setup_client_inspector_accepts_positional_project_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"

            installs = inspect_client_installs(root, home=home, clients=["codex"])

        self.assertEqual(installs[0].client, "codex")

    def test_setup_client_inspector_malformed_mcp_server_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            (cache_root / "skills/meridian").mkdir(parents=True)
            (cache_root / "skills/wiki").mkdir(parents=True)
            (cache_root / "skills/lab").mkdir(parents=True)
            for skill in ["meridian", "wiki", "lab"]:
                (cache_root / "skills" / skill / "SKILL.md").write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": ["not", "pairs"],
                        }
                    }
                ),
                encoding="utf-8",
            )

            installs = inspect_client_installs(project_root=root, home=home, clients=["codex"])

        self.assertIsNone(installs[0].configured_server)
        self.assertEqual(installs[0].cache_state, "installed")
        self.assertIsNotNone(installs[0].error)

    def test_setup_client_inspector_reports_mcp_server_missing_launcher_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            (cache_root / "skills/meridian").mkdir(parents=True)
            (cache_root / "skills/wiki").mkdir(parents=True)
            (cache_root / "skills/lab").mkdir(parents=True)
            for skill in ["meridian", "wiki", "lab"]:
                (cache_root / "skills" / skill / "SKILL.md").write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            installs = inspect_client_installs(project_root=root, home=home, clients=["codex"])

        self.assertIsNone(installs[0].configured_server)
        self.assertIsNotNone(installs[0].error)

    def test_setup_doctor_cli_writes_json_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            home = Path(tmp) / "home"
            json_out = root / "setup.json"
            root.mkdir(exist_ok=True)

            with patch.object(Path, "home", return_value=home):
                exit_code, stdout, stderr = _run_cli_capture(
                    [
                        "setup",
                        "doctor",
                        "--client",
                        "codex",
                        "--project-root",
                        str(root),
                        "--json-out",
                        str(json_out),
                    ]
                )

            self.assertIn(exit_code, {0, 1})
            self.assertEqual(stderr, "")
            self.assertTrue(stdout.startswith("Meridian setup doctor:"))
            self.assertTrue(json_out.exists())
            self.assertIn("status", json.loads(json_out.read_text(encoding="utf-8")))

    def test_setup_repair_mcp_cli_dry_run_does_not_apply(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            mcp_path = cache_root / ".mcp.json"
            original = {"mcpServers": {"meridian-paper-wiki": {"args": ["-m", "meridian.mcp", "serve"]}}
            }
            mcp_path.write_text(json.dumps(original), encoding="utf-8")

            with patch.object(Path, "home", return_value=home):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "repair-mcp", "--client", "codex", "--project-root", str(root)]
                )
            original_text = mcp_path.read_text(encoding="utf-8")

        self.assertIn(exit_code, {0, 1})
        self.assertEqual(stderr, "")
        self.assertIn("Planned repair:", stdout)
        self.assertIn("No files changed. Re-run with --apply.", stdout)
        self.assertEqual(json.loads(original_text), original)

    def test_setup_repair_mcp_cli_no_files_changed_message_is_dry_run_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            root.mkdir(parents=True, exist_ok=True)
            home = Path(tmp) / "home"

            with patch.object(Path, "home", return_value=home):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "repair-mcp", "--client", "codex", "--project-root", str(root)]
                )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stderr, "")
        self.assertIn("No MCP repair is available.", stdout)
        self.assertNotIn("No files changed. Re-run with --apply.", stdout)

    def test_setup_init_lab_cli_initializes_user_contract_and_lab_ready_repo(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "research-repo"
            config_home = Path(tmp) / "config"
            root.mkdir()
            (root / "AGENTS.md").write_text("# Existing Rules\n\nKeep this project rule.\n", encoding="utf-8")

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "init-lab", "--lab-root", str(root)]
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(stderr, "")
            self.assertIn("Meridian Lab setup: ready", stdout)
            self.assertIn("coding-style.md", stdout)
            self.assertIn("research-agent-principles.md", stdout)
            self.assertTrue((config_home / "coding-style.md").exists())
            self.assertTrue((config_home / "research-agent-principles.md").exists())
            agents = (root / "AGENTS.md").read_text(encoding="utf-8")
            self.assertIn("Keep this project rule.", agents)
            self.assertIn("MERIDIAN RESEARCH AGENT CONTRACT START", agents)
            self.assertEqual(validate_lab_space(root).status, "pass")

    def test_setup_init_lab_cli_reports_existing_lab_state_blockers_without_overwriting_threads(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "research-repo"
            config_home = Path(tmp) / "config"
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            (lab / "state.md").write_text(
                "---\ntype: lab-state\nactive_thread: direction\n---\n# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            thread = lab / "threads/direction.md"
            original_thread = "# Direction\n\nExisting research notes stay untouched.\n"
            thread.write_text(original_thread, encoding="utf-8")

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "init-lab", "--lab-root", str(root)]
                )

            self.assertEqual(exit_code, 1)
            self.assertEqual(stderr, "")
            self.assertIn("Meridian Lab setup: needs_manual_repair", stdout)
            self.assertIn("invalid_thread_type", stdout)
            self.assertIn("thread_without_nodes", stdout)
            self.assertTrue((root / "AGENTS.md").exists())
            self.assertTrue((config_home / "coding-style.md").exists())
            self.assertTrue((config_home / "research-agent-principles.md").exists())
            self.assertEqual(thread.read_text(encoding="utf-8"), original_thread)

    def test_setup_init_lab_cli_accepts_meridian_directory_as_lab_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "research-repo"
            config_home = Path(tmp) / "config"
            lab = root / ".meridian"

            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                exit_code, stdout, stderr = _run_cli_capture(
                    ["setup", "init-lab", "--lab-root", str(lab)]
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(stderr, "")
            self.assertIn("Meridian Lab setup: ready", stdout)
            self.assertTrue((root / "AGENTS.md").exists())
            self.assertIn("MERIDIAN RESEARCH AGENT CONTRACT START", (root / "AGENTS.md").read_text(encoding="utf-8"))

    def test_setup_repair_mcp_cli_apply_writes_target_and_backup(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            mcp_path = cache_root / ".mcp.json"
            original_text = '{"mcpServers": {"meridian-paper-wiki": '
            mcp_path.write_text(original_text, encoding="utf-8")
            json_out = root / "repair.json"

            with patch.object(Path, "home", return_value=home):
                exit_code, stdout, stderr = _run_cli_capture(
                    [
                        "setup",
                        "repair-mcp",
                        "--client",
                        "codex",
                        "--project-root",
                        str(root),
                        "--apply",
                        "--json-out",
                        str(json_out),
                    ]
                )
            self.assertEqual(exit_code, 0)
            self.assertEqual(stderr, "")
            self.assertTrue(json_out.exists())
            backups = [path for path in mcp_path.parent.iterdir() if path.name.startswith(".mcp.json.bak-")]
            self.assertTrue(backups)
            self.assertEqual(backups[0].read_text(encoding="utf-8"), original_text)
            self.assertIn("Applied repair:", stdout)
            self.assertIn("- MCP config updated", stdout)
            self.assertIn("- restart required: yes", stdout)
            self.assertEqual(
                json.loads(mcp_path.read_text(encoding="utf-8"))["mcpServers"]["meridian-paper-wiki"]["args"],
                ["-m", "meridian.mcp", "serve"],
            )
            repair_payload = json.loads(json_out.read_text(encoding="utf-8"))
            self.assertEqual(repair_payload["applied"], True)

    def test_setup_doctor_reports_repair_available_for_skill_visible_mcp_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "command": "python3",
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
                if argv[0] == sys.executable and "-c" in argv:
                    return CommandResult(0, f"{sys.executable}\n{__version__}\n", "")
                if argv[0] == sys.executable and "--help" in argv:
                    return CommandResult(0, "usage: python -m meridian.mcp", "")
                if argv[0] == sys.executable and "capabilities" in argv:
                    return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
                if argv[0] == "python3":
                    return CommandResult(127, "", "python3: command not found")
                return CommandResult(1, "", f"unexpected argv: {argv}")

            report = build_setup_doctor_report(project_root=root, home=home, clients=["codex"], runner=runner)

        self.assertEqual(report.status, "repair_available")
        self.assertIn("skill_visible_but_mcp_unavailable", {finding["code"] for finding in report.findings})
        self.assertIn("mcp_repair_available", {finding["code"] for finding in report.findings})
        self.assertIn("repair_available", format_setup_doctor(report))

    def test_setup_doctor_reports_runner_calls_timeout_for_mcp_smoke(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "command": "python3",
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            def runner(argv: list[str], timeout: float) -> CommandResult:
                if argv[0] == sys.executable and "-c" in argv:
                    return CommandResult(0, f"{sys.executable}\n{__version__}\n", "")
                if argv[0] == sys.executable and "--help" in argv and timeout == 10.0:
                    return CommandResult(0, "usage: python -m meridian.mcp", "")
                if argv[0] == sys.executable and "capabilities" in argv and timeout == 10.0:
                    return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
                if argv[0] == "python3" and "--help" in argv and timeout == 10.0:
                    return CommandResult(127, "", "python3: command not found")
                if argv[0] == "python3":
                    return CommandResult(127, "", "python3: command not found")
                return CommandResult(1, "", f"unexpected argv/timeout: {argv}/{timeout}")

            report = build_setup_doctor_report(project_root=root, home=home, clients=["codex"], runner=runner)

        self.assertEqual(report.status, "repair_available")
        self.assertIn("skill_visible_but_mcp_unavailable", {finding["code"] for finding in report.findings})

    def test_setup_doctor_reports_repair_for_malformed_mcp_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            def runner(argv: list[str], timeout: float) -> CommandResult:
                if argv[0] == sys.executable and "-c" in argv:
                    return CommandResult(0, f"{sys.executable}\n{__version__}\n", "")
                if argv[0] == sys.executable and "--help" in argv:
                    return CommandResult(0, "usage: python -m meridian.mcp", "")
                if argv[0] == sys.executable and "capabilities" in argv:
                    return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
                return CommandResult(1, "", f"unexpected argv: {argv}")

            report = build_setup_doctor_report(project_root=root, home=home, clients=["codex"], runner=runner)

        self.assertEqual(report.status, "repair_available")
        codes = {finding["code"] for finding in report.findings}
        self.assertIn("mcp_required_tool_missing", codes)
        self.assertIn("mcp_repair_available", codes)
        self.assertEqual(len(report.repair_plan), 1)
        self.assertEqual(report.repair_plan[0].client, "codex")
        self.assertEqual(report.repair_plan[0].command, sys.executable)

    def test_setup_repair_mcp_dry_run_writes_no_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original = {
                "mcpServers": {
                    "meridian-paper-wiki": {
                        "command": "python3",
                        "args": ["-m", "meridian.mcp", "serve"],
                    }
                }
            }
            mcp_path.write_text(json.dumps(original), encoding="utf-8")
            action = plan_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
            )
            self.assertEqual(json.loads(mcp_path.read_text(encoding="utf-8")), original)
            self.assertEqual(action.client, "codex")
            self.assertEqual(action.target, mcp_path)

    def test_setup_repair_mcp_apply_writes_backup_and_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mcp_path = root / ".mcp.json"
            original_payload = {
                "top": "preserve-me",
                "mcpServers": {
                    "meridian-paper-wiki": {
                        "icons": [{"src": "./assets/meridian-mark.svg", "mimeType": "image/svg+xml"}],
                        "command": "python3",
                        "args": ["-m", "meridian.mcp", "serve"],
                    }
                },
            }
            mcp_path.write_text(
                json.dumps(original_payload),
                encoding="utf-8",
            )
            original_text = mcp_path.read_text(encoding="utf-8")

            result = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            updated = json.loads(mcp_path.read_text(encoding="utf-8"))
            self.assertTrue(result.applied)
            self.assertTrue(result.backup_path.exists())
            self.assertEqual(result.backup_path.read_text(encoding="utf-8"), original_text)
            server = updated["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "C:/Python/python.exe")
            self.assertEqual(server["icons"], [{"src": "./assets/meridian-mark.svg", "mimeType": "image/svg+xml"}])
            self.assertEqual(server["title"], "Meridian Paper Wiki")
            self.assertEqual(server["cwd"], ".")
            self.assertIn("source-grounded Paper Wiki context", server["description"])
            self.assertEqual(updated["top"], "preserve-me")

    def test_setup_repair_mcp_apply_rewrites_bad_mcp_servers_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original = {"top": "preserve-me", "mcpServers": None}
            mcp_path.write_text(json.dumps(original), encoding="utf-8")

            result = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            updated = json.loads(mcp_path.read_text(encoding="utf-8"))

            self.assertTrue(result.applied)
            self.assertTrue(result.backup_path.exists())
            self.assertEqual(updated["top"], "preserve-me")
            server = updated["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "C:/Python/python.exe")
            self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])
            self.assertEqual(server["title"], "Meridian Paper Wiki")
            self.assertEqual(server["cwd"], ".")

    def test_setup_repair_mcp_apply_rewrites_non_dict_root_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            mcp_path.write_text(json.dumps(["bad", "root"]), encoding="utf-8")

            result = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            updated = json.loads(mcp_path.read_text(encoding="utf-8"))

            self.assertTrue(result.applied)
            server = updated["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "C:/Python/python.exe")
            self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])
            self.assertEqual(server["title"], "Meridian Paper Wiki")
            self.assertEqual(server["cwd"], ".")

    def test_setup_repair_mcp_apply_rewrites_invalid_json_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original_text = '{"mcpServers": '
            mcp_path.write_text(original_text, encoding="utf-8")

            result = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            updated = json.loads(mcp_path.read_text(encoding="utf-8"))

            self.assertTrue(result.applied)
            self.assertEqual(result.backup_path.read_text(encoding="utf-8"), original_text)
            server = updated["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "C:/Python/python.exe")
            self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])
            self.assertEqual(server["title"], "Meridian Paper Wiki")
            self.assertEqual(server["cwd"], ".")

    def test_setup_repair_mcp_apply_keeps_claude_server_schema_minimal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original = {
                "mcpServers": {
                    "meridian-paper-wiki": {
                        "command": "python3",
                        "args": ["-m", "meridian.mcp", "serve"],
                    }
                }
            }
            mcp_path.write_text(json.dumps(original), encoding="utf-8")

            apply_mcp_repair(
                client="claude",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            server = json.loads(mcp_path.read_text(encoding="utf-8"))["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server, {"command": "C:/Python/python.exe", "args": ["-m", "meridian.mcp", "serve"]})

    def test_setup_repair_mcp_apply_timestamp_collision_generates_unique_backups(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original = {
                "mcpServers": {
                    "meridian-paper-wiki": {
                        "command": "python3",
                        "args": ["-m", "meridian.mcp", "serve"],
                    }
                }
            }
            mcp_path.write_text(json.dumps(original), encoding="utf-8")

            first = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )
            first_backup_text = first.backup_path.read_text(encoding="utf-8")

            second = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            self.assertNotEqual(first.backup_path, second.backup_path)
            self.assertEqual(first.backup_path.name, ".mcp.json.bak-20260615-153012")
            self.assertEqual(second.backup_path.name, ".mcp.json.bak-20260615-153012-1")
            self.assertTrue(first.backup_path.exists())
            self.assertTrue(second.backup_path.exists())
            self.assertEqual(first.backup_path.read_text(encoding="utf-8"), first_backup_text)

    def test_setup_doctor_reports_blocked_if_mixed_unrepairable_critical(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            codex_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            claude_root = home / ".claude/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = codex_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            (codex_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = claude_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            # leave claude_root/.mcp.json missing to create a non-repairable MCP config blocker

            def runner(argv: list[str], timeout: float) -> CommandResult:
                if argv[0] == sys.executable and "-c" in argv:
                    return CommandResult(0, f"{sys.executable}\n{__version__}\n", "")
                if argv[0] == sys.executable and "--help" in argv:
                    return CommandResult(0, "usage: python -m meridian.mcp", "")
                if argv[0] == sys.executable and "capabilities" in argv:
                    return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
                return CommandResult(1, "", f"unexpected argv: {argv}")

            report = build_setup_doctor_report(project_root=root, home=home, clients=["codex", "claude"], runner=runner)

        self.assertEqual(report.status, "blocked")
        codes = {finding["code"] for finding in report.findings}
        self.assertIn("mcp_repair_available", codes)
        self.assertIn("mcp_required_tool_missing", codes)
        repairable_clients = {action.client for action in report.repair_plan}
        self.assertIn("codex", repairable_clients)
        self.assertNotIn("claude", repairable_clients)

    def test_coding_style_profile_init_is_user_level_and_no_code_blocks(self) -> None:
        from meridian.lab import initialize_coding_style_profile, migrate_coding_style_profile, validate_coding_style_profile

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            profile_path = initialize_coding_style_profile(config_home=config_home)
            self.assertEqual(profile_path, (config_home / "coding-style.md").resolve())
            text = profile_path.read_text(encoding="utf-8")

            self.assertIn("schema_version: meridian.coding_style_profile.v1", text)
            self.assertIn("## Principles", text)
            self.assertIn("## Pending Review", text)
            self.assertIn("structured merge", text)
            self.assertIn("~/.meridian/code-ref/", text)
            self.assertIn("consider adding or referencing", text)
            self.assertNotIn("```", text)

            report = validate_coding_style_profile(profile_path)
            self.assertEqual(report.status, "pass", report.to_dict())

            profile_path.write_text(text + "\n## User Edit\n\nDo not overwrite me.\n", encoding="utf-8")
            rewritten = initialize_coding_style_profile(config_home=config_home)
            self.assertEqual(rewritten, profile_path)
            self.assertIn("Do not overwrite me.", profile_path.read_text(encoding="utf-8"))

            old_profile = config_home / "old-style.md"
            old_profile.write_text("# My Style\n\nKeep experiment scripts linear.\n", encoding="utf-8")
            migrated = migrate_coding_style_profile(path=old_profile)
            migrated_text = migrated.read_text(encoding="utf-8")
            self.assertIn("schema_version: meridian.coding_style_profile.v1", migrated_text)
            self.assertIn("## Principles", migrated_text)
            self.assertIn("## Pending Review", migrated_text)
            self.assertIn("structured merge", migrated_text)
            self.assertIn("Keep experiment scripts linear.", migrated_text)

    def test_research_agent_principles_init_migrate_and_validate(self) -> None:
        from meridian.lab import (
            RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION,
            initialize_research_agent_principles,
            migrate_research_agent_principles,
            research_agent_principles_path,
            validate_research_agent_principles,
        )

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            target = research_agent_principles_path(config_home=config_home)
            self.assertEqual(target, (config_home / "research-agent-principles.md").resolve())

            written = initialize_research_agent_principles(config_home=config_home)
            self.assertEqual(written, target)
            text = written.read_text(encoding="utf-8")
            self.assertIn(f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}", text)
            self.assertIn("Implementation Integrity", text)
            self.assertIn("Do not silently substitute", text)
            self.assertIn("Prefer linear, readable code", text)
            self.assertIn("## Profile Maintenance", text)
            self.assertIn("structured merge", text)
            self.assertIn("~/.meridian/code-ref/", text)
            self.assertIn("Do not append raw distillation notes", text)
            self.assertNotIn("```python", text)
            self.assertEqual(validate_research_agent_principles(written).status, "pass")

            old = config_home / "old-principles.md"
            old.write_text("# Existing Principles\n\nUser text stays.\n", encoding="utf-8")
            migrated = migrate_research_agent_principles(path=old)
            migrated_text = migrated.read_text(encoding="utf-8")
            self.assertIn("User text stays.", migrated_text)
            self.assertIn(f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}", migrated_text)
            self.assertIn("## Implementation Integrity", migrated_text)
            self.assertIn("## Research Code Style", migrated_text)
            self.assertIn("## Profile Maintenance", migrated_text)

    def test_coding_style_profile_points_to_research_agent_principles(self) -> None:
        from meridian.lab import initialize_coding_style_profile

        with tempfile.TemporaryDirectory() as tmp:
            profile = initialize_coding_style_profile(config_home=Path(tmp))
            text = profile.read_text(encoding="utf-8")
            self.assertIn("research-agent-principles.md", text)
            self.assertIn("compact", text.lower())

    def test_research_agent_principles_validate_reports_stale_contract_gaps(self) -> None:
        from meridian.lab import RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION, validate_research_agent_principles

        with tempfile.TemporaryDirectory() as tmp:
            principles = Path(tmp) / "research-agent-principles.md"
            principles.write_text(
                "\n".join(
                    [
                        "# Meridian Research Agent Principles",
                        "",
                        f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}",
                        "",
                        "## Research Code Style",
                        "",
                        "- Keep code readable.",
                        "",
                        "## Implementation Integrity",
                        "",
                        "- Do not silently substitute legacy behavior.",
                        "",
                        "```",
                        "print('too much code')",
                        "```",
                    ]
                ),
                encoding="utf-8",
            )

            report = validate_research_agent_principles(principles)

        self.assertEqual(report.status, "warn")
        codes = {finding.code for finding in report.findings}
        self.assertIn("research_agent_principles_validation_missing", codes)
        self.assertIn("research_agent_principles_linear_style_missing", codes)
        self.assertIn("research_agent_principles_contains_code_block", codes)

    def test_coding_style_feedback_gate_classifies_reusable_feedback(self) -> None:
        from meridian.lab import classify_coding_style_feedback

        strong = classify_coding_style_feedback(
            "For research code I want one linear function; do not split this into so many helper functions."
        )
        weak = classify_coding_style_feedback("This file is messy and hard to maintain.")
        bug_only = classify_coding_style_feedback("The loader crashes on an empty validation split.")

        self.assertEqual(strong.outcome, "record_user_level_principle")
        self.assertIn("research_code", strong.scopes)
        self.assertIn("helper", strong.reason)
        self.assertEqual(weak.outcome, "ask_whether_to_record")
        self.assertEqual(bug_only.outcome, "do_not_record_task_local_only")

    def test_framework_check_reports_coding_style_profile_state(self) -> None:
        from meridian.lab import initialize_coding_style_profile

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                missing = run_framework_check(project_root=Path.cwd())
                initialize_coding_style_profile(config_home=config_home)
                ready = run_framework_check(project_root=Path.cwd())

        missing_category = next(category for category in missing.categories if category.name == "User Profile")
        ready_category = next(category for category in ready.categories if category.name == "User Profile")
        self.assertIn("coding_style_profile_missing", {finding.code for finding in missing_category.findings})
        self.assertIn("coding_style_profile_ready", {finding.code for finding in ready_category.findings})

    def test_framework_check_reports_research_agent_principles_state(self) -> None:
        from meridian.lab import initialize_research_agent_principles

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                missing = run_framework_check(project_root=Path.cwd())
                initialize_research_agent_principles(config_home=config_home)
                ready = run_framework_check(project_root=Path.cwd())

        missing_category = next(category for category in missing.categories if category.name == "User Profile")
        ready_category = next(category for category in ready.categories if category.name == "User Profile")
        self.assertIn("research_agent_principles_missing", {finding.code for finding in missing_category.findings})
        self.assertIn("research_agent_principles_ready", {finding.code for finding in ready_category.findings})

    def test_meridian_setup_skill_mentions_research_agent_contract(self) -> None:
        codex = Path("plugins/codex/meridian/skills/meridian/SKILL.md").read_text(encoding="utf-8")
        claude = Path("plugins/claude-code/meridian/skills/meridian/SKILL.md").read_text(encoding="utf-8")
        for text in [codex, claude]:
            self.assertIn("research-agent-principles.md", text)
            self.assertIn("AGENTS.md", text)
            self.assertIn("setup init-lab", text)
            self.assertIn("Do not silently substitute", text)
            self.assertIn("MERIDIAN_CONFIG_HOME", text)

    def test_framework_check_reports_stale_research_agent_principles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            config_home.mkdir()
            (config_home / "research-agent-principles.md").write_text(
                "# Old Principles\n\nKeep this user text.\n",
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                report = run_framework_check(project_root=Path.cwd())

        user_profile = next(category for category in report.categories if category.name == "User Profile")
        by_code = {finding.code: finding for finding in user_profile.findings}
        finding = by_code.get("research_agent_principles_schema_missing") or by_code.get(
            "research_agent_principles_integrity_missing"
        )
        self.assertIsNotNone(finding)
        assert finding is not None
        self.assertEqual(finding.severity, "degraded")
        self.assertIn("migrate", finding.next_action)
        self.assertIn("without deleting user text", finding.next_action)

    def test_framework_check_reports_missing_and_ready_agents_contract_for_lab_root(self) -> None:
        from meridian.lab import inject_meridian_agents_contract

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            (lab / "state.md").write_text(
                "---\ntype: lab-state\nactive_thread: cache-retention\n---\n# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")

            missing = run_framework_check(project_root=Path.cwd(), lab_root=root)
            inject_meridian_agents_contract(root)
            ready = run_framework_check(project_root=Path.cwd(), lab_root=root)

        missing_category = next(category for category in missing.categories if category.name == "Lab State")
        ready_category = next(category for category in ready.categories if category.name == "Lab State")
        self.assertIn("agents_contract_missing", {finding.code for finding in missing_category.findings})
        self.assertIn("agents_contract_ready", {finding.code for finding in ready_category.findings})

    def test_framework_check_flags_user_style_profile_drift_inside_agents(self) -> None:
        from meridian.lab import initialize_lab_space, inject_meridian_agents_contract

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            initialize_lab_space(root)
            agents = root / "AGENTS.md"
            agents.write_text(
                agents.read_text(encoding="utf-8")
                + "\n## Meridian Coding Style Profile\n\n"
                + "- User-level style distilled from this repo should not live here.\n",
                encoding="utf-8",
            )
            inject_meridian_agents_contract(root)

            report = run_framework_check(project_root=Path.cwd(), lab_root=root)

        lab_category = next(category for category in report.categories if category.name == "Lab State")
        self.assertIn("style_profile_drift_in_agents", {finding.code for finding in lab_category.findings})

    def test_framework_check_reports_mcp_entrypoint_drift(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            for package, manifest_dir in [
                ("plugins/codex/meridian", ".codex-plugin"),
                ("plugins/claude-code/meridian", ".claude-plugin"),
            ]:
                package_root = root / package
                (package_root / manifest_dir).mkdir(parents=True)
                (package_root / ".mcp.json").write_text(
                    json.dumps(
                        {
                            "mcpServers": {
                                "meridian-paper-wiki": {
                                    "command": "python3",
                                    "args": ["-m", "meridian.mcp", "serve"],
                                }
                            }
                        }
                    ),
                    encoding="utf-8",
                )
                (package_root / manifest_dir / "plugin.json").write_text(
                    json.dumps({"name": "meridian", "version": __version__}),
                    encoding="utf-8",
                )
                for skill_name in ["meridian", "wiki", "lab"]:
                    skill = package_root / "skills" / skill_name / "SKILL.md"
                    skill.parent.mkdir(parents=True, exist_ok=True)
                    skill.write_text(f"---\nname: {skill_name}\n---\n# {skill_name}\n", encoding="utf-8")

            report = run_framework_check(project_root=root)

        bundle = next(category for category in report.categories if category.name == "Plugin Bundle")
        self.assertIn("mcp_config_entrypoint_drift", {finding.code for finding in bundle.findings})

    def test_lab_coding_style_profile_assets_parse(self) -> None:
        lab = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        meridian = (CODEX_PLUGIN_SKILL_ROOT / "meridian/SKILL.md").read_text(encoding="utf-8")
        injection = Path("src/meridian/templates/research-dev/research-grounding-injection.md").read_text(encoding="utf-8")

        for phrase in [
            "Coding Style Feedback Gate",
            "User Coding Style Principles",
            "record_user_level_principle",
            "ask_whether_to_record",
            "do_not_record_task_local_only",
            "Do not store full pasted code examples",
        ]:
            self.assertIn(phrase, lab)
        self.assertIn("coding-style profile", meridian)
        self.assertIn("## User Coding Style Principles", injection)
        self.assertIn("## Implementation Prior", injection)
        self.assertIn("## Coding Implication", injection)

    def test_research_grounding_injection_has_implementation_integrity_gate(self) -> None:
        injection = Path("src/meridian/templates/research-dev/research-grounding-injection.md").read_text(encoding="utf-8")
        codex_lab = Path("plugins/codex/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        claude_lab = Path("plugins/claude-code/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for text in [injection, codex_lab, claude_lab]:
            self.assertIn("Implementation Integrity Gate", text)
            self.assertIn("required current behavior", text)
            self.assertIn("fallback-only implementation", text)
            self.assertIn("blocker reporting", text)
            self.assertIn("validation", text)
            self.assertIn("must prove", text)
            self.assertIn("swallowed errors", text)
            self.assertTrue("placeholder/no-op" in text or "placeholder / no-op" in text)

        self.assertIn("benchmark or metric contract", injection)
        for skill in [codex_lab, claude_lab]:
            self.assertTrue("primary path" in skill or "primary requested path" in skill)
            self.assertIn("Do not let Lab implement the code", skill)

    def test_lab_documents_code_style_distillation_workflow(self) -> None:
        codex_lab = Path("plugins/codex/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        claude_lab = Path("plugins/claude-code/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for text in [codex_lab, claude_lab]:
            self.assertIn("Code Style Distillation", text)
            self.assertIn("confirmed_candidate", text)
            self.assertIn("repo_local", text)
            self.assertIn("insufficient_evidence", text)
            self.assertIn("Do not store full code blocks", text)
            self.assertIn("Do not write user coding-style sections into project `AGENTS.md`", text)
            self.assertIn("structured merge", text)
            self.assertIn("~/.meridian/code-ref/", text)
            self.assertIn("optional reference material", text)

    def test_lab_initialization_requires_deterministic_agents_contract_helper(self) -> None:
        codex_lab = Path("plugins/codex/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        claude_lab = Path("plugins/claude-code/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for text in [codex_lab, claude_lab]:
            self.assertIn("python -m meridian setup init-lab --lab-root <repo>", text)
            self.assertIn("Do not hand-write", text)
            self.assertIn("deterministic Meridian helper", text)
            self.assertIn("guarded Meridian research-agent contract block", text)

    def test_lab_skill_path_diagnostics_reports_readable_source_and_caches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            for package in ["plugins/codex/meridian", "plugins/claude-code/meridian"]:
                skill = root / package / "skills/lab/SKILL.md"
                skill.parent.mkdir(parents=True)
                skill.write_text("---\nname: lab\n---\n# Lab\n", encoding="utf-8")
            for cache in [
                home / ".codex/plugins/cache/meridian/meridian" / __version__,
                home / ".claude/plugins/cache/meridian/meridian" / __version__,
            ]:
                skill = cache / "skills/lab/SKILL.md"
                skill.parent.mkdir(parents=True)
                skill.write_text("---\nname: lab\n---\n# Lab\n", encoding="utf-8")

            records = {record["label"]: record for record in lab_skill_path_diagnostics(root, home=home)}

        self.assertEqual(records["source_codex"]["state"], "readable")
        self.assertEqual(records["source_claude"]["state"], "readable")
        self.assertEqual(records["codex_cache_current"]["state"], "readable")
        self.assertEqual(records["claude_cache_current"]["state"], "readable")
        self.assertNotIn("version_drift", {record["state"] for record in records.values()})

    def test_lab_skill_path_diagnostics_reports_unreadable_missing_and_version_drift(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            for package in ["plugins/codex/meridian", "plugins/claude-code/meridian"]:
                skill = root / package / "skills/lab/SKILL.md"
                skill.parent.mkdir(parents=True)
                skill.write_text("---\nname: lab\n---\n# Lab\n", encoding="utf-8")

            unreadable = home / ".codex/plugins/cache/meridian/meridian" / __version__ / "skills/lab/SKILL.md"
            unreadable.mkdir(parents=True)
            stale = home / ".claude/plugins/cache/meridian/meridian/0.1.0/skills/lab/SKILL.md"
            stale.parent.mkdir(parents=True)
            stale.write_text("---\nname: lab\n---\n# Old Lab\n", encoding="utf-8")

            records = {record["label"]: record for record in lab_skill_path_diagnostics(root, home=home)}

        self.assertEqual(records["codex_cache_current"]["state"], "unreadable")
        self.assertEqual(records["claude_cache_current"]["state"], "missing")
        self.assertEqual(records["claude_cache_latest"]["state"], "version_drift")
        self.assertEqual(records["claude_cache_latest"]["version"], "0.1.0")

    def test_framework_check_cli_writes_json_and_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            json_out = root / "framework.json"
            report_out = root / "framework.md"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(root / "config")}):
                with patch.object(Path, "home", return_value=root / "home"):
                    exit_code, stdout, stderr = _run_cli_capture(
                        [
                            "framework-check",
                            "--project-root",
                            str(Path.cwd()),
                            "--include-mcp-runtime",
                            "--json-out",
                            str(json_out),
                            "--report",
                            str(report_out),
                        ]
                    )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Framework status:", stdout)
            payload = json.loads(json_out.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema_version"], "meridian.framework_check.v0")
            category_names = [category["name"] for category in payload["categories"]]
            self.assertIn(MCP_RUNTIME_CATEGORY, category_names)
            markdown = report_out.read_text(encoding="utf-8")
            self.assertIn("# Meridian Framework Check", markdown)
            self.assertIn(f"### {MCP_RUNTIME_CATEGORY}:", markdown)

    def test_framework_check_catches_missing_lab_state_when_requested(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = run_framework_check(project_root=Path.cwd(), lab_root=Path(tmp))

        lab_category = next(category for category in report.categories if category.name == "Lab State")
        self.assertEqual(lab_category.status, "fail")
        self.assertIn("lab_missing_lab_root", {finding.code for finding in lab_category.findings})

    def test_mcp_json_bridge_capabilities_does_not_require_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "empty-config"
            exit_code, stdout, stderr = _run_mcp_adapter_capture(
                ["capabilities", "--detail", "summary"],
                env={"MERIDIAN_CONFIG_HOME": str(config_home)},
            )

        self.assertEqual(exit_code, 0, stderr)
        payload = json.loads(stdout)
        self.assertEqual(payload["schema_version"], "meridian.mcp_adapter.v1")
        self.assertIn("entry_model", payload)
        self.assertIn("tools", payload)

    def test_mcp_adapter_shapes_index_write_failure(self) -> None:
        error = PermissionError(1, "Operation not permitted", "/tmp/wiki/.index/papers.jsonl")
        payload = mcp_adapter.call_chain_error_payload(error)

        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["error_code"], "workspace_index_write_failed")
        self.assertEqual(payload["path"], "/tmp/wiki/.index/papers.jsonl")
        self.assertIn("could not write to the Paper Wiki library", payload["message"])
        self.assertIn("write access", payload["next_action"])

    def test_mcp_stdio_server_context_reports_needs_init_without_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "empty-config"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                server = mcp_server.MeridianMCPServer()
                tools_response = server.handle_message({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
                tool_names = {tool["name"] for tool in tools_response["result"]["tools"]}
                self.assertIn("meridian.context", tool_names)

                context_response = server.handle_message(
                    {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {
                            "name": "meridian.context",
                            "arguments": {"query": "agent workflow goals"},
                        },
                    }
                )

        self.assertIn("result", context_response)
        result = context_response["result"]
        self.assertTrue(result["isError"])
        payload = json.loads(result["content"][0]["text"])
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["error_code"], "needs_init")
        self.assertIn("meridian wiki init --library-root", payload["next_action"])

    def test_mcp_stdio_server_speaks_content_length_framing(self) -> None:
        requests = [
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "clientInfo": {"name": "framed-test-client", "version": "0.1"},
                },
            },
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        ]
        stdin = io.BytesIO(b"".join(_mcp_frame(request) for request in requests))
        stdout = io.BytesIO()

        server = mcp_server.MeridianMCPServer()
        self.assertEqual(server.serve_stdio(stdin=stdin, stdout=stdout), 0)

        raw = stdout.getvalue()
        responses = _mcp_framed_responses(raw)
        self.assertEqual([response["id"] for response in responses], [1, 2])
        self.assertEqual(responses[0]["jsonrpc"], "2.0")
        self.assertEqual(responses[0]["result"]["serverInfo"]["name"], "meridian-paper-wiki")
        self.assertIn("tools", responses[0]["result"]["capabilities"])
        tool_names = {tool["name"] for tool in responses[1]["result"]["tools"]}
        self.assertIn("meridian.context", tool_names)

    def test_mcp_stdio_harness_runs_client_style_sequence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            (wiki_root / "topics").mkdir(parents=True)
            (wiki_root / "papers").mkdir(parents=True)
            (wiki_root / "schema.yaml").write_text(
                "version: 1\n"
                "kinds:\n"
                "  topic:\n"
                "    dir: topics\n"
                "    label: Topic\n"
                "    describe: {section: Problem, hint: what is hard here}\n"
                "sections:\n"
                "  - {key: experiments, label: Experiments}\n"
                "  - {key: open, label: Open questions}\n"
                "anchor:\n"
                "  require_quote: true\n",
                encoding="utf-8",
            )
            (wiki_root / "topics/kv-cache-compression.md").write_text(
                "---\n"
                'kind: "topic"\n'
                'title: "KV-cache compression"\n'
                "aliases: []\n"
                "parents: []\n"
                "columns: []\n"
                'updated: "2026-09-16"\n'
                "---\n"
                "<!-- generated:children -->\n"
                "## Sub-aggregations\n(none)\n"
                "<!-- /generated -->\n"
                "<!-- generated:table -->\n"
                "## Table\n| Paper |\n|---|\n| [[papers/kv-cache|KV Cache Paper]] |\n"
                "<!-- /generated -->\n"
                "<!-- generated:claims -->\n"
                "## Conclusions\n(none yet)\n"
                "<!-- /generated -->\n"
                "\n## Problem\nCache retention should preserve useful context while reducing memory bandwidth.\n"
                "\n## Experiments\n\n## Open questions\n",
                encoding="utf-8",
            )
            paper = wiki_root / "papers/kv-cache.md"
            paper.write_text(
                "---\n"
                'type: "paper"\n'
                'title: "KV Cache Paper"\n'
                'status: "active"\n'
                'created: "2026-09-16"\n'
                'updated: "2026-09-16"\n'
                'source_id: "kv-cache-source"\n'
                "memberships:\n"
                '  - in: "topics/kv-cache-compression"\n'
                "    cells: []\n"
                "---\n"
                "## What this covers\n"
                "Cache retention needs to preserve useful context while reducing memory bandwidth.\n",
                encoding="utf-8",
            )
            report_path = root / "mcp-harness.json"
            result = mcp_harness.run_stdio_harness(wiki_root=wiki_root, out_path=report_path)
            self.assertEqual(result["status"], "pass")
            self.assertTrue(report_path.exists())
            self.assertEqual(result["summary"]["tool_count"], 18)
            self.assertTrue(result["summary"]["blocked_internal_read"])
            self.assertEqual(result["summary"]["fixture_propose_status"], "submitted")
            self.assertEqual(result["summary"]["fixture_proposal_status"], "waiting_for_app")
            self.assertEqual(result["summary"]["workspace_status"], "ready")
            self.assertEqual(result["summary"]["workspace_plan_revision"], "fixture-revision")
            self.assertEqual(result["summary"]["workspace_change_cursor_status"], "ok")
            self.assertEqual(result["summary"]["workspace_idea_id"], "fixture-idea")
            self.assertEqual(result["summary"]["workspace_node_id"], "fixture.A")
            self.assertEqual(result["summary"]["workspace_event_status"], "created")
            self.assertEqual(result["summary"]["lab_update_status"], "applied")

    def test_release_manifest_excludes_private_runtime_state(self) -> None:
        manifest = Path("MANIFEST.in")
        self.assertTrue(manifest.exists())
        text = manifest.read_text(encoding="utf-8")
        self.assertIn("graft src", text)
        self.assertIn("graft plugins", text)
        self.assertIn("prune wiki", text)
        self.assertIn("prune .arbor", text)

    def test_plugin_release_assets_exist(self) -> None:
        codex_root = Path("plugins/codex/meridian")
        codex_marketplace = json.loads(
            Path(".agents/plugins/marketplace.json").read_text(encoding="utf-8")
        )
        self.assertEqual(codex_marketplace["name"], "meridian")
        self.assertEqual(codex_marketplace["plugins"][0]["name"], "meridian")
        self.assertEqual(codex_marketplace["plugins"][0]["source"]["path"], "./plugins/codex/meridian")
        codex_manifest = json.loads((codex_root / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(codex_manifest["name"], "meridian")
        self.assertEqual(codex_manifest["skills"], "./skills/")
        self.assertEqual(codex_manifest["mcpServers"], "./.mcp.json")
        self.assertIn("grounding", codex_manifest["keywords"])
        self.assertIn("retrieval", codex_manifest["keywords"])
        codex_interface = codex_manifest["interface"]
        self.assertIn("Read", codex_interface["capabilities"])
        self.assertIn("Write", codex_interface["capabilities"])
        self.assertLessEqual(len(codex_interface["defaultPrompt"]), 3)
        self.assertTrue(
            all(len(prompt) <= 128 for prompt in codex_interface["defaultPrompt"]),
            codex_interface["defaultPrompt"],
        )
        self.assertIn("MCP context/read/trace", codex_interface["longDescription"])
        self.assertTrue((codex_root / codex_interface["composerIcon"]).exists())
        self.assertTrue((codex_root / codex_interface["logo"]).exists())

        claude_root = Path("plugins/claude-code/meridian")
        claude_marketplace = json.loads(
            Path(".claude-plugin/marketplace.json").read_text(encoding="utf-8")
        )
        self.assertEqual(claude_marketplace["name"], "meridian")
        self.assertEqual(claude_marketplace["plugins"][0]["name"], "meridian")
        self.assertEqual(claude_marketplace["plugins"][0]["source"], "./plugins/claude-code/meridian")
        claude_manifest = json.loads((claude_root / ".claude-plugin/plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(claude_manifest["name"], "meridian")

        for root in (codex_root, claude_root):
            self.assertTrue((root / ".mcp.json").exists())
            mcp_config = json.loads((root / ".mcp.json").read_text(encoding="utf-8"))
            server = mcp_config["mcpServers"]["meridian-paper-wiki"]
            self.assertEqual(server["command"], "python")
            self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])
            if root == codex_root:
                self.assertEqual(server["title"], "Meridian Paper Wiki")
                self.assertEqual(server["cwd"], ".")
                self.assertIn("source-grounded Paper Wiki context", server["description"])
                self.assertEqual(server["icons"][0]["mimeType"], "image/svg+xml")
                self.assertTrue((root / server["icons"][0]["src"]).exists())
            self.assertTrue((root / "skills/meridian/SKILL.md").exists())
            self.assertTrue((root / "skills/wiki/SKILL.md").exists())
            self.assertTrue((root / "skills/lab/SKILL.md").exists())
            self.assertTrue((root / "skills/meridian-coding/SKILL.md").exists())
            self.assertFalse((root / "skills/llm-wiki").exists())
            self.assertFalse((root / "skills/paper-ingest").exists())
            self.assertFalse((root / "skills/wiki-retrieve").exists())
            self.assertFalse((root / "skills/wiki-personalize").exists())
            self.assertFalse((root / "skills/wiki-evolve").exists())
            self.assertFalse((root / "skills/wiki-knowledge").exists())
            self.assertFalse((root / "skills/wiki-concept").exists())

    def test_agent_plugins_portable_package_is_standard_shaped(self) -> None:
        root = Path("plugins/agent/meridian")
        manifest = json.loads((root / "plugin.json").read_text(encoding="utf-8"))
        manifest_keys = {
            "$schema",
            "name",
            "version",
            "description",
            "author",
            "homepage",
            "repository",
            "license",
            "keywords",
            "extensions",
        }
        self.assertLessEqual(set(manifest), manifest_keys)
        self.assertEqual(manifest["$schema"], "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json")
        self.assertEqual(manifest["name"], "meridian")
        self.assertRegex(manifest["name"], r"^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")
        self.assertEqual(manifest["version"], __version__)
        self.assertIn("paper-wiki", manifest["keywords"])
        self.assertIn("lab", manifest["keywords"])

        mcp_config = json.loads((root / "mcp.json").read_text(encoding="utf-8"))
        self.assertEqual(set(mcp_config), {"$schema", "mcpServers"})
        self.assertEqual(mcp_config["$schema"], "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json")
        server = mcp_config["mcpServers"]["meridian-paper-wiki"]
        self.assertEqual(set(server), {"type", "command", "args"})
        self.assertEqual(server["type"], "stdio")
        self.assertEqual(server["command"], "python")
        self.assertEqual(server["args"], ["-m", "meridian.mcp", "serve"])

        self.assertFalse((root / ".codex-plugin").exists())
        self.assertFalse((root / ".claude-plugin").exists())
        self.assertFalse((root / ".mcp.json").exists())

        skills_root = root / "skills"
        self.assertEqual(
            sorted(child.name for child in skills_root.iterdir() if child.is_dir()),
            ["lab", "meridian", "meridian-coding", "wiki"],
        )
        for skill_name in ["meridian", "wiki", "lab", "meridian-coding"]:
            portable = skills_root / skill_name / "SKILL.md"
            codex = Path("plugins/codex/meridian/skills") / skill_name / "SKILL.md"
            claude = Path("plugins/claude-code/meridian/skills") / skill_name / "SKILL.md"
            self.assertTrue(portable.exists(), str(portable))
            self.assertEqual(portable.read_text(encoding="utf-8"), codex.read_text(encoding="utf-8"))
            self.assertEqual(portable.read_text(encoding="utf-8"), claude.read_text(encoding="utf-8"))

    def test_codex_product_skills_define_ui_display_names(self) -> None:
        expected = {
            "meridian": "Meridian",
            "wiki": "Wiki",
            "lab": "Lab",
            "meridian-coding": "Meridian Coding",
        }
        for skill_name, display_name in expected.items():
            metadata = Path(f"plugins/codex/meridian/skills/{skill_name}/agents/openai.yaml")
            self.assertTrue(metadata.exists(), str(metadata))
            text = metadata.read_text(encoding="utf-8")
            self.assertIn(f'display_name: "{display_name}"', text)
            self.assertIn("short_description:", text)
            self.assertIn(f"default_prompt: \"Use ${skill_name}", text)

    def test_plugin_marketplace_taglines_match_lab_boundary(self) -> None:
        codex_marketplace = json.loads(Path(".agents/plugins/marketplace.json").read_text(encoding="utf-8"))
        claude_marketplace = json.loads(Path(".claude-plugin/marketplace.json").read_text(encoding="utf-8"))
        claude_description = claude_marketplace["plugins"][0]["description"]

        self.assertEqual(codex_marketplace["name"], "meridian")
        self.assertIn("Paper Wiki", claude_description)
        self.assertIn("Lab", claude_description)
        self.assertNotIn("research-coding copilot", claude_description)
        self.assertNotIn("Research Dev Agent", claude_description)

    def test_research_dev_mvp_assets_exist(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Idea Feasibility Review", skill)
        self.assertIn("Research Grounding Injection", skill)
        self.assertIn("Experiment Evidence Recording", skill)
        self.assertIn("meridian.context", skill)
        self.assertIn("Lazy Init", skill)
        self.assertIn("Research Code Style", skill)
        self.assertIn("one readable main flow", skill)
        self.assertIn("single-use parser, loader", skill)
        self.assertIn("downstream coding acceptance criterion", skill)

        template = Path("src/meridian/templates/research-dev")
        self.assertTrue((template / "research-dev-context-packet.md").exists())
        self.assertTrue((template / "experiment-evidence-plan.md").exists())
        self.assertFalse((template / "development-handoff-packet.md").exists())
        self.assertTrue((template / "research-grounding-injection.md").exists())
        self.assertTrue((template / "idea-card.md").exists())
        injection_template = (template / "research-grounding-injection.md").read_text(encoding="utf-8")
        self.assertIn("## Implementation Prior", injection_template)
        self.assertIn("related papers", injection_template)
        self.assertIn("code/repo links", injection_template)
        self.assertIn("## Research Code Style", injection_template)
        self.assertIn("one readable main flow", injection_template)
        self.assertIn("Return Signal", injection_template)

        pyproject = Path("pyproject.toml").read_text(encoding="utf-8")
        self.assertIn('"templates/research-dev/**/*.md"', pyproject)

    def test_research_dev_idea_management_assets_parse(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Idea Placement", skill)
        self.assertIn("Never edit canonical wiki pages directly from Lab state", skill)
        self.assertIn("wiki_propose` (claim ops with experiment evidence) when a local\nfinding", skill)

        template = Path("src/meridian/templates/research-dev/idea-card.md").read_text(encoding="utf-8")
        for section in [
            "## Raw Idea",
            "## Hypothesis",
            "## Wiki Grounding",
            "## Feasibility Read",
            "## Minimal Test",
            "## Evidence Log",
            "## Decision",
            "## Write-back Candidate",
        ]:
            self.assertIn(section, template)
        self.assertIn("type: research_dev_idea", template)
        self.assertIn("evidence_state", template)

    def test_research_dev_state_model_assets_parse(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        for phrase in [
            "New Idea Placement / Thread Seed",
            "Approach Tree Exploration",
            "Experiment Evidence Recording",
            "Finding Proposal / Wiki Write-back",
            "Lazy Init",
            ".meridian/state.md",
            ".meridian/threads/index.md",
            ".meridian/experiments/index.md",
            ".meridian/proposals/index.md",
            "unresolved",
            "repairable",
            "supported",
            "dead",
            "no existing thread candidates",
            "root thread seed",
        ]:
            self.assertIn(phrase, skill)

        template = Path("src/meridian/templates/research-dev")
        for name in [
            "state.md",
            "thread.md",
            "experiment.md",
            "proposal.md",
            "threads-index.md",
            "experiments-index.md",
            "proposals-index.md",
            "wiki-transfer-packet.md",
        ]:
            self.assertTrue((template / name).exists(), name)
        self.assertFalse((template / "memory.md").exists())

        thread = (template / "thread.md").read_text(encoding="utf-8")
        self.assertNotIn("active_node", thread)
        self.assertIn("Approach Tree", thread)
        self.assertIn("unresolved", thread)

        proposal = (template / "proposal.md").read_text(encoding="utf-8")
        self.assertIn("strengthening", proposal)
        self.assertIn("Wiki Transfer Gate", proposal)
        self.assertIn("Transfer Notes", proposal)

        transfer = (template / "wiki-transfer-packet.md").read_text(encoding="utf-8")
        self.assertIn("Boundary Mapping", transfer)
        self.assertIn("Submission Gate", transfer)

    def test_research_dev_zero_candidate_idea_replay_contract(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("no existing thread candidates", skill)
        self.assertIn("ask to create a root thread seed", skill)

    def test_lab_research_prior_assets_parse(self) -> None:
        skill = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        for phrase in [
            "Research Prior",
            "needed",
            "checked",
            "missing",
            "deferred",
            "not_needed",
            "LLM-as-Judge",
            "user confirmation",
            "Research Prior Gate",
            "Call `meridian.context`",
            "Default MCP grounding path",
        ]:
            self.assertIn(phrase, skill)

        template_root = Path("src/meridian/templates/research-dev")
        thread = (template_root / "thread.md").read_text(encoding="utf-8")
        experiment = (template_root / "experiment.md").read_text(encoding="utf-8")
        for text in (thread, experiment):
            self.assertIn("Research Prior", text)
            self.assertIn("needed | checked | missing | deferred | not_needed", text)
            self.assertIn("method | prompt | metric | eval | ablation | probe | failure | baseline", text)
            self.assertIn("mcp grounding", text)
            self.assertIn("user confirmation", text)

    def test_lab_official_benchmark_fidelity_gate_assets_parse(self) -> None:
        required_skill_phrases = [
            "Official Benchmark Fidelity",
            "official runner entrypoint",
            "official task source / split source",
            "official config defaults",
            "official metric function",
            "official aggregation granularity",
            "provider substitution",
            "history/context hook",
            "reporting-only",
            "official metric",
            "derived diagnostic",
            "Please review benchmark faithfulness, not general code quality.",
        ]
        for root in (CODEX_PLUGIN_SKILL_ROOT, CLAUDE_PLUGIN_SKILL_ROOT):
            lab = (root / "lab/SKILL.md").read_text(encoding="utf-8")
            for phrase in required_skill_phrases:
                self.assertIn(phrase, lab)

    def test_lab_lazy_init_creates_minimal_valid_research_space(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            written = initialize_lab_space(root)
            relative = {path.resolve().relative_to(root.resolve()) for path in written}
            self.assertTrue(
                {
                    Path(".meridian/experiments/index.md"),
                    Path(".meridian/proposals/index.md"),
                    Path(".meridian/state.md"),
                    Path(".meridian/threads/index.md"),
                }.issubset(relative),
            )
            self.assertIn(Path("AGENTS.md"), relative)
            self.assertFalse([path for path in (root / ".meridian/threads").glob("*.md") if path.name != "index.md"])
            self.assertFalse([path for path in (root / ".meridian/experiments").glob("*.md") if path.name != "index.md"])
            self.assertFalse([path for path in (root / ".meridian/proposals").glob("*.md") if path.name != "index.md"])
            report = validate_lab_space(root)
            self.assertEqual(report.status, "pass", report.to_dict())

    def test_meridian_agents_contract_block_is_idempotent_and_preserves_user_text(self) -> None:
        from meridian.lab import inject_meridian_agents_contract

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            agents.write_text("# Existing Rules\n\nKeep this line.\n", encoding="utf-8")

            first = inject_meridian_agents_contract(root)
            second = inject_meridian_agents_contract(root)

            self.assertEqual(first, agents.resolve())
            self.assertEqual(second, agents.resolve())
            text = agents.read_text(encoding="utf-8")
            self.assertIn("Keep this line.", text)
            self.assertEqual(text.count("MERIDIAN RESEARCH AGENT CONTRACT START"), 1)
            self.assertEqual(text.count("MERIDIAN RESEARCH AGENT CONTRACT END"), 1)
            self.assertIn("research-agent-principles.md", text)
            self.assertIn("Do not silently substitute", text)

    def test_meridian_agents_contract_routes_research_coding_through_lab(self) -> None:
        from meridian.lab import meridian_agents_contract_block

        block = meridian_agents_contract_block()

        self.assertIn("repo has `.meridian/`", block)
        self.assertIn("load the Meridian Lab skill", block)
        self.assertIn("Research Grounding Injection", block)
        self.assertIn("Pure mechanical engineering may skip Lab", block)

    def test_meridian_agents_contract_replacement_preserves_surrounding_text_exactly(self) -> None:
        from meridian.lab import (
            MERIDIAN_AGENTS_CONTRACT_END,
            MERIDIAN_AGENTS_CONTRACT_START,
            inject_meridian_agents_contract,
            meridian_agents_contract_block,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            prefix = "# Existing Rules\n\nKeep this line.  \n\n"
            old_block = "\n".join(
                [
                    MERIDIAN_AGENTS_CONTRACT_START,
                    "Old Meridian contract text.",
                    MERIDIAN_AGENTS_CONTRACT_END,
                ]
            )
            suffix = "\n\n    Indentation-sensitive text after the block.\n\tTabbed continuation.\n"
            agents.write_text(prefix + old_block + suffix, encoding="utf-8")

            inject_meridian_agents_contract(root)
            first_text = agents.read_text(encoding="utf-8")
            inject_meridian_agents_contract(root)
            second_text = agents.read_text(encoding="utf-8")

            block = meridian_agents_contract_block().rstrip()
            self.assertEqual(first_text, prefix + block + suffix)
            self.assertEqual(second_text, first_text)

    def test_meridian_agents_contract_validator_reports_stale_and_duplicate_blocks(self) -> None:
        from meridian.lab import (
            MERIDIAN_AGENTS_CONTRACT_END,
            MERIDIAN_AGENTS_CONTRACT_START,
            meridian_agents_contract_block,
            validate_meridian_agents_contract,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            agents.write_text(
                "\n".join(
                    [
                        MERIDIAN_AGENTS_CONTRACT_START,
                        "Old contract text.",
                        MERIDIAN_AGENTS_CONTRACT_END,
                    ]
                ),
                encoding="utf-8",
            )
            stale = validate_meridian_agents_contract(root)
            agents.write_text(
                meridian_agents_contract_block().rstrip()
                + "\n\n"
                + meridian_agents_contract_block().rstrip()
                + "\n",
                encoding="utf-8",
            )
            duplicate = validate_meridian_agents_contract(root)

        self.assertIn("agents_contract_stale", {finding.code for finding in stale.findings})
        self.assertIn("agents_contract_duplicate", {finding.code for finding in duplicate.findings})

    def test_meridian_agents_contract_orphan_start_preserves_text_across_repeated_injection(self) -> None:
        from meridian.lab import (
            MERIDIAN_AGENTS_CONTRACT_START,
            inject_meridian_agents_contract,
            meridian_agents_contract_block,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            original = (
                "# Existing Rules\n\n"
                f"{MERIDIAN_AGENTS_CONTRACT_START}\n"
                "This is user-authored text after an orphan marker.\n"
                "    Preserve this indentation.\n"
            )
            agents.write_text(original, encoding="utf-8")

            inject_meridian_agents_contract(root)
            first_text = agents.read_text(encoding="utf-8")
            inject_meridian_agents_contract(root)
            second_text = agents.read_text(encoding="utf-8")

            block = meridian_agents_contract_block().rstrip()
            expected = original + "\n" + block + "\n"
            self.assertEqual(first_text, expected)
            self.assertEqual(second_text, expected)
            self.assertEqual(first_text.count(block), 1)

    def test_meridian_agents_contract_stray_end_preserves_text_and_appends_valid_block(self) -> None:
        from meridian.lab import (
            MERIDIAN_AGENTS_CONTRACT_END,
            inject_meridian_agents_contract,
            meridian_agents_contract_block,
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            original = (
                f"{MERIDIAN_AGENTS_CONTRACT_END}\n"
                "# Existing Rules\n\n"
                "Normal user text after a stray end marker.\n"
                "\tKeep the tabbed line.\n"
            )
            agents.write_text(original, encoding="utf-8")

            inject_meridian_agents_contract(root)
            first_text = agents.read_text(encoding="utf-8")
            inject_meridian_agents_contract(root)
            second_text = agents.read_text(encoding="utf-8")

            block = meridian_agents_contract_block().rstrip()
            expected = original + "\n" + block + "\n"
            self.assertEqual(first_text, expected)
            self.assertEqual(second_text, expected)
            self.assertEqual(first_text.count(block), 1)

    def test_initialize_lab_space_injects_agents_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            written = initialize_lab_space(root)
            relative = {
                str(path.resolve().relative_to(root.resolve())).replace("\\", "/")
                for path in written
            }
            self.assertIn("AGENTS.md", relative)
            text = (root / "AGENTS.md").read_text(encoding="utf-8")
            self.assertIn("MERIDIAN RESEARCH AGENT CONTRACT START", text)
            self.assertIn("~/.meridian/research-agent-principles.md", text)

    def test_lab_state_validator_passes_valid_research_space(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            (lab / "state.md").write_text(
                "---\ntype: lab-state\nactive_thread: cache-retention\n---\n# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            (lab / "threads/cache-retention.md").write_text(
                "---\ntype: research-thread\nactive_node: A\n---\n"
                "# Research Thread\n\n"
                "## Approach Tree\n\n"
                "### Node A: Initial approach\n\n"
                "- mode: `supported`\n",
                encoding="utf-8",
            )
            (lab / "experiments/exp-cache-probe.md").write_text(
                "---\ntype: research-experiment\nid: exp-cache-probe\nvalidity: valid\n---\n"
                "# Experiment\n",
                encoding="utf-8",
            )
            (lab / "proposals/cache-scoring.md").write_text(
                "---\n"
                "type: research-finding-proposal\n"
                "state: ready\n"
                "source_experiments:\n"
                "  - exp-cache-probe\n"
                "target_wiki_pages:\n"
                "  - wiki/concepts/KV-cache-memory-bandwidth.md\n"
                "---\n"
                "# Finding Proposal\n\n"
                "## Wiki Transfer Gate\n\n"
                "- source facts:\n",
                encoding="utf-8",
            )

            report = validate_lab_space(root)
            self.assertEqual(report.status, "pass", report.to_dict())

    def test_lab_state_validator_fails_invalid_modes_and_ready_bridge(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lab = root / ".meridian"
            (lab / "threads").mkdir(parents=True)
            (lab / "experiments").mkdir()
            (lab / "proposals").mkdir()
            (lab / "state.md").write_text(
                "---\ntype: lab-state\nactive_thread: missing-thread\n---\n# Meridian Lab State\n",
                encoding="utf-8",
            )
            (lab / "threads/index.md").write_text("# Threads\n", encoding="utf-8")
            (lab / "experiments/index.md").write_text("# Experiments\n", encoding="utf-8")
            (lab / "proposals/index.md").write_text("# Proposals\n", encoding="utf-8")
            (lab / "threads/cache-retention.md").write_text(
                "---\ntype: research-thread\n---\n"
                "# Research Thread\n\n"
                "## Approach Tree\n\n"
                "### Node A: Initial approach\n\n"
                "- mode: `paused`\n",
                encoding="utf-8",
            )
            (lab / "proposals/cache-scoring.md").write_text(
                "---\ntype: research-finding-proposal\nstate: ready\n---\n"
                "# Finding Proposal\n",
                encoding="utf-8",
            )

            report = validate_lab_space(root)
            codes = {finding.code for finding in report.findings}
            self.assertEqual(report.status, "fail")
            self.assertIn("active_thread_missing", codes)
            self.assertIn("invalid_node_mode", codes)
            self.assertIn("ready_proposal_without_experiments", codes)
            self.assertIn("ready_proposal_without_wiki_target", codes)
            self.assertIn("ready_proposal_without_transfer_gate", codes)


if __name__ == "__main__":
    unittest.main()
