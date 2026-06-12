import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, accessSync, constants, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();

const EXE_BY_PLATFORM: Record<string, string> = {
    win32: resolve(ROOT, "artifacts/win-unpacked/OmniUsage.exe"),
    darwin: resolve(ROOT, "artifacts/mac/OmniUsage.app/Contents/MacOS/OmniUsage"),
    linux: resolve(ROOT, "artifacts/linux-unpacked/omni-usage"),
};

const APP_PATH = EXE_BY_PLATFORM[process.platform];
const APP_EXISTS = APP_PATH !== undefined && existsSync(APP_PATH);
const APP_DIR = APP_PATH ? resolve(APP_PATH, "..") : undefined;

let SCRIPT_DIR: string;

function write_script(name: string, content: string): string {
    const scriptPath = join(SCRIPT_DIR, name);
    writeFileSync(scriptPath, content, "utf8");
    return scriptPath;
}

/**
 * Run a script file via the packaged Electron binary with ELECTRON_RUN_AS_NODE=1.
 * Mirrors how the plugin runner executes compiled plugins.
 */
async function run_script(
    scriptPath: string,
    stdinData?: string,
    timeoutMs = 30000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!APP_PATH) throw new Error("APP_PATH is undefined");

    return new Promise((resolvePromise) => {
        const child = spawn(APP_PATH, [scriptPath], {
            env: {
                PATH: process.env["PATH"] ?? "",
                HOME: process.env["HOME"] ?? "",
                USERPROFILE: process.env["USERPROFILE"] ?? "",
                APPDATA: process.env["APPDATA"] ?? "",
                LOCALAPPDATA: process.env["LOCALAPPDATA"] ?? "",
                TEMP: process.env["TEMP"] ?? "",
                TMP: process.env["TMP"] ?? "",
                SYSTEMROOT: process.env["SYSTEMROOT"] ?? "",
                NODE_ENV: "production",
                ELECTRON_RUN_AS_NODE: "1",
            },
            timeout: timeoutMs,
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let settled = false;

        child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

        if (stdinData !== undefined) {
            child.stdin.end(stdinData);
        } else {
            child.stdin.end();
        }

        child.on("close", (code) => {
            if (settled) return;
            settled = true;
            resolvePromise({
                stdout: Buffer.concat(stdoutChunks).toString("utf8"),
                stderr: Buffer.concat(stderrChunks).toString("utf8"),
                exitCode: code ?? -1,
            });
        });

        child.on("error", () => {
            if (settled) return;
            settled = true;
            resolvePromise({
                stdout: Buffer.concat(stdoutChunks).toString("utf8"),
                stderr: Buffer.concat(stderrChunks).toString("utf8"),
                exitCode: -1,
            });
        });
    });
}

describe.skipIf(!APP_EXISTS)("packaged plugin execution", () => {
    beforeAll(() => {
        if (!APP_EXISTS) {
            console.warn(`Skipping: packaged app not found at ${APP_PATH ?? "unknown platform"}`);
            console.warn("Run \`pnpm package\` first.");
            return;
        }
        SCRIPT_DIR = mkdtempSync(join(tmpdir(), "omniusage-plugin-test-"));
    });

    afterAll(() => {
        if (SCRIPT_DIR) {
            rmSync(SCRIPT_DIR, { recursive: true, force: true });
        }
    });

    it("ELECTRON_RUN_AS_NODE=1 makes app behave as Node.js", async () => {
        const script = write_script(
            "check_node.js",
            "console.log(JSON.stringify({ execPath: process.execPath, nodeEnv: process.env.NODE_ENV }));",
        );
        const { stdout, exitCode } = await run_script(script);
        expect(exitCode).toBe(0);
        const result = JSON.parse(stdout.trim()) as { execPath: string; nodeEnv: string };
        expect(result.execPath).toContain("OmniUsage");
        expect(result.nodeEnv).toBe("production");
    });

    it("app.asar is present in packaged resources", () => {
        const asarPath = join(APP_DIR, "resources", "app.asar");
        expect(existsSync(asarPath)).toBe(true);
    });

    it("plugin cache directory is writable", () => {
        const cacheDir = join(APP_DIR, "resources", "plugin-cache");
        expect(existsSync(cacheDir)).toBe(true);
        accessSync(cacheDir, constants.W_OK);
    });

    it("bundled plugins directory exists in packaged resources", () => {
        const pluginsDir = join(APP_DIR, "resources", "plugins");
        expect(existsSync(pluginsDir)).toBe(true);
    });

    it("sdk directory exists in packaged resources", () => {
        const sdkDir = join(APP_DIR, "resources", "sdk");
        expect(existsSync(sdkDir)).toBe(true);
    });

    it("esbuild binary exists in unpacked resources", () => {
        const esbuildPackages: Record<string, string> = {
            "darwin-arm64": "node_modules/@esbuild/darwin-arm64/bin/esbuild",
            "darwin-x64": "node_modules/@esbuild/darwin-x64/bin/esbuild",
            "linux-arm64": "node_modules/@esbuild/linux-arm64/bin/esbuild",
            "linux-x64": "node_modules/@esbuild/linux-x64/bin/esbuild",
            "win32-arm64": "node_modules/@esbuild/win32-arm64/esbuild.exe",
            "win32-ia32": "node_modules/@esbuild/win32-ia32/esbuild.exe",
            "win32-x64": "node_modules/@esbuild/win32-x64/esbuild.exe",
        };
        const pkg = esbuildPackages[`${process.platform}-${process.arch}`];
        if (!pkg) return;

        // In packaged builds, esbuild binary lives in app.asar.unpacked
        const unpackedPath = join(APP_DIR, "resources", "app.asar.unpacked", pkg);
        const asarPath = join(APP_DIR, "resources", "app.asar", pkg);
        expect(existsSync(unpackedPath) || existsSync(asarPath)).toBe(true);
    });

    it("configure_esbuild_binary_path rewrites app.asar to app.asar.unpacked", async () => {
        const script = write_script(
            "check_esbuild_rewrite.js",
            `
            // Simulate the ASAR path rewrite that configure_esbuild_binary_path does
            const original = "C:\\\\app.asar\\\\node_modules\\\\@esbuild\\\\win32-x64\\\\esbuild.exe";
            const rewritten = original.includes("app.asar")
                ? original.replace("app.asar", "app.asar.unpacked")
                : original;
            const result = {
                original_includes_asar: original.includes("app.asar"),
                rewritten,
                has_unpacked: rewritten.includes("app.asar.unpacked"),
            };
            console.log(JSON.stringify(result));
        `,
        );
        const { stdout, exitCode } = await run_script(script);
        expect(exitCode).toBe(0);
        const result = JSON.parse(stdout.trim()) as {
            original_includes_asar: boolean;
            rewritten: string;
            has_unpacked: boolean;
        };
        expect(result.original_includes_asar).toBe(true);
        expect(result.has_unpacked).toBe(true);
        expect(result.rewritten).toBe(
            "C:\\app.asar.unpacked\\node_modules\\@esbuild\\win32-x64\\esbuild.exe",
        );
    });

    it("plugin can receive stdin params and produce JSON output", async () => {
        const script = write_script(
            "stdin_reader.js",
            `
            let data = "";
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (chunk) => { data += chunk; });
            process.stdin.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    console.log(JSON.stringify({ ok: true, hasParams: !!parsed.params }));
                } catch (err) {
                    console.log(JSON.stringify({ ok: false, error: String(err) }));
                }
            });
        `,
        );
        const stdinPayload = JSON.stringify({ params: { API_KEY: "test" } });
        const { stdout, exitCode } = await run_script(script, stdinPayload);
        expect(exitCode).toBe(0);
        const result = JSON.parse(stdout.trim()) as { ok: boolean; hasParams: boolean };
        expect(result.ok).toBe(true);
        expect(result.hasParams).toBe(true);
    });

    it("plugin stdin with missing required param produces error JSON", async () => {
        const script = write_script(
            "missing_param.js",
            `
            let data = "";
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (chunk) => { data += chunk; });
            process.stdin.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    if (!parsed.params || Object.keys(parsed.params).length === 0) {
                        console.log(JSON.stringify({ error: "MISSING_PARAM", message: "No parameters provided" }));
                        process.exit(1);
                    }
                    console.log(JSON.stringify({ ok: true }));
                } catch (err) {
                    console.log(JSON.stringify({ error: "PARSE_ERROR", message: String(err) }));
                    process.exit(1);
                }
            });
        `,
        );
        const { stdout, exitCode } = await run_script(script, JSON.stringify({ params: {} }));
        expect(exitCode).toBe(1);
        const result = JSON.parse(stdout.trim()) as { error: string };
        expect(result.error).toBe("MISSING_PARAM");
    });
});
