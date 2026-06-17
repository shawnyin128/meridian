# Lab Routing And Style Profile Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lab routing deterministic from Meridian-initialized repos and keep code-style distillation in user-level structured profiles instead of project `AGENTS.md`.

**Architecture:** Extend the managed `AGENTS.md` research-agent contract with repo-state Lab routing language. Strengthen user-level profile starter/migration text with structured merge and `~/.meridian/code-ref/` reference policy, then teach validation/framework checks to flag style-profile drift inside project `AGENTS.md`. Keep implementation scoped to contract/profile helpers, product skills, docs, and eval fixtures.

**Tech Stack:** Python standard library, Markdown contract files, `unittest`/`pytest` tests.

---

### Task 1: Contract And Profile Tests

**Files:**
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write failing tests**

Add tests that assert:

```python
def test_meridian_agents_contract_routes_research_coding_through_lab(self) -> None:
    from meridian.lab import meridian_agents_contract_block

    block = meridian_agents_contract_block()
    self.assertIn("repo has `.meridian/`", block)
    self.assertIn("load the Meridian Lab skill", block)
    self.assertIn("Research Grounding Injection", block)
    self.assertIn("Pure mechanical engineering may skip Lab", block)

def test_research_agent_principles_define_structured_profile_merge_and_code_ref(self) -> None:
    from meridian.lab import initialize_research_agent_principles

    with tempfile.TemporaryDirectory() as tmp:
        target = initialize_research_agent_principles(config_home=Path(tmp))
        text = target.read_text(encoding="utf-8")
    self.assertIn("## Profile Maintenance", text)
    self.assertIn("structured merge", text)
    self.assertIn("~/.meridian/code-ref/", text)
    self.assertIn("Do not append raw distillation notes", text)

def test_coding_style_profile_points_to_code_ref_and_structured_merge(self) -> None:
    from meridian.lab import initialize_coding_style_profile

    with tempfile.TemporaryDirectory() as tmp:
        target = initialize_coding_style_profile(config_home=Path(tmp))
        text = target.read_text(encoding="utf-8")
    self.assertIn("structured merge", text)
    self.assertIn("~/.meridian/code-ref/", text)
```

- [ ] **Step 2: Verify red**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_meridian_agents_contract_routes_research_coding_through_lab tests/test_cli.py::CliTests::test_research_agent_principles_define_structured_profile_merge_and_code_ref tests/test_cli.py::CliTests::test_coding_style_profile_points_to_code_ref_and_structured_merge -q
```

Expected: fail because the contract/profile text is not present.

### Task 2: Framework Drift Test

**Files:**
- Modify: `tests/test_cli.py`
- Modify: `src/meridian/framework_check.py`

- [ ] **Step 1: Write failing test**

Add a test that creates a Lab repo with `.meridian/` and an `AGENTS.md` section titled `## Meridian Coding Style Profile`, then asserts `run_framework_check(..., lab_root=root)` reports `style_profile_drift_in_agents`.

- [ ] **Step 2: Verify red**

Run the single test and confirm it fails because the drift detector does not exist.

### Task 3: Implement Minimal Contract Changes

**Files:**
- Modify: `src/meridian/lab/research_agent_contract.py`
- Modify: `src/meridian/lab/coding_style.py`
- Modify: `src/meridian/framework_check.py`

- [ ] **Step 1: Update managed contract block**

Add repo-state Lab routing, Research Grounding Injection, and mechanical skip language to `meridian_agents_contract_block()`.

- [ ] **Step 2: Update profile starters and migrations**

Add `## Profile Maintenance` to research-agent principles and structured merge / code-ref guidance to coding-style profile. Migration should add missing sections without deleting user text.

- [ ] **Step 3: Add framework drift detector**

When `lab_root` is provided, scan project `AGENTS.md` outside the managed block for likely user-level coding-style profile sections and report `style_profile_drift_in_agents`.

### Task 4: Product Skill And Eval Surface

**Files:**
- Modify: `plugins/codex/meridian/skills/lab/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/lab/SKILL.md`
- Modify: `docs/research-dev-use-cases.md`
- Modify: `eval/cases/research_agent_contract_live.jsonl`
- Modify: `src/meridian/evals/codex_routing.py`

- [ ] **Step 1: Update Lab Code Style Distillation instructions**

State that distillation must not create project `AGENTS.md` style sections, must propose structured user-level profile updates, and should proactively consider adding or referencing `~/.meridian/code-ref/` when a reusable style example is valuable. `code-ref` is optional reference material, not a hard gate.

- [ ] **Step 2: Add eval expectations**

Add fields or prompt text so live eval checks structured profile update, no AGENTS pollution, and code-ref initiative.

### Task 5: Verification

**Files:**
- Modify: all changed files

- [ ] **Step 1: Run targeted tests**

Run contract/profile/framework/eval parsing tests.

- [ ] **Step 2: Run broader checks**

Run `python -m pytest tests/test_cli.py -q` and `python -m meridian framework-check --project-root D:\develop\meridian --lab-root D:\develop\meridian`.
