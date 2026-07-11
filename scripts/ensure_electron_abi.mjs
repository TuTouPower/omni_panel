import { spawnSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electron_module = /** @type {unknown} */ (require("electron"));
if (typeof electron_module !== "string") {
    process.stderr.write("[abi] electron entrypoint is invalid\n");
    process.exit(1);
}
const electron_bin = electron_module;
const sqlite_check_script = "new (require('better-sqlite3'))(':memory:').close()";

let electron_check;
try {
    electron_check = spawnSync(electron_bin, ["-e", sqlite_check_script], {
        stdio: "pipe",
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
} catch {
    process.stderr.write("[abi] electron not found, skipping Electron ABI check\n");
    process.exit(0);
}

if (electron_check.status !== 0) {
    process.stderr.write("[abi] better-sqlite3 is not compatible with Electron, rebuilding...\n");

    const electron_pkg = resolve(process.cwd(), "node_modules/electron/package.json");
    let electron_version = "";
    try {
        const electron_pkg_json = /** @type {unknown} */ (
            JSON.parse(readFileSync(electron_pkg, "utf8"))
        );
        if (typeof electron_pkg_json !== "object" || electron_pkg_json === null) {
            throw new Error("invalid Electron package metadata");
        }
        const electron_pkg_record = /** @type {Record<string, unknown>} */ (electron_pkg_json);
        if (typeof electron_pkg_record["version"] !== "string") {
            throw new Error("invalid Electron package metadata");
        }
        electron_version = electron_pkg_record["version"];
    } catch {
        process.stderr.write("[abi] cannot read Electron version from node_modules/electron\n");
        process.exit(1);
    }

    const npx_cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const target_arch = process.env["npm_config_arch"] ?? process.arch;
    const better_sqlite3_dir = resolve(process.cwd(), "node_modules/better-sqlite3");
    const rebuild = spawnSync(
        npx_cmd,
        [
            "node-gyp",
            "rebuild",
            "--release",
            `--target=${electron_version}`,
            `--arch=${target_arch}`,
            "--dist-url=https://electronjs.org/headers",
            "--build-from-source",
        ],
        {
            stdio: "inherit",
            shell: process.platform === "win32",
            cwd: better_sqlite3_dir,
            timeout: 300_000,
        },
    );
    if (rebuild.status !== 0) {
        process.exit(rebuild.status ?? 1);
    }

    if (process.platform === "win32") {
        const project_dir = process.cwd().replace(/\\/g, "\\\\");
        try {
            execSync(
                `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='electron.exe'\\" | Where-Object { $_.CommandLine -match '${project_dir}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
                { timeout: 5000, stdio: "ignore" },
            );
        } catch {
            /* no leftover processes */
        }
        spawnSync("ping", ["-n", "2", "127.0.0.1"], { stdio: "ignore" });
    }

    process.stderr.write("[abi] switch complete\n");
}
