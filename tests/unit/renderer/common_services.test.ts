import { describe, expect, it } from "vitest";
import { ADD_COMMON_SERVICES } from "../../../src/renderer/lib/common-services";

describe("add-account common services", () => {
    it("includes every provider that can be added from settings", () => {
        expect(ADD_COMMON_SERVICES.map((s) => s.id)).toEqual([
            "claude",
            "codex",
            "antigravity",
            "glm",
            "kimi",
            "deepseek",
            "minimax",
            "tavily",
            "firecrawl",
            "mimo",
            "opencode_go",
        ]);
    });

    it("shows the correct labels for MiniMax and Firecrawl", () => {
        expect(ADD_COMMON_SERVICES).toContainEqual({ id: "minimax", label: "MiniMax" });
        expect(ADD_COMMON_SERVICES).toContainEqual({ id: "firecrawl", label: "Firecrawl" });
    });
});
