import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
    app: {
        getPath: vi.fn(() => "/mock/userData"),
        isPackaged: false,
    },
}));

const {
    getDataRoot,
    getConfigPath,
    getStatesDir,
    getUserConnectorsDir,
    get_vault_path,
    get_vault_key_path,
    get_observations_db_path,
    get_snapshot_cache_path,
    get_logs_dir,
    get_tray_icon_path,
    get_app_icon_path,
} = await import("../../src/main/core/paths");

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
                isPackaged: false,
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

    it("get_vault_path ends with secrets.vault under userData", () => {
        expect(get_vault_path()).toMatch(/secrets\.vault$/);
    });

    it("get_vault_key_path ends with vault.key under userData", () => {
        expect(get_vault_key_path()).toMatch(/vault\.key$/);
    });

    it("get_observations_db_path ends with observations.sqlite under userData", () => {
        expect(get_observations_db_path()).toMatch(/observations\.sqlite$/);
    });

    it("get_snapshot_cache_path ends with snapshot-cache.json under userData", () => {
        expect(get_snapshot_cache_path()).toMatch(/snapshot-cache\.json$/);
    });

    it("get_logs_dir ends with logs directory under userData", () => {
        expect(get_logs_dir()).toMatch(/logs$/);
    });

    it("path getters accept optional base dir override for testability", () => {
        const custom_base = "/custom/data/root";
        // 路径分隔符跨平台差异：统一成正斜杠后比较
        const normalize = (p: string): string => p.replace(/\\/g, "/");
        expect(normalize(get_vault_path(custom_base))).toBe(`${custom_base}/secrets.vault`);
        expect(normalize(get_vault_key_path(custom_base))).toBe(`${custom_base}/vault.key`);
        expect(normalize(get_observations_db_path(custom_base))).toBe(
            `${custom_base}/observations.sqlite`,
        );
        expect(normalize(get_snapshot_cache_path(custom_base))).toBe(
            `${custom_base}/snapshot-cache.json`,
        );
        expect(normalize(get_logs_dir(custom_base))).toBe(`${custom_base}/logs`);
        const is_darwin = process.platform === "darwin";
        const expected_tray = is_darwin ? "tray-iconTemplate.png" : "tray-icon.png";
        expect(normalize(get_tray_icon_path(custom_base))).toBe(`${custom_base}/${expected_tray}`);
        expect(normalize(get_app_icon_path(custom_base))).toBe(`${custom_base}/icon.png`);
    });

    it("get_tray_icon_path reflects TEST_INSTANCE and platform specification", () => {
        const origEnv = process.env["TEST_INSTANCE"];
        try {
            delete process.env["TEST_INSTANCE"];
            const is_darwin = process.platform === "darwin";
            const default_tray = get_tray_icon_path();
            if (is_darwin) {
                expect(default_tray).toMatch(/tray-iconTemplate\.png$/);
            } else {
                expect(default_tray).toMatch(/tray-icon\.png$/);
            }

            process.env["TEST_INSTANCE"] = "1";
            const test_tray = get_tray_icon_path();
            if (is_darwin) {
                expect(test_tray).toMatch(/tray-icon-testTemplate\.png$/);
            } else {
                expect(test_tray).toMatch(/tray-icon-test\.png$/);
            }
        } finally {
            if (origEnv !== undefined) {
                process.env["TEST_INSTANCE"] = origEnv;
            } else {
                delete process.env["TEST_INSTANCE"];
            }
        }
    });
});
