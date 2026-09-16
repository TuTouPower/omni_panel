import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

/**
 * 校验 better-sqlite3 原生模块能在目标 runtime 下加载。
 *
 * p228：better-sqlite3 13 起改用 N-API，包内自带 `prebuilds/`（每平台一份二进制），
 * 同一份产物同时适用于 Node 与 Electron——历史「同一份 .node 只能为一种 runtime
 * 编译，需按 runtime 切换/重建」的前提不再成立，切换、缓存与重建逻辑已删除。
 *
 * 本脚本保留原有 `<electron|node>` CLI 契约（package.json / CI / docs 均按此调用），
 * 只做加载验证：避免「看似成功但 ABI 不匹配」拖到测试或启动阶段才暴露。
 *
 * 用法：node scripts/ensure_sqlite_abi.mjs <electron|node>
 */

const target = process.argv[2];
if (target !== "electron" && target !== "node") {
    process.stderr.write("[sqlite] usage: node scripts/ensure_sqlite_abi.mjs <electron|node>\n");
    process.exit(1);
}

const require = createRequire(import.meta.url);
const bsq_dir = resolve(process.cwd(), "node_modules/better-sqlite3");

let version = "unknown";
try {
    /** @type {unknown} */
    const parsed = JSON.parse(readFileSync(resolve(bsq_dir, "package.json"), "utf8"));
    if (typeof parsed === "object" && parsed !== null) {
        const raw = /** @type {{ version?: unknown }} */ (parsed).version;
        if (typeof raw === "string") version = raw;
    }
} catch {
    process.stderr.write("[sqlite] 未找到 node_modules/better-sqlite3；请先 pnpm install\n");
    process.exit(1);
}

const probe = "new (require('better-sqlite3'))(':memory:').close()";
const result =
    target === "electron"
        ? spawnSync(String(require("electron")), ["-e", probe], {
              stdio: "pipe",
              env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          })
        : spawnSync(process.execPath, ["-e", probe], { stdio: "pipe" });

if (result.status !== 0) {
    const detail = result.stderr.toString().trim();
    process.stderr.write(`[sqlite] ${target} 下加载 better-sqlite3 失败：${detail}\n`);
    process.exit(result.status ?? 1);
}

const flavor = existsSync(resolve(bsq_dir, "prebuilds")) ? "N-API prebuild" : "本地编译产物";
process.stderr.write(`[sqlite] ${target} 校验通过（better-sqlite3 ${version}，${flavor}）\n`);
