---
tid: "t294"
slug: "net_client_absolute_url_auth_exfil"
title: "net-client 绝对路径 URL 可外泄 vault 注入 auth"
status: "done"
branch: "t294_net_client_absolute_url_auth_exfil"
worktree: ""
review_level: "full"
diff_anchor: "c35155f2c456447e5981cbf84827f34c430b39b4"
depends_on: ""
conflicts_with: ""
note: "Grok Issue 3：new URL(path, base) 对绝对/protocol-relative path 替换 manifest origin，apply_request_auth 后 auth 可发往攻击者主机；需限制 url.origin == base origin"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## 根因

`build_request_context` 用 `new URL(options.path, base)` 构造请求 URL。`path` 为绝对 URL（`https://evil/...`）或 protocol-relative（`//evil/...`）时 URL API 以 path 替换 endpoint base 的 host；`apply_request_auth` 随后把 vault 凭据注入该 URL（query）或 headers，auth 被发往任意公网主机。`assert_safe_connector_host` 只拦云 metadata host，不拦任意公网 host。

## 方案

`build_request_context` 构造 URL 后、auth 注入前，解析 base origin 并与 `url.origin` 比对；不一致抛 `Refusing connector request to origin outside endpoint`。do_request（poll/probe/主请求 get_json/post_json）与 get_raw 全部经该函数，一处覆盖。原 `assert_safe_connector_host` 保留。

## 验证记录

- RED：3 新用例失败且错误为 `getaddrinfo ENOTFOUND evil.example`（证实请求实际发出、auth 泄漏）。
- GREEN：net-client 34 测试全过（3 新 + 31 既有回归）。
- typecheck：`tsc --noEmit` 0 错误。

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-11 02:45 UTC+8)

| finding_id     | severity | status | rationale                                                                   | fix_ref                                        |
| -------------- | -------- | ------ | --------------------------------------------------------------------------- | ---------------------------------------------- |
| t294_code_f001 | minor    | 已修   | spec 范围/AC 措辞与实现（origin 约束）冲突，已改 spec 消除括号歧义          | spec.md:11/39                                  |
| t294_test_f001 | minor    | 已修   | 补 poll post_json protocol-relative + get_raw 精确断言用例，executor 层覆盖 | tests/integration/connector/net-client.test.ts |
| t294_test_f002 | minor    | 已修   | 加捕获服务器断言「未收到请求」，直接证明不发起网络请求                      | tests/integration/connector/net-client.test.ts |

### Round 2 (2026-08-11 02:50 UTC+8)

| finding_id     | severity | status | rationale                                                                                  | fix_ref                                        |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| t294_code_f002 | minor    | 已修   | get_raw 捕获服务器用例断言恒真（evil.example 打不到 127.0.0.1 capture server），删除该用例 | tests/integration/connector/net-client.test.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 由 `tests/integration/connector/net-client.test.ts` 绝对 URL + protocol-relative 拒绝用例覆盖；AC-002 由既有 31 用例回归 + 全量 `pnpm test` 2844 passed；AC-003 由 get_json/get_raw/post_json 三通道越界拒绝用例覆盖

### Reviewer verdict

`full`：

- Round 1 code：PASS（1 minor）
- Round 1 test：PASS（2 minor）
- Round 2 code：PASS（1 minor）／ test：PASS
- Round 3 code：PASS ／ test：PASS
- Round 4-5：code PASS ／ test PASS（纯文档/索引同步）

### 结果摘要

`build_request_context` 构造 URL 后、auth 注入前强制 `url.origin` 等于 endpoint base origin，不同 origin 绝对 URL / `//` protocol-relative path 抛错拒绝，堵住 vault 凭据经恶意 connector 脚本外泄。do_request 与 get_raw 单点校验。全量测试 2844 passed + typecheck 绿。

### 结果摘要

- 一句话；无额外说明可写「见上」
