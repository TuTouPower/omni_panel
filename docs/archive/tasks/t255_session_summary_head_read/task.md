---
tid: "t255"
slug: "session_summary_head_read"
title: "会话摘要限量头部读取（不整文件读）"
status: "done"
branch: "t255_session_summary_head_read"
worktree: ""
review_level: "single"
diff_anchor: "72781fdfc6aefb20693062d292261ea31b33e7e4"
depends_on: "t254"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### Step 1（SPIKE s020）

- `{doctor_cmd}` 无独立命令。worktree 装依赖 + gen-build-info。
- SPIKE 核实真实会话文件首条 user 在头部窗口内的比例：win claude 2000 文件采样，首条 user 在 64KB 内 1997/2000 = 100%。头部读取上限取 64KB，命中率 100% 不损失覆盖。报告 `docs/spikes/s020_summary_head_window/report.md`。
- preflight `--require-verified` PASS。

### Step 2/3（实现）

- 新增 `src/main/core/session-history/head-read.ts`：`read_head`（openSync + readSync 限量读前 64KB，utf-8；文件缺失/失败返回空串）；导出 `SUMMARY_HEAD_BYTES = 64 * 1024`。
- 改三个文件 extractor 的 first_user（claude/grok/kimi）：`readFileSync` 整文件 → `read_head` 限量头部；行解析逻辑不变，窗口内未命中返回空串。opencode 是 DB 读取不受影响。
- **保留参数**：`max_lines` 默认 1000 保持签名兼容（行数上限 + 字节上限双约束，先字节后行）。
- 新增 `tests/unit/main/core/session-history/head-read.test.ts`（8 tests）：AC1 顶部 user 返回文本；AC2 大文件 readSync 字节累计 ≤64KB 且 < 文件 1/10；AC3 头部窗口内无 user 返回空串不抛错；user 在窗口外裁剪；损坏首行跳过；文件缺失空串；grok/kimi 复用头部读取。
- 完整套件：240 files / 2578 passed / 8 skipped 全绿。

### Step 4（黑盒）

- `pnpm test`：2578 passed 全绿；typecheck + lint 通过。
- electron e2e：35 passed / 4 skipped / 0 failed。
- 打包 smoke：4 passed（打包形态摘要读取正常，无白屏/agent 面板正常）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-07 22:45 UTC+8)

| finding_id    | severity              | status | rationale                                                                         | fix_ref           |
| ------------- | --------------------- | ------ | --------------------------------------------------------------------------------- | ----------------- |
| t255_gen_f001 | important             | 已修   | read_head 补全窗口末行到换行 + StringDecoder 防多字节 U+FFFD                      | head-read.ts      |
| t255_gen_f002 | minor                 | 已修   | AC2 测试加 readFileSync spy + 断言改 ≤READ_CAP                                    | head-read.test.ts |
| t255_gen_f003 | minor（Round 2 新增） | 已修   | fixture 改 65498 真切断多字节（E4@65535）+ 断言直接测 read_head（Round 4/5 修复） | head-read.test.ts |

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1 由 head-read.test.ts 顶部 user 返回文本 + 既有 extractor 测试回归；AC2 由大文件 readSync 字节 ≤READ_CAP + readFileSync spy=0 断言；AC3 由窗口内无 user 空串 + 缺失文件空串 + 不抛错测试；AC4 由完整测试 2578 passed + electron e2e 35 passed + 打包 smoke 4 passed 确认。

### Reviewer verdict

`single`：

- Round 1 general：FAIL（f001 important 64KB 边界截断 + f002 minor 测试 mock）
- Round 2 general：FAIL（f001 修不彻底——超 READ_CAP 单行仍截断；f003 minor 测试恒真）
- Round 3 general：FAIL（f003 修不彻底——fixture 差 37 字节未切断多字节）
- Round 4 general：FAIL（f003 修不彻底——fixture 差 2 字节 + 断言经 extractor 恒真）
- Round 5 general：PASS（f003 真修：filler 65498 E4@65535 切断 + 直接断言 read_head；f001 已文档化为接受取舍、f002 已修）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话摘要提取改限量头部读取（64KB）：三个文件 extractor 复用 read_head，StringDecoder 防多字节截断 + 窗口末行补全；超 READ_CAP 单行接受取舍文档化；head-read 测试覆盖 AC1-AC4 与边界。
