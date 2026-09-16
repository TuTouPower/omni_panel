# Task review t490（reviewer_focus: 测试）

- task：`t490_settings_data_import_export_unify`
- spec：`docs/tasks/t490_settings_data_import_export_unify/spec.md`
- diff_anchor：`ee2f89584d260f3757382455ff51068a9ee79ea9`
- target：`git -C '/Users/testuser/kar/code/omni_panel_t490' diff ee2f89584d260f3757382455ff51068a9ee79ea9`
- round：1
- reviewed_at：2026-09-16 17:05 UTC+8

reviewed_scope: 5173d8734960682c

## Findings

### t490_test_f001 - `CONFIG_EXPORT` IPC handler 的 rawOptions→options 桥接层无任何测试

- 严重度：minor
- 锚点：非 AC 锚定；spec 范围第 2 条「`src/main/ipc/config-ipc.ts` 中 `IPC_CHANNELS.CONFIG_EXPORT` 接收 options 并传给 `handleConfigExport(deps, options)`」的测试扩展项（可再加 case，不阻断）
- 位置：`src/main/ipc/config-ipc.ts:620-626`（handler）；现有覆盖 `tests/unit/ipc/config-ipc.test.ts:497,519`（仅直接调 `handleConfigExport`）、`tests/unit/preload/config_export_options.test.ts`（仅断言 `ipcRenderer.invoke` 入参）
- 问题：本轮新增的三段覆盖分别是——renderer 断言调用 `window.usageboard.config.export({includeSecrets})`（AC-002）、preload 断言 `invoke(CONFIG_EXPORT, {includeSecrets})`（AC-003）、`handleConfigExport(deps, options)` 直接单测（AC-004）。三者之间真正的粘合逻辑 `registerConfigIpc` 里 `const options = is_record(rawOptions) ? { includeSecrets: rawOptions["includeSecrets"] === true } : {}`（`config-ipc.ts:620-626`）没有任何测试经由 `config:export` handler 触发；`grep '"config:export"' tests` 无命中，`registerConfigIpc` 的既有用例只取 `config:get` / `config:getSecrets` / `config:saveSecrets` / `config:duplicate` 等 channel（`tests/unit/ipc/config-ipc.test.ts:161,215,465,989,1002,1019,1037`）。若该映射写反（例如 `!== true`）或漏取布尔，现有三层测试仍会全绿，而真实桌面导出会与勾选状态相反。
- 建议：补一条 unit：经 `registerConfigIpc` 取 `config:export` handler，分别以 `{includeSecrets:true}` 与 `null`/非对象调用，断言最终 `export_config` 的 `includeSecrets` 生效（可复用 `createMockDeps` + mock dialog 写临时文件断言 `secrets` 字段）；或直接断言 `handleConfigExport` 被传入 `{includeSecrets:true}`。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无前轮 finding。
- 改测方向复核：
    - `tests/unit/ipc/config-ipc.test.ts` 原「handleConfigExport writes canonical v2 JSON with plaintext secrets」→ 拆为「默认不含 secrets」+「includeSecrets 时含 secrets」两例（`:495-536`）。被替换的旧预期「桌面导出无条件含密钥」正是 AC-004 要消除的行为，属**规格变了**，非迁就实现。
    - `tests/unit/ipc/config-ipc.test.ts` 原「Web 导入拒绝自定义端点覆盖」→「导入含端点覆盖的配置不再被拒绝」（`:1537-1564`）；`tests/integration/local-api/server.test.ts` 原「web import rejects endpoint overrides…」整体删除并新增「import accepts endpoint overrides over HTTP like the desktop path」（`:984-1016`）。两处均锚定 AC-005 的显式行为反转，属**规格变了**。
    - 结论：本轮无「让断言迁就当前实现」的改测；所有改测均有 AC 级归因。
- 本轮新发现：1 条（f001，minor）。
- 未进表的提示：
    - AC-002/AC-001 的 Web 侧仅由同一（已无分支的）渲染路径覆盖：`settings_view_data.test.tsx` 的 web 模式用例只断言副标题与复选框存在，未单独验证 Web 端点击「导出」也传 `{includeSecrets}`；因生产码已合并为单一无分支路径、desktop 用例已覆盖该路径，不作 finding。
    - 环境类既有红灯（非本 task 缺陷，按提示不计）：`tests/integration/local-api/server.test.ts > export returns canonical config…`（p237，测试 deps 缺 appVersion + 纯 Node 无 electron）、`tests/unit/ipc/auth-ipc.test.ts` 8 例（p236）；renderer 项目需 `NODE_ENV=test`（d061）。
    - 危险模式扫描：改动过的测试文件未见 `.skip`/`.only`、注释掉断言、删/反转 expect、`expect(true)`、新加 `eslint-disable`/`@ts-ignore`、`.toBeTruthy` 弱化（`config-ipc.test.ts:1350` 的 `toBeTruthy`、`:844` 的 eslint-disable 均为 base 既有、不在本 diff）；断言均为用户可观察行为（界面文案/复选交互、桥接入参、导出 JSON 文件 `secrets` 字段、HTTP 200 + 落盘 override）。
- 总体判断：5 条 AC 全部有锚定 AC 的可观察自动化测试且本轮已实跑通过（renderer 视图 216/216、preload 2/2、config-ipc 52/52、local-api 新增 HTTP 用例 1/1），无 critical/important；仅 1 条 minor 覆盖扩展，不阻断。
- 系统性 follow-up：无（f001 为本 task 局部覆盖项，非跨 task 基础设施/工具链缺口）。

### AC 复验方式

- AC-001：re_verified —— `NODE_ENV=test npx vitest run --project renderer tests/unit/renderer/views/settings_view_data.test.tsx` 3/3 通过；并读 `data_section.tsx:59-75` 确认副标题固定、复选框与警告无条件渲染。
- AC-002：re_verified —— 同上文件 AC-002 用例通过；读 `SettingsView.tsx:259-270` 确认导出统一传 `{ includeSecrets: include_secrets }`。
- AC-003：re_verified —— `npx vitest run --project node tests/unit/preload/config_export_options.test.ts` 2/2 通过；读 `src/preload/index.ts:371-376` 确认 `invoke(CONFIG_EXPORT, options ?? null)`。
- AC-004：re_verified —— `npx vitest run --project node tests/unit/ipc/config-ipc.test.ts -t "handleConfigExport"` 通过；断言默认导出文件无 `secrets`、`includeSecrets:true` 时含 `secrets`。
- AC-005：re_verified —— `npx vitest run --project node tests/integration/local-api/server.test.ts -t "endpoint overrides over HTTP"` 通过（HTTP 200 + `imported:true` + 覆盖落盘），并 `config-ipc.test.ts -t "AC-005"` 通过。
- coverage = re_verified 5 / 5（trust_prior = 0）。

verdict: PASS

## Round 2 (2026-09-16 17:10 UTC+8)

reviewed_scope: d8631d3138d355b9

### 前轮 finding 复核

- `t490_test_f001`（minor，CONFIG_EXPORT 通道 rawOptions→options 桥接无覆盖）：**已消除**。
    - 新增 `tests/unit/ipc/config-ipc.test.ts:540-576`「config:export IPC handler maps the raw options through to the export file」：经真实 `registerConfigIpc(deps)` 从 `ipc_main_mock.handle.mock.calls` 取出注册在 `config:export` 上的 handler，以 `assert_valid_sender` 认可的 senderFrame（`file:///D:/app/out/renderer/index.html#setting`，与 `config-ipc.test.ts:11` 初始化的 renderer index path 精确匹配）实调 `handler(event, { includeSecrets: true })`，断言实写临时文件含 `secrets: {"claude:API_KEY":"sk-real"}`；再调 `handler(event, null)` 断言文件不含 `secrets`。
    - 该断言直接覆盖 `src/main/ipc/config-ipc.ts:620-626` 的桥接：把布尔映射写反（`!== true`）或漏取布尔（恒 `{}`）都会使第一段断言失败，正是 f001 描述的漏检形态，故「修成另一种弱化形式」不成立。
    - 实跑 `npx vitest run --project node tests/unit/ipc/config-ipc.test.ts` → 53/53 通过（较 Round 1 的 52 例多出该用例）。
    - 残余：未断言显式 `{ includeSecrets: false }` 经 handler 的路径（另立本轮 f002，非 f001 遗漏）。

### Findings

#### t490_test_f002 - 桥接用例以非对象 `null` 代表「关闭」态，未覆盖渲染层真实发送的 `{ includeSecrets: false }`

- 严重度：minor
- 锚点：非 AC 缺口；AC-004「未勾选时不含 secrets」的桥接层覆盖扩展项（可再加 case，不阻断）
- 位置：`tests/unit/ipc/config-ipc.test.ts:570-575`
- 问题：桥接用例的关闭态入参是 `null`（非对象，走 `is_record` 假分支 → `{}`），而渲染层实际恒发布尔：`SettingsView.tsx:264-266` 无分支地传 `{ includeSecrets: include_secrets }`。因此在 handler 层，「未勾选」的真实输入 `{ includeSecrets: false }` 无任何断言——若桥接被写成基于「键是否存在」的映射（如 `"includeSecrets" in rawOptions`），本用例两段断言仍会全绿（`{includeSecrets:true}` 段通过；`null` 段因非对象仍得 `{}` 通过），但桌面端未勾选导出会错误写入明文密钥，与 AC-004「未勾选时不含 secrets」相反。属覆盖可更广，非当前实现缺陷（现有 `=== true` 对 `false` 语义正确）。
- 建议：把「关闭」段入参换成真实形态 `{ includeSecrets: false }`，或补一段 `handler(event, { includeSecrets: false })` 断言文件不含 `secrets`；`null`（老 renderer / 误传）可保留为第三段。

### 结论

- 前轮 finding 复核（Round 1 → Round 2）：
    - `t490_test_f001`（minor）：已消除（证据见上「前轮 finding 复核」）；经 `config:export` 真实 handler 触发，无换形式弱化。
- 改测方向复核：无。本轮相对 Round 1 仅新增 f001 的桥接用例（`config-ipc.test.ts:540-576`）与 `task.md` / `docs` 更新，未改动任何既有断言的预期；Round 1 已复核的 AC-004 / AC-005 改测归因仍为「规格变了」，本轮无新增改测。
- 本轮新发现：1 条（f002，minor，非阻断）。
- 未进表的提示：
    - 危险模式扫描（本轮涉及的测试文件 `tests/unit/ipc/config-ipc.test.ts`、`tests/unit/preload/config_export_options.test.ts`、`tests/unit/renderer/views/settings_view_data.test.tsx`、`tests/integration/local-api/server.test.ts`）：无 `.skip`/`.only`、无注释掉断言、无删/反转 expect、无新增 `eslint-disable`/`@ts-ignore`、无 `expect(true)`、无 `toBeTruthy` 弱化；断言均为用户可观察行为（界面文案与复选交互、桥接入参、导出 JSON 文件 `secrets` 字段、HTTP 200 + 落盘 override）。handler 缺失用 `throw`（`config-ipc.test.ts:555`）而非条件跳过，属 fail-loud。
    - 环境类既有红灯（非本 task 缺陷，按 prompt 提示不计）：`local-api server.test.ts > export returns canonical config…`（p237）、`auth-ipc` 8 例（p236）；renderer 项目需 `NODE_ENV=test`（d061）；全量 `pnpm test` 受 p228 abort 限制，本轮按指定文件 / `-t` 过滤运行。
    - 交付完整性：`git status --short` 的未跟踪项 `handoff.json` / `review_code.md` / `review_test.md` 均为流程/报告文件，非交付文件；无 reviewer 不可见的未跟踪交付文件。
- 总体判断：Round 1 唯一 finding（minor）已被真正修复且有可复现断言；本轮仅新增 1 条 minor 覆盖扩展，无未解决的 critical / important。
- 系统性 follow-up：无（f002 为本 task 局部覆盖项，非跨 task 基础设施/工具链缺口）。

### AC 复验方式

- AC-001：re_verified —— `NODE_ENV=test npx vitest run --project renderer tests/unit/renderer/views/settings_view_data.test.tsx` → 3/3 通过（桌面 / Web 两模式的统一副标题、复选框、勾选后红色警告）。
- AC-002：re_verified —— 同上文件 AC-002 用例通过；读 `SettingsView.tsx:264-266` 确认导出无分支恒传 `{ includeSecrets: include_secrets }`。
- AC-003：re_verified —— `npx vitest run --project node tests/unit/preload/config_export_options.test.ts` → 2/2 通过。
- AC-004：re_verified —— `npx vitest run --project node tests/unit/ipc/config-ipc.test.ts` → 53/53 通过（默认无 secrets、`includeSecrets:true` 含 secrets、桥接用例）；读 `config-ipc.ts:474-477` 确认 `includeSecrets: options.includeSecrets === true`。
- AC-005：re_verified —— 同文件 AC-005 用例通过；`npx vitest run --project node tests/integration/local-api/server.test.ts -t "endpoint overrides over HTTP"` → 1 passed | 116 skipped（HTTP 200 + `imported:true` + 覆盖落盘）。
- coverage = re_verified 5 / 5（trust_prior = 0）。

verdict: PASS

## Round 3 (2026-09-16 17:14 UTC+8)

reviewed_scope: 8bfe233d9ebb89f9

### 前轮 finding 复核

- `t490_test_f002`（minor：桥接用例以非对象 `null` 代表「关闭」态，未覆盖渲染层真实发送的 `{ includeSecrets: false }`）：**已消除**。
    - diff 证据：`tests/unit/ipc/config-ipc.test.ts:569-572` 在 `config:export` handler 用例中新增一段——`await handler(invoke_event, { includeSecrets: false })` 后 `expect(JSON.parse(await readFile(exportPath)).secrets).toBeUndefined()`。该入参正是渲染层未勾选时的真实载荷：`src/renderer/views/SettingsView.tsx:263-266` 无分支恒传 `{ includeSecrets: include_secrets }`。
    - 判别力核实：f002 描述的漏检形态是「按 `"includeSecrets" in rawOptions` 映射 Key 存在性」——若桥接如此实现，`{includeSecrets:false}` 会被判为开启而写入 secrets，新增段随即失败；而 `null` 段因非对象走 `is_record` 假分支恒得 `{}`，无法区隔。故新段真正闭合该盲区，且断言为强负断言 `toBeUndefined`，非「换成另一种弱化形式」。
    - 实跑：`node scripts/ensure_sqlite_abi.mjs node && npx vitest run --project node tests/unit/ipc/config-ipc.test.ts` → 53/53 通过（含该段）。
    - `null`（老 renderer / 误传）作为第三段保留在 `:574-580`，与 f002 建议一致。

### Findings

本轮无新 finding。

### 结论

- 前轮 finding 复核（Round 2 → Round 3）：
    - `t490_test_f002`（minor）：**已消除**（证据见上，无换形式弱化）。
    - `t490_test_f001`（Round 1 minor）：Round 2 已核实消除；本轮桥接用例 `config-ipc.test.ts:540-581` 仍在并扩容，无回退。
- 改测方向复核：本轮相对 Round 2 的交付变化仅为 `config-ipc.test.ts:569-572` 新增 `{ includeSecrets: false }` 段；未改动任何既有断言的预期，无「让断言迁就实现」的改测。
- 本轮新发现：0 条。
- 未进表的提示：
    - 危险模式扫描（本轮 delta 仅触及 `tests/unit/ipc/config-ipc.test.ts`）：新增段无 `.skip`/`.only`、无注释掉断言、无删/反转 expect、无 `expect(true)`、无新增 `eslint-disable`/`@ts-ignore`、无 `toBeTruthy` 弱化；`config-ipc.test.ts:889` 的 `@typescript-eslint/unbound-method` 抑制与 `:640` 的既有断言均为 base 存量、不在本 diff。handler 缺失仍以 `throw`（`:555`）fail-loud，非条件跳过。
    - AC-002/AC-001 的 Web 侧仍仅由同一无分支渲染路径覆盖（`settings_view_data.test.tsx` web 用例只断言副标题与复选框存在）；因生产码已合并为单一无分支路径、desktop 用例已覆盖导出入参，仍不作 finding。
    - 环境类既有红灯（非本 task 缺陷，按 prompt 提示不计）：`tests/integration/local-api/server.test.ts > export returns canonical config…`（p237，测试 deps 缺 appVersion + 纯 Node 无 electron）、`tests/unit/ipc/auth-ipc.test.ts` 8 例（p236）；renderer 项目需 `NODE_ENV=test`（d061）；全量 `pnpm test` 受 p228 abort 限制，本轮按指定文件 / `-t` 过滤运行。
    - 交付完整性：`git status --short` 的未跟踪项 `handoff.json` / `review_code.md` / `review_test.md` 均为流程/报告文件，非交付文件；无 reviewer 不可见的未跟踪交付文件。
- 总体判断：Round 2 唯一 finding（minor）已被真正修复且有可复现断言；本轮全量 AC 复验通过，无未解决的 critical / important。
- 系统性 follow-up：无（f001/f002 均为本 task 局部覆盖项，非跨 task 基础设施 / 工具链缺口；`.repo_template/scripts/task.py list` 无对应等价 follow-up）。

### AC 复验方式

- AC-001：re_verified —— `NODE_ENV=test npx vitest run --project renderer tests/unit/renderer/views/settings_view_data.test.tsx` → 3/3 通过（桌面 / Web 两模式统一副标题、复选框存在、勾选后红色警告）。
- AC-002：re_verified —— 同上文件 AC-002 用例通过；读 `SettingsView.tsx:263-266` 确认导出无分支恒传 `{ includeSecrets: include_secrets }`。
- AC-003：re_verified —— `npx vitest run --project node tests/unit/preload/config_export_options.test.ts` → 2/2 通过；读 `src/preload/index.ts:375` 确认 `invoke(CONFIG_EXPORT, options ?? null)`。
- AC-004：re_verified —— `npx vitest run --project node tests/unit/ipc/config-ipc.test.ts` → 53/53 通过（默认无 secrets、`includeSecrets:true` 含 secrets、`config:export` 桥接三态）；读 `config-ipc.ts:476`（`options.includeSecrets === true`）与 `:623-624`（`rawOptions["includeSecrets"] === true`）。
- AC-005：re_verified —— `npx vitest run --project node tests/integration/local-api/server.test.ts -t "endpoint overrides over HTTP"` → 1 passed | 116 skipped（HTTP 200 + `imported:true` + `managed_config` 落盘 override）；`config-ipc.test.ts -t "AC-005"` → 1 passed | 52 skipped。
- coverage = re_verified 5 / 5（trust_prior = 0）。

verdict: PASS
