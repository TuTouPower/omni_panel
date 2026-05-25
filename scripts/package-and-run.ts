import { execSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { platform } from "node:os";

const ROOT = process.cwd();

function log(msg: string) {
    console.log(`[package:run] ${msg}`);
}

function kill_omni(): void {
    const is_win = platform() === "win32";

    try {
        if (is_win) {
            execSync("taskkill /f /im OmniUsage.exe 2>nul", { stdio: "pipe" });
        } else {
            execSync("pkill -f OmniUsage", { stdio: "pipe" });
        }
        log("killed existing OmniUsage process");
    } catch {
        log("no existing OmniUsage process found");
    }
}

function run_packaged(): void {
    const is_win = platform() === "win32";
    const exe = resolve(
        ROOT,
        is_win
            ? "out/OmniUsage-win32-x64/OmniUsage.exe"
            : "out/OmniUsage-darwin-x64/OmniUsage.app/Contents/MacOS/OmniUsage",
    );

    log(`starting: ${exe}`);

    const child = spawn(exe, [], {
        detached: true,
        stdio: "ignore",
    });
    child.unref();

    log("packaged app started");
}

async function main(): Promise<void> {
    const no_build = process.argv.includes("--no-build");

    // Step 1: kill existing process
    kill_omni();

    // Step 2: wait a moment for the process to exit
    await new Promise((r) => setTimeout(r, 500));

    // Step 2: package (skip if --no-build)
    if (!no_build) {
        log("running pnpm package:build...");
        execSync("pnpm run package:build", { cwd: ROOT, stdio: "inherit" });
    }

    // Step 3: run
    run_packaged();
}

void main();
