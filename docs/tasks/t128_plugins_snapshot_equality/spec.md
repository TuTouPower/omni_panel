# Task spec

## 背景

t096 遗留：每次 `state-change` IPC 事件触发 `PopupView` 三棵树全量重渲染，`use_popup_derived` 的 7 个 memo 因 `plugins` 引用变更全部失效。s002 spike 采纳 P0 方案 B：在 `use-plugins.ts` 的 setPlugins reducer 加快照相等性检查，snapshot 值未变时返回原引用，使 memo 命中缓存。

根因：当前 reducer 无差别 `.map()` 创建新数组 + 新对象，即使 snapshot 值未变，`plugins` 引用也变 → 7/7 memo 全失效 → 三棵 `render_body` 全重渲染。

## 范围

- 实现 `snapshot_equal`：对 `ConnectorSnapshotDTO`（union of plain objects，含 `readonly` 数组字段）做值比较。
- 改 `src/renderer/hooks/use-plugins.ts` 的 `onStateChange` setPlugins reducer：snapshot 值相同时返回原对象引用，无变化时返回原数组引用（按 spike 方案 B 代码形态）。

## 非范围

- 不做 rAF 合批（t129）。
- 不改 `use_popup_derived`、容器组件 `React.memo`、deferred mirror（s002 方案 C/D）。

## 验收标准

- [ ] snapshot 值未变时 `plugins` 数组引用不变（reducer 返回 `prev`）
- [ ] `use_popup_derived` 直接依赖 `plugins` 的 memo（`rawGroups` / `visibleProviders` / `providerErrors`）在 snapshot 值未变时不重算
- [ ] snapshot 值变化时正常生成新引用并触发重渲染
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 全绿

## 依赖与约束

- 前置：s002 spike 已完成。建议在 t129（rAF 合批）之前落地；两者互补，本 task 是更根本的修复。
- `ConnectorSnapshotDTO` 是 union of plain objects，`items` / `chart` 为 `readonly` 数组/对象字段，可安全做值比较。
