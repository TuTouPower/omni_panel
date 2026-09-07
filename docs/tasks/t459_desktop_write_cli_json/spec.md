# Task spec

## 背景

`cli.json` 目前只在 `serve`（CLI 模式）启动成功后写入。桌面同样起 LocalAPI，默认端口被占会换端口，外部 skill 无法发现实例。本 task 让 GUI 启动也写同一份发现文件。

## 契约区

### 范围

- 非 CLI 的桌面启动在 LocalAPI 成功监听后，向 dataRoot 写入与 serve 同路径、同字段的 `cli.json`：`port`、`url`、`userData`、`pid`、`startedAt`。
- `port` / `url` 使用实际监听端口（含非默认端口）。
- 写入失败只 warn，不阻断已成功启动的 LocalAPI（与 serve 一致）。
- serve 现有写入保持；启动时重写，退出后文件可残留。
- 同步指南中「仅 CLI 写入」的表述。

### 非范围

- 改 `cli.json` 字段集或路径。
- 退出时删除该文件。
- 改 LocalAPI 绑定地址、鉴权、端口选择算法。
- skill 正文（t460）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：非 CLI 桌面启动在 LocalAPI 成功监听后，dataRoot 下 `cli.json` 存在，且 `port` 等于实际监听端口，`url` 含该端口，`pid` 为当前进程，并含 `userData` 与 `startedAt`。
- [ ] AC-002：`serve` 启动仍写入同一路径同一字段集，不丢失现有发现行为。
- [ ] AC-003：`cli.json` 写入失败时进程不因此退出，LocalAPI 健康检查仍可访问。
- [ ] AC-004：实际监听端口不是默认 18263 时，`cli.json` 的 `port` 与 `url` 仍反映实际端口。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：无（产品需求：coding agent 经 LocalAPI 发现运行中桌面实例）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 进程退出后文件残留：现 serve 契约即残留，不新增删除行为。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 临时 dataRoot：启动路径在 LocalAPI listen 成功后调用写入；断言文件 JSON 字段与传入 port/pid。
- 非默认 port 与写入失败（mock 写盘抛错）分别覆盖 AC-004 / AC-003。
- serve 路径回归：CLI 模式仍写同一文件。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：桌面与 serve 共用 dataRoot 时后写覆盖先写；本应用已有单实例锁，双开不是新场景。
- 回退：恢复仅 CLI 模式写入。

### 依赖与约束

- 无前置 task。t460 依赖本 task。
- 不把 LocalAPI 暴露到新地址；发现文件只含端口与路径，不含 secret。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：实例发现改为 GUI 与 serve 均写 `cli.json`。
