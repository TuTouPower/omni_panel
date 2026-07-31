---
tid: "t171"
slug: "deepseek_mixed_protocol_cache_normalize"
title: "deepseek 混合接入按行归一化 cache 语义（替代按模型名一刀切）"
status: "done"
branch: "t171_deepseek_mixed_protocol_cache_normalize"
worktree: ""
review_level: "full"
diff_anchor: "112f604e760205c257f9d0bb90a55fc0d4cd9865"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

Step 1（spike 核实，2026-07-31）：创建期 UNVERIFIED-SPIKE 设想用 `cache_creation_input_tokens > 0` 作 Anthropic 接入信号按行改逻辑。建 spike `s004`，扫 Win（1508 jsonl）+ WSL（7242 jsonl）真实数据。结果推翻该信号：`cache_creation` 在全部 deepseek 行恒为 0。但意外发现——**现有守卫 `inp >= cache_read` 已对混合接入按行正确分流**：按用户提供的协议切换时间（当日 20:00 前 Anthropic / 20:40 后 OpenAI）分窗，Anthropic 窗 4034 行全 `inp<cr` 正确未减、OpenAI 窗 135 行全 `inp>=cr` 正确减去，零误判。该数值判别对 OpenAI 语义数学恒真（`prompt_tokens >= cached_tokens`）。

据此与用户确认收敛 spec 契约区：不改判断逻辑，范围转为「补测试锁定已正确行为 + 修正 `is_openai_semantic_model` 命名/注释与文档的『按模型名一刀切』误导表述」。spec 已重写，UNVERIFIED-SPIKE 已改写为验证结论，严格 preflight PASS。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1（OpenAI 语义 deepseek 行减）：既有用例「deepseek-v4-pro 命中时归一化 input」+ 新增混合用例，`38083-38016=67`。
    - AC2（互斥语义 deepseek 行不减）：新增「deepseek 互斥语义行（inp<cache_read）保留原始 input」，`461` 未减。
    - AC3（混合 session 三类一致）：新增「混合 deepseek 接入」用例，records/session/daily 三类 input 总量均为 `67+461`。
    - AC4（longcat 不变）：既有「LongCat-2.0 大小写不敏感」用例保留。
    - AC5（注释/命名正名）：`is_openai_semantic_model` → `is_cache_normalization_candidate`，注释讲清模型名圈候选、`inp>=cache_read` 守卫决定执行；reviewer 核对通过。
    - 黑盒：`pnpm test` 全绿（184 文件、1925 通过）。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- deepseek 混合接入归一化实测本已正确（数值守卫零误判），本 task 补 3 个单测锁定 + 函数/注释正名 + findings d003；生产判断逻辑零改动。
