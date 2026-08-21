import { defineConfig } from 'vitest/config';
import { configureTestEnvironment } from './src/test/testEnvironment.js';

configureTestEnvironment();

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.js'],
        globalSetup: ['./src/test/globalSetup.js'],
        setupFiles: ['./src/test/setup.js'],
        fileParallelism: false,
        maxWorkers: 1,
        testTimeout: 15_000,
        hookTimeout: 30_000,
    },
});

