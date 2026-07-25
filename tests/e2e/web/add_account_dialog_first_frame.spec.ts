import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Visual regression for t106: AddAccountDialog first frame must not show a
 * black line from the empty container's border / box-shadow.
 *
 * jsdom cannot run CSS animations, so this test uses a real Chromium page with
 * the actual stylesheet. Animations are paused at the from frame so we can
 * assert the computed border-color and box-shadow are hidden.
 */
test.describe("AddAccountDialog first frame (t106)", () => {
    test("border and box-shadow are hidden at animation start", async ({ page }) => {
        const css = readFileSync(join(process.cwd(), "src/renderer/styles/globals.css"), "utf8");
        const relevant = css.slice(css.indexOf(".acct-dialog"), css.indexOf(".ad-head"));

        const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
:root {
  --win-bg: #ffffff;
  --win-border: rgba(0,0,0,0.12);
  --win-shadow: 0 20px 60px rgba(0,0,0,0.18);
  --hairline: rgba(0,0,0,0.08);
  --text: #111111;
  --text-3: #888888;
}
body {
  margin: 0;
  background: #f0f0f0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
${relevant}
.acct-dialog {
  animation-play-state: paused !important;
  min-height: 80px;
}
.ad-head {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 16px;
  border-bottom: 0.5px solid var(--hairline);
}
</style>
</head>
<body>
<div class="acct-dialog">
  <div class="ad-head">
    <div>
      <div style="font-size:15.5px;font-weight:700">添加账号</div>
      <div style="font-size:12px;color:var(--text-3)">选择服务</div>
    </div>
  </div>
  <div style="padding:16px">content</div>
</div>
</body>
</html>
        `.trim();

        await page.setContent(html);
        const dialog = page.locator(".acct-dialog").first();
        await dialog.waitFor({ state: "visible" });

        const style = await dialog.evaluate((el) => {
            const computed = window.getComputedStyle(el);
            return {
                borderTopColor: computed.borderTopColor,
                borderBottomColor: computed.borderBottomColor,
                boxShadow: computed.boxShadow,
                opacity: computed.opacity,
            };
        });

        expect(style.opacity).toBe("0");
        expect(style.borderTopColor).toBe("rgba(0, 0, 0, 0)");
        expect(style.borderBottomColor).toBe("rgba(0, 0, 0, 0)");
        // Chromium reports "none" as a zero-blur transparent shadow.
        expect(
            style.boxShadow === "none" || style.boxShadow === "rgba(0, 0, 0, 0) 0px 0px 0px 0px",
        ).toBe(true);
    });
});
