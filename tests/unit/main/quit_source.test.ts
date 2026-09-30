import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const app_quit_spy = vi.fn();
const app_exit_spy = vi.fn();
const tmp_root = mkdtempSync(join(tmpdir(), "t536-quit-source-"));
const tmp_user_data = join(tmp_root, "userdata");

vi.mock("electron", () => ({
    app: {
        quit: () => {
            app_quit_spy();
        },
        exit: (code: number) => {
            app_exit_spy(code);
        },
        getPath: (name: string) => {
            if (name !== "userData") throw new Error(`unexpected path: ${name}`);
            return tmp_user_data;
        },
    },
}));

import {
    QUIT_SOURCES,
    get_quit_requests,
    get_quit_requester,
    get_quit_trace_id,
    get_shutdown_log_meta,
    log_application_shutdown,
    request_app_exit,
    request_app_quit,
    reset_quit_source_state_for_testing,
} from "../../../src/main/core/quit_source";
import { addTransport, setLogLevel, type LogLevel } from "../../../src/shared/lib/logger";
import { get_local_date_string } from "../../../src/shared/lib/local-time";

interface CapturedRecord {
    readonly level: LogLevel;
    readonly module: string;
    readonly message: string;
    readonly meta: unknown;
}

let records: CapturedRecord[] = [];
let remove_transport: (() => void) | null = null;

beforeEach(() => {
    reset_quit_source_state_for_testing();
    records = [];
    app_quit_spy.mockClear();
    app_exit_spy.mockClear();
    remove_transport = addTransport({
        write(level, module, message, meta) {
            records.push({ level, module, message, meta });
        },
    });
});

afterEach(() => {
    remove_transport?.();
    remove_transport = null;
});

afterAll(() => {
    rmSync(tmp_root, { recursive: true, force: true });
});

function meta_of(record: CapturedRecord | undefined): Record<string, unknown> {
    expect(record).toBeDefined();
    return (record?.meta ?? {}) as Record<string, unknown>;
}

describe("quit_source (t536 AC-001)", () => {
    it("来源目录固定覆盖创建时扫描到的 12 处显式退出入口", () => {
        expect([...QUIT_SOURCES]).toEqual([
            "cli.help",
            "cli.export",
            "cli.control",
            "control-api.restart",
            "control-api.quit",
            "tray.quit",
            "tray.restart",
            "will-quit.flush-retry",
            "startup.cli-failure",
            "startup.failure",
            "menu.cmd-q",
            "single-instance.lock-lost",
        ]);
    });

    it("request_app_quit 记录来源与 trace 并调用 app.quit", () => {
        request_app_quit("tray.quit");

        expect(app_quit_spy).toHaveBeenCalledTimes(1);
        const record = records.at(-1);
        expect(record?.message).toContain("tray.quit");
        const meta = meta_of(record);
        expect(meta["source"]).toBe("tray.quit");
        expect(meta["action"]).toBe("quit");
        expect(meta["trace_id"]).toBe(get_quit_trace_id());
        expect(typeof meta["trace_id"]).toBe("string");
    });

    it("request_app_exit 记录来源/退出码并调用 app.exit", async () => {
        await request_app_exit("cli.export", 3);

        expect(app_exit_spy).toHaveBeenCalledWith(3);
        const record = records.at(-1);
        const meta = meta_of(record);
        expect(meta["source"]).toBe("cli.export");
        expect(meta["action"]).toBe("exit");
        expect(meta["exit_code"]).toBe(3);
        expect(meta["trace_id"]).toBe(get_quit_trace_id());
    });

    it("A13: request_app_exit 先 flush transport 再调 app.exit", async () => {
        const order: string[] = [];
        const remove = addTransport({
            write() {
                // 顺序断言只关心 flush；write 留空。
            },
            flush: () => {
                order.push("flush");
                return Promise.resolve();
            },
        });
        app_exit_spy.mockImplementationOnce(() => {
            order.push("exit");
        });
        try {
            await request_app_exit("tray.quit", 0);
        } finally {
            remove();
        }

        expect(order).toEqual(["flush", "exit"]);
    });

    it("多个退出入口共享同一 trace，首个入口为退出请求方", () => {
        request_app_quit("menu.cmd-q");
        request_app_quit("will-quit.flush-retry");

        const trace_ids = records.map((record) => meta_of(record)["trace_id"]);
        expect(trace_ids).toHaveLength(2);
        expect(trace_ids[0]).toBe(trace_ids[1]);
        expect(get_quit_requester()).toBe("menu.cmd-q");
        expect(get_quit_requests().map((entry) => entry.source)).toEqual([
            "menu.cmd-q",
            "will-quit.flush-retry",
        ]);
    });

    it("无 transport（日志初始化前 / will-quit 清理后）同步落盘到同一活动日志文件", () => {
        remove_transport?.();
        remove_transport = null;

        request_app_quit("will-quit.flush-retry");

        const trace = get_quit_trace_id();
        expect(trace).toBeTypeOf("string");
        const file_path = join(tmp_user_data, "logs", `app-${get_local_date_string()}.log`);
        const lines = readFileSync(file_path, "utf8").trim().split("\n");
        const record = JSON.parse(lines.at(-1) ?? "{}") as {
            module?: string;
            message?: string;
            trace_id?: string;
            meta?: { source?: string; action?: string };
        };
        expect(record.module).toBe("quit-source");
        expect(record.message).toContain("will-quit.flush-retry");
        expect(record.trace_id).toBe(trace);
        expect(record.meta?.source).toBe("will-quit.flush-retry");
        expect(record.meta?.action).toBe("quit");
        expect(app_quit_spy).toHaveBeenCalledTimes(1);
    });

    it("reset 清空 trace 与请求记录", () => {
        request_app_quit("tray.quit");
        reset_quit_source_state_for_testing();

        expect(get_quit_trace_id()).toBeNull();
        expect(get_quit_requester()).toBeNull();
        expect(get_quit_requests()).toEqual([]);
    });

    it("logLevel 过滤 info 时来源行仍同步落盘（不被级别过滤吞掉）", () => {
        setLogLevel("error");
        try {
            request_app_quit("tray.quit");

            // transport 在场但 info 被过滤 → logger 无输出，走兜底文件。
            expect(records).toEqual([]);
            const file_path = join(tmp_user_data, "logs", `app-${get_local_date_string()}.log`);
            const last_line = readFileSync(file_path, "utf8").trim().split("\n").at(-1);
            const record = JSON.parse(last_line ?? "{}") as {
                module?: string;
                meta?: { source?: string };
                trace_id?: string;
            };
            expect(record.module).toBe("quit-source");
            expect(record.meta?.source).toBe("tray.quit");
            expect(record.trace_id).toBe(get_quit_trace_id());
        } finally {
            setLogLevel("debug");
        }
    });

    it("关停行 meta 关联首个退出请求方与同一 trace；漏斗外标 untracked", () => {
        expect(get_shutdown_log_meta()).toEqual({ exit_source: "untracked" });

        request_app_quit("menu.cmd-q");
        request_app_quit("will-quit.flush-retry");

        const meta = get_shutdown_log_meta();
        expect(meta.exit_source).toBe("menu.cmd-q");
        expect(meta.trace_id).toBe(get_quit_trace_id());
    });

    it("logLevel 过滤 info 时关停行同样同步落盘（module=main、同 trace）", () => {
        request_app_quit("tray.quit");
        const trace = get_quit_trace_id();
        records = [];

        setLogLevel("error");
        try {
            log_application_shutdown();
            // transport 在场但级别过滤 → logger 无输出，走兜底文件。
            expect(records).toEqual([]);
        } finally {
            setLogLevel("debug");
        }

        const file_path = join(tmp_user_data, "logs", `app-${get_local_date_string()}.log`);
        const last_line = readFileSync(file_path, "utf8").trim().split("\n").at(-1);
        const record = JSON.parse(last_line ?? "{}") as {
            module?: string;
            message?: string;
            trace_id?: string;
            meta?: { exit_source?: string };
        };
        expect(record.module).toBe("main");
        expect(record.message).toBe("Application shutting down");
        expect(record.meta?.exit_source).toBe("tray.quit");
        expect(record.trace_id).toBe(trace);
    });

    it("QUIT_SOURCES 与 src 内漏斗调用点一致（目录无死项、调用点字面量均已登记）", () => {
        const src_root = join(dirname(fileURLToPath(import.meta.url)), "../../../src");
        const files: string[] = [];
        const walk = (dir: string): void => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const path = join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(path);
                } else if (entry.name.endsWith(".ts")) {
                    files.push(path);
                }
            }
        };
        walk(src_root);

        const used = new Set<string>();
        const call_re = /request_(?:app_quit|app_exit)\(\s*"([^"]+)"/g;
        const raw_re = /\bapp\s*\.\s*(?:quit|exit)\s*\(/;
        const comment_line_re = /^\s*(?:\/\/|\*|\/\*)/;
        const raw_offenders: string[] = [];
        for (const file of files) {
            if (file.endsWith(join("core", "quit_source.ts"))) continue;
            const text = readFileSync(file, "utf8");
            for (const match of text.matchAll(call_re)) {
                const source = match[1];
                if (source !== undefined) used.add(source);
            }
            // 注释里的历史提及（如「app.quit() 异步退出」）不算调用。
            const code_lines = text.split("\n").filter((line) => !comment_line_re.test(line));
            if (raw_re.test(code_lines.join("\n")))
                raw_offenders.push(file.slice(src_root.length + 1));
        }
        expect([...used].sort()).toEqual([...QUIT_SOURCES].sort());
        // eslint no-restricted-properties 之外的第二道扫描：绕过 property 规则的
        // 裸 app.quit()/app.exit()（改名 import 后仍写作 app.* 的形态）同样拦截。
        expect(raw_offenders).toEqual([]);
    });
});
