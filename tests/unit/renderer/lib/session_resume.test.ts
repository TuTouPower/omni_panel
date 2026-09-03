import { describe, expect, it } from "vitest";
import { resume_command } from "../../../../src/renderer/lib/session-resume";

/**
 * t401：resume_command 自定义模板 {session_id} 替换。
 * AC-001~004 覆盖自定义命中、缺省/空串回退默认、多处占位符、未知源 null。
 */
describe("resume_command templates (t401)", () => {
    it("AC-001: custom template replaces {session_id}", () => {
        expect(
            resume_command("kimi_code", "abc", {
                kimi_code: "kimi --yolo -r {session_id}",
            }),
        ).toBe("kimi --yolo -r abc");
    });

    it("AC-002: omit templates or missing entry falls back to built-in default", () => {
        expect(resume_command("kimi_code", "abc")).toBe("kimi -r abc");
        expect(resume_command("kimi_code", "abc", {})).toBe("kimi -r abc");
        expect(
            resume_command("kimi_code", "abc", { claude_code: "claude --resume {session_id}" }),
        ).toBe("kimi -r abc");
        expect(resume_command("claude_code", "sid1")).toBe("claude --resume sid1");
        expect(resume_command("grok", "g1")).toBe("grok --resume g1");
        expect(resume_command("opencode", "o1")).toBe("opencode -s o1");
    });

    it("AC-002: empty-string template treated as not customized", () => {
        expect(resume_command("kimi_code", "abc", { kimi_code: "" })).toBe("kimi -r abc");
    });

    it("AC-003: all {session_id} placeholders replaced", () => {
        expect(
            resume_command("kimi_code", "xyz", {
                kimi_code: "echo {session_id} && kimi -r {session_id}",
            }),
        ).toBe("echo xyz && kimi -r xyz");
    });

    it("t447 AC-003: codex resume template", () => {
        expect(resume_command("codex", "01a06865-bbc4-7bb2-a6aa-7fc8c5c71ed6")).toBe(
            "codex resume 01a06865-bbc4-7bb2-a6aa-7fc8c5c71ed6",
        );
    });

    it("AC-004: unknown source without template returns null", () => {
        expect(resume_command("unknown_cli", "abc")).toBeNull();
        expect(resume_command("unknown_cli", "abc", {})).toBeNull();
        expect(
            resume_command("unknown_cli", "abc", { kimi_code: "kimi -r {session_id}" }),
        ).toBeNull();
    });

    it("custom template for unknown source still applies", () => {
        expect(
            resume_command("custom_src", "sid", {
                custom_src: "mycli --resume {session_id}",
            }),
        ).toBe("mycli --resume sid");
    });
});
