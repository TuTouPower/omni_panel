# OmniUsage 任务清单

> 已完成的 Phase 1–16 移入 `docs/archive/tasks-history.md`。

---

## Phase 17: 添加 CPA 插件 — 通过 CPA-Manager 获取多平台 AI 服务额度数据 ✅

### 背景

`ai_monitor` 项目已实现 CPA（Claude Platform API）额度采集，通过 CPA-Manager 代理服务统一管理 OAuth token。
本项目需将其移植为 omni_usage 的标准插件（Python 子进程 + JSON 协议），复用现有插件调度/缓存/UI 基础设施。

支持的 provider：Claude、Codex、Gemini CLI、Antigravity、Kimi。
（Vertex AI 未实现配额获取，暂不支持。）

参考文档：`docs/cpa-quota-guide.md`

### 架构

```
omni_usage 插件系统
    │
    │  spawn python cpa-usage-plugin.py
    ▼
CPA 插件 (Python 子进程)
    │
    │  HTTP 请求 (httpx)
    ▼
CPA-Manager (http://<your-host>:20224)
    │
    │  用存储的 OAuth token 代发
    ▼
上游 API (Anthropic / OpenAI / Google / Moonshot)
```

### 实现步骤

#### 17.1: 编写 `resources/plugins/cpa-usage-plugin.py`

- [x] 输出 `_METADATA` 注释块，声明插件元数据：
    - `name`: `"CPA"`
    - `refreshInterval`: `1800`（30 分钟）
    - `parameters`:
        - `cpa_mgmt_url` (string, 默认 `"http://localhost:20224"`)
        - `cpa_mgmt_key` (secret)
        - `monitor_codex` (boolean, 默认 `true`)
        - `monitor_claude` (boolean, 默认 `true`)
        - `monitor_gemini` (boolean, 默认 `true`)
        - `monitor_antigravity` (boolean, 默认 `true`)
        - `monitor_kimi` (boolean, 默认 `true`)
- [x] `--usageboard-param` 支持运行时传入覆盖默认值
- [x] 依赖：`httpx`（`pip install httpx`），Python 3.8+ 兼容
- [x] 核心逻辑：
    1. 调用 `GET /v0/management/auth-files` 获取 auth 文件列表
    2. 按 provider 分发：`claude` / `codex` / `gemini-cli` / `antigravity` / `kimi`
    3. 跳过 `disabled` 的 auth 文件
    4. 每个 auth 文件通过 `POST /v0/management/api-call` 代理请求上游
    5. 解析五个 provider 的不同响应格式
    6. 输出标准 `PluginOutput` JSON
- [x] 输出 items 格式（每个账号每个周期一个 item）
- [x] 错误处理：单个账号失败不阻塞其他，失败项输出 warning，全部失败输出 error JSON

#### 17.2: 实现五个 provider 的响应解析

- [x] **Claude**: `GET https://api.anthropic.com/api/oauth/usage`
    - Header: `Authorization: Bearer $TOKEN$`, `anthropic-beta: oauth-2025-04-20`
    - 响应字段：`five_hour.utilization`（0~1），`seven_day.utilization`
    - 时间字段：`resets_at` (ISO 8601)
- [x] **Codex**: `GET https://chatgpt.com/backend-api/wham/usage`
    - Header: `Authorization: Bearer $TOKEN$`, `User-Agent: codex_cli_rs/...`
    - 响应字段：`rate_limit.primary_window.used_percent`，`secondary_window`
    - 时间字段：`reset_at` (Unix 秒/ms)
- [x] **Gemini**: 两步 POST
    - Step 1: `loadCodeAssist` → 获取 `cloudaicompanionProject`
    - Step 2: `retrieveUserQuota` → 获取 `buckets[].remainingFraction`
- [x] **Antigravity**: `POST .../v1internal:fetchAvailableModels`（三 URL 回退）
    - Header: `Authorization: Bearer $TOKEN$`, `User-Agent: antigravity/1.11.5 windows/amd64`
    - Body: `{"project": "{project_id}"}` 或 `{}`
    - 响应：`models.{modelId}.quotaInfo.remainingFraction`（0~1），`quotaInfo.resetTime` (ISO)
    - 每个模型独立配额，一个账号输出多条 item
- [x] **Kimi**: `GET https://api.kimi.com/coding/v1/usages`
    - Header: `Authorization: Bearer $TOKEN$`
    - 响应：`limits[]` 数组，每项含 `used`、`limit`、`reset_at` (ISO)、`duration`、`timeUnit`
    - `used_percent = (used / limit) * 100`

#### 17.3: 集成到插件系统

- [x] 确认 `discoverPlugins()` 能发现 `resources/plugins/cpa-usage-plugin.py`
- [x] 首次启动自动创建 CPA 插件实例（auto-seed 机制复用）
- [x] 参数表单：Settings 中显示 CPA 管理地址、密钥、五个 provider 开关
- [x] 密钥回注：`cpa_mgmt_key` 为 secret 类型，执行前自动注入

#### 17.4: UI 适配

- [x] 插件卡片支持多 item 显示（每个账号每个周期一个进度条）
- [x] 标签显示 provider 名 + 邮箱 + 周期（如 "Claude (user@ex.com) · 5小时"）
- [x] 如果复用现有 PluginCard 即可满足则无需修改 UI

#### 17.5: 测试

- [x] **单元测试**：
    - `parse_claude()` — 正常响应、空响应、fractional utilization
    - `parse_codex()` — primary_window / secondary_window 解析
    - `parse_gemini_buckets()` — bucket 解析
    - `parse_antigravity_models()` — 多模型 quotaInfo 解析
    - `parse_kimi()` — limits 数组解析
    - `extract_email()` — 邮箱提取
- [x] **集成测试**：
    - 缺少 httpx → error JSON
    - 缺少 cpa_mgmt_key → error JSON
    - CPA-Manager 不可达 → error JSON

#### 17.6: 文档更新

- [x] `docs/plugin-contract.md` 补充 CPA 插件说明
- [x] `docs/spec.md` 内置插件表添加 CPA 行

### 修改文件（实际）

| 文件                                           | 变更                               |
| ---------------------------------------------- | ---------------------------------- |
| `resources/plugins/cpa-usage-plugin.py`        | **新建** — CPA 插件脚本            |
| `tests/unit/plugin/cpa_parsers_test.py`        | **新建** — Python 解析函数单元测试 |
| `tests/unit/plugin/cpa-parsers-vitest.test.ts` | **新建** — Vitest 包装器           |
| `tests/integration/plugin/cpa-plugin.test.ts`  | **新建** — CPA 插件集成测试        |
| `tests/unit/plugin/bundled-metadata.test.ts`   | 更新插件数量 6→7 + 添加 CPA 条目   |
| `docs/plugin-contract.md`                      | 补充 CPA 插件说明                  |
| `docs/spec.md`                                 | 内置插件表添加 CPA 行              |

### 验证

1. `pnpm check` 全部通过
2. `pnpm test` 全部通过（含新增 CPA 测试）
3. 打包后 Settings 显示 CPA 插件参数表单
4. 填入 CPA-Manager 密钥后触发刷新，Popup 显示 Claude/Codex/Gemini/Antigravity/Kimi 额度数据
5. 单个 provider 无数据时不阻塞其他 provider 的展示

### 注意事项

- `cpa_mgmt_key` 是 secret，不进 git、不进日志、不进测试快照
- CPA-Manager 地址和密钥作为插件参数（而非硬编码），方便用户自建 CPA-Manager
- `httpx` 依赖需在插件脚本中检测，不可用时输出友好错误
- 代理请求中 header 的 `$TOKEN$` 是占位符，CPA-Manager 会自动替换为真实 token
- Antigravity 有三个回退 URL，按优先级尝试；`project` 需先通过 `loadCodeAssist` 获取
- Kimi OAuth token 由 CPA-Manager 自动刷新，客户端无需处理
- Vertex AI 暂不支持（配额系统走 Google Cloud Service Usage API）

---

## Phase 18: 补齐测试覆盖与真实验收缺口

### 背景

`docs/spec.md` 与 `docs/test.md` 要求测试覆盖单元、集成、用户端到端和打包 smoke 四层。
当前单元/集成测试已有基础，但用户端到端测试多数只验证“可见 / 可点击 / 不崩溃”，还没有充分验证真实用户行为产生的状态变化；打包产物与系统托盘行为也主要依赖人工验证，缺少明确验收记录。

目标：把测试从“存在”补到“能防回归”，尤其覆盖此前暴露过的托盘重复、设置保存后异常、CPA 数据获取失败等问题。

### 18.1: 补齐 E2E 刷新行为验证

- [ ] 用户在 Popup 点击“刷新”后，断言至少一个插件卡片进入 `loading` / Skeleton 状态
- [ ] 刷新完成后，断言插件卡片进入 `ready` 或 `failed` 终态，而不是只验证页面未崩溃
- [ ] 成功路径需断言 DOM 中的用量数据发生更新
- [ ] 失败路径需断言错误信息显示在对应 PluginCard 上
- [ ] 验证 stale data：已有成功数据后刷新失败，卡片同时显示旧数据和新错误
- [ ] 避免固定 `waitForTimeout` 作为主要同步方式，改用明确 DOM 状态等待

### 18.2: 补齐设置保存与持久化 E2E

- [ ] 在 Settings 中填写普通参数并保存，断言出现“已保存”反馈
- [ ] 填写 secret 参数并保存，断言输入框不明文回显 secret
- [ ] 保存后重新进入 Settings，断言普通参数仍保留
- [ ] 保存后重启 Electron E2E 实例，断言配置从磁盘恢复
- [ ] secret 保存后重启，断言 `hasSecrets` 状态正确，且不暴露明文
- [ ] 修改刷新间隔并保存，断言配置值持久化
- [ ] 保存设置后断言应用仍只有一个有效窗口/实例，不触发重复初始化副作用

### 18.3: 补齐 Popup / Settings / 插件 UI 状态覆盖

- [ ] Popup 空状态：无插件时显示“暂无插件”类提示
- [ ] Popup 缺 key 状态：需要配置 API Key 的插件未配置时提示去设置
- [ ] Popup Python 不可用状态：显示 Python 警告，且插件功能不可用
- [ ] PluginCard `idle` / `loading` / `ready` / `failed` 四种状态都有真实 DOM 断言
- [ ] PluginCard 多 item 展示：CPA 多 provider / 多账号 / 多周期 item 均可见
- [ ] 进度条颜色阈值：>=75% 黄色，>=90% 红色
- [ ] 相对时间显示：刚刚 / X 分钟前，并随时间更新
- [ ] Settings 参数类型：`secret`、`choice`、`boolean`、`string`、`integer` 都有渲染和交互测试
- [ ] duplicate 按钮复制插件实例后，Settings 侧栏显示去重编号

### 18.4: 补齐 CPA 插件成功路径测试

- [ ] 用本地 HTTP stub 模拟 CPA-Manager `GET /v0/management/auth-files`
- [ ] 用本地 HTTP stub 模拟 `POST /v0/management/api-call`
- [ ] 覆盖 Claude / Codex / Gemini CLI / Antigravity / Kimi 的成功响应
- [ ] 覆盖单个 provider 失败但其他 provider 成功时输出 warning item
- [ ] 覆盖全部 provider 失败时输出 error JSON
- [ ] 覆盖 `monitor_* = false` 时对应 provider 不发请求
- [ ] 覆盖 `cpa_mgmt_url` 末尾有无 `/` 都能正确拼接 URL
- [ ] 验证 `cpa_mgmt_key` 不出现在 stdout、stderr、日志、错误消息中
- [ ] 增加一条 E2E：填写 CPA URL/key 后刷新，Popup 显示 CPA item

### 18.5: 补齐系统托盘与打包 smoke 验收

- [ ] 打包后真实启动 `out/OmniUsage-win32-x64/OmniUsage.exe`
- [ ] 验证渲染进程不白屏，Popup 能正常显示
- [ ] 验证系统托盘只出现一个 OmniUsage 图标
- [ ] 左键托盘图标能打开/隐藏 Popup
- [ ] 右键托盘图标能打开菜单，并能进入 Settings
- [ ] 保存 Settings 后再次检查托盘图标仍然只有一个
- [ ] 退出应用后托盘图标消失，无残留进程
- [ ] 验证打包产物能加载 `extraResource` 中 bundled plugins
- [ ] 每次涉及打包/托盘/资源路径的修复，都在完成报告中记录“自动化测试结果 + 打包 smoke 结果”

### 18.6: 增加覆盖率报告与门槛

- [ ] 为 Vitest 增加 coverage 配置和脚本，例如 `pnpm test:coverage`
- [ ] 先生成当前覆盖率基线，不立即用不现实阈值阻塞开发
- [ ] 按文件列出低于 80% 的模块
- [ ] 优先补 parser、schema、config、cache、scheduler、runner、IPC handler 的分支覆盖
- [ ] 覆盖率稳定后设置全局或分目录阈值
- [ ] 在 `docs/test.md` 记录覆盖率命令和当前门槛

### 18.7: 修正文档与测试现状不一致

- [ ] `docs/test.md` 中 `pnpm test:e2e` 仍写“待实现”，但项目已有 Playwright E2E，需要更新描述
- [ ] 明确区分 renderer smoke（mock IPC）与 user E2E（真实 Electron）不能相互替代
- [ ] `docs/spec.md` 的测试策略与 `docs/test.md` 保持一致
- [ ] 若新增 coverage 命令，同步更新 `docs/test.md` 和 `package.json` 脚本说明

### Phase 18 验收标准

1. `pnpm test` 通过
2. `pnpm test:e2e` 通过
3. `pnpm test:coverage` 可生成覆盖率报告
4. 关键 UI 行为不再只有“可见/不崩”断言，而是验证用户操作后的状态变化
5. CPA 插件有成功路径和部分失败路径测试
6. 打包 smoke 有明确人工验证记录：启动、渲染、托盘唯一、保存设置后托盘不重复

---

## 通用约束（每轮适用）

1. 不实现本轮范围外的功能
2. 不重构无关文件
3. 不修改插件协议来适配实现
4. 每个新模块必须有测试
5. 运行测试并报告结果
6. secret 不进日志/错误消息/测试快照
7. renderer 不直接访问 Node API
8. 每轮输出修改文件列表
9. 每轮输出下一轮建议但不提前实现

## 每轮完成验证

1. 本轮改了哪些文件？
2. 哪些测试证明它工作？
