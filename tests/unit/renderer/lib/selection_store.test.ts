import { beforeEach, describe, expect, it } from "vitest";
import {
    reset_selection_store,
    selection_store,
    type SelectedItem,
} from "../../../../src/renderer/lib/workspace/selection-store";

/**
 * t226 摘选选择 store 测试。
 * 覆盖：toggle/查询/按会话清除/全清/替换会话集合/订阅通知/跨会话分组有序。
 */

const LOC_A = { source: "claude_code", env: "win", session_id: "a" };
const LOC_B = { source: "opencode", env: "win", session_id: "b" };

function msg(id: string, role: "user" | "assistant", text: string, timestamp: number) {
    return { id, role, text, timestamp };
}

function item(
    loc: typeof LOC_A,
    m: ReturnType<typeof msg>,
    role_index: number,
    title = "会话",
): SelectedItem {
    return {
        key: `${loc.source}|${loc.env}|${loc.session_id}|${m.id}`,
        loc,
        message: m,
        role_index,
        session_title: title,
    };
}

beforeEach(() => {
    reset_selection_store();
});

describe("selection_store (t226)", () => {
    it("toggle 加入/移除，has/count 反映", () => {
        const it = item(LOC_A, msg("m1", "user", "hi", 1), 1);
        selection_store.toggle(it);
        expect(selection_store.count()).toBe(1);
        expect(selection_store.has(LOC_A, "m1")).toBe(true);
        selection_store.toggle(it);
        expect(selection_store.count()).toBe(0);
        expect(selection_store.has(LOC_A, "m1")).toBe(false);
    });

    it("all() 按添加顺序返回，跨会话有序", () => {
        const i1 = item(LOC_A, msg("m1", "user", "a", 1), 1);
        const i2 = item(LOC_B, msg("m2", "assistant", "b", 2), 1);
        const i3 = item(LOC_A, msg("m3", "user", "c", 3), 2);
        selection_store.toggle(i1);
        selection_store.toggle(i2);
        selection_store.toggle(i3);
        expect(selection_store.all().map((x) => x.key)).toEqual([i1.key, i2.key, i3.key]);
    });

    it("clear_session 只清指定会话", () => {
        selection_store.toggle(item(LOC_A, msg("m1", "user", "a", 1), 1));
        selection_store.toggle(item(LOC_B, msg("m2", "assistant", "b", 2), 1));
        selection_store.clear_session(LOC_A);
        expect(selection_store.count()).toBe(1);
        expect(selection_store.has(LOC_B, "m2")).toBe(true);
    });

    it("clear_all 清空全部", () => {
        selection_store.toggle(item(LOC_A, msg("m1", "user", "a", 1), 1));
        selection_store.toggle(item(LOC_B, msg("m2", "assistant", "b", 2), 1));
        selection_store.clear_all();
        expect(selection_store.count()).toBe(0);
    });

    it("set_session 替换某会话全部已选（Shift 连选语义）", () => {
        selection_store.toggle(item(LOC_A, msg("m1", "user", "a", 1), 1));
        const replacement = [
            item(LOC_A, msg("m1", "user", "a", 1), 1),
            item(LOC_A, msg("m2", "user", "b", 2), 2),
        ];
        selection_store.set_session(LOC_A, replacement);
        expect(selection_store.count()).toBe(2);
        expect(selection_store.has(LOC_A, "m2")).toBe(true);
    });

    it("subscribe 通知变更，unsubscribe 停止", () => {
        let notified = 0;
        const unsub = selection_store.subscribe(() => {
            notified += 1;
        });
        selection_store.toggle(item(LOC_A, msg("m1", "user", "a", 1), 1));
        expect(notified).toBe(1);
        unsub();
        selection_store.toggle(item(LOC_A, msg("m1", "user", "a", 1), 1));
        expect(notified).toBe(1);
    });
});
