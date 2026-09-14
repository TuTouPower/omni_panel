import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import {
    resolve_instance,
    post_control,
    check_health,
    wait_quit_confirmed,
    run_control_command,
    run_export_command,
} from "../../../../src/main/cli/client";

let tmp: string | undefined;

afterEach(() => {
    if (tmp) {
        rmSync(tmp, { recursive: true, force: true });
        tmp = undefined;
    }
});

function makeDir(): string {
    tmp ??= mkdtempSync(join(tmpdir(), "omni-cli-client-"));
    return tmp;
}

function writeCliJson(dir: string, port: number): void {
    writeFileSync(
        join(dir, "cli.json"),
        JSON.stringify({
            port,
            url: `http://localhost:${String(port)}/`,
            userData: dir,
            pid: 12345,
            startedAt: "2026-08-09T00:00:00.000Z",
        }),
    );
}

describe("resolve_instance", () => {
    it("读 cli.json 取得端口", () => {
        const dir = makeDir();
        writeCliJson(dir, 18263);
        const inst = resolve_instance({ dataRoot: dir });
        expect(inst.port).toBe(18263);
        expect(inst.url).toBe("http://localhost:18263/");
    });

    it("--port 覆盖优先于 cli.json", () => {
        const dir = makeDir();
        writeCliJson(dir, 18263);
        const inst = resolve_instance({ dataRoot: dir }, 19999);
        expect(inst.port).toBe(19999);
    });

    it("cli.json 缺失抛「实例未运行」", () => {
        const dir = makeDir();
        expect(() => resolve_instance({ dataRoot: dir })).toThrow(/实例未运行/);
    });

    it("cli.json 损坏抛可读错误", () => {
        const dir = makeDir();
        writeFileSync(join(dir, "cli.json"), "not json");
        expect(() => resolve_instance({ dataRoot: dir })).toThrow(/cli.json 损坏/);
    });
});

describe("post_control", () => {
    it("POST 到控制端点，200 返回响应", async () => {
        const server = createServer((req, res) => {
            expect(req.method).toBe("POST");
            expect(req.url).toBe("/v1/control/pause");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"status":"ok"}');
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        try {
            const body = await post_control(port, "pause");
            expect(body).toContain("ok");
        } finally {
            server.close();
        }
    });

    it("连接失败抛「实例未运行或不可达」", async () => {
        await expect(post_control(1, "pause")).rejects.toThrow(/实例未运行或不可达/);
    });

    it("非 200 抛可读错误", async () => {
        const server = createServer((_req, res) => {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end('{"error":"bad"}');
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        try {
            await expect(post_control(port, "quit")).rejects.toThrow(/控制端点返回 400/);
        } finally {
            server.close();
        }
    });
});

describe("check_health", () => {
    it("可达端口返回 true", async () => {
        const server = createServer((_req, res) => {
            res.writeHead(200);
            res.end();
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        try {
            expect(await check_health(port)).toBe(true);
        } finally {
            server.close();
        }
    });

    it("不可达端口返回 false", async () => {
        expect(await check_health(1)).toBe(false);
    });
});

describe("wait_quit_confirmed", () => {
    it("实例退出（连接失败）返回 true", async () => {
        const server = createServer((_req, res) => {
            res.writeHead(200);
            res.end();
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        // 短暂健康后关闭，模拟进程退出使 health 不可达。
        const timer = setTimeout(() => {
            server.close();
        }, 100);
        try {
            await expect(wait_quit_confirmed(port, 5000)).resolves.toBe(true);
        } finally {
            clearTimeout(timer);
            server.close();
        }
    });

    it("超时仍未退出返回 false", async () => {
        const server = createServer((_req, res) => {
            res.writeHead(200);
            res.end();
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        try {
            await expect(wait_quit_confirmed(port, 100)).resolves.toBe(false);
        } finally {
            server.close();
        }
    });
});

describe("run_control_command", () => {
    it("refresh-all 发请求到 cli.json 端口并返回 0", async () => {
        const dir = makeDir();
        const server = createServer((req, res) => {
            expect(req.url).toBe("/v1/control/refresh-all");
            res.writeHead(200);
            res.end();
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        writeCliJson(dir, port);
        try {
            const writes: string[] = [];
            const code = await run_control_command(
                "refresh-all",
                {},
                {
                    dataRoot: dir,
                    write: (t) => {
                        writes.push(t);
                    },
                },
            );
            expect(code).toBe(0);
            expect(writes.join("")).toContain("refresh-all 已发送");
        } finally {
            server.close();
        }
    });

    it("supported-platform autostart delegates to the host control endpoint", async () => {
        if (process.platform === "linux") return;
        const dir = makeDir();
        const server = createServer((req, res) => {
            expect(req.url).toBe("/v1/control/autostart");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify({
                    status: "ok",
                    autostart: { available: true, enabled: true },
                }),
            );
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        writeCliJson(dir, port);
        try {
            const writes: string[] = [];
            const code = await run_control_command(
                "autostart",
                {},
                {
                    dataRoot: dir,
                    write: (text) => {
                        writes.push(text);
                    },
                },
            );
            expect(code).toBe(0);
            expect(writes.join("")).toContain("autostart 已开启");
        } finally {
            server.close();
        }
    });

    it("autostart 在 Linux 返回 unsupported 且无副作用", async () => {
        const dir = makeDir();
        const writes: string[] = [];
        const code = await run_control_command(
            "autostart",
            {},
            {
                dataRoot: dir,
                write: (t) => {
                    writes.push(t);
                },
            },
        );
        expect(code).toBe(0);
        expect(writes.join("")).toContain("autostart 在 Linux 上不受支持");
    });

    it("实例未运行时控制命令返回非零退出码", async () => {
        const dir = makeDir();
        const code = await run_control_command("pause", {}, { dataRoot: dir });
        expect(code).toBe(1);
    });

    it("实例未运行时控制命令输出可读错误到 stderr", async () => {
        const dir = makeDir();
        const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        try {
            await run_control_command("pause", {}, { dataRoot: dir });
            const calls = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
            expect(calls).toContain("实例未运行");
        } finally {
            stderrSpy.mockRestore();
        }
    });

    it("open 输出面板 URL（URL 可达时）", async () => {
        const dir = makeDir();
        const server = createServer((req, res) => {
            if (req.url === "/v1/control/open") {
                res.writeHead(200);
                res.end();
                return;
            }
            res.writeHead(200);
            res.end();
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        writeCliJson(dir, port);
        try {
            const writes: string[] = [];
            const code = await run_control_command(
                "open",
                {},
                {
                    dataRoot: dir,
                    write: (t) => {
                        writes.push(t);
                    },
                },
            );
            expect(code).toBe(0);
            expect(writes.join("")).toContain("面板地址");
        } finally {
            server.close();
        }
    });

    it("quit 发请求后轮询 health 确认实例退出", async () => {
        const dir = makeDir();
        const server = createServer((req, res) => {
            if (req.url === "/v1/control/quit") {
                // Connection: close 防止 quit 连接回流 keep-alive 池被 health 复用，
                // 否则 server.close() 不断 keep-alive 连接，health 持续可达。
                res.writeHead(200, { Connection: "close" });
                res.end();
                // 模拟实例退出：停止监听，后续 health 连接失败 → 判定已退出。
                // 闭包捕获变量绑定：请求到达时 server 已初始化。
                server.close();
                return;
            }
            res.writeHead(200);
            res.end();
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        writeCliJson(dir, port);
        try {
            const writes: string[] = [];
            const code = await run_control_command(
                "quit",
                {},
                {
                    dataRoot: dir,
                    write: (t) => {
                        writes.push(t);
                    },
                },
            );
            expect(code).toBe(0);
            expect(writes.join("")).toContain("quit 已发送，实例已退出");
        } finally {
            server.close();
        }
    });

    it("restart 发请求到 cli.json 端口", async () => {
        const dir = makeDir();
        const server = createServer((req, res) => {
            expect(req.url).toBe("/v1/control/restart");
            res.writeHead(200);
            res.end();
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        writeCliJson(dir, port);
        try {
            const code = await run_control_command("restart", {}, { dataRoot: dir });
            expect(code).toBe(0);
        } finally {
            server.close();
        }
    });
});

describe("run_export_command（t277）", () => {
    it("GET 导出端点并把原生 config JSON 写到 stdout", async () => {
        const dir = makeDir();
        const server = createServer((req, res) => {
            expect(req.method).toBe("GET");
            expect(req.url).toBe("/v1/config/export?includeSecrets=true");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ schemaVersion: 1, plugins: [] }));
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        writeCliJson(dir, port);
        try {
            const writes: string[] = [];
            const code = await run_export_command(
                { includeSecrets: true },
                {
                    dataRoot: dir,
                    write: (text) => {
                        writes.push(text);
                    },
                },
            );
            expect(code).toBe(0);
            expect(JSON.parse(writes.join(""))).toEqual({ schemaVersion: 1, plugins: [] });
        } finally {
            server.close();
        }
    });

    it("等待异步 stdout writer 完成后再返回成功", async () => {
        const dir = makeDir();
        const server = createServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ schemaVersion: 1, plugins: [] }));
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        writeCliJson(dir, port);
        let release_write!: () => void;
        const write_gate = new Promise<void>((resolve) => {
            release_write = resolve;
        });
        let writer_started!: () => void;
        const writer_started_promise = new Promise<void>((resolve) => {
            writer_started = resolve;
        });
        try {
            const pending = run_export_command(
                { includeSecrets: false },
                {
                    dataRoot: dir,
                    write: async () => {
                        writer_started();
                        await write_gate;
                    },
                },
            );
            await writer_started_promise;
            let settled = false;
            void pending.then(() => {
                settled = true;
            });
            await Promise.resolve();
            expect(settled).toBe(false);
            release_write();
            await expect(pending).resolves.toBe(0);
        } finally {
            release_write();
            server.close();
        }
    });

    it("导出端点失败时返回非零并输出可读错误", async () => {
        const dir = makeDir();
        const server = createServer((_req, res) => {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end('{"message":"bad export"}');
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        writeCliJson(dir, port);
        const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        try {
            const code = await run_export_command({ includeSecrets: false }, { dataRoot: dir });
            expect(code).toBe(1);
            expect(stderrSpy.mock.calls.map((call) => String(call[0])).join("")).toContain(
                "导出端点返回 400",
            );
        } finally {
            stderrSpy.mockRestore();
            server.close();
        }
    });
});
