# Task review t338（reviewer_focus: 代码）

- task：`t338_schema_export_drift_ci`
- spec：`docs/archive/tasks/t338_schema_export_drift_ci/spec.md`
- diff_anchor：`a9ccf1e7eb5d99b020cabee57269b4cf23d35086`
- target：`git diff a9ccf1e7eb5d99b020cabee57269b4cf23d35086`
- round：1
- reviewed_at：2026-08-13 13:50 UTC+8

reviewed_scope: 5673a9bf7dd8d1d4

## Findings

### t338_code_f001 - spec AC-003「supportedProviders enum 与 15-provider 现状一致」措辞过时，实现以同源 regex 忠实导出

- 严重度：minor
- 锚点：AC-003 文字要求 vs 实际 zod 源；spec 上下文区「可测试性声明」未覆盖此歧义
- 位置：`schemas/plugin-metadata.schema.json:109`（`supportedProviders` items 的 `pattern`）；`src/shared/schemas/manifest.ts:13`（`connectorProviderSchema`）
- 问题：`supportedProviders` 的 zod 源是 `z.array(connectorProviderSchema)`，而 `connectorProviderSchema = z.string().regex(/^[a-z][a-z0-9_]*$/)`（`src/shared/schemas/manifest.ts:13`）。因此重导出后 `supportedProviders` 必然是 regex pattern，而非 spec 文字所述的「15-provider enum」。AC-001 对 provider 字段有「或改用同源 regex」的显式豁免，实现满足；但 AC-003 未带该豁免，字面要求无法在「不改 zod 源」范围内满足（把导出物硬编成 15-enum 反而会与源分叉，违背任务前提）。经查 `docs/specs/connector-user-scripts.md:8` 与 `docs/archive/tasks/t095_user_custom_connector_support/review_code.md:129`，源内 provider/supportedProviders 走 regex 是既有设计决策（`usageProviderSchema` enum 仅作窄类型保留，不用于 runtime 过滤），非本次引入。属「实现合理但与 spec 描述不符（spec 过时）」。
- 建议：修订 spec AC-003 措辞为「`supportedProviders` 与 `connectorProviderSchema` 同源（regex），非硬编码 enum」，并同步 AC-001/AC-003 上下文区对「同源 regex」的说明；不改实现。

### t338_code_f002 - handoff AC-002 证据对 `additionalProperties` 语义表述不精确（strip vs reject），导出物 `additionalProperties:false` 比 zod runtime 更严

- 严重度：minor
- 锚点：AC-002「additionalProperties 与 zod 源语义一致」
- 位置：`docs/archive/tasks/t338_schema_export_drift_ci/handoff.json:18`；`schemas/plugin-output.schema.json:133`（items `additionalProperties: false`）
- 问题：handoff 声称「items 为 z.object 默认关闭额外属性，导出 JSON 不含 additionalProperties:true（与 zod 源一致）」。事实上 `usageItemSchema`（`src/shared/schemas/plugin-output.ts`）为裸 `z.object()`，zod 默认 **strip** 语义——未知键被静默剔除、**不报错**；只有 `.strict()` 才拒绝未知键。而 `zod-to-json-schema` 默认 `additionalPropertiesStrategy: "strict"`，对裸 `z.object()` 仍输出 `additionalProperties: false`，使 JSON Schema 对 usageItemSchema 的校验严于 zod runtime（多出未知键时：zod 接受并剔除，JSON Schema 校验拒绝）。该现象为工具默认行为且**基线即存在**（`a9ccf1e7` 版 items 已是 `additionalProperties: false`，本 diff 未改变），对 plugin-metadata 顶层（`.strict()`）则完全忠实。本次任务范围「重跑 export、不改 zod 源」不包含调整导出选项，故非本 diff 引入的回归，但 handoff 的语义表述不准确。
- 建议：handoff 措辞改为「导出遵循 zod-to-json-schema 默认 strict 策略，对 strip 模式 z.object 输出 additionalProperties:false（工具默认，比 runtime 更严）」；如需严格对齐 strip 语义，属超出本 task 范围的 follow-up（改 `export-schemas.ts` 的 `additionalPropertiesStrategy` 为 strip 或加说明），建议 `pending`/spec 上下文区登记。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮 Round 1）
- 本轮新发现：2 条（均 minor，无 critical/important）
- 未进表的提示：
    - 文件过大：无。`schemas/*.schema.json` 为生成物，按「文件过大标准」排除计量；`ci.yml` 77 行、`handoff.json` 31 行，均远低于阈值。
    - 圈复杂度：无新增函数/业务分支（仅 CI YAML 步骤 + 生成 JSON）。
    - 范围外观察：CI 门禁 `git diff --exit-code schemas/` 仅覆盖已跟踪文件；若未来 `export-schemas.ts` 新增导出文件（未跟踪），不会被该 diff 捕获。当前脚本固定写 2 个文件，无现行影响，仅作提示。
    - 安全审视：diff 未引入外部输入、secret、注入面；CI 步骤为本地只读门禁，无敏感数据落盘。
    - 契约/Breaking：`provider`/`supportedProviders` 由硬编码 enum 放宽为 regex pattern，为超集放宽，非破坏性；运行时权威仍是 zod，消费方不受影响。
- 总体判断：实现忠实满足 AC-001~004（重导出消除漂移 + CI 新鲜度门禁正确，独立复验通过）；仅 spec AC-003 措辞过时与 handoff 语义表述不精确两条 minor，无未解决 blocking。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified` — 在 `.scratch` 临时目录重跑 `tsx scripts/export-schemas.ts` + `prettier --write schemas/`，产物与提交版 byte 级一致；`provider` pattern `^[a-z][a-z0-9_]*$` 与 `src/shared/schemas/plugin-output.ts:43` `z.string().regex` 同源；`usageProviderSchema` enum 含 15 provider（getoneapi/exa/tikhub/grok 在位）。
- AC-002：`re_verified` — 重导出产物一致；items `properties` 含 `metric_id`（:26）、`cycleDurationMs`（:92）、`error`（:118），required 列表与源内非 optional 字段吻合。（`additionalProperties` 语义细节见 f002。）
- AC-003：`re_verified` — 重导出产物一致；`login_url`（:116）/`cookie_names`（:120）顶层键在位；`supportedProviders` pattern 与 `connectorProviderSchema`（`manifest.ts:13`）同源。
- AC-004：`re_verified` — `.github/workflows/ci.yml:26-28` 新增 `Check schema freshness` 步骤：`pnpm schema:export && pnpm prettier --write schemas/ && git diff --exit-code schemas/`。`pnpm prettier` 解析为二进制（3.8.3）可用；重导出+prettier 后与提交版无 diff（`git diff --exit-code schemas/` 应返回 0），zod 源漂移时导出物变化即触发失败。门禁语义正确。

coverage = 4 / 4

verdict: PASS

## Round 2 (2026-08-13 14:00 UTC+8)

- 本轮 code-scope 无代码改动：`.github/workflows/ci.yml` 与 `schemas/*.schema.json` 相对 HEAD（34cf3928）工作树干净（`git status --porcelain` 未列出），与 Round 1 审查内容一致。新增 `tests/unit/shared/schema_export_freshness.test.ts` 属 test-scope（test reviewer 职责），但其纳入指纹计算使 code-scope 指纹变化（stale 根因）。
- 前轮 finding 复核（以 diff 为准）：
    - t338_code_f001（minor，spec AC-003 措辞过时）：已修。`docs/archive/tasks/t338_schema_export_drift_ci/spec.md` AC-003 现为「`supportedProviders` 与 zod 源一致（同源 regex，新增 provider 自动覆盖）」，采纳同源 regex 表述，与 Round 1 建议一致。
    - t338_code_f002（minor，handoff additionalProperties 语义表述）：已修。`handoff.json` AC-002 证据改为「additionalProperties 说明：导出物 items 为 additionalProperties:false，来自 zod-to-json-schema 对 z.object 的默认输出（比 zod runtime strip 语义更严，为基线既有行为、非本 diff 引入）」，与 Round 1 建议措辞一致。
- 本轮新发现：0 条。7 视角正交体检均已扫过：安全（无新增输入/secret/注入面）、正确性（code-scope 未变，Round 1 已复验）、契约·Breaking（provider 放宽为 regex 超集，非破坏）、性能·资源（无新增路径）、架构·可维护性（无新增代码）、健壮性·可观测（CI 门禁幂等只读）、测试·文档·规格（spec/handoff 已按 f001/f002 修订）。
- 未进表的提示：无新增（Round 1 提示项沿用：CI `git diff --exit-code schemas/` 仅覆盖已跟踪文件；当前 `export-schemas.ts` 固定写 2 文件，无现行影响）。
- 总体判断：前轮 2 条 minor 均已按建议处置（spec/handoff 修订）；code-scope 无代码改动，无未解决 critical/important。

reviewed_scope: 9bf56a33eed674b1

verdict: PASS
