# UNCONFIRMED

> 所有无法从旧项目源码确认的行为记录在此。

## 协议相关

1. **stdout 有多余文本时处理**：源码只对整体 stdout 做 `trimmingCharacters(in: .whitespacesAndNewlines)` 后 JSON 解析。如果插件在 JSON 前后输出了非 JSON 文本（如 print 调试信息），整个解析会失败。UNCONFIRMED：是否有插件在 JSON 外输出额外文本？→ 实际上 `_common.py` 的 `success()` 只 `print(json.dumps(...))` 一次，正常情况不会有多余文本。

2. **PluginOutput.schemaVersion 字段**：`_common.py` 输出 `schemaVersion: 1`，但 Swift `PluginOutput` struct **没有** `schemaVersion` 字段。UNCONFIRMED：Swift 是否忽略了这个字段？→ 大概率是 JSONDecoder 忽略了未声明的 key（Swift 默认行为）。

3. **stderr 是否展示给用户**：源码中 stderr 仅在非零 exit code 时用作错误消息 fallback。正常运行时不展示 stderr 内容给用户。UNCONFIRMED：是否有 UI 展示 stderr 的路径？

4. **required 参数为空时的处理**：`missingRequiredParameters()` 检查空白字符串，但插件执行前是否强制阻止？源码中 `refreshPlugin` 在 `missingRequiredParameters` 非空时只展示 warning，不阻止执行。UNCONFIRMED：用户看到 warning 后是否仍可手动触发刷新？

## 调度相关

5. **刷新间隔最小值**：`max(intervalSeconds, 5)` 保证最小 5 秒。但 UI 输入框是否有限制？UNCONFIRMED：用户是否可以输入 < 5 的值？

6. **配置写入 debounce 时间**：源码中 `scheduleConfigurationWrite` 使用 generation counter，但未找到明确的 debounce 延迟时间。UNCONFIRMED：debounce 间隔是多少？

7. **插件失败后是否保留旧缓存**：`loadCachedStates()` 在初始化时加载。刷新失败时 snapshot.state 变为 `.failed` 但 items 为空。UNCONFIRMED：失败时是否应展示上次成功的 items？→ 源码中 failed snapshot 的 `items: []`，说明 UI 层可能从缓存独立展示。

## 平台相关

8. **macOS Keychain 在 Windows/Linux 的替代**：Claude 插件通过 `security find-generic-password` 读取 Keychain。UNCONFIRMED：跨平台替代方案需在实现阶段确定。

9. **Python 路径探测**：旧项目硬编码 `/usr/bin/env python3`。UNCONFIRMED：Windows 上 `/usr/bin/env` 是否可用？→ 不可用，需要 platform-specific 处理。

10. **asar 打包后 Python 文件执行**：Electron 打包为 asar 时，asar 内文件不可直接作为子进程输入。UNCONFIRMED：需要 unpack 或复制到临时目录。

## 数据模型

11. **PluginChart.kind 字段合法值**：源码只校验 `bucketUnit`（hour/day），未校验 `kind`。UNCONFIRMED：kind 有哪些值？→ 从插件看可能是 `"token_usage"` 或类似值，但无强制约束。

12. **UsageItem.color 字段合法值**：`_common.py` 返回 `"red"`, `"orange"`, `"yellow"`, `"blue"`。UNCONFIRMED：Swift 端是否有校验？→ 无校验，color 是 String?。

13. **PluginCachedState 不包含 state 字段**：缓存只有 items/badge/chart/updatedAt。state（idle/loading/ready/failed）是纯运行时状态。UNCONFIRMED：确认 state 不持久化。→ 已确认。
