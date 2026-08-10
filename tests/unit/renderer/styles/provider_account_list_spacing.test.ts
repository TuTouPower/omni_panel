import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("provider-account-list spacing (T6)", () => {
    it("grid gap 12px + 420px 卡宽下限（t215：对齐 overview-grid，旧 8px 作废）", () => {
        // t274: 规则迁到组件 utility（gap-3 = 12px，grid-template 同 overview-grid）。
        const src = readFileSync(
            join(process.cwd(), "src/renderer/components/ProviderAccountList.tsx"),
            "utf8",
        );
        expect(src).toContain("gap-3");
        expect(src).toContain("grid items-stretch gap-3");
        expect(src).toMatch(/minmax\(420px,\s*1fr\)/);
    });
});
