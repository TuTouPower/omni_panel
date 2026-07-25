# Task spec

## 背景

t114 收尾后 `src/main/core/token-stats/collector.ts` 517 行，超 400 行 minor 阈值（conventions.md）。其中 scan-state serde（`serialize_state`/`save_state`/`load_state`/`serialize_bucket`/`deserialize_bucket`/`SerializedScanState` 类型）~170 行是 t114 新增、与扫描逻辑正交，可独立成文件。

## 范围

- 新建 `src/main/core/token-stats/scan-state.ts`：迁移 `SerializedScanState`/`SerializedScanBucket` 类型 + `serialize_bucket`/`deserialize_bucket`/`serialize_state`/`save_state`/`load_state` 函数。
- `collector.ts`：`import` 上述导出（type + value），删除内联实现，行数回落。
- `save_state`/`load_state` 的 `forward_log` 依赖：传入 logger 回调或继续从 collector 导入（`forward_log` 在 collector.ts，scan-state.ts 不便反向依赖；改为 `save_state`/`load_state` 接收可选 `on_warn` 回调，collector 调用处传 `forward_log`）。

## 非范围

- 不改 serde 行为（序列化格式、load 容错、save 时机均不变）。
- 不动其他 reader / store。
- 不改测试断言（仅 import 路径若测试直接引用 serde，则跟随；当前测试走 `save_state`/`load_state` 导出，应透明）。

## 验收标准

- [ ] `collector.ts` 行数 < 400（或接近，serde 已迁出）。
- [ ] `pnpm test` 全绿（collector-state.test.ts 7 用例不回归）。
- [ ] `pnpm typecheck` 0 新增错误（保留 t111 write-json pre-existing）。
- [ ] serde 行为不变：`load_state` 损坏/缺失回退、save round-trip 与 t114 一致。

## 依赖与约束

- 无前置（t114 已 done）。
