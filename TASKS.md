# OmniUsage 任务清单

> 全部任务已归档至 `docs/archive/tasks_history.md`。

---

## 1. [改造计划] CPA 标签映射按服务分开

**状态**：计划已出，待实施。

**需求**：
"cpa 的标签映射设置要按照 claude codex gemini 分开。就是既可以在数据源设置 cpa 里面一起设置，也可以在账号设置里面分开设置"

即：CPA 标签映射需要支持按 AI 服务（claude/codex/gemini/...）分开配置。用户可以在数据源设置 → CPA 页面统一设，也可以在单个账号设置里分别设。

**改造概要**：

- 新增 `providerLabelMaps` 配置字段（`src/shared/types/config.ts`）
- 在 CPA 设置页每个 provider 组旁加标签映射按钮（`src/renderer/components/CpaConnectorSettings.tsx`）
- 复用现有 `LabelMapDialog`，增加 `save_target: "account" | "provider"` 区分（`src/renderer/views/SettingsView.tsx`）
- 标签合并优先级：账号级 > 服务级 > 全局级（`src/renderer/components/ProviderAccountList.tsx`）
- 涉及约 9 个文件，详见完整改造计划。

**测试覆盖**：暂无。应在实施时添加：

- `providerLabelMaps` 配置读写测试（`config-store.test.ts`）
- CPA 设置页标签映射按钮渲染测试（`cpa_connector_settings.test.tsx`）
- 三级标签合并优先级测试（`provider-usage.test.ts`）

---

## 2. [Bug] MIMO 登录后获取不到数据

**状态**：根因已定位，待修复。

**现象**：用户在添加账号或编辑账号时填入 MiMo Cookie，登录完成后页面上 MiMo 不显示数据。

### 根因 #1：新增 MiMo 账号时 Session Cookie 未被保存

**文件**：`src/renderer/components/AddAccountDialog.tsx`

- **行 56**：MiMo 定义为 `"mimo": "session"`，需要 Cookie 登录。
- **行 238-252**：`SessionForm` 组件有 `cookie` state 和 Cookie 输入框（行 270-278）。
- **行 422-449**：`handle_save` 只处理了 `auth_method === "apikey"` 分支（行 435-443），**没有 `session` 分支**。

结果：用户粘贴的 Cookie 没有写入 `params.secrets = { SESSION_COOKIE: cookie }`，新建出的 MiMo 插件实例缺少 `SESSION_COOKIE`，刷新时插件在 `assets/plugins/mimo-usage-plugin.ts:86-88` 因缺少参数失败。

**修复方向**：

1. 给 `SessionForm` 增加 ref 或回调，把 `cookie` 值传给父组件。
2. 在 `handle_save` 中增加 `session` 分支：
    ```ts
    if (auth_method === "session") {
        params.secrets = { SESSION_COOKIE: cookie };
    }
    ```
3. Cookie 裸 token 自动补全为 `api-platform_serviceToken=<token>` 格式。

### 根因 #2：网页登录保存 Cookie 后没有触發插件刷新

**文件**：`src/renderer/views/SettingsView.tsx`

- **行 424-430**：`cookieLogin` 成功后只调用了 `window.usageboard.config.get()`，但**丢弃了返回值，没有触发插件刷新**。

结果：用户通过网页登录捕获 Cookie 后，cookie 被保存到 secret store，但插件没有被立即刷新，主面板看不到新数据。需要等待下一次定时刷新或手动刷新。

**修复方向**：

- `cookieLogin` 成功后立即调用 `window.usageboard.plugin.refresh(instanceId)`：
    ```ts
    if (result.saved) {
        await window.usageboard.plugin.refresh(id);
        await window.usageboard.config.get();
    }
    ```

### 次要问题：Cookie 格式隐患

**文件**：`assets/plugins/mimo-usage-plugin.ts`

- **行 86-88**：代码把用户输入原样作为 `Cookie` header，不检查是否包含 `=`。
- 用户只粘贴裸 token（如 `abc123`）而非完整格式（`api-platform_serviceToken=abc123`）会导致 401。
- `docs/research/mimo_cookie_research.md:84-97` 已有研究文档指出此隐患。

**修复方向**：保存或请求前 normalize Cookie——不含 `=` 时自动补全为 `api-platform_serviceToken=<value>`。

**测试覆盖**：

- `tests/unit/renderer/components/add_account_dialog.test.tsx` — 2 个测试，验证 `handle_save` 对 session-auth 账号传递 `SESSION_COOKIE`（**当前预期失败**，需代码修复后通过）
- `tests/unit/renderer/views/settings_view.test.tsx` — 2 个测试，验证 `cookieLogin` 成功后调用 `plugin.refresh` 的行为模式
- 还应补充：`mimo-usage-plugin.ts` 的 Cookie normalize 单元测试（待加）

---

## 3. [设计疑点] 用量卡片外面带有红框

**状态**：已查明来源，待决策是否移除。

**现象**：minimax、mimo、glm、codex、claude 的用量卡片有红框，其他服务没有。codex 六个账号中三个有红框、三个没有。

### 来源分析

**红框不是意外 bug，是当前代码有意实现的设计**。

1. **样式定义**：`src/renderer/styles/globals.css:348-356`

    ```css
    .card.alert {
        border-color: color-mix(in srgb, var(--red) 38%, var(--card-border));
    }
    ```

2. **触发条件**（Provider 卡片）：`src/renderer/components/ProviderCard.tsx:81-83`
    ```ts
    const is_danger = group?.status === "critical";
    const card_class = (is_danger || isFailed ? "alert" : "") + ...;
    ```
3. **触发条件**（账号卡片）：`src/renderer/components/ProviderAccountRow.tsx:97-98`

    ```ts
    const card_class = (account.status === "critical" ? " alert" : "") + ...;
    ```

4. **critical 判定**：`src/plugins/sdk/helpers.ts:3-7`

    ```ts
    if (pct >= 90) return "critical"; // → 红框
    if (pct >= 75) return "warning"; // → 无红框
    return "normal"; // → 无红框
    ```

5. **E2E 测试明确验证了此行为**：`tests/user_e2e/specs/popup_card_states.spec.ts:98-107`
    ```ts
    test("critical usage shows alert border and filled usage bar", ...)
    ```

### 为什么部分服务/账号有红框

- 红框 = 该服务/账号的某个用量窗口 `used >= 90%`（status 为 `critical`）。
- Codex 3 个有 3 个没有 = 那 3 个账号确实有周期用量 >= 90%，另外 3 个没有。
- 不显示红框的服务 = 没有任何 period 达到 critical，也没有连接器完全失败。

### 如果确定要移除红框

改两处即可：

- `src/renderer/components/ProviderCard.tsx:81` — 去掉 `is_danger ? "alert" : ""`
- `src/renderer/components/ProviderAccountRow.tsx:97-98` — 去掉 `account.status === "critical" ? " alert" : ""`
- 同步更新 E2E 测试中对 `.card.alert` 的断言。

**测试覆盖**：

- `tests/unit/renderer/components/provider_card.test.tsx` — 4 个测试：critical → alert、normal → 无 alert、connectorError → alert、warning → 无 alert
- `tests/unit/renderer/components/provider_account_row.test.tsx` — 3 个测试：critical → alert、normal → 无 alert、warning → 无 alert
- `tests/user_e2e/specs/popup_card_states.spec.ts:98-107` — 已有 E2E 覆盖 critical alert border
