import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CliParseResult =
    | {
          ok: true;
          info: { port: number; url: string; pid: number; userData: string; startedAt: string };
      }
    | { ok: false; error: string };

function temp_cli_json(content: string): { dir: string; path: string } {
    const dir = mkdtempSync(join(tmpdir(), "cli-parse-"));
    const path = join(dir, "cli.json");
    writeFileSync(path, content);
    return { dir, path };
}

async function load_parse(): Promise<(path: string) => CliParseResult> {
    // 动态 import .mjs（vitest include 不覆盖 .mjs，测试文件须 .ts）。
    const mod = await import("../../../../scripts/cli_json_parse.mjs");
    return (mod as { parse_cli_json: (p: string) => CliParseResult }).parse_cli_json;
}

describe("parse_cli_json（t344）", () => {
    it("合法 cli.json 返回 ok 与完整 info", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json(
            JSON.stringify({
                port: 17864,
                url: "http://127.0.0.1:17864",
                pid: 1234,
                userData: "/tmp/x",
                startedAt: "2026-08-13T00:00:00.000Z",
            }),
        );
        try {
            const result = parse(path);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.info.port).toBe(17864);
            expect(result.info.url).toBe("http://127.0.0.1:17864");
            expect(result.info.pid).toBe(1234);
            expect(result.info.userData).toBe("/tmp/x");
            expect(result.info.startedAt).toBe("2026-08-13T00:00:00.000Z");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("缺 url 字段返回可读错误", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json(JSON.stringify({ port: 17864, pid: 1234 }));
        try {
            const result = parse(path);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error).toContain("url");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("缺 pid 字段返回可读错误", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json(
            JSON.stringify({ port: 17864, url: "http://127.0.0.1:17864" }),
        );
        try {
            const result = parse(path);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error).toContain("pid");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("文件缺失返回可读错误（非抛异常）", async () => {
        const parse = await load_parse();
        const result = parse(join(tmpdir(), "no-such-cli.json-xyz"));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toContain("读取 cli.json 失败");
    });

    it("缺 port 字段返回可读错误（非 TypeError 透传）", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json(
            JSON.stringify({ url: "http://127.0.0.1:17864", pid: 1234 }),
        );
        try {
            const result = parse(path);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error).toContain("port");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("port 类型错误（字符串）返回可读错误", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json(JSON.stringify({ port: "17864", url: "u", pid: 1 }));
        try {
            const result = parse(path);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error).toContain("number 字段 port");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("url 类型错误（number）返回可读错误（t394 AC-003）", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json(JSON.stringify({ port: 17864, url: 123, pid: 1 }));
        try {
            const result = parse(path);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error).toContain("string 字段 url");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("pid 类型错误（string）返回可读错误（t394 AC-003）", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json(JSON.stringify({ port: 17864, url: "u", pid: "1234" }));
        try {
            const result = parse(path);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error).toContain("number 字段 pid");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("userData/startedAt 缺省时补空串（t394 AC-003）", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json(JSON.stringify({ port: 17864, url: "u", pid: 1234 }));
        try {
            const result = parse(path);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.info.userData).toBe("");
            expect(result.info.startedAt).toBe("");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("根节点为数组返回可读错误而非 TypeError（t394 AC-003）", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json(JSON.stringify([1, 2, 3]));
        try {
            const result = parse(path);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            // 数组 typeof 为 object 非 null，通过根节点对象检查 → 落到字段校验
            // （缺 port）报可读错误；关键是不抛 TypeError 透传。
            expect(result.error).toContain("port");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("损坏 JSON 返回可读错误", async () => {
        const parse = await load_parse();
        const { dir, path } = temp_cli_json("{ not valid json");
        try {
            const result = parse(path);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error).toContain("合法 JSON");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
