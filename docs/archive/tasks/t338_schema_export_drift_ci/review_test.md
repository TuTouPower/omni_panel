# Task review t338（reviewer_focus: 测试）

- task：`t338_schema_export_drift_ci`
- spec：`docs/archive/tasks/t338_schema_export_drift_ci/spec.md`
- diff_anchor：`a9ccf1e7eb5d99b020cabee57269b4cf23d35086`
- target：`git diff a9ccf1e7eb5d99b020cabee57269b4cf23d35086`
- round：1
- reviewed_at：2026-08-13 16:30 UTC+8

reviewed_scope: 5673a9bf7dd8d1d4

## Findings

### t338_test_f001 - AC-001/002/003 内容级结构断言未落地为可复现测试，仅靠 CI 漂移门禁 + implementer 自述

- 严重度：important
- 锚点：AC-001 / AC-002 / AC-003；spec 上下文区「测试策略」首条（跑 `export-schemas.ts` 后对两个 JSON 与 zod 源做结构断言：provider 集合、items 键集、顶层键）
- 位置：`docs/archive/tasks/t338_schema_export_drift_ci/handoff.json` `tests`/`ac_evidence` 字段；diff 无测试文件；`.github/workflows/ci.yml:26-28`
- 问题：spec 测试策略明确规划的结构断言测试未提交。diff 不含任何测试文件；现存 `tests/unit/shared/schemas.test.ts` 与 `tests/unit/schemas/plugin-metadata.test.ts` 仅对 zod 源做 fixture `safeParse`，从不读取 `schemas/*.schema.json`。唯一自动化检查是 AC-004 的 CI 新鲜度门禁 `pnpm schema:export && pnpm prettier --write schemas/ && git diff --exit-code schemas/`，它只证明「已提交文件 == 当前源重新导出结果」，不断言导出内容满足 AC-001/002/003。若 zod 源或导出脚本回归（例：从 `usageItemSchema` 移除 `metric_id`、连同重新导出一起提交），CI 照常通过而 AC-002 静默失效——这正是本 task 要防的漂移类问题，但门禁只防「源改未重导」，不防「源与导出一起错」。handoff `tests` 字段声称的「node JSON.parse 校验」「两次导出 hash 一致」「结构断言」均为一次性人工核验，无任何可复现测试产物；按「不信任 implementer 自述」，claim 不等于证据。
- 建议：在 `tests/unit/schemas/` 新增一个 vitest：读取 `schemas/*.schema.json` 并 import zod 源，断言 `items.properties` 含 `metric_id`/`cycleDurationMs`/`error`、顶层含 `login_url`/`cookie_names`、`provider`/`supportedProviders` 的 `pattern` 与源 regex 相等；或直接对 `zodToJsonSchema(...)` 输出与已提交 JSON 做结构 diff。补上后 AC-001/002/003 内容级契约才有独立回归护栏。

### t338_test_f002 - AC-003 字面要求「enum 与 15-provider 现状一致」，实际导出为 regex（处置为改 spec，不计 FAIL）

- 严重度：important（spec 过时，处置为改 spec，不计 FAIL）
- 锚点：AC-003 后半句「`supportedProviders` enum 与 15-provider 现状一致」
- 位置：`schemas/plugin-metadata.schema.json:105-111`；`src/shared/schemas/manifest.ts:14`（`connectorProviderSchema = z.string().regex(/^[a-z][a-z0-9_]*$/)`）
- 问题：实现按 task 核心目标「导出物与 zod 源一致」正确导出 `supportedProviders` 为 `pattern: ^[a-z][a-z0-9_]*$`，与源 `connectorProviderSchema`（open snake_case namespace，t095 自定义 connector 设计）同源。但 AC-003 字面写死「enum 与 15-provider 现状一致」——实现刻意无 enum，字面不满足，且因此不存在任何测试能验证「15-provider enum」。AC 措辞基于陈旧漂移态，实际该字段源是 `connectorProviderSchema`（regex），非 15-provider 的 `usageProviderSchema`。按 review 规则「实现合理但与 spec 描述不符（spec 过时）→ 处置为改 spec，不计 FAIL」。AC-001 有「或改用同源 regex」豁免，AC-003 没有，属契约文本不一致。
- 建议：修订 AC-003 为「`supportedProviders` 与 zod 源 `connectorProviderSchema` 同源一致（regex open namespace）」；若想保留 15-provider 枚举约束，则需先改 zod 源（超出本 task 非范围，须另立 task）。

### t338_test_f003 - handoff.json tests/ac_evidence 与真实验证部分不符

- 严重度：minor
- 锚点：handoff 自述准确性（prompt 专项核查项）
- 位置：`docs/archive/tasks/t338_schema_export_drift_ci/handoff.json` `tests` 字段、`ac_evidence.AC-002`
- 问题：(1) `tests` 声称「导出产物经 node JSON.parse 校验合法；export 幂等性通过两次导出文件 hash 一致验证」——diff 无任何提交测试执行这些，属一次性人工验证，描述易被误读为已提交测试；(2) `ac_evidence.AC-002` 声称「items 为 z.object 默认关闭额外属性，导出 JSON 不含 additionalProperties:true（与 zod 源一致）」——实际导出 items 对象含 `additionalProperties: false`（`schemas/plugin-output.schema.json:138`），且 zod `z.object`（非 strict，`plugin-output.ts:34`）默认语义是「剥离未知键」而非「拒绝未知键」，与 JSON Schema `additionalProperties:false`（拒绝）存在语义差异；该差异是本 task 之前既有的工具确定性输出（anchor 版本已存在，非本次引入），但 handoff 描述「与 zod 源一致」不准确。
- 建议：修正 handoff 描述，如实区分「已提交测试」与「一次性人工核验」，并订正 additionalProperties 的 zod 语义表述；语义层面的 `additionalProperties:false` vs z.object 默认剥离是否构成 AC-002 偏差，建议 code reviewer 评估是否另立 task（见结论未进表提示）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用，本轮为 Round 1。
- 改测方向复核：无——diff 未修改任何既有测试文件（无「迁就实现」的改测）。
- 本轮新发现：3 条（f001 important、f002 important/改spec不计FAIL、f003 minor）。
- 未进表的提示：
    - AC-002「additionalProperties 与 zod 源语义一致」：`additionalProperties: false`（导出 JSON）与 zod 非 strict `z.object` 默认「剥离未知键」语义存在潜在不一致；本次为既有工具输出、非本 task 引入，且 `zod-to-json-schema` 对 non-strict object 的此类输出属已知行为。是否算 AC-002 偏差留待 code reviewer / spec 处置，不在此阻断。
    - CI 门禁误报/漏报扫描结论：门禁本身设计正确。`pnpm check`（含 `format:check` = `prettier --check .`）先于新鲜度步骤运行，已提交 schema 必为 prettier 格式；export 输出 2-space、提交为 4-space（`.prettierrc` tabWidth 4），`prettier --write schemas/` 的归一化是门禁必需环节（缺它会恒误报），非冗余；`git diff --exit-code schemas/` 比较对象（fresh checkout 下 index==HEAD）正确，两文件均被 track，无 untracked 漏检；prettier 不改结构内容，不掩盖真实漂移。仅存在 f001 所述「源+导出一起错」类漏报。
    - 可选的幂等性回归（已手动核验，未提交测试）：导出确定性由 `JSON.stringify` 保证，重跑验证与提交一致。
- 总体判断：CI 门禁（AC-004）实现正确且经 reviewer 复验通过；但 spec 测试策略规划的结构断言测试未交付，AC-001/002/003 内容级契约无独立回归护栏（f001），且 AC-003 契约文本与实际语义不符需改 spec（f002）。f001 未解决 → FAIL。
- 系统性 follow-up：建议标题「schema 导出内容级回归测试（结构断言）」，slug `schema_export_content_assertion_test`，blocking（承接 f001）。AC-003 措辞修订并入 spec 编辑，不单独立 task。

### AC 复验方式

- AC-001：`re_verified` —— 比对 `schemas/plugin-output.schema.json:29-32` `provider.pattern = ^[a-z][a-z0-9_]*$` 与 `src/shared/schemas/plugin-output.ts:43` `z.string().regex(/^[a-z][a-z0-9_]*$/)` 逐字符一致；`usageProviderSchema` 15 项 enum 含 getoneapi/exa/tikhub/grok（`plugin-output.ts:14/17/18/21`）。AC 允许「或改用同源 regex」分支，已满足。
- AC-002：`re_verified` —— `schemas/plugin-output.schema.json:26` `metric_id`、`:92` `cycleDurationMs`、`:118` `error` 均在 items.properties；`additionalProperties` 在 items 层为 `false`（`:138`），与重导出结果一致。语义层面与 zod 默认剥离的潜在差异见未进表提示。
- AC-003：`re_verified` —— `schemas/plugin-metadata.schema.json:116` `login_url`、`:120` `cookie_names` 顶层键存在；`supportedProviders`（`:105-111`）为 regex，与 `connectorProviderSchema`（`manifest.ts:14`）同源。字面「enum 与 15-provider」不符已列 f002。
- AC-004：`re_verified` —— 独立重跑 `pnpm schema:export && pnpm prettier --write schemas/ && git diff --exit-code schemas/`，exit 0，提交产物与重新生成一致；`.github/workflows/ci.yml:26-28` 步骤存在且置于 `pnpm check` 之后。

coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-08-13 16:45 UTC+8)

### 前轮 finding 复核（以 diff 与代码/实跑为准，不采信处置表自述）

- **f001（important，已修）**：已消除。新增 `tests/unit/shared/schema_export_freshness.test.ts`（`git add -N` 后 `git diff a9ccf1e7` 可见，54 行）。实跑 `npx vitest run tests/unit/shared/schema_export_freshness.test.ts` 4/4 通过。机制核验：
    - 深等测试 ×2：`committed_json("../../../schemas/...")` 与源派生 `derived_plugin_*()`（直接 `zodToJsonSchema` 派生）`toEqual`——覆盖「源漂移未重导」与「提交产物与源不一致」。
    - 内容契约测试 ×2：对 derived 断言 items 含 `metric_id`/`cycleDurationMs`/`error`、`provider` 为 `{type:string, pattern:^[a-z][a-z0-9_]*$}`、metadata 顶层含 `login_url`/`cookie_names`——覆盖 f001 指出的「源+导出一起回归」盲区（源移除 metric_id 时即使重导提交，内容契约仍红）。
    - mutation 独立复验：临时在 `tests/unit/shared/` 放置 mutation 测试（从 committed 的 plugin-output 移除 `metric_id` 后 `toEqual` 源派生），vitest 红（`expected {…(2)} to deeply equal {…(2)}`）；验证后删除临时文件与 `.scratch/mutation`，`git status` 恢复干净。f001 盲区闭合。
- **f002（important，改 spec 不计 FAIL）**：已消除。`spec.md` AC-003 措辞改为「`supportedProviders` 与 zod 源一致（同源 regex，新增 provider 自动覆盖）」，与实现（`connectorProviderSchema` regex）一致。
- **f003（minor，已修）**：已消除。`handoff.json` `tests` 字段改为引用已提交测试文件并注明 4/4 通过；`ac_evidence.AC-002` additionalProperties 表述修正为「来自 zod-to-json-schema 对 z.object 的默认输出（比 zod runtime strip 语义更严，为基线既有行为、非本 diff 引入）」。

### 改测方向复核

无迁就实现的改测——本 task 未修改任何既有测试文件，仅新增 `schema_export_freshness.test.ts`。

### 本轮新发现

### t338_test_f004 - 测试复制 export 脚本 $schema 前缀逻辑并硬编码 dialect

- 严重度：minor
- 锚点：无 AC 违反；测试基础设施脆弱性
- 位置：`tests/unit/shared/schema_export_freshness.test.ts:15-17,25-28`（`SCHEMA_DIALECT` 硬编码 `http://json-schema.org/draft-07/schema#`）
- 问题：`derived_plugin_output/metadata` 用 `{ $schema: SCHEMA_DIALECT, ...zodToJsonSchema(...) }` 复制了 `scripts/export-schemas.ts:9-18` `stringifyJsonSchema` 的 dialect 提取逻辑，但 export 侧是「取 zodToJsonSchema 输出的 `$schema`，缺失才 fallback draft-07」，测试侧是硬编码 draft-07。当前 zod-to-json-schema 3.25.2 输出 draft-07（实跑深等绿证明两者一致），但该依赖升级输出新 dialect 时，export 产物会跟随新 dialect，测试仍硬编码旧值 → 深等误红。不掩盖当前真实漂移，仅未来升级误报风险。
- 建议：`derived_plugin_*` 从 `zodToJsonSchema(...)` 输出中提取 `$schema` 再展开（与 export 同口径），消除硬编码。

### t338_test_f005 - 内容契约锚定字段 = AC 子集，非 AC 字段「源+导出一起回归」仍漏

- 严重度：minor
- 锚点：覆盖可更广（f001 修复已覆盖 AC-001~003 锚定字段，此为扩展建议）
- 位置：`tests/unit/shared/schema_export_freshness.test.ts:41-52`（内容契约仅锚定 metric_id/cycleDurationMs/error/provider + login_url/cookie_names）
- 问题：内容契约只锚定 AC 列出的字段。若未来 zod 源增删非 AC 字段（例：移除 `stale`、改 `usageSourceSchema` enum）并连同重新导出一起提交，深等仍绿（committed==derived）、内容契约绿、CI 门禁绿，漂移静默通过。f001 修复覆盖了 AC-002 举例的 metric_id 场景，但对非 AC 字段不设防。属「可再补一个 case」，不阻断。
- 建议：将内容契约扩展为对 items 键集合、`usageSourceSchema` enum、chart 结构等全量锚定；或未来 schema 维护 task 中整体转向 golden-file + 源派生 diff。

### 结论

- 前轮 finding 复核：f001 已消除（新测试实跑 4/4 绿 + mutation 独立复验红）；f002 已消除（改 spec，AC-003 措辞与实现对齐）；f003 已消除（handoff 修正）。
- 改测方向复核：无。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：AC-002 additionalProperties 语义差异（zod runtime strip vs JSON Schema reject）仍为基线既有行为、非本 diff 引入，建议 code reviewer 侧确认是否单列 follow-up；内容契约测试断言 derived 而非 committed，深等红时内容契约仍绿，但深等已阻断，不构成漏报。
- 总体判断：前轮 3 finding 全部确认修复/处置；本轮仅 2 条 minor（非阻断）。无未解决 critical / important。
- 系统性 follow-up：无（f005 属覆盖增强，可在既有 schema 维护 task 内消化，不单独立 task）。

### AC 复验方式

- AC-001：re*verified —— 内容契约锚定 `provider` 为 `{type:string, pattern:^[a-z]a-z0-9*]\*$}`（`schema_export_freshness.test.ts:46`），与 `plugin-output.ts:43` 源 regex 一致；深等测试保证 committed 与源派生一致。
- AC-002：re_verified —— 内容契约断言 items 含 metric_id/cycleDurationMs/error（`:43-45`）实跑通过；mutation 复验移除 metric_id 后深等红。
- AC-003：re_verified —— 内容契约断言 metadata 顶层 login_url/cookie_names（`:49-50`）实跑通过；supportedProviders 与源 regex 同源由深等覆盖；spec AC-003 措辞已与实现对齐（f002 处置）。
- AC-004：re_verified —— Round 1 已实跑 CI 门禁命令（export+prettier+diff exit 0）且 schema 文件 Round 2 未变；Round 2 确认新测试在 `pnpm test` include 范围（tests/unit/shared/\*\*）内可执行（实跑 4/4）。

coverage = 4 / 4

reviewed_scope: 9bf56a33eed674b1

verdict: PASS
