import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CANDIDATES = ["python3", "python", "py"] as const;

async function isAvailable(command: string): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync(command, ["--version"], { timeout: 3000 });
        const match = /Python (\d+)\.(\d+)/.exec(stdout);
        if (!match) return false;
        const major = Number(match[1]);
        const minor = Number(match[2]);
        return major >= 3 && minor >= 8;
    } catch {
        return false;
    }
}

let cached: string | null = null;

export async function findPython(): Promise<string> {
    if (cached) return cached;
    for (const cmd of CANDIDATES) {
        if (await isAvailable(cmd)) {
            cached = cmd;
            return cmd;
        }
    }
    throw new Error("Python 3.8+ not found");
}
