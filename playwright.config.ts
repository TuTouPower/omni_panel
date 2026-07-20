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
            name: "web",
            testDir: "./tests/e2e/web",
            use: {
                baseURL: "http://localhost:5174",
            },
        },
        {
            name: "electron",
            testDir: "./tests/e2e/electron",
        },
        {
            name: "packaged",
            testDir: "./tests/e2e/packaged",
            timeout: 60_000,
            expect: { timeout: 15_000 },
            workers: 1,
        },
    ],
    webServer: {
        command:
            "pnpm build:web && vite preview --config vite.web.config.ts --port 5174 --strictPort",
        url: "http://localhost:5174",
        reuseExistingServer: true,
        timeout: 120_000,
    },
};

export default config;
