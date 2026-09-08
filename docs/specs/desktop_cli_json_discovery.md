# 桌面启动写入 cli.json 实例发现

需求：桌面 GUI（非 CLI）启动在 LocalAPI 成功监听后，向 dataRoot 写入与 serve 同路径、同字段集的 `cli.json`（t459），外部 skill / 瘦客户端即可发现运行中桌面实例。此前只有 `--cli serve` 写该文件（t275），GUI 换端口后外部无法发现。

## 契约

- 写入时机：LocalAPI `start()` 成功后（GUI 与 serve 同一代码路径，无条件执行）。
- 文件：`<dataRoot>/cli.json`，字段 `port`、`url`、`userData`、`pid`、`startedAt`（`write_cli_json` 统一产出；`pid`/`startedAt` 由其注入）。
- `port`/`url` 使用实际监听端口（含 `--port` 覆盖、`OMNI_PANEL_PORT`、占用回退端口）。
- 写入失败只 warn（`Failed to write cli.json (instance discovery disabled)`），不阻断已启动的 LocalAPI。
- 启动时重写；退出后文件保留（端口即失效），调用方以连接失败判断实例未运行。
- 单实例锁保证同时只有一个实例；GUI 与 serve 后写覆盖先写。

## 验收标准

- AC-001：非 CLI 桌面启动后 dataRoot 下 `cli.json` 存在，字段完整且 port/url 反映实际监听。
- AC-002：serve 仍写同一路径同一字段集（既有 cli_serve e2e 保持通过）。
- AC-003：cli.json 写失败（如 EISDIR）进程不退出，health 仍可达。
- AC-004：非默认端口时 port/url 仍反映实际端口。

## 测试

- `tests/e2e/electron/desktop_cli_json.spec.ts`：GUI 启动读 cli.json 全字段 + 文件端口健康检查（AC-001/004）；cli.json 预置为目录 + `OMNI_PANEL_PORT` 固定端口验证写失败不阻断（AC-003）。
- serve 回归：`tests/e2e/electron/cli_serve.spec.ts`（AC1/AC2 端口一致）。

## 非范围

- 字段集、路径、退出删除、绑定地址、鉴权、端口算法（均不动）。

## 相关发现

- d055：playwright `electron.launch` 注入 Chromium 开关使 `extract_user_argv` 主脚本剥离失效（GUI 型 electron e2e 基线修复，`extract_user_argv` 改为剥离任意位置的 `.js` 主脚本条目）。
- d056：cli_flow「干净退出」用例 main 基线即红（与 quit 控制路径相关，独立排查）。
