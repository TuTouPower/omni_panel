# 已闭环待办历史

由 `tasks-run` 收尾或 `repo-hygiene` 从 `docs/pending.md` 整条迁入。**只追加**，禁止截断、删除、改号或改写已归档条目。本文件 H3 编号仍属全局 `pNNN` 分配历史，`scripts/pending.py next` 会扫描所有本地分支 git 树 + 所有 worktree 工作区的 `docs/pending.md` 与 `docs/archive/pending.md`。

本文件只收录闭环条目；`docs/pending.md`「不办」节条目（`- 处理：不办`）属暂搁而非闭环，保留在主总账，不迁入本文件。

## 已处理待办

### p010 热力图周六（或宽窗口早期 weekday）整列空白（2026-07-31 发现）

- 现象：token-stats 热力图（weekday×hour）在 >=7d 窗口下，某些 weekday 整列零数据（用户观察到周六全空）。期望：窗口内出现的每个 weekday 列按实际数据着色。
- 影响：热力图失真，低活动日（数据量小的 weekday）在宽窗口下尤易整体消失；用户误判「周六从不用」。
- 根因：`TokenStatsView` 给热力图喂的是 `records`（`token_stats_records`），后端 `query_records` 用 `ORDER BY timestamp DESC LIMIT @limit`（宽窗口 limit=100000）。7d 窗口实际 ~14 万行超 limit，按时间倒序截断后丢弃最早的几天；若窗口内某 weekday 仅出现在被截断的早期日期（如本周六 2026-07-25 在 7-26 之前），该列整体空白。t162/t164 已把 >=7d 柱图改走 `buckets`（无截断），但**热力图仍走 records + LIMIT，未一并迁移**。分类：产品缺陷（数据源选择 + LIMIT 截断未覆盖热力图路径）。
- 测试缺口：`tests/unit/renderer/lib/token-stats/chart-data.test.ts` 测了 `prepareHeatmapData` 的 weekday/hour 映射，但用小数据集，未覆盖「records 因 LIMIT 截断致某 weekday 整列缺失」；无「窗口内出现的 weekday 必须有着色」断言。后端 `token-stats-store` 的 `query_records` LIMIT 行为也缺「宽窗口截断会丢早期日期」的回归。补测方向：(1) renderer 端加用例构造跨多 weekday 的 records，断言热力图每个窗口内 weekday 有数据；(2) 集成层断言 7d 窗口 records 行数与 LIMIT 关系、或改走 buckets 后热力图正确性。
- 线索：`.scratch/probe_heatmap.mjs`（查 observations.sqlite 证实 7d 窗口 LIMIT 100000 仅覆盖 2026-07-26T06:36 之后，本周六 7-25 数据全被丢）。
- 处理：t170

### p011 grok 网络故障被呈现为「已过期」，用户 logout 后无法重登（2026-07-31）

- 现象：期望——采集失败区分网络错误与凭证失效，网络恢复后自愈；实际——2026-07-31 07:19 起 `cli-chat-proxy.grok.com` 连接超时（请求挂起约 10.6s 无响应），poll 失败 → 历史观测标 stale → 卡片/账号行显示「已过期」+「采集失败」+「重新登录」。用户在设置里退出登录后尝试重登，device-code `login_start` 连接 `auth.x.ai` 超时失败（DNS 被污染，解析到 Facebook IP `2a03:2880:...:face:b00c...` / `31.13.90.33`），token 已被清空，之后 poll 一律 401，面板持续显示「已过期」。复现：断开/污染到 xAI 域名的网络让 grok poll 超时 → 观测标 stale → UI 呈现与凭证失效不可区分。
- 影响：grok 连接器用量展示；所有 OAuth poll 型连接器在网络抖动时都可能被误呈现为凭证失效，诱导破坏性 re-login（logout 清 token 不可逆）。
- 根因：环境问题为主 + 产品设计弱点。环境：本机到 xAI/Grok 域名不通（`auth.x.ai` DNS 污染；`cli-chat-proxy.grok.com` 连接超时）。产品：`ProviderAccountRow.tsx` 对任意 error 显示「重新登录」，不像卡片失败态用 `is_auth_error` 门控；refresh-service 对 OAuth（poll）连接器收到 401 无即时 `refresh_now` 兜底（自动重登仅 session 连接器）；「已过期」badge 语义是数据 stale，文案读作凭证过期。
- 测试缺口：现有测试只覆盖 auth 错误路径的 UI 状态，未覆盖「网络超时 → stale → 账号行 badge/按钮」组合断言；缺 refresh-service 对 OAuth 连接器 401/超时行为的集成测试。补测方向：renderer 层断言非 auth error 不显示「重新登录」；集成层覆盖 OAuth 连接器超时/401 的 stale 标记与恢复路径。
- 线索：`.scratch/grok-expired-2026-07-31/notes.md`；运行日志 `~/AppData/Roaming/OmniPanel/logs/app-2026-07-31.log`（07:19 首次超时、09:23:52 logout、09:23:59 login_start Connect Timeout、12:29:02 401）
- 处理：t172

### p013 门禁基线红：format:check archive 文档 + knip 未用文件（2026-07-31）

- 来源：t172 顺手发现
- 内容：`pnpm format:check` 全局失败，约 30 个 `docs/archive/tasks/*/` 文档/脚本未过 prettier；`pnpm deadcode`（knip）报 3 个未用文件（`src/renderer/components/add_account/AuthPlaceholder.tsx`、`src/renderer/hooks/useGrokDeviceLogin.ts`、`src/renderer/hooks/useKimiDeviceLogin.ts`）。两者主仓同样报，为存量基线非本次引入。
- 处理：手动修复（2026-07-31）——archive 文档跑 prettier --write；3 个未用文件 git rm；`pnpm format:check` / `pnpm deadcode` 均转绿。

### p012 config-store 并发保存测试疑似 flaky（2026-07-31）

- 来源：t171 黑盒（顺手发现）
- 内容：`tests/integration/config/config-store.test.ts > serializes concurrent saves so final state is consistent` 在 t171 worktree 首次 `pnpm test` 失败、单独重跑即过，疑似时序敏感 flaky。与本 task 改动无关（未碰 config-store）。需复查是否真 flaky 或存在并发断言过弱。
- 处理：手动修复（2026-07-31）——复查确认无并发竞态（`enqueueSave` 串行链严格），失败为 Windows `rename(tmp → config.json)` 覆盖已存在目标时偶发 `EPERM`（目标被短暂句柄锁，如 Defender 扫描），单独重跑即过印证环境瞬态。`writeFileAtomic` 对 rename 的瞬态 EPERM/EBUSY/EACCES 加有限重试（3 次递增间隔）；补 `tests/unit/core/storage/write-json.test.ts` 两用例（瞬态 EPERM 重试成功、耗尽后仍抛）。config-store 21 测试 + write-json 4 测试全绿。
