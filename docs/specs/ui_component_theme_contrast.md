# ui 组件明暗主题对比度

## 行为

- `src/renderer/components/ui/` 组件库在 light / dark 双主题下渲染必须满足 WCAG 对比度验收线：正文级文字（body/label 字级）≥ 4.5:1；主按钮白字蓝底与分段控件选中块按大字标准 ≥ 3.0:1（DESIGN.md「Colors」节既定决策）。暗色主按钮文字使用 `--color-on-primary`（纯白），不得回退到 `--color-on-surface`。暗色 danger 按钮白字对 `--color-error-dark` 同样 ≥ 3.0（t298 将 error-dark 调暗至 `#f0564d`）。
- 暗色 accent 体系只经一条数据链生效：DESIGN.md front matter → `pnpm designmd:export` 写入 `globals.css` `@theme` 导出区 → 语义层 `.dark` 翻转块引用 `--color-accent-*-dark` token。`.dark` 块禁止硬编码五档 hex 副本（历史不同步缺陷来源）。
- Button 组件字号类须用显式 `text-[length:var(--text-*)]`，避免 tailwind-merge 把自定义字号 token 误判为颜色类、吞掉 variant 的 `text-[var(--color-on-*)]` 颜色声明。
- 设置页与用量面板消费的 ui 组件（Switch / Select / Input / Checkbox / Button / Segmented / Dialog）在明暗两态下均无样式缺失或对比失效。

## 验证

- 黑盒：`MOCK_FIXTURE=synthetic pnpm test:e2e:web`（清代理 env），`tests/e2e/web/ui_component_theme.spec.ts` 明暗两态参数化断言——逐元素读 computedStyle 前景与最近非透明背景，按 WCAG 公式算对比度并断言阈值；Switch 开/关两态 track 底色不同；页面背景亮度证明主题真实切换。
- 门禁：`pnpm designmd:check`（drift）守护 DESIGN.md 与 globals.css 导出区一致。
- 人工：DESIGN.md 组件规格逐项对照清单与差异处置见 task 收尾报告（AC-003/AC-004，`[deploy]`）。
