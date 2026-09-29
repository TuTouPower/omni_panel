/**
 * s040 探针 v2：对照实验，回答两个问题。
 *
 *  Q1 采集窗口必须"显示"（showInactive + setOpacity(0)）才能让 Cloudflare 脚本运行吗？
 *     —— 对照 mode=hidden-only（窗口始终 show:false）与 mode=transparent。
 *  Q2 透明态下 Cloudflare managed challenge 能否自行通过（拿到 cf_clearance）？
 *     —— 长时间观察 + 记录挑战文案（"正在验证…" vs "请验证您是真人"）。
 *
 * 运行：ELECTRON_RUN_AS_NODE= ./node_modules/.bin/electron <此脚本> <输出目录> <hidden-only|transparent>
 * 输出：probe_v2_<mode>.json + <mode>_t<秒>.png 截图
 */
import { app, BrowserWindow, session } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(process.argv[2] ?? here);
const MODE = process.argv[3] === "hidden-only" ? "hidden-only" : "transparent";
const LOGIN_URL = "https://api-flowercloud.com/clientarea.php";
const PARTITION = `persist:spike-s040-${MODE}`;
const POLL_MS = 500;
const SAMPLE_AT_MS = [5_000, 15_000, 30_000, 50_000, 70_000];
const TIMEOUT_MS = 75_000;

// 受限环境里 Chromium sandbox 起不来（见 probe.mjs 说明）；生产仍是 sandbox: true。
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");

mkdirSync(join(OUT_DIR, "userdata-v2-" + MODE), { recursive: true });
mkdirSync(join(OUT_DIR, "tmp"), { recursive: true });
app.setPath("userData", join(OUT_DIR, "userdata-v2-" + MODE));
app.setPath("temp", join(OUT_DIR, "tmp"));

const timeline = [];
const t0 = Date.now();

function record(label, detail = {}) {
    const entry = { at: new Date().toISOString(), elapsed_ms: Date.now() - t0, label, ...detail };
    timeline.push(entry);
    console.log(`[v2:${MODE}] ${JSON.stringify(entry)}`);
    return entry;
}

process.on("uncaughtException", (error) => {
    console.error(`[v2:${MODE}] uncaught:`, error);
    try {
        writeFileSync(
            join(OUT_DIR, `probe_v2_${MODE}_error.json`),
            JSON.stringify({ error: String(error), timeline }, null, 2),
        );
    } catch {
        // 记录失败也要退出
    }
    app.exit(1);
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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
            "安全验证",
            "请稍候",
        ].some((n) => lower.includes(n))
    ) {
        return "cloudflare";
    }
    if (["dologin.php", 'type="password"', "type='password'"].some((n) => lower.includes(n)))
        return "login";
    if (
        ["恶意流量", "attention required", "error 1020", "access denied"].some((n) =>
            lower.includes(n),
        )
    )
        return "blocked";
    return "other";
}

async function js(win, code) {
    try {
        return await win.webContents.executeJavaScript(code);
    } catch (error) {
        return { error: String(error) };
    }
}

/** 挑战态信号：文案、控件、shadow DOM、表单、CF 变量。 */
async function challengeProbe(win) {
    return await js(
        win,
        `(() => {
            const text = (document.body && document.body.innerText ? document.body.innerText : "")
                .replace(/\\s+/g, " ").trim().slice(0, 200);
            const out = {
                text,
                hidden: document.hidden,
                visibilityState: document.visibilityState,
                hasFocus: document.hasFocus(),
                iframes: [],
                widgets: [],
                shadowHosts: [],
                forms: [],
                cfKeys: null,
                checkboxVisible: null,
            };
            document.querySelectorAll("iframe").forEach((f) =>
                out.iframes.push({ src: (f.getAttribute("src") || "").slice(0, 80), w: f.clientWidth, h: f.clientHeight }),
            );
            document.querySelectorAll("[class*=turnstile],[id*=turnstile],[class*=challenge],[id*=challenge],input[type=checkbox],button").forEach((el) =>
                out.widgets.push({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60), w: el.clientWidth, h: el.clientHeight }),
            );
            const walk = (root, depth) => {
                if (depth > 4) return;
                root.querySelectorAll("*").forEach((el) => {
                    if (el.shadowRoot) {
                        const hits = el.shadowRoot.querySelectorAll("iframe,input[type=checkbox],[class*=turnstile],[id*=turnstile],button");
                        out.shadowHosts.push({
                            host: el.tagName + (el.id ? "#" + el.id : ""),
                            depth,
                            hits: Array.from(hits).map((x) => ({ tag: x.tagName, id: x.id, cls: String(x.className).slice(0, 40), src: (x.getAttribute && x.getAttribute("src") || "").slice(0, 60) })),
                        });
                        walk(el.shadowRoot, depth + 1);
                    }
                });
            };
            walk(document, 0);
            document.querySelectorAll("form").forEach((f) => out.forms.push({ id: f.id, action: (f.getAttribute("action") || "").slice(0, 60), inputs: f.querySelectorAll("input").length }));
            out.cfKeys = typeof window._cf_chl_opt !== "undefined" ? Object.keys(window._cf_chl_opt).slice(0, 12) : null;
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
        destroyed: w.isDestroyed(),
    }));
}

async function capture(win, name) {
    try {
        const image = await win.webContents.capturePage();
        writeFileSync(join(OUT_DIR, name), image.toPNG());
    } catch (error) {
        record("screenshot_failed", { name, error: String(error) });
    }
}

async function main() {
    await app.whenReady();
    record("app_ready", {
        mode: MODE,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
    });

    const ses = session.fromPartition(PARTITION);
    const cfRequests = [];
    ses.webRequest.onCompleted({ urls: ["*://*/*"] }, (details) => {
        if (/cloudflare|cdn-cgi|challenge|turnstile/i.test(details.url)) {
            cfRequests.push({
                url: details.url.slice(0, 110),
                status: details.statusCode,
                elapsed_ms: Date.now() - t0,
            });
        }
    });

    const win = new BrowserWindow({
        width: 520,
        height: 720,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            partition: PARTITION,
            backgroundThrottling: false,
        },
    });
    record("window_created_hidden", { windows: windowState("created") });

    await win.loadURL(LOGIN_URL);
    await delay(1000);

    const firstHtml = await js(win, "document.documentElement.outerHTML");
    record("loaded", {
        kind: classify(typeof firstHtml === "string" ? firstHtml : null),
        hidden: await js(win, "document.hidden"),
        visibilityState: await js(win, "document.visibilityState"),
        windows: windowState("after-load"),
    });

    if (MODE === "transparent") {
        win.showInactive();
        win.setOpacity(0);
        await delay(1200);
        record("present_for_capture", { windows: windowState("transparent") });
    } else {
        record("stays_hidden", { windows: windowState("hidden") });
    }

    let sampled = 0;
    let clearanceElapsed = null;
    let lastKind = null;
    while (Date.now() - t0 < TIMEOUT_MS) {
        const elapsed = Date.now() - t0;
        const html = await js(win, "document.documentElement.outerHTML");
        const kind = classify(typeof html === "string" ? html : null);
        if (kind !== lastKind) {
            lastKind = kind;
            record("kind_change", { kind });
        }
        const clearance = await ses.cookies.get({ name: "cf_clearance" });
        if (clearance.length > 0 && clearanceElapsed === null) {
            clearanceElapsed = elapsed;
            record("cf_clearance_set", { elapsed_ms: elapsed });
        }

        if (sampled < SAMPLE_AT_MS.length && elapsed >= SAMPLE_AT_MS[sampled]) {
            const at = SAMPLE_AT_MS[sampled];
            sampled += 1;
            const probe = await challengeProbe(win);
            record("sample", {
                at_ms: at,
                kind,
                ...probe,
                windows: windowState(`t${Math.round(at / 1000)}s`),
            });
            await capture(win, `${MODE}_t${Math.round(at / 1000)}s.png`);
        }

        if (kind === "login" || kind === "usage") {
            record("reached_page", { kind, elapsed_ms: elapsed });
            break;
        }
        await delay(POLL_MS);
    }

    const finalProbe = await challengeProbe(win);
    const result = {
        mode: MODE,
        login_url: LOGIN_URL,
        partition: PARTITION,
        final_kind: lastKind,
        cf_clearance_elapsed_ms: clearanceElapsed,
        final_probe: finalProbe,
        final_windows: windowState("final"),
        cf_requests: cfRequests,
        timeline,
    };
    record("final", {
        final_kind: lastKind,
        cf_clearance_elapsed_ms: clearanceElapsed,
        cf_request_count: cfRequests.length,
    });
    writeFileSync(join(OUT_DIR, `probe_v2_${MODE}.json`), JSON.stringify(result, null, 2));
    console.log(`[v2:${MODE}] wrote probe_v2_${MODE}.json`);
    win.destroy();
    app.quit();
}

main().catch((error) => {
    console.error(`[v2:${MODE}] failed:`, error);
    writeFileSync(
        join(OUT_DIR, `probe_v2_${MODE}_error.json`),
        JSON.stringify({ error: String(error), timeline }, null, 2),
    );
    app.exit(1);
});
