import { mkdtemp, rm } from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// mock 整个 fs/promises：open 返回可控 fake fd（计数 + 维护字节），其余透传真实实现。
// 这样能精确断言「持久 fd 复用 → open 只调一次」这一 AC-001 可观察行为。
vi.mock("node:fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof FsPromises>();
    let open_count = 0;
    let written_bytes = 0;
    const open = vi.fn(() => {
        open_count += 1;
        return Promise.resolve({
            stat: () => Promise.resolve({ size: written_bytes, isFile: () => true }),
            write: (payload: string) => {
                const buf = Buffer.from(payload);
                written_bytes += buf.byteLength;
                return Promise.resolve({ bytesWritten: buf.byteLength });
            },
            sync: () => Promise.resolve(),
            close: () => Promise.resolve(),
        });
    });
    return {
        ...actual,
        open,
        // fake fd 不建真实文件，stat(logFile) 需同源返回缓存字节，否则 ENOENT
        // 会触发 logging.ts 的「stat 失败→关 fd 重开」路径。
        stat: vi.fn(() => Promise.resolve({ size: written_bytes })),
        __reset_open_count: () => {
            open_count = 0;
            written_bytes = 0;
            open.mockClear();
        },
        __get_open_count: () => open_count,
        __get_written_bytes: () => written_bytes,
    };
});

import * as fs_promises from "node:fs/promises";
import { initLogging } from "../../../src/main/core/logging";
import { createLogger } from "../../../src/shared/lib/logger";

const mocked = vi.mocked(fs_promises.open);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mock_helpers = fs_promises as any as {
    __reset_open_count: () => void;
    __get_open_count: () => number;
    __get_written_bytes: () => number;
};

let temp_dir: string | null = null;
let remove_logging: (() => void | Promise<void>) | null = null;

async function cleanup_logging(): Promise<void> {
    await remove_logging?.();
    remove_logging = null;
}

beforeEach(() => {
    mock_helpers.__reset_open_count();
});

afterEach(async () => {
    await cleanup_logging();
    if (temp_dir) {
        await rm(temp_dir, { recursive: true, force: true });
        temp_dir = null;
    }
    vi.restoreAllMocks();
});

describe("file transport persistent fd (t376 AC-001)", () => {
    it("reuses a single fd across many writes instead of open/write/close per line", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-log-fd-"));

        remove_logging = await initLogging(temp_dir, { logLevel: "debug" });

        for (let i = 0; i < 50; i++) {
            createLogger("test").info(`line ${String(i)} with some padding to make it realistic`);
        }
        await cleanup_logging();

        // 50 条日志只 open 一次 = 持久 fd 复用；原实现每日志 appendFile 会
        // open/close 50 次（appendFile 内部 open），不可能停在 1。
        expect(mocked).toHaveBeenCalledTimes(1);
    });
});

describe("segment limit periodic warn (t376 AC-002)", () => {
    it("warns immediately on first skip and re-warns periodically, not silently dropping", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-log-seg-"));
        const warn_spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        try {
            remove_logging = await initLogging(temp_dir, {
                logLevel: "debug",
                maxLogFileBytes: 40,
                maxSegments: 1,
            });

            // maxSegments=1 → currentSegment(0) 恒达上限：首条写后即 skip+warn，
            // 之后每 100 条 skip 再 warn。写 120 条应触发首次 + 周期，共 2~4 次
            // （而非每日志一次——warn 经 file transport 回环自增殖会放大）。
            for (let i = 0; i < 120; i++) {
                createLogger("test").info(`filler ${String(i)} padding padding padding`);
            }
            await cleanup_logging();

            const warn_calls = warn_spy.mock.calls.filter(([msg]) =>
                String(msg).includes("segment limit"),
            );
            expect(warn_calls.length).toBeGreaterThanOrEqual(2);
            expect(warn_calls.length).toBeLessThanOrEqual(4);
            // warn 不应触发 fd reopen（递归放大时 open 次数 >1 且写放大）。
            expect(mocked).toHaveBeenCalledTimes(1);
        } finally {
            warn_spy.mockRestore();
        }
    });
});
