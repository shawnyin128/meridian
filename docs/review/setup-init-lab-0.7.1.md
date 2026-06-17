# Setup Init Lab 0.7.1

Meridian 0.7.1 adds a setup-owned Lab readiness initializer:

```bash
python -m meridian setup init-lab --lab-root <repo>
```

The command creates or migrates user-level research-agent files, initializes
only the minimal `.meridian/` skeleton when missing, injects or refreshes the
guarded Meridian block in `AGENTS.md`, and reports remaining Lab state blockers
without silently rewriting existing research thread content.

This fixes the post-0.7.0 gap where a fresh client could load the current Lab
skill but still hand-patch a project that had not been migrated to the
research-agent contract.

Verification:

- `python -m pytest tests/test_cli.py -q` -> 249 passed, 4 subtests passed.
- `python -m compileall src tests` -> passed.
- `python -m meridian framework-check --project-root D:\develop\meridian` -> pass.
- `python -m meridian setup init-lab --help` -> command available.
