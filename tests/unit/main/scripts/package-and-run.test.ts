import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
    execSync: vi.fn(),
    spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

import { execSync } from "node:child_process";
import { run_package_build } from "../../../../scripts/package-and-run";

const exec_mock = vi.mocked(execSync);

beforeEach(() => {
    exec_mock.mockReset();
});

describe("package-and-run run_package_build", () => {
    it("restores Node ABI even when build fails midway (t375 AC-003)", () => {
        // call 1: ensure electron ABI OK；call 2（build 段）抛错中断；call 3: finally 恢复
        exec_mock
            .mockImplementationOnce(() => Buffer.alloc(0))
            .mockImplementationOnce(() => {
                throw new Error("build interrupted");
            })
            .mockImplementationOnce(() => Buffer.alloc(0));

        expect(() => {
            run_package_build();
        }).toThrow("build interrupted");

        const restore_calls = exec_mock.mock.calls.filter(([cmd]) =>
            cmd.includes("ensure_sqlite_abi.mjs node"),
        );
        expect(restore_calls.length).toBe(1);
    });

    it("restores Node ABI on the success path (t375 AC-003)", () => {
        exec_mock.mockImplementation(() => Buffer.alloc(0));

        run_package_build();

        const calls = exec_mock.mock.calls.map(([cmd]) => cmd);
        expect(calls[calls.length - 1]).toContain("ensure_sqlite_abi.mjs node");
    });
});
