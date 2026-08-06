import { describe, expect, it } from "vitest";
import type { TokenStatsSession } from "../../../../src/shared/types/token-stats";
import {
    MAX_SLOTS,
    clear_slots,
    empty_slots,
    effective_columns,
    find_slot_by_loc,
    move_slot,
    occupied_count,
    remove_slot,
    session_meta,
    slot_at,
    try_add_slot,
    try_assign_slot,
} from "../../../../src/renderer/lib/workspace/slots";

/**
 * t224 工作台槽位 store 纯函数测试。
 * 覆盖：8 槽初始化、指派/移除/换位/清空、超位拒绝、按 loc 查已打开、
 * 会话元数据派生（标题 fallback、tokens 四维和、agent 名）、布局档位降档。
 */

const LOC_A = { source: "claude_code", env: "win", session_id: "a" } as const;
const LOC_B = { source: "opencode", env: "win", session_id: "b" } as const;
const LOC_C = { source: "grok", env: "win", session_id: "c" } as const;

function sess(
    id: string,
    source: TokenStatsSession["source"],
    opts: Partial<TokenStatsSession> = {},
): TokenStatsSession {
    return {
        id,
        source,
        env: "win",
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
        ...opts,
    };
}

describe("slots 初始化与计数", () => {
    it("empty_slots 返回 8 个空槽", () => {
        const s = empty_slots();
        expect(s).toHaveLength(MAX_SLOTS);
        expect(occupied_count(s)).toBe(0);
    });

    it("occupied_count 统计占用槽位数", () => {
        const r1 = try_assign_slot(empty_slots(), 0, session_meta(sess("a", "claude_code"), 1));
        expect(occupied_count(r1.next)).toBe(1);
        const r2 = try_assign_slot(r1.next, 3, session_meta(sess("b", "opencode"), 2));
        expect(occupied_count(r2.next)).toBe(2);
    });
});

describe("slots 指派与超位", () => {
    it("空槽指派成功并存入会话", () => {
        const meta = session_meta(sess("a", "claude_code"), 100);
        const r = try_assign_slot(empty_slots(), 2, meta);
        expect(r.accepted).toBe(true);
        expect(slot_at(r.next, 2)).toEqual(meta);
    });

    it("已占用槽位指派被拒绝", () => {
        const s = try_assign_slot(empty_slots(), 0, session_meta(sess("a", "claude_code"), 1)).next;
        const r = try_assign_slot(s, 0, session_meta(sess("b", "opencode"), 2));
        expect(r.accepted).toBe(false);
        expect(slot_at(r.next, 0)).toEqual(slot_at(s, 0));
    });

    it("try_add_slot 装入第一个空槽", () => {
        const s = try_assign_slot(empty_slots(), 2, session_meta(sess("a", "claude_code"), 1)).next;
        const r = try_add_slot(s, session_meta(sess("b", "opencode"), 2));
        expect(r.accepted).toBe(true);
        expect(r.index).toBe(0);
        expect(slot_at(r.next, 0)?.loc.session_id).toBe("b");
    });

    it("8 槽全满后 try_add_slot 拒绝（超位）", () => {
        let s = empty_slots();
        for (let i = 0; i < MAX_SLOTS; i += 1) {
            const r = try_assign_slot(s, i, session_meta(sess(`s${String(i)}`, "claude_code"), i));
            s = r.next;
        }
        expect(occupied_count(s)).toBe(8);
        const r = try_add_slot(s, session_meta(sess("overflow", "grok"), 9));
        expect(r.accepted).toBe(false);
        expect(r.index).toBeNull();
    });

    it("remove_slot 清空指定槽位，其它槽不变", () => {
        const s1 = try_assign_slot(
            empty_slots(),
            1,
            session_meta(sess("a", "claude_code"), 1),
        ).next;
        const s2 = try_assign_slot(s1, 4, session_meta(sess("b", "opencode"), 2)).next;
        const s3 = remove_slot(s2, 1);
        expect(slot_at(s3, 1)).toBeNull();
        expect(slot_at(s3, 4)?.loc.session_id).toBe("b");
        expect(occupied_count(s3)).toBe(1);
    });

    it("clear_slots 清空全部", () => {
        let s = empty_slots();
        for (let i = 0; i < 3; i += 1) {
            s = try_assign_slot(s, i, session_meta(sess(`s${String(i)}`, "claude_code"), i)).next;
        }
        expect(occupied_count(clear_slots())).toBe(0);
    });
});

describe("slots 换位与查重", () => {
    it("move_slot 交换两个槽位内容（顺序同步网格）", () => {
        const a = session_meta(sess("a", "claude_code"), 1);
        const b = session_meta(sess("b", "opencode"), 2);
        const s = try_assign_slot(try_assign_slot(empty_slots(), 0, a).next, 1, b).next;
        const m = move_slot(s, 0, 1);
        expect(slot_at(m, 0)?.loc.session_id).toBe("b");
        expect(slot_at(m, 1)?.loc.session_id).toBe("a");
        expect(occupied_count(m)).toBe(2);
    });

    it("move_slot 允许目标空槽（等价移动到空位）", () => {
        const a = session_meta(sess("a", "claude_code"), 1);
        const s = try_assign_slot(empty_slots(), 0, a).next;
        const m = move_slot(s, 0, 5);
        expect(slot_at(m, 0)).toBeNull();
        expect(slot_at(m, 5)?.loc.session_id).toBe("a");
    });

    it("find_slot_by_loc 返回已打开会话所在槽位", () => {
        const a = session_meta(sess("a", "claude_code"), 1);
        const s = try_assign_slot(empty_slots(), 3, a).next;
        expect(find_slot_by_loc(s, LOC_A)).toBe(3);
        expect(find_slot_by_loc(s, LOC_B)).toBeNull();
        expect(find_slot_by_loc(s, LOC_C)).toBeNull();
    });
});

describe("session_meta 元数据派生", () => {
    it("tokens 为四维和，agent 为友好名", () => {
        const m = session_meta(sess("a", "claude_code"), 500);
        expect(m.tokens).toBe(375);
        expect(m.agent).toBe("Claude");
        expect(m.opened_at).toBe(500);
        expect(m.title).toBe("会话 a");
    });

    it("title 为 null 时回退 session_id", () => {
        const m = session_meta(sess("b", "opencode", { title: null }), 1);
        expect(m.title).toBe("b");
    });
});

describe("effective_columns 布局档位", () => {
    it("宽窗口下按选择档位封顶", () => {
        expect(effective_columns(1, 2000)).toBe(1);
        expect(effective_columns(4, 2000)).toBe(4);
        expect(effective_columns(8, 3000)).toBe(8);
        expect(effective_columns(2, 2000)).toBe(2);
    });

    it("宽度不足时降到能容纳的列数", () => {
        expect(effective_columns(4, 700)).toBe(1);
        expect(effective_columns(4, 1100)).toBe(2);
        expect(effective_columns(4, 1600)).toBe(4);
        expect(effective_columns(8, 1600)).toBe(4);
    });

    it("只依赖布局档位与容器宽度，与占用槽位数无关", () => {
        expect(effective_columns(6, 2000)).toBe(5);
        expect(effective_columns(6, 3000)).toBe(6);
    });
});
