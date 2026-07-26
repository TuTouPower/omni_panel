# Task plan

## 步骤与验证

1. 红：扩展 `tests/unit/renderer/hooks/use_plugins.test.ts`，mock `window.usageboard.event.onStateChange`；同一帧内连续触发 N 个 `state-change`，断言 `setPlugins` 只应用 1 次（`plugins` 引用变化 1 次）→ 验证：`pnpm vitest run tests/unit/renderer/hooks/use_plugins.test.ts` 失败
2. 绿：改 `use-plugins.ts`：模块内（或 hook 闭包内）维护 `pending: Map<instanceId, ConnectorSnapshotDTO>` 与 `raf_handle`；`onStateChange` 写入 pending，若无 rAF 进行中则 `requestAnimationFrame(flush)`；`flush` 逐条应用后清空 pending → 验证：新测试通过
3. unmount 清理：`useEffect` cleanup 中 `cancelAnimationFrame(raf_handle)` 并清空 pending；补测试断言 unmount 后无 setState → 验证：测试全绿且无 React unmount 警告
4. rAF 缺失 fallback：检测 `typeof requestAnimationFrame === "undefined"` 时退化为同步 flush（或 `setTimeout(0)`）；测试环境 mock rAF/cancel → 验证：fallback 用例通过
5. 全量验证：`pnpm typecheck && pnpm test` 全绿
6. 黑盒：`pnpm test`

## 风险与回退

- 风险 1：pending 队列在 rAF 回调前组件已 unmount，触发 setState-after-unmount。cleanup 中 cancel + 清空 pending；测试覆盖。
- 风险 2：测试环境（jsdom/node）无 rAF 或行为差异。注入调度器或 mock `requestAnimationFrame` / `cancelAnimationFrame`；必要时 fallback 同步执行。
- 风险 3：1 帧延迟对高度测量链路的影响。镜像树经 `use-popup-height-report` 报高，主进程侧已有 debounce，spike 评估影响可忽略。
- 风险 4：与 t128 叠加时的交互。t128 已保证值未变时引用稳定；本 task 在其上合批同帧多次值变更。若同帧内同一 instance 多次变更，pending 用 Map 以 instanceId 去重，只保留最后一次 state。
- 回退：`git checkout -- src/renderer/hooks/use-plugins.ts tests/unit/renderer/hooks/use_plugins.test.ts`。

## Finalization 时更新的 blueprint

- 无
