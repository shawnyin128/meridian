import { defineConfig } from 'vitest/config'

/** Tests cover only apps/; plugins/vscode has its own runner and dependencies. */
export default defineConfig({
  // Match jsx: react-jsx in tsconfig.renderer.json so tests do not need React in scope.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['apps/**/*.test.ts', 'apps/**/*.test.tsx'],
  },
})
