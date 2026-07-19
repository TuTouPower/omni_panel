# Task review T001

- task：`T001_preload_route_sync`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-20 03:10 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T001_code_f001 — 实现与 spec 范围完全一致，无越界

- 严重度：info（符合预期，记录在案）
- 位置：`src/preload/index.ts` L335/L341、`src/preload/route_api.ts` L8、`tests/unit/preload/route_api.test.ts` L28/L39
- 问题：无问题。diff 仅含 spec 范围内 3 处代码 + 2 处 test 断言；`docs/tasks_index.md` 改动为 task 登记，合理。未触及 `window-manager.ts` / renderer / 业务逻辑，与「非范围」一致。
- 建议：无需动作。

### T001_code_f002 — case/fallback/判断值与真相源完全对齐

- 严重度：info（关键正确性校验，通过）
- 位置：同 f001
- 问题：无问题。三方对照——
    - `window-manager.ts` WINDOW_CONFIGS：`usage`/`setting`/`tray`/`agent`（L32/L42/L53/L60）
    - `use-route.ts` VALID_ROUTES：`usage`/`setting`/`agent`/`tray`（L6）
    - `App.tsx` route→view：`setting`→SettingsView / `tray`→TrayMenu / `agent`→TokenStatsView / default→PopupView

    preload 侧修改后：
    - L335 fallback `"usage"` 命中 VALID_ROUTES 默认值（`normalize_hash` 返回 `"usage"`）
    - L341 `case "setting"` 命中 WINDOW_CONFIGS.setting.route
    - `route_api.ts` L8 `route === "setting"` 同步

    `pnpm test tests/unit/preload/route_api.test.ts` 4 个用例全绿。设置窗 hash=`setting` 现可命中 `case "setting"` → 拿到 `config_full` / `route_grok_api`（settings_api），spec 背景所述 saveSecrets no-op / grok 分权失效问题被修复。

- 建议：无需动作。

### T001_code_f003 — preload 无 route 值残留（`"popup"`/`"settings"` 作为 route 字面量已清零）

- 严重度：info（spec 验收项「`preload/index.ts` route 相关无 `"popup"`/`"settings"` 残留」通过）
- 位置：`src/preload/` 全量扫描
- 问题：无问题。`src/preload/` 中 `"popup"`/`"settings"` 作为 **route 字面量** 已 0 残留。余下出现的均为非 route 语义，不应清除：
    - `index.ts:205` `"popup" | "floating"`：`main_panel.get_mode()` 的返回联合类型（主面板显示模式），与 route 无关。
    - `index.ts:194/214` `popup_methods` / `settings_methods`：API 模块变量名（暴露给 renderer 的方法包），与 route 值无关。
    - `index.ts:348/351/381/384/410/413` `popup:` / `settings:`：`UsageboardApi` 上的 API surface key（即 `window.usageboard.popup` / `window.usageboard.settings`），是稳定对外契约，**不能**随 route 重命名。
    - `index.ts:234` `open_settings`：TRAY 通道名（`TRAY_OPEN_SETTINGS`），动作语义而非 route。
    - `route_api.ts:6` `settings_api: GrokSettingsApi`：参数名，描述能力集而非 route。
- 建议：无需动作。spec 验收项已严格满足（扫的是 route 相关残留，上述均不属于）。

### T001_code_f004 — `default: // popup` 注释与新 route 体系语义轻微错位

- 严重度：suggestion
- 位置：`src/preload/index.ts:393`
- 问题：`default: // popup` 注释中的「popup」在 route 重构后不再作为 route 字面量存在；default 分支现实际服务于 `usage`（及未来任何未知 hash）窗口。注释语义仍可理解（default 分支的 API shape 沿袭自旧的 popup 窗口），但对新读者会与已消除的 `"popup"` route 产生认知摩擦。`index.ts:130` `// Read-only config (popup, tray)` 和 `index.ts:136` `// Full config (settings only)` 同属一类（用 popup/settings 描述窗口角色而非 route 值）。
- 建议：可选。若追求术语完全统一，把注释里的窗口角色词改为 `usage`/`setting`（如 `default: // usage / unknown`、`// Read-only config (usage, tray)`、`// Full config (setting only)`）。**注意**：此为文档同步性质，按 spec 「非范围：不改文档（属 T002）」的边界，严格说应纳入 T002 一并处理（T002 spec 已声明负责 specs/blueprint 的 route 值同步），代码注释可作为 T002 的可选附加项。本 task 不必回退修改。

### T001_code_f005 — task 文档（spec/plan/log）真实反映代码状态

- 严重度：info（文档真实性校验，通过）
- 位置：`docs/tasks/T001_preload_route_sync/spec.md`、`plan.md`、`log.md`
- 问题：无问题。
    - `spec.md` 背景、范围、非范围、验收标准与 diff 完全一致；验收项「`pnpm test` 全绿 / preload 无 `"popup"`/`"settings"` 残留 / `route_api.ts` 判定 `=== "setting"`」均经独立验证为真。
    - `plan.md` 步骤 1-4 对应 3 处代码 + 1 处 test 全量验证，风险项「其他 test 或代码引用旧 route 值」已由本 review 排除。
    - `log.md` 诚实记录「代码先于 spec 完成」的中途状态，符合「不写命令流水账」要求。
- 建议：无需动作。

## 结论

**通过（PASS）。** T001 实现严格落在 spec 范围内（3 代码 + 2 test，无越界），case/fallback/判断值与 `window-manager.ts` + `use-route.ts` + `App.tsx` 三方真相源完全对齐，preload 层 route 字面量残留为零，task 文档真实可信，目标测试全绿。spec 背景所述「设置窗 saveSecrets no-op、grok 分权失效」问题已被精确修复。唯一 observation（f004）是代码注释中仍以 `popup`/`settings` 作为窗口角色词，属 T002 文档同步范畴，不构成 T001 阻塞。
