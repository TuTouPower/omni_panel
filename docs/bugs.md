# 已知待修问题

## T029 connector 脚本 per-account error 改进

- 现状：`observation_to_metric_record` 已映射 `last_error`（T028）。refresh-service 已记 stale `last_error`。但 connector 脚本多用 `throw`（整体 failed），不调 `ctx.report_failed_account(...)` per-account。
- 需改：connector 脚本 per-account catch → `ctx.report_failed_account(provider, account_id, account_label, error)` + continue。
- 工作量：中等，分 connector 迁移。
- 关联 task：t084（connector per-account error 迁移）。
- t059 已对 cpa/mimo/minimax 空响应加 report_failed_account；本条扩展到 per-account catch（多账号 connector 如 CPA 逐 auth_file）。
- 修复：t084 spike close（commit `311ee3d`）评估完结——CPA `connector.ts` 已对逐 auth_file 调 `ctx.report_failed_account`（`:527`/`:540`），grok/mimo 等单账号 connector 用 `throw` 整体 failed 判定为合理（单账号无 per-account 细化必要）。无需进一步迁移。

## OpenCode Go 添加账号无弹窗

- 报告时间：2026-07-24。
- 现象：设置 > 账号 > 添加账号 > 选择 OpenCode Go，点击后无弹窗（应有登录流程或 cookie 输入）。
- 需确认：openCode Go connector 是 session 型（cookie），添加流程应触发登录弹窗或 cookie 输入框；可能 AddAccountDialog 对 session 型 connector 的分支缺失或 opencode_go 未在 ADD_COMMON_SERVICES 以外单独处理。
- 关联：connectors/opencode_go/manifest.json capabilities=["session"]；AddAccountDialog 组件。
- 修复：t098（commit `3aabba4`，origin/main）AddAccountDialog 加 `opencode_go: "session"` 与 `is_opencode_go` 分支，OpenCode Go 走内嵌网页登录流程。

## 用量条监控重置按钮仅 Tavily 有，其他厂商缺失

- 报告时间：2026-07-24。
- 现象：用量面板 Tavily 账号的用量条有监控重置（bell）按钮，其他所有厂商账号都没有。
- 期望：所有厂商所有账号的用量条都应有监控重置按钮，统一放在刷新时间后面同一行。
- 现状：tavily 的 bell 按钮放到了第二行（应与刷新时间同行）。
- 关联：t043（metric 级监控开关）+ t046（bell 透传 ProviderAccountRow → UsageBarList）+ t048（设置页 bell）。bell 透传链可能有条件分支导致仅部分厂商渲染。
- 修复：t086（commit `cf8a55d`，origin/main）bell 全厂商可见 + `.bar-watch` CSS + bar-row grid 末列让 bell 与刷新时间同行。

## 添加账号弹窗前出现黑色横线

- 报告时间：2026-07-24。
- 现象：设置 > 账号 > 添加账号时，弹窗出现前先闪现一条黑色横线。
- 猜测：AddAccountDialog 或其父容器的 CSS border/transition 在 dialog 打开瞬间渲染了一帧 border/border-top/border-bottom 但内容尚未渲染。
- 关联：src/renderer/components/AddAccountDialog.tsx；可能 dialog container CSS border 在 animation/render 首帧可见。
- 修复：t106（commit `89dec60`，origin/main）`.acct-dialog` 的 `dialogIn` 动画 `from` 帧显式追加 `border-color: transparent; box-shadow: none;`，并加 `animation-fill-mode: backwards;`，消除首帧空容器 border/阴影闪现；新增 Playwright web e2e 首帧计算样式断言。

## 用量面板宽度无法任意拉伸（硬上限 780px）

- 报告时间：2026-07-24。
- 现象：用量面板（popup / floating）拖边角调整宽度时，最大只能拉到 780px，无法继续加宽；高宽比 1:3 永远达不到（780/1080 最大 0.72）。
- 根因：
    - `src/main/core/main-panel/main-panel-controller.ts:20-21` 硬编码 `MIN_PANEL_WIDTH=472`、`MAX_PANEL_WIDTH=780`；`save_floating_bounds` (line 90) 和 `create_panel_window` floating 分支 (line 139-142) 都把宽度 clamp 到该区间。
    - `src/main/window/window-manager.ts:38-39` `WINDOW_CONFIGS.usage` 硬编码 `minWidth: 472, maxWidth: 1400`。
- 历史：「修过」是误解。`d723d3d fix: resize usage panel for demo layout` (2026-06-06) 只是把上限 460 拉到 780 给 demo 腾空间，同时把 780 写死为新上限。从未支持任意宽度。
- 测试缺失：`tests/unit/main/main_panel_controller.test.ts` 零断言 MIN/MAX_PANEL_WIDTH 或用户手动 resize 后 clamp 行为；`tests/unit/main/popup_height_controller.test.ts` 只测高度。无 e2e 拖边角验证。
- 关联 task：t099。
- 修复：t099（commit `b5d2c47`，origin/main）删除 `MAX_PANEL_WIDTH` 常量与 window-manager maxWidth，clamp 上限改运行时 `display.workArea.width`，补 `main_panel_controller.test.ts` resize clamp 用例。

## 多账号卡片折叠后再展开仍停留「N账号」而非「概览」

- 报告时间：2026-07-24。
- 现象：多账号 provider 卡片展开后，点「N账号」切到账号明细；折叠卡片；再展开卡片，仍显示账号明细，L2 高亮仍停留在「N账号」。用户期望折叠后重置回「概览」。
- 根因：`src/renderer/components/ProviderCard.tsx:119` `const [l2open, set_l2open] = useState(false)` 是组件内 useState，与 `expanded` prop 正交但未定义折叠时的语义。折叠时 L2 seg 不渲染但 `l2open` 保留；再展开时沿用旧值。
- 历史：`804e3c2 feat: card header, L2 segmented control` (2026-06-09) 引入 L2 seg 时留下的设计漏洞。
- 测试缺失：`tests/unit/renderer/components/provider_card.test.tsx` 只覆盖「展开时默认显示概览」（line 204）和「展开时点击账号明细切换」（line 852），无任何用例覆盖「展开 → 切账号明细 → 折叠 → 再展开」的状态序列。`tests/unit/renderer/views/popup_view.test.tsx` 的 collapsedAccounts/expandedProviders 测试聚焦 config 持久化，不触碰 L2 子状态。
- 关联 task：t100。
- 修复：t100（commit `4a8be33`，origin/main）在 `ProviderCard.tsx` 加 `useEffect(() => { if (expanded === false) set_l2open(false); }, [expanded])`，折叠时重置 L2 子状态回概览，补 provider_card 折叠→再展开用例。

## task 索引序列化不符合仓库格式

- 报告时间：2026-07-24。
- 现象：`scripts/task.py` 写入 `docs/tasks_index.json` 后使用 CRLF 和 2 空格缩进；`git diff --check` 将 CRLF 报为 trailing whitespace，Prettier 也拒绝该文件。
- 根因：`save()` 未指定 `newline="\n"`，且 `json.dumps(..., indent=2)` 与仓库的 4 空格格式不一致。
- 需改：为 `save()` 固定 LF 和 4 空格缩进，补脚本测试；仅通过脚本重写 task index，禁止手工修改 JSON。
- 关联 task：t102 review finding `t102_code_f002`。
- 修复：`5484704 fix(scripts): task.py save() 用 4 空格缩进 + LF`（origin/main）——`save()` 改 `indent=4` + `newline='\n'`，补 `scripts/test_task.py` 三条 pytest 钉住格式契约。

## config 数据丢失：fallback 路径绕过 P0 保护，auto_seed 覆盖账号

- 报告时间：2026-07-25。
- 现象：重启应用后 config.json 里配置的账号（plugins 数组）全部消失，被 auto_seed 重新生成的 connector（新 randomUUID）覆盖，密钥与 instanceId 对不上、账号全失联。
- 根因链：
    1. `writeBakAtomic` 在 `writeFile` 阶段进程被强杀（`taskkill /F`），`config.json.bak` 的 tmp 只剩预分配的 null 字节，rename 后变成纯 `\0` 文件。
    2. 重启时主 `config.json` 解析失败，去读 `.bak` 也是 null 字节损坏。
    3. `config-store.ts` 的 `load()` 在**主 + bak 都坏**时，只有 schema 解析失败路径才走「抛错、不 fallback、防 auto_seed 覆盖」的 P0 保护；而 ENOENT / 空文件分支直接 `return DEFAULT_CONFIGURATION`（空 plugins），**没抛错**。
    4. `DEFAULT_CONFIGURATION` 空 plugins 触发 auto_seed，重新生成 connector（新 instanceId）写回 config.json，覆盖原账号。
- 需改：`load()` 的 ENOENT / fallback 分支同样走「抛错 + 拒绝默认启动 + 不 auto_seed」保护，不能 `return DEFAULT_CONFIGURATION` 让 auto_seed 有机可乘；或 fallback 时禁止 auto_seed 运行。
- 关联：`src/main/core/config/config-store.ts` `load()` 的 ENOENT / 空文件分支（约 line 244-246）；`writeBakAtomic` 中断留 null padding。
- 数据恢复：2026-07-25 经 secrets.vault（aes-gcm master key）+ custom_env.py 明文 key 池反推重建，10 个 connector 全部密钥关联恢复。
