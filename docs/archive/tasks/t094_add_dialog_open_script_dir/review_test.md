# Task review t094（reviewer_focus: 测试）

- task：`t094_add_dialog_open_script_dir`
- spec：`docs\tasks\t094_add_dialog_open_script_dir\spec.md`
- diff_anchor：`b4f7c9c3601fe4dde23750321873cac163cd6df0`
- target：`git diff b4f7c9c3601fe4dde23750321873cac163cd6df0`
- round：1
- reviewed_at：2026-07-24 11:00 UTC+8

## 测试改动盘点

`git diff b4f7c9c3601fe4dde23750321873cac163cd6df0 -- tests/` 只动 5 个 view 测试文件，每处仅一行：

- `tests/unit/renderer/views/popup_view.test.tsx:166`
- `tests/unit/renderer/views/popup_view_height.test.tsx:171`
- `tests/unit/renderer/views/popup_view_mirror.test.tsx:98`
- `tests/unit/renderer/views/settings_view.test.tsx:213`
- `tests/unit/renderer/views/tray_menu.test.tsx:50`

均为给 mock `settings` 对象补 `openConnectorsDir: vi.fn()`。原因可追溯：`src/shared/types/ipc.ts:337` 给 `UsageboardApi.shell` 同级 `settings` 命名空间新增了 `openConnectorsDir(): void`，旧 mock 不补会触发 TS 类型错误。**补 mock 本身合法**，只让旧测试在类型契约变更后继续编译/通过，不算危险模式（未 mock 被测逻辑、未弱化既有断言）。

问题在于：除补 mock 外，**本 task 没有为新增功能加任何用例**。

## Findings

### t094_test_f001 - 新增按钮「打开脚本目录」无组件测试，违反 plan TDD 承诺与 spec AC

- 严重度：important
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx`（整文件未被 diff 触及；该文件内全文检索 `openConnectorsDir` / `打开脚本` / `connectors` 均无匹配）
- 问题：
    - spec AC（`spec.md:26-27`）两条核心条款：「添加账号弹窗有『打开脚本目录』按钮」「点击后系统文件管理器打开 `userData/connectors` 目录」——**无任何测试证据**。
    - `plan.md:5` 第 1 步明确承诺「红：加用例（弹窗存在『打开脚本目录』按钮；点击调用 `usageboard.shell.openConnectorsDir()`）」。实际 diff 里没有任何此类用例，TDD 红灯阶段被跳过，直接进入实现。
    - 同文件已有完全同构的按钮测试范式可参照：
        - `add_account_dialog.test.tsx:419` `it("shows CPA button when has_cpa is true", …)`
        - `add_account_dialog.test.tsx:432` `it("calls on_cpa when CPA button is clicked", …)`
    - 被测代码落点：`src/renderer/components/AddAccountDialog.tsx:140-149`（VendorPicker 内新增按钮，`onClick={() => window.usageboard.settings?.openConnectorsDir?.()}`，文案「打开脚本目录」）。这是标准 RTL 组件测试可触达的行为，不存在测不了的理由。
- 建议：至少补两条用例——按钮存在/文案断言、点击触发 `settings.openConnectorsDir()` 调用断言（沿用同文件 CPA 按钮测试写法）。

### t094_test_f002 - 主进程 IPC handler `SETTINGS_OPEN_CONNECTORS_DIR` 无测试，AC「目录不存在时自动创建」与「打开目录」均无验证

- 严重度：important
- 位置：`src/main/index.ts:755-763`（新增 `ipcMain.handle(SETTINGS_OPEN_CONNECTORS_DIR, …)`，含 `fs.mkdir(dir, {recursive:true})` 与 `shell.openPath(dir)` 两个副作用）；`tests/unit/main/` 下全文检索 `SETTINGS_OPEN` / `openConnectorsDir` / `openPath` / `USER_CONNECTORS` / `connectors_dir` 均无匹配。
- 问题：
    - spec AC（`spec.md:27-28`）：「点击后系统文件管理器打开 `userData/connectors` 目录」「目录不存在时自动创建」——两条均依赖主进程 handler 行为，但 `tests/unit/main/` 下没有任何针对该通道的 IPC 测试（已有同类范式：`tests/unit/main/settings-close-action.test.ts` 测 `SETTINGS_CLOSE`）。
    - handler 实现含 try/catch 吞错（`// 目录可能已存在，忽略`），若 mkdir 失败被静默忽略后 openPath 行为未验证——属于「应在边界测」的范畴（文件系统副作用 + 外部 shell API）。
    - 非范围合理说明：纯 Electron `shell.openPath` 的 E2E 不要求测；但 mkdir + invoke 的契约是可测的单元/集成行为，不应整段空缺。
- 建议：参照 `tests/unit/main/settings-close-action.test.ts` 写一条 IPC 测试：mock `fs.mkdir` 与 `shell.openPath`，invoke `SETTINGS_OPEN_CONNECTORS_DIR`，断言两者被以 `getUserConnectorsDir()` 返回值调用、`recursive: true`；至少一条「目录不存在则创建」的分支用例。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：2 条（均 important）。
- 总体判断：5 处 mock 补丁本身合法；但本 task 三条功能性 AC（按钮存在 / 点击打开目录 / 目录自动创建）**全部零测试覆盖**，且违反 `plan.md` 第 1 步 TDD 红灯承诺——测试层面判 FAIL。

verdict: FAIL

## Round 2 (2026-07-24 06:25 UTC+8)

### 前轮 finding 复核

- **t094_test_f001（按钮组件测试）**：已修。`tests/unit/renderer/components/add_account_dialog.test.tsx:449-492` 新增两条用例：
    - `renders the open-script-dir button in vendor picker` 断言 `screen.getByText("打开脚本目录")` 存在——与 AC「弹窗有『打开脚本目录』按钮」字面对齐，非「存在即通过」式弱化（AC 本身就是存在性条款）。
    - `invokes settings.openConnectorsDir when button clicked` 使用 `userEvent.setup()` + `user.click()` 触发真实点击，断言 `open_connectors_dir` 被调用 `toHaveBeenCalledTimes(1)`——强断言、真实交互，非程序赋值冒充。
    - mock 边界合法：仅 mock `window.usageboard.settings.openConnectorsDir`（IPC/系统 shell 边界），未 mock 被测组件内部逻辑。
    - `afterEach` 中 `// @ts-expect-error` 标注 `delete window.usageboard`——用于全局 mock 拆除，非断言或测试逻辑，不属于「静默错误」危险模式。
- **t094_test_f002（open_connectors_dir 主进程单测）**：已修。implementer 选择**抽纯函数 + DI**方案（`src/main/core/open-connectors-dir.ts`）而非 Round 1 建议的 IPC handler 测试，`tests/unit/main/open-connectors-dir.test.ts:17-49` 三条用例：
    - `creates dir then opens it on success`：断言 mkdir 与 open_path 均以 dir 路径调用、`log.warn` 未触发——覆盖 AC「目录自动创建 + 打开目录」的成功路径。
    - `logs warn and still attempts open when mkdir fails`：注入 mkdir reject，断言 warn 记录且 open_path 仍执行——覆盖错误分支。
    - `logs warn when open_path returns a non-empty error string`：open_path 返回错误串，断言 warn 记录——覆盖 shell 失败分支。
    - 覆盖等价性：相比 Round 1 建议的「IPC + recursive:true 断言」，该方案在错误分支覆盖上更强（3 用例 vs 建议 1-2 条），但**未直接断言 `{recursive: true}` 字面量**——此为 wrapper 实现细节（`src/main/index.ts:758-760` 一行 `await mkdir(p, { recursive: true })`），不属测试规范要求的强制覆盖。IPC handler 注册本身未单测，但 handler 仅 10 行接线代码，核心行为已被纯函数覆盖。
    - 无危险模式：`stringContaining` 系匹配子串的 matcher，非断言弱化；无 `.skip` / `@ts-ignore` / 恒真断言。

### 本轮新发现

0 条。本轮扫描重点：

- 弱化断言检查：未发现 `toBe → toContain / regex / >= / toBeTruthy` 等降级模式。
- 新文件 `tests/unit/main/open-connectors-dir.test.ts` untracked（`git status` 显示 `??`），未 `git add -N` 纳入 diff_anchor 对比——`task.md` Step 5 要求 `git add -N` 但未执行。属流程瑕疵，不改变测试本身结论（已单独 Read 文件验证内容）。不作为 finding（非测试质量问题）。
- Mock 边界复检：所有 mock 均在系统边界（`fs.mkdir` / `shell.openPath` / IPC 端点），未 mock 被测逻辑自身。

### 总体判断

Round 1 两条 finding 已实质性修复，测试覆盖三条功能性 AC（按钮存在 / 点击打开目录 / 目录创建）均有真实可观察证据，无新增危险模式。

verdict: PASS
