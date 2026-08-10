import { defineConfig } from 'vitest/config'

/**
 * Unit-test config (Phase 0 of docs/structural-refactor-plan.md).
 * Tests are colocated `src/**\/*.test.ts(x)` so `tsc --noEmit` typechecks
 * them alongside the code they cover. Node environment — engine/rules code
 * is pure TS; component tests (if we ever add them) would need jsdom.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
