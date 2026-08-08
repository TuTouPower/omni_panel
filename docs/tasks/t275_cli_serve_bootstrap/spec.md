# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

OmniPanel 目前是纯桌面托盘应用。用户需要在 WSL 内以无界面方式运行：命令行指定配置文件启动，进程不创建任何窗口/托盘，仅起 local-api 服务并打印 web 面板地址，用户用浏览器访问。这是「CLI 模式」的地基 task，后续控制命令、web 功能补齐、e2e 门控都建立在它能以无窗口形态启动之上。

进程模型已定：仍是同一 Electron 进程，新增 CLI 启动分支跳过窗口/托盘创建，不做纯 Node 剥离。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 主进程 CLI argv 解析：`--cli serve --config <path> [--port <n>]`（`--cli` 为 CLI 模式总开关，本 task 只实现 `serve` 子命令）
- CLI 模式启动分支：跳过全部窗口创建（主面板/代理面板/会话面板/设置预热/托盘及托盘菜单窗），其余服务（configStore、vault、observationStore、scheduler、refreshService、local-api server）与桌面版一致启动
- `--config <path>` 导入语义：启动时把指定文件内容**覆盖写入**规范 config.json（走现有 `.bak` 原子写与 zod 校验）；文件中明文 secret 字段抽出转存 vault，落盘的规范配置只保留 `hasSecret` 标志；dataRoot 保持 userData 不动
- 启动成功后在 stdout 打印 web 面板 URL；同时把实例发现信息（端口等）写入 `<dataRoot>/cli.json` 供后续瘦客户端读取
- WSL 运行所需的依赖与启动方式写入面向人的指南文档（含无 WSLg 时 `xvfb-run` 包一层）

### 非范围

- `serve` 以外的 CLI 子命令（refresh-all/pause/quit 等）及其控制端点——属后续 task
- web 面板功能缺口补齐（实例管理、登录/OAuth、SSE 推送等）——属后续 task
- e2e 门控与 CLI e2e 项目——属后续 task
- 桌面版（不带 `--cli`）行为的任何改变
- 单实例锁策略调整、systemd/自启动集成

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：`--cli serve` 启动后不创建任何窗口与托盘（进程存活、无 BrowserWindow 实例），local-api 正常响应 web 面板与 dashboard 端点
- [ ] AC2：启动后 stdout 输出可访问的面板 URL，浏览器打开能看到用量面板；`<dataRoot>/cli.json` 含与实际监听一致的端口
- [ ] AC3：`--config <path>` 指定的配置在启动后生效（面板可见对应连接器实例）；规范 config.json 被覆盖为导入内容，且其中不出现明文 secret，对应 `hasSecret` 为 true 的密钥可用（采集能凭该密钥成功请求）
- [ ] AC4：不带 `--config` 的 `--cli serve` 沿用现有规范 config.json，行为与桌面版配置加载一致
- [ ] AC5：桌面版启动（无 `--cli`）行为与现状完全一致（窗口/托盘正常创建）
- [ ] AC6：`--port` 可覆盖监听端口；与 `OMNI_PANEL_PORT` 并存时优先级明确且不冲突
- [ ] AC7：[deploy] 在用户 WSL 环境按指南文档操作可成功启动并通过浏览器访问面板（agent 无法自证 WSL 实机）
- [ ] AC8：非法用法（缺子命令、`--config` 指向不存在或非法 JSON 文件）给出非零退出码与可读错误信息，不留半初始化状态

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1：可自动测试——e2e 以 `--cli serve` 起进程，断言窗口枚举为空 + HTTP 端点 200
- AC7：需用户 WSL 实机验证，标 `[deploy]`；agent 侧以 Linux CI 或本地 Windows + xvfb 不可行时以 e2e（Windows 无窗口分支）+ 用户验证兜底
- AC8 中「不留半初始化状态」：自动断言进程退出且规范 config.json 未被破坏（与启动前一致）
- 其余全部可自动测试

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 托盘菜单窗定位/尺寸钳制等桌面专属逻辑：CLI 模式不触达，桌面版行为已由既有 e2e 覆盖

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：argv 解析（合法/非法组合）、`--config` 导入（含明文 secret 转存 vault 后规范配置只留 `hasSecret`、`.bak` 原子写、非法 JSON/非法 schema 拒绝）
- e2e：`--cli serve` 起真进程（`--user-data-dir` 隔离），断言无窗口、URL 输出、端点可用、导入配置生效；桌面版回归走既有 electron e2e
- secret 导入断言使用合成密钥值，禁真密钥

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- Electron 在无窗口分支下是否有隐式窗口依赖（如 settings 预热、OAuth manager 初始化触达 BrowserWindow）：`UNVERIFIED-SPIKE`，Step 1 以 `--cli serve` 实跑并枚举窗口核实
- 明文 secret 在导入文件中的字段形态与现有 `config:saveSecrets` 入参的映射关系：`UNVERIFIED-SPIKE`，Step 1 读 config IPC 与 vault 接口核实后定导入格式

### 风险与回退

- 风险：index.ts 单一大引导函数中窗口/托盘段与其他服务耦合，裁剪分支可能误伤共享初始化；`--config` 覆盖写若中断可能损坏现有配置
- 回退：CLI 分支独立代码路径，桌面版路径不改可整体回退；导入失败时 `.bak` 可恢复，启动中止

### 依赖与约束

- 无前置 task 依赖；后续 CLI 控制命令、web 补齐、e2e 门控均依赖本 task
- WSL 内需 Electron GUI 依赖（libgtk 等），无 WSLg 时 `xvfb-run`；文档需写明
- 密钥规则：明文 secret 只存在于用户自己提供的导入文件，日志与规范配置强制脱敏/不落明文

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：CLI 模式启动分支与实例发现（cli.json）
- `docs/blueprint/testing.md`：CLI 模式验证方式
- `docs/guides/`：WSL 运行指南（新增或既有指南补充）
