import * as path from "node:path";
import type { TokenStatsEnv } from "../../../shared/types/token-stats";

/**
 * Platform-aware path layer for token-stats collectors (t308, t437).
 *
 * Path resolution is a pure function of `(host, env, cfg)` — no hidden
 * process.platform or os.homedir reads, no filesystem access — so every host
 * combination is testable on any machine. `host` is derived from
 * process.platform by the caller (see `host_from_platform`); `homedir` feeds
 * `linux`/`mac` sources, `win_home` feeds `win`, and `wsl_user` is the
 * *effective* WSL user (config override or auto-detected by the collector):
 * empty means undetectable, so every `wsl` path resolves to null instead of a
 * username-less UNC (finding d033).
 *
 * env semantics (t437, replaces the pre-t437 `local`): `win` = Windows user
 * directory data; `linux`/`mac` = the POSIX home on the respective host;
 * `wsl` = the WSL distro reachable via the \\wsl.localhost UNC share — Windows
 * host only.
 */

/** Host the collector runs on. */
export type Host = "windows" | "linux" | "macos";

/** Map a Node platform string (process.platform) to a Host. Unknown → linux. */
export function host_from_platform(platform: string): Host {
    switch (platform) {
        case "win32":
            return "windows";
        case "darwin":
            return "macos";
        default:
            return "linux";
    }
}

/** All inputs the path layer needs; injected so tests cover all hosts. */
export interface TokenStatsPathInput {
    host: Host;
    /** os.homedir(); base for `linux`/`mac` sources. */
    homedir: string;
    /** TokenStatsConfig.win_home; base for `win` sources. */
    win_home: string;
    /** TokenStatsConfig.wsl_distro; distro segment of the UNC path. */
    wsl_distro: string;
    /** Effective WSL user; "" = undetectable → wsl sources return null. */
    wsl_user: string;
}

/** UNC root \\wsl.localhost\<distro>\home\<user>, or null when unreachable. */
function wsl_root(input: TokenStatsPathInput): string | null {
    if (input.host !== "windows") {
        return null;
    }
    if (input.wsl_user === "") {
        return null;
    }
    return `\\\\wsl.localhost\\${input.wsl_distro}\\home\\${input.wsl_user}`;
}

/**
 * Resolve one source path. `win` resolves under win_home with win32 separators
 * (so UNC/win_home paths keep backslashes even when constructed on another
 * OS); `linux`/`mac` resolve under homedir with POSIX separators; `wsl`
 * resolves under the UNC root with win32 separators and returns null when the
 * root is unreachable.
 */
function resolve(
    input: TokenStatsPathInput,
    env: TokenStatsEnv,
    segments: string[],
): string | null {
    if (env === "win") {
        return path.win32.join(input.win_home, ...segments);
    }
    if (env === "linux" || env === "mac") {
        return path.posix.join(input.homedir, ...segments);
    }
    const root = wsl_root(input);
    return root === null ? null : path.win32.join(root, ...segments);
}

const CLAUDE_SEGMENTS = [".claude"];
const OPENCODE_SEGMENTS = [".local", "share", "opencode", "opencode.db"];
const KIMI_SEGMENTS = [".kimi-code"];

/** ~/.claude/metrics/costs.jsonl (or the win_home / UNC equivalent). */
export function claude_costs_path(input: TokenStatsPathInput, env: TokenStatsEnv): string | null {
    return resolve(input, env, [...CLAUDE_SEGMENTS, "metrics", "costs.jsonl"]);
}

/** ~/.claude/projects (or the win_home / UNC equivalent). */
export function claude_projects_path(
    input: TokenStatsPathInput,
    env: TokenStatsEnv,
): string | null {
    return resolve(input, env, [...CLAUDE_SEGMENTS, "projects"]);
}

/** ~/.local/share/opencode/opencode.db (or the win_home / UNC equivalent). */
export function opencode_path(input: TokenStatsPathInput, env: TokenStatsEnv): string | null {
    return resolve(input, env, OPENCODE_SEGMENTS);
}

/** ~/.kimi-code/sessions (or the win_home / UNC equivalent). */
export function kimi_sessions_path(input: TokenStatsPathInput, env: TokenStatsEnv): string | null {
    return resolve(input, env, [...KIMI_SEGMENTS, "sessions"]);
}

/** ~/.kimi-code/session_index.jsonl (or the win_home / UNC equivalent). */
export function kimi_index_path(input: TokenStatsPathInput, env: TokenStatsEnv): string | null {
    return resolve(input, env, [...KIMI_SEGMENTS, "session_index.jsonl"]);
}

/**
 * ~/.grok/sessions (or the win_home / UNC equivalent). Resolves both families
 * of envs: `linux`/`mac` = this host's own `~/.grok` (t426：Linux/mac 宿主采集
 * 源，Windows 上本地无 grok CLI 数据时目录缺失按 missing 处理）；`wsl` =
 * Windows 宿主经 UNC 读 WSL 内的 grok 数据（grok_wsl）。
 */
export function grok_sessions_path(input: TokenStatsPathInput, env: TokenStatsEnv): string | null {
    return resolve(input, env, [".grok", "sessions"]);
}
