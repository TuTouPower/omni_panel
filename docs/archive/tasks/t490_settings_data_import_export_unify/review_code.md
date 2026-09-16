# Task review t490（reviewer_focus: 代码）

- task：`t490_settings_data_import_export_unify`
- spec：`docs/tasks/t490_settings_data_import_export_unify/spec.md`
- diff_anchor：`ee2f89584d260f3757382455ff51068a9ee79ea9`
- target：`git -C '/Users/testuser/kar/code/omni_panel_t490' diff ee2f89584d260f3757382455ff51068a9ee79ea9`
- round：1
- reviewed_at：2026-09-16 17:06 UTC+8

reviewed_scope: 5173d8734960682c

## Findings

（无。本轮 0 条 finding；7 视角正交体检（规格合规 / 正确性 / 安全 / 契约·Breaking / 性能·资源 / 架构·可维护性 / 健壮性·可观测）均已逐条扫过，未命中可锚定 `file:line` 的缺陷，不凑数。）

## 结论

- 前轮 finding 复核：无（Round 1，首次审阅）。
- 本轮新发现：0 条。
- 未进表的提示：
    - 文件过大（降级规则：命中项不进 finding 表，仅列路径与行数）：
        - `tests/integration/local-api/server.test.ts` 3889 行（测试源码 ≥1200 important 阈值，本 task 净 +4 行）——仅在结论段提示，未发现其导致可观测缺陷。
        - `tests/unit/ipc/config-ipc.test.ts` 1566 行（测试源码 ≥1200 important 阈值，本 task 净 +29 行）——同上，仅提示。
        - `src/main/core/local-api/server.ts` 2051 行（实现源码 ≥800），但本 task 净 -3 行，不满足「仍净增」条件，不出提示性 finding。
        - `src/main/ipc/config-ipc.ts` 632 行（≥400 minor 阈值）本 task 净 -27 行；`src/preload/index.ts` 765 行（≥400）净 0；`src/renderer/views/SettingsView.tsx` 757 行（≥400）净 -1。三者均未净增，不构成文件膨胀。
    - 圈复杂度：本 task 的改动是**降低** `handleConfigImportData` 复杂度（删除两处分支），`handleConfigExport` 只新增 `options.includeSecrets === true` 一处判定，IPC handler 闭包新增一个三元；未发现本 task 新增 ≥15 的复杂函数。`handleConfigImportData`（现约 3 分支）已远离阈值。
    - 范围外观察：diff 新增两份流程/环境记录文档 `docs/findings/d061_coding_agent_shell_node_env_breaks_renderer_tests.md`、`docs/pending/todo/p237_local_api_config_export_test_red.md`，均非 spec 范围条目。属环境/既有红灯的记录性产物，且与本次实施强相关（实施现场发现），不构成偏航，仅在此提示。`docs/specs/config-store.md`、`docs/specs/web_config_parity.md` 的改动是与行为变更同步的规格文档，属范围内。
    - 残余风险（已获 spec 批准的决策，非 finding）：删除 LocalAPI `/v1/config/import` 的 `allowEndpointOverrides: false` 后，Web 来源导入含 `endpointOverrides` 的配置不再被单独拒绝——这正是 p234/AC-005 要消除的「单向拦截」。该端点为 Bearer token 鉴权的本机 LocalAPI，且桌面端本就是同行为，风险与桌面端同源，spec 上下文「风险与回退」已登记该取舍，故不计 finding。
    - 既有红灯（与本 task 无关，非本次缺陷）：`tests/integration/local-api/server.test.ts > local-api config management > export returns canonical config without secrets by default and with secrets explicitly` 仍 400（p237，base 同样失败，已复现）。本 task 未修改该路径。
- AC 复验方式：
    - AC-001：`re_verified`。`NODE_ENV=test npx vitest run --project renderer tests/unit/renderer/views/settings_view_data.test.tsx` 3 例全绿，覆盖桌面/Web 两模式：副标题「导出配置；默认不含明文密钥」、复选框存在、勾选前无警告勾选后出现红色警告；并重跑 `tests/unit/renderer/views/` 全目录 18 文件/216 例全绿。
    - AC-002：`re_verified`。同上渲染层用例断言 `window.usageboard.config.export` 依次被以 `{ includeSecrets: false }` / `{ includeSecrets: true }` 调用（`SettingsView.tsx:264`）。
    - AC-003：`re_verified`。`NODE_ENV=test npx vitest run --project node tests/unit/preload/config_export_options.test.ts` 2 例绿，断言 `ipcRenderer.invoke(CONFIG_EXPORT, { includeSecrets })` 及无参时传 `null`（`src/preload/index.ts:371`）。
    - AC-004：`re_verified`。`npx vitest run --project node tests/unit/ipc/config-ipc.test.ts` 52 例绿，含「默认导出无 `secrets`」「`includeSecrets: true` 时含 `secrets`」两例（`src/main/ipc/config-ipc.ts:467`）。
    - AC-005：`re_verified`。`npx vitest run --project node tests/integration/local-api/server.test.ts -t "endpoint overrides over HTTP"` 通过，断言含 `endpointOverrides` 的 canonical v2 文档 HTTP 导入返回 200 且落盘保留 override（`src/main/core/local-api/server.ts:1736` 已移除单向拦截）。
    - 另独立复验：`npx tsc --noEmit` 全仓通过；`npx eslint` 五个改动源文件 0 warning（无因删除选项残留的未用 import/变量）。
    - coverage = re_verified 5 / 5 = 1.00（trust_prior 占比 0，无需人工抽查）。
- 总体判断：实现与 spec 契约区 5 条 AC 逐条对齐，两轴（规格合规 + 代码质量/正确性）均未发现可锚定的缺陷；文件过大/复杂度仅作提示，故 PASS。
- 系统性 follow-up：`p237_local_api_config_export_test_red` 已作为 pending todo 落库（本 diff 新增该文档），无需重复登记。其余无。
- 交付完整性：`git status --short` 中唯一未跟踪文件为流程文件 `docs/tasks/t490_settings_data_import_export_unify/handoff.json`（含极少量未跟踪的 review 报告），非 reviewer 看不到的新交付源码/测试；未跟踪交付文件为空，故不判 INCOMPLETE。

## Round 2 (2026-09-16 17:11 UTC+8)

reviewed_scope: d8631d3138d355b9

### 前轮 finding 复核

- 代码轴 Round 1：0 条 finding，无待修项。本轮比对 `git -C '/Users/testuser/kar/code/omni_panel_t490' diff ee2f89584d260f3757382455ff51068a9ee79ea9`，五个 `src/` 改动文件内容与 Round 1 完全一致（mtime 均早于 Round 1 报告 17:06；`--numstat` 亦相同），Round 1 的代码轴 PASS 在本轮内容下继续成立。
- 测试轴 `t490_test_f001`（minor：`config:export` handler 的 rawOptions→options 桥接无覆盖）：**已补**。`tests/unit/ipc/config-ipc.test.ts:540-576` 新增用例经真实 `registerConfigIpc` 取出 `config:export` handler，分别以 `{includeSecrets:true}` 与 `null` 调用，断言导出文件含 / 不含 `secrets`（`config-ipc.test.ts:562,570`）。本轮实跑该文件 53 例全绿，桥接逻辑 `config-ipc.ts:620-626` 现被真实触发。（测试轴最终判定归 test reviewer，此处仅从代码侧确认该桥接已被覆盖且与实现一致。）

### 本轮新发现

0 条。本轮相对 Round 1 的唯一新增内容为上述测试用例（`tests/unit/ipc/config-ipc.test.ts` 累计净 +69 行），未触及任何 `src/` 文件，无新增代码缺陷。7 视角（规格合规 / 正确性 / 安全 / 契约·Breaking / 性能·资源 / 架构·可维护性 / 健壮性·可观测）已对当前 diff 重新逐条扫过，未命中可锚定 `file:line` 的新缺陷，不凑数。

- 新增用例本身经真实 handler + mock 的 electron dialog 驱动，未 mock 被测逻辑；无 `.skip` / `.only` / 恒真断言 / 弱化断言，不构成内联测试 anti-pattern。

### 未进表的提示

- 文件过大（降级规则：不进 finding 表，仅列路径与行数）：
    - `tests/integration/local-api/server.test.ts` 3889 行（测试源码 ≥1200 important 阈值，本 task 净 +4 行）——无证据表明其导致可观测缺陷，仅提示。
    - `tests/unit/ipc/config-ipc.test.ts` 1606 行（测试源码 ≥1200，本 task 累计净 +69 行，含本轮新增桥接用例）——同上，仅提示。
    - `src/main/core/local-api/server.ts` 2051 行（实现源码 ≥800）本 task 净 -3 行，不满足「仍净增」，不提示；`src/main/ipc/config-ipc.ts` 632 行（≥400）净 -27、`src/preload/index.ts` 765 行净 0、`src/renderer/views/SettingsView.tsx` 757 行净 -1，均未净增，不构成膨胀。
- 圈复杂度：本轮无 `src/` 改动，改动函数的复杂度与 Round 1 相同（`handleConfigImportData` 因删分支进一步降低；`handleConfigExport` 仅新增一处 `=== true` 判定；IPC handler 一个三元）。无本 task 新增 ≥15 的复杂函数。
- 范围外观察：`src/main/ipc/config-ipc.ts:399` 的 `ConfigExportOptions` 与 `src/shared/types/ipc.ts:271` 的同名接口结构重复（均为 `{ readonly includeSecrets?: boolean }`）。该接口为 **base 既有**（本 diff 未新增，仅作为 `handleConfigExport` / IPC handler 的参数类型被继续引用），结构等价、无运行时分叉，属既有轻微 DRY，非本 task 引入，仅提示不计数。
- 残余风险（spec 已批准的决策，非 finding，与 Round 1 一致）：删除 LocalAPI `/v1/config/import` 的 `allowEndpointOverrides:false` 后，Web 来源导入含 `endpointOverrides` 的配置不再被单独拒绝，与桌面端对齐——即 AC-005 的目标行为。
- 既有红灯（与本 task 无关，非本次缺陷）：`local-api config export` 用例（p237）与 `auth-ipc` 8 例（p236）在 base 同样失败，本 task 未修改相关路径。

### AC 复验方式（Round 2）

- AC-001：`re_verified` —— `NODE_ENV=test npx vitest run --project renderer tests/unit/renderer/views/settings_view_data.test.tsx` 3/3 绿；读 `data_section.tsx:59-75` 确认副标题固定「导出配置；默认不含明文密钥」、复选框无条件渲染、勾选后红色警告「文件含明文密钥，请妥善保管」。
- AC-002：`re_verified` —— 同上用例断言 `window.usageboard.config.export` 收到 `{ includeSecrets: boolean }`；读 `SettingsView.tsx:260-266` 确认导出统一传 `{ includeSecrets: include_secrets }`。
- AC-003：`re_verified` —— `npx vitest run --project node tests/unit/preload/config_export_options.test.ts` 2/2 绿；读 `src/preload/index.ts:371-376` 确认 `invoke(CONFIG_EXPORT, options ?? null)` 完整透传。
- AC-004：`re_verified` —— `npx vitest run --project node tests/unit/ipc/config-ipc.test.ts` 53/53 绿，含「默认无 `secrets`」与「`includeSecrets:true` 含 `secrets`」两例；读 `config-ipc.ts:467-477` 确认 `includeSecrets: options.includeSecrets === true`。
- AC-005：`re_verified` —— `npx vitest run --project node tests/integration/local-api/server.test.ts -t "endpoint overrides"` 1/1 绿；读 `server.ts:1731-1736` 确认导入不再传 `allowEndpointOverrides`。
- 另独立复验：`npx tsc --noEmit` 全仓通过；`npx eslint` 五个改动源文件 0 warning。
- coverage = re_verified 5 / 5 = 1.00（trust_prior 占比 0，无需人工抽查）。

### 结论（Round 2）

- 前轮 finding 复核：代码轴 Round 1 0 条（无待修，`src/` 未变，PASS 仍成立）；测试轴 `t490_test_f001` 已补且通过。
- 本轮新发现：0 条。
- 交付完整性：`git status --short` 中未跟踪项仅为流程文件（`handoff.json`、`review_code.md`、`review_test.md`），无 reviewer 不可见的新交付源码 / 测试，不判 INCOMPLETE。
- 总体判断：当前 diff 无未解决的 critical / important，Round 1 代码轴 PASS 在本轮内容下继续成立。
- 系统性 follow-up：`p237_local_api_config_export_test_red` 已落库，无需重复登记；其余无。

verdict: PASS

## Round 3 (2026-09-16 17:15 UTC+8)

reviewed_scope: 8bfe233d9ebb89f9

（落点校验：本会话默认 shell 工作根是主 worktree `/Users/testuser/kar/code/omni_panel`（与 prompt「本会话落点说明」一致）；按说明以 `git -C '/Users/testuser/kar/code/omni_panel_t490' rev-parse --show-toplevel` 判等，输出精确为 `/Users/testuser/kar/code/omni_panel_t490`，实施落点正确。prompt 第 1 步「不带 `-C` 的 rev-parse 须等于 t490」与本机 shell 实际根冲突，其校验以带 `-C` 的方式完成。）

### 前轮 finding 复核

- 代码轴 Round 2：0 条 finding，无待修项。本轮比对 `git -C '/Users/testuser/kar/code/omni_panel_t490' diff ee2f89584d260f3757382455ff51068a9ee79ea9`，五个 `src/` 改动文件与 Round 2 逐字节一致（`--numstat` 相同：`server.ts +3/-6`、`config-ipc.ts +9/-36`、`preload/index.ts +5/-5`、`SettingsView.tsx +6/-7`、`data_section.tsx +12/-23`），未触及任何 `src/` 文件；Round 2 的代码轴 PASS 在本轮内容下继续成立。
- 测试轴 `t490_test_f002`（minor：`config:export` 桥接用例以非对象 `null` 代表「关闭」态，未覆盖渲染层真实发送的 `{ includeSecrets: false }`）：**已补**。`tests/unit/ipc/config-ipc.test.ts:569-572` 新增一段 `await handler(invoke_event, { includeSecrets: false })`，断言落盘文件 `unchecked["secrets"]` 为 `undefined`；`null` 段（`:574-580`）作为第三段保留。据此 `src/main/ipc/config-ipc.ts:620-626` 的 `is_record(rawOptions) ? { includeSecrets: rawOptions["includeSecrets"] === true } : {}` 现被渲染层真实的两态输入（`true`/`false`）与误传态（`null`）完整触发——若把映射写成基于键存在（如 `"includeSecrets" in rawOptions`）或反向，`false` 段会失败。（测试轴最终判定归 test reviewer，此处仅从代码侧确认该桥接已被真实覆盖且与实现一致。）

### 本轮新发现

0 条。本轮相对 Round 2 的唯一新增内容为上述测试文件的 `{ includeSecrets: false }` 断言段（`tests/unit/ipc/config-ipc.test.ts` 累计净 +74 行），未改动任何 `src/` 文件，无新增代码缺陷。7 视角（规格合规 / 正确性 / 安全 / 契约·Breaking / 性能·资源 / 架构·可维护性 / 健壮性·可观测）已对当前完整 diff 重新逐条扫过：

- 规格合规：5 条 AC 的实现面与 Round 1/2 一致，无回退；`allowEndpointOverrides` / `ConfigImportOptions` / `show_secret_option` / `web_mode` 全域 `grep` 零残留（`src/` 无命中），死代码清理彻底。
- 正确性：`handleConfigExport` 默认 `options={}` → `includeSecrets: options.includeSecrets === true`（`config-ipc.ts:469,476`），未勾选/缺省均不含 `secrets`；`handleConfigExportData`（LocalAPI/CLI）保留其 `includeSecrets !== undefined` 展开语义（`:432-434`），未被此改动波及。
- 契约·Breaking：preload `config.export` 由 `void options` 改为 `invoke(CONFIG_EXPORT, options ?? null)`（`preload/index.ts:371-376`）；`ConfigExportOptions` 仍为 base 既有接口（`shared/types/ipc.ts:271` 与 `config-ipc.ts:399` 结构等价重复，见下提示），`export(options?)` 签名未变，`options?` 可选性使旧无参调用保持兼容。
- 安全：`config:export` 新增入参经 `assert_valid_sender` 后只取 `rawOptions["includeSecrets"] === true` 布尔，非对象一律保守取 `{}`（失败即「不含明文密钥」的 fail-safe 方向），无注入/越权面；导出明文密钥仍受显式用户勾选约束。
- 健壮性：`is_record` 对数组也返回 true，但取值恒为 `undefined !== true` → `false`，不会误开密钥；`null` 走假分支得 `{}`，均无崩溃路径。
- 架构 / 性能：无新增 I/O、查询、循环或大对象引入；删除的两处 `allowEndpointOverrides` 拦截为纯删代码。
- 未命中可锚定 `file:line` 的新缺陷，不凑数。

### 未进表的提示

- 文件过大（降级规则：不进 finding 表，仅列路径与行数）：
    - `tests/integration/local-api/server.test.ts` 3889 行（测试源码 ≥1200 important 阈值，本 task 净 +4 行）——无证据表明其导致可观测缺陷，仅提示。
    - `tests/unit/ipc/config-ipc.test.ts` 1611 行（测试源码 ≥1200，本 task 累计净 +74 行；较 Round 2 的 1606 多 5 行，即本轮 f002 修复）——同上，仅提示。
    - `src/main/core/local-api/server.ts` 2051 行（实现源码 ≥800）本 task 净 -3 行，不满足「仍净增」，不提示；`src/main/ipc/config-ipc.ts` 632 行（≥400）净 -27、`src/preload/index.ts` 765 行净 0、`src/renderer/views/SettingsView.tsx` 757 行净 -1、`data_section.tsx` 132 行、新文件 `tests/unit/preload/config_export_options.test.ts` 65 行 / `tests/unit/renderer/views/settings_view_data.test.tsx` 111 行（均远低于 600），均未净增或未达阈值，不构成膨胀。
- 圈复杂度：本轮无 `src/` 改动，改动函数复杂度与 Round 2 相同（`handleConfigImportData` 因删两处分支降至约 3 分支；`handleConfigExport` 仅一处 `=== true` 判定；`config:export` handler 闭包一个 `is_record` 三元）。无本 task 新增 ≥15 的复杂函数。
- 范围外观察：`src/main/ipc/config-ipc.ts:399` 的 `ConfigExportOptions` 与 `src/shared/types/ipc.ts:271` 同名接口结构重复（均为 `{ readonly includeSecrets?: boolean }`）。该接口为 **base 既有**（本 diff 未新增，仅作为参数类型被继续引用），结构等价、无运行时分叉，属既有轻微 DRY，非本 task 引入，仅提示不计数（与 Round 2 结论一致）。
- 残余风险（spec 上下文「风险与回退」已批准的决策，非 finding）：删除 LocalAPI `/v1/config/import` 的 `allowEndpointOverrides:false` 后，Web 来源导入含 `endpointOverrides` 的配置不再被单独拒绝，与桌面端对齐——即 AC-005 的目标行为。该端点为 Bearer token 鉴权的本机 LocalAPI；另确认被删的「导入文件缺少配置数据」分支语义由 `import_config` 的 `parse_transfer_document`（`config-transfer.ts:196-218`，非 record / 版本不符 / envelope 或 config schema 不合均抛错）兜底，异常仍映射 4xx，无新增崩溃或数据丢失。
- 既有红灯（与本 task 无关，非本次缺陷）：`tests/integration/local-api/server.test.ts > export returns canonical config without secrets by default and with secrets explicitly` 仍 400（p237，测试 deps 缺 `appVersion` + 纯 Node 无 electron，base 同样失败，本 task 未修改该路径）；`tests/unit/ipc/auth-ipc.test.ts` 8 例（p236）。renderer 项目需 `NODE_ENV=test`（d061）；全量 `pnpm test` 受 p228 abort 限制，本轮按指定文件 / `-t` 过滤运行。

### AC 复验方式（Round 3）

- AC-001：`re_verified` —— `NODE_ENV=test npx vitest run --project renderer tests/unit/renderer/views/settings_view_data.test.tsx` → 3/3 通过（桌面/Web 两模式：统一副标题「导出配置；默认不含明文密钥」、复选框存在、勾选前无警告/勾选后红色警告「文件含明文密钥，请妥善保管」）；读 `data_section.tsx:59-75` 确认副标题固定、复选框无条件渲染、警告由 `include_secrets` 控制。
- AC-002：`re_verified` —— 同上用例「passes { includeSecrets } …」通过，断言 `window.usageboard.config.export` 先后收到 `{ includeSecrets: false }` / `{ includeSecrets: true }`；读 `SettingsView.tsx:259-266` 确认统一传 `{ includeSecrets: include_secrets }`。
- AC-003：`re_verified` —— `npx vitest run --project node tests/unit/preload/config_export_options.test.ts` → 2/2 通过，断言 `ipcRenderer.invoke(CONFIG_EXPORT, { includeSecrets })` 与无参时传 `null`；读 `src/preload/index.ts:371-376` 确认 `options ?? null` 完整透传。
- AC-004：`re_verified` —— `npx vitest run --project node tests/unit/ipc/config-ipc.test.ts` → 53/53 通过，含「默认导出无 `secrets`」「`includeSecrets:true` 含 `secrets`」及本轮确认的桥接用例（`true`/`false`/`null` 三段）；读 `config-ipc.ts:469-477` 确认 `includeSecrets: options.includeSecrets === true`。
- AC-005：`re_verified` —— `npx vitest run --project node tests/integration/local-api/server.test.ts -t "endpoint overrides over HTTP"` → 1 passed | 116 skipped（HTTP 200 + `imported:true` + override 落盘）；`npx vitest run --project node tests/unit/ipc/config-ipc.test.ts -t "AC-005"` → 1 passed | 52 skipped；读 `server.ts:1731-1737` 确认导入不再传 `allowEndpointOverrides`、选项已删除。
- 另独立复验：`npx tsc --noEmit` 全仓退出码 0；`npx eslint` 五个改动源文件 0 warning。
- coverage = re_verified 5 / 5 = 1.00（trust_prior 占比 0，无需人工抽查）。

### 结论（Round 3）

- 前轮 finding 复核：代码轴 Round 2 为 0 条（无待修，五个 `src/` 文件较 Round 2 未变，PASS 仍成立）；测试轴 `t490_test_f002`（minor）已补（`{ includeSecrets: false }` 桥接段落地并通过）。
- 本轮新发现：0 条。
- 未进表的提示：文件过大（`config-ipc.test.ts` 1611 行、`server.test.ts` 3889 行，均仅提示）；复杂度无升级；`ConfigExportOptions` 接口重复为 base 既有、仅提示；残余风险为 spec 已批准决策。详见上节，无则不受。
- 交付完整性：`git status --short` 中未跟踪项仅为流程文件（`handoff.json`、`review_code.md`、`review_test.md`），全部交付源码/测试（含本轮新增的两个测试文件与两份 docs）均在 `git diff` 可见；无 reviewer 不可见的新交付文件，不判 INCOMPLETE。
- 总体判断：当前 diff 无未解决的 critical / important，Round 2 代码轴 PASS 在本轮内容下继续成立；本轮仅测试用例扩一断言，无新增代码缺陷。
- 系统性 follow-up：`p237_local_api_config_export_test_red` 已落库，无需重复登记；其余无。

verdict: PASS
