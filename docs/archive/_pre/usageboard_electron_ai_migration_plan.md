# UsageBoard Electron 迁移 AI 执行手册

> 目标：将 `marsmay/UsageBoard` 从 macOS Swift/SwiftUI 菜单栏应用迁移为 Electron + TypeScript 跨平台桌面应用。  
> 方法：不要直接重写完整 App，而是先冻结旧项目行为，再用 spec、schema、fixtures、tests 驱动新项目实现。

---

## 1. 总体判断

你之前的流程是正确的：

```text
旧项目
→ AI 分析旧项目写 spec
→ 新项目根据 spec 写测试
→ 写 plan
→ 一个模块一个模块实现
```

但需要加强为：

```text
旧项目源码取证
→ spec
→ schema
→ fixtures
→ contract tests
→ Electron core
→ IPC/preload
→ UI
→ bundled plugins
→ packaging
```

核心原因：旧项目的价值不主要在 SwiftUI UI，而在以下部分：

- Python 插件协议
- 插件元数据注释块
- 子进程执行机制
- stdout JSON 解析
- 参数传递规则
- 缓存状态
- 刷新调度
- 配置模型
- 多插件实例能力
- 本地文件扫描能力，例如 Claude / Codex JSONL

因此新项目应优先保证旧插件兼容，而不是先做界面。

---

## 2. 总体技术路线

推荐新项目技术栈：

```text
Electron
TypeScript
Vite
React
Vitest
Playwright
Zod 或 Ajv
Electron Builder 或 Electron Forge
```

Electron 进程职责应固定为：

```text
main process
  - 插件扫描
  - Python 子进程执行
  - 配置读写
  - 缓存读写
  - 密钥存储
  - 调度器
  - 托盘
  - 打包路径处理

preload
  - 通过 contextBridge 暴露白名单 API
  - 校验 IPC 输入输出
  - 禁止暴露 ipcRenderer 原始对象

renderer
  - React UI
  - Dashboard
  - Settings
  - 参数表单
  - 错误展示
  - 图表展示
```

必须坚持：

```text
renderer 不允许直接访问 fs / child_process / ipcRenderer
Python 插件只能由 main process 执行
插件协议不能为了新实现随意修改
```

---

## 3. 推荐执行轮次

建议分 12 轮执行：

```text
Round 0   迁移规则
Round 1   旧项目源码取证
Round 2   插件协议 schema + fixtures
Round 3   Electron 项目骨架 + failing tests
Round 4   parser
Round 5   plugin runner
Round 6   config / cache / path / secret
Round 7   scheduler / runtime store
Round 8   IPC / preload
Round 9   minimal UI / tray
Round 10  bundled plugins
Round 11  multi-instance
Round 12  packaging
```

如需压缩，可合并为 6 轮：

```text
Round 1  旧项目取证 + spec
Round 2  schema + fixtures + tests
Round 3  Electron skeleton + parser + runner
Round 4  config + cache + scheduler
Round 5  IPC + UI
Round 6  plugins + packaging
```

但更推荐 12 轮，因为 UsageBoard 的风险主要集中在插件协议、子进程、缓存、路径和跨平台兼容。

---

# Round 0：建立迁移规则

## 目标

让 AI 明确迁移边界，防止一上来创建一个漂亮但不可用的 UI。

## Prompt

```text
你是 UsageBoard Electron 迁移工程 agent。

目标：把 marsmay/UsageBoard 从 macOS Swift/SwiftUI 项目迁移为 Electron + TypeScript 跨平台桌面应用。

本轮只做迁移规则和工作目录规划，不写业务代码。

要求：
1. 阅读旧项目 README、Package.swift、Sources、Resources/BundledPlugins。
2. 输出 docs/migration-principles.md。
3. 输出 docs/ai-working-rules.md。
4. 明确以下规则：
   - 旧插件协议优先兼容；
   - renderer 禁止直接访问 Node API；
   - Python 插件只能由 main process 执行；
   - 所有无法确认的旧行为标记为 UNCONFIRMED；
   - 任何实现前必须先有测试或 fixture；
   - secret 不得写入日志；
   - 不允许先做 UI mock 后补 core。
5. 不创建 Electron app。
6. 不实现任何业务代码。
```

## 检查清单

```text
[ ] 是否明确“兼容旧插件协议”是最高优先级
[ ] 是否禁止 renderer 直接 child_process / fs
[ ] 是否要求 UNCONFIRMED 标记
[ ] 是否要求先测试再实现
[ ] 是否没有开始写业务代码
```

---

# Round 1：旧项目源码取证

## 目标

从旧项目源码中提取精确事实，不依赖笼统分析或 README 推测。

## Prompt

```text
本轮只分析旧项目源码，不创建新项目，不写实现。

请从旧项目中提取精确事实，输出：

1. docs/source-inventory.md
   - 关键源码文件路径
   - 每个文件的职责
   - 哪些属于 Core
   - 哪些属于 App/UI
   - 哪些属于插件

2. docs/old-data-models.md
   - AppConfiguration 的完整字段
   - PluginConfiguration 的完整字段
   - PluginMetadata 的完整字段
   - PluginParameter 的完整字段
   - PluginOutput 的完整字段
   - PluginSnapshot 的完整字段
   - PluginCachedState 的完整字段
   - 每个字段是否 required / optional
   - 默认值
   - 旧代码里的 Codable key / JSON key

3. docs/old-behavior-map.md
   - 插件发现规则
   - 元数据解析规则
   - 参数传递规则
   - stdout/stderr 处理规则
   - error 处理规则
   - timeout 行为
   - cache 读写规则
   - refresh 调度规则
   - config 写入规则

4. docs/unconfirmed.md
   - 所有无法从源码确认的点
   - 不允许猜测

要求：
- 每条结论必须标明来自哪个源码文件。
- 不允许根据 README 或之前的分析报告自行脑补。
- 不写 Electron 代码。
```

## 检查清单

```text
[ ] 是否列出了真实源码文件名
[ ] 是否有字段级别的数据模型，而不是只写概念
[ ] 是否列出 required / optional / default
[ ] 是否有 UNCONFIRMED 列表
[ ] 是否没有把 README 推测当事实
```

---

# Round 2：冻结插件协议，生成 schema 和 fixtures

## 目标

把旧插件协议变成可测试契约。

UsageBoard 的核心协议包括：

```text
Swift/Electron 宿主
→ 执行 Python 插件
→ 通过 --usageboard-param KEY=value 传参
→ 插件 stdout 输出 JSON
→ 宿主解析 JSON
→ 转成 PluginSnapshot
```

## Prompt

```text
基于 docs/old-data-models.md 和 docs/old-behavior-map.md，本轮只冻结插件协议。

请输出：

1. docs/plugin-contract.md
   必须精确说明：
   - 插件文件格式
   - 插件元数据注释块格式
   - 元数据解析范围，例如是否只读前 N 行
   - 参数类型
   - 参数传递方式
   - stdout JSON 格式
   - stderr 处理规则
   - exit code 处理规则
   - timeout 处理规则
   - error 字段处理规则
   - chart / badge / items 的兼容规则

2. schemas/plugin-output.schema.json

3. schemas/plugin-metadata.schema.json

4. fixtures/plugin-output/
   至少包含：
   - success-basic.json
   - success-with-badge.json
   - success-with-chart.json
   - success-empty-items.json，如果旧项目允许
   - error-json-field.json
   - invalid-json.txt
   - invalid-missing-required-field.json
   - invalid-wrong-type.json

5. fixtures/plugin-metadata/
   至少包含：
   - metadata-basic.py
   - metadata-with-secret.py
   - metadata-with-choice.py
   - metadata-missing-end-marker.py
   - metadata-invalid-json.py
   - metadata-after-line-80.py，如果旧项目有 80 行限制

要求：
- fixture 必须覆盖旧项目实际支持的情况。
- 不确定的情况写入 docs/unconfirmed.md。
- 不实现 parser。
```

## 检查清单

```text
[ ] 是否生成 plugin-output.schema.json
[ ] 是否生成 plugin-metadata.schema.json
[ ] 是否有成功、错误、非法输入 fixture
[ ] 是否覆盖 secret / choice / boolean / directory 等参数类型
[ ] 是否明确元数据注释块开始和结束 marker
[ ] 是否明确旧项目是否只读前 80 行
```

---

# Round 3：创建 Electron 项目骨架和测试框架

## 目标

创建新项目结构和测试框架，但不实现业务逻辑。

## Prompt

```text
现在创建 Electron + TypeScript 新项目骨架。

技术栈：
- Electron
- TypeScript
- Vite
- React
- Vitest
- Playwright
- Zod 或 Ajv，用于 schema 校验
- ESLint
- Prettier

要求：
1. 建立目录结构：
   src/main/
   src/preload/
   src/renderer/
   src/shared/
   tests/unit/
   tests/integration/
   tests/e2e/
   docs/
   schemas/
   fixtures/

2. 配置 Electron 安全默认值：
   - contextIsolation: true
   - nodeIntegration: false
   - sandbox: true，如可行
   - renderer 不允许 import node:fs / node:child_process

3. 复制上一轮生成的 docs、schemas、fixtures。

4. 只创建空模块和 failing tests，不实现业务逻辑。

5. 输出 docs/implementation-plan.md，按模块拆任务。

不要实现插件执行、配置读写、UI 页面。
```

## 检查清单

```text
[ ] 是否 main / preload / renderer 分离
[ ] renderer 是否没有 Node 权限
[ ] 是否有 Vitest
[ ] 是否有 Playwright
[ ] 是否有 failing tests
[ ] 是否没有提前实现业务逻辑
```

---

# Round 4：实现 parser

## 目标

只实现纯函数模块：plugin output parser 和 plugin metadata parser。

## Prompt

```text
本轮只实现 parser，不实现 child_process，不实现 UI。

实现：
1. src/main/core/plugin-output-parser.ts
2. src/main/core/plugin-metadata-parser.ts
3. src/shared/types/plugin.ts
4. src/shared/errors/plugin-errors.ts

要求：
- 使用 schemas/plugin-output.schema.json 校验插件 stdout。
- 使用 schemas/plugin-metadata.schema.json 校验插件注释块。
- 通过 fixtures/plugin-output/* 的所有测试。
- 通过 fixtures/plugin-metadata/* 的所有测试。
- invalid JSON 返回 PluginParseError。
- schema 校验失败返回 PluginSchemaError。
- metadata 缺少开始或结束 marker 时行为必须符合旧项目；无法确认则测试标记 pending。
- 不修改 renderer。
- 不实现 plugin runner。
```

## 检查清单

```text
[ ] parser 是否是纯函数
[ ] invalid JSON 是否不会崩溃
[ ] schema error 是否有明确错误类型
[ ] fixtures 是否全部被测试读取
[ ] metadata 80 行限制是否有测试
[ ] 是否没有 child_process 代码
```

---

# Round 5：实现 plugin runner

## 目标

实现 Python 子进程执行，但仍不做 UI。

## Prompt

```text
本轮只实现 plugin runner。

实现：
1. src/main/core/plugin-runner.ts
2. src/main/core/plugin-command-builder.ts
3. tests/integration/plugin-runner.test.ts
4. fixtures/fake-plugins/

fake plugins 至少包含：
- prints-valid-json.py
- prints-invalid-json.py
- exits-nonzero.py
- sleeps-timeout.py
- prints-to-stderr.py
- echoes-params.py

要求：
- 使用 child_process.spawn，不使用 exec。
- 参数格式必须兼容旧项目：--usageboard-param KEY=value。
- 捕获 stdout、stderr、exitCode、durationMs。
- 支持 timeout，默认值按旧项目设置；如果旧项目是 15 秒，测试要覆盖。
- timeout 后必须 kill 子进程。
- stderr 不等于失败，除非旧项目这样处理。
- 非零 exit code 行为必须符合旧项目。
- 不得把 secret 参数写入日志。
- 不实现 UI。
```

## 检查清单

```text
[ ] 是否使用 spawn 而不是 exec
[ ] 是否正确传 --usageboard-param KEY=value
[ ] stdout / stderr 是否分开
[ ] stderr 是否不会自动导致失败，除非旧项目如此
[ ] timeout 是否 kill 进程
[ ] secret 是否被脱敏
[ ] Windows 路径是否有测试
```

---

# Round 6：实现 config / cache / path / secret

## 目标

建立本地状态层。

## Prompt

```text
本轮实现本地状态层，不实现 UI。

实现：
1. src/main/core/paths.ts
2. src/main/core/config-store.ts
3. src/main/core/cache-store.ts
4. src/main/core/secrets-store.ts
5. src/main/core/plugin-instance.ts

要求：
- 使用 Electron app.getPath('userData') 作为应用数据根目录。
- 定义 config.json 路径。
- 定义 states/ 目录路径。
- 定义 bundled plugins 路径。
- 定义 user plugins 路径。
- 支持读取旧版 config，如果旧版结构已确认。
- config 写入必须 atomic write。
- cache 读写必须有测试。
- secret 类型参数不得明文写入普通日志。
- API key 的存储策略必须文档化：先兼容明文迁移，后续写入安全存储。
- 不实现 renderer UI。
```

## 检查清单

```text
[ ] 是否集中管理路径，没有到处硬编码
[ ] 是否使用 userData / appData 等跨平台路径
[ ] config 写入是否 atomic
[ ] states/ 是否单独目录
[ ] secret 是否不会进入日志
[ ] 旧配置迁移是否有测试
```

---

# Round 7：实现 scheduler / runtime store

## 目标

实现刷新调度、状态机和缓存命中逻辑。

## Prompt

```text
本轮实现 scheduler 和 runtime store，不做 UI。

实现：
1. src/main/core/runtime-store.ts
2. src/main/core/plugin-scheduler.ts
3. src/main/core/plugin-refresh-service.ts

要求：
- 每个插件实例有独立状态：
  idle / loading / ready / failed
- 支持手动 refreshPlugin(instanceId)。
- 支持 refreshAll()。
- 支持每个插件独立 refresh interval。
- cache 未过期时不重复执行插件。
- 同一个插件实例并发刷新时必须合并或拒绝重复执行。
- 插件失败时保留上次成功 cache，如果旧项目这么做。
- 测试覆盖：
  - refresh success
  - refresh failure
  - timeout
  - cache hit
  - concurrent refresh
  - disabled plugin 不刷新
- sleep/wake 可以先写接口和 TODO，不在本轮实现。
```

## 检查清单

```text
[ ] 是否有明确状态机
[ ] 是否防止同一插件并发执行
[ ] 是否支持 cache hit
[ ] 插件失败是否不会清空已有成功数据，除非旧项目如此
[ ] 是否区分手动刷新和自动刷新
[ ] 是否有假时钟测试，不要靠真实 sleep
```

---

# Round 8：实现 IPC / preload

## 目标

将 main process 的能力安全暴露给 renderer。

## Prompt

```text
本轮实现 IPC 边界，不做完整 UI。

实现：
1. src/preload/usageboard-api.ts
2. src/preload/index.ts
3. src/main/ipc/plugin-ipc.ts
4. src/main/ipc/config-ipc.ts
5. src/shared/ipc-contract.ts

暴露给 renderer 的 API 只能包括：
- listPlugins()
- listPluginInstances()
- getSnapshots()
- refreshPlugin(instanceId)
- refreshAll()
- getConfig()
- updatePluginConfig(instanceId, patch)
- openSettingsWindow()
- revealLogs()

要求：
- 使用 contextBridge。
- renderer 不得获得 ipcRenderer 原始对象。
- 所有 IPC 输入必须校验。
- 所有错误必须序列化为安全错误对象。
- secret 字段返回 renderer 时必须按 UI 需要脱敏。
- 添加 IPC 单元测试或集成测试。
```

## 检查清单

```text
[ ] 是否没有暴露 ipcRenderer
[ ] 是否没有暴露 fs / child_process
[ ] 所有 IPC 入参是否校验
[ ] secret 是否脱敏
[ ] 是否有类型共享
[ ] renderer 是否只能调用 window.usageboard.*
```

---

# Round 9：实现最小 UI 和托盘

## 目标

开始做 UI，但只做最小可用版本。

## Prompt

```text
本轮实现最小 UI，不新增 core 行为。

实现：
1. Electron tray
2. Dashboard window
3. Settings window
4. 插件卡片列表
5. 插件状态展示
6. 手动刷新按钮
7. 参数配置表单
8. 错误展示
9. 上次更新时间展示

要求：
- UI 只调用 preload 暴露的 window.usageboard API。
- 不允许 renderer import Node 模块。
- 不允许在 UI 中直接解析插件脚本。
- 参数表单必须由 PluginMetadata 自动生成。
- secret 参数显示为 password input。
- choice 参数显示为 select。
- boolean 参数显示为 checkbox。
- directory / file 参数先用文本输入，后续再加系统 picker。
- 添加 Playwright smoke test。
```

## 检查清单

```text
[ ] renderer 是否完全不接触 Node API
[ ] 参数表单是否来自 metadata
[ ] secret input 是否不会明文回显
[ ] refresh 按钮是否走 IPC
[ ] 错误态是否能显示
[ ] 无插件时是否有 empty state
[ ] Playwright 能启动应用并看到 dashboard
```

---

# Round 10：集成真实 bundled plugins

## 目标

复制旧项目内置插件并逐个跑通。

## Prompt

```text
本轮集成真实 bundled plugins。

要求：
1. 复制旧项目 Resources/BundledPlugins 到 resources/plugins。
2. 确保 _common.py 可被插件 import。
3. 实现 bundled plugin discovery。
4. 实现 user plugin discovery。
5. 按顺序集成：
   - DeepSeek
   - Tavily
   - GLM
   - MiniMax
   - Codex
   - Claude

每集成一个插件都要输出：
- 插件是否能解析 metadata
- 必需参数有哪些
- 是否能执行 fake/dry run
- 是否依赖本地文件
- 是否依赖系统 keychain
- Windows/Linux 风险

不允许为了跑通而修改插件协议。
如果必须修改插件脚本，先写 migration note。
```

## 检查清单

```text
[ ] _common.py 是否能被找到
[ ] 每个插件 metadata 是否解析成功
[ ] API key 插件是否能配置
[ ] Claude/Codex 是否没有硬编码 macOS-only 假设
[ ] 插件脚本修改是否有记录
[ ] 是否没有破坏旧插件协议
```

---

# Round 11：实现多实例 / 多账号能力

## 目标

将“同一个插件脚本多个配置实例”做成正式能力。

## Prompt

```text
本轮实现同一插件多实例支持。

要求：
1. 一个 PluginDefinition 可以创建多个 PluginInstance。
2. 每个 instance 有独立：
   - instanceId
   - displayName
   - enabled
   - parameterValues
   - refreshInterval
   - cache state
3. 同一个插件脚本可以被多个实例引用。
4. Claude/Codex 可以通过不同 DATA_DIR / AUTH_FILE 区分账号。
5. Settings UI 支持 Duplicate Plugin。
6. Dashboard 按实例显示，而不是按脚本显示。
7. cache key 必须基于 instanceId，不得只用 pluginId。
8. 添加测试：
   - same plugin, two instances, different params
   - same plugin, two caches
   - delete instance removes or archives cache
```

## 检查清单

```text
[ ] 是否区分 PluginDefinition 和 PluginInstance
[ ] cache 是否按 instanceId 保存
[ ] 同一脚本是否能创建多个配置
[ ] Duplicate Plugin 是否不会复制 secret 明文到日志
[ ] 删除实例是否处理状态文件
```

---

# Round 12：打包和平台兼容

## 目标

完成 Windows / macOS / Linux 打包和运行路径验证。

## Prompt

```text
本轮处理打包和平台兼容。

要求：
1. 配置 electron-builder 或 Electron Forge。
2. 输出：
   - macOS dmg/zip
   - Windows nsis
   - Linux AppImage 或 deb
3. 确保 resources/plugins 被打进安装包。
4. 确保生产环境下能定位：
   - bundled plugins
   - _common.py
   - userData
   - config.json
   - states/
   - logs/
5. 检查 Python 可用性：
   - python3
   - python
   - py launcher on Windows
6. 如果找不到 Python，UI 给出明确错误。
7. 添加 docs/platform-notes.md。
```

## 检查清单

```text
[ ] 打包后是否能找到插件目录
[ ] asar 环境下是否能执行 Python 文件
[ ] Windows 是否能找到 Python
[ ] Linux AppImage 是否能访问用户目录
[ ] macOS 是否有权限访问 ~/.claude / ~/.codex
[ ] 找不到 Python 时是否有可理解错误
```

---

# 4. 每轮都要追加的通用约束

建议在每一轮 prompt 末尾都追加：

```text
通用约束：
1. 不要实现本轮范围之外的功能。
2. 不要重构无关文件。
3. 不要修改插件协议来适配你的实现。
4. 任何无法确认的旧行为写入 docs/unconfirmed.md。
5. 每个新模块必须有测试。
6. 运行测试并报告结果。
7. secret 不得进入日志、错误消息、测试快照。
8. renderer 不得直接访问 Node API。
9. 输出本轮修改文件列表。
10. 输出下一轮建议，但不要提前实现。
```

---

# 5. 每轮完成后必须问 AI 的三个问题

每轮完成后，你都应该让 AI 回答：

```text
1. 本轮改了哪些文件？
2. 哪些测试证明它工作？
3. 哪些行为还是 UNCONFIRMED？
```

如果 AI 回答不出第 2 点，就说明它只是写了代码，没有建立迁移保障。

---

# 6. 当前旧分析还缺的关键信息

旧项目分析适合作为方向参考，但不够作为实现 spec。还需要补齐：

```text
1. PluginOutput 的完整 JSON 字段定义
2. PluginMetadata 的完整字段定义
3. chart 的精确结构
4. badge 的精确结构
5. UsageItem 的精确结构
6. config.json 的真实格式
7. states/{stateID}.json 的真实格式
8. stateID 如何生成
9. 插件发现目录
10. bundled plugin 和 user plugin 冲突规则
11. 参数默认值处理
12. required 参数为空时怎么处理
13. stderr 是否显示给用户
14. stdout 有多余文本时怎么处理
15. 插件 timeout 后是否保留旧 cache
16. 缓存过期策略
17. 刷新间隔默认值
18. 配置写入 debounce 时间
19. sleep/wake 在 Electron 里的替代方案
20. macOS Keychain 逻辑在 Windows/Linux 的降级方案
```

这些必须在 Round 1 和 Round 2 补齐。

---

# 7. 关键风险

## 7.1 AI 写出的 spec 可能太笼统

坏例子：

```text
应用支持插件系统。
```

好例子：

```text
插件执行规则：
- 使用 Python 子进程执行插件脚本；
- 参数通过 --usageboard-param KEY=value 传递；
- stdout 必须是合法 JSON；
- stderr 仅作为调试信息保存；
- 默认 timeout 为旧项目确认的值；
- 非零 exit code 转换为 PluginExecutionError；
- timeout 转换为 PluginTimeoutError。
```

## 7.2 AI 可能先做 UI

不要允许。正确顺序是：

```text
parser
→ runner
→ config/cache
→ scheduler
→ IPC
→ UI
```

## 7.3 Electron 权限边界容易失控

禁止：

```text
nodeIntegration: true
contextIsolation: false
renderer 直接 import child_process
renderer 直接读写 config.json
renderer 直接执行 Python
```

允许：

```text
renderer
→ window.usageboard.refreshPlugin(instanceId)
→ preload
→ ipcMain
→ main process plugin runner
```

## 7.4 Python 插件打包路径容易失败

必须在打包阶段确认：

```text
resources/plugins 是否存在
_common.py 是否可 import
asar 中的插件是否可执行
Windows 是否能找到 python / py
Linux AppImage 是否能访问用户目录
macOS 是否能访问 ~/.claude / ~/.codex
```

---

# 8. MVP 范围

第一版 Electron MVP 只做：

```text
1. App 能启动
2. 托盘存在
3. 能发现 bundled plugins
4. 能解析插件 metadata
5. 能创建插件实例
6. 能配置参数
7. 能执行 Python 插件
8. 能解析 stdout JSON
9. 能显示用量卡片
10. 能显示错误
11. 能缓存上次成功结果
12. 能手动刷新
13. 能打包 Windows / macOS / Linux
```

暂缓：

```text
自动更新
插件市场
复杂图表
云同步
完整主题系统
开机启动
高级通知
完整多语言
```

---

# 9. 最终建议

最稳的迁移方式不是“让 AI 一次性重写 UsageBoard”，而是：

```text
让 AI 先把旧项目行为冻结成可测试契约，
再让 AI 在 Electron 项目里按模块实现，
每轮都有明确测试、明确检查项、明确 UNCONFIRMED 列表。
```

对 UsageBoard 这个项目来说，优先级应该是：

```text
插件协议兼容 > 子进程执行稳定 > 配置和缓存正确 > IPC 安全 > UI 好看 > 打包发布
```

只要插件协议、parser、runner、cache、scheduler 这几层稳住，Electron UI 后面可以持续迭代。
