import { describe, expect, it } from "vitest";

// t177 AC2 验证：renderer 项目注入 jsdom + renderer-only setupFiles
describe("renderer env isolation (t177)", () => {
    it("injects window.usageboard mock and #root DOM from setup.ts", () => {
        expect(typeof window).toBe("object");
        expect(window.usageboard).toBeDefined();
        expect(document.getElementById("root")).not.toBeNull();
    });
});
