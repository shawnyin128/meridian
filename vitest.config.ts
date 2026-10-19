import { defineConfig } from 'vitest/config'

/** Tests cover apps/ and the scripts. */
export default defineConfig({
  // Match jsx: react-jsx in tsconfig.renderer.json so tests do not need React in scope.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['apps/**/*.test.ts', 'apps/**/*.test.tsx', 'scripts/**/*.test.mjs'],
  },
})
