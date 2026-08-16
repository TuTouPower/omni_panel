# p192 会话库 grok 会话不全：Linux 宿主从不采集 ~/.grok/sessions

- 现象：期望会话库列出磁盘上全部（含当日）grok 会话；实际在 **Linux/WSL 宿主** 上 grok 列表停在旧数据。复现（2026-08-16）：磁盘 `~/.grok/sessions/**/updates.jsonl` 当日 39 个，库内 `token_stats_sessions` source=grok 当日 0 条，全库 max(ended_at)=2026-08-08。
- 影响：会话库 / 最近会话 / 依赖 `query_sessions` 的 grok 列表与统计增量在 **linux/macos 本机** 上不更新；Windows 宿主经 UNC 读 WSL 的 `grok_wsl` 路径不受本 bug 影响。
- 根因（产品缺陷）：
    1. 声明式源清单仅有 `grok_wsl`（`hosts: WSL_HOSTS` = `["windows"]`），**无** `grok_local`（`LOCAL_HOSTS`）。Linux 宿主 `collector_host=linux` 永不调度 grok 采集。
    2. `collector.grok_sessions_path` **写死** `env: "wsl"`；`paths.wsl_root` 在 `host !== "windows"` 时返回 `null`，即便误开源也会 path unavailable。
    3. 会话库列表来自 `tokenStatsStore.query_sessions`（非直接扫盘），故采集停则列表旧。
    - 分类：产品缺陷
    - 已确认同类位点：
        - `src/main/core/token-stats/collector.ts`：`SOURCES` 仅 `grok_wsl` + `hosts: WSL_HOSTS`
        - `src/main/core/token-stats/collector.ts`：`grok_sessions_path` 固定 `"wsl"`
        - `src/main/core/token-stats/paths.ts`：`wsl_root` 非 Windows 恒 null；注释写 grok path 层可 local，但 collector 未挂 local 源
    - 已扫无其它「数据在 ~/. 却仅 WSL_HOSTS」的 source：claude/kimi/opencode 均有 `*_local` + LOCAL_HOSTS；**仅 grok 缺 local**。
    - 对称不成立：会话打开路径 `session-locator` resolve_grok 按 env 可到 `~/.grok/sessions`（列表不全与「点开已知 id」可分开）。
- 测试缺口：无断言「host=linux 时采集 `~/.grok/sessions` / 产出 grok+local 会话」；现有 t197/t309 固定「grok 仅 WSL」口径，未覆盖「应用跑在 WSL 本机 Linux」场景。补测：paths `local` 解析 `~/.grok/sessions`；collector source 清单 linux 含 grok_local；fixture 目录扫描 → store/query_sessions 含新 session_id。
- 线索：`.scratch/bug_grok_sessions_20260816/evidence.txt`
- 处理：已立项 t426_grok_local_collect_linux（backlog）
