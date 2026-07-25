import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfigStore } from "../../../src/main/core/config/config-store";
import type { AppConfiguration } from "../../../src/shared/types/config";
import { writeFile, mkdir, rename } from "node:fs/promises";

vi.mock("node:fs/promises");

/**
 * Pins the contract that src/main/index.ts window-bounds savers rely on:
 * `scheduleSave` MUST be passed a thunk resolved at flush time, not a value
 * captured at event time. A value captures a stale snapshot and reverts any
 * renderer save (providerOrder, expandedProviders) made inside the 500ms
 * debounce window - the regression fixed in t105.
 *
 * Same mirror-wiring pattern as popup_suppress_move.test.ts. The index.ts
 * call sites are not directly imported (its wiring is main-process glue); this
 * test guards the thunk contract they depend on. The `config-store-debounce`
 * thunk tests cover the store primitive; this test covers the "live snapshot
 * updated mid-window" shape the bounds savers present.
 */
const base_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

describe("main config-save wiring", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.mocked(writeFile).mockResolvedValue(undefined);
        vi.mocked(mkdir).mockResolvedValue(undefined);
        vi.mocked(rename).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("thunk-backed debounced save reflects renderer writes made inside the debounce window", async () => {
        const config_store = createConfigStore("/tmp/config.json");
        let current_config_snapshot: AppConfiguration = {
            ...base_config,
            providerOrder: ["claude"],
        };

        // Thunk shape used by index.ts bounds savers. A value captured here
        // would freeze providerOrder:["claude"] and revert the write below.
        config_store.scheduleSave(() => current_config_snapshot);

        await vi.advanceTimersByTimeAsync(100);
        current_config_snapshot = {
            ...current_config_snapshot,
            providerOrder: ["__upcoming_reset__", "claude"],
            expandedProviders: { __upcoming_reset__: true },
        };
        await vi.advanceTimersByTimeAsync(500);

        const written_json = vi.mocked(writeFile).mock.calls[0]?.[1] as string;
        const written = JSON.parse(written_json) as AppConfiguration;
        expect(written.providerOrder).toEqual(["__upcoming_reset__", "claude"]);
        expect(written.expandedProviders).toEqual({ __upcoming_reset__: true });
    });
});
