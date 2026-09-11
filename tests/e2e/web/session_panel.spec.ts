import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "../fixtures/test_web";

const SYNTHETIC = JSON.parse(
    readFileSync(resolve("tests/e2e/fixtures/synthetic.json"), "utf8"),
) as Record<string, unknown>;

const LARGE_SESSION = {
    id: "large",
    source: "claude_code",
    env: "win",
    model: "model",
    title: "大会话虚拟列表",
    directory: "/proj/large",
    input_tokens: 100,
    output_tokens: 100,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    calls: 600,
    started_at: 0,
    ended_at: 1,
};

function make_large_messages(total: number) {
    return Array.from({ length: total }, (_, i) => ({
        id: `large-m${String(i)}`,
        role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
        text: `消息 ${String(i)}`,
        timestamp: 1000 + i * 1000,
    }));
}

async function setup_large_session_routes(page: Page): Promise<void> {
    await page.route("**/v1/sessions*", async (route) => {
        const sessions = [...((SYNTHETIC["GET /v1/sessions"] ?? []) as unknown[]), LARGE_SESSION];
        await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(sessions),
        });
    });
    await page.route(/\/v1\/sessionHistory\?id=large/, async (route, request) => {
        const url = new URL(request.url());
        const before = url.searchParams.get("before_cursor");
        const limit = Number(url.searchParams.get("limit") ?? "200");
        const all = make_large_messages(600);
        const before_idx = before ? Number(before) : all.length;
        const start = Math.max(0, before_idx - limit);
        const messages = all.slice(start, before_idx);
        const next_cursor = start > 0 ? String(start) : null;
        await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ messages, next_cursor }),
        });
    });
}

/**
 * Web e2e：会话面板 P6（会话库 + 同屏查看）。
 */

async function open_history(page: Page): Promise<void> {
    await page.goto("/#session");
    await page.locator('[data-testid="session-shell"]').first().waitFor({ state: "visible" });
    await expect(page.getByTestId("library-view")).toBeVisible();
}

/** 从会话库单独打开指定会话，等待同屏面板出现。 */
async function open_session_from_library(page: Page, session_id: string): Promise<void> {
    const card = page.locator(`[data-testid="library-card"][data-session-id="${session_id}"]`);
    await card.hover();
    await card.getByRole("button", { name: "单独打开" }).first().click();
    await expect(page.getByTestId("compare-view")).toBeVisible();
}

test.describe("session panel (web, P6 library+compare)", () => {
    test("默认会话库；同屏查看后可返回", async ({ webPage }) => {
        const page = webPage;
        await open_history(page);
        await expect(page.getByRole("button", { name: "工作台", exact: true })).toHaveCount(0);
        await open_session_from_library(page, "s1");
        await expect(page.locator('[data-testid="compare-panel"]').first()).toBeVisible();
        await expect(page.locator('[data-testid="compare-message"]').first()).toBeVisible();
        await page.getByRole("button", { name: "返回会话库" }).click();
        await expect(page.getByTestId("library-view")).toBeVisible();
    });

    test("会话库打开会话进入同屏并渲染消息", async ({ webPage }) => {
        const page = webPage;
        await open_history(page);
        await open_session_from_library(page, "s1");
        await expect(page.locator('[data-testid="compare-message"]').first()).toBeVisible();
        await expect(page.locator('[data-testid="compare-message"]').first()).toContainText(
            /用户|Agent/,
        );
    });

    test("用量面板跨面板打开会话进入同屏查看（t263）", async ({ webPage }) => {
        const page = webPage;
        await page.goto("/#usage");
        await page.locator('[data-popup="live"]').first().waitFor({ state: "visible" });
        await page.evaluate(() => {
            void window.usageboard.sessionHistory.open("claude_code", "win", "s1");
        });
        await page.locator('[data-testid="session-shell"]').first().waitFor({ state: "visible" });
        await expect(page.locator('[data-testid="compare-panel"]').first()).toBeVisible();
        await expect(
            page.locator('[data-testid="compare-panel"][data-session-id="s1"]'),
        ).toBeVisible();
    });

    test("同屏查看最多 8 条；全选结果超限 toast", async ({ webPage }) => {
        const page = webPage;
        await open_history(page);
        await expect(page.locator('[data-testid="library-card"]').first()).toBeVisible();
        for (const id of ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]) {
            await page.getByRole("button", { name: `会话 ${id}` }).click();
        }
        await expect(page.getByText("已选 8 条")).toBeVisible();
        await page.getByRole("button", { name: /同屏查看/ }).click();
        await expect(page.locator('[data-testid="compare-panel"]')).toHaveCount(8);
        await page.getByRole("button", { name: "返回会话库" }).click();
        await page.getByRole("button", { name: "会话 s1" }).click();
        await page.getByRole("button", { name: /全选结果/ }).click();
        await expect(page.getByText("已达同屏上限 8 条")).toBeVisible();
    });

    test("根背景 surface-window，卡片/同屏面板 surface-card 可辨", async ({ webPage }) => {
        const page = webPage;
        await open_history(page);
        await open_session_from_library(page, "s1");
        await expect(page.locator('[data-testid="compare-message"]').first()).toBeVisible();
        const bg = async (sel: string): Promise<string> =>
            page
                .locator(sel)
                .first()
                .evaluate((el) => getComputedStyle(el).backgroundColor);
        const shell_bg = await bg('[data-testid="session-shell"]');
        const library_bg = await bg('[data-testid="library-view"]');
        const panel_bg = await bg('[data-testid="compare-panel"]');
        const card_bg = await bg('[data-testid="library-card"]');
        expect(library_bg).toBe(shell_bg);
        expect(panel_bg).not.toBe(shell_bg);
        expect(card_bg).not.toBe(library_bg);
        expect(panel_bg).toBe(card_bg);
    });
});

test.describe("session panel large compare (web)", () => {
    test.beforeEach(async ({ webPage }) => {
        await setup_large_session_routes(webPage);
    });

    test("大会话进入同屏后可渲染消息", async ({ webPage }) => {
        const page = webPage;
        await open_history(page);
        await open_session_from_library(page, "large");
        await expect(page.locator('[data-testid="compare-message"]').first()).toBeVisible();
    });
});
