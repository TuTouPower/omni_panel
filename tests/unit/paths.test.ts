import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
    app: {
        getPath: vi.fn(() => "/mock/userData"),
    },
}));

const { getDataRoot, getConfigPath, getStatesDir, getUserPluginsDir, getLogsDir } =
    await import("../../src/main/core/paths");

describe("paths", () => {
    it("getDataRoot returns userData path", () => {
        const root = getDataRoot();
        expect(root).toBe("/mock/userData");
        expect(typeof root).toBe("string");
        expect(root.length).toBeGreaterThan(0);
    });

    it("getConfigPath ends with config.json", () => {
        expect(getConfigPath()).toMatch(/config\.json$/);
    });

    it("getStatesDir ends with states", () => {
        expect(getStatesDir()).toMatch(/states$/);
    });

    it("getUserPluginsDir ends with plugins", () => {
        expect(getUserPluginsDir()).toMatch(/plugins$/);
    });

    it("getLogsDir ends with logs", () => {
        expect(getLogsDir()).toMatch(/logs$/);
    });
});
