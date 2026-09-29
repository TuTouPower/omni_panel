/**
 * s040 探针：在真实站点上观察花云客户区的 Cloudflare 质询与采集窗口可见性。
 *
 * 复刻生产的窗口路径（show:false 创建 → showInactive + setOpacity(0) 采集 → 8s 后 reveal），
 * 全程使用独立分区（persist:spike-flowercloud）与仓库内 userData，不触碰应用真实数据。
 *
 * 运行：ELECTRON_RUN_AS_NODE= ./node_modules/.bin/electron <此脚本> <输出目录>
 * 输出：probe_result.json + transparent_state.png + revealed_state.png
 */
import { app, BrowserWindow, session } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// app.setPath 要求绝对路径：命令行可能传相对路径，这里统一解析。
const OUT_DIR = resolve(process.argv[2] ?? here);
const LOGIN_URL = "https://api-flowercloud.com/clientarea.php";
const PARTITION = "persist:spike-flowercloud";
const POLL_MS = 400;
const TIMEOUT_MS = 45_000;
const REVEAL_AFTER_MS = 8_000;

const timeline = [];
const t0 = Date.now();

// Electron 默认把主进程未捕获异常弹成阻塞对话框；探针改为记录后退出，避免留窗口。
process.on("uncaughtException", (error) => {
    console.error("[probe] uncaught exception:", error);
    try {
        writeFileSync(
            join(OUT_DIR, "probe_error.json"),
            JSON.stringify({ error: String(error), timeline }, null, 2),
        );
    } catch {
        // 记录失败也要保证退出
    }
    app.exit(1);
});

// 本探针在受限环境（外部文件系统只读、无签名）里 Chromium sandbox 无法初始化，
// 会连锁导致 GPU/network 进程崩溃、loadURL 直接失败。探针只观察页面与窗口属性，
// 不加载不可信内容之外的代码，因此关闭 Chromium sandbox；生产环境仍为 sandbox: true。
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");

mkdirSync(join(OUT_DIR, "userdata"), { recursive: true });
mkdirSync(join(OUT_DIR, "tmp"), { recursive: true });
app.setPath("userData", join(OUT_DIR, "userdata"));
app.setPath("temp", join(OUT_DIR, "tmp"));

function record(kind, detail = {}) {
    const entry = { at: new Date().toISOString(), elapsed_ms: Date.now() - t0, kind, ...detail };
    timeline.push(entry);
    console.log(`[probe] ${JSON.stringify(entry)}`);
    return entry;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 与 connectors/flowercloud/connector.ts、flowercloud_dom.ts 一致的三分类。 */
function classify(html) {
    if (!html) return "empty";
    if (/(?:流量使用|\d+(?:\.\d+)?GB\s*\/)/i.test(html)) return "usage";
    const lower = html.toLowerCase();
    if (
        [
            "cf-challenge",
            "cf-browser-verification",
            "challenges.cloudflare.com",
            "just a moment",
            "turnstile",
        ].some((needle) => lower.includes(needle))
    ) {
        return "cloudflare";
    }
    if (
        ["dologin.php", 'type="password"', "type='password'"].some((needle) =>
            lower.includes(needle),
        )
    ) {
        return "login";
    }
    if (
        ["恶意流量", "attention required", "error 1020", "access denied"].some((needle) =>
            lower.includes(needle),
        )
    ) {
        return "blocked";
    }
    return "other";
}

async function js(win, code) {
    try {
        return await win.webContents.executeJavaScript(code);
    } catch (error) {
        return { error: String(error) };
    }
}

async function readHtml(win) {
    return await js(win, "document.documentElement.outerHTML");
}

async function pageState(win) {
    return await js(
        win,
        `({
            url: location.href,
            title: document.title,
            hidden: document.hidden,
            visibilityState: document.visibilityState,
            readyState: document.readyState,
            htmlLength: document.documentElement.outerHTML.length,
        })`,
    );
}

async function turnstileProbe(win) {
    return await js(
        win,
        `(() => {
            const out = { iframes: [], widgets: [], scripts: [], crossOriginIframe: false };
            document.querySelectorAll("iframe").forEach((f) => {
                out.iframes.push({
                    src: f.getAttribute("src") || "",
                    w: f.clientWidth,
                    h: f.clientHeight,
                    visible: f.offsetParent !== null,
                });
            });
            document
                .querySelectorAll("[class*=turnstile], [id*=turnstile], .cf-challenge, #challenge-form, #challenge-stage, input[type=checkbox]")
                .forEach((el) => {
                    out.widgets.push({
                        tag: el.tagName,
                        id: el.id,
                        cls: typeof el.className === "string" ? el.className : "",
                        visible: el.offsetParent !== null,
                        w: el.clientWidth,
                        h: el.clientHeight,
                    });
                });
            document.querySelectorAll("script[src]").forEach((s) => {
                if (/challenges\\.cloudflare\\.com|turnstile/.test(s.src)) out.scripts.push(s.src);
            });
            out.crossOriginIframe = out.iframes.some((f) => /challenges\\.cloudflare\\.com/.test(f.src));
            return out;
        })()`,
    );
}

function windowState(label) {
    return BrowserWindow.getAllWindows().map((w, index) => ({
        label,
        index,
        id: w.id,
        visible: w.isVisible(),
        focused: w.isFocused(),
        opacity: w.getOpacity(),
        bounds: w.getBounds(),
        title: w.getTitle(),
        destroyed: w.isDestroyed(),
    }));
}

async function capture(win, name) {
    try {
        const image = await win.webContents.capturePage();
        writeFileSync(join(OUT_DIR, name), image.toPNG());
        record("screenshot", { name, bytes: image.toPNG().length });
    } catch (error) {
        record("screenshot_failed", { name, error: String(error) });
    }
}

async function main() {
    await app.whenReady();
    record("app_ready", { electron: process.versions.electron, chrome: process.versions.chrome });

    const ses = session.fromPartition(PARTITION);
    const win = new BrowserWindow({
        width: 520,
        height: 720,
        show: false, // 复刻 create_window 的 hidden 分支
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            // 见文件头：受限环境下 Chromium sandbox 无法初始化，探针关闭之。
            sandbox: false,
            partition: PARTITION,
            backgroundThrottling: false,
        },
    });
    win.setSkipTaskbar(true); // 复刻生产：非 darwin 才调用，这里记录在 macOS 的实际效果来源
    record("window_created_hidden", { windows: windowState("created") });

    await win.loadURL(LOGIN_URL);
    await delay(800);
    const hiddenHtml = await readHtml(win);
    record("loaded_while_hidden", {
        page: await pageState(win),
        kind: classify(hiddenHtml),
        htmlLength: hiddenHtml === null ? 0 : hiddenHtml.length,
        cf_clearance: (await ses.cookies.get({ name: "cf_clearance" })).length,
    });

    // present_for_capture 等价路径
    win.showInactive();
    win.setOpacity(0);
    await delay(1500);
    record("present_for_capture", {
        page: await pageState(win),
        windows: windowState("transparent"),
    });
    await capture(win, "transparent_state.png");

    let revealed = false;
    let lastKind = null;
    let lastHidden = null;
    let turnstile = null;
    let clearanceElapsed = null;
    const deadline = t0 + TIMEOUT_MS;

    while (Date.now() < deadline) {
        const html = await readHtml(win);
        const kind = classify(html);
        const state = await pageState(win);
        if (kind !== lastKind || state.hidden !== lastHidden) {
            record("poll", {
                kind,
                hidden: state.hidden,
                visibilityState: state.visibilityState,
                url: state.url,
                htmlLength: state.htmlLength,
            });
            lastKind = kind;
            lastHidden = state.hidden;
        }

        if (kind === "cloudflare" && turnstile === null) {
            turnstile = await turnstileProbe(win);
            record("turnstile_probe", turnstile);
            const click = await js(
                win,
                `(() => {
                    const el = document.querySelector(".cf-turnstile, #challenge-stage, #turnstile-widget, input[type=checkbox]");
                    if (!el) return { found: false };
                    try {
                        el.click();
                        return { found: true, clicked: true, tag: el.tagName, id: el.id };
                    } catch (error) {
                        return { found: true, clicked: false, error: String(error) };
                    }
                })()`,
            );
            record("turnstile_click_attempt", click);
        }

        const clearance = await ses.cookies.get({ name: "cf_clearance" });
        if (clearance.length > 0 && clearanceElapsed === null) {
            clearanceElapsed = Date.now() - t0;
            record("cf_clearance_set", { elapsed_ms: clearanceElapsed, count: clearance.length });
        }

        if (!revealed && Date.now() - t0 >= REVEAL_AFTER_MS) {
            revealed = true;
            win.setOpacity(1);
            win.show();
            await delay(1000);
            record("reveal", { page: await pageState(win), windows: windowState("revealed") });
            await capture(win, "revealed_state.png");
        }

        if (kind === "login" || kind === "usage") {
            record("reached_page", { kind, url: state.url, elapsed_ms: Date.now() - t0 });
            break;
        }
        await delay(POLL_MS);
    }

    const finalState = {
        final_kind: lastKind,
        page: await pageState(win),
        windows: windowState("final"),
        turnstile,
        cf_clearance_elapsed_ms: clearanceElapsed,
    };
    record("final", finalState);
    writeFileSync(
        join(OUT_DIR, "probe_result.json"),
        JSON.stringify(
            { login_url: LOGIN_URL, partition: PARTITION, final: finalState, timeline },
            null,
            2,
        ),
    );
    console.log(`[probe] wrote ${join(OUT_DIR, "probe_result.json")}`);
    win.destroy();
    app.quit();
}

main().catch((error) => {
    console.error("[probe] failed:", error);
    writeFileSync(
        join(OUT_DIR, "probe_error.json"),
        JSON.stringify({ error: String(error), timeline }, null, 2),
    );
    app.exit(1);
});
