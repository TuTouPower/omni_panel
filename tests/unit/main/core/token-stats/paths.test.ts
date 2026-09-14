import { describe, expect, it } from "vitest";
import {
    claude_costs_path,
    claude_projects_path,
    commandcode_projects_path,
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
        wsl_user: "testuser",
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

describe("platform sources: linux/mac resolve under homedir (t437)", () => {
    it("builds POSIX paths from homedir for env=linux", () => {
        const ctx = input({ host: "linux", homedir: "/home/test" });
        expect(claude_costs_path(ctx, "linux")).toBe("/home/test/.claude/metrics/costs.jsonl");
        expect(claude_projects_path(ctx, "linux")).toBe("/home/test/.claude/projects");
        expect(opencode_path(ctx, "linux")).toBe("/home/test/.local/share/opencode/opencode.db");
        expect(kimi_sessions_path(ctx, "linux")).toBe("/home/test/.kimi-code/sessions");
        expect(kimi_index_path(ctx, "linux")).toBe("/home/test/.kimi-code/session_index.jsonl");
        expect(commandcode_projects_path(ctx, "linux")).toBe("/home/test/.commandcode/projects");
    });

    it("builds POSIX paths from homedir for env=mac", () => {
        const ctx = input({ host: "macos", homedir: "/Users/test" });
        expect(claude_costs_path(ctx, "mac")).toBe("/Users/test/.claude/metrics/costs.jsonl");
        expect(opencode_path(ctx, "mac")).toBe("/Users/test/.local/share/opencode/opencode.db");
        expect(commandcode_projects_path(ctx, "mac")).toBe("/Users/test/.commandcode/projects");
        expect(commandcode_projects_path(input({ host: "windows" }), "win")).toBeNull();
        expect(commandcode_projects_path(input({ host: "windows" }), "wsl")).toBeNull();
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
    it("builds env=win paths from win_home", () => {
        const ctx = input({ host: "windows" });
        expect(claude_costs_path(ctx, "win")).toBe(
            "C:\\Users\\Test\\.claude\\metrics\\costs.jsonl",
        );
        expect(claude_projects_path(ctx, "win")).toBe("C:\\Users\\Test\\.claude\\projects");
        expect(opencode_path(ctx, "win")).toBe(
            "C:\\Users\\Test\\.local\\share\\opencode\\opencode.db",
        );
        expect(kimi_sessions_path(ctx, "win")).toBe("C:\\Users\\Test\\.kimi-code\\sessions");
        expect(kimi_index_path(ctx, "win")).toBe(
            "C:\\Users\\Test\\.kimi-code\\session_index.jsonl",
        );
    });

    it("builds \\\\wsl.localhost UNC paths for wsl sources", () => {
        const ctx = input({ host: "windows" });
        expect(claude_costs_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.claude\\metrics\\costs.jsonl",
        );
        expect(claude_projects_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.claude\\projects",
        );
        expect(opencode_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.local\\share\\opencode\\opencode.db",
        );
        expect(kimi_sessions_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.kimi-code\\sessions",
        );
        expect(kimi_index_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.kimi-code\\session_index.jsonl",
        );
        expect(grok_sessions_path(ctx, "wsl")).toBe(
            "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.grok\\sessions",
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
    it("resolves platform envs to the home .grok/sessions path (t426)", () => {
        expect(grok_sessions_path(input({ host: "linux", homedir: "/home/test" }), "linux")).toBe(
            "/home/test/.grok/sessions",
        );
        expect(grok_sessions_path(input({ host: "windows" }), "win")).toBe(
            "C:\\Users\\Test\\.grok\\sessions",
        );
    });
});

describe("t438: env=win on non-Windows hosts", () => {
    const WIN_WSL_HOME = "/mnt/c/Users/TestUser";

    it("linux host + win_home_wsl → POSIX paths under the discovered home", () => {
        const ctx = input({ host: "linux", win_home_wsl: WIN_WSL_HOME });
        expect(claude_costs_path(ctx, "win")).toBe(
            "/mnt/c/Users/TestUser/.claude/metrics/costs.jsonl",
        );
        expect(claude_projects_path(ctx, "win")).toBe("/mnt/c/Users/TestUser/.claude/projects");
        expect(opencode_path(ctx, "win")).toBe(
            "/mnt/c/Users/TestUser/.local/share/opencode/opencode.db",
        );
        expect(kimi_sessions_path(ctx, "win")).toBe("/mnt/c/Users/TestUser/.kimi-code/sessions");
        expect(kimi_index_path(ctx, "win")).toBe(
            "/mnt/c/Users/TestUser/.kimi-code/session_index.jsonl",
        );
        expect(grok_sessions_path(ctx, "win")).toBe("/mnt/c/Users/TestUser/.grok/sessions");
    });

    it("linux host + win_home_wsl null/undefined → null (undiscoverable)", () => {
        // null：显式不可发现。
        const null_ctx = input({ host: "linux", win_home_wsl: null });
        expect(claude_costs_path(null_ctx, "win")).toBeNull();
        // undefined（未提供字段）：同样视为未发现。
        const undef_ctx: TokenStatsPathInput = {
            host: "linux",
            homedir: "/home/test",
            win_home: WIN_HOME,
            wsl_distro: "Ubuntu-22.04",
            wsl_user: "testuser",
        };
        expect(claude_costs_path(undef_ctx, "win")).toBeNull();
        for (const ctx of [null_ctx, undef_ctx]) {
            expect(claude_projects_path(ctx, "win")).toBeNull();
            expect(opencode_path(ctx, "win")).toBeNull();
            expect(kimi_sessions_path(ctx, "win")).toBeNull();
            expect(kimi_index_path(ctx, "win")).toBeNull();
            expect(grok_sessions_path(ctx, "win")).toBeNull();
        }
    });

    it("macos host env=win → null even with win_home_wsl set", () => {
        const ctx = input({ host: "macos", win_home_wsl: WIN_WSL_HOME });
        expect(claude_costs_path(ctx, "win")).toBeNull();
        expect(kimi_sessions_path(ctx, "win")).toBeNull();
        expect(grok_sessions_path(ctx, "win")).toBeNull();
    });

    it("windows host ignores win_home_wsl (resolves from win_home)", () => {
        const ctx = input({ host: "windows", win_home_wsl: WIN_WSL_HOME });
        expect(claude_costs_path(ctx, "win")).toBe(
            "C:\\Users\\Test\\.claude\\metrics\\costs.jsonl",
        );
        expect(kimi_sessions_path(ctx, "win")).toBe("C:\\Users\\Test\\.kimi-code\\sessions");
    });
});

describe("TokenStatsEnv / dashboard platform schemas (AC-004/t437)", () => {
    it("accepts only win|wsl|linux|mac", () => {
        expect(tokenStatsEnvSchema.options).toEqual(["win", "wsl", "linux", "mac"]);
        for (const env of ["win", "wsl", "linux", "mac"]) {
            expect(tokenStatsEnvSchema.safeParse(env).success).toBe(true);
        }
        expect(tokenStatsEnvSchema.safeParse("local").success).toBe(false);
    });

    it("dashboard platform schema keeps all|win|wsl|linux|mac in sync", () => {
        expect(tokenStatsDashboardPlatformSchema.options).toEqual([
            "all",
            "win",
            "wsl",
            "linux",
            "mac",
        ]);
        expect(tokenStatsDashboardPlatformSchema.safeParse("local").success).toBe(false);
        expect(tokenStatsDashboardPlatformSchema.safeParse("win").success).toBe(true);
    });
});

describe("no local env literal remains in collector/ipc/readers (t437 AC-005)", () => {
    it("scans src for the removed local env literal", async () => {
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
        // 覆盖 env: "local" / env = "local" / env === "local" / env !== "local" 等写法。
        const literal = /env\s*(?::|={1,3}|!==|!=)\s*["']local["']/;
        for (const f of files) {
            const content = fs.readFileSync(path.join(root, f), "utf8");
            expect(content, `${f} contains env local literal`).not.toMatch(literal);
        }
    });
});
