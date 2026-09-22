import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const electron = JSON.parse(readFileSync(new URL('../../node_modules/electron/package.json', import.meta.url), 'utf8'))
const sidecarName = process.platform === 'win32' ? 'meridian-harness.exe' : 'meridian-harness'
const sidecarDirectory = resolve(
  import.meta.dirname, '../harness/dist', `${process.platform}-${process.arch}`, 'meridian-harness',
)
const sidecar = resolve(sidecarDirectory, sidecarName)
if (!existsSync(sidecar)) {
  throw new Error(`Harness sidecar is missing. Run the package script that builds it first: ${sidecar}`)
}

/** Bundle electron-vite output, the icons it resolves at runtime, and the platform-matched Harness sidecar. */
export default {
  appId: 'app.meridian.desktop',
  productName: 'Meridian',
  electronVersion: electron.version,
  // `buildResources` is left at its default. Naming `resources` here would make electron-builder
  // exclude that directory from the app, and Main needs it: electron-vite treats `resources` as its
  // public directory, so a `?asset` icon import resolves to `resources/` beside `out/` at runtime
  // instead of being copied into `out/`. `mac.icon` and `win.icon` below still resolve because
  // electron-builder falls back to paths relative to the project directory.
  directories: { output: 'dist' },
  files: ['out/**/*', 'resources/**/*', 'package.json'],
  extraResources: [{ from: sidecarDirectory, to: 'harness' }],
  npmRebuild: false,
  // Installers and the update metadata electron-updater reads (latest.yml, latest-mac.yml) go to a
  // draft GitHub Release for the tag; the release workflow publishes the draft once every platform
  // has uploaded.
  publish: { provider: 'github', owner: 'shawnyin128', repo: 'meridian', releaseType: 'draft' },
  win: { target: 'nsis', icon: 'resources/icon.ico' },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    // latest.yml names the installer with hyphens, so the uploaded file must carry that exact name.
    artifactName: '${productName}-Setup-${version}.${ext}',
  },
  mac: {
    // The zip is what electron-updater reads on macOS to detect a newer release.
    target: ['dmg', 'zip'],
    icon: 'resources/icon.icns',
    category: 'public.app-category.productivity',
    // No Developer ID certificate is configured, so sign the bundle ad-hoc. Without this,
    // electron-builder leaves Electron's own linker signature in place over contents it has since
    // replaced, the bundle fails `codesign --verify`, and macOS calls a downloaded copy damaged with
    // no way to open it. Ad-hoc signing makes the bundle verify, so macOS reports an unidentified
    // developer instead and a tester can open it from the context menu. Replace '-' with the
    // Developer ID once one exists, and notarize; Gatekeeper accepts nothing less silently.
    identity: '-',
    // Only notarization requires the hardened runtime, and under it an ad-hoc signature has no team
    // identity for library validation to match, so the app would fail to load its own frameworks.
    hardenedRuntime: false,
  },
}
