import type { PlaywrightTestConfig } from "@playwright/test";

// t292: web e2e 全 mock 无外网依赖；playwright webServer 探测受代理 env 污染——
// 无服务端口探测被代理以 400 响应，误判「已可用」→ 跳过启动 → 直连 ECONNREFUSED
// （p097）。配置加载期清掉代理变量（大小写变体），只影响测试基建进程环境，
// 不写入或修改任何仓库文件。
delete process.env["http_proxy"];
delete process.env["https_proxy"];
delete process.env["HTTP_PROXY"];
delete process.env["HTTPS_PROXY"];
delete process.env["all_proxy"];
delete process.env["ALL_PROXY"];

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
    // t292: cli 项目自起 --cli serve 不依赖 webServer；E2E_NO_WEBSERVER=1（test:e2e:cli
    // 脚本）关闭闲置的 vite preview（p096）。playwright 1.60 无 project 级 webServer 开关，
    // 走配置条件化（exactOptionalPropertyTypes 下用展开避免 undefined 赋键）。
    ...(process.env["E2E_NO_WEBSERVER"] === "1"
        ? {}
        : {
              webServer: {
                  command:
                      "pnpm build:web && pnpm exec vite preview --config vite.web.config.ts --port 5174 --strictPort --host 127.0.0.1",
                  url: "http://127.0.0.1:5174",
                  reuseExistingServer: true,
                  timeout: 120_000,
              },
          }),
};

export default config;
