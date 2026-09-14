import { describe, expect, it, vi } from "vitest";

const child_process_mock = vi.hoisted(() => ({
    spawn: vi.fn().mockReturnValue({
        once: vi.fn(),
        unref: vi.fn(),
    }),
}));

vi.mock("node:child_process", () => child_process_mock);

import {
    commandcode_resume_command,
    execute_commandcode_resume,
} from "../../../../../src/main/core/session-history/resume";

describe("Command Code host resume (t484)", () => {
    it("uses the fixed resume template and rejects command fragments", () => {
        expect(commandcode_resume_command("sid-01")).toBe("cmd --resume sid-01");
        expect(commandcode_resume_command("sid with spaces")).toBeNull();
        expect(commandcode_resume_command("sid;rm -rf /")).toBeNull();
    });

    it("starts the fixed executable without a shell", () => {
        child_process_mock.spawn.mockClear();
        const result = execute_commandcode_resume("sid-01");
        expect(result).toEqual({ command: "cmd --resume sid-01", started: true });
        expect(child_process_mock.spawn).toHaveBeenCalledWith("cmd", ["--resume", "sid-01"], {
            detached: true,
            stdio: "ignore",
            shell: false,
        });
    });
});
