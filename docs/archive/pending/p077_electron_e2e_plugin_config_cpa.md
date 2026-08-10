# p077 electron e2e plugin_config CPA 保存偶发失败（完整套件下）

- 来源：t254 黑盒
- 现象：完整 `pnpm test:e2e:electron` 时 `plugin_config.spec.ts:91`「CPA settings persist after app restart without exposing the secret」偶发失败（endpoint 读回 synthetic 默认 17863 而非保存的 cpa.example.test）；单独跑该 spec 稳定 4 passed。
- 影响：electron e2e 完整套件偶发非全绿；CPA 配置持久化路径无稳定 e2e 保障。
- 根因：疑似测试间 electron 进程/端口残留——前一测试的 app 未完全退出时 plugin_config 重启读取用户数据竞态；主仓基线（未改代码）完整 e2e 35 passed，单独跑也过，非 t254 引入（t254 改会话定位不涉 CPA 配置）。
- 测试缺口：无（测试隔离问题，非断言缺失）。
- 线索：失败仅出现在完整套件（多 spec 串行）下，单独 spec 恒过；重启相关测试（secrets_persistence 等）前置。
- 处理：t267
