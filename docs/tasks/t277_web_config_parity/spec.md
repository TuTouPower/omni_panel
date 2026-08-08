# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

「所有面板功能经 web 完备可用」是 CLI 模式的核心要求。当前 web 端配置面有三块缺口：

1. 配置实例管理 4 个方法（duplicate / createInstance / export / import）在 web bridge 是假实现，local-api 连对应 HTTP 端点都没有；
2. 配置变更/主题变更推送（`onConfigChange` / `onThemeChange`）web 端是 no-op，web 页面改配置后其它面板视图不会实时更新；
3. 导出不含密钥，与 t275 的「配置文件含明文密钥可导入」形不成迁移闭环——桌面 → WSL 搬家要手填密钥。

明文密钥导出已由用户在方案对比中明确确认（自用场景，导出文件由用户自负保管责任）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- local-api 新增配置实例管理端点：duplicate、createInstance、export、import（桥接既有 config IPC handler 能力）
- web bridge（`usageboard-web.ts`）实现上述 4 方法，替换现有假实现
- 导出含明文密钥变体：web 设置页导出时提供「包含明文密钥」勾选（带警示文案），产物格式与 t275 `--config` 导入格式兼容；CLI 侧新增 `export --include-secrets` 子命令（瘦客户端，走同一端点）
- `onConfigChange` / `onThemeChange` 经既有 SSE 通道接通，web 页面配置/主题变更后各视图实时更新
- 导出文件中的明文密钥处理：仅导出产物含明文；服务端不落明文副本，日志强制脱敏

### 非范围

- 登录/OAuth 相关端点与 bridge——属 web 认证对齐 task
- sessionHistory 实时订阅、logs.export 下载——属 web 实时对齐 task
- 配置 schema 变更、多配置并存（用户已明确单用户单配置）
- 桌面版导出对话框行为调整（桌面版保持现状，「含密钥」变体桌面 web 面板同样可用）

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：web 面板可完成账号/实例的 duplicate 与 createInstance，结果与桌面版一致（面板可见新实例、配置持久化）
- [ ] AC2：web 面板导出配置勾选「包含明文密钥」后，产物含密钥字段且带警示提示；不勾选则与现状一致不含密钥
- [ ] AC3：含明文密钥的导出文件可直接作为 t275 `--config` 的输入完成导入，导入后对应密钥可用（采集成功）——导出/导入闭环
- [ ] AC4：`--cli export --include-secrets` 子命令输出与 web 勾选导出等价的产物
- [ ] AC5：web 面板 import 合法配置文件生效；非法文件（坏 JSON、schema 不符）给出可读错误且不破坏现有配置
- [ ] AC6：web 页面 A 修改配置或主题后，同一服务的另一页面/视图经推送实时反映变更，无需手动刷新
- [ ] AC7：明文密钥不出现在服务端日志、规范 config.json 与任何持久化副本中（仅存在于用户持有的导出文件）

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（AC3 闭环用合成密钥走「导出 → 新 user-data-dir `--config` 导入 → mock 采集断言密钥生效」）

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：4 端点的参数校验与错误分支、导出含/不含密钥两形态、导入非法输入拒绝
- web e2e（mock local-api 项目）：实例管理操作与导出勾选的 UI 行为；若 mock 边界不覆盖端点，新增/扩展 mock handler
- 集成/e2e：真实例走 AC3 闭环；SSE 推送用真实例双上下文断言
- 全程合成密钥，禁真密钥；日志脱敏断言复用既有 scrubber 测试模式

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 既有 config IPC 的 export/import 是否已支持密钥字段（还是仅 config.json 本体）：`UNVERIFIED-SPIKE`，Step 1 读 config-ipc handler 核实，决定「含密钥变体」是扩展既有格式还是新增并行格式
- SSE 通道当前事件类型集合与 config/theme 变更事件的接入点：`UNVERIFIED-SPIKE`，Step 1 读 local-api SSE 与 config-store 变更钩子核实

### 风险与回退

- 风险：明文密钥导出是敏感面——误持久化或日志泄露即安全事故；导出格式与 t275 导入格式漂移导致闭环断裂
- 回退：端点与 bridge 为纯新增，可整段回退；导出/导入格式以 t275 落地的格式为准对齐，漂移时在 finalization 同步两侧文档

### 依赖与约束

- 依赖 t275（`--config` 导入格式是本 task 导出格式的对齐目标）与 t276（瘦客户端 scaffold 承载 `export` 子命令）
- 密钥规则豁免边界：明文密钥只允许出现在用户主动导出的文件与用户主动提供的导入文件中；代码内禁默认值/示例密钥

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：local-api 配置端点组与导出/导入格式权威定义
- `docs/blueprint/conventions.md`：如新增 SSE 事件类型命名约定
