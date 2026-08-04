// s010 spike: 验证 popup 窗口 hide() 后渲染进程存活、空闲 CPU 收敛、内存保留、
// show() 复用同窗口（不重建渲染进程）。用真实 renderer + preload，模拟 popup 关闭改隐藏。
// 运行: node_modules/electron/dist/electron.exe docs/spikes/s010_popup_hide_resource/code/hide_show_spike.js
const { app, BrowserWindow } = require("electron");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const PW = process.env.SHELL_GUARD_PW || "D:/Program Files/PowerShell/7/pwsh.exe";
const ROOT = path.resolve(__dirname, "../../../../");
const RENDERER = `file://${path.join(ROOT, "out/renderer/index.html")}`;
const PRELOAD = path.join(ROOT, "out/preload/index.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sample(pid, label) {
    // 返回进程累计 CPU 秒与工作集 MB（pwsh Get-Process）。
    const script = `$p = Get-Process -Id ${pid}; [pscustomobject]@{cpu=$p.CPU; ws=[math]::Round($p.WorkingSet64/1MB,1)} | ConvertTo-Json -Compress`;
    const out = execFileSync(PW, ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
    const parsed = JSON.parse(out);
    console.log(`[sample] ${label}: cpu_sec=${parsed.cpu.toFixed(3)} ws_mb=${parsed.ws}`);
    return parsed;
}

function report(name, value) {
    console.log(`[report] ${name}=${JSON.stringify(value)}`);
}

let load_count = 0;
let gone_count = 0;

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 482,
        height: 480,
        frame: false,
        show: false,
        skipTaskbar: true,
        resizable: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            preload: PRELOAD,
        },
    });
    win.webContents.on("did-finish-load", () => {
        load_count += 1;
    });
    win.webContents.on("render-process-gone", () => {
        gone_count += 1;
    });
    await win.loadURL(RENDERER);
    await sleep(1500); // 让 renderer 完成初始加载/失败静默

    const pid = win.webContents.getOSProcessId();
    const wc_id = win.webContents.id;
    report("initial_pid", pid);
    report("initial_wc_id", wc_id);
    report("initial_load_count", load_count);

    win.show();
    win.focus();
    await sleep(2000);
    const visible1 = sample(pid, "visible");

    win.hide();
    await sleep(1500); // 等背景节流稳定
    const hidden1 = sample(pid, "hidden-1.5s");
    await sleep(3000);
    const hidden2 = sample(pid, "hidden-4.5s");

    win.show();
    win.focus();
    await sleep(2000);
    const visible2 = sample(pid, "visible-again");
    report("after_show_pid", win.webContents.getOSProcessId());
    report("after_show_wc_id", win.webContents.id);
    report("after_show_load_count", load_count);
    report("render_process_gone_count", gone_count);

    // 汇总换算：两次采样间 CPU 秒差 / 墙钟秒 ≈ 占用单核百分比
    const pct = (a, b, sec) => Math.max(0, ((b.cpu - a.cpu) / sec) * 100).toFixed(1);
    report(
        "cpu_util",
        JSON.stringify({
            visible_pct: Number(pct(visible1, visible2, 2)), // 隐藏期间若持续渲染，这会是双份；仅参考
        }),
    );
    report(
        "hidden_delta",
        JSON.stringify({
            cpu_sec_gained_in_3s: (hidden2.cpu - hidden1.cpu).toFixed(4),
            pct_single_core: Number(pct(hidden1, hidden2, 3)),
            ws_retained_mb: hidden2.ws,
        }),
    );

    app.exit(0);
}).catch((err) => {
    console.error("[spike] FAILED", err);
    app.exit(1);
});
