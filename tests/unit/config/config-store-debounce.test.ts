import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfigStore } from "../../../src/main/core/config/config-store";
import type { AppConfiguration } from "../../../src/shared/types/config";
import { writeFile, mkdir, rename } from "node:fs/promises";

vi.mock("node:fs/promises");

const mockConfig: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    overviewDisplayMode: "tabs",
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
    });

    afterEach(() => {
        vi.useRealTimers();
    });

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
});
