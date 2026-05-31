import { describe, it, expect } from "vitest";
import { discoverPlugins } from "../../../src/main/core/plugin/discovery";
import { resolve } from "node:path";

const bundledDir = resolve(process.cwd(), "resources/plugins");

describe("bundled plugin metadata verification", () => {
    it("discovers exactly 7 plugins", async () => {
        const defs = await discoverPlugins(bundledDir);
        expect(defs.length).toBe(7);
    });

    const expected = [
        { scriptName: "deepseek-usage-plugin.ts", name: "DeepSeek", secretParams: ["API_KEY"] },
        { scriptName: "tavily-usage-plugin.ts", name: "Tavily", secretParams: ["API_KEY"] },
        { scriptName: "glm-usage-plugin.ts", name: "智谱", secretParams: ["API_KEY"] },
        { scriptName: "minimax-usage-plugin.ts", name: "MiniMax", secretParams: ["API_KEY"] },
        { scriptName: "codex-usage-plugin.ts", name: "Codex", secretParams: [] },
        { scriptName: "claude-usage-plugin.ts", name: "Claude", secretParams: [] },
        { scriptName: "cpa-usage-plugin.ts", name: "CPA", secretParams: ["cpa_mgmt_key"] },
    ];

    const expectedProvidersByPlugin: Record<string, string[]> = {
        "claude-usage-plugin.ts": ["claude"],
        "codex-usage-plugin.ts": ["codex"],
        "cpa-usage-plugin.ts": ["claude", "codex", "gemini", "antigravity", "kimi"],
        "deepseek-usage-plugin.ts": ["deepseek"],
        "glm-usage-plugin.ts": ["glm"],
        "minimax-usage-plugin.ts": ["minimax"],
        "tavily-usage-plugin.ts": ["tavily"],
    };

    const expectedSourceByPlugin: Record<string, string> = {
        "claude-usage-plugin.ts": "local",
        "codex-usage-plugin.ts": "oauth",
        "cpa-usage-plugin.ts": "cpa",
        "deepseek-usage-plugin.ts": "api_key",
        "glm-usage-plugin.ts": "api_key",
        "minimax-usage-plugin.ts": "api_key",
        "tavily-usage-plugin.ts": "api_key",
    };

    for (const exp of expected) {
        it(`${exp.scriptName}: name="${exp.name}", secrets=${JSON.stringify(exp.secretParams)}`, async () => {
            const defs = await discoverPlugins(bundledDir);
            const def = defs.find((d) => d.scriptName === exp.scriptName);
            expect(def).toBeDefined();
            if (!def) return;
            expect(def.metadata?.name).toBe(exp.name);
            expect(def.metadata?.supportedProviders).toEqual(
                expectedProvidersByPlugin[exp.scriptName],
            );
            expect(def.metadata?.defaultSource).toBe(expectedSourceByPlugin[exp.scriptName]);
            const secrets =
                def.metadata?.parameters?.filter((p) => p.type === "secret").map((p) => p.name) ??
                [];
            expect(secrets).toEqual(exp.secretParams);
        });
    }
});
