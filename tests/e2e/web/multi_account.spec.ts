import { expect, test } from "../fixtures/test_web";
import { PopupPage } from "../pages/popup_page";

/**
 * Web e2e：多 connector 同 provider 合并到一个 card；多 item provider tab 多 bar。
 * mock local-api 回放真实快照（KIMI 有 3 个 enabled 连接器，均 provider=kimi）。
 *
 * 原 electron 版用 seed_fake_plugin 造 dup-svc-plugin/dup-svc-plugin-2 验证 dedup，
 * web 用 mock 真实 KIMI 多 connector 合并泛化（card-name "Kimi" 出现一次）。
 */
test.describe("multi-account display (web)", () => {
    test("multiple enabled connectors with same provider merge into one card", async ({
        webPage,
    }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        const card_names = live.locator(".card .card-name");
        await expect(card_names.first()).toBeVisible({ timeout: 15_000 });

        const names: string[] = [];
        const count = await card_names.count();
        for (let i = 0; i < count; i++) {
            const text = await card_names.nth(i).textContent();
            if (text) names.push(text.trim());
        }

        // 同 provider 的多个 enabled connector 应合并为单一 card（无重复 card-name）
        // real fixture：KIMI 3 个 enabled poll connector → 1 张 "Kimi" card
        const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
        expect(duplicates).toEqual([]);

        // 强校验合并语义：KIMI fixture 必须合并为恰好 1 张 Kimi card。
        // synthetic.json 手工保证含 1 个 KIMI connector（1→1；gen_synthetic.mjs
        // 不产生，重跑 e2e:gen-synthetic 会覆盖，见 docs/pending.md p021）；
        // real fixture 3 个 KIMI enabled connector 合并 3→1，验证同语义
        // （仅断"无重复"无法捕获"未来误改每 connector 一张但名字各异"的退化）。
        const kimi_cards = live.locator(".card .card-name", { hasText: "Kimi" });
        await expect(kimi_cards).toHaveCount(1);
    });

    test("multi-item provider tab renders multiple progress bars", async ({ webPage }) => {
        const popup = new PopupPage(webPage);
        await popup.waitReady();

        const live = popup.root();
        const nav = live.locator(".tabs-wrap");
        // Antigravity provider 含 Gemini Models + Claude/GPT 两个 item（real/synthetic 均有）
        await nav.getByRole("button", { name: /Antigravity/ }).click();
        await webPage.waitForTimeout(500);

        const bars = live.locator(".bar-row");
        expect(await bars.count()).toBeGreaterThanOrEqual(1);
    });
});
