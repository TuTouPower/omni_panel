import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfigStore } from "../../../src/main/core/config/config-store";
import type { AppConfiguration } from "../../../src/shared/types/config";
import { writeFile, mkdir, rename, open } from "node:fs/promises";

vi.mock("node:fs/promises");

const mockHandle = {
    sync: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
};

const mockConfig: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

describe("config-store debounce", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.mocked(writeFile).mockResolvedValue(undefined);
        vi.mocked(mkdir).mockResolvedValue(undefined);
        vi.mocked(rename).mockResolvedValue(undefined);
        vi.mocked(open).mockResolvedValue(
            mockHandle as unknown as Awaited<ReturnType<typeof open>>,
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // NOTE: All fs mocks resolve successfully. ENOSPC, EACCES, and other
    // transient write-failure modes are not covered by these tests.

    it("scheduleSave delays write by default 500ms", async () => {
        const store = createConfigStore("/tmp/config.json");

        store.scheduleSave({ ...mockConfig, launchAtLogin: true });
        expect(writeFile).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(500);
        expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it("multiple scheduleSave calls within window only write once", async () => {
        const store = createConfigStore("/tmp/config.json");

        store.scheduleSave({ ...mockConfig, language: "en" });
        await vi.advanceTimersByTimeAsync(200);

        store.scheduleSave({ ...mockConfig, language: "zh-Hans" });
        await vi.advanceTimersByTimeAsync(200);

        store.scheduleSave({ ...mockConfig, language: "en" });
        await vi.advanceTimersByTimeAsync(500);

        expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it("writes the latest config, not earlier ones", async () => {
        const store = createConfigStore("/tmp/config.json");

        store.scheduleSave({ ...mockConfig, language: "en" });
        await vi.advanceTimersByTimeAsync(100);

        store.scheduleSave({ ...mockConfig, language: "zh-Hans" });
        await vi.advanceTimersByTimeAsync(500);

        const writtenJson = vi.mocked(writeFile).mock.calls[0]?.[1] as string;
        const written = JSON.parse(writtenJson) as AppConfiguration;
        expect(written.language).toBe("zh-Hans");
    });

    it("clearTimeout prevents previous timer from firing", async () => {
        const store = createConfigStore("/tmp/config.json");

        // Schedule first, then immediately schedule second (should cancel first)
        store.scheduleSave({ ...mockConfig, language: "en" });
        store.scheduleSave({ ...mockConfig, language: "zh-Hans" });

        await vi.advanceTimersByTimeAsync(500);
        expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it("resolves a thunk payload when the debounce fires, not when it is scheduled", async () => {
        const store = createConfigStore("/tmp/config.json");
        // Window-bounds savers pass a thunk so a config saved by the renderer
        // inside the debounce window is not reverted by a stale snapshot.
        let live_config: AppConfiguration = { ...mockConfig, launchAtLogin: true };

        store.scheduleSave(() => live_config);
        live_config = { ...live_config, providerOrder: ["__upcoming_reset__", "claude"] };
        await vi.advanceTimersByTimeAsync(500);

        const written_json = vi.mocked(writeFile).mock.calls[0]?.[1] as string;
        const written = JSON.parse(written_json) as AppConfiguration;
        expect(written.providerOrder).toEqual(["__upcoming_reset__", "claude"]);
    });

    it("flushPendingSave resolves a pending thunk payload", async () => {
        const store = createConfigStore("/tmp/config.json");
        let live_config: AppConfiguration = { ...mockConfig };

        store.scheduleSave(() => live_config);
        live_config = { ...live_config, expandedProviders: { __upcoming_reset__: true } };
        await store.flushPendingSave();

        const written_json = vi.mocked(writeFile).mock.calls[0]?.[1] as string;
        const written = JSON.parse(written_json) as AppConfiguration;
        expect(written.expandedProviders).toEqual({ __upcoming_reset__: true });
    });
});
