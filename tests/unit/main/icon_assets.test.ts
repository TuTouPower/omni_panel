import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { PNG } = nodeRequire("pngjs");

const ROOT = resolve(__dirname, "../../../");

interface PngImage {
    width: number;
    height: number;
    data: Buffer;
}

function readPng(relativePath: string): PngImage {
    const fullPath = resolve(ROOT, relativePath);
    expect(existsSync(fullPath), `File should exist: ${relativePath}`).toBe(true);
    const data = readFileSync(fullPath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return PNG.sync.read(data) as PngImage;
}

function getBoundingBox(png: PngImage): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
} {
    let minX = png.width;
    let maxX = 0;
    let minY = png.height;
    let maxY = 0;
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const idx = (png.width * y + x) << 2;
            const alpha = png.data[idx + 3] ?? 0;
            if (alpha > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    const width = maxX >= minX ? maxX - minX + 1 : 0;
    const height = maxY >= minY ? maxY - minY + 1 : 0;
    return { minX, maxX, minY, maxY, width, height };
}

function assertTemplatePixels(png: PngImage): void {
    let hasVisiblePixels = false;
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const idx = (png.width * y + x) << 2;
            const r = png.data[idx] ?? 0;
            const g = png.data[idx + 1] ?? 0;
            const b = png.data[idx + 2] ?? 0;
            const a = png.data[idx + 3] ?? 0;
            if (a > 0) {
                hasVisiblePixels = true;
                // Template image: pure monochrome black + alpha (R=0, G=0, B=0)
                expect(r).toBe(0);
                expect(g).toBe(0);
                expect(b).toBe(0);
            }
        }
    }
    expect(hasVisiblePixels).toBe(true);
}

describe("AC-001 & AC-002: macOS tray icon template specification", () => {
    it("tray-iconTemplate.png is 16x16 and pure black + alpha", () => {
        const png = readPng("assets/tray-iconTemplate.png");
        expect(png.width).toBe(16);
        expect(png.height).toBe(16);
        assertTemplatePixels(png);
    });

    it("tray-iconTemplate@2x.png is 32x32 and pure black + alpha", () => {
        const png = readPng("assets/tray-iconTemplate@2x.png");
        expect(png.width).toBe(32);
        expect(png.height).toBe(32);
        assertTemplatePixels(png);
    });
});

describe("AC-003: Test instance tray icon template specification", () => {
    it("tray-icon-testTemplate.png is 16x16 and pure black + alpha", () => {
        const png = readPng("assets/tray-icon-testTemplate.png");
        expect(png.width).toBe(16);
        expect(png.height).toBe(16);
        assertTemplatePixels(png);
    });

    it("tray-icon-testTemplate@2x.png is 32x32 and pure black + alpha", () => {
        const png = readPng("assets/tray-icon-testTemplate@2x.png");
        expect(png.width).toBe(32);
        expect(png.height).toBe(32);
        assertTemplatePixels(png);
    });
});

describe("AC-004: macOS dock / app icon canvas specification", () => {
    it("assets/icon.png body is 824±2px and centered in 1024x1024", () => {
        const png = readPng("assets/icon.png");
        expect(png.width).toBe(1024);
        expect(png.height).toBe(1024);
        const bbox = getBoundingBox(png);
        expect(bbox.width).toBeGreaterThanOrEqual(822);
        expect(bbox.width).toBeLessThanOrEqual(826);
        expect(bbox.height).toBeGreaterThanOrEqual(822);
        expect(bbox.height).toBeLessThanOrEqual(826);
        expect(Math.abs(bbox.minX - 100)).toBeLessThanOrEqual(2);
        expect(Math.abs(bbox.minY - 100)).toBeLessThanOrEqual(2);
    });

    it("assets/icon-test.png body is 824±2px and centered in 1024x1024", () => {
        const png = readPng("assets/icon-test.png");
        expect(png.width).toBe(1024);
        expect(png.height).toBe(1024);
        const bbox = getBoundingBox(png);
        expect(bbox.width).toBeGreaterThanOrEqual(822);
        expect(bbox.width).toBeLessThanOrEqual(826);
        expect(bbox.height).toBeGreaterThanOrEqual(822);
        expect(bbox.height).toBeLessThanOrEqual(826);
        expect(Math.abs(bbox.minX - 100)).toBeLessThanOrEqual(2);
        expect(Math.abs(bbox.minY - 100)).toBeLessThanOrEqual(2);
    });
});

describe("AC-007: Windows & Linux icon assets preserved", () => {
    it("assets/icon.ico exists and has multi-size content", () => {
        const icoPath = resolve(ROOT, "assets/icon.ico");
        expect(existsSync(icoPath)).toBe(true);
        const stat = readFileSync(icoPath);
        expect(stat.length).toBeGreaterThan(50000);
    });

    it("assets/icon-test.ico exists and has multi-size content", () => {
        const icoPath = resolve(ROOT, "assets/icon-test.ico");
        expect(existsSync(icoPath)).toBe(true);
        const stat = readFileSync(icoPath);
        expect(stat.length).toBeGreaterThan(50000);
    });

    it("assets/tray-icon.png exists for non-macOS platforms", () => {
        const png = readPng("assets/tray-icon.png");
        expect(png.width).toBe(32);
        expect(png.height).toBe(32);
    });

    it("assets/tray-icon-test.png exists for non-macOS test platforms", () => {
        const png = readPng("assets/tray-icon-test.png");
        expect(png.width).toBeGreaterThanOrEqual(32);
        expect(png.height).toBeGreaterThanOrEqual(32);
    });
});
