import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";

/**
 * t459：GUI（非 CLI）桌面启动同样写实例发现文件 cli.json。
 *
 * fixture 的 userDataDir 即 dataRoot（GUI 模式 dataRoot = app.getPath("userData")，
 * 经 Chromium 原生 --user-data-dir= 指向 fixture 临时目录）。经 OMNI_PANEL_PORT
 * 固定非默认端口，断言 cli.json 的 port/url 与实际监听一致。
 */

const AC1_PORT = 17934;

const { test, expect } = createTestWithSetup({
    env: { OMNI_PANEL_PORT: String(AC1_PORT) },
});

test.describe("desktop cli.json instance discovery (t459)", () => {
    test("AC-001/004：GUI 启动后 cli.json 存在，字段完整且 port/url 为固定非默认端口", async ({
        omni,
    }) => {
        await omni.app.firstWindow();
        const cli_json_path = join(omni.userDataDir, "cli.json");
        expect(existsSync(cli_json_path)).toBe(true);
        const raw = readFileSync(cli_json_path, "utf8");
        const info = JSON.parse(raw) as {
            port: number;
            url: string;
            pid: number;
            userData: string;
            startedAt: string;
        };
        expect(info.port).toBe(AC1_PORT);
        expect(info.url).toBe(`http://localhost:${String(AC1_PORT)}/`);
        expect(info.userData).toBe(omni.userDataDir);
        expect(info.pid).toBeGreaterThan(0);
        expect(Number.isNaN(Date.parse(info.startedAt))).toBe(false);
        const res = await fetch(`http://localhost:${String(AC1_PORT)}/v1/health`);
        expect(res.status).toBe(200);
        const health = (await res.json()) as { status?: string };
        expect(health.status).toBe("ok");
    });
});

const AC3_PORT = 17935;

const { test: blockTest, expect: blockExpect } = createTestWithSetup({
    // AC-003：把 cli.json 位置预置为目录——writeFileAtomic 的 rename 落在目录上
    // 必失败（EISDIR）。写失败只 warn，不阻断 LocalAPI 与窗口。
    setupPlugins: (userDataDir: string) => {
        rmSync(join(userDataDir, "cli.json"), { force: true });
        mkdirSync(join(userDataDir, "cli.json"));
    },
    env: { OMNI_PANEL_PORT: String(AC3_PORT) },
});

blockTest.describe("desktop cli.json write failure (t459 AC-003)", () => {
    blockTest("cli.json 不可写时进程不退出，LocalAPI 健康检查仍可访问", async ({ omni }) => {
        await omni.app.firstWindow();
        const res = await fetch(`http://localhost:${String(AC3_PORT)}/v1/health`);
        blockExpect(res.status).toBe(200);
        const health = (await res.json()) as { status?: string };
        blockExpect(health.status).toBe("ok");
        // 写失败被吞：路径仍是目录，未变成普通文件。
        blockExpect(statSync(join(omni.userDataDir, "cli.json")).isDirectory()).toBe(true);
    });
});
