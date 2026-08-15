import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionPane } from "../../../../src/renderer/components/workspace/SessionPane";
import { SessionRail } from "../../../../src/renderer/components/workspace/SessionRail";
import {
    empty_slots,
    session_meta,
    try_assign_slot,
} from "../../../../src/renderer/lib/workspace/slots";
import type { PaneData } from "../../../../src/renderer/lib/workspace/pane";
import type { TokenStatsSession } from "../../../../src/shared/types/token-stats";
import { install_history_usageboard } from "../views/session_history_test_utils";

/** 会话字号层级断言（渲染输出）。找不到元素即失败，返回非空元素。 */
function require_el(selector: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`元素未渲染: ${selector}`);
    return el;
}

/**
 * t265 AC1 / t273 review f001 改造：会话字号层级断言脱离「源文件文本正则」，
 * 改为对组件渲染输出的 DOM 断言——元素必须真实渲染出来且带对应字号类。
 * 语义等价：标题字号 < 元信息字号（t257 互换后 title 小、meta 大），
 * rail 标题 body-sm > meta label-md。
 */

function column(overrides: Partial<PaneData> = {}): PaneData {
    return {
        loc: { source: "claude_code", env: "win", session_id: "sess_a" },
        title: "会话标题",
        openedAt: 0,
        messages: [],
        next_cursor: null,
        loading_older: false,
        status: "ready",
        ...overrides,
    };
}

const META = {
    loc: { source: "claude_code", env: "win", session_id: "sess_a" },
    title: "会话标题",
    agent: "Claude",
    model: "claude-sonnet-4",
    cwd: "/path/to/proj",
    calls: 5,
    tokens: 1200,
    opened_at: 0,
};

const VIEW = { show_time: true, compact: false };

const PANE_PROPS = {
    column: column(),
    slot_meta: META,
    outline_open: false,
    view: VIEW,
    is_selected: () => false,
    on_close: () => undefined,
    on_toggle: () => undefined,
    on_hover: () => undefined,
    on_load_older: () => undefined,
    on_toggle_outline: () => undefined,
};

function sess(id: string, source: string): TokenStatsSession {
    return {
        id,
        source: source as TokenStatsSession["source"],
        env: "local",
        model: "model",
        title: `会话 ${id}`,
        directory: null,
        input_tokens: 100,
        output_tokens: 200,
        cache_read_tokens: 50,
        cache_write_tokens: 25,
        calls: 3,
        started_at: 1000,
        ended_at: 2000,
    };
}

/** 从渲染元素的 className 解析字号（像素值）：text-[NNpx] 任意值或 rail 语义字号 token。 */
function font_px(class_name: string): number {
    const arbitrary = /text-\[(\d+(?:\.\d+)?)px\]/.exec(class_name);
    if (arbitrary) return Number(arbitrary[1]);
    const semantic: Record<string, number> = {
        "text-body-sm": 12.5,
        "text-label-md": 11.5,
    };
    for (const [cls, px] of Object.entries(semantic)) {
        if (class_name.includes(cls)) return px;
    }
    throw new Error(`未找到字号类: ${class_name}`);
}

describe("会话字号层级断言（渲染输出，t265/t273 改造）", () => {
    beforeEach(() => {
        install_history_usageboard();
    });

    it("会话面板标题字号小于元信息字号（title 11px < meta 13px，t257 互换）", () => {
        render(<SessionPane {...PANE_PROPS} />);
        const title = require_el(".conversation-title");
        const meta = require_el(".conversation-meta");
        const title_px = font_px(title.className);
        const meta_px = font_px(meta.className);
        expect(title_px).toBe(11);
        expect(meta_px).toBe(13);
        expect(title_px).toBeLessThan(meta_px);
    });

    it("会话 rail 标题使用 body-sm（12.5px）、元信息使用 label-md（11.5px）", () => {
        let slots = empty_slots();
        slots = try_assign_slot(slots, 0, session_meta(sess("s0", "claude_code"), 1)).next;
        render(
            <SessionRail
                slots={slots}
                collapsed={false}
                on_pick={() => undefined}
                on_close={() => undefined}
                on_move={() => undefined}
            />,
        );
        const title = require_el(".session-slot-title");
        const meta = require_el(".session-slot-meta");
        const title_px = font_px(title.className);
        const meta_px = font_px(meta.className);
        expect(title_px).toBe(12.5);
        expect(meta_px).toBe(11.5);
        expect(title_px).toBeGreaterThan(meta_px);
    });

    it("语义字号 token 映射与导出产物一致（--text-body-sm 12.5px / --text-label-md 11.5px）", () => {
        // globals.css @theme 导出区由 designmd 从 DESIGN.md 生成；token 值是稳定接口。
        const css = readFileSync(join(process.cwd(), "src/renderer/styles/globals.css"), "utf8");
        expect(css).toMatch(/--text-body-sm:\s*12\.5px/);
        expect(css).toMatch(/--text-label-md:\s*11\.5px/);
    });
});
