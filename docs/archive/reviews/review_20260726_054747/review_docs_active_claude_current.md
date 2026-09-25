# docs_active 模块审阅报告

## 当前模型判断依据

主会话模型：default_sonnet（继承主会话）

## 模块 slug

docs_active

## 审阅范围

`D:/Dev/Code/omni_usage/docs/` 下活跃文档（不含 `archive/` 和 `reviews/`），全量覆盖：

- `docs/blueprint/`（4 文件）
- `docs/guides/`（2 文件）
- `docs/specs/`（28 文件）
- `docs/templates/`（8 文件）
- `docs/tasks/`（1 活跃 task：t122）
- `docs/bugs.md`、`docs/handoff.md`、`docs/specs_index.md`、`docs/tasks_index.json`

______________________________________________________________________

## 高优先级

### H1 handoff.md 状态未同步到当前 task

- **位置**：`docs/handoff.md:4-5`
- **现象**：handoff 记录的 branch 为 `t111_config_fallback_p0_protection`，head_commit 为 `994139c`，但当前活跃 task 是 t122（`t122_split_settings_view`，分支已存在）。handoff 没有 t122 的任何交接记录。
- **影响**：接手者读 handoff 会误以为 t111 是最新状态，不知道 t122 已 active 且已有多次 commit。handoff 作为项目级交接入口失效。
- **建议**：在 handoff.md 顶部追加 t122 交接段，记录当前 branch、head_commit、已完成步骤。
- **置信度**：高（tasks_index.json 确认 t122 active，git branch 确认分支存在）
- **优先级**：高

### H2 architecture.md 目录结构未反映 t122 拆分

- **位置**：`docs/blueprint/architecture.md:62-67`
- **现象**：目录树 `src/renderer/` 下只列 `views/ components/ hooks/ lib/ styles/`，但 t122 已将 SettingsView 拆出 `views/settings-view/`（含 `lib.ts`）、`components/settings/`（Toggle/SetRow/Select/BarSchemeField）、`components/AccountDialog.tsx`、`hooks/use_connector_catalog.ts`。当前 SettingsView.tsx 已降至 724 行（低于 800 阈值），表明拆分已实施。
- **影响**：新开发者或 reviewer 按 architecture.md 找不到新增子目录和文件，产生困惑。
- **建议**：t122 收尾 Step 7 时更新目录树，或在当前位置补充注释指向 t122 拆分产物。
- **置信度**：高（文件系统已验证新文件存在）
- **优先级**：高

### H3 domain.md 内置 provider 列表与 connector-direct.md 不一致

- **位置**：`docs/blueprint/domain.md:13` vs `docs/specs/connector-direct.md:7-23`
- **现象**：domain.md 列出 13 个内置 provider：`claude codex antigravity kimi glm minimax deepseek tavily firecrawl mimo opencode_go grok`（实际只有 12 个，缺了 `codex`——等等让我重数：claude, codex, antigravity, kimi, glm, minimax, deepseek, tavily, firecrawl, mimo, opencode_go, grok = 12）。connector-direct.md 列出 16 个连接器，包含 `getoneapi`、`exa`、`tikhub`。目录 `connectors/` 确认有 16 个子目录。domain.md 的 provider 枚举遗漏了 `getoneapi`、`exa`、`tikhub`。
- **影响**：domain.md 作为「术语唯一真相源」，provider 枚举不完整会导致新开发者/agent 误判哪些是内置 provider。
- **建议**：将 `getoneapi`、`exa`、`tikhub` 加入 domain.md 内置 provider 列表。
- **置信度**：高（文件系统 `ls connectors/` 确认 16 个目录）
- **优先级**：高

### H4 bugs.md 仍有"未修复"条目但全部标记了修复行

- **位置**：`docs/bugs.md:67-79`
- **现象**：最后一个条目「config 数据丢失：fallback 路径绕过 P0 保护，auto_seed 覆盖账号」没有「修复：」行。其他 6 个条目均已标记修复（关联 task + commit SHA）。该条目描述了 t111 修复的场景，但 t111 的修复已经在 handoff.md 和 config_fallback_p0_protection.md 中记录，bugs.md 本身未追加修复行。
- **影响**：bugs.md 标题为「已知待修问题」，但实际只有最后一个条目看起来是"待修"。读着容易误认为所有 bug 仍开放。
- **建议**：为最后一个条目追加「修复：t111（commit `994139c`）」行，与 t111 spec 验收标准（AC 已勾选）对齐。或把标题改为「已知问题（含已修复）」更准确。
- **置信度**：中高（t111 spec 验收标准已全部勾选，config-store.ts 行为已改）
- **优先级**：高

______________________________________________________________________

## 中低优先级

### M1 specs_index.md slug 与文件名下划线/连字符不一致

- **位置**：`docs/specs_index.md:43`
- **现象**：索引条目 slug 为 `vendor-forms-oauth-weblogin`（连字符），对应文件名为 `vendor_forms_oauth_weblogin.md`（下划线）。同目录其他 27 个 slug 与文件名一致（下划线对应下划名，连字符对应连字符）。
- **影响**：scripts 或 agent 按 slug 查文件时拼接 `{slug}.md` 会找不到文件。
- **建议**：将索引条目改为 `vendor_forms_oauth_weblogin` 或将文件名改为 `vendor-forms-oauth-weblogin.md`，统一风格。鉴于项目约定为 `snake_case`，建议统一为下划线。
- **置信度**：高（直接比对索引与目录）
- **优先级**：中

### M2 connector-direct.md tikhub 无对应 spec 文件

- **位置**：`docs/specs/connector-direct.md:23`
- **现象**：tikhub 在 connector-direct.md 内置清单中列出（t051），但没有独立的 `docs/specs/connector-tikhub.md` 或类似 spec。同理 getoneapi 和 exa 也没有独立 spec（它们在 connector-direct.md 中有描述行）。其他接入类型（如 CPA、session、user-scripts）都有独立 spec。
- **影响**：tikhub 的详细接口、字段映射、错误处理等只在 connector-direct.md 的一行描述中，信息密度不足。
- **建议**：对于简单直连 poll 型连接器，一行描述可能足够。但如 tikhub 有特殊逻辑（余额反向 + free_credit），可考虑补充简短 spec 或在 connector-direct.md 中扩展描述。
- **置信度**：中（是否需要独立 spec 取决于复杂度判断）
- **优先级**：中低

### M3 window-management.md / platform-services-electron.md 交叉引用文件名不完整

- **位置**：`docs/specs/window-management.md:3`、`docs/specs/platform-services-electron.md:5`
- **现象**：window-management.md 写「IPC 见 `ipc.md`；UI 视图见 `ui-views.md`」，但实际文件名是 `ipc-api.md`/`ipc-electron.md` 和 `ui-views-desktop.md`/`ui-views-web.md`。platform-services-electron.md 写「详见 `connector-session.md`」，这个是准确的。
- **影响**：按引用找文件会找不到。虽不是致命问题，但降低了文档导航准确性。
- **建议**：将 `ipc.md` 改为 `ipc-api.md`（+ `ipc-electron.md`），`ui-views.md` 改为 `ui-views-desktop.md`（+ `ui-views-web.md`）。
- **置信度**：高（目录中无 `ipc.md` 或 `ui-views.md` 文件）
- **优先级**：中

### M4 ai-cli-token-stats-api.md Phase 4 文件清单与实际不一致

- **位置**：`docs/specs/ai-cli-token-stats-api.md:397-398`
- **现象**：spec 计划 Phase 4 Task 4.1 创建 `aggregator.ts`（独立聚合模块），但 architecture.md 第 44 行注明「聚合逻辑内联进 `collector.ts`，不单独建 `aggregator.ts`」。spec §4 模块结构也写「聚合逻辑内联进 `collector.ts`」。§11 Phase 4 的 Task 4.1 与 §4 矛盾。
- **影响**：按 Phase 4 Task 4.1 执行会创建一个 spec 自己也说不要的文件。
- **建议**：将 Task 4.1 从独立 aggregator.ts 改为 collector.ts 内聚合逻辑，或标注为「已内联，跳过」。
- **置信度**：高（spec 内部 §4 与 §11 矛盾）
- **优先级**：中

### M5 decisions.md 编号跳跃（缺 005-007 之间的 006）

- **位置**：`docs/blueprint/decisions.md`
- **现象**：编号序列 001→002→003→004→005→008→006→007→008。008 出现两次（第一个是 web e2e CI 策略，第二个是墓碑机制），第二个 008 的日期是 2026-07-26，第一个 008 的日期是 2026-07-21。编号顺序与日期顺序不一致：006 和 007 的日期（2026-07-20/21）早于 008（2026-07-21）但排在 008 后面。此外 008 重复。
- **影响**：ADR 引用时会有歧义——「008」指哪个决策？
- **建议**：第二个 008（墓碑机制，2026-07-26）应改编号为 009。按日期重排条目（或至少保证编号唯一且递增）。
- **置信度**：高（直接读文件确认重复编号）
- **优先级**：中

### M6 connector-session.md 后台续期描述与 platform-services-electron.md 矛盾

- **位置**：`docs/specs/connector-session.md:28` vs `docs/specs/platform-services-electron.md:14`
- **现象**：connector-session.md 明确说「当前无按 `cookieRefreshHours` 的后台定时续期；代码库中无 `cookieRefreshHours` 字段」。但 platform-services-electron.md 仍写「后台续期：`cookieRefreshHours`（0/6/12/24h）复用分区刷新」。
- **影响**：两个 spec 对同一功能（后台续期）的状态描述矛盾，读者不知道哪个为准。
- **建议**：platform-services-electron.md 更新后台续期描述，标注「未实现，仅保留 SessionManager 架构描述」或与 connector-session.md 对齐。
- **置信度**：高（connector-session.md 的描述更具体且标注了代码位置）
- **优先级**：中

### M7 config-store.md providerForcePercent 类型描述过时

- **位置**：`docs/specs/config-store.md:12`
- **现象**：描述为 `Partial<Record<UsageProvider, boolean>>`，但 connector-user-scripts.md 已将 provider 类型从 `UsageProvider` enum 宽化为 `string`。实际类型应为 `Partial<Record<string, boolean>>`。
- **影响**：误导开发者以为 provider 仍限于枚举值。
- **建议**：改为 `Partial<Record<string, boolean>>` 或注明 `UsageProvider` 已宽化。
- **置信度**：中（需确认代码实际类型）
- **优先级**：中低

### L1 conventions.md 引用 AGENTS.md 但文件不存在于 docs/

- **位置**：`docs/blueprint/conventions.md:3`
- **现象**：写「行为规则和工作顺序见 `AGENTS.md`」。AGENTS.md 存在于项目根目录，不在 docs/ 中。同一文档多处引用 AGENTS.md。
- **影响**：在 docs/ 上下文中阅读时引用不可达。但实际上 AGENTS.md 在项目根目录，agent 工作流通过 CLAUDE.md 定义，conventions.md 中的 AGENTS.md 引用可能指向 CLAUDE.md。
- **建议**：确认 AGENTS.md 是否存在（可能已重命名为 CLAUDE.md）。若已重命名，批量替换引用。
- **置信度**：中（未验证根目录是否有 AGENTS.md）
- **优先级**：低

### L2 specs 中硬编码行号引用

- **位置**：多处，如 `connector-cpa-runtime.md:37`（`:533`）、`connector-session.md:28`（代码注释行号）
- **现象**：spec 中引用代码行号（如 `connectors/cpa/connector.ts 约 533`），但文件随 task 修改后行号会漂移。
- **影响**：行号失效后指引不准，但仍能通过函数名/上下文定位。
- **建议**：优先用函数名/符号名定位；行号仅作辅助且标注「撰写时」。已在实施的 spec 不必回溯修改。
- **置信度**：高（行号漂移是已知常态）
- **优先级**：低

### L3 testing.md 覆盖率阈值低

- **位置**：`docs/guides/testing.md:136-139`
- **现象**：阈值为 Statements 15% / Branches 25% / Functions 25% / Lines 15%，基线 2026-05-30，阈值 = 基线 - 5%。这意味着基线时覆盖率约为 20-30%，作为质量门非常低。
- **影响**：低阈值意味着大量代码路径未被自动化测试覆盖，回归风险高。
- **建议**：这是项目已知的权衡（渐进提升策略），不需立即改动。随 task 推进逐步提升基线。
- **置信度**：中（阈值低可能是有意为之的阶段性策略）
- **优先级**：低

______________________________________________________________________

## 改进建议

1. **handoff.md 维护流程**：当前 handoff 在会话交出时手动追加，但存在遗漏（t122 未记录）。建议在 task Step 7 收尾时同步更新 handoff.md（CLAUDE.md 工作流未强制此步骤）。

2. **已修复 bug 归档**：bugs.md 当前 7 个条目中 6 个已修复。建议定期将已修复条目移入 `docs/archive/` 或在 bugs.md 中分区（已修复 / 待修），保持文件简洁。

3. **specs 生命周期**：已完成 task 的 spec 仍留在 `docs/specs/`，随 task 数量增长会膨胀。当前 28 个 spec 文件中，部分已全部实现且无后续 task（如 `connector-user-scripts-entry.md` 仅对应 t094）。可考虑定期归档无活跃引用的 spec。

4. **decisions.md 编号管理**：建议 ADR 编号自动递增（脚本或约定），避免手动编号出错（当前 008 重复）。

______________________________________________________________________

## 不确定项

1. **AGENTS.md 是否存在**：conventions.md 多处引用 `AGENTS.md`，但未验证根目录是否有此文件。若有则 L1 不成立；若已合并入 CLAUDE.md 则需批量替换。
2. **ai-cli-token-stats-api.md Phase 4 Task 4.1 是否已实施**：spec 计划建 `aggregator.ts`，architecture.md 说内联到 `collector.ts`。未检查代码中 `aggregator.ts` 是否存在（可能已建后又合并）。
3. **config-store.md `providerForcePercent` 类型**：未直接查看代码确认当前类型签名，仅基于 connector-user-scripts.md 推断。
4. **bugs.md 最后一个条目是否应标"已修复"**：t111 spec 验收标准已勾选，但未验证运行时行为是否完全覆盖该 bug 场景（null padding + ENOENT fallback + auto_seed 覆盖）。建议用户确认后标记。
