#!/usr/bin/env node
/**
 * OmniPanel 全局 CLI 入口（方案 C：永远指向 release 打包产物，不回退 dev 产物）。
 *
 * 背景：`pnpm start` 是 GUI 开发模式（electron-vite dev，必然开窗口）；真正的
 * 无窗口 CLI 是 `--cli serve`（t275）。全局命令 `omni_panel` 只服务稳定版用户，
 * 因此只定位 electron-builder 的 release 产物（artifacts/），绝不回退 out/——
 * 开发构建（out/）与全局使用（artifacts/）产物隔离，互不影响。
 *
 * 用法：
 *   omni_panel --cli serve [--port <n>] [--user-data-dir <dir>]   无窗口常驻服务
 *   omni_panel --cli open|refresh-all|pause|resume|restart|quit|autostart [--port <n>]
 *                                                                 瘦客户端控制
 *
 * 数据隔离：serve 默认使用沙盒 userData（.scratch/global-serve/），显式传
 * `--user-data-dir` 才用指定目录；真实用户数据目录（~/.config/OmniPanel）
 * 仅当显式传入时才被触碰。开发/测试请用仓库内 `pnpm cli:serve`（见
 * docs/guides/cli.md），不要用本全局命令跑开发实例。
 */
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");

// electron-builder Linux 产物（`pnpm make:linux` → artifacts/linux-unpacked/）。
// 平台相关产物路径可在此扩展（win-unpacked/OmniPanel.exe 等）。
const RELEASE_BIN =
    process.platform === "win32"
        ? resolve(ROOT, "artifacts/win-unpacked/OmniPanel.exe")
        : resolve(ROOT, "artifacts/linux-unpacked/omni_panel");

const args = process.argv.slice(2);

if (!existsSync(RELEASE_BIN)) {
    console.error(
        `[omni_panel] release 产物缺失：${RELEASE_BIN}\n` +
            "请先在仓库内执行 `pnpm make:linux`（或对应平台 make 命令）打包稳定版。\n" +
            "本命令只服务 release 产物，不回退 dev 产物（out/）——开发构建与全局使用隔离。",
    );
    process.exit(1);
}

// serve 默认沙盒 userData：全局命令不碰真实用户数据，除非显式 --user-data-dir。
if (args.includes("serve") && !args.some((a) => a.startsWith("--user-data-dir"))) {
    const sandbox = resolve(ROOT, ".scratch", "global-serve");
    args.push(`--user-data-dir=${sandbox}`);
    console.error(
        `[omni_panel] serve 使用沙盒 userData: ${sandbox}（真实数据需显式 --user-data-dir）`,
    );
}

const child = spawn(RELEASE_BIN, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
