import type { PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
    testDir: "./tests/user_e2e/specs",
    timeout: 30_000,
    expect: { timeout: 10_000 },
    retries: 0,
    workers: 1,
    globalSetup: "./tests/user_e2e/global_setup.ts",
    use: {
        viewport: null,
        actionTimeout: 10_000,
    },
    outputDir: "./out/e2e-artifacts",
};

export default config;
