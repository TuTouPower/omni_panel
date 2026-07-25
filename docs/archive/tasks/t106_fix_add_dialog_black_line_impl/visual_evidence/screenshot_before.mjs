import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
await page.goto('file://' + join(__dirname, 'dialog_before.html'));
await page.screenshot({ path: join(__dirname, 'before_fix_first_frame.png') });
await browser.close();
console.log('screenshot saved');
