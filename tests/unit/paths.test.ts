import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
    app: {
        getPath: vi.fn(() => "/mock/userData"),
    },
}));

const { getDataRoot, getConfigPath, getStatesDir, getUserConnectorsDir } =
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

    it("getUserConnectorsDir ends with connectors", () => {
        expect(getUserConnectorsDir()).toMatch(/connectors$/);
    });

    it("handles Unicode and spaces in userData path", async () => {
        vi.resetModules();
        vi.doMock("electron", () => ({
            app: {
                getPath: vi.fn(() => "C:\\Users\\李明\\AppData\\Roaming\\Omni Usage"),
            },
        }));
        const {
            getDataRoot: getDataRoot2,
            getConfigPath: getConfigPath2,
            getStatesDir: getStatesDir2,
            getUserConnectorsDir: getUserConnectorsDir2,
        } = await import("../../src/main/core/paths");
        const root = getDataRoot2();
        expect(root).toContain("李明");
        expect(root).toContain("Omni Usage");
        expect(getConfigPath2()).toMatch(/config\.json$/);
        expect(getStatesDir2()).toMatch(/states$/);
        expect(getUserConnectorsDir2()).toMatch(/connectors$/);
    });
});
