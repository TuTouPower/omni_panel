import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("provider-account-list spacing (T6)", () => {
    it("defines .provider-account-list with 12px gap (t215: 对齐 overview-grid，旧 8px 作废)", () => {
        const css = readFileSync(join(process.cwd(), "src/renderer/styles/globals.css"), "utf8");
        expect(css).toMatch(/\.provider-account-list\s*\{[^}]*gap:\s*12px/s);
    });
});
