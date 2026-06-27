import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestWithSetup } from "../fixtures/test_with_setup";
import { PopupPage } from "../pages/popup_page";

function seed_opencode_go_connector(
    connector_root: string,
    name: string,
    account_label: string,
    rolling_used: number,
): void {
    const plugin_dir = join(connector_root, name);
    mkdirSync(plugin_dir, { recursive: true });
    writeFileSync(
        join(plugin_dir, "manifest.json"),
        JSON.stringify(
            {
                id: name,
                provider: "opencode_go",
                capabilities: ["local"],
                parameters: [],
                local: { paths: ["~/.fake"] },
                script: "connector.ts",
            },
            null,
            4,
        ),
    );

    const observations = [
        {
            raw_label: "rolling",
            normalized_label: "滚动",
            window: "second",
            used: rolling_used,
        },
        { raw_label: "weekly", normalized_label: "一周", window: "day", used: 34 },
        { raw_label: "monthly", normalized_label: "一月", window: "month", used: 56 },
    ].map((item) => ({
        provider: "opencode_go",
        source_instance_id: name,
        account_id: name,
        account_label,
        metric_id: `opencode_go:${item.raw_label}`,
        raw_label: item.raw_label,
        normalized_label: item.normalized_label,
        window: item.window,
        used: item.used,
        limit: 100,
        display_style: "percent",
        reset_at: null,
        status: "normal",
        observed_at: 0,
        source: "local",
        stale: false,
        last_error: null,
    }));

    writeFileSync(
        join(plugin_dir, "connector.ts"),
        `async function main() { return ${JSON.stringify(observations)}.map((item) => ({ ...item, observed_at: Date.now() })); }\n`,
    );
}

const { test, expect } = createTestWithSetup({
    setupPlugins: (userDataDir: string) => {
        const connector_root = join(userDataDir, "connectors");
        seed_opencode_go_connector(connector_root, "opencode-go-a", "OpenCode A", 12);
        seed_opencode_go_connector(connector_root, "opencode-go-b", "OpenCode B", 78);
    },
});

test.describe("OpenCode Go usage", () => {
    test("renders rolling weekly monthly usage for multiple OpenCode Go accounts", async ({
        omni,
    }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const live = popup.root();
        await live
            .getByRole("button", { name: "OpenCode Go", exact: true })
            .click({ timeout: 15_000 });

        await expect(live.getByText("OpenCode A")).toBeVisible({ timeout: 10_000 });
        await expect(live.getByText("OpenCode B")).toBeVisible();
        await expect(live.getByText("滚动").first()).toBeVisible();
        await expect(live.getByText("一周").first()).toBeVisible();
        await expect(live.getByText("一月").first()).toBeVisible();
    });
});
