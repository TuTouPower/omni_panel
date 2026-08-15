# Task review t395（reviewer_focus: 通用）

- task：`t395_cli_json_contract_refine`
- spec：`docs/tasks/t395_cli_json_contract_refine/spec.md`
- diff_anchor：`c3676a63db55e089690aba2cebc3c89d096931a7`
- target：`git diff c3676a63db55e089690aba2cebc3c89d096931a7`
- round：1
- reviewed_at：2026-08-15 09:49 UTC+8

## Findings

### t395_gen_f001 - 新增测试用例未过 prettier 格式（format:check 门禁红）

- 严重度：minor
- 锚点：AC-003 用例落地；spec「测试策略」声明脚本类型由 typecheck + 格式检查覆盖
- 位置：`tests/unit/main/cli/cli_json_parse.test.ts:118-120, 133-135, 148-150`
- 问题：三个新增用例（url/pid/userData-startedAt）用多行 `temp_cli_json(\n JSON.stringify(...),\n)`，但单行化后均 < printWidth 100，`prettier --check` 会将其折叠成单行。实测 `npx prettier --check` 对本文件报错，且基线版本（`c3676a63` 该文件）经仓库内 .prettierrc 校验为干净——格式回归由本 task 引入。`pnpm format:check`（`prettier --check .`）在改动文件上变红。lint-staged 对 `*.{ts,tsx}` 配了 `prettier --write`，说明提交时钩子未生效或未覆盖到本文件。
- 建议：`prettier --write tests/unit/main/cli/cli_json_parse.test.ts` 后重提，使三处调用折叠为单行。

### t395_gen_f002 - handoff AC-001 证据「grep 全仓仅此一处」与实际不符

- 严重度：minor
- 锚点：AC-001（契约单一来源）
- 位置：`docs/tasks/t395_cli_json_contract_refine/handoff.json`（ac_evidence.AC-001 首条）；`src/main/cli/cli-json.ts:11`
- 问题：handoff 断言「export interface CliInstanceInfo 唯一定义（grep 全仓仅此一处）」。实际全仓 grep 到两处 `export interface CliInstanceInfo`：`scripts/cli_json_parse.d.mts:1` 与 `src/main/cli/cli-json.ts:11`（字段形态一致）。任务声明的范围（scripts/ 三文件）内单一来源已达成：.d.mts 是 scripts 侧唯一定义，cli_json_parse.mjs / omni_panel.mjs 均以 `import("./cli_json_parse.d.mts").CliInstanceInfo` 引用，手写 @typedef 全删（grep 0 残留）。但「全仓仅此一处」陈述为假，且 AC-001 字面「定义只存在于 .d.mts 一处 / 字段增减只需改一处」在全仓维度不成立——src/ 侧 cli-json.ts 是生产者型，字段增减仍需改两处。属范围内正确、证据表述失实的文档准确性问题。
- 建议：二选一——(a) 接受「scripts 侧单一来源」解释，修正 handoff 证据文字为「scripts/ 侧唯一，src/main/cli/cli-json.ts 为生产者侧既有类型，不在本任务范围」；(b) 若坚持全仓单一来源，另立 task 统一 src/main/cli/cli-json.ts 与 .d.mts（超出本任务范围，需单独立项）。

## 结论

- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - 数组根用例断言与解析实际行为一致（数组 typeof object 非 null → 通过根节点检查落到字段校验报缺 port），非「改预期迁就实现」反模式；用例直呼 parse 无 try/catch，若解析改为抛 TypeError 测试即红，真防透传。AC-003 四用例均触达生产逻辑，11 用例全绿。
  - 脚本侧 import() 类型引用在 tseslint type-checked（projectService scripts/*.mjs）下通过：`npx eslint` 改动文件 0 告警、`tsc --noEmit` EXIT=0、改动脚本 prettier 干净——spec「风险」节（tsx/esbuild 不支持 .d.mts 导入需换方案）未触发。
  - omni_panel.mjs 删 candidate typeof 后行为不变（join 恒 string，链路 data_root → candidate → parse_cli_json 均 string）。
- 总体判断：AC-001（范围内）/AC-002/AC-003 全部落实，范围无偏航，测试可信；仅 2 条 minor（测试格式门禁红 + handoff 证据措辞失实），均不影响行为与验收实质。
- 系统性 follow-up：src/main/cli/cli-json.ts 与 scripts/cli_json_parse.d.mts 双 interface 的漂移风险（f002），是否统一由用户定夺，建议登记 pending。

verdict: PASS

reviewed_scope: 76e23eb7e988f8a9
