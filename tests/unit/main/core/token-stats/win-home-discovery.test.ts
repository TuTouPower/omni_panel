import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
    discover_win_home,
    WIN_USERS_DIR,
    type WinHomeDiscoveryDeps,
} from "../../../../../src/main/core/token-stats/win-home-discovery";

/**
 * t438: Windows home 发现纯逻辑单测。全部走注入 deps，不碰真实 /mnt/c 与
 * powershell.exe。发现顺序（s033/d049）：枚举剔除系统项 → 标记过滤 → 唯一
 * 候选 / 多候选标记最多（并列字典序首）→ shell 回退 → 全失败 null。
 */

/** 造 deps：users 为枚举结果；markers_by_user 声明各用户存在的标记目录；
 *  existing_homes 声明存在的用户 home 目录（shell 回退路径校验用）。 */
function deps(
    users: string[],
    markers_by_user: Record<string, string[]> = {},
    exec_result = "",
    existing_homes: string[] = [],
): WinHomeDiscoveryDeps {
    const existing = new Set<string>(existing_homes);
    for (const [user, markers] of Object.entries(markers_by_user)) {
        for (const marker of markers) {
            existing.add(join(WIN_USERS_DIR, user, marker));
        }
    }
    return {
        list_dirs: () => users,
        dir_exists: (p) => existing.has(p),
        exec_windows: () => exec_result,
    };
}

describe("discover_win_home (t438)", () => {
    it("① /mnt/c/Users 不可枚举 → null", () => {
        expect(discover_win_home(deps([]))).toBeNull();
    });

    it("② 唯一候选即用", () => {
        const d = deps(["All Users", "Default", "Default User", "Public", "TestUser"], {
            TestUser: [".kimi-code", ".claude"],
        });
        expect(discover_win_home(d)).toBe("/mnt/c/Users/TestUser");
    });

    it("系统项（All Users/Default/Default User/Public）不参与候选", () => {
        // 即使系统项带标记目录也不选（它们不是真实用户目录）。
        const d = deps(["All Users", "Public", "Default", "Default User", "TestUser"], {
            "All Users": [".claude"],
            Public: [".grok"],
            Default: [".kimi-code"],
            "Default User": [".local/share/opencode"],
            TestUser: [".kimi-code"],
        });
        expect(discover_win_home(d)).toBe("/mnt/c/Users/TestUser");
    });

    it("③ 多候选取标记最多者", () => {
        const d = deps(["a_less", "b_more", "no_marker"], {
            a_less: [".claude"],
            b_more: [".claude", ".kimi-code", ".grok"],
            // no_marker 无标记 → 不计入候选。
        });
        expect(discover_win_home(d)).toBe("/mnt/c/Users/b_more");
    });

    it("③ 并列标记数取字典序首", () => {
        const d = deps(["zeta", "alpha", "mid"], {
            zeta: [".claude", ".kimi-code"],
            alpha: [".claude", ".grok"],
            mid: [".claude", ".kimi-code"],
        });
        expect(discover_win_home(d)).toBe("/mnt/c/Users/alpha");
    });

    it("④ 零候选回退 shell 探测 $env:USERPROFILE（含 CRLF 与尾部空白）", () => {
        const d = deps(["All Users", "Default", "Public"], {}, "C:\\Users\\TestUser\r\n", [
            "/mnt/c/Users/TestUser",
        ]);
        expect(discover_win_home(d)).toBe("/mnt/c/Users/TestUser");
    });

    it("④ shell 返回小写盘符也转换", () => {
        // 枚举非空但零候选（仅系统项）→ 走 shell 回退；小写盘符也转换。
        const d = deps(["All Users", "Default"], {}, "c:\\users\\testuser", ["/mnt/c/users/testuser"]);
        expect(discover_win_home(d)).toBe("/mnt/c/users/testuser");
    });

    it("④ shell 回退路径不存在 → null", () => {
        // exec 返回 C:\Users\Ghost 但 dir_exists 校验失败（未声明该路径存在）。
        const d = deps([], {}, "C:\\Users\\Ghost");
        expect(discover_win_home(d)).toBeNull();
    });

    it("⑤ shell 也失败（exec 返回空）→ null", () => {
        expect(discover_win_home(deps([]))).toBeNull();
        // 枚举有普通用户但零标记、exec 失败。
        expect(discover_win_home(deps(["someone"], {}, ""))).toBeNull();
        // 枚举为空视为不可枚举（/mnt/c/Users 真实场景不会空），不走 shell 回退。
        expect(discover_win_home(deps([], {}, "C:\\Users\\TestUser\r\n"))).toBeNull();
    });

    it("⑤ shell 输出非 C:\\Users\\X 形式 → null", () => {
        expect(discover_win_home(deps(["All Users"], {}, "\\\\server\\share"))).toBeNull();
        expect(discover_win_home(deps(["All Users"], {}, "not-a-windows-path"))).toBeNull();
    });
});
