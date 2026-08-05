# Task review t216（reviewer_focus: 代码）

- task：`t216_fix_grok_incremental_id`
- spec：`docs/tasks/t216_fix_grok_incremental_id/spec.md`
- diff_anchor：`a4d5c903f69f0022ecddd68a8d442bbe8020b91e`
- target：`git diff a4d5c903f69f0022ecddd68a8d442bbe8020b91e`
- round：1
- reviewed_at：2026-08-05 21:08 UTC+8

## Findings

### t216_code_f001 - 完整末行无尾换行时增量重发该行并驻留游标，行为依赖窗口 id 去重且无测试覆盖

- 严重度：minor
- 锚点：行为缺陷 + 可复现场景（文件末行为完整合法 JSON 但无结尾换行）
- 位置：`src/main/core/session-history/grok-extractor.ts:126-130`（`new_offset` 计算），根因同上注释 13-14 行对「未完成半行」的认定
- 问题：`last_nl_global < buf.length - 1` 无法区分「未完成半行」与「完整但无尾换行」的末行，两种情况都令游标停在末行行首并重读。用 `.scratch/t216/edge.mjs` 实测：文件 `A\nB`（B 为完整合法消息、无尾换行），全量提取后 `extract_grok_incremental`（无任何追加）返回 `[B]` 且游标从 64 回退到 30（行首）。追加 `\nC\n` 后再读返回 `[B, C]`（B 被重发）。重发消息 id 为基于全局计数的稳定值 `grok:1`，与首次发出一致，窗口按 id 去重后可消除，无可见重复/丢失；但该正确性完全依赖 t211 窗口的 id 去重，且此「完整无换行末行」分支没有任何测试覆盖（现有半行测试只覆盖「末行不合法 JSON」情形）。
- 建议：两条任选——(1) 在 `extract_grok_incremental` 补一条单测覆盖「完整合法末行无尾换行 + 追加新行」场景，断言重发 id 与全量一致、窗口去重后不产生重复，并给 `new_offset` 注释补充说明「完整无换行末行与半行不可区分，统一按半行处理」；(2) 若确认为可接受设计，在 task.md 处置表写明「遗留 + 理由」，并补注释。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：1 条（t216_code_f001，minor）
- 未进表的提示：
    - 文件过大（降级规则，仅列路径与行数）：`tests/unit/main/core/session-history/subscription-service.test.ts` 663 行 ≥ 600（测试源码 minor 阈值），本 task 净增 29 行，diff 未给出不可拆硬约束。`src/main/core/session-history/grok-extractor.ts` 135 行、`grok-extractor.test.ts` 161 行均未超阈值。
    - 复杂度：无函数手算 McCabe ≥ 10（`extract_grok_incremental` 约 4）。
    - 范围外观察：增量每次读取需整文件重解析 head 以计全局消息数（旧代码只解析 delta），大文件 + 2s 轮询下有解析成本回归，无正确性影响；`src/main/core/session-history/types.ts:12` 注释「kimi/grok 的行序 hash」与 grok 实际 count-based id 不符，本 task 未触及该文件，建议后续顺手修订。
- 总体判断：grok 增量 id 全局命名空间与半行容错两处修复实现正确，AC1-AC4 均有对应实现与单测覆盖（含真实轮询 watcher 链路的 subscription-service 测试），门禁单测/typecheck/lint 全绿；仅 1 条 minor，可 PASS。
- 系统性 follow-up：无。

verdict: PASS
