import { describe, it, expect } from "vitest";
import type { AppConfiguration } from "../../../src/shared/types/config";
import {
    resolve_main_panel_mode,
    resolve_floating_height_mode,
} from "../../../src/main/core/main-panel/main-panel-config";

const base_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

describe("resolve_main_panel_mode", () => {
    it("system + darwin => popup", () => {
        expect(resolve_main_panel_mode(base_config, "darwin")).toBe("popup");
    });

    it("system + win32 => floating", () => {
        expect(resolve_main_panel_mode(base_config, "win32")).toBe("floating");
    });

    it("system + linux => floating", () => {
        expect(resolve_main_panel_mode(base_config, "linux")).toBe("floating");
    });

    it("missing mainPanelMode defaults to system behavior", () => {
        const config: AppConfiguration = { ...base_config };
        expect(resolve_main_panel_mode(config, "darwin")).toBe("popup");
        expect(resolve_main_panel_mode(config, "win32")).toBe("floating");
    });

    it("explicit popup honored", () => {
        const config: AppConfiguration = { ...base_config, mainPanelMode: "popup" };
        expect(resolve_main_panel_mode(config, "win32")).toBe("popup");
        expect(resolve_main_panel_mode(config, "linux")).toBe("popup");
    });

    it("explicit floating honored", () => {
        const config: AppConfiguration = { ...base_config, mainPanelMode: "floating" };
        expect(resolve_main_panel_mode(config, "darwin")).toBe("floating");
    });
});

describe("resolve_floating_height_mode", () => {
    it("defaults to fixed when unset", () => {
        expect(resolve_floating_height_mode(base_config)).toBe("fixed");
    });

    it("honors explicit fixed", () => {
        const config: AppConfiguration = { ...base_config, floatingHeightMode: "fixed" };
        expect(resolve_floating_height_mode(config)).toBe("fixed");
    });

    it("honors explicit followContent", () => {
        const config: AppConfiguration = { ...base_config, floatingHeightMode: "followContent" };
        expect(resolve_floating_height_mode(config)).toBe("followContent");
    });
});
