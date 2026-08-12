import { describe, expect, it } from "vitest";
import {
    claude_costs_path,
    claude_projects_path,
    grok_sessions_path,
    host_from_platform,
    kimi_index_path,
    kimi_sessions_path,
    opencode_path,
    type TokenStatsPathInput,
} from "../../../../../src/main/core/token-stats/paths";
import {
    tokenStatsDashboardPlatformSchema,
    tokenStatsEnvSchema,
} from "../../../../../src/shared/types/token-stats";

const WIN_HOME = "C:\\Users\\Test";

function input(overrides: Partial<TokenStatsPathInput> = {}): TokenStatsPathInput {
    return {
        host: "linux",
        homedir: "/home/test",
        win_home: WIN_HOME,
        wsl_distro: "Ubuntu-22.04",
        wsl_user: "karon",
        ...overrides,
    };
}

describe("host_from_platform", () => {
    it("maps process.platform values to Host", () => {
        expect(host_from_platform("win32")).toBe("windows");
        expect(host_from_platform("darwin")).toBe("macos");
        expect(host_from_platform("linux")).toBe("linux");
        expect(host_from_platform("freebsd")).toBe("linux");
    });
});

describe("local sources on non-Windows hosts (AC-001)", () => {
    it("builds POSIX paths from homedir on linux", () => {
        const ctx = input({ host: "linux", homedir: "/home/test" });
        expect(claude_costs_path(ctx, "local")).toBe("/home/test/.claude/metrics/costs.jsonl");
        expect(claude_projects_path(ctx, "local")).toBe("/home/test/.claude/projects");
        expect(opencode_path(ctx, "local")).toBe("/home/test/.local/share/opencode/opencode.db");
        expect(kimi_sessions_path(ctx, "local")).toBe("/home/test/.kimi-code/sessions");
        expect(kimi_index_path(ctx, "local")).toBe("/home/test/.kimi-code/session_index.jsonl");
    });

    it("builds POSIX paths from homedir on macos", () => {
        const ctx = input({ host: "macos", homedir: "/Users/test" });
        expect(claude_costs_path(ctx, "local")).toBe("/Users/test/.claude/metrics/costs.jsonl");
        expect(opencode_path(ctx, "local")).toBe("/Users/test/.local/share/opencode/opencode.db");
    });

    it("returns null for wsl sources on non-Windows hosts", () => {
        for (const host of ["linux", "macos"] as const) {
            const ctx = input({ host });
            expect(claude_costs_path(ctx, "wsl")).toBeNull();
            expect(claude_projects_path(ctx, "wsl")).toBeNull();
            expect(opencode_path(ctx, "wsl")).toBeNull();
            expect(kimi_sessions_path(ctx, "wsl")).toBeNull();
            expect(kimi_index_path(ctx, "wsl")).toBeNull();
            expect(grok_sessions_path(ctx, "wsl")).toBeNull();
        }
    });
});

describe("windows host (AC-002)", () => {
    it("builds local paths from win_home", () => {
        const ctx = input({ host: "windows" });
        expect(claude_costs_path(ctx, "local")).toBe(
            "C:\\Users\\Test\\.claude\\metrics\\costs.jsonl",
        );
        expect(claude_projects_path(ctx, "local")).toBe("C:\\Users\\Test\\.claude\\projects");
        expect(opencode_path(ctx, "local")).toBe(
            "C:\\Users\\Test\\.local\\share\\opencode\\opencode.db",
        );
        expect(kimi_sessions_path(ctx, "local")).toBe("C:\\Users\\Test\\.kimi-code\\sessions");
        expect(kimi_index_path(ctx, "local")).toBe(
            "C:\\Users\\Test\\.kimi-code\\session_index.jsonl",
        );
    });

    it("builds \\\\wsl.localhost UNC paths for wsl sources", () => {
        const ctx = input({ host: "windows" });
        expect(claude_costs_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.claude\\metrics\\costs.jsonl",
        );
        expect(claude_projects_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.claude\\projects",
        );
        expect(opencode_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.local\\share\\opencode\\opencode.db",
        );
        expect(kimi_sessions_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.kimi-code\\sessions",
        );
        expect(kimi_index_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.kimi-code\\session_index.jsonl",
        );
        expect(grok_sessions_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.grok\\sessions",
        );
    });
});

describe("undetectable wsl_user on windows host (AC-003)", () => {
    it("returns null instead of building a username-less UNC path", () => {
        const ctx = input({ host: "windows", wsl_user: "" });
        expect(claude_costs_path(ctx, "wsl")).toBeNull();
        expect(claude_projects_path(ctx, "wsl")).toBeNull();
        expect(opencode_path(ctx, "wsl")).toBeNull();
        expect(kimi_sessions_path(ctx, "wsl")).toBeNull();
        expect(kimi_index_path(ctx, "wsl")).toBeNull();
        expect(grok_sessions_path(ctx, "wsl")).toBeNull();
    });
});

describe("grok", () => {
    it("resolves local env to the home .grok/sessions path (AC-001 example)", () => {
        expect(grok_sessions_path(input({ host: "linux", homedir: "/home/test" }), "local")).toBe(
            "/home/test/.grok/sessions",
        );
        expect(grok_sessions_path(input({ host: "windows" }), "local")).toBe(
            "C:\\Users\\Test\\.grok\\sessions",
        );
    });
});

describe("TokenStatsEnv / dashboard platform schemas (AC-004)", () => {
    it("accepts only local|wsl", () => {
        expect(tokenStatsEnvSchema.options).toEqual(["local", "wsl"]);
        expect(tokenStatsEnvSchema.safeParse("win").success).toBe(false);
        expect(tokenStatsEnvSchema.safeParse("local").success).toBe(true);
        expect(tokenStatsEnvSchema.safeParse("wsl").success).toBe(true);
    });

    it("dashboard platform schema keeps all|local|wsl in sync", () => {
        expect(tokenStatsDashboardPlatformSchema.options).toEqual(["all", "local", "wsl"]);
        expect(tokenStatsDashboardPlatformSchema.safeParse("win").success).toBe(false);
        expect(tokenStatsDashboardPlatformSchema.safeParse("local").success).toBe(true);
    });
});

describe("no win env literal remains in collector/ipc/readers (AC-004)", () => {
    it("scans src for win env literal", async () => {
        const path = await import("node:path");
        const fs = await import("node:fs");
        const files = [
            "src/main/core/token-stats/collector.ts",
            "src/main/core/token-stats/claude-reader.ts",
            "src/main/core/token-stats/opencode-reader.ts",
            "src/main/core/token-stats/kimi-reader.ts",
            "src/main/core/token-stats/grok-reader.ts",
            "src/main/core/token-stats/query-dispatcher.ts",
            "src/main/core/token-stats/query-worker.ts",
            "src/main/core/token-stats/reader-utils.ts",
            "src/main/core/token-stats/manager.ts",
            "src/main/core/token-stats/scan-state.ts",
            "src/main/core/token-stats/paths.ts",
            "src/main/ipc/token-stats-ipc.ts",
        ];
        const root = path.resolve(import.meta.dirname, "../../../../../");
        // 覆盖 env: "win" / env = "win" / env === "win" / env !== "win" 等写法。
        const literal = /env\s*(?::|={1,3}|!==|!=)\s*["']win["']/;
        for (const f of files) {
            const content = fs.readFileSync(path.join(root, f), "utf8");
            expect(content, `${f} contains env win literal`).not.toMatch(literal);
        }
    });
});
