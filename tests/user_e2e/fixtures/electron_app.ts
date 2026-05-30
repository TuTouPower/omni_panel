import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MAIN_ENTRY = resolve(ROOT, ".vite/build/index.js");

// Default isolated userData — shared by tests that don't seed plugins.
// When onReady is provided, a fresh tmp dir is created per launch to isolate seeded data.
const DEFAULT_E2E_USER_DATA = mkdtempSync(join(tmpdir(), "omniusage-e2e-"));

/** Returns the default shared userData dir (for tests without custom seeding). */
export function getDefaultUserData(): string {
    return DEFAULT_E2E_USER_DATA;
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
}

export async function launchApp(options?: LaunchAppOptions): Promise<LaunchedApp> {
    // When explicit dir is given, reuse it. When onReady is provided without dir, create fresh.
    // Otherwise reuse the shared default dir.
    const userDataDir =
        options?.userDataDir ??
        (options?.onReady
            ? mkdtempSync(join(tmpdir(), "omniusage-e2e-custom-"))
            : DEFAULT_E2E_USER_DATA);

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
