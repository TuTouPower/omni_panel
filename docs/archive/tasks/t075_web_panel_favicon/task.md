---
tid: t075
slug: web_panel_favicon
diff_anchor: "8cc282f"
branch: t075_web_panel_favicon
---

# Task t075_web_panel_favicon

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- copy assets/logo.svg -> src/web/public/logo.svg（vite publicDir 自动 copy 到 out/web）。
- src/web/index.html 加 `<link rel="icon" type="image/svg+xml" href="./logo.svg">`。
- build:web 验证 out/web/logo.svg 存在。

## Review 处置

无代码逻辑改动（静态资源 + HTML link），不走双审。

## 收尾报告

### 验收标准勾选

- [x] out/web 含 logo.svg（build:web 产物）。
- [x] out/web/index.html 含 favicon link。

### 结果摘要

- web panel 标签页 favicon = 项目 logo.svg。
