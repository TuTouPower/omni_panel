import { describe, expect, it, vi } from "vitest";
import { homedir } from "node:os";

vi.mock("electron", () => ({
    app: {
        getPath: vi.fn(() => "/mock/userData"),
        isPackaged: false,
    },
}));

import { build_token_stats_config } from "../../../../../src/main/core/token-stats/build-config";
import { getTokenStatsStatePath } from "../../../../../src/main/core/paths";

describe("build_token_stats_config（t396 AC-005）", () => {
    it("空 tokenStats 配置落到默认值（wsl 开启 + Ubuntu-22.04 + 10 分钟轮询）", () => {
        const config = build_token_stats_config({});

        expect(config.wsl_enabled).toBe(true);
        expect(config.wsl_distro).toBe("Ubuntu-22.04");
        expect(config.wsl_user).toBe("");
        expect(config.poll_interval_ms).toBe(10 * 60_000);
        expect(config.win_home).toBe(homedir());
        expect(config.state_path).toBe(getTokenStatsStatePath());
    });

    it("持久化值覆盖默认（wsl 关闭 + 自定义 distro/user/轮询）", () => {
        const config = build_token_stats_config({
            tokenStats: {
                wslEnabled: false,
                wslDistro: "Debian",
                wslUser: "dev",
                pollIntervalMinutes: 30,
            },
        });

        expect(config.wsl_enabled).toBe(false);
        expect(config.wsl_distro).toBe("Debian");
        expect(config.wsl_user).toBe("dev");
        expect(config.poll_interval_ms).toBe(30 * 60_000);
    });

    it("持久化值与默认值独立（部分字段缺省不影响其它字段默认）", () => {
        const config = build_token_stats_config({
            tokenStats: { pollIntervalMinutes: 5 },
        });

        expect(config.poll_interval_ms).toBe(5 * 60_000);
        expect(config.wsl_enabled).toBe(true);
        expect(config.wsl_user).toBe("");
    });
});
