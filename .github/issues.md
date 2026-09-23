# Issues

Every change starts as an issue, including the team's own work. One issue covers one specific
problem, and every issue names the version it ships in.

## How a version gets its scope

1. Everything to be done is recorded as an issue with a type label. Issues without a milestone are
   the backlog.
2. When a version is planned, the owner decides which issues it includes and sets their milestone
   to that version (`v0.0.15.0`). The milestone's issues are the version's scope.
3. Work branches are cut for those issues. Each pull request closes its issue when it merges.
4. The version is released when its milestone has no open issues. Anything that will not make it
   is moved to the next milestone first.

## 1. Type label and milestone

Every issue carries exactly one type label and one milestone.

| Label | Use it for | Ships in (version position) | Branch prefix |
|---|---|---|---|
| `feature` | New functionality | Y for a complete new module, Z otherwise | `feature/` |
| `optimization` | Improving something that already works | Z | `feature/` |
| `bug` | Something that does not work as intended | F | `fix/` |

The milestone is the target version, written exactly as the version: `v0.0.15.0`, `v0.0.14.2`.

## 2. Title

Format: `[module] short description`

- `[desktop] Research records are not aligned with the other project lists`
- `[wiki] Agents can propose conclusions found in a project`
- `[plugins] The focus hook prints node labels in the wrong encoding`

Module names are the same as in branch names: `desktop`, `wiki`, `lab`, `harness`, `plugins`,
`process`, and so on.

## 3. Body

Three parts, all required for a bug:

1. **What happens.** The current behaviour, or the feature that is wanted.
2. **How to reproduce / what is needed.** Steps to reproduce the bug, or the detailed requirement.
3. **Expected result.** What should happen instead.

Screenshots help; paste them into the issue.

## Example

> **Title:** `[desktop] Every screen is empty after updating to 0.0.14`
> **Labels:** `bug` · **Milestone:** `v0.0.14.1`
>
> **What happens:** after updating from 0.0.13, projects, overview and Wiki show nothing, and
> Settings stays on "reading the library location".
>
> **How to reproduce:** use a library that 0.0.13 wrote and that has undo history, install 0.0.14,
> open it.
>
> **Expected result:** the library opens as before.

The issue templates in this repository ask for exactly these fields.
