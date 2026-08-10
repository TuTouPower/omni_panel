# p093 保存 CPA endpointOverrides 偶发不落盘（内存生效、config.json 未写）（2026-08-08）

- 来源：t267 review f003（important）
- 现象：`plugin_config.spec.ts` restart 用例保存 `https://cpa.example.test` 后，connector 已用新 endpoint 在内存生效并发起请求（onSaved → trigger_background_refresh），但 config.json 从未写盘。测试确定性等待 config.json 含目标 endpoint（poll 10s）超时失败。失败率 ~10-20%。
- 影响：重启后配置丢失（读回默认 17863），用户编辑的 CPA 端点不持久。
- 根因：双根因。①`CpaConnectorSettings` useEffect 依赖含 `config`，config 变化（保存 echo / 外部广播 / connector 刷新）时 `setEndpoint(config.endpointOverrides.default ?? metadata.default)` 覆盖用户编辑中的输入，值回退默认 17863，`configChanged` false 致保存被静默跳过。②React 受控 input 在 Playwright fill/pressSequentially 下偶发不触发 onChange，值未进 React state。
- 测试缺口：e2e restart 用例依赖输入生效 + 保存落盘。
- 线索：`CpaConnectorSettings.tsx:113-146` effect 依赖；`plugin_config.spec.ts` 输入方式。
- 处理：t267（effect 去 config 依赖不重置表单；测试改 nativeInputValueSetter 可靠输入）
