import type { ElectronApplication, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "../fixtures/test";
import { PopupPage } from "../pages/popup_page";

async function openSettings(app: ElectronApplication, page: Page): Promise<Page> {
    await page.evaluate(() => {
        window.usageboard.settings.open();
    });
    const settingsWindow = await app.waitForEvent("window", { timeout: 10_000 });
    await settingsWindow.waitForLoadState("domcontentloaded");
    await settingsWindow.waitForSelector('[data-testid="settings-sidebar"]', { timeout: 10_000 });
    return settingsWindow;
}

async function openAccountForm(sPage: Page, name: string) {
    await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
    // Find the specific account row matching the name (e.g. "CPA · Claude"),
    // not just any group containing the text (which could match provider groups).
    const row = sPage.locator(".acc-row").filter({ hasText: name }).first();
    await expect(row).toBeVisible();
    // Determine CPA before clicking — the account list unmounts when the edit
    // view opens, so reading the class afterwards would hang.
    const is_cpa = ((await row.getAttribute("class")) ?? "").includes("ds-row");
    // "编辑" for direct rows, "编辑（连接设置）" for the CPA source row
    await row.locator('button[title^="编辑"]').first().click();
    // CPA renders inline (data-testid="cpa-connector-settings", no dialog);
    // other plugins render a SettingsForm dialog (data-testid="settings-form-{id}").
    if (is_cpa) {
        const form = sPage.locator('[data-testid="cpa-connector-settings"]');
        await expect(form).toBeVisible({ timeout: 10_000 });
        return form;
    }
    await expect(sPage.locator('[role="dialog"]')).toBeVisible({ timeout: 10_000 });
    const fallbackForm = sPage
        .locator('[data-testid^="settings-form-"]')
        .filter({ hasText: name })
        .first();
    await expect(fallbackForm).toBeVisible();
    return fallbackForm;
}

async function set_react_input(locator: ReturnType<Page["locator"]>, value: string) {
    // t267: React 受控 input 用 nativeInputValueSetter + 派发 input/change 事件设值。
    // Playwright fill/pressSequentially 在受控组件上偶发不触发 onChange（fill 后值恒
    // 默认、逐键产生光标拼接），原生 setter 绕过 React 的 value tracker 保证 state 更新。
    const handle = await locator.elementHandle();
    if (!handle) throw new Error("input element not found");
    await handle.evaluate((el, v) => {
        const input = el as HTMLInputElement;
        const proto = Object.getPrototypeOf(input) as HTMLInputElement;
        // eslint-disable-next-line @typescript-eslint/unbound-method -- native value setter 需从 descriptor 取方法，call 显式绑定 this=input
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter?.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
}

test.describe("plugin configuration", () => {
    test("auto-creates plugin instances on first launch", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const popup = new PopupPage(page);
        await popup.waitReady();

        const sPage = await openSettings(omni.app, page);

        const pluginNavItems = sPage.locator('[data-testid^="settings-plugin-nav-"]');
        const count = await pluginNavItems.count();
        expect(count).toBeGreaterThan(0);
    });

    test("settings form can be filled and saved", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const sPage = await openSettings(omni.app, page);

        const form = await openAccountForm(sPage, "CPA");
        await form.locator('input[name="endpoint:default"]').fill("https://cpa.example.test");
        await form.locator('input[name="cpa_mgmt_key"]').fill("test-api-key");

        await form.locator('button[type="submit"]').click();
        // CPA renders inline — wait for the detail view to close (save completed),
        // not a dialog (which never appears for CPA).
        await expect(sPage.locator('[data-testid="cpa-connector-settings"]')).toBeHidden({
            timeout: 10_000,
        });
    });

    test("CPA is configured as a data source not a main provider", async ({ omni }) => {
        const page = await omni.app.firstWindow();
        const sPage = await openSettings(omni.app, page);

        await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
        // CPA plugin is grouped by its active providers (e.g. "Claude"),
        // not in a standalone "CPA 额度连接器" group.
        // Find any account row containing CPA and click its edit button.
        const cpaRow = sPage.locator(".acc-row").filter({ hasText: "CPA" }).first();
        await expect(cpaRow).toBeVisible();
        await cpaRow.locator('button[title^="编辑"]').first().click();
        // CPA detail page renders inline (not in a dialog)
        await expect(sPage.locator('[data-testid="cpa-connector-settings"]')).toBeVisible({
            timeout: 10_000,
        });

        await expect(sPage.getByLabel("CPA-Manager URL")).toBeVisible();
    });

    test("CPA settings persist after app restart without exposing the secret", async ({ omni }) => {
        let page = await omni.app.firstWindow();
        let sPage = await openSettings(omni.app, page);

        let form = await openAccountForm(sPage, "CPA");
        // t267: React 受控 input 经 nativeInputValueSetter 设值（fill/pressSequentially
        // 偶发不触发 onChange，实测值回退默认或光标拼接）。
        const endpoint_input = form.locator('input[name="endpoint:default"]');
        await set_react_input(endpoint_input, "https://cpa.example.test");
        await form.locator('input[name="cpa_mgmt_key"]').fill("secret-management-key");
        // t267: 确认输入已生效。
        await expect(endpoint_input).toHaveValue("https://cpa.example.test");
        // CpaConnectorSettings submits via the form's built-in save button
        await form.locator('button[type="submit"]').click();
        // The CPA detail view closes only after the save completes — wait for it
        // to return to the account list before restarting, or the write is lost.
        await expect(sPage.locator('[data-testid="cpa-connector-settings"]')).toBeHidden({
            timeout: 10_000,
        });
        await expect(sPage.locator(".acc-card").first()).toBeVisible();

        // t267: 保存值经 config-store save 落盘。确定性等待 config.json 出现目标
        // endpoint 再 restart（AC3 确定性条件等待）。注：生产保存链路偶发不落盘
        //（renderer → main 偶发不达，p093），poll 超时会暴露之。
        await expect
            .poll(
                () => {
                    const cfg = JSON.parse(
                        readFileSync(join(omni.userDataDir, "config.json"), "utf8"),
                    ) as { plugins?: { endpointOverrides?: Record<string, string> }[] };
                    return cfg.plugins?.some(
                        (p) => p.endpointOverrides?.["default"] === "https://cpa.example.test",
                    );
                },
                { timeout: 10_000 },
            )
            .toBe(true);

        await omni.stop();
        await omni.start();

        page = await omni.app.firstWindow();
        sPage = await openSettings(omni.app, page);
        form = await openAccountForm(sPage, "CPA");
        await expect(form.locator('input[name="endpoint:default"]')).toHaveValue(
            "https://cpa.example.test",
        );
        await expect(form.locator('input[name="cpa_mgmt_key"]')).toHaveValue(
            "secret-management-key",
        );
        await expect(form.locator('input[name="cpa_mgmt_key"]')).toHaveAttribute(
            "type",
            "password",
        );
    });
});
