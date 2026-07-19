import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read_source(path: string): string {
    return readFileSync(join(process.cwd(), path), "utf8");
}

describe("route values unified usage/setting/tray/agent", () => {
    it("preload switch uses fallback usage + case setting/tray", () => {
        const src = read_source("src/preload/index.ts");
        expect(src).toContain('|| "usage"');
        expect(src).toContain('case "setting":');
        expect(src).toContain('case "tray":');
        expect(src).not.toContain('|| "popup"');
        expect(src).not.toContain('case "settings":');
    });

    it("route_api judges route === setting", () => {
        const src = read_source("src/preload/route_api.ts");
        expect(src).toContain('route === "setting"');
        expect(src).not.toContain('route === "settings"');
    });

    it("main-panel-controller loads usage route (not popup)", () => {
        const src = read_source("src/main/core/main-panel/main-panel-controller.ts");
        expect(src).toContain('get_renderer_url("usage")');
        expect(src).not.toContain('get_renderer_url("popup")');
    });

    it("window-manager WINDOW_CONFIGS exposes four routes", () => {
        const src = read_source("src/main/window/window-manager.ts");
        expect(src).toContain('route: "usage"');
        expect(src).toContain('route: "setting"');
        expect(src).toContain('route: "tray"');
        expect(src).toContain('route: "agent"');
    });

    it("renderer use-route VALID_ROUTES is a closed set over the four routes", () => {
        const src = read_source("src/renderer/hooks/use-route.ts");
        expect(src).toContain('new Set(["usage", "setting", "agent", "tray"])');
    });

    it("App.tsx route->view switch consumes the four routes", () => {
        const src = read_source("src/renderer/App.tsx");
        expect(src).toContain('case "setting":');
        expect(src).toContain('case "tray":');
        expect(src).toContain('case "agent":');
        expect(src).toContain("default:");
        expect(src).not.toContain('case "settings":');
        expect(src).not.toContain('case "popup":');
    });
});
