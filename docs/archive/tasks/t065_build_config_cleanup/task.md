---
tid: t065
slug: build_config_cleanup
diff_anchor: "1d85c46dab2e6f9820717de6ce69dc4f359a2161"
branch: t065_build_config_cleanup
---

# Task t065_build_config_cleanup

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 覆盖 review_20260723_opus finding：I24-I28（eslint 插件/esbuild/taskkill/index.html/@types/node）

## Review 处置

### Round 1 (2026-07-23 21:30 UTC+8)

| finding_id      | severity  | status | rationale                                      | fix_ref               |
| --------------- | --------- | ------ | ---------------------------------------------- | --------------------- |
| I26 taskkill    | important | 已修   | 通杀 electron.exe -> 仅 OmniUsage.exe          | package-and-run.ts:13 |
| I27 index.html  | minor     | 已修   | 删根 index.html（引用不存在 /src/renderer.ts） | git rm                |
| I24 lint 范围   | important | 已修   | lint script 加 connectors + \*.mts             | package.json lint     |
| I24 移除重复    | important | 遗留   | 移 3 重复 eslint 包需 pnpm install（网络受限） | spike                 |
| I24 启用推荐    | important | 遗留   | 启用 7 插件 recommended 会爆千错，分批修       | spike                 |
| I25 esbuild     | minor     | 遗留   | 移 devDeps 需 pnpm install                     | spike                 |
| I28 @types/node | minor     | 遗留   | 加 devDeps 需 pnpm install                     | spike                 |

### Round 2 (2026-07-23 21:40 UTC+8)

两轴均 PASS（已修 3 + 遗留 4 裁决）。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t065` 查，不在此记。

### 验收标准勾选

- [x] lint 脚本覆盖全代码（含 connectors + \*.mts）。
- [x] package-and-run 仅杀 OmniUsage.exe（不通杀）。
- [x] 根 index.html 删除。
- [x] pnpm typecheck + test + lint 全绿。
- [ ] 移除重复 eslint 插件 + 启用 recommended + esbuild devDeps + @types/node：遗留（需 pnpm install + 网络 + 分批修）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- I24 移除 3 重复 eslint 包 + 启用 7 插件 recommended（分批修）+ I25 esbuild devDeps + I28 @types/node：需 pnpm install（网络）+ lint 错误分批，另立 spike。

### 结果摘要

- lint 扩 connectors/\*.mts + package-and-run 不通杀 + 删 index.html；依赖清理/启用 recommended 遗留 spike。
