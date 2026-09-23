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
  `release`, and so on.
- The version in the name is the release the work ships in.
- A release branch ends in `/release` because git cannot hold a branch whose name is a prefix of
  other branches (`fix/v0.0.14.2` next to `fix/v0.0.14.2/desktop/...`).

## 3. Releasing a feature or fix version

1. Start every work branch from the tag of the latest published release.
2. Build and test on the work branch.
3. When every work branch of the version has passed its tests, merge each one into the version's
   release branch through a pull request (see [pull-requests.md](pull-requests.md)).
4. On the release branch, bump the version, pass the release checks below, then push the tag.

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
4. Once baselines have advanced three versions past a baseline, delete every branch of that
   baseline and earlier. Example: releasing `v0.4.0.0` deletes the branches of `v0.1` and before.

The first baseline, `v0.1.0.0`, is cut when the owner decides. Until then `master` holds the latest
`v0.0.x` release.

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

The workflow keeps only the newest five releases.
