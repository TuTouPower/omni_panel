# Task review t325（reviewer_focus: 通用）

- task：`t325_web_renderer_log_ingest`
- spec：`docs/tasks/t325_web_renderer_log_ingest/spec.md`
- diff_anchor：`bfd2b6678e001a2b1575b0888f9ac4726a7499df`
- target：`git diff bfd2b6678e001a2b1575b0888f9ac4726a7499df`
- round：1
- reviewed_at：2026-08-12 21:05 UTC+8

## Findings

### t325_gen_f001 - 无鉴权区策略注释与新增写端点不一致，存在维护回退风险

- 严重度：minor
- 锚点：行为缺陷（未来维护场景）——非 AC 违反；AC 范围内实现合规
- 位置：`src/main/core/local-api/server.ts:1018-1019`（与新增 `server.ts:1064` 对照）
- 问题：`handle_request` 顶部策略注释写明「Web read endpoints … without auth … ingest stays token-gated below」，但 t325 把写端点 `POST /v1/logs/renderer` 放入 `check_auth` 之前（无鉴权区），成为「非 read、未 token-gate」的端点。放置本身合规（spec 范围区明确要求「与 /v1/logs/export 同层」，web 桥无 token 故必须无鉴权），且 1063 行内注释已说明理由；但顶部策略注释未同步，后续维护者读到「ingest stays token-gated」可能把该端点误判为放错位置而移入鉴权区，导致无 token 的 web 桥 log POST 全部 401，静默失能。
- 建议：在顶部策略注释补一句例外说明（renderer 日志接收为有意的无鉴权写端点，与 /v1/logs/export 同层），或把 1063 行注释中「与 /v1/events、/v1/logs/export 同层」的理由并入顶部注释，消除歧义。

## 结论

- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 端点鉴权：local-api 绑定 `0.0.0.0`（server.ts:1576），`POST /v1/logs/renderer` 在无鉴权区，局域网任意设备可写入任意 `renderer:*` 日志行（log forging / 刷日志）。此风险 spec 上下文区已明确列出并批准（「端点未认证可能被滥用刷日志」，回退：端点可下线；且 /v1/session/login 等写端点本就在无鉴权区），按规则不升级为 finding，仅记录。若后续收紧，建议限回环或加轻量 token。
    - 测试断言经 mock transport（数组 push）而非真实文件 transport；但 `emit` 同步把 scrub 后的 message/meta 透传给全部 transport，file transport 仅是 `create_record` 薄包装，断言路径与落盘路径一致，属仓库既有日志测试模式，非缺口。
    - `process.env["NODE_ENV"]` 在单测中改为 development 并 finally 恢复，隔离良好，无泄漏。
- 总体判断：实现正确、AC 覆盖完整、测试可信、无未解决 critical/important；1 条 minor 建议改进注释。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（web 日志落盘 renderer:\* 前缀）：`re_verified`。重跑 `pnpm vitest run tests/integration/local-api/server.test.ts -t "renderer log ingest"` → 4 passed；用例断言 `POST /v1/logs/renderer` 返回 200，且 transport 收到 `renderer:web-panel`、message、meta（module 前缀与桌面 `log-ipc.ts:19` 同构）。
- AC-002（合法返回成功 / 非法 payload 不落盘不抛错）：`re_verified`。用例对 5 种非法 payload（非对象 null/"plain string"/42、缺 module、module/message 类型错）全断言 200 且 `log_lines` 无 `renderer:` 行；独立用例断言畸形 JSON `{` 返回 400（`read_json_body` 路径，server.ts:213-218）。非法 payload 200 由 `handleRendererLog` 容错（log-ipc.ts:10-13 返回 ok）保证，web 桥只发合法 JSON.stringify 故 400 分支不触发。
- AC-003（secret scrub）：`re_verified`。用例 `scrubber.register("renderer-secret-token-abc")` 后 POST message 与 meta.token 均含该值，断言输出 `not.toContain` 该明文；message 走 `scrub_text`（logger.ts:190），验证的是注册值 scrub 而非 key 模式（meta.token 另被 `SECRET_KEY_PATTERN` 命中，双重保护，但 message 断言已独立证明注册值 scrub 在 ingest 路径生效）。
- AC-004（相关测试全绿）：`re_verified`。重跑两文件 `pnpm vitest run tests/integration/local-api/server.test.ts tests/unit/web/usageboard-web.test.ts` → 2 files / 116 tests passed；`pnpm tsc --noEmit` 通过。

coverage = 4 / 4

reviewed_scope: ab0dfbca308995b2

verdict: PASS

## Round 2 (2026-08-12 21:08 UTC+8)

### 前轮 finding 复核

- t325_gen_f001（minor，无鉴权区策略注释与新增写端点不一致）：已消除。`src/main/core/local-api/server.ts:1018-1021` 顶部策略注释现补一句「Renderer log ingest (/v1/logs/renderer) also sits pre-auth: the web renderer has no token and must be able to POST logs regardless.」，明确该写端点为有意的无鉴权并给出理由（web renderer 无 token），与 f001 建议的最小修复方向一致。修复为纯注释改动，未触碰任何逻辑；注释结构完整、行宽 73-79 字符（prettier printWidth 100 内），无语法/格式问题。

### 本轮新发现

- 0 条

### 未进表的提示

- 无

### 总体判断

f001 已按建议修复，歧义消除；修复仅含注释，未引入新问题。前轮无未解决 critical/important，本轮无新 finding。

### AC 复验方式

- 本轮为纯注释修复，不触达任何 AC 行为路径；Round 1 的 re_verified 结论继续有效，不重复重跑。

coverage = 4 / 4（沿用 Round 1 复验；本轮改动不触达逻辑）

reviewed_scope: b5b25ffe67c6cdc8

verdict: PASS
