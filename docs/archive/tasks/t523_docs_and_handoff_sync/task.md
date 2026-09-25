---
tid: "t523"
slug: "docs_and_handoff_sync"
title: "文档、规范与交接总账同步"
status: "done"
branch: "t523_docs_and_handoff_sync"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "3b99403463ec282cbbbe1333fa1504d52ac93d91"
depends_on: "t509,t510,t512,t521"
conflicts_with: ""
note: "审阅采纳项: A83-A87, R7, R8, R10"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

1. README.md & architecture.md: 统一内置连接器统计为 20 个，README 厂商表补齐 Command Code、Kimi Web、Grok Bot、Muse AI，清理过期“不做趋势图”限制（A83, A86）。
2. AGENTS.md: 目录权责表删除 vendors/ 和 patches/ 幽灵目录（A85）。
3. docs/specs/: 补充 commandcode_balance_connector.md、kimi_web_bearer_keepalive.md、grok_bot_usage_connector.md、muse_ai_usage_connector.md，并在 specs_index.md 补齐索引与对齐命名（A84）。
4. docs/handoff.md: 迁移 2026-08-16 历史节至 archive/handoff.md，最新节总结 t509 ~ t523 全量交付与门禁状态（A84）。
5. decisions.md: 补充 ADR 037（Grok Bot 双指标裁撤，A87）、ADR 038（LocalAPI LAN 信任模型，R7）、ADR 039（Vault 文件权限模型，R8）与 ADR 040（Cookie 明文存储模型，R10），并同步至 architecture.md 与 README.md。

## Review 处置

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm format:check`、`pnpm typecheck`、`pnpm lint`、`pnpm deadcode`、`pnpm arch`、`pnpm schema:check`、`pnpm test`（332 套件 4087 用例）全部通过。
- 黑盒：纯文档与规格同步，脚本自动验证 specs_index 与 specs 目录 1:1 精确匹配。
- review：single review PASS（Round 1），reviewed_scope 707ebf5a6ac68dca。
- AC 证据：见 `handoff.json`

### 结果摘要

- AC-001 ~ AC-005 全部达成，文档、规范、ADR 与项目交接总账全面对齐。
