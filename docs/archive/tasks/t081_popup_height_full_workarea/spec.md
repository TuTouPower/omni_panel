# Task spec

## 背景

用量面板（popup 模式）高度由 `src/main/core/popup/popup-height-controller.ts` 按内容自动锁定，上限写死 `MAX_HEIGHT_RATIO = 0.75`（工作区高 75%，`popup-height-controller.ts:10,61`）。内容更高或用户继续拉伸时，到 75% 即锁死不再增长，用户反馈「拉到一定长度后就不让再拉伸了」。既有断言 75% 行为的测试：`tests/unit/main/popup_height_controller.test.ts`、`tests/e2e/electron/popup_window_constraints.spec.ts`。

## 范围

- `MAX_HEIGHT_RATIO` 0.75 → 1.0：popup 最高可贴满工作区全高；内容超出屏幕部分走既有内部滚动（「无限」受屏幕物理边界约束属预期）。
- 同步更新代码注释（"75% constraint" / "75% screen rule"）与两类测试中的 75% 断言。
- 保持既有行为不变：min 钳制（collapsed_min_height）、min>max 反转取 max、y 轴 workArea 钳制、1px 抖动抑制、apply_locked_size 三平台定位逻辑。

## 非范围

- 不做用户可配置的高度上限；不改 floating 模式（`resolve_floating_height_mode`）逻辑。
- 不改宽度 MIN/MAX_PANEL_WIDTH 与 `maxWidth: 1400`；不改内容测量（mirror）与内部滚动。

## 验收标准

- [ ] 内容高度 > 75% 且 < 100% 工作区时，窗口锁到内容全高（不再卡 75%）。
- [ ] 内容高度 > 100% 工作区时，窗口锁到 `floor(workArea.height)`，内容内部滚动。
- [ ] 窗口 y/height 始终钳在工作区内（既有 `apply_locked_size` clamp 不回归）。
- [ ] `popup_height_controller.test.ts` 与 `popup_window_constraints.spec.ts` 更新后通过；`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- 无前置 task；不依赖网络。
- macOS 全高时弹窗从菜单栏下缘贴到工作区底、Windows 贴任务栏工作区，y 钳制保证不越界，视为预期形态。
