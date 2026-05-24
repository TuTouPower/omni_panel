# Specs Review

## 范围

- `docs/superpowers/specs/2026-05-24-phase2-core-implementation-design.md`
- `docs/superpowers/specs/2026-05-24-round3-skeleton.md`
- `docs/superpowers/specs/2026-05-24-round3.5-quality-gates.md`
- `docs/superpowers/specs/2026-05-24-round4-parser.md`
- `docs/superpowers/specs/2026-05-24-round5-runner.md`
- `docs/superpowers/specs/2026-05-24-round6-state-layer.md`
- `docs/superpowers/specs/2026-05-24-round7-scheduler.md`

## 总体结论

已修好上次主要问题。当前 specs 可进入 Round 3 实现。

- Round 7 未闭环 TODO 已改为明确不实现项：只定义 `SystemEventBus` 接口，`powerMonitor` 绑定留 Round 8+。
- Round 3、3.5、4、5、6、7 都已有 `验收标准` 和 `文件清单`。
- 各 round 均无 `TODO / TBD / 待定 / FIXME` 未闭环标记。
- 每个 round 都保留依赖、产出、测试或检查要求。

## 阻塞问题

无。

## 剩余建议

### 1. Phase 2 总 spec 仍偏长

- 位置：`docs/superpowers/specs/2026-05-24-phase2-core-implementation-design.md`
- 当前 631 行，仍包含大量模块接口细节。
- 风险低：后续如果修改 round spec，仍可能忘记同步总 spec。
- 建议：后续把总 spec 定位为索引和跨 round 约束，详细实现以 round spec 为准。

### 2. Round 3 smoke test 示例仍用省略号

- 位置：`docs/superpowers/specs/2026-05-24-round3-skeleton.md:153`、`:162`
- 风险低：文件清单已补全，实施者可推导。
- 建议：实现前把 smoke test 明确列全，避免漏模块。

### 3. Round 3.5 无测试路径，只有质量命令

- 位置：`docs/superpowers/specs/2026-05-24-round3.5-quality-gates.md`
- 这合理，因为该 round 主要交付 lint/type/dependency/knip/hook 门禁。
- 建议：保持 `pnpm check` 为唯一权威入口。

## 逐文件状态

### `2026-05-24-phase2-core-implementation-design.md`

通过。作为总设计可用。低风险建议：减少与 round specs 重复。

### `2026-05-24-round3-skeleton.md`

通过。有验收标准和文件清单。低风险建议：把 smoke test 示例中的 `// ...` 展开。

### `2026-05-24-round3.5-quality-gates.md`

通过。质量门禁目标清楚，文件清单完整。

### `2026-05-24-round4-parser.md`

通过。交付物、测试计划、不实现、验收标准、文件清单完整。

### `2026-05-24-round5-runner.md`

通过。runner 安全边界明确：`spawn`，不使用 `exec`。fake plugins 覆盖关键失败模式。

### `2026-05-24-round6-state-layer.md`

通过。config/cache/path/secret/plugin-instance 边界清楚。secret 不进日志和测试快照的要求已保留。

### `2026-05-24-round7-scheduler.md`

通过。TODO 已闭环为明确不实现范围。`Promise.allSettled`、min interval、cache hit、并发 refresh 行为均有验收项。

## 结论

可执行。建议下一步从 Round 3 开始实现，严格按 round 顺序推进。
