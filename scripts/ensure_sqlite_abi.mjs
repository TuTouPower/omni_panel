import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

/**
 * 统一管理 better-sqlite3 原生模块的 NODE_MODULE_VERSION。
 *
 * 同一份 node_modules/better-sqlite3/build/Release/better_sqlite3.node 只能为
 * 一种 runtime 编译（Electron 或 Node），靠本脚本在入口处按需切换。
 *
 * 双产物缓存（node_modules/.cache/omni-sqlite-abi/{electron,node}/）+ 指纹：
 * 版本/patch/arch 任一变化即失效重建；否则秒级 copy，不重编译。
 * 每次切换后用目标 runtime 实跑 better-sqlite3 验证加载，杜绝「看似成功 ABI 错」。
 *
 * 用法：node scripts/ensure_sqlite_abi.mjs <electron|node>
 */

const target = process.argv[2];
if (target !== "electron" && target !== "node") {
    process.stderr.write("[abi] usage: node scripts/ensure_sqlite_abi.mjs <electron|node>\n");
    process.exit(1);
}

const require = createRequire(import.meta.url);
const project_root = process.cwd();
const cache_root = resolve(project_root, "node_modules/.cache/omni-sqlite-abi");
const sqlite_node_path = resolve(
    project_root,
    "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
);
const current_file = resolve(cache_root, ".current.json");
const patch_path = resolve(project_root, "patches/better-sqlite3.patch");
const REBUILD_TIMEOUT = 300_000;

/** @param {string} p @returns {Record<string, unknown> | null} */
function read_json(p) {
    try {
        /** @type {unknown} */
        const parsed = JSON.parse(readFileSync(p, "utf8"));
        return /** @type {Record<string, unknown> | null} */ (parsed);
    } catch {
        return null;
    }
}

/** @param {string} p @param {unknown} obj */
function write_json(p, obj) {
    mkdirSync(resolve(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify(obj, null, 2));
}

/** @param {string} p */
function file_hash(p) {
    try {
        return createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);
    } catch {
        return "";
    }
}

/** @param {"electron"|"node"} runtime */
function fingerprint(runtime) {
    const bsq_pkg = read_json(resolve(project_root, "node_modules/better-sqlite3/package.json"));
    /** @type {string} */
    let runtime_version;
    if (runtime === "electron") {
        const e_pkg = read_json(resolve(project_root, "node_modules/electron/package.json"));
        runtime_version = typeof e_pkg?.version === "string" ? e_pkg.version : "unknown";
    } else {
        runtime_version = process.versions.node;
    }
    return {
        target: runtime,
        runtime_version,
        bsq_version: typeof bsq_pkg?.version === "string" ? bsq_pkg.version : "unknown",
        patch_hash: file_hash(patch_path),
        arch: process.env["npm_config_arch"] ?? process.arch,
    };
}

/** @param {"electron"|"node"} runtime */
function rebuild(runtime) {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const bsq_dir = resolve(project_root, "node_modules/better-sqlite3");
    const args = ["node-gyp", "rebuild", "--release", "--build-from-source"];
    if (runtime === "electron") {
        const e_pkg = read_json(resolve(project_root, "node_modules/electron/package.json"));
        const electron_version = e_pkg?.version;
        if (typeof electron_version !== "string") {
            process.stderr.write("[abi] cannot read Electron version\n");
            process.exit(1);
        }
        args.push(
            "--runtime=electron",
            `--target=${electron_version}`,
            `--arch=${process.env["npm_config_arch"] ?? process.arch}`,
            "--dist-url=https://electronjs.org/headers",
        );
    }
    const r = spawnSync(npx, args, {
        stdio: "inherit",
        shell: process.platform === "win32",
        cwd: bsq_dir,
        timeout: REBUILD_TIMEOUT,
    });
    if (r.status !== 0) {
        process.exit(r.status ?? 1);
    }
}

/** @param {"electron"|"node"} runtime */
function verify(runtime) {
    const script = "new (require('better-sqlite3'))(':memory:').close()";
    if (runtime === "electron") {
        const electron_bin = String(require("electron"));
        const r = spawnSync(electron_bin, ["-e", script], {
            stdio: "pipe",
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        });
        return r.status === 0;
    }
    const r = spawnSync(process.execPath, ["-e", script], { stdio: "pipe" });
    return r.status === 0;
}

const fp = fingerprint(target);
const target_cache_dir = resolve(cache_root, target);
const target_cache_node = resolve(target_cache_dir, "better_sqlite3.node");
const target_cache_fp = resolve(target_cache_dir, ".fingerprint.json");

const build_hash = file_hash(sqlite_node_path);
const current = read_json(current_file);

// 1) 当前已是目标且产物未变 -> 跳过
if (
    current !== null &&
    current["target"] === target &&
    JSON.stringify(current["fingerprint"]) === JSON.stringify(fp) &&
    typeof current["build_hash"] === "string" &&
    current["build_hash"] === build_hash &&
    build_hash
) {
    process.stderr.write(`[abi] already ${target} (v${fp.runtime_version})\n`);
    process.exit(0);
}

// 2) 缓存有效 -> copy + 验证
const cached_fp = read_json(target_cache_fp);
const cache_valid =
    cached_fp && JSON.stringify(cached_fp) === JSON.stringify(fp) && existsSync(target_cache_node);

if (cache_valid) {
    process.stderr.write(`[abi] switching to ${target} (v${fp.runtime_version}) from cache\n`);
    mkdirSync(resolve(sqlite_node_path, ".."), { recursive: true });
    copyFileSync(target_cache_node, sqlite_node_path);
} else {
    // 3) 重建
    process.stderr.write(`[abi] rebuilding for ${target} (v${fp.runtime_version})...\n`);
    rebuild(target);
    process.stderr.write(`[abi] rebuild complete, verifying...\n`);
}

// 验证（缓存命中与重建两条路径都要过）
if (!verify(target)) {
    process.stderr.write(`[abi] verification FAILED for ${target} — better-sqlite3 won't load\n`);
    process.exit(1);
}

// 写入缓存（仅重建路径需要，但缓存命中时 copy 产物一致，重写无害）
if (!cache_valid) {
    mkdirSync(target_cache_dir, { recursive: true });
    copyFileSync(sqlite_node_path, target_cache_node);
    write_json(target_cache_fp, fp);
}

const new_build_hash = file_hash(sqlite_node_path);
write_json(current_file, {
    target,
    fingerprint: fp,
    build_hash: new_build_hash,
});
process.stderr.write(
    `[abi] verified ${target} (v${fp.runtime_version}, ${new_build_hash || "no-hash"})\n`,
);
