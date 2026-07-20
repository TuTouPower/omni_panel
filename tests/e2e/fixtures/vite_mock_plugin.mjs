// Vite plugin：preview server 内嵌 mock local-api 回放，单 server。
// vite preview 启动即带 mock，web e2e 只需启 vite preview 一个进程。
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { create_mock_handler } from "./mock_server.mjs";

export function mock_api_plugin() {
    return {
        name: "omniusage-mock-api",
        configurePreviewServer(server) {
            const f = resolve(process.cwd(), "tests/e2e/fixtures/data/responses.json");
            if (!existsSync(f)) {
                console.warn("[mock_api_plugin] responses.json 不存在，/v1/* 将 404；先跑 pnpm e2e:gen-data");
                return;
            }
            const responses = JSON.parse(readFileSync(f, "utf8"));
            const handler = create_mock_handler(responses);
            server.middlewares.use((req, res, next) => {
                const url = new URL(req.url, "http://localhost");
                if (!url.pathname.startsWith("/v1/")) return next();
                handler(req, res);
            });
            console.log("[mock_api_plugin] mock api mounted on /v1/*");
        },
    };
}
