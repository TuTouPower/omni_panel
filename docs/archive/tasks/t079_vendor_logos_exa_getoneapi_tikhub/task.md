---
tid: t079
slug: vendor_logos_exa_getoneapi_tikhub
diff_anchor: "<SHA>"
branch: t079_vendor_logos_exa_getoneapi_tikhub
---

# Task t079_vendor_logos_exa_getoneapi_tikhub

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户提供根目录三图：`exa.ico` / `getoneapi.png` / `tikhub.jpeg`，目标替换三服务在 `VendorMark` 的 overview 默认占位。
- 计划修订（backlog 阶段，用户指示）：exa logo 弃用根目录 `exa.ico`，改为执行时由 agent 从 <https://exa.ai/brand> 下载黑 / 白两版，按 `VENDOR_THEME_LOGOS` 双主题接线；`getoneapi` / `tikhub` 维持用户供图单图方案。spec/plan 已同步，验收标准随之更新。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t079` 查，不在此记。

### 验收标准勾选

- [ ] `src/renderer/assets/vendor_logos/` 下存在 `exa_light.*` / `exa_dark.*`（来自 exa.ai/brand）与 `getoneapi.png` / `tikhub.jpeg`；根目录 `exa.ico` / `getoneapi.png` / `tikhub.jpeg` 均已移除。
- [ ] `<VendorMark id="exa" />` 渲染 light/dark 两张 `img.vendor-logo-img`（`vendor-logo-light` / `vendor-logo-dark`），`getoneapi` / `tikhub` 渲染单张 `img.vendor-logo-img`，三者均不再回落 overview 四宫格。
- [ ] `icon.test.tsx` 新用例通过；`pnpm test` 全绿。
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过（静态 import 类型经 `vite/client` 声明）。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
