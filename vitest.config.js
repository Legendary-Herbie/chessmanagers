import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/queryTestSetup.js'],
        include: ['src/**/*.test.{js,jsx}'],
        passWithNoTests: true,
        // Interactive page tests exercise full modal and async request flows.
        // Allow normal loaded-development-machine variance without masking
        // genuinely stalled tests.
        testTimeout: 10_000,
        hookTimeout: 10_000,
    },
});
