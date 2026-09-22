import { defineConfig } from '@playwright/test'

/**
 * End-to-end coverage against a real Electron process. Tests launch the packaged output in
 * `apps/desktop/out`, so the app must be built first (`npm run e2e` already does this). Use one
 * worker because every test needs exclusive ownership of an Electron instance.
 */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: [['list']],
  outputDir: '.superpowers/e2e-artifacts',
})
