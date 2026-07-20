// 回放录的 local-api 响应。导出 create_mock_handler 供 vite plugin / 独立 server 复用。
// 独立运行：node tests/e2e/fixtures/mock_server.mjs（监听 17864，需先 pnpm e2e:gen-data）
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const RESP_FILE =
    process.env["MOCK_FIXTURE"] === "synthetic"
        ? resolve(ROOT, "tests/e2e/fixtures/synthetic.json")
        : resolve(ROOT, "tests/e2e/fixtures/data/responses.json");
const PORT = Number(process.env["MOCK_PORT"] || 17864);

export function create_mock_handler(responses) {
    function find_by(prefix) {
        const key = Object.keys(responses).find((k) => k.startsWith(prefix));
        return key ? responses[key] : null;
    }
    function json(res, body, status = 200) {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body ?? null));
    }
    const empty_ipc = () => ({ ok: true, data: {} });
    return (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const path = url.pathname;
        const exact = `${req.method} ${url.pathname}${url.search}`;
        if (responses[exact] !== undefined) return json(res, responses[exact]);

        if (path === "/v1/health") return json(res, { ok: true });
        if (req.method === "GET" && path === "/v1/connectors") {
            return json(res, responses["GET /v1/connectors"] ?? []);
        }
        if (req.method === "GET" && /^\/v1\/connectors\/[^/]+\/state$/.test(path)) {
            const id = decodeURIComponent(path.split("/")[3] ?? "");
            return json(res, responses[`GET /v1/connectors/${id}/state`] ?? empty_ipc());
        }
        if (req.method === "GET" && path === "/v1/config") {
            return json(res, responses["GET /v1/config"] ?? empty_ipc());
        }
        if (req.method === "GET" && path === "/v1/secrets") {
            const id = url.searchParams.get("instanceId");
            const key = id ? `GET /v1/secrets?instanceId=${id}` : null;
            return json(res, (key && responses[key]) ?? empty_ipc());
        }
        if (req.method === "GET" && path === "/v1/trend") {
            return json(res, responses[`GET /v1/trend?${url.searchParams.toString()}`] ?? []);
        }
        if (req.method === "GET" && ["/v1/records", "/v1/sessions", "/v1/buckets", "/v1/status"].includes(path)) {
            return json(res, responses[`${req.method} ${path}`] ?? []);
        }
        if (req.method === "POST") return json(res, empty_ipc());
        json(res, { error: `unmatched ${exact}` }, 404);
    };
}

function main() {
    if (!existsSync(RESP_FILE)) {
        const hint =
            process.env["MOCK_FIXTURE"] === "synthetic"
                ? "先跑 pnpm e2e:gen-synthetic"
                : "先跑 pnpm e2e:gen-data";
        console.error(`[mock_server] ${RESP_FILE} 不存在，${hint}`);
        process.exit(1);
    }
    const responses = JSON.parse(readFileSync(RESP_FILE, "utf8"));
    createServer((req, res) => create_mock_handler(responses)(req, res)).listen(PORT, () =>
        console.log(`[mock_server] listening on ${PORT}`),
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
