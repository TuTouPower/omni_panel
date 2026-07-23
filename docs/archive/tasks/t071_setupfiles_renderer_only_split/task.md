---
tid: t071
slug: setupfiles_renderer_only_split
diff_anchor: "2a618ed"
branch: "t069_t074_spike_batch"
---

# Task t071_setupfiles_renderer_only_split

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

评估型 spike，不走双审。

## 收尾报告

### 评估结论

setup.ts setupFiles 全局注入 mock，拆 renderer-only 需 vitest.config 改 + 评估 renderer 测试对 mock 依赖。测试架构改。

裁决：spike close，需架构改/CI/分批修，另立实施 task。

### 验收标准勾选

- [x] 评估完成（setup.ts setupFiles 全局注入 mock，...）。

### Reviewer verdict

- 评估型 spike，未走双审。

### 遗留

- setup.ts setupFiles 全局注入 mock，拆 renderer-only 需 vitest.config 改 + 评估 renderer 测试对 mock 依赖。测试架构改。

### 结果摘要

- spike close：setupFiles 拆 renderer-only（setup.ts setupFiles 全局注入 mock，拆 renderer...）。
