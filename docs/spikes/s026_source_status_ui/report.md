# Spike report

## 问题

面板源状态展示的具体 UI 形态（标记位置/文案）——t309 在现有 renderer token-stats 视图内实现源级状态可见性。

## 成功判据

- 确认状态数据流：collector → postMessage → 主进程 → IPC → renderer，源状态能随 `TokenStatsUpdate` 同步。
- 确认面板现有状态展示点（新鲜度 `updatedAgo`）与可挂载位置。

## 尝试

- 代码探查（只读）：
    - `src/main/core/token-stats/collector.ts`：`forward_log(level, module, message)` 经 postMessage 转发 warn/error 至主进程 logger（72-89 行），现有 grok 缺失已有 `grok_missing_warned` 去重 warn。
    - `src/main/ipc/token-stats-ipc.ts`：`TOKEN_STATS_STATUS` 返回 `{ running, last_updated }`（146-153 行）；dashboard DTO 含 `status.running/last_updated`（129-132 行）。
    - `src/renderer/views/TokenStatsView.tsx`：新鲜度展示在 `updatedAgo`（260-263 行）+ 656 行附近 status 区；源状态标记可挂载该区。
    - 类型 `src/shared/types/token-stats.ts`：`TokenStatsUpdate` 含 sessions/daily/records，源状态数组为新增字段（非破坏性）。

## 证据

- 状态流链路完整：collector（utilityProcess）→ postMessage → manager → store.last_updated → IPC（status/dashboard）→ renderer。
- 面板已有 status 区（running + last_updated 新鲜度），源级状态标记作为同区扩展，不动数据面板布局。
- `TokenStatsUpdate` 增加 `sources_status` 数组字段兼容既有消费方（仅新增，不删除字段）。

## 结论

- UI 形态：面板 status 区（新鲜度旁）渲染源状态列表——`ok` 不显示额外标记（正常源行为不变）；`unavailable`/`failed` 显示原因文本标记（含 source/env）。renderer 单测断言状态元素存在与文案；视觉像素细节留人工。
- 状态数据流：collector 每轮产出源状态数组，随 `TokenStatsUpdate` 上抛；主进程透传至 store/IPC；面板经 dashboard/status 查询读取。
- 实现路径：collector `sources[]` 声明式（hosts 数据化 + 过滤）+ 每轮产出 `{source,env,status,lastError}`；`TokenStatsUpdate` 新增字段；renderer status 区渲染。
