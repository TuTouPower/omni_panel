# Task spec

## 背景

导入配置（`CONFIG_IMPORT`）成功后，main 侧经 `onConfigSaved` 触发 `orchestrator.rebuild`，重建 scheduler。但 rebuild 的设计意图是 **no immediate refresh**（`scheduler-orchestrator.ts:108`），新 connector 的 scheduler 首次自动刷新按周期（默认 1800s）排程，导入流程本身不发起任何 refresh。

结果：导入含新账号的配置后，新增 connector 最长需等一个周期才有 observation，用量面板不显示新账号，用户必须手动点全局刷新才出现。实测导入 8 个 Tavily 账号后，面板仍只显示原有账号；手动 `refreshAll` 后 8 个新账号才出现（日志 `User requested refresh for cbe9883d` 只刷了原账号，新账号从未进 refresh）。

## 范围

- `CONFIG_IMPORT` 成功后，自动触发一次 `refreshService.refreshAll()`，使新增与现有 enabled connector 立即采集一次。
- 触发点接在 import 成功路径，与现有 `onConfigSaved → rebuild` 串联（rebuild 先注册新 connector，再 refreshAll）。

## 非范围

- `CONFIG_SAVE`（普通设置保存）、`CONFIG_DUPLICATE`（复制账号）的自动刷新（本 task 不做；可后续扩展）。
- 改变 scheduler 周期或 rebuild 行为（rebuild 仍 no immediate refresh）。
- 导入取消 / 格式无效 / secrets 写入失败回滚时不触发刷新（保持现状）。

## 验收标准

- [ ] 导入配置成功后，所有 enabled connector 自动刷新一次；日志可见 `Refreshing all N enabled connectors` 及各 connector refresh 记录。
- [ ] 新增账号无需手动刷新即在用量面板出现。
- [ ] 导入取消 / 格式无效 / secrets 写入失败回滚时，不触发全局刷新（`refreshAll` 未被调用）。
- [ ] 现有导入流程行为（rebuild scheduler、`secretsStore.importAll`、UI 重载）保持不变。
- [ ] 集成测试覆盖「import 成功 → `refreshAll` 被调用一次」与「import 失败/取消 → 不调用」。

## 依赖与约束

- 无外部依赖；复用现有 `refreshService.refreshAll()` 与 `onConfigSaved` 回调机制。
- 时序约束：`refreshAll` 必须在 `onConfigSaved`（rebuild 注册新 connector）完成之后触发，否则新 connector 未注册刷不到。
