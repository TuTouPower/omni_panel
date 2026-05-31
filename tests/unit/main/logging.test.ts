import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initLogging } from "../../../src/main/core/logging";

let temp_dir: string | null = null;
let remove_logging: (() => void) | null = null;

afterEach(async () => {
    remove_logging?.();
    remove_logging = null;
    if (temp_dir) {
        await rm(temp_dir, { recursive: true, force: true });
        temp_dir = null;
    }
});

describe("initLogging", () => {
    it("writes the active log file path to the log", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-usage-logs-"));

        remove_logging = await initLogging(temp_dir);

        const log_dir = join(temp_dir, "logs");
        await vi.waitFor(async () => {
            const files = await readdir(log_dir);
            const log_file = files.find((file) => file.endsWith(".log"));
            expect(log_file).toBeDefined();
            const content = await readFile(join(log_dir, log_file ?? ""), "utf8");
            expect(content).toContain("Logging initialized:");
            expect(content).toContain(log_dir);
        });
    });
});
