/**
 * Returns the four-part display version (MAJOR.LARGE.SMALL.FIX) of the stored three-part semver,
 * which packs SMALL * 1000 + FIX into its last part. Versions up to 0.0.14 predate the packing and
 * are shown as stored. Mirrors `displayOf` in `scripts/app-version.mjs`.
 */
export function displayVersion(semver: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver)
  if (match === null) return semver
  const [major, large, packed] = match.slice(1).map(Number) as [number, number, number]
  if (major === 0 && large === 0 && packed < 1000) return semver
  return `${major}.${large}.${Math.floor(packed / 1000)}.${packed % 1000}`
}
