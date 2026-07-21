#!/usr/bin/env node
/**
 * 启动测试实例：独立 userData 目录（.scratch/test-instance/），
 * 不触碰原 %APPDATA%/omni_usage 数据。
 *
 * 流程：ensure electron ABI → gen build-info → electron-vite dev --user-data-dir=<sandbox>
 *
 * 用法：pnpm start:test  或  node scripts/start-test.mjs
 */
import { spawnSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dataDir = resolve(root, ".scratch", "test-instance");

mkdirSync(dataDir, { recursive: true });

console.log(`[start-test] 数据沙盒: ${dataDir}`);

// 测试实例品牌隔离：黄色图标 + 独立 local-api 端口（与正常实例 17863 不撞）
process.env["TEST_INSTANCE"] = "1";
process.env["OMNI_USAGE_PORT"] = "17864";
console.log("[start-test] TEST_INSTANCE=1 OMNI_USAGE_PORT=17864");

// 1. 确保 better-sqlite3 匹配 Electron ABI（dev 必需）
console.log("[start-test] ensure electron ABI...");
spawnSync("node", ["scripts/ensure_electron_abi.mjs"], {
    cwd: root,
    stdio: "inherit",
});

// 2. 生成 build-info（branch@commit）
console.log("[start-test] gen build-info...");
spawnSync("tsx", ["scripts/gen-build-info.ts"], {
    cwd: root,
    stdio: "inherit",
});

// 3. electron-vite dev，userData 指向沙盒
console.log(`[start-test] 启动 electron-vite dev (user-data-dir=${dataDir})...`);
const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--", `--user-data-dir=${dataDir}`], {
    cwd: root,
    stdio: "inherit",
    shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
