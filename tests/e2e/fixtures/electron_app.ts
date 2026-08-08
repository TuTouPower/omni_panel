import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MAIN_ENTRY = resolve(ROOT, "out/main/index.js");

/** Returns a fresh isolated userData dir for each test. */
export function getDefaultUserData(): string {
    return mkdtempSync(join(tmpdir(), "omnipanel-e2e-"));
}

function getElectronPath(): string {
    if (process.platform === "win32") {
        return resolve(ROOT, "node_modules/electron/dist/electron.exe");
    }
    return resolve(ROOT, "node_modules/electron/dist/electron");
}

export interface LaunchedApp {
    app: ElectronApplication;
    userDataDir: string;
}

export interface LaunchAppOptions {
    /** Called after tmp dir creation but before Electron launch. Use to seed plugins or config. */
    onReady?: (userDataDir: string) => void;
    /** Reuse a specific userData dir (for restart tests). If omitted, a dir is created automatically. */
    userDataDir?: string;
    /** Enable system tray in E2E mode (normally skipped). */
    enableTray?: boolean;
}

export async function launchApp(options?: LaunchAppOptions): Promise<LaunchedApp> {
    // When explicit dir is given, reuse it. When onReady is provided without dir, create fresh.
    // Otherwise reuse the shared default dir.
    const userDataDir = options?.userDataDir ?? mkdtempSync(join(tmpdir(), "omnipanel-e2e-"));

    options?.onReady?.(userDataDir);

    const electronPath = getElectronPath();
    console.log("[E2E] electron path:", electronPath);
    console.log("[E2E] main entry:", MAIN_ENTRY);
    console.log("[E2E] userData:", userDataDir);

    const app = await electron.launch({
        args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
        executablePath: electronPath,
        cwd: ROOT,
        env: {
            ...process.env,
            E2E: "1",
            ...(options?.enableTray ? { E2E_WITH_TRAY: "1" } : {}),
        },
    });

    // Log Electron process output for debugging
    app.process().stdout?.on("data", (data: Buffer) => {
        console.log("[Electron stdout]", data.toString());
    });
    app.process().stderr?.on("data", (data: Buffer) => {
        console.log("[Electron stderr]", data.toString());
    });
    app.on("close", () => {
        console.log("[E2E] Electron process closed");
    });

    return { app, userDataDir };
}

export async function closeApp(launched: LaunchedApp): Promise<void> {
    // t267: 确保主进程退出后再返回。Playwright close() 在 Windows 下可能不等
    // Electron 全部子进程（renderer/gpu/utility）终止，残留进程会继续写
    // userData 目录（run 2 实测 snapshot-cache ENOENT）并可能占用 local-api 端口。
    // 主进程 close() 已触发 before-quit flush（config/runtimeStore 落盘），此处等
    // 进程 exit 事件确认完全退出；超时 kill 后同样等 exit，避免 restart 与旧进程
    // teardown 并发（review t267_gen_f001）。
    const proc = launched.app.process();
    await launched.app.close();
    if (proc.exitCode === null && !proc.killed) {
        if (!(await wait_for_exit(proc, 3000))) {
            proc.kill();
            await wait_for_exit(proc, 3000);
        }
    }
}

/** 等进程退出；超时未退出返回 false（调用方据此 kill 兜底）。 */
function wait_for_exit(
    proc: { exitCode: number | null; killed?: boolean; once: (e: "exit", cb: () => void) => void },
    timeout_ms: number,
): Promise<boolean> {
    if (proc.exitCode !== null) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
            resolve(false);
        }, timeout_ms);
        proc.once("exit", () => {
            clearTimeout(timer);
            resolve(true);
        });
    });
}
