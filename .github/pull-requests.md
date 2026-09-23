# Pull requests

A pull request is the gate code passes to reach a release branch. Keep it small, keep it to one
job, and let the checks run.

## 1. Title and issue

Format: `[vX.Y.Z.F] description (Closes #issue)`

- `[v0.0.15.0] Drag to reorder tasks in the research plan (Closes #3)`
- `[v0.0.15.0] Show a detail note on every task (Closes #5)`

Work is done on the work branch first; the pull request is opened once the work is finished and
tested. `Closes #issue` closes the issue automatically when the pull request is merged, so the
issue, the branch, the pull request and the version always point at each other. The description
says what the change does, not what the pull request does to the repository.

## 2. Where it goes

A work branch merges into its version's release branch:

| From | Into |
|---|---|
| `fix/v0.0.14.2/desktop/research-record-layout` | `fix/v0.0.14.2/release` |
| `feature/v0.0.15.0/desktop/task-drag-sort` | `feature/v0.0.15.0/release` |

See [versioning.md](versioning.md) for branch names and releases.

## 3. One job only

A pull request does exactly what its title and issue say. A fix pull request that also refactors
unrelated code or adds a small feature is sent back. Open a separate issue for anything else you
noticed.

- Allowed in `fix/v0.0.14.2/desktop/research-record-layout`: the record row layout and its tests.
- Not allowed there: renaming an unrelated component, adding a new setting.

## 4. Size

Aim for at most 300–500 changed lines. Split larger work into several pull requests, one per step,
unless it is a large refactor that cannot be split.

## 5. Before merging

All of these must hold:

1. At least one core developer (today, the owner) has reviewed and approved it.
2. Every automated check is green. A failing build, test or lint blocks the merge.
3. The commit messages follow Conventional Commits, for example
   `fix(desktop): fade text only when it does not fit`.

## Example, start to finish

1. A bug is found: research records do not line up with the other lists. Issue **#12** is opened,
   labelled `bug`, milestone `v0.0.14.2`.
2. A branch is cut from the latest release tag:
   `git switch -c fix/v0.0.14.2/desktop/research-record-layout v0.0.14001`
3. The fix is made and a pull request is opened into `fix/v0.0.14.2/release`, titled
   `[v0.0.14.2] Lay research records out like the other project lists (Closes #12)`.
4. The owner reviews it, the checks pass, it is merged. Issue #12 closes itself and the fix ships
   with `v0.0.14.2`.

The pull request template in this repository asks for these fields.
