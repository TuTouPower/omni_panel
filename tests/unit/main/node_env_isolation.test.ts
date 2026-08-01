import { describe, expect, it } from "vitest";

// t177 AC1 验证：node 环境不注入 window.usageboard mock / #root DOM
describe("node env isolation (t177)", () => {
    it("does not inject window usageboard mock in node project", () => {
        expect(typeof window).toBe("undefined");
    });
});
