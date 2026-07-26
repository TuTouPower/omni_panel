# Task spec

## 背景

t096 遗留：每个 connector 状态变化独立触发 `setPlugins`，无合批机制。`refreshAll()` 以并发上限 5 刷新，N 个 connector 产生 N 次 `setPlugins` → N 次 React render × 3 棵树。s002 spike 采纳 P0 方案 A：`use-plugins.ts` 的 `onStateChange` 回调用 `requestAnimationFrame` 合批，同帧 N 个事件合并为 1 次 setPlugins。

## 范围

- 改 `src/renderer/hooks/use-plugins.ts`：`onStateChange` 回调内累积本帧到达的 `(instanceId, state)`，用 `requestAnimationFrame` 在帧尾一次性 `setPlugins`（对 pending 队列逐条应用 updater）。
- unmount 时 `cancelAnimationFrame` 清理，避免泄漏与卸载后 setState。
- 测试环境无 rAF 时提供 fallback 或 mock（vitest jsdom 通常有 rAF；若无可注入调度器或 polyfill）。

## 非范围

- 不做 snapshot 值相等性检查（t128）。
- 不改 `use_popup_derived`、容器组件 memo、deferred mirror（s002 方案 C/D）。
- 不改主进程侧 `refresh-service` / `runtime-store`。

## 验收标准

- [ ] 同帧 burst N 个 `state-change` 事件合并为 1 次 `setPlugins`（render 次数从 N 降至 1-2）
- [ ] unmount 时 pending rAF 被 `cancelAnimationFrame` 取消，无 setState-after-unmount 警告、无泄漏
- [ ] 测试环境无 rAF 时行为正确（fallback 或 mock 生效）
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 全绿

## 依赖与约束

- 前置：s002 spike 已完成。
- 顺序建议：在 t128（snapshot 相等性检查）之后做。两者互补，t128 是更根本的修复（消除值未变时的失效），本 task 消除同帧 burst 的重复 render。
- 引入 1 帧延迟（~16ms），spike 评估体感无差异。
