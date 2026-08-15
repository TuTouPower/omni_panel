# General review: t415 elevation_layering_unify

## Round 1 (2026-08-16 05:21 UTC+8)

reviewed_scope: 7568715bae55bee9

### Findings

无 finding。

### Verdict

verdict: PASS

### 结论

diff 将阴影明暗切换下沉到 `globals.css` 的 `.dark` 变量翻转；组件去掉 `dark:shadow-*`；裸 `z-10`/`z-20` 对号五层；手写/`shadow-sm`/`shadow-lg` 归 `--shadow-*` 工具类；logo 沉淀 `@utility logo-drop-shadow`；`SelectionDock` 去毛玻璃改实底。测试 `elevation_layering.test.ts` 以源码扫描覆盖 AC-001~004，触达生产路径。未改交互结构，范围无偏航。

### AC 复验方式

| AC | 类别 | 证据 |
|---|---|---|
| AC-001 | re_verified | `rg 'dark:shadow-' src/renderer src/web` 零命中；`globals.css` `.dark` 块含 `--shadow-window: var(--shadow-window-dark)` / `--shadow-card: var(--shadow-card-dark)`；`elevation_layering.test.ts` 两断言通过 |
| AC-002 | re_verified | `rg '\bz-(10\|20\|30\|40\|50)\b' src/renderer src/web` 零命中；点位为 `z-sticky`/`z-menu`/`z-context` 或 `z-[var(--z-*)]` |
| AC-003 | re_verified | `rg 'shadow-\[\|\bshadow-sm\b\|\bshadow-lg\b\|drop-shadow-\['` 零命中；`@utility logo-drop-shadow` 存在且 TrayMenu/PanelTitleBar 消费 |
| AC-004 | re_verified | SelectionDock 无 `backdrop-blur`；全仓 `backdrop-blur` 仅 TrayMenu（菜单）与 Dialog 遮罩 |
| AC-005 | trust_prior | `[deploy]` 暗色目检；依赖实施后人工环境，本轮未渲染 Electron/web UI |
| AC-006 | re_verified | `pnpm test`：3319 passed / 9 skipped；本轮重跑 elevation 守卫 6/6 通过 |

coverage = re_verified / 总 AC 数 = 5/6

建议合并前人工抽查 trust_prior 项（AC-005：暗色窗口/卡片投影、浮层遮挡、SelectionDock 实底观感）。

### 视角扫描（未出 finding 确认）

- 规格合规：AC-001~004/006 有代码与测试闭合；AC-005 标 deploy
- 实现正确性：阴影翻转与既有 color 翻转同构；Dialog 去 z-10 依赖 DOM 序叠在 absolute 遮罩之上，合理
- 安全：纯样式，无注入面
- 契约·Breaking：无公开 API/schema 变更；token 数值未改，仅解析路径下沉
- 性能：无新增运行时开销
- 架构：复合模式进 `@utility`，符合 DESIGN 分层
- 测试：源码扫描 + 变量层断言，非 mock 假绿；无 skip/恒真

## Round 2 (2026-08-16 05:25 UTC+8)

reviewed_scope: ecf8d6c776b131d4

### Findings

无 finding。

### Verdict

verdict: PASS

### 结论

收尾写入 `docs/specs/elevation_layering_unify.md`、更新 `specs_index` / `ui-component-library` 后重算 scope。生产代码与测试相对 Round 1 无功能 diff；指纹变化来自生效 spec 文档。独立复扫 AC-001~004 模式仍清零；不重开实现。

### AC 复验方式

| AC | 类别 | 证据 |
|---|---|---|
| AC-001~004 | re_verified | 同 Round 1 扫描口径，本轮 `rg` 仍零命中；elevation 单测 6/6 |
| AC-005 | trust_prior | 仍标 [deploy] |
| AC-006 | re_verified | Round 1 全量绿未回退代码 |

coverage = re_verified / 总 AC 数 = 5/6
