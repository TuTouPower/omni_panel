# Task plan

## 步骤与验证

1. 红：改写 `tests/unit/renderer/globals_css.test.ts` —— 删「1024/640 断点」「minmax(320px)」「强制两列」三条断言；改 `.overview-grid` 基础断言为 `repeat(auto-fill, minmax(420px, 1fr))`；新增「`.rel-time` 不得 `display: none`」守卫 → 验证：`pnpm test -- globals_css` 变红（当前 CSS 仍是 360 且残留隐藏规则）。
2. 绿：`src/renderer/styles/globals.css` —— `.overview-grid` 下限 360 → 420；删除 `@container (max-width: 360px)` 隐藏块与 `.overview-grid .card { container-type }` → 验证：`pnpm test -- globals_css` 变绿。
3. 黑盒：跑 `pnpm test` 全量 + `pnpm typecheck && pnpm lint` → 验证：全绿。
4. 人工黑盒：`pnpm package` 打包重启，竖屏 + 横屏各档宽度拖动窗口，展开多账号卡片复核头部完整 → 验证：无溢出、无隐藏。

## 风险与回退

- 风险：420px 下限使 1400 maxWidth 窗口最多 3 列（原 4 列），用户已明确接受「放不下减列」；极小窗口（< 452px 容器）单列仍可能触发 `.card-name` 省略号兜底，属可接受最后防线。
- 风险：`globals_css.test.ts` 旧断言删除后，其他测试若隐式依赖两列布局会失败 → 已排查，e2e/单元测试只把 `.overview-grid` 当 DOM 定位器。
- 回退：`git revert` 本 task commit；恢复 320px 规则即回到 f2c1c705 前状态。

## Finalization 时更新的 blueprint

- `docs/specs/ui-views-web.md`：改写「容器查询响应式」条目（新单规则 + 信息不丢原则）。
- `docs/blueprint/decisions.md`：追加决策「overview-grid 减列保信息」（说明 1024/640 断点与 320px 下限被取代的理由）。
