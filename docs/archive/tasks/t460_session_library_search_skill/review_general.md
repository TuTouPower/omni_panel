# Task review t460（reviewer_focus: 通用）

- task：`t460_session_library_search_skill`
- spec：`docs/tasks/t460_session_library_search_skill/spec.md`
- diff_anchor：`3fa2c70a095ca1e4ee959fe403185271f89a2c20`
- target：`git -C '/home/karon/karson_ubuntu/omni_panel_t460' diff 3fa2c70a095ca1e4ee959fe403185271f89a2c20`
- round：1
- reviewed_at：2026-09-08 09:58 UTC+8
    reviewed_scope: c1e27d21cdaaa10e

## Findings

### t460_gen_f001 - searchContent 示例 JSON 含非法 `optional` 字面量

- 严重度：minor
- 锚点：行为缺陷 — agent 若整段照抄请求体会得到非法 JSON / 400
- 位置：`skills/session_library_search/SKILL.md:59-72`
- 问题：正文搜索唯一请求体示例把可选字段写成 `"title": optional` 等非 JSON 字面量。主消费者是会抄示例的 coding agent；照抄则 `JSON.parse` 失败或 LocalAPI 因类型校验返回 400（`filters.title` 等须为 string）。AC-003 所需语义已在周围 prose 写清，故不升 blocking。
- 建议：示例只保留必填/`sources` 等真实值，其余可选字段改注释说明或省略；或拆「最小可运行 body」与「字段表」。

### t460_gen_f002 - AC-004 测试对「三字段必填」断言偏弱

- 严重度：minor
- 锚点：测试可信 — 断言可被无关 `required` 或 URL 模板误满足
- 位置：`tests/unit/session_library_search_skill.test.ts:54`
- 问题：`/id.*source.*env|required/i` 中 `|required` 单独即可通过；`id.*source.*env` 也可仅匹配 query 模板 `id=…&source=…&env=…`，不强制「三者 required」句。当前 skill 正文确有 `` `id`, `source`, and `env` are **required** ``（`SKILL.md:90`），AC-004 交付成立；属断言收紧建议，非 AC 缺口。
- 建议：改为同时约束 required 语义，例如分别 `toContain`/`toMatch` 三参数名，并断言含 `are **required**`（或等价中英）且与三字段同段出现。

## 结论

- 本轮新发现：2 条（均为 minor）
- 未进表的提示：无
- 总体判断：交付覆盖 AC-001～AC-006；skill/指南/单测/specs 索引一致；无 critical/important
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — skill 写明读 `<dataRoot>/cli.json` 的 `port`、仅 `127.0.0.1`、缺文件/不可读/health 失败视为未运行且不得编造（`SKILL.md:16-23`）；单测通过
- AC-002：`re_verified` — 表列含 `title`/`directory`/`sources`/`start_at`/`end_at`/`order_by`/`direction`/`limit`/`offset` 与 `GET /v1/sessions`（`SKILL.md:29-42`）；与 LocalAPI `server.ts` 会话过滤一致
- AC-003：`re_verified` — `POST /v1/sessionHistory/searchContent`、candidate scanning / not result count、`Prefer metadata filters first`（`SKILL.md:57-84`）；单测通过
- AC-004：`re_verified` — `GET /v1/sessionHistory` 标明 id/source/env required，可选 `limit`/`before_cursor`（`SKILL.md:88-94`）
- AC-005：`re_verified` — Hard rules：Read-only、禁止改源文件、禁止 subscribe/unsubscribe/`sessionHistory.open`（`SKILL.md:102-107`）
- AC-006：`re_verified` — 指南分节 Claude Code / Cursor / Grok 拷贝步骤，并多次写明不配 MCP（`docs/guides/session_library_agent_search.md:19-40`）；单测通过

coverage = 6 / 6

verdict: PASS

## Round 2 (2026-09-08 09:59 UTC+8)

reviewed_scope: d9b352706fcb513a

### Findings

本轮无新 finding。

### 结论

- 前轮 finding 复核：
    - `t460_gen_f001`：已消除。`SKILL.md` 正文搜索示例 JSON（约 L59-69）仅含合法值（`keyword` / `filters.sources` / `filters.directory` / `offset` / `limit`）；可选字段改 prose（L71）说明，并明示勿写字面量 `optional`。
    - `t460_gen_f002`：已消除。`tests/unit/session_library_search_skill.test.ts:54` 改为 `toContain("`id`, `source`, and `env` are **required**")`，不再被单独 `|required` 或仅 URL 模板误满足。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：前轮 minor 均已按 diff 消除；AC-001～AC-006 仍覆盖；无 critical/important
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — skill 仍要求 `cli.json` port + `127.0.0.1`，缺文件/health 失败视为未运行且不得编造（`SKILL.md:16-23`）；`vitest` 该 case 通过
- AC-002：`re_verified` — 参数表含 AC 所列筛选键与 `GET /v1/sessions`（`SKILL.md:29-42`）
- AC-003：`re_verified` — `POST .../searchContent`、candidate scanning / not result count、先元信息过滤；示例 JSON 合法（`SKILL.md:57-82`）
- AC-004：`re_verified` — 三字段 required + 可选 `limit`/`before_cursor`；单测已锁死 required 句（`SKILL.md:86-90`，test L54）
- AC-005：`re_verified` — Read-only；禁止改源文件与 subscribe/unsubscribe/`sessionHistory.open`（`SKILL.md:100-105`）
- AC-006：`re_verified` — 指南分节 Claude Code / Cursor / Grok，不配 MCP（`docs/guides/session_library_agent_search.md:19-40`）

coverage = 6 / 6

verdict: PASS

## Round 3 (2026-09-08 10:03 UTC+8)

reviewed_scope: ff38f7b8ab4275dc

### Findings

本轮无新 finding。

### 结论

- 前轮 finding 复核：
    - `t460_gen_f001`：已消除。`SKILL.md` 正文搜索 JSON 示例（L59-69）仍为合法 JSON（`json.loads` 通过）；无字面量 `optional`；可选字段仅在 prose（L71）说明。
    - `t460_gen_f002`：已消除。`tests/unit/session_library_search_skill.test.ts:54` 仍为 `toContain("`id`, `source`, and `env` are **required**")`，与 `SKILL.md:88` 一致。
- prettier / lint-staged 扫描：相对 diff_anchor 的 skill / 指南 / 单测 / specs 交付内容语义未损；JSON fence、required 句、MCP 否定句、AC 关键词均在；工作区干净且与 HEAD 一致；无因格式化引入的 AC 缺口或断言失配。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：前轮 minor 仍消除；AC-001～AC-006 仍覆盖；无 critical/important
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — `cli.json` + `127.0.0.1`；缺文件/health 失败 → instance not running；do not invent（`SKILL.md:16-23`）；vitest AC-001 通过
- AC-002：`re_verified` — `GET /v1/sessions` 与 title/directory/sources/start_at/end_at/order_by/direction/limit/offset（`SKILL.md:29-42`）
- AC-003：`re_verified` — `POST .../searchContent`、candidate scanning / not result count、Prefer metadata；示例 JSON 合法（`SKILL.md:57-82`）
- AC-004：`re_verified` — 三字段 required + Optional `limit` / `before_cursor`；单测锁死 required 句（`SKILL.md:86-90`，test L54）
- AC-005：`re_verified` — Read-only；禁止改源文件与 subscribe/unsubscribe/`sessionHistory.open`（`SKILL.md:100-105`）
- AC-006：`re_verified` — 指南 Claude Code / Cursor / Grok 拷贝步骤；不配 MCP；禁止「添加/配置/写入 mcp.json」（`docs/guides/session_library_agent_search.md:19-40`）；vitest 6/6 通过

coverage = 6 / 6

verdict: PASS
