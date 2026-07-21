---
tid: t037
slug: split_specs_by_verification
diff_anchor: "8dfad6e"
branch: t037_split_specs_by_verification
---

# Task t037_split_specs_by_verification

过程总账。

## 过程记录

- 目标：specs_index 每行可辨验证方式 + 拆混杂 spec。
- 拆分基于 agent 分类表（5 混杂：ai-cli-token-stats/connector-cpa/ipc/platform-services/ui-views）。
- diff_anchor = 8dfad6e（main HEAD，t036）。

## Review 处置

纯文档重构，未走双审。

## 收尾报告

SHA 由 `git log --grep t037` 查。

### 验收标准勾选

- [x] 5 混杂 spec 各拆 2-3 子 spec（ai-cli-token-stats→3、connector-cpa→2、ipc→2、platform-services→2、ui-views→2），旧 5 文件移 docs/archive/specs/
- [x] specs_index.md 含「验证方式」列 + 顶部分类说明段（API/Web/Desktop 含义+验证手段+分界标志）
- [x] 20 行 spec（9 纯 + 11 拆分），每行标注验证方式
- [x] 断链核对：specs_index slug 全对应文件；旧 slug 残留引用已修（architecture.md ipc、README platform-services、ui-views-web 内引）

### Reviewer verdict

- 纯文档重构，未走双审（4 sub agent 并行拆分 + 主控断链核对）。

### 遗留

- docs/reviews/review_20260719_2201/ 历史快照含旧 spec 路径引用，保留（历史不动）。

### 结果摘要

specs_index 每行可辨验证方式（API/Web/Desktop）。5 个混杂 spec 拆 11 个子 spec（单一验证方式），旧 5 移 archive。spec 总数 14→20。顶部加分类说明（含义+手段+分界标志）。修复 architecture/README/ui-views-web 3 处旧 slug 断链。
