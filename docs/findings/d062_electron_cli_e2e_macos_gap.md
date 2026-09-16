# d062 electron/cli e2e 在 CI 只跑 Windows/Ubuntu，macOS 缺口长期未暴露

- 来源：2026-09-16 跑通三套 e2e 的现场（p228 修复后本机首次可完整运行）
- 结论：`.github/workflows/*` 的 e2e 只有 `windows-2022` / `ubuntu-latest`（nightly matrix），**macOS 不在矩阵**；`tests/e2e/fixtures/electron_app.ts` 与三个 cli spec 把 Electron 可执行路径硬编码为 `node_modules/electron/dist/electron[.exe]`（Linux/Windows 布局），macOS 实际是 `dist/Electron.app/Contents/MacOS/Electron` → 本机整个 electron/cli e2e 项目连启动都失败（`spawn … ENOENT`），套件里累积了一批只能在 Linux/Windows 成立的假设与陈旧 fixture，长期无人发现。
- 证据（修复前 → 修复后）：
    - 路径：`spawn .../dist/electron ENOENT` → 改用 `tests/e2e/fixtures/electron_binary.ts`（读 electron 包自带的 `dist/path.txt`，跨平台）后 electron e2e 由 `1 passed / 大量失败` 变为 `54 passed / 4 failed / 8 skipped`。
    - 平台假设：`cli_control` 的 autostart「Linux 才 unsupported」、`panel_window_controls` 的 `isMenuBarVisible`（macOS 菜单栏是全局的，窗口级 API 恒 true）、copy/paste 用 `Control` 而非 `Meta`、`desktop_cli_json` 的 `userData` 比较未取 realpath（macOS `/var` → `/private/var`）。
    - 陈旧 fixture 与期望：CLI `--config` 导入自 t472 起只接受 canonical v2 信封、secret 只从信封顶层 `secrets` 入 vault，而 e2e 仍写裸 config 且把 secret 放在 `parameterValues`（→ 启动失败）；`/v1/config/export` 返回 v2 信封，断言仍按裸 config 取 `plugins`；配置插件缺 t471 引入的必填 `manifestId`（schema 拒绝）；`popup_window_constraints` 写死 75% 工作区高度，而 t081 起 `MAX_HEIGHT_RATIO = 1.0`（`docs/specs/window-management.md:33`）；三处「渲染即 count」的 web 用例未等数据（偶发 `count=0`）。
    - 修复后：web e2e 93 passed、cli e2e 4 passed、electron e2e 58 passed / 8 skipped，均 exit 0。
- 影响：任何「e2e 全绿」的判断都需要说明平台；在 macOS 上开发的人此前无法用 electron/cli e2e 做回归。后续若要在 macOS 上长期使用，建议把 macOS 加入 nightly matrix，或在 spec 顶部显式标注平台适用范围。另注意 `mainPanelMode: "system"` 的默认解析随平台而异（darwin → popup，其余 → floating），依赖默认模式的用例应显式 seed 模式，而不是吃宿主默认。
- 现状：有效（缺口已在本机修复；CI 矩阵仍无 macOS）
