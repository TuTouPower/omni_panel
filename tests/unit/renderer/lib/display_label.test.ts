import { describe, expect, it } from "vitest";
import { resolve_account_display_label } from "../../../../src/renderer/lib/display_label";

describe("resolve_account_display_label", () => {
    it("returns trimmed label when desensitize is off", () => {
        expect(resolve_account_display_label("  工作账号  ", false)).toBe("工作账号");
        expect(resolve_account_display_label(undefined, false)).toBe("");
        expect(resolve_account_display_label(null, false)).toBe("");
    });

    it("returns empty when desensitize is on", () => {
        expect(resolve_account_display_label("工作账号", true)).toBe("");
        expect(resolve_account_display_label("  x  ", true)).toBe("");
    });
});
