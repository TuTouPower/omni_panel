import { homedir } from "node:os";
import type { AppConfiguration } from "../../../shared/types/config";
import type { TokenStatsConfig } from "../../../shared/types/token-stats";
import { getTokenStatsStatePath } from "../paths";

/** 构建 token-stats collector 配置（t396 AC-005 抽导出，t379 内联闭包去壳）。
 *  wsl/poll 各字段默认值 + 持久化值分支在此单一收敛，可被单测直接覆盖。 */
export function build_token_stats_config(
    cfg: Pick<AppConfiguration, "tokenStats">,
): TokenStatsConfig {
    return {
        win_home: homedir(),
        // WSL 默认开启：无 WSL 的机器上 UNC 读取会静默失败（reader 已容错）
        wsl_enabled: cfg.tokenStats?.wslEnabled ?? true,
        wsl_distro: cfg.tokenStats?.wslDistro ?? "Ubuntu-22.04",
        wsl_user: cfg.tokenStats?.wslUser ?? "", // 空 = collector 自动探测
        poll_interval_ms: (cfg.tokenStats?.pollIntervalMinutes ?? 10) * 60_000,
        state_path: getTokenStatsStatePath(),
    };
}
