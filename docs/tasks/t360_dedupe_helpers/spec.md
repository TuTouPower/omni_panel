# Task spec

## 背景

多处重复 helper/映射/分层收敛点：(1) source→agent 派生助手分散在 session-library-utils/markdown/slots 多文件；(2) `pick_text_from_content` 在 claude/grok/kimi 三端逐字复制；(3) `net-client.ts` 的 do_request/get_raw 重复约 80 行请求前奏/错误处理；(4) exa/mimo 连接器内联 helper 重复且「无 limit」状态语义漂移（exa "unknown" vs mimo "normal"）；(5) probe/poll 执行器构造 ScriptObservation 同构重复；(6) `is_auth_error` 经两层再导出；(7) use_connector_catalog 反向依赖 view 模块；(8) config_redaction 密钥名正则两处维护；(9) useTheme/useGlobalTheme 重复实现；(10) AUTO_CLOSE_MS 跨进程双份手工同步；(11) grok/kimi 活跃实例 id 提取重复 4 份；(12) 面板最小尺寸常量重复。

## 契约区

### 范围

- 抽共享 `source_meta(source)`（返回 friendly/slug/abbrev/accent/vendor_id），各处消费。
- 抽共享 `pick_text_from_content` 与「按行解析+字节游标」通用 helper。
- 抽 `perform_request` 收敛 net-client do_request/get_raw 重复。
- 在 `compile_script` 注入共享数值/状态 helper（如 ctx.util），统一「无 limit」状态约定（建议 unknown）。
- 抽 `build_single_observation` 共享 probe/poll 构造。
- 统一 `is_auth_error` 直接 import、AUTO_CLOSE_MS 单一常量、active_instance_ids helper、窗口最小尺寸单一来源。

### 非范围

- 不改各 helper 的行为语义。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：上述重复 helper/映射收敛为单点实现，重构后既有测试全通过（行为不回归）。
- [ ] AC-002：exa/mimo「无 limit」状态语义统一（不再 "unknown"/"normal" 漂移）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：既有相关单测回归 + 新增「语义统一」断言。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`session-library-utils.ts:15`、`claude-code-extractor.ts:14`、`net-client.ts:245`、`exa/connector.ts:6`、`mimo/connector.ts:39`、`probe-executor.ts:189`、`provider_card_states.tsx:141`、`use_connector_catalog.ts:5`、`config_redaction.ts:2`、`theme.ts:59`、`WebLoginSection.tsx:14`、`index.ts:545`、`window-bounds.ts:142`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 纯收敛重构不新增行为测试，以既有测试回归为准。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 复用既有单测（extractor/net-client/connector/theme），断言收敛后输出一致。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：抽象 helper 与某一端隐式差异被抹平。
- 回退：helper 参数化差异点（record 字段、header 规则），各端只留厂商专属映射。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
