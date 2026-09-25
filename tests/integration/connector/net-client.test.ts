import { createServer, type IncomingMessage } from "node:http";
import { symlinkSync, existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { create_connector_context } from "../../../src/main/core/connector/net-client";
import { create_file_vault_backend } from "../../../src/main/core/vault/file-vault-backend";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";
import type { Manifest } from "../../../src/shared/schemas/manifest";

// t501: ESM 下 vi.spyOn(os, "homedir") 不可配置（module namespace），改用
// vi.mock("node:os") 重定向 homedir 到隔离临时目录（同 collector-local.test.ts
// 模式），全程不触碰开发者真实 ~。homedir_mock.dir 即 mock 的 os.homedir() 返回值。
const homedir_mock = vi.hoisted(() => ({ dir: "" }));
vi.mock(import("node:os"), async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, homedir: () => homedir_mock.dir };
});

let temp_dir: string;
let vault: VaultBackend;
let server_port: number;
let server: ReturnType<typeof createServer>;
let last_request_body: unknown;

function create_link(target: string, link_path: string, type: "dir" | "file"): boolean {
    try {
        // On Windows, directory junctions don't require admin privileges,
        // but file symlinks do. symlinkSync handles both; if it throws
        // (insufficient privilege), return false so callers skip the test.
        if (process.platform === "win32" && type === "dir") {
            symlinkSync(target, link_path, "junction");
        } else {
            symlinkSync(target, link_path, type);
        }
        // On Windows, symlinkSync can silently succeed without actually
        // creating the link when the user lacks admin/Developer Mode.
        // Verify the link exists before reporting success.
        return existsSync(link_path);
    } catch {
        return false;
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
        provider: "claude",
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
    temp_dir = await realpath(await mkdtemp(join(tmpdir(), "net-client-test-")));
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
            if (!auth_is_valid && url.pathname !== "/hang" && url.pathname !== "/slow-body") {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "unauthorized" }));
                return;
            }
            if (url.pathname === "/server-error") {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "internal failure", trace: "abc-123" }));
                return;
            }
            if (url.pathname === "/hang") {
                // Never respond — used to test total timeout
                return;
            }
            if (url.pathname === "/slow-body") {
                // Send headers immediately, then drip body slowly
                res.writeHead(200, { "Content-Type": "application/json" });
                res.write("{");
                // Never finish the body
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
}, 60_000);

afterAll(async () => {
    await new Promise<void>((resolve) => {
        server.close(() => {
            resolve();
        });
    });
    await rm(temp_dir, { recursive: true, force: true });
});

describe("net-client", () => {
    it("does not log response body on JSON parse failure (t295)", async () => {
        const { addTransport, getLogLevel, setLogLevel } =
            await import("../../../src/shared/lib/logger");
        const lines: string[] = [];
        const remove = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        const previous_level = getLogLevel();
        setLogLevel("debug");
        const bad = createServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end("{broken sensitive-leak-data-xyz");
        });
        try {
            await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
            const addr = bad.address() as { port: number };
            const ctx = create_connector_context(
                {
                    ...get_test_manifest(),
                    endpoints: { default: `http://127.0.0.1:${String(addr.port)}` },
                },
                vault,
                "test-1",
                {},
            );
            await expect(ctx.http.get_json("default", "/usage")).rejects.toThrow();
            const joined = lines.join("\n");
            // 响应体原文不得落入日志（可能含凭据/PII）
            expect(joined).not.toContain("sensitive-leak-data-xyz");
            // 诊断字段保留：path + status + contentType + bodyBytes（来自 warn meta）
            expect(joined).toMatch(/JSON parse failed/);
            expect(joined).toContain("/usage");
            const warn_line = lines.find((l) => l.includes("JSON parse failed"));
            expect(warn_line).toBeDefined();
            expect(warn_line).toContain('"status":200');
            expect(warn_line).toContain('"contentType":"application/json"');
            expect(warn_line).toContain('"bodyBytes":');
        } finally {
            remove();
            bad.close();
            setLogLevel(previous_level);
        }
    });

    it("does not log response body on HTTP error (t295)", async () => {
        const { addTransport, getLogLevel, setLogLevel } =
            await import("../../../src/shared/lib/logger");
        const lines: string[] = [];
        const remove = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        const previous_level = getLogLevel();
        setLogLevel("debug");
        const bad = createServer((_req, res) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end('{"error":"internal","trace":"leak-400-body-sensitive"}');
        });
        try {
            await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
            const addr = bad.address() as { port: number };
            const ctx = create_connector_context(
                {
                    ...get_test_manifest(),
                    endpoints: { default: `http://127.0.0.1:${String(addr.port)}` },
                },
                vault,
                "test-1",
                {},
            );
            await expect(ctx.http.get_json("default", "/usage")).rejects.toThrow(/HTTP 500/);
            const joined = lines.join("\n");
            // ≥400 响应体不得落日志（原 body_text.slice(0,200) 会含敏感串）
            expect(joined).not.toContain("leak-400-body-sensitive");
        } finally {
            remove();
            bad.close();
            setLogLevel(previous_level);
        }
    });

    it("does not log response body on get_raw HTTP error (t295)", async () => {
        const { addTransport, getLogLevel, setLogLevel } =
            await import("../../../src/shared/lib/logger");
        const lines: string[] = [];
        const remove = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        const previous_level = getLogLevel();
        setLogLevel("debug");
        const bad = createServer((_req, res) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end('{"trace":"leak-getraw-body-sensitive"}');
        });
        try {
            await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
            const addr = bad.address() as { port: number };
            const ctx = create_connector_context(
                {
                    ...get_test_manifest(),
                    endpoints: { default: `http://127.0.0.1:${String(addr.port)}` },
                },
                vault,
                "test-1",
                {},
            );
            await expect(ctx.http.get_raw("default", "/usage")).rejects.toThrow(/HTTP 500/);
            const joined = lines.join("\n");
            expect(joined).not.toContain("leak-getraw-body-sensitive");
        } finally {
            remove();
            bad.close();
            setLogLevel(previous_level);
        }
    });

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

    it("large error body count comes from content-length header, not full body read (t372 AC-002)", async () => {
        const bad = createServer((_req, res) => {
            res.on("error", () => undefined);
            // 声明 3MB 但只发 64B：若实现读 body 计数会得 64，3MB 计数只能来自
            // content-length 头——证明超大错误 body 未读满即丢弃。
            res.writeHead(500, { "Content-Type": "application/json", "content-length": "3145728" });
            res.end('{"trace":"count-from-header"}');
        });
        try {
            await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
            const addr = bad.address() as { port: number };
            const ctx = create_connector_context(
                {
                    ...get_test_manifest(),
                    endpoints: { default: `http://127.0.0.1:${String(addr.port)}` },
                },
                vault,
                "test-1",
                {},
            );
            await expect(ctx.http.get_json("default", "/usage")).rejects.toThrow(
                /HTTP 500: request failed \(3145728 bytes\)/,
            );
        } finally {
            bad.closeAllConnections();
            bad.close();
        }
    });

    it("large chunked error body is not read past the small cap (t372 AC-002)", async () => {
        const bad = createServer((_req, res) => {
            res.on("error", () => undefined);
            // chunked（无 content-length）超大 body：read_body_with_limit 在 1MB 处破坏流
            res.writeHead(500, { "Content-Type": "application/octet-stream" });
            res.write(Buffer.alloc(2 * 1024 * 1024, 0x61));
            res.end();
        });
        try {
            await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
            const addr = bad.address() as { port: number };
            const ctx = create_connector_context(
                {
                    ...get_test_manifest(),
                    endpoints: { default: `http://127.0.0.1:${String(addr.port)}` },
                },
                vault,
                "test-1",
                {},
            );
            await expect(ctx.http.get_json("default", "/usage")).rejects.toThrow(
                /Response body exceeds 1048576 bytes/,
            );
        } finally {
            bad.closeAllConnections();
            bad.close();
        }
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

    it("rejects an absolute URL path so vault auth cannot be exfiltrated (t294)", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});
        await expect(ctx.http.get_json("default", "https://evil.example/steal")).rejects.toThrow(
            /origin|Refusing/,
        );
    });

    it("rejects a protocol-relative path so vault auth cannot be exfiltrated (t294)", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});
        await expect(ctx.http.get_json("default", "//evil.example/steal")).rejects.toThrow(
            /origin|Refusing/,
        );
    });

    it("rejects an out-of-origin path from get_raw too (t294)", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});
        await expect(ctx.http.get_raw("default", "https://evil.example/steal")).rejects.toThrow(
            /origin|Refusing/,
        );
    });

    it("rejects an out-of-origin protocol-relative path from post_json (poll channel) (t294)", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});
        await expect(
            ctx.http.post_json("default", "//evil.example/steal", { hello: "world" }),
        ).rejects.toThrow(/Refusing connector request to origin outside endpoint/);
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

    it("rejects reading symlink pointing outside allowed directories", async () => {
        const dir = join(temp_dir, "symlink-read-test");
        const outside = join(temp_dir, "outside-read");
        await mkdir(dir, { recursive: true });
        await mkdir(outside, { recursive: true });
        await writeFile(join(outside, "secret.txt"), "TOP SECRET", "utf8");
        const link_path = join(dir, "escape-link.txt");
        if (!create_link(join(outside, "secret.txt"), link_path, "file")) {
            // Symlinks not available on this platform (Windows needs admin/Developer Mode)
            return;
        }

        const manifest = {
            ...get_test_manifest(),
            capabilities: ["poll", "local"],
            local: { paths: [dir] },
        } satisfies Manifest;
        const ctx = create_connector_context(manifest, vault, "test-1", {});

        await expect(ctx.files.read(link_path)).rejects.toThrow(
            "symlink target outside allowed directories",
        );
    });

    it("allows reading symlink pointing inside allowed directories", async () => {
        const dir = join(temp_dir, "symlink-read-ok");
        const sub = join(dir, "data");
        await mkdir(sub, { recursive: true });
        await writeFile(join(sub, "file.txt"), "hello", "utf8");
        const link_path = join(dir, "link.txt");
        if (!create_link(join(sub, "file.txt"), link_path, "file")) {
            return;
        }

        const manifest = {
            ...get_test_manifest(),
            capabilities: ["poll", "local"],
            local: { paths: [dir] },
        } satisfies Manifest;
        const ctx = create_connector_context(manifest, vault, "test-1", {});

        await expect(ctx.files.read(link_path)).resolves.toBe("hello");
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
        if (!create_link(join(outside, "data.json"), link_path, "file")) {
            // Symlinks not available on this platform (Windows needs admin/Developer Mode)
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

    describe("tilde expansion (t501 AC-001/002/004)", () => {
        it("reads file via ~/ whitelist after homedir mock", async () => {
            const fake_home = await realpath(await mkdtemp(join(tmpdir(), "t501-home-")));
            try {
                const fake_sub = join(fake_home, ".codex");
                await mkdir(fake_sub, { recursive: true });
                await writeFile(join(fake_sub, "auth.json"), "tilde-ok", "utf8");
                homedir_mock.dir = fake_home;
                try {
                    const manifest = {
                        ...get_test_manifest(),
                        capabilities: ["poll", "local"],
                        local: { paths: ["~/.codex/auth.json", "~/.codex/sessions"] },
                    } satisfies Manifest;
                    // 白名单用 ~ 声明，待检用绝对路径与 ~ 两种形态均应通过（双边规范化）。
                    const ctx = create_connector_context(manifest, vault, "test-1", {});
                    await expect(ctx.files.read("~/.codex/auth.json")).resolves.toBe("tilde-ok");
                    await expect(
                        ctx.files.read(join(fake_home, ".codex", "auth.json")),
                    ).resolves.toBe("tilde-ok");
                } finally {
                    homedir_mock.dir = "";
                }
            } finally {
                await rm(fake_home, { recursive: true, force: true });
            }
        });

        it("reads via bare ~ whitelist root", async () => {
            const fake_home = await realpath(await mkdtemp(join(tmpdir(), "t501-home-bare-")));
            try {
                const sub = join(fake_home, "sub");
                await mkdir(sub, { recursive: true });
                await writeFile(join(sub, "file.txt"), "bare-ok", "utf8");
                homedir_mock.dir = fake_home;
                try {
                    const manifest = {
                        ...get_test_manifest(),
                        capabilities: ["poll", "local"],
                        local: { paths: ["~"] },
                    } satisfies Manifest;
                    const ctx = create_connector_context(manifest, vault, "test-1", {});
                    await expect(ctx.files.read("~/sub/file.txt")).resolves.toBe("bare-ok");
                } finally {
                    homedir_mock.dir = "";
                }
            } finally {
                await rm(fake_home, { recursive: true, force: true });
            }
        });

        it("expands ~\\ prefix the same as ~/ (t501 AC-001)", async () => {
            const fake_home = await realpath(await mkdtemp(join(tmpdir(), "t501-home-bs-")));
            try {
                const sub = join(fake_home, "sub2");
                await mkdir(sub, { recursive: true });
                await writeFile(join(sub, "file.txt"), "backslash-ok", "utf8");
                homedir_mock.dir = fake_home;
                try {
                    const manifest = {
                        ...get_test_manifest(),
                        capabilities: ["poll", "local"],
                        local: { paths: ["~\\sub2"] },
                    } satisfies Manifest;
                    const ctx = create_connector_context(manifest, vault, "test-1", {});
                    await expect(ctx.files.read("~\\sub2/file.txt")).resolves.toBe("backslash-ok");
                } finally {
                    homedir_mock.dir = "";
                }
            } finally {
                await rm(fake_home, { recursive: true, force: true });
            }
        });

        it("resolves relative paths before whitelist check", async () => {
            const fake_home = await realpath(await mkdtemp(join(tmpdir(), "t501-home-rel-")));
            try {
                const sub = join(fake_home, "relsub");
                await mkdir(sub, { recursive: true });
                await writeFile(join(sub, "a.txt"), "rel-ok", "utf8");
                homedir_mock.dir = fake_home;
                try {
                    const manifest = {
                        ...get_test_manifest(),
                        capabilities: ["poll", "local"],
                        local: { paths: ["~/relsub"] },
                    } satisfies Manifest;
                    const ctx = create_connector_context(manifest, vault, "test-1", {});
                    // 绝对路径形态通过。
                    await expect(ctx.files.read(join(fake_home, "relsub", "a.txt"))).resolves.toBe(
                        "rel-ok",
                    );
                    // 白名单外绝对路径拒绝。
                    await expect(ctx.files.read(join(fake_home, "outside.txt"))).rejects.toThrow(
                        "not allowed",
                    );
                } finally {
                    homedir_mock.dir = "";
                }
            } finally {
                await rm(fake_home, { recursive: true, force: true });
            }
        });

        it("rejects .. traversal outside ~/ whitelist", async () => {
            const fake_home = await realpath(await mkdtemp(join(tmpdir(), "t501-home-dotdot-")));
            try {
                const sub = join(fake_home, "allowed");
                await mkdir(sub, { recursive: true });
                await writeFile(join(sub, "ok.txt"), "ok", "utf8");
                await writeFile(join(fake_home, "secret.txt"), "TOP SECRET", "utf8");
                homedir_mock.dir = fake_home;
                try {
                    const manifest = {
                        ...get_test_manifest(),
                        capabilities: ["poll", "local"],
                        local: { paths: ["~/allowed"] },
                    } satisfies Manifest;
                    const ctx = create_connector_context(manifest, vault, "test-1", {});
                    await expect(ctx.files.read("~/allowed/ok.txt")).resolves.toBe("ok");
                    await expect(ctx.files.read("~/allowed/../secret.txt")).rejects.toThrow(
                        "not allowed",
                    );
                } finally {
                    homedir_mock.dir = "";
                }
            } finally {
                await rm(fake_home, { recursive: true, force: true });
            }
        });

        it("does not expand ~otheruser (treated as relative and rejected)", async () => {
            const fake_home = await realpath(await mkdtemp(join(tmpdir(), "t501-home-other-")));
            try {
                homedir_mock.dir = fake_home;
                try {
                    const manifest = {
                        ...get_test_manifest(),
                        capabilities: ["poll", "local"],
                        local: { paths: ["~/allowed"] },
                    } satisfies Manifest;
                    const ctx = create_connector_context(manifest, vault, "test-1", {});
                    await expect(ctx.files.read("~otheruser/allowed/ok.txt")).rejects.toThrow(
                        "not allowed",
                    );
                } finally {
                    homedir_mock.dir = "";
                }
            } finally {
                await rm(fake_home, { recursive: true, force: true });
            }
        });

        it("rejects symlink escaping ~/ whitelist (t501 AC-004)", async () => {
            const fake_home = await realpath(await mkdtemp(join(tmpdir(), "t501-home-link-")));
            try {
                const allowed = join(fake_home, "allowed");
                const outside = join(fake_home, "outside");
                await mkdir(allowed, { recursive: true });
                await mkdir(outside, { recursive: true });
                await writeFile(join(outside, "secret.txt"), "TOP SECRET", "utf8");
                const link_path = join(allowed, "escape.txt");
                if (!create_link(join(outside, "secret.txt"), link_path, "file")) {
                    return;
                }
                homedir_mock.dir = fake_home;
                try {
                    const manifest = {
                        ...get_test_manifest(),
                        capabilities: ["poll", "local"],
                        local: { paths: ["~/allowed"] },
                    } satisfies Manifest;
                    const ctx = create_connector_context(manifest, vault, "test-1", {});
                    await expect(ctx.files.read("~/allowed/escape.txt")).rejects.toThrow(
                        "symlink target outside allowed directories",
                    );
                } finally {
                    homedir_mock.dir = "";
                }
            } finally {
                await rm(fake_home, { recursive: true, force: true });
            }
        });

        it("files.list uses same resolved absolute path as files.read (t501 AC-002)", async () => {
            const fake_home = await realpath(await mkdtemp(join(tmpdir(), "t501-home-list-")));
            try {
                const sessions = join(fake_home, "sessions");
                const sub = join(sessions, "2026");
                await mkdir(sub, { recursive: true });
                await writeFile(join(sub, "a.jsonl"), "{}\n", "utf8");
                homedir_mock.dir = fake_home;
                try {
                    const manifest = {
                        ...get_test_manifest(),
                        capabilities: ["poll", "local"],
                        local: { paths: ["~/sessions"] },
                    } satisfies Manifest;
                    const ctx = create_connector_context(manifest, vault, "test-1", {});
                    const files = await ctx.files.list("~/sessions");
                    expect(files.map((f) => resolve(f)).sort()).toEqual(
                        [resolve(join(sub, "a.jsonl"))].sort(),
                    );
                    // 白名单外目录拒绝（先 resolve 再比对）。
                    await expect(ctx.files.list("~/other")).rejects.toThrow("not allowed");
                    await expect(ctx.files.list("~/sessions/../outside")).rejects.toThrow(
                        "not allowed",
                    );
                } finally {
                    homedir_mock.dir = "";
                }
            } finally {
                await rm(fake_home, { recursive: true, force: true });
            }
        });
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

    describe("total timeout (regression: HTTP requests hang forever)", () => {
        it("aborts request when total timeout elapses on hanging server", async () => {
            const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {
                endpoint_overrides: { default: `http://127.0.0.1:${String(server_port)}` },
                timeout_ms: 500,
            });
            const start = Date.now();
            // t371 AC-002: 超时 abort reason 含 timeout 字样——下游 is_timeout_error
            // 分类依赖（原裸 AbortError 无 timeout 无法识别）。
            await expect(ctx.http.get_json("default", "/hang")).rejects.toThrow(/timed? out/i);
            expect(Date.now() - start).toBeLessThan(5000);
        });

        it("per-request timeout_ms overrides default timeout", async () => {
            const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {
                endpoint_overrides: { default: `http://127.0.0.1:${String(server_port)}` },
                timeout_ms: 30_000,
            });
            const start = Date.now();
            await expect(
                ctx.http.get_json("default", "/hang", { timeout_ms: 300 }),
            ).rejects.toThrow();
            expect(Date.now() - start).toBeLessThan(5000);
        });

        it("timeout is cleaned up after successful request", async () => {
            const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {
                endpoint_overrides: { default: `http://127.0.0.1:${String(server_port)}` },
                timeout_ms: 500,
            });
            // First request succeeds — timer should be cleared
            const result = await ctx.http.get_json("default", "/usage");
            expect(result).toEqual({ usage: { month: 42 }, plan: { limit: 1000 } });
            // Wait past the timeout — no spurious abort should occur
            await new Promise((r) => setTimeout(r, 700));
            const result2 = await ctx.http.get_json("default", "/usage");
            expect(result2).toEqual({ usage: { month: 42 }, plan: { limit: 1000 } });
        });

        it("get_raw also respects total timeout", async () => {
            const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {
                endpoint_overrides: { default: `http://127.0.0.1:${String(server_port)}` },
                timeout_ms: 500,
            });
            const start = Date.now();
            await expect(ctx.http.get_raw("default", "/hang")).rejects.toThrow();
            expect(Date.now() - start).toBeLessThan(5000);
        });

        it("aborts slow body stream after total timeout", async () => {
            const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {
                endpoint_overrides: { default: `http://127.0.0.1:${String(server_port)}` },
                timeout_ms: 500,
            });
            const start = Date.now();
            await expect(ctx.http.get_json("default", "/slow-body")).rejects.toThrow();
            expect(Date.now() - start).toBeLessThan(5000);
        });
    });

    it("refuses GET to a cloud-metadata endpoint via override", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {
            endpoint_overrides: { default: "http://169.254.169.254" },
        });
        await expect(ctx.http.get_json("default", "/latest/meta-data/iam/")).rejects.toThrow(
            /Refusing connector request to metadata host/,
        );
    });

    it("refuses POST to metadata.google.internal via override", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {
            endpoint_overrides: { default: "http://metadata.google.internal" },
        });
        await expect(ctx.http.post_json("default", "/", {})).rejects.toThrow(
            /Refusing connector request to metadata host/,
        );
    });

    it("does not refuse loopback (local dev/test fixtures must work)", async () => {
        const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});
        // 127.0.0.1 is the test server; this must NOT throw the metadata error.
        await expect(ctx.http.get_json("default", "/usage")).resolves.toBeDefined();
    });

    describe("build_request_context", () => {
        it("exists and returns { url, headers, abort_controller, timeout_id } structure", async () => {
            const { __test__ } = await import("../../../src/main/core/connector/net-client");
            const build_request_context = __test__.build_request_context;
            expect(typeof build_request_context).toBe("function");

            const ctx = await build_request_context(
                get_test_manifest(),
                "default",
                vault,
                "test-1",
                {
                    path: "/usage",
                    default_timeout_ms: 15_000,
                    initial_headers: { "Content-Type": "application/json" },
                },
            );

            // 结构断言：四个必备字段齐全
            expect(ctx).toHaveProperty("url");
            expect(ctx).toHaveProperty("headers");
            expect(ctx).toHaveProperty("abort_controller");
            expect(ctx).toHaveProperty("timeout_id");

            // url 指向请求路径
            expect(ctx.url).toBeInstanceOf(URL);
            expect(ctx.url.pathname).toBe("/usage");

            // headers 已注入 bearer auth + 初始 Content-Type
            expect(ctx.headers["Authorization"]).toBe("Bearer sk-test-secret");
            expect(ctx.headers["Content-Type"]).toBe("application/json");

            // abort_controller 是 AbortController
            expect(ctx.abort_controller).toBeInstanceOf(AbortController);

            // timeout_id 是有效的 timer 句柄
            expect(ctx.timeout_id).toBeDefined();
            expect(typeof ctx.timeout_id).toBe("object");

            // 清理 timer 避免泄漏
            clearTimeout(ctx.timeout_id);
        });

        it("applies per-request timeout_ms override over default", async () => {
            const { __test__ } = await import("../../../src/main/core/connector/net-client");
            const build_request_context = __test__.build_request_context;
            const ctx = await build_request_context(
                get_test_manifest(),
                "default",
                vault,
                "test-1",
                {
                    path: "/usage",
                    default_timeout_ms: 15_000,
                    timeout_ms: 500,
                },
            );
            expect(ctx.effective_timeout).toBe(500);
            clearTimeout(ctx.timeout_id);
        });

        it("merges extra_headers from opts over initial headers", async () => {
            const { __test__ } = await import("../../../src/main/core/connector/net-client");
            const build_request_context = __test__.build_request_context;
            const ctx = await build_request_context(
                get_test_manifest(),
                "default",
                vault,
                "test-1",
                {
                    path: "/usage",
                    default_timeout_ms: 15_000,
                    initial_headers: { "Content-Type": "application/json", "X-Default": "1" },
                    extra_headers: { "X-Custom": "abc", "X-Default": "2" },
                },
            );
            // extra_headers 覆盖 initial_headers 同名键
            expect(ctx.headers["X-Default"]).toBe("2");
            expect(ctx.headers["X-Custom"]).toBe("abc");
            expect(ctx.headers["Authorization"]).toBe("Bearer sk-test-secret");
            clearTimeout(ctx.timeout_id);
        });

        it("refuses metadata host via override", async () => {
            const { __test__ } = await import("../../../src/main/core/connector/net-client");
            const build_request_context = __test__.build_request_context;
            await expect(
                build_request_context(get_test_manifest(), "default", vault, "test-1", {
                    path: "/latest/meta-data/",
                    default_timeout_ms: 15_000,
                    endpoint_overrides: { default: "http://169.254.169.254" },
                }),
            ).rejects.toThrow(/Refusing connector request to metadata host/);
        });

        it("falls back to default timeout when timeout_ms is <= 0 or NaN (A61 / AC-001)", async () => {
            const { __test__ } = await import("../../../src/main/core/connector/net-client");
            const build_request_context = __test__.build_request_context;

            const ctx1 = await build_request_context(
                get_test_manifest(),
                "default",
                vault,
                "test-1",
                {
                    path: "/usage",
                    default_timeout_ms: 15_000,
                    timeout_ms: 0,
                },
            );
            expect(ctx1.effective_timeout).toBe(15_000);
            clearTimeout(ctx1.timeout_id);

            const ctx2 = await build_request_context(
                get_test_manifest(),
                "default",
                vault,
                "test-1",
                {
                    path: "/usage",
                    default_timeout_ms: 15_000,
                    timeout_ms: Number.NaN,
                },
            );
            expect(ctx2.effective_timeout).toBe(15_000);
            clearTimeout(ctx2.timeout_id);
        });
    });

    describe("t514 hardening additions", () => {
        it("captures and scrubs 500B snippet on HTTP 4xx error (A29 / AC-003)", async () => {
            const bad = createServer((_req, res) => {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify({
                        error: "invalid_param",
                        message: "token is required and bad",
                    }),
                );
            });
            try {
                await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
                const addr = bad.address() as { port: number };
                const ctx = create_connector_context(
                    {
                        ...get_test_manifest(),
                        endpoints: { default: `http://127.0.0.1:${String(addr.port)}` },
                    },
                    vault,
                    "test-1",
                    {},
                );
                await expect(ctx.http.get_json("default", "/usage")).rejects.toThrow(
                    /HTTP 400: request failed.*\[.*invalid_param.*\]/,
                );
            } finally {
                bad.close();
            }
        });

        it("preserves multi-value headers as array in get_raw (A103 / A134)", async () => {
            const srv = createServer((_req, res) => {
                res.writeHead(200, {
                    "Content-Type": "text/plain",
                    "Set-Cookie": ["sess_a=1; Path=/", "sess_b=2; Path=/"],
                });
                res.end("ok");
            });
            try {
                await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
                const addr = srv.address() as { port: number };
                const ctx = create_connector_context(
                    {
                        ...get_test_manifest(),
                        endpoints: { default: `http://127.0.0.1:${String(addr.port)}` },
                    },
                    vault,
                    "test-1",
                    {},
                );
                const raw = await ctx.http.get_raw("default", "/test");
                expect(Array.isArray(raw.headers["set-cookie"])).toBe(true);
                expect(raw.headers["set-cookie"]).toEqual(["sess_a=1; Path=/", "sess_b=2; Path=/"]);
            } finally {
                srv.close();
            }
        });

        it("provides ctx.util methods for numbers, percentages, and timestamps (A99 / AC-005)", () => {
            const ctx = create_connector_context(get_test_manifest(), vault, "test-1", {});
            expect(ctx.util).toBeDefined();
            const util = ctx.util;
            if (!util) throw new Error("Expected ctx.util to be defined");
            expect(util.to_number("42")).toBe(42);
            expect(util.to_number(undefined, 10)).toBe(10);
            expect(util.to_pct(0.75)).toBe(75);
            expect(util.to_pct(120)).toBe(100);
            expect(util.to_pct(-5)).toBe(0);
            expect(util.to_reset_at("2026-10-01T00:00:00.000Z")).toBe(1790812800000);
            expect(util.to_reset_at("invalid")).toBeNull();
            expect(util.clamp(150, 0, 100)).toBe(100);
        });

        it("aborts response stream exceeding 10MB limit (A10 / AC-001)", async () => {
            const { Readable } = await import("node:stream");
            const { __test__ } = await import("../../../src/main/core/connector/net-client");
            let destroyed = false;
            const fake_stream = new Readable({
                read() {
                    // 每次 push 2MB chunk
                    this.push(Buffer.alloc(2 * 1024 * 1024, "a"));
                },
                destroy(err, callback) {
                    destroyed = true;
                    callback(err);
                },
            });

            await expect(
                __test__.read_body_with_limit(
                    fake_stream as unknown as Parameters<typeof __test__.read_body_with_limit>[0],
                    10 * 1024 * 1024,
                ),
            ).rejects.toThrow(/Response body exceeds 10485760 bytes/);
            expect(destroyed).toBe(true);
        });

        it("truncates files.list at MAX_LIST_FILES (5000 items) concurrently (AC-002 / A11 / A114)", async () => {
            const { __test__ } = await import("../../../src/main/core/connector/net-client");
            // 构造模拟超过 5000 项的目录结构
            const fake_dir = join(temp_dir, "large_dir");
            await mkdir(fake_dir, { recursive: true });
            // 生成 5050 个虚拟文件并并发读取
            const create_tasks: Promise<void>[] = [];
            for (let i = 0; i < 5050; i++) {
                create_tasks.push(writeFile(join(fake_dir, `f_${String(i)}.txt`), "x", "utf8"));
            }
            await Promise.all(create_tasks);

            const items = await __test__.list_dir_recursive(fake_dir, [fake_dir]);
            expect(items).toHaveLength(5000);
        });

        it("validates external JSON response with zod schema and rejects invalid payload (A128 / AC-007)", async () => {
            const { z } = await import("zod/v3");
            const srv = createServer((_req, res) => {
                res.writeHead(200, { "Content-Type": "application/json" });
                // 外部返回非规范数据（期待 number，实际返回 string）
                res.end(JSON.stringify({ usagePercent: "invalid_string" }));
            });
            try {
                await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
                const addr = srv.address() as { port: number };
                const ctx = create_connector_context(
                    {
                        ...get_test_manifest(),
                        endpoints: { default: `http://127.0.0.1:${String(addr.port)}` },
                    },
                    vault,
                    "test-1",
                    {},
                );
                const schema = z.object({
                    usagePercent: z.number(),
                });
                await expect(ctx.http.get_json("default", "/usage", { schema })).rejects.toThrow(
                    /Response schema validation failed/,
                );
            } finally {
                srv.close();
            }
        });
    });
});
