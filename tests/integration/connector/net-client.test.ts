import { createServer, type IncomingMessage } from "node:http";
import { lstatSync, symlinkSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { create_connector_context } from "../../../src/main/core/connector/net-client";
import { create_file_vault_backend } from "../../../src/main/core/vault/file-vault-backend";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";
import type { Manifest } from "../../../src/shared/schemas/manifest";

let temp_dir: string;
let vault: VaultBackend;
let server_port: number;
let server: ReturnType<typeof createServer>;
let last_request_body: unknown;

function create_link(target: string, link_path: string, type: "dir" | "file"): void {
    if (process.platform === "win32") {
        if (type === "dir") {
            execSync(`cmd /c mklink /J "${link_path}" "${target}"`);
        } else {
            try {
                execSync(`cmd /c mklink "${link_path}" "${target}"`);
            } catch {
                execSync(`cmd /c mklink /H "${link_path}" "${target}"`);
            }
        }
    } else {
        symlinkSync(target, link_path, type);
    }
}

function get_test_manifest(
    auth: NonNullable<NonNullable<Manifest["poll"]>["request"]["auth"]> = {
        type: "bearer",
        secret: "api_key",
    },
): Manifest {
    return {
        id: "test",
        provider: "brave",
        capabilities: ["poll"],
        parameters: [{ name: "api_key", type: "secret", required: true, exposeToScript: false }],
        endpoints: { default: `http://127.0.0.1:${String(server_port)}` },
        poll: {
            request: {
                endpoint: "default",
                path: "/usage",
                method: "GET",
                auth,
            },
            map: { used: "$.usage.month", limit: "$.plan.limit", window: "month" },
        },
    };
}

function read_request_body(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => {
            body += chunk;
        });
        req.on("error", reject);
        req.on("end", () => {
            resolve(body ? (JSON.parse(body) as unknown) : null);
        });
    });
}

beforeAll(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "net-client-test-"));
    vault = await create_file_vault_backend(temp_dir);
    await vault.set("test-1:api_key", "sk-test-secret");

    server = createServer((req, res) => {
        void (async () => {
            last_request_body = await read_request_body(req);
            const url = new URL(req.url ?? "/", `http://127.0.0.1:${String(server_port)}`);
            const auth_is_valid =
                ((url.pathname === "/usage" || url.pathname === "/server-error") &&
                    req.headers.authorization === "Bearer sk-test-secret") ||
                (url.pathname === "/header" && req.headers["x-api-key"] === "sk-test-secret") ||
                (url.pathname === "/query" && url.searchParams.get("api_key") === "sk-test-secret");
            if (!auth_is_valid) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "unauthorized" }));
                return;
            }
            if (url.pathname === "/server-error") {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "internal failure", trace: "abc-123" }));
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ usage: { month: 42 }, plan: { limit: 1000 } }));
        })().catch(() => {
            res.writeHead(500);
            res.end();
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            if (addr && typeof addr === "object") server_port = addr.port;
            resolve();
        });
    });
});

afterAll(async () => {
    await new Promise<void>((resolve) => {
        server.close(() => {
            resolve();
        });
    });
    await rm(temp_dir, { recursive: true, force: true });
});

describe("net-client", () => {
    it("injects auth header from vault and returns JSON", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});
        const result = await ctx.http.get_json("default", "/usage");
        expect(result).toEqual({ usage: { month: 42 }, plan: { limit: 1000 } });
    });

    it("injects custom header auth from vault", async () => {
        const ctx = create_connector_context(
            get_test_manifest({ type: "header", secret: "api_key", header_name: "x-api-key" }),
            vault,
            "test-1",
            {},
        );
        const result = await ctx.http.get_json("default", "/header");
        expect(result).toEqual({ usage: { month: 42 }, plan: { limit: 1000 } });
    });

    it("injects query auth from vault", async () => {
        const ctx = create_connector_context(
            get_test_manifest({ type: "query", secret: "api_key", query_param: "api_key" }),
            vault,
            "test-1",
            {},
        );
        const result = await ctx.http.get_json("default", "/query");
        expect(result).toEqual({ usage: { month: 42 }, plan: { limit: 1000 } });
    });

    it("rejects when vault has no secret", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "missing-instance", {});
        await expect(ctx.http.get_json("default", "/usage")).rejects.toThrow("401");
    });

    it("HTTP error message includes status code but not body content", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});
        await expect(ctx.http.get_json("default", "/server-error")).rejects.toThrow(/HTTP 500/);
        await expect(ctx.http.get_json("default", "/server-error")).rejects.not.toThrow(
            /internal failure/,
        );
    });

    it("uses endpoint override", async () => {
        const ctx = create_connector_context(
            { ...get_test_manifest(), endpoints: { default: "http://127.0.0.1:1" } },
            vault,
            "test-1",
            { endpoint_overrides: { default: `http://127.0.0.1:${String(server_port)}` } },
        );
        const result = await ctx.http.get_json("default", "/usage");
        expect(result).toEqual({ usage: { month: 42 }, plan: { limit: 1000 } });
    });

    it("posts JSON body", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});
        await ctx.http.post_json("default", "/usage", { hello: "world" });
        expect(last_request_body).toEqual({ hello: "world" });
    });

    it("reads allowlisted local files", async () => {
        const file_path = join(temp_dir, "credentials.json");
        await writeFile(file_path, "secret-file", "utf8");
        const manifest = {
            ...get_test_manifest(),
            capabilities: ["poll", "local"],
            local: { paths: [file_path] },
        } satisfies Manifest;
        const ctx = create_connector_context(manifest, vault, "test-1", {});

        await expect(ctx.files.read(file_path)).resolves.toBe("secret-file");
    });

    it("rejects local file paths outside manifest allowlist", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});

        await expect(ctx.files.read(join(temp_dir, "credentials.json"))).rejects.toThrow(
            "Local file path is not allowed",
        );
    });

    it("reads files inside allowlisted directory prefix", async () => {
        const dir = join(temp_dir, "codex-sessions");
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "rollout-1.jsonl"), "line1\n", "utf8");
        const manifest = {
            ...get_test_manifest(),
            capabilities: ["poll", "local"],
            local: { paths: [dir] },
        } satisfies Manifest;
        const ctx = create_connector_context(manifest, vault, "test-1", {});

        await expect(ctx.files.read(join(dir, "rollout-1.jsonl"))).resolves.toBe("line1\n");
    });

    it("lists files under allowlisted directory", async () => {
        const dir = join(temp_dir, "sessions-root");
        const sub = join(dir, "2026");
        await mkdir(sub, { recursive: true });
        await writeFile(join(sub, "a.jsonl"), "{}\n", "utf8");
        await writeFile(join(sub, "b.jsonl"), "{}\n", "utf8");
        const manifest = {
            ...get_test_manifest(),
            capabilities: ["poll", "local"],
            local: { paths: [dir] },
        } satisfies Manifest;
        const ctx = create_connector_context(manifest, vault, "test-1", {});

        const files = await ctx.files.list(dir);
        expect(files.map((f) => f).sort()).toEqual(
            [join(sub, "a.jsonl"), join(sub, "b.jsonl")].sort(),
        );
    });

    it("rejects listing outside allowlisted directory", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});

        await expect(ctx.files.list(temp_dir)).rejects.toThrow("not allowed");
    });

    it("files.list skips symlinks to prevent directory traversal", async () => {
        const dir = join(temp_dir, "symlink-test-list");
        const outside = join(temp_dir, "outside-secrets");
        await mkdir(dir, { recursive: true });
        await mkdir(outside, { recursive: true });
        await writeFile(join(outside, "secret.txt"), "TOP SECRET", "utf8");
        create_link(outside, join(dir, "escape-link"), "dir");

        const manifest = {
            ...get_test_manifest(),
            capabilities: ["poll", "local"],
            local: { paths: [dir] },
        } satisfies Manifest;
        const ctx = create_connector_context(manifest, vault, "test-1", {});

        const files = await ctx.files.list(dir);
        expect(files).toEqual([]);
    });

    it("files.list skips file symlinks pointing outside allowed dir", async () => {
        const dir = join(temp_dir, "symlink-test-file");
        const outside = join(temp_dir, "outside-file");
        await mkdir(dir, { recursive: true });
        await mkdir(outside, { recursive: true });
        await writeFile(join(outside, "data.json"), '{"secret":true}', "utf8");
        const link_path = join(dir, "link.json");
        create_link(join(outside, "data.json"), link_path, "file");

        // Verify the link is actually a symlink (not a hard link)
        if (!lstatSync(link_path).isSymbolicLink()) {
            // Hard link can't be detected by lstat; skip on this platform
            return;
        }

        const manifest = {
            ...get_test_manifest(),
            capabilities: ["poll", "local"],
            local: { paths: [dir] },
        } satisfies Manifest;
        const ctx = create_connector_context(manifest, vault, "test-1", {});

        const files = await ctx.files.list(dir);
        expect(files).toEqual([]);
    });

    describe("requireExplicitEndpoints", () => {
        it("throws when flag is true and no override provided", async () => {
            const manifest = {
                ...get_test_manifest(),
                requireExplicitEndpoints: true,
            };
            const ctx = create_connector_context(manifest, vault, "test-1", {});
            await expect(ctx.http.get_json("default", "/usage")).rejects.toThrow(
                /requires explicit configuration/,
            );
        });

        it("uses override when flag is true and override is provided", async () => {
            const manifest = {
                ...get_test_manifest(),
                requireExplicitEndpoints: true,
            };
            const ctx = create_connector_context(manifest, vault, "test-1", {
                endpoint_overrides: { default: `http://127.0.0.1:${String(server_port)}` },
            });
            const result = await ctx.http.get_json("default", "/usage");
            expect(result).toEqual({ usage: { month: 42 }, plan: { limit: 1000 } });
        });

        it("falls back to manifest default when flag is false/undefined", async () => {
            const manifest = get_test_manifest();
            const ctx = create_connector_context(manifest, vault, "test-1", {});
            const result = await ctx.http.get_json("default", "/usage");
            expect(result).toEqual({ usage: { month: 42 }, plan: { limit: 1000 } });
        });
    });
});
