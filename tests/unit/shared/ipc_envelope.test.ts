import { describe, expect, it } from "vitest";
import { is_ipc_result } from "../../../src/shared/lib/ipc-envelope";

describe("is_ipc_result（t341 AC-003 形状）", () => {
    it("合法 ok 信封返回 true", () => {
        expect(is_ipc_result({ ok: true, data: { summaries: {} } })).toBe(true);
        expect(is_ipc_result({ ok: true })).toBe(true);
    });

    it("合法 error 信封返回 true", () => {
        expect(is_ipc_result({ ok: false, error: { code: "X", message: "boom" } })).toBe(true);
    });

    it("undefined / 非对象 / 缺 ok 返回 false", () => {
        expect(is_ipc_result(undefined)).toBe(false);
        expect(is_ipc_result(null)).toBe(false);
        expect(is_ipc_result("nope")).toBe(false);
        expect(is_ipc_result(42)).toBe(false);
        expect(is_ipc_result({ data: 1 })).toBe(false);
    });

    it("error 分支形状非法返回 false", () => {
        expect(is_ipc_result({ ok: false })).toBe(true); // 无 error 也判为信封（ok=false 兜底）
        expect(is_ipc_result({ ok: false, error: "string" })).toBe(false);
        expect(is_ipc_result({ ok: false, error: { code: 5, message: "x" } })).toBe(false);
        expect(is_ipc_result({ ok: false, error: { code: "X" } })).toBe(false);
    });
});
