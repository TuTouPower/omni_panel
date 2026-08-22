import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * t412：会话窗口滚动条统一为 6px 细规范样式。
 * 断言 globals 配方、token 存在与设置/CPA 字面量收口；
 * jsdom 不断言真实渲染，观感由 AC-004 [deploy] 人工确认。
 */

const globals_css = readFileSync(join(process.cwd(), "src/renderer/styles/globals.css"), "utf8");
const design_md = readFileSync(join(process.cwd(), "DESIGN.md"), "utf8");

describe("session scrollbar 细规范样式（t412）", () => {
    it("DESIGN.md 定义 scrollbar-thumb / hover 明暗 token（AC-001/002）", () => {
        expect(design_md).toMatch(/scrollbar-thumb:\s*["']/);
        expect(design_md).toMatch(/scrollbar-thumb-hover:\s*["']/);
        expect(design_md).toMatch(/scrollbar-thumb-dark:\s*["']/);
        expect(design_md).toMatch(/scrollbar-thumb-hover-dark:\s*["']/);
    });

    it("globals @theme 导出 scrollbar token，暗色翻转指向 -dark（AC-001/002）", () => {
        expect(globals_css).toContain("--color-scrollbar-thumb:");
        expect(globals_css).toContain("--color-scrollbar-thumb-hover:");
        expect(globals_css).toContain("--color-scrollbar-thumb-dark:");
        expect(globals_css).toContain("--color-scrollbar-thumb-hover-dark:");
        // 暗色语义翻转（与 surface 等同路径）
        expect(globals_css).toMatch(
            /--color-scrollbar-thumb:\s*var\(--color-scrollbar-thumb-dark\)/,
        );
        expect(globals_css).toMatch(
            /--color-scrollbar-thumb-hover:\s*var\(--color-scrollbar-thumb-hover-dark\)/,
        );
    });

    it("@utility scrollbar-token：6px 宽、透明轨道、thumb/hover 引用 token（AC-001/002）", () => {
        // 会话滚动容器专用 utility，避免全局改动其它窗口结构（spec 非范围）
        expect(globals_css).toContain("@utility scrollbar-token");
        // 宽高 6px
        expect(globals_css).toMatch(/&::-webkit-scrollbar\s*\{[^}]*width:\s*6px/s);
        expect(globals_css).toMatch(/&::-webkit-scrollbar\s*\{[^}]*height:\s*6px/s);
        // 轨道透明
        expect(globals_css).toMatch(
            /&::-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent/s,
        );
        // thumb 引用 token（禁止散落 hex/rgba 字面量作为 thumb 色）
        expect(globals_css).toMatch(
            /&::-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*var\(--color-scrollbar-thumb\)/s,
        );
        expect(globals_css).toMatch(
            /&::-webkit-scrollbar-thumb:hover\s*\{[^}]*background-color:\s*var\(--color-scrollbar-thumb-hover\)/s,
        );
    });

    it("Firefox 侧 thin + scrollbar-color 引用 token 与透明轨道（AC-001）", () => {
        expect(globals_css).toMatch(/scrollbar-width:\s*thin/);
        expect(globals_css).toMatch(
            /scrollbar-color:\s*var\(--color-scrollbar-thumb\)\s+transparent/,
        );
    });

    it("隐藏 webkit 滚动按钮，箭头与 thumb 同轴（AC-003）", () => {
        // 默认 Chromium 的 ▲/▼ 按钮与粗轨错位；显式折叠按钮后只剩 6px 单轴。
        expect(globals_css).toMatch(
            /&::-webkit-scrollbar-button\s*\{[^}]*(?:display:\s*none|width:\s*0|height:\s*0)/s,
        );
    });

    it("会话窗口范围滚动容器挂 scrollbar-token（AC-001 作用域）", () => {
        const roots = [
            "src/renderer/components/workspace/SessionPane.tsx",
            "src/renderer/components/workspace/SessionRail.tsx",
            "src/renderer/components/workspace/SelectionTray.tsx",
            "src/renderer/components/session-library/SessionList.tsx",
        ];
        for (const rel of roots) {
            const src = readFileSync(join(process.cwd(), rel), "utf8");
            expect(src, rel).toContain("scrollbar-token");
        }
        // 大纲列表与消息滚动区在 SessionPane 内挂 scrollbar-token（testid 锚点）。
        const pane = readFileSync(
            join(process.cwd(), "src/renderer/components/workspace/SessionPane.tsx"),
            "utf8",
        );
        expect(pane).toMatch(
            /scrollbar-token[\s\S]{0,200}data-testid="conversation-outline-list"|data-testid="conversation-outline-list"[\s\S]{0,200}scrollbar-token/,
        );
        expect(pane).toMatch(
            /scrollbar-token[\s\S]{0,200}data-testid="conversation-message-scroll"|data-testid="conversation-message-scroll"[\s\S]{0,200}scrollbar-token/,
        );
    });

    it("设置/CPA 窗口 scrollbar 色收口为 token，无 rgba 字面量（非范围色值收口）", () => {
        const settings = readFileSync(
            join(process.cwd(), "src/renderer/views/SettingsView.tsx"),
            "utf8",
        );
        const cpa = readFileSync(
            join(process.cwd(), "src/renderer/components/CpaConnectorSettings.tsx"),
            "utf8",
        );
        expect(settings).not.toMatch(/scrollbar-color:rgba\(/);
        expect(cpa).not.toMatch(/scrollbar-color:rgba\(/);
        expect(settings).toMatch(/scrollbar-color:var\(--color-scrollbar-thumb\)/);
        expect(cpa).toMatch(/scrollbar-color:var\(--color-scrollbar-thumb\)/);
    });
});

describe("会话消息区滚动容器结构（t412 AC-003）", () => {
    it("SessionPane 消息滚动区 testid 为 conversation-message-scroll 且位于 conversation-body 内", () => {
        const src = readFileSync(
            join(process.cwd(), "src/renderer/components/workspace/SessionPane.tsx"),
            "utf8",
        );
        // 滚动容器与回到底部按钮同挂 conversation-body relative 下，右缘同轴。
        expect(src).toMatch(
            /data-testid="conversation-body"|className="relative flex min-h-0 flex-1"/,
        );
        expect(src).toContain('data-testid="conversation-message-scroll"');
        expect(src).toContain('data-testid="conversation-to-bottom"');
        // 回到底部按钮锚定 body 右下，与滚动条同侧右缘
        expect(src).toMatch(
            /data-testid="conversation-to-bottom"[^>]*absolute[^"]*right-|absolute[^"]*right-[^"]*"[^>]*data-testid="conversation-to-bottom"/,
        );
    });
});
