import { describe, expect, it } from "vitest";
import {
    compute_clamped_bounds,
    get_saved_bounds,
    PANEL_MIN_HEIGHT,
    PANEL_MIN_WIDTH,
} from "../../../src/main/window/window-bounds";
import type { AppConfiguration } from "../../../src/shared/types/config";

const primary = { id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } };
const second = { id: 2, workArea: { x: 1280, y: 0, width: 1920, height: 1080 } };
const displays = [primary, second];

describe("compute_clamped_bounds (t251)", () => {
    it("可见 bounds 保持不变", () => {
        const out = compute_clamped_bounds(
            { x: 100, y: 50, width: 900, height: 600 },
            displays,
            primary,
        );
        expect(out).toEqual({ x: 100, y: 50, width: 900, height: 600 });
    });

    it("负坐标钳制回 workArea", () => {
        const out = compute_clamped_bounds(
            { x: -200, y: -100, width: 900, height: 600 },
            displays,
            primary,
        );
        expect(out.x).toBe(0);
        expect(out.y).toBe(0);
    });

    it("超右界钳制回可见（x+width ≤ workArea 右界）", () => {
        const out = compute_clamped_bounds(
            { x: 1000, y: 100, width: 900, height: 600 },
            displays,
            primary,
        );
        expect(out.x + out.width).toBeLessThanOrEqual(primary.workArea.width);
        expect(out.width).toBe(900);
    });

    it("小于最小尺寸时提升到最小尺寸", () => {
        const out = compute_clamped_bounds(
            { x: 10, y: 10, width: 200, height: 150 },
            displays,
            primary,
        );
        expect(out.width).toBe(PANEL_MIN_WIDTH);
        expect(out.height).toBe(PANEL_MIN_HEIGHT);
    });

    it("大于 workArea 时收缩到 workArea", () => {
        const out = compute_clamped_bounds(
            { x: 0, y: 0, width: 5000, height: 5000 },
            displays,
            primary,
        );
        expect(out.width).toBe(primary.workArea.width);
        expect(out.height).toBe(primary.workArea.height);
    });

    it("displayId 匹配副屏时用副屏 workArea 钳制", () => {
        const out = compute_clamped_bounds(
            { x: 1400, y: 200, width: 900, height: 600, displayId: "2" },
            displays,
            primary,
        );
        expect(out.x).toBeGreaterThanOrEqual(second.workArea.x);
        expect(out.x + out.width).toBeLessThanOrEqual(second.workArea.x + second.workArea.width);
    });

    it("displayId 失效回退主屏", () => {
        const out = compute_clamped_bounds(
            { x: 100, y: 50, width: 900, height: 600, displayId: "999" },
            displays,
            primary,
        );
        expect(out.x).toBe(100);
    });

    it("无 displayId 用主屏", () => {
        const out = compute_clamped_bounds(
            { x: 50, y: 50, width: 500, height: 400 },
            displays,
            primary,
        );
        expect(out).toEqual({ x: 50, y: 50, width: 500, height: 400 });
    });
});

describe("get_saved_bounds (t251)", () => {
    it("agentWindowBounds 存在时返回", () => {
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
            agentWindowBounds: { x: 10, y: 20, width: 900, height: 700, displayId: "1" },
        } as AppConfiguration;
        expect(get_saved_bounds(config, "agentWindowBounds")).toEqual({
            x: 10,
            y: 20,
            width: 900,
            height: 700,
            displayId: "1",
        });
    });

    it("无键时返回 null", () => {
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
        } as AppConfiguration;
        expect(get_saved_bounds(config, "agentWindowBounds")).toBeNull();
        expect(get_saved_bounds(config, "historyWindowBounds")).toBeNull();
    });

    it("缺 displayId 时返回不带该字段的对象", () => {
        const config = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
            historyWindowBounds: { x: 1, y: 2, width: 1000, height: 720 },
        } as AppConfiguration;
        const out = get_saved_bounds(config, "historyWindowBounds");
        expect(out).toEqual({ x: 1, y: 2, width: 1000, height: 720 });
        expect("displayId" in (out ?? {})).toBe(false);
    });
});
