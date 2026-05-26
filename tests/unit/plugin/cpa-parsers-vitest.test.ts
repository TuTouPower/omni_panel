import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { findPython } from "../../../src/main/core/plugin/python-detect";

const pythonTestPath = resolve(__dirname, "./cpa_parsers_test.py");

let pythonCommand = "python3";

describe("CPA parser functions (Python unit tests)", () => {
    beforeAll(async () => {
        pythonCommand = await findPython();
    });

    it("all Python parser tests pass", () => {
        const result = spawnSync(pythonCommand, [pythonTestPath, "-v"], {
            encoding: "utf-8",
            timeout: 15000,
            env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });
        const combined = result.stdout + result.stderr;
        if (result.status !== 0) {
            throw new Error("Python tests failed:\n" + combined);
        }
        expect(combined).toContain("OK");
        expect(combined).not.toContain("FAIL:");
    });
});
