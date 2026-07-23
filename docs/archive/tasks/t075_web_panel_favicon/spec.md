# Task spec

## 背景

web panel（浏览器标签页）无 favicon，标签页显示默认空白图标。

## 范围

- copy `assets/logo.svg` → `src/web/public/logo.svg`（vite publicDir）。
- `src/web/index.html` 加 `<link rel="icon" type="image/svg+xml" href="./logo.svg">`。

## 验收标准

- [x] build:web 产物 out/web 含 logo.svg。
- [x] out/web/index.html 含 favicon link。
