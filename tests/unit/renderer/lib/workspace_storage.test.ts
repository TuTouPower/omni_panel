import { beforeEach, describe, expect, it } from "vitest";
import {
    clear_saved_workspace,
    load_saved_layout,
    load_saved_slots,
    save_layout,
    save_slots,
} from "../../../../src/renderer/lib/workspace/workspace-storage";

/**
 * P6 工作台下线：残留持久化孤儿键清理。
 */

beforeEach(() => {
    localStorage.clear();
});

describe("clear_saved_workspace", () => {
    it("移除槽位与布局残留键，读取回退默认值", () => {
        save_slots([{ source: "claude_code", env: "win", session_id: "a" }]);
        save_layout(3, { show_time: false, compact: false });
        expect(localStorage.getItem("workspace-slots")).not.toBeNull();
        expect(localStorage.getItem("workspace-layout")).not.toBeNull();

        clear_saved_workspace();

        expect(localStorage.getItem("workspace-slots")).toBeNull();
        expect(localStorage.getItem("workspace-layout")).toBeNull();
        expect(load_saved_layout()).toBeNull();
        expect(load_saved_slots().every((s) => s === null)).toBe(true);
    });

    it("空存储上幂等不抛", () => {
        expect(() => {
            clear_saved_workspace();
        }).not.toThrow();
    });
});
