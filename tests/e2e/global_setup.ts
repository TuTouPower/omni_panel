async function globalSetup(): Promise<void> {
    // web project 由 playwright `webServer` 自动 build:web + 起 vite preview（含 mock_api_plugin）。
    // default/packaged 仍需 out/main/index.js（`pnpm package` 或 `pnpm build` 产物）。
    // 这里只做最低限度提示，不替用户跑打包（慢）。
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = process.cwd();
    const has_main = fs.existsSync(path.join(root, "out/main/index.js"));
    console.log(
        `[E2E global setup] out/main: ${has_main ? "ready" : "missing (default/packaged 需 pnpm build)"}`,
    );
}

export default globalSetup;
