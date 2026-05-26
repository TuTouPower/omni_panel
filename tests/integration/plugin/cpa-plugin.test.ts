import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { executePlugin } from "../../../src/main/core/plugin/runner";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";
import { parsePluginResult } from "../../../src/main/core/plugin/output-parser";

const pluginSource = resolve(__dirname, "../../../resources/plugins/cpa-usage-plugin.ts");
const cacheDir = resolve(__dirname, "../../../.cache/cpa-test");
const nodePath = process.execPath;

interface RecordedRequest {
    readonly method: string;
    readonly url: string;
    readonly authorization: string;
    readonly body: unknown;
}

function readRequestBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolveBody, rejectBody) => {
        const chunks: Buffer[] = [];
        req.on("error", (err: unknown) => {
            rejectBody(err instanceof Error ? err : new Error(String(err)));
        });
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            try {
                resolveBody(body ? (JSON.parse(body) as unknown) : null);
            } catch (err) {
                rejectBody(err instanceof Error ? err : new Error(String(err)));
            }
        });
    });
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

async function withCpaServer<T>(
    handler: (baseUrl: string, requests: RecordedRequest[]) => Promise<T>,
): Promise<T> {
    const requests: RecordedRequest[] = [];
    const server = createServer((req, res) => {
        void (async () => {
            try {
                const body = await readRequestBody(req);
                requests.push({
                    method: req.method ?? "GET",
                    url: req.url ?? "",
                    authorization: req.headers.authorization ?? "",
                    body,
                });

                if (req.url === "/v0/management/auth-files") {
                    sendJson(res, 200, {
                        files: [
                            {
                                name: "auth-11111111-user@example.com-pro.json",
                                provider: "claude",
                                auth_index: "claude-auth",
                            },
                            {
                                name: "auth-disabled@example.com.json",
                                provider: "codex",
                                auth_index: "codex-auth",
                                disabled: true,
                            },
                        ],
                    });
                    return;
                }

                if (req.url === "/v0/management/api-call") {
                    sendJson(res, 200, {
                        status_code: 200,
                        body: {
                            five_hour: {
                                utilization: 0.25,
                                resets_at: "2026-05-26T20:00:00Z",
                            },
                            seven_day: {
                                utilization: 0.5,
                                resets_at: "2026-05-27T00:00:00Z",
                            },
                        },
                    });
                    return;
                }

                sendJson(res, 404, { error: `unexpected path ${req.url ?? ""}` });
            } catch (err) {
                sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
            }
        })();
    });

    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (typeof address !== "object" || address === null) {
        throw new Error("CPA test server did not expose a TCP address");
    }
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    try {
        return await handler(baseUrl, requests);
    } finally {
        await new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => {
                if (err) {
                    rejectClose(err);
                    return;
                }
                resolveClose();
            });
        });
    }
}

function compileCpaPlugin(): string {
    const outPath = resolve(cacheDir, "cpa-usage-plugin.js");
    mkdirSync(cacheDir, { recursive: true });
    const sdkDir = resolve(__dirname, "../../../src/plugins/sdk");
    execSync(
        `npx esbuild "${pluginSource}" --bundle --platform=node --format=cjs ` +
            `--alias:@omni-usage/plugin-sdk="${sdkDir}" ` +
            `--outfile="${outPath}"`,
        { stdio: "pipe" },
    );
    return outPath;
}

describe("CPA plugin subprocess", () => {
    let compiledPath: string;

    try {
        compiledPath = compileCpaPlugin();
    } catch {
        it.skip("skips — esbuild not available in test environment");
        return;
    }

    it("outputs error JSON when CPA-Manager is unreachable", async () => {
        const cmd = buildPluginCommand(
            compiledPath,
            {
                cpa_mgmt_url: "http://127.0.0.1:1",
                cpa_mgmt_key: "test-key",
            },
            "zh-Hans",
            nodePath,
        );
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        const output = parsePluginResult(result.stdout);
        expect(output.success).toBe(false);
    });

    it("fetches Claude quota through CPA-Manager when URL has trailing slash", async () => {
        await withCpaServer(async (baseUrl, requests) => {
            const cmd = buildPluginCommand(
                compiledPath,
                {
                    cpa_mgmt_url: `${baseUrl}/`,
                    cpa_mgmt_key: "secret-management-key",
                    monitor_claude: "true",
                },
                "zh-Hans",
                nodePath,
            );

            const result = await executePlugin(cmd);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain("secret-management-key");
            expect(result.stderr).not.toContain("secret-management-key");

            const output = parsePluginResult(result.stdout);
            expect(output.success).toBe(true);
            if (!output.success) throw new Error("expected successful CPA output");
            expect(output.items).toEqual([
                expect.objectContaining({
                    id: "claude:user@example.com:5小时",
                    name: "Claude (user@example.com) · 5小时",
                    used: 25,
                    limit: 100,
                    displayStyle: "percent",
                    status: "normal",
                    color: "blue",
                }),
                expect.objectContaining({
                    id: "claude:user@example.com:每周",
                    name: "Claude (user@example.com) · 每周",
                    used: 50,
                    limit: 100,
                    displayStyle: "percent",
                    status: "normal",
                    color: "blue",
                }),
            ]);
            expect(requests.map((request) => request.url)).toEqual([
                "/v0/management/auth-files",
                "/v0/management/api-call",
            ]);
            expect(
                requests.every(
                    (request) => request.authorization === "Bearer secret-management-key",
                ),
            ).toBe(true);
        });
    });

    it("does not call provider API when provider monitoring is disabled", async () => {
        await withCpaServer(async (baseUrl, requests) => {
            const cmd = buildPluginCommand(
                compiledPath,
                {
                    cpa_mgmt_url: baseUrl,
                    cpa_mgmt_key: "secret-management-key",
                    monitor_claude: "false",
                },
                "zh-Hans",
                nodePath,
            );

            const result = await executePlugin(cmd);
            expect(result.exitCode).toBe(0);
            const output = parsePluginResult(result.stdout);
            expect(output.success).toBe(true);
            if (!output.success) throw new Error("expected successful CPA output");
            expect(output.items).toEqual([]);
            expect(requests.map((request) => request.url)).toEqual(["/v0/management/auth-files"]);
        });
    });

    afterAll(() => {
        if (existsSync(cacheDir)) {
            rmSync(cacheDir, { recursive: true, force: true });
        }
    });
});
