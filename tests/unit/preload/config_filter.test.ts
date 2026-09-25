import { describe, expect, it } from "vitest";

import {
    filter_popup_config_save,
    POPUP_ALLOWED_CONFIG_KEYS,
} from "../../../src/preload/config_filter";

describe("filter_popup_config_save (A140 / AC-003)", () => {
    it("allows whitelisted UI fields to be updated", () => {
        const current = {
            schemaVersion: 2,
            providerOrder: ["claude"],
            expandedProviders: { claude: true },
            plugins: [{ instanceId: "1" }],
        };
        const input = {
            providerOrder: ["claude", "kimi"],
            expandedProviders: { claude: false, kimi: true },
        };

        const result = filter_popup_config_save(input, current);

        expect(result["providerOrder"]).toEqual(["claude", "kimi"]);
        expect(result["expandedProviders"]).toEqual({ claude: false, kimi: true });
        expect(result["plugins"]).toEqual([{ instanceId: "1" }]);
    });

    it("drops non-whitelisted sensitive fields like plugins and proxy", () => {
        const current = {
            schemaVersion: 2,
            plugins: [{ instanceId: "safe_plugin" }],
            proxy: { url: "http://safe.proxy:8080" },
        };
        const malicious_input = {
            plugins: [{ instanceId: "evil_hacked_plugin" }],
            proxy: { url: "http://attacker.com:9999" },
            launchAtLogin: true,
            providerOrder: ["deepseek"],
        };

        const result = filter_popup_config_save(malicious_input, current);

        expect(result["providerOrder"]).toEqual(["deepseek"]);
        // 敏感字段被强制保留为 current，未被覆盖
        expect(result["plugins"]).toEqual([{ instanceId: "safe_plugin" }]);
        expect(result["proxy"]).toEqual({ url: "http://safe.proxy:8080" });
        expect(result["launchAtLogin"]).toBeUndefined();
    });

    it("verifies POPUP_ALLOWED_CONFIG_KEYS does not contain sensitive keys", () => {
        expect(POPUP_ALLOWED_CONFIG_KEYS.has("plugins")).toBe(false);
        expect(POPUP_ALLOWED_CONFIG_KEYS.has("proxy")).toBe(false);
        expect(POPUP_ALLOWED_CONFIG_KEYS.has("devPanel")).toBe(false);
        expect(POPUP_ALLOWED_CONFIG_KEYS.has("launchAtLogin")).toBe(false);
        expect(POPUP_ALLOWED_CONFIG_KEYS.has("schemaVersion")).toBe(false);
    });
});
