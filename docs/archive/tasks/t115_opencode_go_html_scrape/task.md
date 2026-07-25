---
tid: t115
slug: opencode_go_html_scrape
diff_anchor: "4eb3e8cd3c76fc565043f5013d1237428f5f3678"
branch: t115_opencode_go_html_scrape
max_review_round: 5
---

# Task t115_opencode_go_html_scrape

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-25 backlog 创建。前置验证已完成：probe 脚本 `.scratch/probe-opencode-go.mjs` 用真实 cookie 实测，线上 `/workspace/<id>/go` HTML 内联 `$R[N]=` hydration 与 `data-slot="usage-item"` 双格式，vendor 正则解出 rolling 0% / weekly 22% / monthly 100%，server-fn 链路非必需。原始 HTML 存 `.scratch/opencode_go_probe/go.html`（不入库）。
- 2026-07-26 start。diff_anchor `4eb3e8c`（t114 HEAD）。cookie 由用户存放 `.scratch/cookie.txt`（不入库）。
- 实测 /go HTML 字段顺序：`{status:"ok",resetInSec:18000,usagePercent:0}`（status 前缀 + reset-first）。SSR 双正则覆盖 usagePercent-first / resetInSec-first，`[^}]*` 吸收 status 伴随字段。
- 解析设计：`make_window` 对 percent 必须 finite（否则整窗丢弃，拒绝 NaN），reset 缺失回 0，负数 clamp 下限 0；`parse_data_slot_window` 切 `data-slot="usage-item"` 段，label/value 正则，reset 走 `parse_data_slot_reset`（reset-now slot → 0；reset-time 文本走 `parse_human_readable_reset` 解析 "N days M hours" 换算秒）。
- 优先级：SSR 任一窗口命中即走 SSR；SSR 三窗全 miss 才 data-slot。payload 至少一窗口即返回（部分容错）；全 miss 返回 null（触发 fallback）。
- main 重构：/auth → /go 单页主路径（不下载 JS bundle、不调 /\_server）；HTML 无数据才 `server_fn_fallback`（保留既有 server-fn 链路与三窗口齐全校验）。
- 偏离 spec：spec 写「单元测试」直接 import parse 函数。但 connector runtime 禁 `import/export` statements（vm sandbox），parse 函数不能 export。改为 integration 测试（run_connector + fixture HTML）加到 `tests/unit/connector/opencode_go.test.ts`，覆盖同等路径。
- live 验证（AC#8）：跑 probe 抓真实 /go HTML；connector 解析 rolling 0%/18000s、weekly 22%/106859s、monthly 100%/146610s，与 probe vendor 解析逐字一致、error null。加「parses a captured /go HTML snapshot when present」用例（snapshot 不入库，CI skip，本地断言三窗口数值）。
- 验证：`pnpm test` 1737 passed / 167 files；`pnpm typecheck` 仅 4 pre-existing（write-json t111 + oauth_device_form TS4111 t112×3）；改动文件 ESLint 0 错误。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-26 02:30 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                | fix_ref                                                                           |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| t115_test_f001 | important | 已修   | live snapshot 改 `it.skipIf(!existsSync(...))`，无 snapshot 时显式 skip（CI 报 skipped 非 passed），有 snapshot 时真跑断言三窗口数值                     | tests/unit/connector/opencode_go.test.ts:404-430                                  |
| t115_test_f002 | minor     | 已修   | data-slot 用例补 used 断言（12/34/56），之前只断言 reset_at                                                                                              | tests/unit/connector/opencode_go.test.ts                                          |
| t115_test_f003 | minor     | 已修   | impl：data-slot value 正则 `[^0-9]*(\d+)` → `[\s\S]*?(-?\d+(?:\.\d+)?)`，负号不再被前缀消耗；加 data-slot `-5%` 用例断言 clamp 到 0（非 5）+ finite 校验 | connectors/opencode_go/connector.ts:219; tests/unit/connector/opencode_go.test.ts |
| t115_test_f004 | minor     | 已修   | 补 sanitize 用例：cookie 失效场景 error 不含 cookie 原值（`session=secret-leak-xyz`），只含常量错误文案                                                  | tests/unit/connector/opencode_go.test.ts                                          |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t115` 查，不在此记。

### 验收标准勾选

- [x] 主路径只请求 `/auth` + `/workspace/<id>/go` 两个页面即产出 rolling/weekly/monthly 的 observation；不下载 JS bundle、不调 `/_server`。
- [x] SSR `$R` 格式两种字段顺序均可正确解析。
- [x] `data-slot` 格式（含 "Resets in X days Y hours" 与 `reset-now`）可正确解析。
- [x] SSR 与 data-slot 均解析失败时自动回退 server-fn 链路，产出与现状一致。
- [x] 部分窗口缺失时返回已解析窗口的 observation，不整体 throw。
- [x] 负数 / 非有限数输入被 clamp 或拒绝，observation 中不出现 NaN / 负数用量。
- [x] 错误消息经 sanitize，不含原始 HTML 与 cookie，长度受限。
- [x] 新增单元测试覆盖上述路径，`pnpm test` 通过。
- [x] 用真实 cookie live 验证：主路径产出的三窗口数据与页面显示一致（probe 抓 /go HTML，connector 解析 rolling 0%/weekly 22%/monthly 100%，与 probe vendor 解析逐字一致）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL（f001 important silent skip；f002-f004 minor，已修）
- Round 2 test：PASS

### 遗留

- 无本 task 遗留。connector.ts 420 行超 minor 阈值，但 runtime 禁 import/export 强制单文件（不可拆），code reviewer 认可。

### 结果摘要

- OpenCode Go connector 改为「/go HTML 直解析为主路径 + server-fn 链路 fallback」：main 仅 /auth + /go（单页），HTML 命中内联数据即产出（不下载 JS bundle、不调 /\_server）；HTML 无数据自动回退既有 server-fn 链路（/workspace assets -> bundle -> createServerReference hash -> /\_server，三窗口齐全校验保留）。
- HTML 解析：SSR `$R[N]={...}` 双字段顺序正则（usagePercent-first / resetInSec-first，`[^}]*` 吸收 status 伴随字段）+ `data-slot="usage-item"` 格式（label/value + 人类可读 reset "N days M hours" / reset-now）。SSR 优先；负数 clamp 0；percent 非 finite 整窗丢弃（拒绝 NaN）；部分窗口容错。
- live 验证（AC#8）：用 `.scratch/cookie.txt`（用户提供）跑 probe 抓真实 /go HTML，connector 解析 rolling 0%/18000s、weekly 22%/106859s、monthly 100%/146610s，与 probe vendor 解析逐字一致。
- 测试：opencode_go.test.ts 18 用例（8 既有 server-fn + 9 HTML 主路径 + sanitize + 1 live snapshot 用 `it.skipIf` 本地跑 CI skip）。`pnpm test` 1739 passed / 167 files；`pnpm typecheck` 仅 4 pre-existing（write-json t111 + oauth_device_form TS4111 t112×3）；改动文件 ESLint 0 错误。

### 遗留（模板残留，正式遗留见上方收尾报告）

- 无

### 结果摘要（模板残留，正式摘要见上方收尾报告）

- 见上
