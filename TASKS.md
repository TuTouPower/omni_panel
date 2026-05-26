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
