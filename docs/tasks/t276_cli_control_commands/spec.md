# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

CLI 模式（t275）起了常驻无窗服务后，tray 上的纯 main 动作（刷新、暂停、退出等）需要有等价 CLI 入口，否则 WSL 场景只能开 web 或 kill 进程。本 task 提供「常驻服务 + 瘦客户端」结构：子命令经 local-api 控制端点作用于运行中实例，执行完即退出。

安全模型已定（用户确认自用场景）：控制端点与现有读端点一致免认证，监听地址不变。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- local-api 新增控制端点组：refresh-all、pause、resume、restart、quit（复用 main 侧 refreshService/orchestrator/app 既有能力）
- CLI 瘦客户端子命令（同一二进制，`--cli` 前缀）：`open`、`refresh-all`、`pause`、`resume`、`restart`、`quit`、`autostart`
- 瘦客户端实例发现：默认读 `<dataRoot>/cli.json` 取得端口；`--port` / 环境变量可覆盖
- `open`：打印面板 URL，WSL 下尝试经 `wslview`/`explorer.exe` 打开宿主机浏览器（失败仅提示，不算错误）
- `autostart`：Linux 下返回明确的 unsupported 信息；Windows 桌面行为沿用 `setLoginItemSettings`
- 控制端点免认证（与现有读端点一致），监听地址不变

### 非范围

- `serve` 启动分支、`--config` 导入——t275 已覆盖
- 导出相关子命令（`export --include-secrets`）——属 web 配置补齐 task
- check-update / survey / sponsor（桌面版本身为未实现桩）
- 控制端点的认证/权限加固（用户已确认自用场景免认证）
- systemd unit、Windows 计划任务等自启动集成（文档引导即可，不做实现）

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：`refresh-all` 子命令触发运行中实例的全部连接器刷新（实例侧可见刷新发生），命令执行完退出
- [ ] AC2：`pause` 后自动刷新停止、`resume` 后恢复，二者幂等（重复执行不报错且状态正确）；实例状态变化经既有推送通道可见
- [ ] AC3：`quit` 使运行中实例干净退出（进程结束、退出码正常）；`restart` 后实例重新可访问且 cli.json 信息刷新
- [ ] AC4：`open` 输出正确的面板 URL；WSL 下尝试调起宿主机浏览器，调起失败时仍输出 URL 且退出码正常
- [ ] AC5：`autostart` 在 Linux 返回 unsupported 提示且不产生副作用；Windows 下行为与 tray 开机自启一致
- [ ] AC6：实例未运行时执行控制子命令，给出「实例未运行」类可读错误与非零退出码
- [ ] AC7：桌面版（带窗口托盘运行）同样可被这些子命令控制——tray 动作与 CLI 子命令走同一份 main 侧能力，行为一致

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC4 中「调起宿主机浏览器」：自动测试只断言 URL 输出与退出码；实际弹浏览器效果标人工确认（不另设 AC 编号，属 AC4 的一部分，agent 以 mock/探测 wslview 存在性兜底）
- 其余全部可自动测试

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- `wslview`/`explorer.exe` 真实弹窗效果：依赖 WSL 实机，自动测试断言探测与降级逻辑即可

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：子命令参数解析、实例发现（cli.json 缺失/过期/端口被占）、unsupported 分支
- e2e：`--cli serve` 起真实例后跑各子命令，断言实例侧可观察效果（refresh 发生、pause 状态、进程退出/重启）；桌面模式实例同样跑一轮控制命令

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- `restart` 在无窗口 CLI 模式下 `app.relaunch()` 的行为（是否保持原 argv、是否丢失 `--user-data-dir`/`--cli` 上下文）：`UNVERIFIED-SPIKE`，Step 1 实跑核实
- 同一二进制如何区分「serve 常驻」与「瘦客户端调用」（argv 形态与 Electron 打包后入口表现）：`UNVERIFIED-SPIKE`，Step 1 核实 packaged/dev 两种形态

### 风险与回退

- 风险：控制端点误触发 quit/restart 导致实例意外退出；restart 丢 argv 上下文导致实例以错误模式重启
- 回退：端点与客户端为纯新增，出现问题可整段回退不影响桌面版；restart 失败用户手动重启即可

### 依赖与约束

- 依赖 t275（CLI 模式引导：serve 分支、cli.json 实例发现文件）
- 控制端点免认证为 grilling 中用户明确确认的自用场景决策
- pause/resume 须对接既有 orchestrator suspend/resume（`"user"` 来源语义），保持与 tray toggle 同一状态面

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：local-api 控制端点组与 CLI 瘦客户端结构
- `docs/guides/`：CLI 子命令使用说明（并入 WSL/CLI 指南）
