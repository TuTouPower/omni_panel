import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MAIN_ENTRY = resolve(ROOT, "out/main/index.js");

/** Returns a fresh isolated userData dir for each test. */
export function getDefaultUserData(): string {
    return mkdtempSync(join(tmpdir(), "omniusage-e2e-"));
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
    const userDataDir = options?.userDataDir ?? mkdtempSync(join(tmpdir(), "omniusage-e2e-"));

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
            E2E_SKIP_BUNDLED: "1",
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
    await launched.app.close();
}
