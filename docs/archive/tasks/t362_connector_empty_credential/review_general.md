# Task review t362（reviewer_focus: 通用）

- task：`t362_connector_empty_credential`
- spec：`docs/tasks/t362_connector_empty_credential/spec.md`
- diff_anchor：`0b5a7f030d9d08205f7b555d75eb998a239528b7`
- target：`git diff 0b5a7f030d9d08205f7b555d75eb998a239528b7`
- round：1
- reviewed_at：2026-08-14 03:26 CST

## Findings

### t362_gen_f001 - kimi「遗留 API Key 兼容」声明不成立：manifest 移除参数后 connector 的 API_KEY 回退在生产不可达

- 严重度：minor
- 锚点：行为缺陷（范围项 3「从 manifest 移除」已落地，但「connector 仍读 ctx.params.API_KEY 兼容遗留配置」的自述与实际不符）
- 位置：`connectors/kimi/manifest.json:5-14` + `src/main/core/scheduler/refresh-service.ts:117-145` + `connectors/kimi/connector.ts:62-63`
- 问题：`build_params` 只遍历 `definition.manifest.parameters`（`refresh-service.ts:117`），把 manifest 未声明的键从 `ctx.params` 中排除（含 vault 读取 `refresh-service.ts:126`）。移除 kimi manifest 的 `API_KEY` 参数后，遗留 vault/配置中的 API_KEY 不再注入 `ctx.params`，`connector.ts:63` 的 `ctx.params["API_KEY"]` 在生产恒为 `undefined` → 仅 `OAUTH_TOKEN` 参与 token 判定。`connector.ts:66` 的 `Missing required secret: OAUTH_TOKEN or API_KEY` 只对两者皆空才触发，语义未变，但「OAUTH_TOKEN → API_KEY 回退」这条链在生产已死：遗留 API_KEY-only 账号由「之前能用」变「报错缺凭据」。测试（`kimi-connector.test.ts:139,146,165`）直接向 `ctx.params` 注入 API_KEY，绕过了 `build_params`，故脚本层回退仍被覆盖，掩盖了生产路径已断这一事实。
- 建议：接受「API_KEY 弃用」为 spec 决策的必然结果，修正 `connector.ts:60-61` 注释与 handoff 措辞（回退仅测试注入可见，非遗留配置）；或在 manifest 保留 `API_KEY` 参数（可选）以维持旧注入路径。二者取一，避免注释与真实行为漂移。

### t362_gen_f002 - 生效 spec `connector-auth.md` kimi 行 API_KEY fallback 描述过期

- 严重度：minor
- 锚点：文档/配置一致性
- 位置：`docs/specs/connector-auth.md:45`（`docs/specs_index.md:27` 在表生效）
- 问题：该表仍写 kimi「token 读取 OAUTH_TOKEN -> API_KEY 回退；API_KEY 为可选 fallback，保留 apikey 登录路径」。manifest 已移除 `API_KEY` 参数且 `build_params` 不再注入（见 f001），「保留 apikey 登录路径」在 UI 与配置注入两层均不再成立。t362 的 Finalization 范围仅列 `connector-direct.md`，此项未被同步。
- 建议：按 f001 的取舍同步 `connector-auth.md:45`，标注 API_KEY 回退已随 t362 移除（或随 f001 保留参数则改回）。

### t362_gen_f003 - antigravity manifest 未标注 stub，添加阶段仍按可用 local 连接器呈现

- 严重度：minor
- 锚点：AC-002 边界（运行时可见已满足，添加时「不误导」仅部分满足）
- 位置：`connectors/antigravity/manifest.json:3-9`（`capabilities: ["local"]` + `local.paths` 无 stub 标记）
- 问题：AC-002「占位状态对用户可见，不误导为可用」核心已满足——connector `main()` throw「暂不支持」（`antigravity/connector.ts:10-11`），经 `refresh-service.ts:182` rethrow → catch（`refresh-service.ts:394-395`）写入账号 `last_error`，UI 显示失败而非静默「正常」。但 manifest 未加 stub 标记，`capabilities:["local"]` 与 `local.paths` 仍会让添加对话框把 antigravity 当作普通本地连接器展示；用户须添加并触发一次刷新后才看到「暂不支持」。spec 范围项 2 的「manifest/添加对话框明示『暂不支持』」仅以运行时错误间接达成。
- 建议：可选加固——manifest 增加 `description` 字段标注占位 stub（或添加对话框对 stub connector 加提示），将「不可用」前移到添加阶段；不改亦不违反 AC-002（运行时可见已达标）。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：3 条（均 minor）
- 未进表的提示：antigravity 连接器 `~/.antigravity/session.json` 读取路径为 spec 明示 `UNVERIFIED-SPIKE`，本次仅 stub 化、不实现读取，符合 spec「风险与回退」决策，不算缺口。kimi-connector.test.ts:139/146/165 仍注入 `ctx.params.API_KEY` 测脚本级回退，属脚本单测语义，非误用，已在 f001 说明。
- 总体判断：AC-001（deepseek/tikhub 空 key throw，含 trim 后空串）、AC-002（antigravity stub throw + 测试断言 error 含「暂不支持」）均实现并有断言触达可观察行为；kimi manifest API_KEY 移除符合范围项 3；`docs/specs/connector-direct.md` 已同步 antigravity/kimi 两行。`npx tsc --noEmit`、`npx eslint connectors tests/integration/connector --max-warnings=0` 全绿；`npx vitest run tests/integration/connector` 21 文件 232 passed。无未解决 critical/important，仅 minor 文档与注释准确性项。
- 系统性 follow-up：无（f001/f002 可在后续维护或 t362 后续任务一并处理）

verdict: PASS
