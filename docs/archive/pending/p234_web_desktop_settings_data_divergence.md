# p234 桌面端与 Web 设置页数据导入导出界面与行为不一致及同类位点分歧

- 现象：
    1. 设置页「数据与隐私」中的「导出设置」：Web 端副标题为「导出配置；默认不含明文密钥」，并提供「包含明文密钥」复选框与安全提示；桌面端无该复选框，副标题为「导出全部配置与账号密钥到 JSON 文件」，且桌面端导出无论如何都强制包含明文密钥（无脱敏导出选项）。
    2. 导入设置（数据导入）：Web 端导入在后端强制限制 `allowEndpointOverrides: false`，若配置含端点覆盖直接拒绝报错；而桌面端导入允许端点覆盖，与 t473 确立的「Web/桌面同权限同行为」基线脱节。
    3. Preload IPC 桥接层：`src/preload/index.ts` 中 `config.export` 抛弃了入参（`void options;`），且桌面端 IPC 处理函数 `handleConfigExport` 硬编码 `includeSecrets: true`，未能透传与响应前端选项。
- 影响：
    - 用户在桌面端无法自主选择是否导出包含密钥的配置，两端界面与文案分裂，违背了“一套前端代码同等体验”的产品预期；
    - Web 端与桌面端在导出密钥保护、导入端点覆盖校验策略上存在不对称差异；
    - 混淆用户操作习惯，降低两端一致性与可维护性。
- 根因：
    - 历史阶段演进残留：`t277` 引入 Web 导出时将敏感项保护绑定在 `is_web()` 标志上，而桌面仍沿用旧的强制包含密钥逻辑；
    - 后续 `t472` 统一规范了 formatVersion: 2 导出格式（默认不含 secrets），但仅在 LocalAPI/Web/CLI 完整接通，桌面端 UI（`SettingsView.tsx`）依然将 `show_secret_option` 限制为 `web_mode`，`src/preload/index.ts` 忽略了入参 `options`，`config-ipc.ts` 中的 `handleConfigExport` 也未接入 `includeSecrets` 参数；
    - 同类位点扫描：
        1. 【已确认同类】`src/renderer/views/SettingsView.tsx:528`：`show_secret_option={web_mode}` 限制了选项可见性。
        2. 【已确认同类】`src/renderer/views/settings-view/sections/data_section.tsx:64-67`：副标题根据 `show_secret_option` 产生文本差异。
        3. 【已确认同类】`src/preload/index.ts:371-376`：`export: (options?: ConfigExportOptions) => { void options; ... }` 丢弃 options。
        4. 【已确认同类】`src/main/ipc/config-ipc.ts:500-508, 651-654`：`handleConfigExport` 未接收 options 且硬编码 `includeSecrets: true`。
        5. 【已确认同类】`src/main/core/local-api/server.ts:1737`：Web 导入硬编码 `allowEndpointOverrides: false`，桌面无此限制（与 t473 同权限基线违背）。
        6. 【合理差异/非缺陷】`PanelTitleBar.tsx` 中的窗口控制按钮（最小化/关闭等）：Web 端运行于浏览器 tab 中，天然没有原生窗口缩放关闭句柄，隐藏属于合理环境适配；
        7. 【合理差异/非缺陷】`PanelTitleBar.tsx` 页面路由跳转与 `EmptyState.tsx`、`about_section.tsx`：Web 端使用标准 `<a>` 标签支持中键新标签页打开与浏览器历史记录，桌面端使用 IPC 窗口通信，两者视觉呈现完全一致，属语义化平台适配；
        8. 【待统一同类】`WebLoginSection.tsx:110`：Web 新增账号有无 instanceId 提示，桌面没有。
- 测试缺口：
    - 现有 `tests/e2e/web/settings_view.spec.ts` 仅对 Web 环境测试了导出勾选与未勾选；
    - 没有任何单元测试覆盖 `DataSection` 的渲染状态与两端选项一致性；
    - 桌面端 E2E/集成测试未断言桌面导出是否支持无密钥选项；
    - 应补测：
        1. 渲染组件单元测试（新增 `tests/unit/renderer/views/settings_view_data.test.tsx`）：断言在桌面端（`is_web() === false`）与 Web 端，`DataSection` 均统一渲染「包含明文密钥」复选框，初始未勾选，点击后文案与状态正确；点击导出均传递对应 `{ includeSecrets }` 参数。
        2. IPC 单元测试（`tests/unit/main/config_ipc_export.test.ts`）：断言桌面端 `handleConfigExport` 接收 `{ includeSecrets: false }` 时导出的 JSON 中不包含 `secrets`，接收 `{ includeSecrets: true }` 时包含 `secrets`。
        3. LocalAPI 导入测试：验证与桌面端导入一致性。
- 线索：`.scratch/repro_web_desktop_divergence.ts`
- 处理：t490
