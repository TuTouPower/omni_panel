import { afterEach, describe, expect, it, vi } from "vitest";
import { addTransport, createLogger, scrubber, setLogLevel } from "../../../src/shared/lib/logger";

function capture_output(): { lines: string[]; remove: () => void } {
    const lines: string[] = [];
    const remove = addTransport({
        write(_level, _module, message, meta) {
            lines.push(`${message}${meta !== undefined ? ` | ${JSON.stringify(meta)}` : ""}`);
        },
    });
    return { lines, remove };
}

afterEach(() => {
    scrubber.clear();
});

describe("scrubber", () => {
    describe("register / unregister", () => {
        it("registers values longer than 4 chars", () => {
            scrubber.register("my-secret-value");
            expect(scrubber.get_values().has("my-secret-value")).toBe(true);
        });

        it("skips values shorter than 4 chars", () => {
            scrubber.register("ab");
            expect(scrubber.get_values().has("ab")).toBe(false);
        });

        it("skips empty string", () => {
            scrubber.register("");
            expect(scrubber.get_values().size).toBe(0);
        });

        it("unregisters a previously registered value", () => {
            scrubber.register("secret-val");
            scrubber.unregister("secret-val");
            expect(scrubber.get_values().has("secret-val")).toBe(false);
        });

        it("stops accepting new values at MAX_SCRUB_VALUES (10000)", () => {
            for (let i = 0; i < 10005; i++) {
                scrubber.register(`val-${String(i).padStart(5, "0")}-secret`);
            }
            expect(scrubber.get_values().size).toBeLessThanOrEqual(10000);
            // Values registered after the limit should be ignored
            expect(scrubber.get_values().has("val-10004-secret")).toBe(false);
        });

        it("unregister is a no-op for unknown values", () => {
            expect(() => {
                scrubber.unregister("not-registered");
            }).not.toThrow();
        });

        it("skips values longer than the redaction limit and warns once", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            try {
                scrubber.register("x".repeat(9000));
                scrubber.register("y".repeat(9001));
                // 整页 DOM 快照这类超长值不参与脱敏（否则每次日志都要跑巨大交替匹配）。
                expect(scrubber.get_values().size).toBe(0);
                expect(warn).toHaveBeenCalledTimes(1);
            } finally {
                warn.mockRestore();
            }
        });

        it("still redacts long-but-plausible tokens", () => {
            const token = "t".repeat(2000);
            scrubber.register(token);
            expect(scrubber.get_values().has(token)).toBe(true);
            expect(scrubber.scrub_text(`token=${token}`)).toBe("token=***");
        });
    });

    describe("pattern grouping", () => {
        it("redacts values across internal pattern groups", () => {
            for (let i = 0; i < 620; i++) {
                scrubber.register(`grouped-value-${String(i).padStart(4, "0")}`);
            }
            expect(scrubber.scrub_text("grouped-value-0000 and grouped-value-0619")).toBe(
                "*** and ***",
            );
        });

        it("does not leak a longer credential matched by a shorter one", () => {
            scrubber.register("innerkey");
            scrubber.register("prefixinnerkeysuffix");
            // 逐个 pattern 依次替换会留下 `prefix***suffix`，等于泄露了凭据片段。
            expect(scrubber.scrub_text("token=prefixinnerkeysuffix")).toBe("token=***");
        });

        it("replaces every match when ranges overlap", () => {
            // 4 字符是注册下限，取 "abcd" 与 "abcdef" 构造前缀重叠。
            scrubber.register("abcd");
            scrubber.register("abcdef");
            expect(scrubber.scrub_text("abcd abcdef")).toBe("*** ***");
        });
    });

    describe("scrub_text", () => {
        it("replaces registered values with ***", () => {
            scrubber.register("super-secret");
            expect(scrubber.scrub_text("got super-secret here")).toBe("got *** here");
        });

        it("replaces multiple occurrences", () => {
            scrubber.register("abc123");
            expect(scrubber.scrub_text("abc123 and abc123 again")).toBe("*** and *** again");
        });

        it("replaces multiple registered values", () => {
            scrubber.register("secret-a");
            scrubber.register("secret-b");
            const result = scrubber.scrub_text("secret-a plus secret-b");
            expect(result).toBe("*** plus ***");
        });

        it("does not replace after unregister", () => {
            scrubber.register("gone-soon");
            expect(scrubber.scrub_text("gone-soon")).toBe("***");
            scrubber.unregister("gone-soon");
            expect(scrubber.scrub_text("gone-soon")).toBe("gone-soon");
        });

        it("returns text unchanged when no values registered", () => {
            expect(scrubber.scrub_text("plain text")).toBe("plain text");
        });

        it("handles regex special characters in registered values", () => {
            scrubber.register("key=abc&token=xyz");
            expect(scrubber.scrub_text("url key=abc&token=xyz end")).toBe("url *** end");
        });
    });

    describe("log output integration", () => {
        it("scrubs registered values from log messages", () => {
            setLogLevel("debug");
            scrubber.register("Bearer real-token-123");
            const { lines, remove } = capture_output();

            try {
                const log = createLogger("test");
                log.info("Authorization: Bearer real-token-123");
                expect(lines[0]).toContain("***");
                expect(lines.join("\n")).not.toContain("Bearer real-token-123");
            } finally {
                remove();
            }
        });

        it("scrubs registered values from meta objects", () => {
            setLogLevel("debug");
            scrubber.register("meta-secret-value");
            const { lines, remove } = capture_output();

            try {
                const log = createLogger("test");
                log.debug("request", { Authorization: "meta-secret-value" });
                const output = lines.join("\n");
                expect(output).not.toContain("meta-secret-value");
                expect(output).toContain("***");
            } finally {
                remove();
            }
        });

        it("scrubs nested meta values", () => {
            setLogLevel("debug");
            scrubber.register("deep-secret");
            const { lines, remove } = capture_output();

            try {
                const log = createLogger("test");
                log.debug("nested", { outer: { inner: "deep-secret" } });
                const output = lines.join("\n");
                expect(output).not.toContain("deep-secret");
                expect(output).toContain("***");
            } finally {
                remove();
            }
        });

        it("does not scrub unregistered values", () => {
            setLogLevel("debug");
            const { lines, remove } = capture_output();

            try {
                const log = createLogger("test");
                log.info("api_key=public-value");
                expect(lines[0]).toContain("api_key=public-value");
            } finally {
                remove();
            }
        });

        it("scrubs after late registration", () => {
            setLogLevel("debug");
            const { lines, remove } = capture_output();

            try {
                const log = createLogger("test");
                log.info("before secret-1234");
                scrubber.register("secret-1234");
                log.info("after secret-1234");
                expect(lines[0]).toContain("secret-1234");
                expect(lines[1]).not.toContain("secret-1234");
                expect(lines[1]).toContain("***");
            } finally {
                remove();
            }
        });
    });

    describe("clear", () => {
        it("removes all registered values", () => {
            scrubber.register("val-a");
            scrubber.register("val-b");
            scrubber.clear();
            expect(scrubber.get_values().size).toBe(0);
            expect(scrubber.scrub_text("val-a val-b")).toBe("val-a val-b");
        });
    });
});
