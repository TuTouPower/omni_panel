import { describe, it, expect } from "vitest";
import { parseArgs, requireParam } from "../../../src/plugins/sdk/define-plugin";

describe("parseArgs", () => {
    it("parses --usageboard-param KEY=VALUE", () => {
        const result = parseArgs(["--usageboard-param", "API_KEY=abc123"]);
        expect(result).toEqual({ API_KEY: "abc123" });
    });

    it("parses multiple params", () => {
        const result = parseArgs(["--usageboard-param", "A=1", "--usageboard-param", "B=2"]);
        expect(result).toEqual({ A: "1", B: "2" });
    });

    it("handles value with equals sign", () => {
        const result = parseArgs(["--usageboard-param", "KEY=val=ue"]);
        expect(result).toEqual({ KEY: "val=ue" });
    });

    it("returns empty object for no args", () => {
        expect(parseArgs([])).toEqual({});
    });
});

describe("requireParam", () => {
    it("returns value when present", () => {
        expect(requireParam({ KEY: "val" }, "KEY")).toBe("val");
    });

    it("throws for missing param", () => {
        expect(() => requireParam({}, "KEY")).toThrow("MISSING_PARAM:KEY");
    });

    it("throws for empty string param", () => {
        expect(() => requireParam({ KEY: "" }, "KEY")).toThrow("MISSING_PARAM:KEY");
    });
});
