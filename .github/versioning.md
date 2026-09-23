# Versions, branches, and releases

Every change ships in a numbered version, is built on a branch named after that version, and is
released from that version's release branch. This page says how to pick the number, name the
branch, and cut the release.

## 1. The version number: `vX.Y.Z.F`

A release raises exactly one position and resets every position to its right to zero.

| Position | Name | Raise it when | Compatibility | Example |
|---|---|---|---|---|
| X | Major | The architecture is rebuilt, the core direction changes, or a change breaks backward compatibility. | Breaking | `v0.4.2.1` → `v1.0.0.0` |
| Y | Minor (baseline) | A complete new module or feature lands. Every Y release is a baseline. | Compatible | `v0.1.3.2` → `v0.2.0.0` |
| Z | Iteration | Everyday improvements: refinements, small adjustments, experience polish. | Compatible | `v0.1.3.2` → `v0.1.4.0` |
| F | Fix | Pure bug fixes, with no new functionality. At most two digits (0–99). | Compatible | `v0.1.3.2` → `v0.1.3.3` |

Examples:

- Research records show the wrong order → a bug → `v0.0.14.1` becomes `v0.0.14.2`.
- Tasks can be dragged to reorder → an improvement to an existing screen → `v0.0.14.2` becomes
  `v0.0.15.0`.
- The Wiki gains structured conclusions with versions and conflicts, a complete new module → it
  belongs to the next baseline, `v0.1.0.0`.

### How the number is stored

The app's updater and packager accept only three-part semver, so a release is stored as
`X.Y.(Z × 1000 + F)`:

| Version | Stored, tagged and published as |
|---|---|
| `v0.0.14.1` | `0.0.14001` (tag `v0.0.14001`) |
| `v0.0.15.0` | `0.0.15000` (tag `v0.0.15000`) |
| `v0.1.0.0` | `0.1.0` (tag `v0.1.0`) |

The app, installer names, release titles and the release badge show the four-part version.
Releases up to `v0.0.14` predate the scheme and keep their three-part numbers.
`node scripts/bump-version.mjs app 0.0.15` writes the stored number for you.

## 2. Branch names

| Branch | Name | Example |
|---|---|---|
| Work on a feature or improvement | `feature/vX.Y.Z.0/<module>/<feature-name>` | `feature/v0.0.15.0/desktop/task-drag-sort` |
| Work on a fix | `fix/vX.Y.Z.F/<module>/<fix-name>` | `fix/v0.0.14.2/desktop/research-record-layout` |
| Release of a feature version | `feature/vX.Y.Z.0/release` | `feature/v0.0.15.0/release` |
| Release of a fix version | `fix/vX.Y.Z.F/release` | `fix/v0.0.14.2/release` |
| Baseline | `baseline/vX.Y.0.0` | `baseline/v0.1.0.0` |

- `<module>` names the area of the codebase: `desktop`, `wiki`, `lab`, `harness`, `plugins`,
  `process` (versioning, CI, repository rules), and so on. `release` is reserved for release
  branches and is never a module name.
- The version in the name is the release the work ships in.
- A release branch ends in `/release` because git cannot hold a branch whose name is a prefix of
  other branches (`fix/v0.0.14.2` next to `fix/v0.0.14.2/desktop/...`).

## 3. Releasing a feature or fix version

1. Start every work branch from the tag of the latest published release.
2. Build and test on the work branch.
3. When every work branch of the version has passed its tests, merge each one into the version's
   release branch through a pull request (see [pull-requests.md](pull-requests.md)).
4. On the release branch, bump the version, pass the release checks below, then push the tag.
5. After a fix release, merge its release branch into every feature release branch still in
   progress, so the next feature version cannot ship without the fix.

Example, `v0.0.14.2`:

```text
v0.0.14001 (tag of v0.0.14.1)
 ├─ fix/v0.0.14.2/desktop/research-record-layout   ← the fix is built here
 └─ fix/v0.0.14.2/release                          ← merged here, bumped, tagged v0.0.14002
```

## 4. Releasing a baseline

1. Collect every released feature and fix branch whose `X.Y` belongs to the next baseline.
2. Merge them all into `baseline/vX.Y.0.0` and release it.
3. `master` always holds the latest baseline and moves only when a baseline is released. The agent
   plugins install from `master`, so they update with baselines.

The first baseline, `v0.1.0.0`, is cut when the owner decides. Until then `master` follows every
release: it moves to each `v0.0.x` release as soon as it is published.

## 5. Release channels

| Channel | Receives | On GitHub |
|---|---|---|
| Stable | Baselines (`vX.Y.0.0`) | Published as the latest release |
| Preview | Feature and fix releases | Published as pre-releases |

The app follows the stable channel unless the user switches its update channel to preview. Until
the first baseline, every `v0.0.x` release is published as the latest release so that every install
keeps updating.

## 6. Release checks

A tag is pushed only after all of these pass:

1. The checks, the tests of the changed areas, and the end-to-end specs covering them.
2. The new build opens a read-only copy of a real library written by the previous release, and its
   projects, overview, Wiki and feed load.
3. The owner reviews an unpacked build (`electron-builder --dir`) and approves the release.

The workflow keeps the release pages and installers of the newest five releases. It never deletes
a tag.

## 7. Branch lifecycle

A branch lives only as long as it is needed. Tags are the permanent record of every release: to
look at or fix an old version, start a new branch from its tag.

| Branch | Deleted when |
|---|---|
| Work branch `…/<module>/<name>` | Its pull request is merged into the release branch. GitHub deletes it automatically. |
| `fix/vX.Y.Z.F/release` | It has been released and is contained in the next feature release branch. |
| `feature/vX.Y.Z.0/release` | It has been released and merged into the next baseline. |
| `baseline/vX.Y.0.0` | Three newer baselines exist. Only the latest three baselines are kept. |
| Tag `v…` | Never. |

So at any time the repository holds only: branches with unmerged work, release branches not yet
contained in the next version, the latest three baselines, `master`, and every tag.

Rules that keep deletion safe:

- A release branch is deleted only after the check
  `git merge-base --is-ancestor <release branch> <branch that should contain it>` passes.
- Local branches are removed with `git branch -d`, which refuses a branch that is not merged.
- Work branches may be squash-merged into their release branch (one pull request, one commit).
  Release branches merge into the next version and into baselines with a merge commit, so their
  history stays reachable after the branch is gone.

Example: `v0.0.14.2` is released from `fix/v0.0.14.2/release`. Its work branch was deleted when its
pull request merged. `fix/v0.0.14.2/release` is merged into `feature/v0.0.15.0/release`, and once the
check above passes it is deleted. The tag `v0.0.14002` stays.
