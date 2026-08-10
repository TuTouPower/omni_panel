---
tid: "t281"
slug: "e2e_synthetic_fixture_connector_rebuild"
title: "synthetic fixture 重建保留 connector 与 gen 产物 prettier 对齐"
status: "done"
branch: "t281_e2e_synthetic_fixture_connector_rebuild"
worktree: ""
review_level: "single"
diff_anchor: "cec08dd25058dc99fed8c15b6c53d0bdcf13cd5b"
depends_on: ""
conflicts_with: "t283,t288,t292"
schedule_status: "scheduled"
note: "p105：account_error_badge/opencode_go_usage 在 synthetic 下稳定失败; merged from t291"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor_cmd：无（testing.md）
- 根因：`sync_connectors()` 仅按 `config.plugins` map，丢弃 fixture 中无 config 匹配的 `synthetic-kimi-failed` / `synthetic-opencode-go`；`gen_synthetic` 用 `JSON.stringify(null,2)`，且纯 indent=4 仍无法满足 prettier 短数组折叠。
- 修法：initial config 算 synthetic-only 集合，重建时追加；删除真实 plugin 不从 initial 复活。gen 写出走已有 prettier 格式化（幂等 + format:check）。
- 验证：单测 17 绿；`MOCK_FIXTURE=synthetic` web e2e 70 绿（含锚点两 spec）；`pnpm e2e:gen-synthetic` 双跑字节一致；`pnpm test` 2816 passed。
- p105 / p091 已在 archive/pending，处理指向 t281/t291（本 task 合并 t291）。

## Review 处置

### Round 1 (2026-08-10)

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC-001：`MOCK_FIXTURE=synthetic pnpm test:e2e:web` → 70 passed（含 `account_error_badge` / `opencode_go_usage`）
    - AC-002：`tests/unit/e2e/mock_server.test.ts` synthetic-only 保留 + 删除不复活
    - AC-003～005：`pnpm e2e:gen-synthetic` 双跑仍含两类 connector，产物字节幂等
    - AC-004/006：`prettier --check tests/e2e/fixtures/synthetic.json` 通过
    - `pnpm test`：2816 passed / 9 skipped

### Reviewer verdict

`single`：

- Round 1 general：PASS

### 结果摘要

mock 重建保留 synthetic-only connector；gen_synthetic prettier 对齐，synthetic web e2e 全绿。
