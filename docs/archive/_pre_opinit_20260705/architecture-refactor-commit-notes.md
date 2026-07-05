# 架构重构提交说明

## 目标

把设置页从“账号 / 数据源”双视角改成单一“已添加”列表，并让 CPA 作为可展开连接呈现。

## 本次重构范围

### 架构层

- 建立 Observation 数据模型和 Zod schema，作为连接器观测结果的统一落点。
- 新增 SQLite observation store，用 append-only 记录替代旧 JSON 缓存。
- 新增 file-backed secrets vault，用本地文件和权限控制替代 `safeStorage` 依赖。
- 新增 connector manifest schema、loader、runtime、node vm sandbox fallback 和 host IO。
- 新增 connector net client 和 declarative poll executor，支持 endpoint override、auth 注入和代理。
- 将 scheduler 从 legacy plugin runtime 切到 connector runtime。
- 新增 local API ingest server 和 session login manager。
- 迁移 Tier 2 connector scripts，并对齐 IPC commands、UI freshness 展示和 connector packaging pipeline。
- 删除 legacy plugin runtime 相关代码。

### 设置页展示层

- 更新 `docs/omniusage-architecture-v2.md` §5.5.6：明确设置页只有一个“已添加”列表，不再分“账号区 / 数据源区”。
- 重写 `SettingsView` 的已添加页：每一行代表一个用户配置的连接。
- 删除旧的独立数据源视图代码：不再保留 `DataSourceList`、`CpaDetailPage`、`datasource` 导航和相关状态。
- CPA 主行改为可展开行：主行是连接层，可刷新、编辑、删除、启停；子行是账号层，只能改名、隐藏/恢复，不能删除。
- 普通一对一连接直接在同一行展示状态和用量。
- 更新样式，补上 CPA 展开按钮、连接行间距和子行容器样式。
- 更新单测、烟测和 E2E：测试新的“已添加”导航、CPA 展开子行、子行无删除按钮。
- 升级 E2E fake connector 夹具：从旧单文件 `.ts` 插件改为当前 `manifest.json + connector.ts` 目录格式。

## 对应提交

实施计划：`docs/superpowers/plans/2026-06-13-v2-architecture-refactor.md`

下表列出本次架构重构及后续说明、测试补充对应的 30 个提交。

| Commit    | 类型     | 内容                                                                         |
| --------- | -------- | ---------------------------------------------------------------------------- |
| `796fb74` | docs     | add v2 architecture refactor design spec                                     |
| `87cca38` | docs     | address review findings in v2 refactor spec                                  |
| `98dab1e` | docs     | add v2 architecture refactor implementation plan                             |
| `6a5b3d5` | fix      | address second review — 6 bugs, 2 missing capabilities, 4 consistency issues |
| `10cc35b` | fix      | final review polish — spec/plan alignment and test correctness               |
| `2635afc` | feat     | add Observation types and Zod schema for v2 architecture                     |
| `128b996` | feat     | add SQLite observation store                                                 |
| `6757f49` | feat     | add file-backed secrets vault                                                |
| `63034a2` | test     | select node vm sandbox fallback                                              |
| `7c93963` | feat     | add connector manifest schema and loader                                     |
| `be1f800` | feat     | add connector runtime with node vm sandbox                                   |
| `139ff5e` | feat     | add connector net client                                                     |
| `2be045f` | feat     | add declarative poll executor                                                |
| `85031a7` | refactor | schedule connectors instead of plugins                                       |
| `2a84895` | feat     | add local API ingest server                                                  |
| `7bd7a0c` | feat     | add session login manager                                                    |
| `5c65428` | feat     | add Tier 2 connector scripts                                                 |
| `99e4b86` | refactor | align IPC commands with connectors                                           |
| `fd2b0f8` | feat     | surface connector freshness in UI                                            |
| `122f76c` | build    | update connector packaging pipeline                                          |
| `713a266` | refactor | remove legacy plugin runtime                                                 |
| `fe86e21` | docs     | add architecture reference notes                                             |
| `669f0de` | docs     | remove lowercase spec and test duplicates                                    |
| `899c133` | docs     | document settings architecture refactor                                      |
| `d2a2748` | refactor | unify settings added list                                                    |
| `fba21c9` | test     | cover unified settings list                                                  |
| `2868952` | docs     | list architecture refactor commits                                           |
| `3f834b0` | test     | cover settings save smoke path                                               |
| `58c923f` | test     | cover settings save electron e2e                                             |
| `f34993a` | docs     | record provider settings gaps                                                |
| `13e1a5c` | docs     | clarify architecture refactor scope                                          |

## 夹带的前端改动说明

> 本节如实记录架构重构 commit 序列中两个夹带前端改动的 commit，区分"数据层必需改动"与"产品交互重构/生硬文案"。详细问题清单见 `docs/TASKS.md`「修复：架构升级夹带的前端改动」。

### `fd2b0f8` feat: surface connector freshness in UI

名义是"surface connector freshness"，实际混合了两类改动：

**数据层必需（符合主题）：**

- `src/shared/schemas/plugin-output.ts` 加 `observedAt`/`stale` 字段
- `src/renderer/lib/provider-usage.ts` 透传 `observedAt`/`stale`/`source`
- `src/renderer/components/ProviderAccountRow.tsx` stale badge
- `src/renderer/styles/globals.css` stale 样式

**夹带的产品交互重写（不符合主题）：**

- `src/renderer/views/SettingsView.tsx` +129/-126：重写 `DataSourceList`，和 freshness 无关，是 `d2a2748` 的预演
- `src/renderer/components/ProviderCard.tsx` 引入 `source_label` = `source.toUpperCase()`，把内部 `UsageSource` 枚举暴露为 `POLL`/`SESSION`/`GATEWAY` badge
- `src/renderer/components/ProviderCard.tsx` 硬编码 `观测 {observed_text}` 前缀，导致"观测 2 分钟前"

后两项已于 `3585b29` 修复（删除 source badge 和观测前缀）。

### `d2a2748` refactor: unify settings added list

这是账号/数据源双视角合并成单列表的**产品交互重构**，不是数据层替换。改动本身符合 `docs/omniusage-architecture-v2.md` §5.5.6 设计，但和替换 plugin runtime 无因果关系，不应混在架构重构 commit 序列里。应独立成 feature branch。

### 教训

- 架构升级 commit 应严格只含数据层改动（schema、store、runtime、host IO、scheduler、IPC 数据通道）。
- 产品交互重构（设置页结构、文案、badge）应独立 commit 序列，单独 review。
- "surface freshness"这类小特性 commit 不应夹带设置页大规模重写。

## 架构规则

- 主面板仍然没有 CPA provider tab。
- CPA 采集到的账号继续并入对应 provider 卡片。
- 三层 ID、去重、错误归属、聚合算法、所有权规则不变。
- UI 不再暴露“数据源视角 / 账号视角”两个独立区。
- 删除操作只出现在连接层：普通连接行、CPA 主行。
- CPA 子账号不是本地配置实体，不能删除，只能隐藏或改名。

## 已知限制

- Electron E2E 前需要把 `better-sqlite3` rebuild 到 Electron ABI；E2E 后需要 rebuild 回 Node ABI，才能继续跑 Vitest。
- 本次手工 Electron E2E 只覆盖设置页账号管理和 plugin failure modes 两条关键路径，不等同于全量 UI 回归。
- 未覆盖场景：所有 connector 的真实外部服务登录、代理环境、异常网络矩阵和长期定时采集稳定性。
- 目前没有数据迁移承诺；本轮按 clean break 方式替换旧 plugin runtime。

## 验证

已跑过：

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`：65 files / 506 tests passed
- Electron E2E：
    - `tests/user_e2e/specs/settings_provider_accounts.spec.ts`
    - `tests/user_e2e/specs/plugin_failure_modes.spec.ts`

注意：Electron E2E 前需要把 `better-sqlite3` rebuild 到 Electron ABI；E2E 后已 rebuild 回 Node ABI，保证 Vitest 可跑。
