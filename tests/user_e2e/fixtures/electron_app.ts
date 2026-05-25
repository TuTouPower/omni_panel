import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MAIN_ENTRY = resolve(ROOT, ".vite/build/index.js");

// Isolated userData per test run — avoids config pollution from packaged runs
const E2E_USER_DATA = mkdtempSync(join(tmpdir(), "omniusage-e2e-"));

function getElectronPath(): string {
    if (process.platform === "win32") {
        return resolve(ROOT, "node_modules/electron/dist/electron.exe");
    }
    return resolve(ROOT, "node_modules/electron/dist/electron");
}

export interface LaunchedApp {
    app: ElectronApplication;
}

export async function launchApp(): Promise<LaunchedApp> {
    const electronPath = getElectronPath();
    console.log("[E2E] electron path:", electronPath);
    console.log("[E2E] main entry:", MAIN_ENTRY);
    console.log("[E2E] userData:", E2E_USER_DATA);

    const app = await electron.launch({
        args: [MAIN_ENTRY, `--user-data-dir=${E2E_USER_DATA}`],
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

    return { app };
}

export async function closeApp(launched: LaunchedApp): Promise<void> {
    await launched.app.close();
}
