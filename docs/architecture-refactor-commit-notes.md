# 架构重构提交说明

## 目标

把设置页从“账号 / 数据源”双视角改成单一“已添加”列表，并让 CPA 作为可展开连接呈现。

## 本次提交范围

- 更新 `docs/omniusage-architecture-v2.md` §5.5.6：明确设置页只有一个“已添加”列表，不再分“账号区 / 数据源区”。
- 重写 `SettingsView` 的已添加页：每一行代表一个用户配置的连接。
- 删除旧的独立数据源视图代码：不再保留 `DataSourceList`、`CpaDetailPage`、`datasource` 导航和相关状态。
- CPA 主行改为可展开行：主行是连接层，可刷新、编辑、删除、启停；子行是账号层，只能改名、隐藏/恢复，不能删除。
- 普通一对一连接直接在同一行展示状态和用量。
- 更新样式，补上 CPA 展开按钮、连接行间距和子行容器样式。
- 更新单测、烟测和 E2E：测试新的“已添加”导航、CPA 展开子行、子行无删除按钮。
- 升级 E2E fake connector 夹具：从旧单文件 `.ts` 插件改为当前 `manifest.json + connector.ts` 目录格式。

## 架构规则

- 主面板仍然没有 CPA provider tab。
- CPA 采集到的账号继续并入对应 provider 卡片。
- 三层 ID、去重、错误归属、聚合算法、所有权规则不变。
- UI 不再暴露“数据源视角 / 账号视角”两个独立区。
- 删除操作只出现在连接层：普通连接行、CPA 主行。
- CPA 子账号不是本地配置实体，不能删除，只能隐藏或改名。

## 验证

已跑过：

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`：65 files / 505 tests passed
- Electron E2E：
    - `tests/user_e2e/specs/settings_provider_accounts.spec.ts`
    - `tests/user_e2e/specs/plugin_failure_modes.spec.ts`

注意：Electron E2E 前需要把 `better-sqlite3` rebuild 到 Electron ABI；E2E 后已 rebuild 回 Node ABI，保证 Vitest 可跑。
