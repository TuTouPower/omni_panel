import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import {
    resolve_instance,
    post_control,
    run_control_command,
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
                    write: (t) => writes.push(t),
                },
            );
            expect(code).toBe(0);
            expect(writes.join("")).toContain("refresh-all 已发送");
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
                write: (t) => writes.push(t),
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
                    write: (t) => writes.push(t),
                },
            );
            expect(code).toBe(0);
            expect(writes.join("")).toContain("面板地址");
        } finally {
            server.close();
        }
    });

    it("quit 发请求到 cli.json 端口", async () => {
        const dir = makeDir();
        const server = createServer((req, res) => {
            expect(req.url).toBe("/v1/control/quit");
            res.writeHead(200);
            res.end();
        });
        await new Promise<void>((r) => server.listen(0, r));
        const port = (server.address() as { port: number }).port;
        writeCliJson(dir, port);
        try {
            const code = await run_control_command("quit", {}, { dataRoot: dir });
            expect(code).toBe(0);
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
