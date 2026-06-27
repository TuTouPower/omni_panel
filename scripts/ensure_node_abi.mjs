import { spawnSync } from "node:child_process";

/**
 * @param {string} exec_path
 */
function check_abi(exec_path) {
    const check = spawnSync(
        exec_path,
        ["-e", "new (require('better-sqlite3'))(':memory:').close()"],
        { stdio: "pipe", env: process.env },
    );
    return check.status === 0;
}

if (!check_abi(process.execPath)) {
    process.stderr.write("[abi] better-sqlite3 not compatible with Node, rebuilding...\n");
    const pm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const rebuild = spawnSync(pm, ["rebuild", "better-sqlite3"], {
        stdio: "inherit",
        shell: process.platform === "win32",
    });
    if (rebuild.status !== 0) {
        process.exit(rebuild.status ?? 1);
    }
    process.stderr.write("[abi] Node rebuild complete\n");
}
