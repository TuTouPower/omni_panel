# OmniUsage — 已知限制 / 待办

## 安全：连接器脚本沙箱非真隔离

- 现状：第三方/用户连接器脚本（`connectors/` 下，含 `user_dir`）运行在 Node
  `vm.runInContext` 沙箱中（`src/main/core/connector/runtime.ts`）。
- 限制：Node `vm` 模块**不是真正的隔离环境**（官方文档明确说明），沙箱仅冻结并注入
  `ctx`，无法阻止刻意构造的逃逸（例如通过 `(0, eval)("this")` 触达主进程全局）。
- 影响：用户被诱导安装的恶意连接器脚本可能逃逸到主进程，等于完全沦陷。
- 现有缓解：连接器脚本禁止 `import`/`export`（`compile_script` 正则拦截），运行有
  超时；HTTP/文件能力经 `ConnectorContext` 受控。
- 待办（需评估，非小改）：改用 `isolated-vm`（v8 真隔离）或把连接器放进**子进程**
  运行（进程级隔离 + IPC 能力收窄）。两者都需重构运行时与 `ConnectorContext` 边界。
- 决策点：是否接受额外依赖 / 子进程开销，换取对用户连接器的强隔离。

## 安全：导入配置可重定向连接器端点（公网攻击主机）

- 现状：`endpointOverrides` 可由用户配置/导入。`apply_auth` 会按 manifest 把 secret
  注入到解析后的端点（bearer/header/query）。
- 风险：导入一份恶意配置，把某连接器端点改指到**公网攻击者主机**，用户现存的 vault
  secret 会被发过去。`assert_safe_connector_host` 只拦云元数据主机，**不拦公网主机**
  （无法区分合法外部 API 与攻击者主机）。
- 待办（需评估）：导入配置后，被改动端点的连接器要求**重新录入 secret**，避免导入
  即外泄；或在导入时对端点变更给出显式确认。
