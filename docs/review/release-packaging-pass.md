# Release Packaging Pass Review

Feature: Release packaging pass

## Context/Test Plan

Goal: define and validate what belongs in a Meridian release package, separating
the installable execution core from private user vault state.

Validation scope:

- packaging metadata
- source distribution manifest
- clean vault template
- README release entry
- private artifact exclusions
- wheel and sdist smoke builds
- full unit suite, compile, diff hygiene, wiki gates, Arbor gates

## Developer Round

Implementation artifacts:

- `pyproject.toml`
  - updated package description
  - package data declaration for the clean vault template
- `setup.cfg` and `setup.py`
  - compatibility fallback for older setuptools/no-build-isolation builds
- `MANIFEST.in`
  - includes execution core, skills, selected docs, eval cases/rubrics, and templates
  - prunes private `wiki/`, `eval/runs/`, `.arbor/`, `.git/`, and caches
- `src/meridian/templates/wiki-vault/`
  - clean Obsidian-compatible vault scaffold
- `docs/release-packaging.md`
  - release inclusion/exclusion contract
- `README.md`
  - release install and package-boundary note
- `.gitignore`
  - excludes generated Python packaging outputs

## Evaluator Round

Targeted tests:

- `test_release_manifest_excludes_private_runtime_state`
- `test_release_vault_template_is_packaged`

Packaging smoke:

- `python3 -m pip wheel . --no-deps --no-build-isolation -w /private/tmp/meridian-wheel`
  - produced `meridian-0.1.0-py3-none-any.whl`
  - wheel includes the clean vault template
  - wheel excludes private `wiki/` and `eval/runs/`
- `python3 setup.py sdist --dist-dir /private/tmp/meridian-sdist`
  - produced `meridian-0.1.0.tar.gz`
  - sdist includes `.codex/skills/meridian-paper-wiki/SKILL.md`
  - sdist includes `src/meridian/templates/wiki-vault/Map of Content.md`
  - sdist excludes private `wiki/`, `eval/runs/`, and `.arbor/`

## Convergence Round

Converged for release-packaging MVP because the package boundary is explicit and
machine-checked:

- wheel is execution-core focused
- source bundle carries skills/docs/evals/templates
- private vault and generated runtime artifacts are excluded

Residual:

- If publishing to a public package index, add project URL, author/maintainer,
  license metadata, and a versioning policy.

## Release Round

Final gates:

- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache-test PYTHONPATH=src python3 -m unittest discover -s tests`
  - 111 tests passed
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache-compile PYTHONPATH=src python3 -m compileall src tests`
  - compile pass
- `git diff --check`
  - pass
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki`
  - pass with 1 documented informational finding
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki`
  - 238 sources, 0 missing managed files, 0 SHA mismatches, 0 duplicate SHA groups
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki`
  - 236 catalog entries
- `PYTHONPATH=src python3 -m meridian wiki final-product-check --wiki-root wiki`
  - warn, 0 findings
- `python3 /Users/shawn/.codex/plugins/cache/arbor/arbor/0.5.0/skills/arbor/scripts/check_process_state.py --root /Users/shawn/Desktop/meridian --json`
  - pass, 32 features
- `python3 /Users/shawn/.codex/plugins/cache/arbor/arbor/0.5.0/skills/arbor/scripts/run_agents_guide_drift_hook.py --root /Users/shawn/Desktop/meridian`
  - no AGENTS Project Map drift

Release decision: ready to commit. The remaining public-index metadata residual
is not a blocker for local/source-bundle release packaging.
