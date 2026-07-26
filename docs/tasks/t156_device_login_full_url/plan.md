# Task plan

## 步骤与验证

1. 确认事实：抓 Grok 设备码接口真实响应，确认是否返回 `verification_uri_complete` 及参数名；不返回则确定拼接形式 → 验证：debug 日志或 curl 记录写进 task.md。
2. 红：组件测试——`OAuthDeviceForm`/`GrokLoginSection` 在 `verification_uri_complete` 存在时链接文本=完整地址、无「输入代码」行；缺失时走拼接兜底 → 验证：`pnpm vitest run` 相关文件红。
3. 绿：改两处组件（或抽共用片段）+ 主进程 `window-manager.ts` 加 `setWindowOpenHandler`（http(s)→`shell.openExternal`，其余 deny）→ 验证：单测转绿；主进程 handler 有单测（mock shell）。
4. 黑盒：`pnpm test`，并手动或 e2e 验证点击链接走默认浏览器 → 验证：通过。

## 风险与回退

- 风险：拼接参数名猜错导致完整地址打不开授权页 → 缓解：优先用服务端返回值；拼接仅在确认参数名后启用，确认不了就保留「输入代码」行兜底并在 task.md 记录。
- 风险：`setWindowOpenHandler` 误伤应用自身导航 → 只对 `target="_blank"` 类外链生效，allowlist http(s)。
- 回退：`git revert` 本 task commit，无数据迁移。

## Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：若有「外链一律 openExternal」类约定则更新，无则写"无"。
