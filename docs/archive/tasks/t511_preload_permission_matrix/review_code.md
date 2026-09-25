# Task review t511（reviewer_focus: 代码）

- task：`t511_preload_permission_matrix`
- spec：`docs/tasks/t511_preload_permission_matrix/spec.md`
- diff_anchor：`17f960cdeeb30c9b6ab447ce31b2033f58b3e4e2`
- target：`git -C '/Users/karson/kar/code/omni_panel_t511' diff 17f960cdeeb30c9b6ab447ce31b2033f58b3e4e2`
- round：1
- reviewed_at：2026-09-25 11:45 UTC+8

reviewed_scope: 897e8c597b988078

## Findings

无

## 结论

- 本轮新发现：0 条
- 未进表的提示：
  - 文件行数：`src/preload/index.ts` 物理行数 686 行（经 switch-case 消除后净减 79 行，未净增，不超阈值）；其余触及文件均低于 400 行。
  - 圈复杂度：所有新增及修改函数近似圈复杂度 CC 均 ≤ 4，控制流清晰。
  - 范围外观察：`src/preload/oauth_api.ts` 新增的 `create_grok_bot_oauth_apis` 工厂方法目前在 `route_api.test.ts` 验证了路由分发与 reject 契约，后续可在 `oauth_api.test.ts` 补充该工厂各 IPC 通道调用的直接单元测试。
- 总体判断：实现完全满足 AC-001 ~ AC-004，路由矩阵消除重复声明，Popup 与 Tray 权限收窄与白名单过滤有效落地，无阻断性缺陷。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查证 `src/preload/index.ts` 消除 144 行 switch-case 重复，统一经 route 选择器装配 `api: UsageboardApi`；`pnpm typecheck` 与相关单元测试通过。
- AC-002：`re_verified`，独立运行并查证 `tests/unit/preload/route_api.test.ts`，验证 Popup 与 Tray 等低权窗口中 Grok Bot 与 Session 接口均为 disabled/reject 存根。
- AC-003：`re_verified`，独立运行并查证 `tests/unit/preload/config_filter.test.ts`，验证 Popup `config.save` 传入 plugins/proxy 等越权配置时被白名单准确丢弃。
- AC-004：`re_verified`，独立运行 `pnpm vitest run tests/unit/preload/`，全量 8 个文件 54 个测试通过，覆盖各窗口类型只读与设置档位边界。

coverage = 4 / 4 (100%)

verdict: PASS

## Round 2 (2026-09-25 12:08 UTC+8)

reviewed_scope: d6a776c54fd67a3f

### Findings

无

### 结论

- 前轮 finding 复核：Round 1 无 finding（0 条）；实施方已在 `tests/unit/preload/oauth_api.test.ts` 补充了 `create_grok_bot_oauth_apis` 的直接单测，验证了 readonly stubs 均 reject 且 settings api 正确派发各 IPC 通道。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件行数：`src/preload/index.ts` 物理行数 678 行（净减 87 行，不超阈值）；`src/shared/types/ipc.ts` 806 行（全局契约声明文件，本 task 仅增 13 行类型定义）；其余代码与测试文件均 ≤ 333 行。
  - 圈复杂度：新增与修改函数近似圈复杂度 CC 均 ≤ 3，控制流清晰。
  - 范围外观察：无。
- 总体判断：实现完全满足 AC-001 ~ AC-004，权限矩阵工厂化重构彻底，Popup 与 Tray 权限边界清晰收敛，测试套件 9 个文件 59 项全部通过，类型检查与代码检查全绿。
- 系统性 follow-up：无

#### AC 复验方式

- AC-001：`re_verified`，查证 `src/preload/index.ts` 与 `src/preload/api_factory.ts`，原 144 行 switch-case 冗余消除，统一通过 route 选择器和工厂组装 `UsageboardApi`；`pnpm typecheck` 通过。
- AC-002：`re_verified`，独立运行并查证 `tests/unit/preload/route_api.test.ts` 与 `tests/unit/preload/oauth_api.test.ts`，验证 Popup 与 Tray 低权窗口中 Grok Bot 与 Session 接口均为 disabled/reject 存根且不触发 IPC。
- AC-003：`re_verified`，独立运行并查证 `tests/unit/preload/config_filter.test.ts` 与 `tests/unit/preload/preload_permission_matrix.test.ts`，验证 Popup `config.save` 传入越权配置被白名单丢弃并恢复为当前配置。
- AC-004：`re_verified`，独立运行 `pnpm vitest run tests/unit/preload/`，全量 9 个文件 59 个测试通过，完整覆盖各窗口类型只读与设置档位边界。

coverage = 4 / 4 (100%)

verdict: PASS

## Round 3 (2026-09-25 12:28 UTC+8)

reviewed_scope: 76ed9600b5dbdb43

### Findings

无

### 结论

- 前轮 finding 复核：Round 1 与 Round 2 均无 finding（0 条）；实施方维持高标准代码与测试质量。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件行数：`src/preload/index.ts` 物理行数 650 行（相较 anchor 17f960c 净减 127 行，未净增，不超阈值）；`src/shared/types/ipc.ts` 806 行（全局契约声明文件，本 task 仅增 13 行类型定义）；其余代码与测试文件均 ≤ 333 行。
  - 圈复杂度：新增与修改函数近似圈复杂度 CC 均 ≤ 4，控制流清晰。
  - 范围外观察：`tests/integration/scheduler/connector-scheduler.test.ts` 增加固定 Math.random mock 消除 jitter flaky test，属于测试稳定性保障。
- 总体判断：实现完全满足 AC-001 ~ AC-004，权限矩阵工厂化重构彻底，Popup 与 Tray 权限边界清晰收敛，Preload 单元测试与全局测试套件全部通过，无阻断缺陷。
- 系统性 follow-up：无

#### AC 复验方式

- AC-001：`re_verified`，查证 `src/preload/index.ts` 与 `src/preload/api_factory.ts`，彻底消除 switch-case 冗余，统一通过 route 选择器和工厂组装 `UsageboardApi`；`pnpm typecheck` 通过。
- AC-002：`re_verified`，独立运行并查证 `tests/unit/preload/route_api.test.ts` 与 `tests/unit/preload/oauth_api.test.ts`，验证 Popup 与 Tray 低权窗口中 Grok Bot 与 Session 接口均为 disabled/reject 存根且不触发 IPC。
- AC-003：`re_verified`，独立运行并查证 `tests/unit/preload/config_filter.test.ts` 与 `tests/unit/preload/preload_permission_matrix.test.ts`，验证 Popup `config.save` 传入越权配置被白名单丢弃并恢复为当前配置。
- AC-004：`re_verified`，独立运行 `pnpm vitest run tests/unit/preload/`，全量 9 个文件 59 个测试通过，完整覆盖各窗口类型只读与设置档位边界。

coverage = 4 / 4 (100%)

verdict: PASS
