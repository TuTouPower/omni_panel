# General Review 报告

## Round 1 (2026-09-15 15:26 UTC+8)

reviewed_scope: b41b774642bae68c

### 审查范围与基线

- 审查基线：`c7c46a05ae73c7fc48ffe31505e8a187c9dd13ad`
- 交付范围：
  - `src/main/core/dock-badge.ts`
  - `src/main/core/main-panel/main-panel-controller.ts`
  - `src/main/window/window-manager.ts`
  - `src/main/index.ts`
  - `tests/unit/main/core/dock-badge.test.ts`

### 检查要点核对

1. **规格合规**：
   - AC-001：在 macOS 宿主下，当主窗口被激活展示或获得焦点时，调用系统 API 清除 Dock 角标（`setBadge("")` 与 `setBadgeCount(0)`）。
   - AC-002：在 macOS 宿主下，当应用接收到 Electron `activate` 事件时，调用系统 API 清除 Dock 角标。
   - AC-003：在非 macOS（Windows / Linux）平台上，角标清除逻辑静默跳过，不调用不存在的平台 API。
2. **实现正确性**：
   - `src/main/core/dock-badge.ts` 封装了平台防御性判定（仅 `platform === "darwin"` 执行），并使用 try/catch 包装了 `app.dock.setBadge("")` 与 `app.setBadgeCount(0)`，杜绝了非 macOS 平台或者 dock 服务异常时的崩溃风险。
   - `src/main/window/window-manager.ts` 为每个由 `createWindowFor` 创建的窗口均注册了 `win.on("focus")` 监听清除角标。
   - `src/main/core/main-panel/main-panel-controller.ts` 在 `show_panel` 时触发 `deps.on_show?.()`。
   - `src/main/index.ts` 注册了 `app.on("activate")` 监听，在点击 Dock 图标时清理角标并呼出主面板。
3. **测试可信度**：
   - `tests/unit/main/core/dock-badge.test.ts` 覆盖了 macOS 平台清除、Windows/Linux 平台静默跳过、dock 缺失容错、API 抛错防御以及 `main_panel_controller` 的 `on_show` 触发逻辑，所有 5 项测试全数通过。
4. **质量门禁**：
   - TypeScript 类型检查完全通过（0 错误）。
   - ESLint 代码检查完全通过（0 警告，0 错误）。

### Finding 清单

| finding_id | severity | title | file:line | description | recommendation |
|---|---|---|---|---|---|

（Round 1 零 finding）

### 结论

verdict: PASS

#### AC 复验方式

- `AC-001`：`re_verified`，`tests/unit/main/core/dock-badge.test.ts` 验证 darwin 下清除 setBadge("") 与 on_show 回调。
- `AC-002`：`re_verified`，`tests/unit/main/core/dock-badge.test.ts` 验证 darwin 下清除逻辑，且在 `src/main/index.ts` 注册 `app.on("activate")`。
- `AC-003`：`re_verified`，`tests/unit/main/core/dock-badge.test.ts` 验证 win32/linux 下不调用任何平台 API。

coverage = 3 / 3
