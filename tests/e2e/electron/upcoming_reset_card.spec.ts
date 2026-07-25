import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createTestWithSetup } from "../fixtures/test_with_setup";
import { PopupPage } from "../pages/popup_page";

const cpa_instance_id = "upcoming-reset-card";
const upcoming_reset_card_id = "__upcoming_reset__";

const { test, expect } = createTestWithSetup({
    setupPlugins: (user_data_dir: string) => {
        const reset_at = Date.now() + 3 * 24 * 60 * 60 * 1000;
        mkdirSync(user_data_dir, { recursive: true });
        writeFileSync(
            join(user_data_dir, "config.json"),
            JSON.stringify({
                schemaVersion: 1,
                language: "zh-Hans",
                launchAtLogin: false,
                upcomingResetThresholdPercent: 100,
                providerOrder: ["claude", upcoming_reset_card_id],
                plugins: [
                    {
                        instanceId: cpa_instance_id,
                        stateId: cpa_instance_id,
                        name: "CPA",
                        enabled: true,
                        executablePath: join(process.cwd(), "connectors", "cpa"),
                        refreshIntervalSeconds: 0,
                        parameterValues: { monitor_claude: "true" },
                        endpointOverrides: {},
                    },
                ],
                accountOverrides: {
                    upcomingResetWatched: {
                        claude: {
                            [`${cpa_instance_id}|label|Account A`]: ["five_hour"],
                        },
                    },
                },
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
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: reset_at,
                            cycleDurationMs: 7 * 24 * 60 * 60 * 1000,
                            stale: false,
                            status: "normal",
                        },
                    ],
                },
            ]),
        );
    },
});

test("upcoming reset card is reordered, expanded, and restored after restart", async ({ omni }) => {
    const page1 = await omni.app.firstWindow();
    const popup1 = new PopupPage(page1);
    await popup1.waitReady();

    const live1 = popup1.root();
    const reset_card = live1.locator(`[data-card-id="${upcoming_reset_card_id}"]`);
    const grid_card_ids = () =>
        live1
            .locator(".overview-grid > [data-card-id]")
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card-id")));

    await expect(reset_card).toHaveAttribute("draggable", "true");
    await expect(reset_card).toBeVisible();

    // Seeded providerOrder puts claude first, so the reset card starts second.
    await expect
        .poll(async () => (await grid_card_ids()).slice(0, 2))
        .toEqual(["claude", upcoming_reset_card_id]);

    // Playwright's mouse APIs do not drive HTML5 drag-and-drop inside Electron,
    // so dispatch the native DragEvent sequence React listens for. Each event is
    // a separate evaluate call: `dragstart` sets drag state via setState, and
    // `dragover` only reorders once that state has been committed by React.
    const dispatch_drag = async (
        card_id: string,
        type: "dragstart" | "dragenter" | "dragover" | "dragend",
    ) => {
        await page1.evaluate(
            ({ card_id: id, type: event_type }) => {
                const root = document.querySelector('[data-popup="live"]');
                if (!root) throw new Error("live popup root missing");
                const card = root.querySelector(`.overview-grid > [data-card-id="${id}"]`);
                if (!card) throw new Error(`card ${id} missing`);
                const box = card.getBoundingClientRect();
                card.dispatchEvent(
                    new DragEvent(event_type, {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: new DataTransfer(),
                        // Left quarter of the target: past the midpoint guard for
                        // a backwards move, so the dragged card lands before it.
                        clientX: box.left + box.width / 4,
                        clientY: box.top + box.height / 2,
                    }),
                );
            },
            { card_id, type },
        );
    };

    // Persisted state is read through config:get (not by reading config.json
    // directly) and polled at a slow interval: a tight read loop keeps a file
    // handle open that races the app's atomic
    // `rename(config.json.tmp -> config.json)` and makes it fail with EPERM on
    // Windows, dropping the very save under test.
    const persisted_config = () =>
        page1.evaluate(async () => {
            const result = await window.usageboard.config.get();
            return {
                providerOrder: result.config.providerOrder,
                expandedProviders: result.config.expandedProviders,
            };
        });
    const slow_poll = { intervals: [500, 1000, 1000, 1000, 1000], timeout: 15_000 };

    await dispatch_drag(upcoming_reset_card_id, "dragstart");
    await dispatch_drag("claude", "dragenter");
    await dispatch_drag("claude", "dragover");

    // The card physically moves in the grid, not just in persisted config.
    await expect
        .poll(async () => (await grid_card_ids()).slice(0, 2))
        .toEqual([upcoming_reset_card_id, "claude"]);
    await dispatch_drag(upcoming_reset_card_id, "dragend");

    await live1.getByLabel("展开即将重置").click();
    const reset_row = live1.getByRole("button", { name: /切换到 claude/i });
    await expect(reset_row).toBeVisible();
    await reset_row.click();
    await expect(live1.locator('[data-tab="claude"]')).toHaveClass(/active/);

    // Both writes must reach disk before the app is torn down, otherwise the
    // restart assertions below would race the renderer's async save queue.
    await expect
        .poll(async () => (await persisted_config()).providerOrder?.slice(0, 2), slow_poll)
        .toEqual([upcoming_reset_card_id, "claude"]);
    await expect
        .poll(
            async () => (await persisted_config()).expandedProviders?.[upcoming_reset_card_id],
            slow_poll,
        )
        .toBe(true);

    await omni.stop();
    await omni.start();

    const page2 = await omni.app.firstWindow();
    const popup2 = new PopupPage(page2);
    await popup2.waitReady();
    const live2 = popup2.root();

    // The row click above left the app on the claude tab, which replaces the
    // overview grid; go back to 总览 to assert the restored card order.
    await live2.locator('[data-tab="overview"]').click();
    await expect
        .poll(async () =>
            (
                await live2
                    .locator(".overview-grid > [data-card-id]")
                    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card-id")))
            ).slice(0, 2),
        )
        .toEqual([upcoming_reset_card_id, "claude"]);
    await expect(live2.getByLabel("折叠即将重置")).toBeVisible();
});
