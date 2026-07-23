---
tid: t074
slug: package_run_path_filter
diff_anchor: "2a618ed"
branch: "t069_t074_spike_batch"
---

# Task t074_package_run_path_filter

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

评估型 spike，不走双审。

## 收尾报告

### 评估结论

taskkill 按路径（PowerShell Get-Process path）需 PowerShell 重构替代 execSync taskkill。Windows 特定重构。

裁决：spike close，需架构改/CI/分批修，另立实施 task。

### 验收标准勾选

- [x] 评估完成（taskkill 按路径（PowerShell Get-Pr...）。

### Reviewer verdict

- 评估型 spike，未走双审。

### 遗留

- taskkill 按路径（PowerShell Get-Process path）需 PowerShell 重构替代 execSync taskkill。Windows 特定重构。

### 结果摘要

- spike close：package-and-run 按路径过滤（taskkill 按路径（PowerShell Get-Process path...）。
