import type { PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
    timeout: 30_000,
    expect: { timeout: 10_000 },
    retries: 0,
    workers: 1,
    globalSetup: "./tests/e2e/global_setup.ts",
    use: {
        viewport: null,
        actionTimeout: 10_000,
    },
    outputDir: "./artifacts/e2e-artifacts",
    projects: [
        {
            name: "default",
            testDir: "./tests/e2e/specs",
        },
        {
            name: "packaged",
            testDir: "./tests/e2e/packaged",
            timeout: 60_000,
            expect: { timeout: 15_000 },
            workers: 1,
        },
    ],
};

export default config;
