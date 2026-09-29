import { describe, expect, it, vi } from "vitest";
import {
    run_flowercloud_snapshot,
    write_flowercloud_html,
} from "../../../src/main/core/session/flowercloud_dom";
import type {
    SessionController,
    SessionWindow,
} from "../../../src/main/core/session/session-types";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";

const LOGIN_URL = "https://api-flowercloud.com/clientarea.php";
const KEY = "flower-1:SESSION_COOKIE";
const USAGE_HTML = "<p>流量使用 331.40GB / 1000GB</p>";
const OLD_SECRET = JSON.stringify({
    cookie: "WHMCS=kept",
    html: "<p>流量使用 1GB / 1000GB</p>",
    captured_at: 1,
});

function create_window(html: string): SessionWindow {
    const win = {
        closed: false,
        revealed: 0,
        loadURL: vi.fn(() => Promise.resolve()),
        close(): void {
            win.closed = true;
        },
        isDestroyed(): boolean {
            return win.closed;
        },
        on(): SessionWindow {
            return win;
        },
        read_html: () => Promise.resolve(html),
        present_for_capture(): void {
            // no-op
        },
        reveal(): void {
            win.revealed += 1;
        },
    };
    return win;
}

function create_vault(): VaultBackend & {
    values: Map<string, string>;
    set_mock: ReturnType<typeof vi.fn>;
} {
    const values = new Map<string, string>();
    const set_mock = vi.fn((key: string, value: string) => {
        values.set(key, value);
        return Promise.resolve();
    });
    return {
        values,
        set_mock,
        get: vi.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
        set: set_mock,
        delete: vi.fn((key: string) => {
            values.delete(key);
            return Promise.resolve();
        }),
        has: vi.fn((key: string) => Promise.resolve(values.has(key))),
        list_keys: vi.fn((prefix?: string) =>
            Promise.resolve([...values.keys()].filter((key) => !prefix || key.startsWith(prefix))),
        ),
        replaceAll: vi.fn((entries: Record<string, string>) => {
            values.clear();
            for (const [key, value] of Object.entries(entries)) values.set(key, value);
            return Promise.resolve();
        }),
    };
}

function create_session(): SessionController {
    return {
        on_before_send_headers: vi.fn(),
        get_cookies: vi.fn(() => Promise.resolve([{ name: "WHMCSUserID", value: "42" }])),
    };
}

describe("flowercloud_dom", () => {
    describe("write_flowercloud_html", () => {
        it("refuses to write once the refresh has been cancelled", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);

            const written = await write_flowercloud_html(vault, "flower-1", USAGE_HTML, null, {
                is_cancelled: () => true,
            });

            expect(written).toBe(false);
            expect(vault.set_mock).toHaveBeenCalledTimes(1); // 只有测试自己的预置写入
            expect(vault.values.get(KEY)).toBe(OLD_SECRET);
        });

        it("refuses to overwrite a session that changed while capturing", async () => {
            const vault = create_vault();
            const fresh_secret = JSON.stringify({
                cookie: "WHMCS=new",
                html: "<p>流量使用 400GB / 1000GB</p>",
                captured_at: Date.now(),
            });
            let gets = 0;
            vault.get = vi.fn(() => {
                gets += 1;
                // 第一次读旧值，落盘前复核时读到新登录/新快照写入的值。
                return Promise.resolve(gets === 1 ? OLD_SECRET : fresh_secret);
            });

            const written = await write_flowercloud_html(vault, "flower-1", USAGE_HTML, null);

            expect(written).toBe(false);
            expect(vault.set_mock).not.toHaveBeenCalled();
        });

        it("writes when neither cancellation nor a concurrent change happened", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);

            const written = await write_flowercloud_html(vault, "flower-1", USAGE_HTML, null, {
                is_cancelled: () => false,
            });

            expect(written).toBe(true);
            expect(vault.values.get(KEY)).toContain("331.40GB");
        });
    });

    describe("run_flowercloud_snapshot", () => {
        it("does not write when the window is closed while reading cookies", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);
            const session = create_session();
            let cancelled = false;
            let calls = 0;
            session.get_cookies = vi.fn(() => {
                calls += 1;
                // 第一次是开头的 jar 读取；第二次是写回前取新 cookie，
                // 此时用户关掉窗口（宿主会同步把 cancelled 置真）。
                if (calls >= 2) cancelled = true;
                return Promise.resolve([{ name: "WHMCSUserID", value: "42" }]);
            });

            const outcome = await run_flowercloud_snapshot({
                window: create_window(USAGE_HTML),
                session,
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => cancelled,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 500 },
            });

            expect(outcome.written).toBe(false);
            expect(outcome.kind).toBe("cancelled");
            expect(vault.values.get(KEY)).toBe(OLD_SECRET);
        });

        it("writes the snapshot when the usage page is captured", async () => {
            const vault = create_vault();
            await vault.set(KEY, OLD_SECRET);

            const outcome = await run_flowercloud_snapshot({
                window: create_window(USAGE_HTML),
                session: create_session(),
                vault,
                instance_id: "flower-1",
                login_url: LOGIN_URL,
                is_cancelled: () => false,
                options: { poll_ms: 5, settle_ms: 0, timeout_ms: 500 },
            });

            expect(outcome.written).toBe(true);
            expect(vault.values.get(KEY)).toContain("331.40GB");
        });
    });
});
