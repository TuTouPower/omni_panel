import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { create_debounced_config_patcher } from "../../../../src/renderer/lib/config-debounce";
import type { AppConfiguration } from "../../../../src/shared/types/config";

const base: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

describe("create_debounced_config_patcher (t195 AC4)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("merges rapid patches into a single save after the debounce window", async () => {
        const get = vi.fn().mockResolvedValue({ config: base });
        const save = vi.fn().mockResolvedValue(undefined);
        const patcher = create_debounced_config_patcher({ get, save, delay_ms: 500 });

        patcher.patch({ collapsedAccounts: { a: true } });
        await vi.advanceTimersByTimeAsync(100);
        patcher.patch({ expandedProviders: { claude: true } });
        await vi.advanceTimersByTimeAsync(100);
        patcher.patch({ providerOrder: ["claude"] });

        expect(save).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(500);
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith({
            ...base,
            collapsedAccounts: { a: true },
            expandedProviders: { claude: true },
            providerOrder: ["claude"],
        });
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("last patch for the same key wins", async () => {
        const get = vi.fn().mockResolvedValue({ config: base });
        const save = vi.fn().mockResolvedValue(undefined);
        const patcher = create_debounced_config_patcher({ get, save, delay_ms: 500 });

        patcher.patch({ providerOrder: ["a"] });
        patcher.patch({ providerOrder: ["b"] });
        await vi.advanceTimersByTimeAsync(500);

        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith({ ...base, providerOrder: ["b"] });
    });

    it("flush persists immediately without waiting for the timer", async () => {
        const get = vi.fn().mockResolvedValue({ config: base });
        const save = vi.fn().mockResolvedValue(undefined);
        const patcher = create_debounced_config_patcher({ get, save, delay_ms: 500 });

        patcher.patch({ collapsedAccounts: { a: true } });
        await patcher.flush();

        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith({ ...base, collapsedAccounts: { a: true } });
        // flush 后残留 timer 不应再触发第二次 save。
        await vi.advanceTimersByTimeAsync(500);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("dispose cancels the pending timer but flushes pending patch (f001)", async () => {
        const get = vi.fn().mockResolvedValue({ config: base });
        const save = vi.fn().mockResolvedValue(undefined);
        const patcher = create_debounced_config_patcher({ get, save, delay_ms: 500 });

        patcher.patch({ collapsedAccounts: { a: true } });
        patcher.dispose();
        // 卸载即触发 flush：pending 不丢失（AC7）。
        await vi.advanceTimersByTimeAsync(0);
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith({ ...base, collapsedAccounts: { a: true } });
        // dispose 后残留 timer 不应再触发第二次 save。
        await vi.advanceTimersByTimeAsync(500);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("serializes saves on an internal queue", async () => {
        const get = vi.fn().mockResolvedValue({ config: base });
        const save = vi.fn().mockResolvedValue(undefined);
        const patcher = create_debounced_config_patcher({ get, save, delay_ms: 500 });

        patcher.patch({ providerOrder: ["a"] });
        await patcher.flush();
        patcher.patch({ providerOrder: ["b"] });
        await patcher.flush();

        expect(save).toHaveBeenCalledTimes(2);
        expect(get).toHaveBeenCalledTimes(2);
    });
});
