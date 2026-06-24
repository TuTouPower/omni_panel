import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "../fixtures/test";
import type { Page } from "@playwright/test";

async function get_config_api_keys(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const usageboard = (window as unknown as Record<string, unknown>)["usageboard"] as
            | Record<string, unknown>
            | undefined;
        const config = usageboard?.["config"] as Record<string, unknown> | undefined;
        return config ? Object.keys(config).sort() : [];
    });
}

test.describe("preload route API restriction", () => {
    test("popup window exposes config save for persisted UI preferences", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForLoadState("domcontentloaded");

        const keys = await get_config_api_keys(page);

        expect(keys).toContain("get");
        expect(keys).toContain("save");
    });
});

test.describe("popup config persistence", () => {
    test.use({
        omniOptions: {
            setupPlugins: (user_data_dir: string) => {
                writeFileSync(
                    join(user_data_dir, "config.json"),
                    JSON.stringify(
                        {
                            schemaVersion: 1,
                            language: "zh-Hans",
                            plugins: [],
                            launchAtLogin: false,
                        },
                        null,
                        2,
                    ),
                    "utf8",
                );
            },
        },
    });

    test("popup config save persists accountOrders", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        await page.waitForLoadState("domcontentloaded");

        await page.evaluate(async () => {
            const root = window as unknown as {
                usageboard: {
                    config: {
                        get(): Promise<{ config: Record<string, unknown> }>;
                        save(config: Record<string, unknown>): Promise<void>;
                    };
                };
            };
            const result = await root.usageboard.config.get();
            await root.usageboard.config.save({
                ...result.config,
                accountOrders: { claude: ["second", "first"] },
            });
        });

        await expect
            .poll(() => {
                const raw = readFileSync(join(omni.userDataDir, "config.json"), "utf8");
                const config = JSON.parse(raw) as Record<string, unknown>;
                return config["accountOrders"];
            })
            .toEqual({ claude: ["second", "first"] });
    });
});
