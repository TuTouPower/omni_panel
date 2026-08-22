/**
 * Windows 用户 home 自动发现（t438）。
 *
 * 应用跑在 WSL/Linux 宿主时，把 Windows 侧 agent 数据（~/.claude、
 * ~/.kimi-code、~/.grok、~/.local/share/opencode 等）采成 env=win，与
 * Windows 宿主采 env=wsl 对称。零配置：路径完全由本模块自动发现，探测失败
 * 返回 null，由调用方按「win 源不可用」处理（AC-005），不崩溃。
 *
 * 纯逻辑：不直接碰 fs / 子进程——lister/exists/exec 全部注入，单测用桩覆盖
 * 每条分支，不依赖真实 /mnt/c（s033/d049 验证的发现顺序）。生产默认 deps
 * 见 default_win_home_deps（真实 readdir + powershell.exe）。
 *
 * 发现顺序（s033 spike，结论 d049）：
 *   1. `/mnt/c/Users` 不可枚举 → 未发现（null）。
 *   2. 枚举剔除系统项（All Users/Default/Default User/Public），候选 = 含任一
 *      agent 标记目录（.claude/.kimi-code/.grok/.local/share/opencode）的用户目录。
 *   3. 唯一候选即用；多候选取标记最多者（并列字典序首）；零候选回退 shell 探测
 *      `powershell.exe $env:USERPROFILE`（`C:\Users\X` → `/mnt/c/Users/X`，校验存在）。
 *   4. 全失败 → null。
 *
 * 发现结果由调用方进程内缓存（对齐 collector effective_wsl_user 模式）。
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import * as path from "node:path";

/** 发现模块注入的依赖；生产用 default_win_home_deps，测试注入桩。 */
export interface WinHomeDiscoveryDeps {
    /** 列目录下的子目录名；不可枚举返回 []（不抛）。 */
    list_dirs(dir: string): string[];
    /** 目录是否存在（agent 标记目录与探测结果校验用）。 */
    dir_exists(dir: string): boolean;
    /** 运行 Windows 命令并返回 stdout（失败返回 ""；不抛）。 */
    exec_windows(cmd: string): string;
    /**
     * 决策日志（t438 review f003）：多候选取舍、shell 回退采用/失败等关键
     * 分支时调用，便于排查误选用户；缺省不记录。
     */
    on_decision?: (message: string) => void;
}

/** WSL 挂载的 Windows 用户目录根。 */
export const WIN_USERS_DIR = "/mnt/c/Users";

/** 枚举时剔除的 Windows 系统项（非真实用户目录）。 */
const SYSTEM_ENTRIES = new Set(["All Users", "Default", "Default User", "Public"]);

/** 判定「该用户装了 agent」的标记目录（相对用户 home）。 */
const AGENT_MARKERS = [
    ".claude",
    ".kimi-code",
    ".grok",
    path.posix.join(".local", "share", "opencode"),
];

/** powershell 探测命令（USERPROFILE 仅 Windows 侧存在）。 */
const USERPROFILE_CMD = "$env:USERPROFILE";

/** 生产默认 deps：真实 readdir + powershell.exe。 */
export const default_win_home_deps: WinHomeDiscoveryDeps = {
    list_dirs: (dir) => {
        try {
            return readdirSync(dir, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name);
        } catch {
            return [];
        }
    },
    dir_exists: (dir) => {
        try {
            return statSync(dir).isDirectory();
        } catch {
            return false;
        }
    },
    exec_windows: (cmd) => {
        try {
            // t438 review f002：超时防护——powershell.exe 挂起不得阻塞主进程 /
            // collector 进程；超时按失败处理（返回 ""）。
            return execFileSync("powershell.exe", ["-NoProfile", "-Command", cmd], {
                encoding: "utf8",
                timeout: 5000,
            }).trim();
        } catch {
            return "";
        }
    },
};

/** 某用户目录下命中 agent 标记的数量。 */
function marker_count(deps: WinHomeDiscoveryDeps, user_dir: string): number {
    let count = 0;
    for (const marker of AGENT_MARKERS) {
        if (deps.dir_exists(path.posix.join(user_dir, marker))) {
            count += 1;
        }
    }
    return count;
}

/** Windows 路径（`C:\Users\X`）转 WSL POSIX 路径（`/mnt/c/Users/X`）；非该形式返回 null。 */
function wsl_path_of_windows_home(windows_home: string): string | null {
    const match = /^([A-Za-z]):\\(.+)$/.exec(windows_home.trim());
    if (match === null) return null;
    const drive = match[1] ?? "";
    const rest = match[2] ?? "";
    if (drive === "" || rest === "") return null;
    return `/mnt/${drive.toLowerCase()}/${rest.replace(/\\/g, "/")}`;
}

/**
 * 自动发现 Windows 用户 home，返回 `/mnt/c/Users/<u>` 形式 POSIX 路径；
 * 任何一步失败返回 null（不抛）。
 */
export function discover_win_home(deps: WinHomeDiscoveryDeps): string | null {
    const user_names = deps.list_dirs(WIN_USERS_DIR);
    if (user_names.length === 0) {
        return null;
    }

    const candidates: { user: string; markers: number }[] = [];
    for (const user of user_names) {
        if (SYSTEM_ENTRIES.has(user)) continue;
        const markers = marker_count(deps, path.posix.join(WIN_USERS_DIR, user));
        if (markers > 0) {
            candidates.push({ user, markers });
        }
    }

    // 唯一候选即用；多候选取标记最多者（并列字典序首）。
    const best = candidates[0];
    if (candidates.length === 1) {
        return best ? path.posix.join(WIN_USERS_DIR, best.user) : null;
    }
    if (candidates.length > 1) {
        candidates.sort((a, b) => b.markers - a.markers || a.user.localeCompare(b.user));
        const chosen = candidates[0];
        deps.on_decision?.(
            `win home discovery: ${String(candidates.length)} candidates ` +
                `(${candidates.map((c) => `${c.user}:${String(c.markers)}`).join(", ")}), ` +
                `picked ${chosen?.user ?? ""}`,
        );
        return path.posix.join(WIN_USERS_DIR, chosen?.user ?? "");
    }

    // 零候选：回退 shell 探测 $env:USERPROFILE，转换后校验存在。
    const profile = deps.exec_windows(USERPROFILE_CMD);
    const wsl_home = wsl_path_of_windows_home(profile);
    if (wsl_home === null || !deps.dir_exists(wsl_home)) {
        deps.on_decision?.(
            `win home discovery: no marker candidates, USERPROFILE probe ` +
                (profile === "" ? "failed" : `gave ${profile} (not usable)`),
        );
        return null;
    }
    deps.on_decision?.(`win home discovery: fell back to USERPROFILE probe → ${wsl_home}`);
    return wsl_home;
}
