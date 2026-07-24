import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";

import { createTestWithSetup } from "../fixtures/test_with_setup";
import { SettingsPage } from "../pages/settings_page";

const cpa_instance_id = "cpa-label-map-watch";
const account_a_key = "cpa-label-map-watch|label|Account A";
const account_b_key = "cpa-label-map-watch|label|Account B";

const { test } = createTestWithSetup({
    setupPlugins: (user_data_dir: string) => {
        mkdirSync(user_data_dir, { recursive: true });
        writeFileSync(
            join(user_data_dir, "config.json"),
            JSON.stringify({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                plugins: [
                    {
                        instanceId: cpa_instance_id,
                        stateId: cpa_instance_id,
                        name: "CPA",
                        enabled: true,
                        executablePath: join(process.cwd(), "connectors", "cpa"),
                        refreshIntervalSeconds: 0,
                        parameterValues: {
                            monitor_claude: "true",
                        },
                        endpointOverrides: {},
                    },
                ],
            }),
        );
        writeFileSync(
            join(user_data_dir, "snapshot-cache.json"),
            JSON.stringify([
                {
                    instanceId: cpa_instance_id,
                    status: "ready",
                    updatedAt: "2026-07-25T00:00:00.000Z",
                    items: [
                        {
                            id: "claude-account-a",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: cpa_instance_id,
                            accountId: "account-a",
                            accountLabel: "Account A",
                            raw_label: "five_hour",
                            normalized_label: "5 小时",
                        },
                        {
                            id: "claude-account-b",
                            provider: "claude",
                            source: "gateway",
                            sourceInstanceId: cpa_instance_id,
                            accountId: "account-b",
                            accountLabel: "Account B",
                            raw_label: "five_hour",
                            normalized_label: "5 小时",
                        },
                    ],
                },
            ]),
        );
    },
});

test("CPA label-map bell toggles every account for one raw label", async ({ omni }) => {
    const popup_page = await omni.app.firstWindow();
    const settings = await SettingsPage.openViaIpc(omni.app, popup_page);
    const settings_page = settings.page;

    await settings_page.getByTestId("settings-plugin-nav-accounts").click();
    const cpa_card = settings_page.locator(".acc-card").filter({ hasText: "CPA" }).first();
    await expect(cpa_card).toBeVisible();
    await cpa_card.getByTitle("编辑（连接设置）").click();
    await settings_page.getByTitle("编辑数据标签映射").first().click();

    const bell = settings_page.getByRole("button", {
        name: "监控该数据标签的即将重置",
    });
    await expect(bell).toHaveAttribute("aria-pressed", "false");
    await bell.click();
    await expect(bell).toHaveAttribute("aria-pressed", "true");

    await expect
        .poll(() => {
            const config = JSON.parse(
                readFileSync(join(omni.userDataDir, "config.json"), "utf8"),
            ) as {
                accountOverrides?: {
                    upcomingResetWatched?: Record<string, Record<string, string[]>>;
                };
            };
            return config.accountOverrides?.upcomingResetWatched?.["claude"];
        })
        .toEqual({
            [account_a_key]: ["five_hour"],
            [account_b_key]: ["five_hour"],
        });

    await bell.click();
    await expect(bell).toHaveAttribute("aria-pressed", "false");
    await expect
        .poll(() => {
            const config = JSON.parse(
                readFileSync(join(omni.userDataDir, "config.json"), "utf8"),
            ) as {
                accountOverrides?: unknown;
            };
            return config.accountOverrides;
        })
        .toEqual({});
});
