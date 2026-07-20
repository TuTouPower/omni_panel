# Task review T014

- task：`T014_fix_app_icon_ico`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 03:30 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T014_code_f001 — render_png 重复读 logo.svg

- 严重度：suggestion
- 位置：`scripts/render_icon.mjs:13-20`
- 问题：`render_png(size)` 每次调用都 `readFileSync(SVG_PATH, "utf8")`。主流程调用 1（PNG_SIZE=1024）+ 5（ICO_SIZES）= 6 次，同一 SVG 读盘 6 次。构建脚本 IO 影响可忽略，但与"render_png 只负责渲染、IO 上提"的常规结构相悖。
- 建议：把 `readFileSync(SVG_PATH, "utf8")` 上提到模块顶层常量（如 `const SVG = readFileSync(SVG_PATH, "utf8");`），`render_png(size, svg)` 接收 svg 参数，或闭包捕获。非必须修。

## 结论

1 项 suggestion，无 critical/high。改动与 spec 范围一一对应，守住非范围（logo.svg / electron-builder.yml / mac/linux icon 未动）。

- `render_png(size)` 从原 1024-only 逻辑正确提取，行为等价；`Buffer.from(resvg.render().asPng())` 包裹满足 png-to-ico 输入契约。
- `ICO_SIZES = [256,128,64,48,32,16]` 覆盖 Windows 标准尺寸（256 主图，16 最小），顺序从大到小符合 ICO 规范与历史 Viewer 习惯。
- `await png_to_ico(Buffer[])` 在 ESM (.mjs) 顶层 await 合法（Node 14.8+），v3 API 返回 `Promise<Buffer>`，`Buffer.from` 包裹冗余但无害。
- `assets/icon.ico` 实际由 30594 字节（HEAD=b6e8e2f, 2026-06-24）变为 370070 字节（working tree mtime 2026-07-21 02:59:45），确已重生成，非陈旧。
- `png-to-ico: "^3.0.2"` 在 `devDependencies`（`package.json:104`），非 `dependencies`，与 spec 约束一致。
- `eslint.config.ts` ignores 加 `scripts/render_icon.mjs`，模式与既有 `scripts/e2e/*.mjs`、`tests/e2e/fixtures/*.mjs` 一致（一次性构建脚本，strict typecheck lint 价值低，顶层 await + snake_case 标识符会触发既有规则）。
- `electron-builder.yml` 未改（win.icon: assets/icon.ico:33, mac.icon: assets/icon.png:44, linux.icon: assets/icon.png:51），路径不变，spec 非范围守住。
- spec 范围 4 项 / 验收 5 项均落地（代码层面），mac/linux icon 复用 icon.png 未退化。

建议 adoption：f001 标 `无需修改`（或 `遗留` 到下次重写 render 时一并处理），其余无。
