import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/test_web";
import { SettingsPage } from "../pages/settings_page";

interface WebConfigPayload {
    config: {
        theme?: "light" | "dark" | "system";
        plugins: { displayName?: string }[];
    };
}

/**
 * Web e2e：settings 视图、配置导入导出、实例管理与跨页面 SSE。
 * case 5（accounts config forms，依赖 account-row DOM）+ case 6（用量标签映射字段）
 * 仍留在 electron/settings_view.spec.ts。
 */
test.describe("settings view (web)", () => {
    test("shows sidebar navigation", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        await expect(settings.page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });

    test("shows plugin navigation items", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sidebar = settings.page.locator('[data-testid="settings-sidebar"]');
        await expect(sidebar).toBeVisible();
    });

    test("changes usage bar color scheme from appearance settings", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-appearance"]').click();

        await expect(sPage.getByText("用量条颜色方案")).toBeVisible();
        await expect(sPage.getByRole("button", { name: /风险色：仅当前用量/ })).toBeVisible();
        await expect(sPage.getByRole("button", { name: /风险色：带投影预测/ })).toBeVisible();
        await expect(sPage.getByRole("button", { name: /彩色区分：九色循环/ })).toBeVisible();

        await sPage.getByRole("button", { name: /彩色区分：九色循环/ }).click();
        await expect(sPage.getByRole("button", { name: /彩色区分：九色循环/ })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    test("shows usage bar style buttons above color scheme", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-appearance"]').click();
        const styleLabel = sPage.getByText("用量条样式");
        const colorLabel = sPage.getByText("用量条颜色方案");
        await expect(styleLabel).toBeVisible();
        await expect(colorLabel).toBeVisible();
        const styleBox = await styleLabel.boundingBox();
        const colorBox = await colorLabel.boundingBox();
        expect(styleBox?.y ?? 0).toBeLessThan(colorBox?.y ?? 0);

        const styleField = sPage.getByLabel("用量条样式");
        await expect(styleField.getByRole("button", { name: "细线型" })).toBeVisible();
        await expect(styleField.getByRole("button", { name: "粗胶囊型" })).toBeVisible();
        await styleField.getByRole("button", { name: "粗胶囊型" }).click();
        await expect(styleField.getByRole("button", { name: "粗胶囊型" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    test("web export requires an explicit plaintext-secret opt-in", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;

        await sPage.locator('[data-testid="settings-plugin-nav-data"]').click();
        const include_secrets = sPage.getByRole("checkbox", { name: "包含明文密钥" });
        await expect(include_secrets).toBeVisible();
        await expect(include_secrets).not.toBeChecked();
        await expect(sPage.getByText("文件含明文密钥，请妥善保管")).toHaveCount(0);

        await include_secrets.check();
        await expect(include_secrets).toBeChecked();
        await expect(sPage.getByText("文件含明文密钥，请妥善保管")).toBeVisible();
    });

    test("web export downloads the selected redacted or plaintext payload", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;

        await sPage.route("**/v1/config/export**", async (route) => {
            const url = new URL(route.request().url());
            const include_secrets = url.searchParams.get("includeSecrets") === "true";
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(
                    include_secrets
                        ? {
                              schemaVersion: 1,
                              plugins: [{ parameterValues: { API_KEY: "sk-web" } }],
                          }
                        : { schemaVersion: 1, plugins: [{ parameterValues: {} }] },
                ),
            });
        });
        await sPage.locator('[data-testid="settings-plugin-nav-data"]').click();
        const export_row = sPage.locator('[data-testid="set-row"]').filter({ hasText: "导出设置" });
        const export_button = export_row.getByRole("button");
        const include_secrets = sPage.getByRole("checkbox", { name: "包含明文密钥" });

        const redacted_download = await Promise.all([
            sPage.waitForEvent("download"),
            export_button.click(),
        ]).then(([download]) => download);
        const redacted_path = await redacted_download.path();
        expect(redacted_path).not.toBeNull();
        if (!redacted_path) throw new Error("redacted export did not produce a file");
        expect(readFileSync(redacted_path, "utf8")).not.toContain("sk-web");

        await include_secrets.check();
        const plaintext_download = await Promise.all([
            sPage.waitForEvent("download"),
            export_button.click(),
        ]).then(([download]) => download);
        const plaintext_path = await plaintext_download.path();
        expect(plaintext_path).not.toBeNull();
        if (!plaintext_path) throw new Error("plaintext export did not produce a file");
        expect(readFileSync(plaintext_path, "utf8")).toContain("sk-web");
    });

    test("web import shows readable errors and persists a valid config", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;
        await sPage.locator('[data-testid="settings-plugin-nav-data"]').click();
        const import_row = sPage.locator('[data-testid="set-row"]').filter({ hasText: "导入设置" });
        const import_button = import_row.getByRole("button");
        const before_response = await sPage.request.get("/v1/config");
        const before = (await before_response.json()) as WebConfigPayload;

        const choose_file = async (name: string, contents: string) => {
            sPage.once("dialog", (dialog) => {
                void dialog.accept();
            });
            const chooser = sPage.waitForEvent("filechooser");
            await import_button.click();
            await (
                await chooser
            ).setFiles({
                name,
                mimeType: "application/json",
                buffer: Buffer.from(contents),
            });
        };

        await choose_file("malformed.json", "{");
        await expect(import_button).toHaveText("失败");
        await expect(sPage.getByRole("alert")).toContainText("导入文件 JSON 无效");

        await choose_file(
            "schema-invalid.json",
            JSON.stringify({ schemaVersion: 1, launchAtLogin: "wrong" }),
        );
        await expect(import_button).toHaveText("失败");
        await expect(sPage.getByRole("alert")).toContainText("导入的配置格式无效");

        const valid_config = {
            ...before.config,
            theme: before.config.theme === "dark" ? "light" : "dark",
        };
        await choose_file("valid.json", JSON.stringify(valid_config));
        await expect
            .poll(async () => {
                const response = await sPage.request.get("/v1/config");
                const payload = (await response.json()) as WebConfigPayload;
                return payload.config.theme;
            })
            .toBe(valid_config.theme);
        await expect(sPage.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });

    test("web account settings duplicate and createInstance persist new accounts", async ({
        webPage,
    }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;
        await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
        await expect(sPage.locator('[data-testid="accounts-list"]')).toBeVisible();

        const deepseek_rows = sPage
            .locator('[data-testid="account-row"]')
            .filter({ hasText: "DeepSeek" });
        const rows_before = await deepseek_rows.count();
        const before_response = await sPage.request.get("/v1/config");
        const before = (await before_response.json()) as WebConfigPayload;
        const plugins_before = before.config.plugins.length;

        await deepseek_rows.first().getByRole("button", { name: "编辑" }).click();
        const duplicate_button = sPage.locator('[data-testid^="settings-duplicate-btn-"]');
        await expect(duplicate_button).toBeVisible();
        await duplicate_button.click();

        await expect
            .poll(async () => {
                const response = await sPage.request.get("/v1/config");
                const payload = (await response.json()) as WebConfigPayload;
                return payload.config.plugins.length;
            })
            .toBe(plugins_before + 1);
        await expect
            .poll(() =>
                sPage
                    .locator('[data-testid="account-row"]')
                    .filter({ hasText: "DeepSeek" })
                    .count(),
            )
            .toBe(rows_before + 1);

        await sPage.getByRole("button", { name: "添加", exact: true }).click();
        const add_dialog = sPage.getByRole("dialog", { name: "添加账号" });
        await expect(add_dialog).toBeVisible();
        await add_dialog.getByRole("button", { name: "DeepSeek", exact: true }).click();
        const deepseek_dialog = sPage.getByRole("dialog", { name: /添加 DeepSeek 账号/ });
        await deepseek_dialog.getByPlaceholder("例如：工作账号").fill("web-created-deepseek");
        await deepseek_dialog.getByRole("button", { name: "添加账号", exact: true }).click();

        await expect(
            sPage
                .locator('[data-testid="account-row"]')
                .filter({ hasText: "web-created-deepseek" }),
        ).toBeVisible();
        await expect
            .poll(async () => {
                const response = await sPage.request.get("/v1/config");
                const payload = (await response.json()) as WebConfigPayload;
                return payload.config.plugins.some(
                    (plugin: { displayName?: string }) =>
                        plugin.displayName === "web-created-deepseek",
                );
            })
            .toBe(true);
    });

    test("config SSE updates theme on a second real web page", async ({ webPage }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const page_b = await webPage.context().newPage();
        try {
            await page_b.goto("/#agent");
            await page_b.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
            await expect
                .poll(() =>
                    page_b.evaluate(() => document.documentElement.getAttribute("data-theme")),
                )
                .not.toBeNull();

            const settings = await SettingsPage.open_via_hash(webPage);
            const sPage = settings.page;
            await sPage.locator('[data-testid="settings-plugin-nav-appearance"]').click();
            const current_theme = await page_b.evaluate(() =>
                document.documentElement.getAttribute("data-theme"),
            );
            const next_theme = current_theme === "dark" ? "light" : "dark";
            await sPage
                .getByRole("button", { name: next_theme === "dark" ? "深色" : "浅色" })
                .click();

            await expect
                .poll(() =>
                    page_b.evaluate(() => document.documentElement.getAttribute("data-theme")),
                )
                .toBe(next_theme);
        } finally {
            await page_b.close();
        }
    });

    test("highlights current section with primary-container bg and accent text/icon", async ({
        webPage,
    }) => {
        await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
        const settings = await SettingsPage.open_via_hash(webPage);
        const sPage = settings.page;

        const general = sPage.locator('[data-testid="settings-plugin-nav-general"]');
        const accounts = sPage.locator('[data-testid="settings-plugin-nav-accounts"]');
        const appearance = sPage.locator('[data-testid="settings-plugin-nav-appearance"]');

        // Resolve token vars to the same rgb()/rgba() strings getComputedStyle
        // returns, so the assertions hold under whichever theme is active.
        const tokenColor = (name: string) =>
            sPage.evaluate((varName) => {
                const raw = getComputedStyle(document.documentElement)
                    .getPropertyValue(varName)
                    .trim();
                const probe = document.createElement("span");
                probe.style.color = raw;
                document.body.appendChild(probe);
                const resolved = getComputedStyle(probe).color;
                probe.remove();
                return resolved;
            }, name);

        const navStyle = (item: ReturnType<typeof sPage.locator>) =>
            item.evaluate((el) => {
                const cs = getComputedStyle(el);
                const icon = el.querySelector("svg");
                return {
                    bg: cs.backgroundColor,
                    color: cs.color,
                    iconColor: icon ? getComputedStyle(icon).color : "",
                };
            });

        const selected = {
            bg: await tokenColor("--color-primary-container"),
            color: await tokenColor("--accent"),
            iconColor: await tokenColor("--accent"),
        };
        const unselected = {
            bg: "rgba(0, 0, 0, 0)", // transparent — only the current section carries the container bg
            color: await tokenColor("--color-on-surface-variant"),
            iconColor: await tokenColor("--color-on-surface-muted"),
        };

        // Default section: General is the highlighted one.
        expect(await navStyle(general)).toEqual(selected);
        expect(await navStyle(accounts)).toEqual(unselected);

        // Switching sections moves the highlight onto Appearance.
        await appearance.click();
        expect(await navStyle(appearance)).toEqual(selected);
        expect(await navStyle(general)).toEqual(unselected);
    });
});
