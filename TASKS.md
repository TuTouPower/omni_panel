# OmniUsage 任务清单

> 全部任务已归档至 `docs/archive/tasks_history.md`。

---

- mimo logo 纯黑色，看不清，改成深色模式下 mimo 的 logo 加个浅灰色背景。

## 待修：多个服务编辑账号缺少密钥/Cookie 设置

### 现象

- 在设置页“已添加”列表里编辑 DeepSeek 账号时，看不到 API Key / 密钥输入框。
- 这个问题不应只按 DeepSeek 处理；同类风险覆盖所有 UI 支持但缺真实 connector manifest 的服务：`deepseek`、`glm`、`gemini`、`tavily`、`minimax`、`mimo`、`kimi`、`codex`、`antigravity` 等。
- 添加账号弹窗里这些服务仍然可见，用户会以为都已经完整支持；但编辑已有连接时，表单字段依赖真实 connector metadata，metadata 缺失就不会渲染密钥/Cookie 设置。

### 根因

- `SettingsForm` 的字段来自 `pluginInfo.metadata?.parameters ?? []`。
- `pluginInfo.metadata` 来自 connector manifest。
- 当前真实内置 `connectors/` 目录只有 `claude` 和 `cpa`。
- 因此缺失 provider 的真实 manifest 时，编辑表单没有参数定义，也就没有 `API_KEY` / `SESSION_COOKIE` / endpoint 等字段。
- 旧配置里可能仍有 `plugins/deepseek.ts`、`deepseek-usage-plugin.ts` 这类路径；自动修正只会把能匹配到真实 manifest 的配置改到 connector 路径，缺 manifest 的 provider 无法补 metadata。

### 为什么测试没发现

- 单测和 smoke 测试大量 mock 了理想状态的 `PluginInfo.metadata`，例如 DeepSeek mock 里直接带了 `API_KEY` secret 参数。
- 这些测试验证的是“如果 metadata 存在，表单能显示”，没有验证“真实打包 connector 是否提供 metadata”。
- E2E 没有覆盖每个 provider 的真实添加 → 编辑 → 保存密钥/Cookie → 重启后仍显示 `***` 的闭环。
- `auto_seed` E2E 偏向数卡片数量，没有逐个验证真实 provider 名称、manifest 参数、密钥字段和设置页编辑表单。

### 影响

- 用户可能添加了账号，但后续无法在编辑页修改或确认密钥/Cookie。
- UI 暗示支持多个 provider，实际只有有真实 connector manifest 的 provider 才有完整设置能力。
- 密钥保存逻辑本身可能没坏；坏的是“真实 provider metadata 缺失导致设置 UI 没字段”。

### 修复方向

- 为 UI 暴露的每个 provider 补真实 connector manifest，至少包含正确的 `provider`、`capabilities`、`parameters`、`endpoints` 和 `script`。
- API Key 类服务至少声明 `API_KEY` secret 参数：`deepseek`、`glm`、`gemini`、`tavily`、`minimax`。
- Session/Cookie 类服务至少声明 `SESSION_COOKIE` secret 参数：`mimo`、`kimi`。
- Local/OAuth 类服务需要明确是否本期支持：`claude`、`codex`、`antigravity`。未实现就不要在添加入口里伪装成完整支持。
- 添加测试必须使用真实 manifest discovery，不要只 mock `PluginInfo.metadata`。

### 验收

- 打包产物启动后，设置页编辑每个已添加 provider 时，都能看到对应密钥/Cookie/endpoint 设置。
- 保存密钥后，配置文件不出现明文 secret；重新打开编辑页显示 `***`。
- 没有真实 connector 的 provider 不应出现在“添加账号”可选列表，或必须明确显示“暂不支持”。
- 新增 E2E 覆盖至少：DeepSeek API Key、Gemini API Key、Tavily API Key、MiMo/Kimi Cookie 中各一条真实 manifest 编辑路径。

## 待修：CPA 添加后只显示 Claude 数据

### 现象

- 添加 CPA 后，主面板/设置页只出现 Claude 相关数据。
- 用户预期 CPA 是“多服务商采集渠道”，应能按配置采集并展示多个 provider 的账号，例如 Gemini、Kimi、Antigravity、DeepSeek 等。

### 根因

- `connectors/cpa/manifest.json` 目前只声明了 `monitor_claude`，没有 `monitor_gemini`、`monitor_kimi`、`monitor_antigravity`、`monitor_deepseek` 等开关。
- `connectors/cpa/connector.ts` 只读取 `monitor_claude`。
- `connectors/cpa/connector.ts` 遍历 CPA auth files 时直接过滤 `auth_file.provider !== "claude"`，所以非 Claude auth file 永远不会采集。
- `src/main/ipc/connector-ipc.ts` 的 `supported_providers()` 对 CPA 写死返回 `["claude"]`，导致 renderer 也只能把 CPA 识别为 Claude provider。
- `CpaConnectorSettings` 的 monitor 项也只跟当前 metadata/硬编码支持的 provider 走；底层 manifest 不声明，多 provider 开关不会成为真实配置。

### 为什么测试没发现

- `tests/integration/connector/cpa-connector.test.ts` 只构造 Claude auth file，只断言 Claude observations。
- provider 聚合测试虽然有多 provider mock，但测的是 renderer 合并逻辑，不测 CPA connector 是否真的产出多 provider observations。
- E2E 里存在 `monitor_deepseek`、`monitor_gemini` 等配置字段，但真实 CPA manifest 不声明这些字段，测试没有断言这些字段生效。
- 当前缺少“CPA manager 返回多个 provider auth files → connector 逐个采集 → IPC activeProviders 多 provider → 主面板按 provider 分发”的端到端测试。

### 影响

- CPA 的 UI 文案和架构文档说它是多服务商渠道，但真实实现只支持 Claude。
- 非 Claude 的 CPA 账号即使存在，也不会展示、不会刷新、不会进入 provider 卡片。
- 设置页 CPA 展开行会让用户误以为只发现了 Claude，而不是说明其它 provider 尚未实现。

### 修复方向

- 扩展 CPA manifest：声明所有本期支持的 `monitor_*` 参数，并给出默认值和中文 label。
- 扩展 `supported_providers()`：CPA 不应写死 `["claude"]`，应从 manifest 的 `monitor_*` 参数或明确 provider 列表推导。
- 扩展 CPA connector：根据 `auth_file.provider` 分派到不同 provider 的采集函数。
- 对尚无采集实现的 provider，要么不声明支持，要么返回明确的 skipped/unsupported 状态，不能静默过滤。
- 补多 provider CPA 测试：至少包含 Claude + 一个非 Claude auth file，断言非 Claude 不会被无声丢弃。

### 验收

- CPA 设置页能看到本期支持的多个 provider 开关。
- CPA manager 返回多个 provider auth files 时，connector 能产出对应 provider observations。
- IPC 返回的 CPA `supportedProviders` / `activeProviders` 与 manifest 和配置一致。
- 主面板仍然没有 CPA provider tab；CPA 数据按真实 provider 并入 Claude / Gemini / Kimi 等卡片。
- 子账号仍然只能隐藏/改名，不能删除。
