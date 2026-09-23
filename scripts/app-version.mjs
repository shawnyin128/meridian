// Meridian names app releases MAJOR.LARGE.SMALL.FIX; the updater and packager accept only three-part
// semver, so the last two parts are stored together as SMALL * 1000 + FIX (0.0.14.1 is 0.0.14001).
// Releases up to 0.0.14 predate the scheme and stored SMALL alone.

/** Returns the stored semver for a display version of three or four parts; FIX is at most two digits. */
export function semverOf(display) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/.exec(display)
  if (match === null) throw new Error(`not an app version: ${display}`)
  const [, major, large, small, fix = '0'] = match
  if (Number(fix) > 99) throw new Error(`the fix version must be at most 99: ${display}`)
  return `${Number(major)}.${Number(large)}.${Number(small) * 1000 + Number(fix)}`
}

/** Returns the display version of a stored semver; a zero FIX is left off. */
export function displayOf(semver) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver)
  if (match === null) throw new Error(`not a stored app version: ${semver}`)
  const [major, large, packed] = match.slice(1).map(Number)
  if (major === 0 && large === 0 && packed < 1000) return semver
  const small = Math.floor(packed / 1000)
  const fix = packed % 1000
  return fix === 0 ? `${major}.${large}.${small}` : `${major}.${large}.${small}.${fix}`
}
