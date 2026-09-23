<p align="center"><img src="assets/header.png" alt="Meridian — Research without boundaries"></p>

<p align="center">
  <a href="https://github.com/shawnyin128/meridian/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/shawnyin128/meridian?label=release"></a>
  <a href="LICENSE"><img alt="License: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue"></a>
  <img alt="Platform: Windows | macOS" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey">
  <a href="https://github.com/shawnyin128/meridian/actions/workflows/release-desktop.yml"><img alt="Release build" src="https://img.shields.io/github/actions/workflow/status/shawnyin128/meridian/release-desktop.yml?label=build"></a>
</p>

## Versions and branches

### Version number: `vX.Y.Z.F`

A release raises one position and resets every position to its right to zero
(`v1.0.3.5` → next minor → `v1.1.0.0`).

| Position | Name | Raise it when | Compatibility |
|---|---|---|---|
| X | Major | The architecture is rebuilt, the core direction changes, or a change breaks backward compatibility. | Breaking |
| Y | Minor (baseline) | A complete new module or feature lands. Every Y release is a baseline. | Compatible |
| Z | Iteration | Everyday improvements: refinements, small adjustments, experience polish. | Compatible |
| F | Fix | Pure bug fixes, with no new functionality. At most two digits (0–99). | Compatible |

The app's updater and packager accept only three-part semver, so a release is stored as
`X.Y.(Z × 1000 + F)`: `v0.0.14.1` is stored, tagged and published as `0.0.14001`. The app,
installer names and release titles show the four-part version. Releases up to `v0.0.14`
predate the scheme and keep their three-part numbers.

### Branch names

| Branch | Name |
|---|---|
| Baseline | `baseline/vX.Y.0.0` |
| Feature work | `feature/vX.Y.Z.0/<module>/<feature-name>` |
| Fix work | `fix/vX.Y.Z.F/<module>/<fix-name>` |
| Feature release | `feature/vX.Y.Z.0/release` |
| Fix release | `fix/vX.Y.Z.F/release` |

`<module>` names the area of the codebase, for example `desktop`, `wiki`, `lab` or `plugins`.
The version in a branch name is the release the work ships in. A release branch ends in
`/release` because git cannot hold a branch named like a prefix of other branches.

### Feature and fix releases

1. Start each branch from the tag of the latest published release.
2. Develop and test on the work branch (`feature/v…/<module>/…` or `fix/v…/<module>/…`).
3. When every work branch of one version has passed its tests, merge them all into that version's
   release branch (`feature/vX.Y.Z.0/release` or `fix/vX.Y.Z.F/release`).
4. Release from the release branch: bump the version, pass the release checks below, then push the
   tag.

### Baseline releases

1. Collect every released feature and fix branch whose `X.Y` belongs to the next baseline.
2. Merge them all into `baseline/vX.Y.0.0` and release it.
3. `master` always holds the latest baseline. It moves only when a baseline is released, so the
   agent plugins, which install from `master`, update with baselines.
4. Once baselines have advanced three versions past a baseline, delete every branch of that
   baseline and earlier (releasing `v0.4.0.0` removes the branches of `v0.1` and before).

### Release channels

| Channel | Releases | On GitHub |
|---|---|---|
| Stable | Baselines (`vX.Y.0.0`) | Published as the latest release |
| Preview | Feature and fix releases | Published as pre-releases |

The app follows the stable channel unless the user switches its update channel to preview.

The first baseline, `v0.1.0.0`, has not been cut yet. Until it is, `master` holds the latest
`v0.0.x` release, and every `v0.0.x` release is published as the latest release so that every
install keeps updating.

### Release checks

Before a tag is pushed:

- The checks, the tests of the changed areas, and only the end-to-end specs covering them pass.
- The new build opens a read-only copy of a real library written by the previous release.
- The owner reviews an unpacked build (`electron-builder --dir`) and approves the release.

## License

Meridian is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Personal, research, educational, and other noncommercial use is permitted. Any commercial
use requires a separate written license from the copyright holder.
