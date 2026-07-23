import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TASK_PY = join(process.cwd(), "scripts", "task.py");
let temp_dir: string;
let active_path: string;
let archive_path: string;

function run(args: string[]): string {
    return execFileSync("python", [TASK_PY, ...args], {
        encoding: "utf-8",
        env: {
            ...process.env,
            OMNI_TASK_ACTIVE_PATH: active_path,
            OMNI_TASK_ARCHIVE_PATH: archive_path,
        },
    });
}

function read_json(path: string): { tasks: Record<string, unknown>[] } {
    return JSON.parse(readFileSync(path, "utf-8")) as { tasks: Record<string, unknown>[] };
}

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "task-py-test-"));
    active_path = join(temp_dir, "active.json");
    archive_path = join(temp_dir, "archive.json");
});

afterEach(async () => {
    await rm(temp_dir, { recursive: true, force: true });
});

describe("task.py atomic write (I16)", () => {
    it("save leaves no .tmp residue after add", () => {
        run(["add", "--title", "Test", "--slug", "test_atom"]);
        const entries = readdirSync(temp_dir);
        expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);
    });

    it("JSON is valid after write", () => {
        run(["add", "--title", "Test", "--slug", "test_valid"]);
        const data = read_json(active_path);
        expect(data.tasks).toHaveLength(1);
    });
});

describe("task.py finish transaction recovery (I17)", () => {
    it("re-moves archive coexistence: active+archive same tid, finish clears active", () => {
        run(["add", "--title", "Test", "--slug", "test_finish"]);
        run(["start", "t001"]);
        // 模拟中断: archive 已含 t001（done）+ active 仍含 t001
        const active = read_json(active_path);
        const t = active.tasks[0];
        if (!t) throw new Error("missing task");
        writeFileSync(archive_path, JSON.stringify({ tasks: [{ ...t, status: "done" }] }), "utf-8");
        // 重跑 finish（幂等恢复，不硬 exit）
        let exit_code = 0;
        try {
            run(["finish", "t001"]);
        } catch {
            exit_code = 1;
        }
        expect(exit_code).toBe(0);
        const active_after = read_json(active_path);
        const archive_after = read_json(archive_path);
        expect(active_after.tasks).toHaveLength(0);
        expect(archive_after.tasks).toHaveLength(1);
    });

    it("finish normal flow: active cleared, archive has tid", () => {
        run(["add", "--title", "Test", "--slug", "test_normal"]);
        run(["start", "t001"]);
        run(["finish", "t001"]);
        const active = read_json(active_path);
        const archive = read_json(archive_path);
        expect(active.tasks).toHaveLength(0);
        expect(archive.tasks).toHaveLength(1);
        expect(archive.tasks[0]?.status).toBe("done");
    });
});
