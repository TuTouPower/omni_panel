import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });

async function shot(name) {
    await page.goto("file://" + join(__dirname, name + ".html"));
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(__dirname, name + ".png") });
}

await shot("dialog_before_paused");
await shot("dialog_paused");
await browser.close();
console.log("screenshots saved");
