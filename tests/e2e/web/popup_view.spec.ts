import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";
import { SettingsPage } from "../pages/settings_page";

/**
 * Web e2e：popup view 主干断言。
 * 浏览器驱动 out/web SPA，mock local-api 回放真实快照。
 */
test.describe("popup view (web)", () => {
    test("shows title with logo", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        const title = await popup.getTitle();
        expect(title).toBe("Usage");
    });

    test("refresh button is visible and clickable", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await expect(popup.root().getByTitle("刷新全部")).toBeVisible();
        await popup.clickRefresh();
    });

    test("refresh button does not have focus ring on initial render (p261)", async ({
        webPage,
    }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        const refreshBtn = popup.root().getByTitle("刷新全部");
        await expect(refreshBtn).toBeVisible();
        const isFocusVisible = await refreshBtn.evaluate((el) => el.matches(":focus-visible"));
        expect(isFocusVisible).toBe(false);
    });

    test("popup root fills the viewport height", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const layout = await webPage.evaluate(() => {
            const root = document.querySelector('[data-popup="live"]');
            const scroll = document.querySelector('[data-testid="popup-scroll"]');
            if (!(root instanceof HTMLElement)) throw new Error("Popup root not found");
            if (!(scroll instanceof HTMLElement)) throw new Error("Popup scroll area not found");
            const root_rect = root.getBoundingClientRect();
            const scroll_rect = scroll.getBoundingClientRect();
            return {
                root_height: root_rect.height,
                scroll_bottom: scroll_rect.bottom,
                viewport_height: window.innerHeight,
            };
        });

        expect(Math.abs(layout.root_height - layout.viewport_height)).toBeLessThanOrEqual(1);
        expect(layout.scroll_bottom).toBeLessThanOrEqual(layout.root_height + 1);
    });

    test("main content area is rendered with overview tab", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        const live = webPage.locator('[data-popup="live"]');
        const providerNav = live.locator('[data-testid="popup-tabs-wrap"]');
        await expect(live).toBeVisible();
        await expect(live.locator('[data-testid="popup-scroll"]')).toBeVisible();
        // 总览 tab 是静态 UI，断言其存在
        await expect(providerNav.getByRole("button", { name: /总览/ })).toBeVisible();
        // provider tabs 数量来自实际 fixture，断言 > 0 而非具体名
        const providerTabs = providerNav.locator("button").filter({
            hasNotText: /总览/,
        });
        // tab 由异步数据后渲染，先等首个 provider tab 可见再计数（避免竞态 count=0）。
        await expect(providerTabs.first()).toBeVisible({ timeout: 15_000 });
        expect(await providerTabs.count()).toBeGreaterThan(0);
        // CPA provider 应被过滤出主 UI（业务规则：CPA 数据进对应 provider，不独立成 tab）
        await expect(providerNav.getByRole("button", { name: /^CPA$/ })).toHaveCount(0);
    });

    test("settings opens via hash route in same page", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await popup.clickSettings();

        // web SPA：settings 在同 page hash 路由，无新窗口
        const settings = await SettingsPage.open_via_hash(webPage);
        await expect(settings.page.locator('[data-testid="settings-sidebar"]')).toBeVisible();
    });

    // t307：旧「web 隐藏会话历史按钮」用例语义被推翻，改为「web 显示」；t311 又改为
    // 「web 会话历史为原生链接」——断言从 button 迁 link（同一功能迁移）。
    test("session history link is visible in web titlebar (t311 AC-002)", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        await expect(webPage.getByRole("link", { name: "Session面板" })).toBeVisible();
        await expect(webPage.getByRole("link", { name: "Settings面板" })).toBeVisible();
        await expect(webPage.getByRole("link", { name: "Agent面板" })).toBeVisible();
        // 窗口控制按钮仍隐藏（t307 只放开会话历史按钮那处守卫）。
        await expect(webPage.getByRole("button", { name: "最小化" })).toHaveCount(0);
        await expect(webPage.getByRole("button", { name: "最大化/还原" })).toHaveCount(0);
        await expect(webPage.getByRole("button", { name: "关闭" })).toHaveCount(0);
    });

    // t307 AC-002 旧语义（web 点击会话历史按钮 → open 桥分发 onFocus）被 t311 推翻：
    // web 会话入口改为原生 `<a href="#session">`，左键由浏览器原生 hash 导航，open 桥不再被
    // 调用（d036 确认空 loc 分发无副作用的前提消失）。用例整体删除，以下为新语义断言。
    test("session history link left-click enters #session without dispatching open (t311 AC-002)", async ({
        webPage,
    }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();
        // 注册 onFocus 订阅者：t311 后左键为原生导航，open 桥不被调用，onFocus 不应收到分发。
        await webPage.evaluate(() => {
            (window as unknown as { __t311_focus: unknown[] }).__t311_focus = [];
            window.usageboard.sessionHistory.onFocus((loc) => {
                (window as unknown as { __t311_focus: unknown[] }).__t311_focus.push(loc);
            });
        });

        await webPage.getByRole("link", { name: "Session面板" }).click();

        await expect
            .poll(async () => webPage.evaluate(() => window.location.hash))
            .toBe("#session");
        await expect(webPage.locator('[data-testid="session-shell"]').first()).toBeVisible();
        const received = await webPage.evaluate(
            () => (window as unknown as { __t311_focus: unknown[] }).__t311_focus,
        );
        expect(received).toEqual([]);
    });

    test.describe("t538 opaque button focus ring removal", () => {
        test("AC-001: refresh-all button never shows opaque ring", async ({ webPage }) => {
            const popup = new PopupPage(webPage);
            await popup.waitReady();
            const refreshBtn = popup.root().getByTitle("刷新全部");
            await expect(refreshBtn).toBeVisible();

            // 初始态无 :focus-visible（沿用 p261 断言）
            expect(await refreshBtn.evaluate((el) => el.matches(":focus-visible"))).toBe(false);

            // 点击后（鼠标模态）：仍无 :focus-visible，类名无 ring 片段，可见 box-shadow 为 none；
            // 失焦再点一次同样。环样式已从 Button 基类删除，任何聚焦态都不可能出现蓝框。
            for (let round = 0; round < 2; round++) {
                await refreshBtn.click();
                const state = await refreshBtn.evaluate((el) => ({
                    active: document.activeElement === el,
                    visible: el.matches(":focus-visible"),
                    cls: el.getAttribute("class") ?? "",
                    shadow: getComputedStyle(el).boxShadow,
                }));
                expect(state.active).toBe(true);
                expect(state.visible).toBe(false);
                expect(state.cls).not.toContain("ring-");
                expect(state.shadow).toBe("none");
                // 移开焦点再回来
                await popup.root().getByTestId("app-title").first().click();
                expect(await refreshBtn.evaluate((el) => document.activeElement === el)).toBe(
                    false,
                );
            }
        });

        test("AC-002: titlebar icon button and web panel link never show opaque ring", async ({
            webPage,
        }) => {
            const popup = new PopupPage(webPage);
            await popup.waitReady();
            // web 端面板互跳为原生 <a>（ICON_LINK_CLS），桌面为 Button；refresh-all 为 Button 基类。
            // 不点击互跳链接（会切 hash 路由离开 popup），只断言类名与聚焦 shadow。
            const link = popup.root().getByTitle("Settings面板");
            await expect(link).toBeVisible();
            const link_state = await link.evaluate((el) => {
                (el as HTMLElement).focus();
                return {
                    tag: el.tagName,
                    cls: el.getAttribute("class") ?? "",
                    shadow: getComputedStyle(el).boxShadow,
                };
            });
            expect(link_state.tag).toBe("A");
            expect(link_state.cls).not.toContain("ring-");
            expect(link_state.shadow).toBe("none");

            const btn = popup.root().getByTitle("刷新全部");
            await btn.click();
            const btn_state = await btn.evaluate((el) => ({
                cls: el.getAttribute("class") ?? "",
                shadow: getComputedStyle(el).boxShadow,
            }));
            expect(btn_state.cls).not.toContain("ring-");
            expect(btn_state.shadow).toBe("none");
        });

        test("AC-003 guard: settings text input still shows focus indication", async ({
            webPage,
        }) => {
            await webPage.waitForSelector('[data-testid="app-title"]', { timeout: 10_000 });
            const settings = await SettingsPage.open_via_hash(webPage);
            const sPage = settings.page;
            await sPage.locator('[data-testid="settings-plugin-nav-accounts"]').click();
            const deepseek_rows = sPage
                .locator('[data-testid="account-row"]')
                .filter({ hasText: "DeepSeek" });
            await deepseek_rows.first().getByRole("button", { name: "编辑" }).click();
            const remark = sPage.getByPlaceholder("例如：工作账号").first();
            await expect(remark).toBeVisible();
            const unfocused_border = await remark.evaluate(
                (el) => getComputedStyle(el).borderColor,
            );
            await remark.focus();
            const focused = await remark.evaluate((el) => ({
                border: getComputedStyle(el).borderColor,
                shadow: getComputedStyle(el).boxShadow,
            }));
            // B 类（半透明 accent-ring + 边框变色）保持不动：聚焦指示必须存在
            expect(focused.border).not.toBe(unfocused_border);
            expect(focused.shadow).not.toBe("none");
        });
    });
});
