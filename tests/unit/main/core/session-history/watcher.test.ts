import { describe, expect, it, vi } from "vitest";
import type * as NodeFs from "node:fs";

const watch_mock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", async (import_original) => {
    const actual = await import_original<typeof NodeFs>();
    return { ...actual, watch: watch_mock };
});

import {
    create_watcher,
    pick_strategy,
} from "../../../../../src/main/core/session-history/subscription-service";

/**
 * t210 watcher 策略单测（AC1：win+claude_code fs.watch，其余 2s mtime 轮询）。
 * node:fs.watch 被 mock 为可控 fake，验证 change 触发、非 change 不触发、
 * error 不抛、stop 释放；watch 抛错退化为轮询。
 */

interface FakeWatcher {
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    _fire: (event: string, ...args: unknown[]) => void;
}

function make_fake_watcher(): FakeWatcher {
    const handlers: Record<string, ((...args: unknown[]) => void)[] | undefined> = {};
    return {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
            (handlers[event] ??= []).push(cb);
        }),
        close: vi.fn(),
        _fire: (event: string, ...args: unknown[]) => {
            for (const cb of handlers[event] ?? []) {
                cb(event, ...args);
            }
        },
    };
}

/** 让 watch_mock 把 create_watcher 传入的 change listener 挂到 fake watcher 上。 */
function install_watch(fake: FakeWatcher): void {
    watch_mock.mockImplementation((_path: string, listener: (event: string) => void) => {
        fake.on("change", listener);
        return fake;
    });
}

describe("pick_strategy (t210)", () => {
    it.each([
        ["win", "claude_code", "watch"],
        ["win", "opencode", "poll"],
        ["win", "kimi", "poll"],
        ["win", "grok", "poll"],
        ["wsl", "claude_code", "poll"],
        ["wsl", "opencode", "poll"],
        ["wsl", "kimi", "poll"],
        ["wsl", "grok", "poll"],
    ] as const)("env=%s extractor=%s -> %s", (env, kind, expected) => {
        expect(pick_strategy(env, kind)).toBe(expected);
    });
});

describe("create_watcher fs.watch 分支 (t210)", () => {
    it("change 事件触发 on_change", () => {
        const fake = make_fake_watcher();
        install_watch(fake);
        const on_change = vi.fn();

        const watcher = create_watcher("/x/s.jsonl", "watch", on_change);
        fake._fire("change");
        expect(on_change).toHaveBeenCalledTimes(1);
        fake._fire("change");
        expect(on_change).toHaveBeenCalledTimes(2);

        watcher.stop();
    });

    it("非 change 事件（rename）不触发 on_change", () => {
        const fake = make_fake_watcher();
        install_watch(fake);
        const on_change = vi.fn();

        const watcher = create_watcher("/x/s.jsonl", "watch", on_change);
        fake._fire("rename");
        fake._fire("close");
        expect(on_change).not.toHaveBeenCalled();

        watcher.stop();
    });

    it("error 事件记日志不抛", () => {
        const fake = make_fake_watcher();
        install_watch(fake);

        const watcher = create_watcher("/x/s.jsonl", "watch", vi.fn());
        expect(() => {
            fake._fire("error", new Error("boom"));
        }).not.toThrow();

        watcher.stop();
    });

    it("stop 释放 watch 句柄且幂等", () => {
        const fake = make_fake_watcher();
        install_watch(fake);

        const watcher = create_watcher("/x/s.jsonl", "watch", vi.fn());
        expect(fake.on).toHaveBeenCalledWith("error", expect.any(Function));
        watcher.stop();
        expect(fake.close).toHaveBeenCalledTimes(1);
        watcher.stop();
        expect(fake.close).toHaveBeenCalledTimes(1);
    });

    it("watch 抛错退化为轮询（文件不存在时不抛）", () => {
        watch_mock.mockImplementationOnce(() => {
            throw new Error("ENOSYS");
        });

        const watcher = create_watcher("Z:/nonexistent/s.jsonl", "watch", vi.fn());
        expect(() => {
            watcher.stop();
        }).not.toThrow();
    });
});
