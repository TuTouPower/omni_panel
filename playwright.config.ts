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
                baseURL: "http://127.0.0.1:5174",
            },
        },
        {
            name: "electron",
            testDir: "./tests/e2e/electron",
        },
        {
            // t280: CLI 全栈 e2e——chromium 驱动 web UI，后端为 --cli serve 真实无头实例。
            name: "cli",
            testDir: "./tests/e2e/cli",
            use: {
                viewport: { width: 1280, height: 800 },
                headless: true,
            },
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
            "pnpm build:web && pnpm exec vite preview --config vite.web.config.ts --port 5174 --strictPort --host 127.0.0.1",
        url: "http://127.0.0.1:5174",
        reuseExistingServer: true,
        timeout: 120_000,
    },
};

export default config;
