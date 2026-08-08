# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

CLI 模式下「所有面板功能经 web 完备可用」，认证是最大缺口。16 个连接器中：API key 类与本地文件类 web 已可用；缺口集中在——

1. grok/kimi device-code OAuth：协议本身 web 友好（显示 URL+码，用户去别处授权），但 web bridge 目前是桩；
2. mimo / opencode_go cookie 会话：Electron 靠开窗口自动捕获，web 端两个 API 是桩。

方案已定（用户确认）：cookie 类复用 Electron **可见** BrowserWindow 捕获（B1，WSL 下经 WSLg 弹到宿主机桌面），不引 playwright-core；无 display 环境回退手动粘贴 cookie。已知降级被接受：web/headless 下无静默 cookie 续期，过期需重新登录或重新粘贴。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- local-api 新增认证端点：grok/kimi device-code OAuth（login_start / login_poll / status / logout / refresh 组）、cookie 登录触发与状态查询
- web bridge 实现 grok/kimi OAuth 全组与 cookie 登录方法，替换现有桩
- web 设置页认证交互：device-code 流程在页面内展示授权 URL+码并轮询结果；cookie 登录按钮触发捕获并轮询状态
- cookie 捕获复用既有 session-manager 隔离 partition 机制，CLI/桌面模式下窗口可见（现状桌面版即可见，CLI 模式同一代码路径）；无 display 环境捕获不可发起时给出可读提示
- 手动粘贴回退：web 设置页提供 cookie 字符串粘贴入口（复用既有 secrets 编辑链路，必要时补 UI 引导文案）
- 认证过程中的日志强制脱敏（cookie/token 不落日志）

### 非范围

- playwright-core 或任何新浏览器依赖
- 静默 cookie 续期（Electron partition 持久化复用）在 web/headless 下的移植——已确认为接受降级
- API key 类、本地文件类连接器的改动（web 已可用）
- `trySilentCookieRefresh` 桌面版行为调整
- WSLg 本身的安装配置（文档说明即可）

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：web 面板发起 grok device-code 登录，页面展示完整授权 URL 与码，授权完成后状态转为已连接，采集可用
- [ ] AC2：kimi 同上（device-code 通道；API key 通道保持现状可用）
- [ ] AC3：web 面板点 cookie 类连接器「登录」，弹出可见登录窗，用户完成登录后捕获成功、密钥落 vault、面板状态已连接；[deploy] WSL 下该窗口经 WSLg 弹到宿主机桌面（agent 无法自证 WSL 实机）
- [ ] AC4：无 display 环境发起 cookie 登录，得到可读错误提示且实例状态不损坏；手动粘贴 cookie 后该连接器可正常采集
- [ ] AC5：logout/refresh 组在 web 端行为与桌面版一致
- [ ] AC6：认证全流程日志不出现 cookie/token 明文（含错误分支）
- [ ] AC7：桌面版认证行为与现状一致（回归）

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1/AC2：真实 OAuth 授权需真人操作，自动测试以 mock OAuth 端点（或录制响应）驱动 device-code 全流程；真实厂商授权链路标人工验证（属 live 契约范畴，归 `test:contract:live` 分层）
- AC3：弹窗捕获在 e2e 中可起真实例 + 本地 mock 登录站断言捕获；WSLg 弹窗部分标 `[deploy]`
- 其余全部可自动测试

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 真实厂商登录页的风控/验证码分支：外部不可控，live 契约层已覆盖真实链路健康度

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：端点参数与错误分支、bridge 状态机（pending/success/expired）
- 集成：本地 mock OAuth 设备码端点 + mock 登录站（set-cookie 响应）驱动捕获链路，断言 vault 落密钥且日志无明文
- e2e：web 设置页发起登录的 UI 流程（mock 后端）；桌面版认证回归走既有 electron e2e
- 真实 grok/kimi 授权链路与 mimo/opencode_go 登录由用户人工验证一次（live 层）

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 既有 session-manager 捕获流程在无窗口 CLI 模式下打开可见 BrowserWindow 是否可直接复用（partition、拦截钩子与主面板窗口的耦合度）：`UNVERIFIED-SPIKE`，Step 1 实跑核实
- grok/kimi OAuth manager 对 Electron 窗口/回调的依赖面（能否纯 main 侧驱动）：`UNVERIFIED-SPIKE`，Step 1 读 oauth manager 与 auth-ipc 核实

### 风险与回退

- 风险：cookie/token 泄露（日志、错误消息、端点响应）；捕获窗口在 CLI 模式触发主面板耦合初始化导致窗口体系被意外拉起
- 回退：端点与 bridge 为纯新增；若捕获窗口耦合不可解，回退到仅手动粘贴方案（功能降级但可用），差异向用户说明

### 依赖与约束

- 依赖 t275（CLI 模式进程形态）；与 t277 并行可行（不同端点组）
- 密钥规则：cookie/token 全程落 vault，日志脱敏开发期同样生效
- 不新增浏览器/自动化依赖

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：web 认证链路与 cookie 捕获在 CLI 模式的复用方式、已知降级（无静默续期）
- `docs/guides/`：web 登录操作说明（含无 display 环境手动粘贴指引）
