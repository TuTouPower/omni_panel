# Task review t360（reviewer_focus: 通用）

- task：`t360_dedupe_helpers`
- spec：`docs/tasks/t360_dedupe_helpers/spec.md`
- diff_anchor：`71e550869829dbb7d79e0833a392691cbe442b3c`
- target：`git diff 71e550869829dbb7d79e0833a392691cbe442b3c`
- round：1
- reviewed_at：2026-08-14 02:45 UTC+8

## 验证基线

- `npx tsc --noEmit`：通过。
- `npx eslint src connectors tests --max-warnings=0`：通过（0 warning）。
- `npx vitest run tests/unit tests/integration`：261 文件 passed，3081 passed / 9 skipped（与 handoff 声称一致）。
- 抽查变更触及路径：net-client 38、mimo 10、refresh-service 30、error-classification 5、use_connector_catalog 8、session-history 139、theme 25、probe/poll 13、auth-error —— 全绿。

## Findings

### t360_gen_f001 - agent_abbrev 字节级重复未收敛

- 严重度：minor
- 锚点：AC-001（范围 item 1：source→agent 派生助手收敛为单点实现）；review_intensive 源即 `session-library-utils.ts:15`（agent_abbrev）
- 位置：`src/renderer/components/session-library/session-library-utils.ts:15` 与 `src/renderer/components/workspace/SelectionTray.tsx:18`
- 问题：两处 `agent_abbrev(source)` 实现逐字相同（claude_code→"C"/opencode→"OC"/kimi_code→"K"/grok→"G"/未知→slice(0,2).toUpperCase()）。handoff 以「其余按输出域分派（调查确认不能并入单表）」为由不合并 source→agent——该理由对 friendly/slug（markdown.ts 单源）、accent/vendor_id（slots.ts 单源）成立，但覆盖不了这份字节级双份：agent_abbrev 语义单一（显示缩写），无输出域差异，本可并入 markdown.ts 或 slots.ts 单点。t360 未交付范围 item 1 的 source_meta 单表，且遗漏了该真实重复。
- 说明：非本 task 引入、SelectionTray 亦不在 review_intensive 列出的文件集合内，不阻断；但属 spec 范围字面目标的未完成项，建议在收敛路径上补一处（移入共享模块双端 import），或登记 pending 明确搁置。
- 建议：将 `agent_abbrev` 收敛进现有单源模块（如 `markdown.ts`），SelectionTray 与 session-library-utils 均改 import；或经 pending 登记后暂搁。

### t360_gen_f002 - theme.ts 文件级 rules-of-hooks disable 范围过大

- 严重度：minor
- 锚点：行为缺陷（robustness，无对应 AC）
- 位置：`src/renderer/lib/theme.ts:1`
- 问题：`/* eslint-disable react-hooks/rules-of-hooks */` 为文件级整段关闭。经 `eslint --no-inline-config` 实测：当前确有必要——snake_case 的 `use_theme_events`（70-92 行）不被 eslint-plugin-react-hooks v7 识别为自定义 hook（命名须 `use`+大写），其中 5 处 hook 调用会产生 6 个 false-positive（useRef/useCallback×2/useEffect/useMemo），故 disable 非死代码。但文件级范围同时关闭了 `useTheme`/`useGlobalTheme`（94-161 行）两条真实 hook 出口的规则守护，未来若在其中误写条件 hook 会被静默放过。订阅样板运行时行为正确（实测 25 个 theme 测试全绿）。
- 建议：把 disable 收窄到 `use_theme_events` 函数体内各 hook 调用（`// eslint-disable-next-line react-hooks/rules-of-hooks`），保留 `useTheme`/`useGlobalTheme` 的规则覆盖。

### t360_gen_f003 - config_redaction 两处正则非真重复，spec item-8 前提误判

- 严重度：minor（spec 过时，处置为改 spec 上下文区）
- 锚点：范围 item 8「config_redaction 密钥名正则两处维护」未收敛——经核实不收敛正确
- 位置：`src/shared/lib/config_redaction.ts:2`（SECRET_KEY_PATTERNS 数组）与 `src/shared/lib/logger.ts:23`（SECRET_KEY_PATTERN 单正则）
- 问题：两处并非同一正则的两份拷贝，而是两种不同 redaction 策略：config_redaction 按「配置参数字段名」决定是否抹值（name-keyed，含 passphrase/private_key/certificate 等配置字段），logger 按「序列化文本中的值 pattern」做 scrub（含 authorization/session 等日志值关键字，且带 `(^|_|-|\b)` 边界语义）。消费方、匹配口径、覆盖集均不同；强制合并会互相污染导致过度/不足脱敏。spec 把其描述为「两处维护」属误判。
- 建议：改 spec 上下文区，将 item-8 标注为非真重复（不同消费方），不要求收敛；实现保持现状。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：3 条（均 minor）。
- 未进表的提示：无。
- 总体判断：12 项收敛中 11 项已单点化且行为等价（net-client perform_request 参数化未把 content-length/HTML/json 守卫泄漏进 get_raw，日志逐字保留；pick_text 三端字节级一致；build_single_observation 仅 window/source 参数化；is_auth_error 去再导出后零消费残留；AUTO_CLOSE_MS 单一常量 1500 跨进程一致；active_instance_ids_for_provider 与原 4 处逐字等价含 def 缺失回退 []；窗口常量 472/480/360 各消费点取值不变；mimo AC-002 "normal"→"unknown" 与 exa 统一且断言同步，属 spec 明示行为变更非回归）；mimo 无 limit 语义统一；仅 source-agent 的 agent_abbrev 一份真实双份遗漏与两处 minor 质量点，均不阻断。全量 3081 测试绿。
- 系统性 follow-up：无。

verdict: PASS
