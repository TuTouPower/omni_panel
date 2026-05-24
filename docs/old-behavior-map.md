# 旧行为映射

> 来源：旧项目 Swift 源码精确提取。

## 插件发现

- **BundledPluginInstaller.swift**: 启动时扫描 app 包内 `Contents/Resources/Plugins/`（开发环境 fallback 到 `Resources/BundledPlugins/`）
- 过滤 `.py` 文件且不以 `_` 开头（排除 `_common.py`）
- 按文件名排序
- 在用户 plugins 目录创建**符号链接**指向源文件
- 如目标已存在（文件或符号链接），先删除再创建
- 返回安装后的 URL 列表

## 元数据解析

- **PluginMetadataParser.swift**: 读取脚本文件，取前 **80 行**
- 扫找 `UsageBoardPlugin:` 开始标记（前缀匹配，忽略行首空白和 `#` 注释前缀）
- 收集标记后的内容直到 `/UsageBoardPlugin` 结束标记
- 开始标记同行如有额外内容也收集
- `stripCommentPrefix` 去除 `#` 和紧随的空格
- 未闭合（有 begin 无 end）时输出 stderr 警告，返回 nil
- 解析收集到的文本为 JSON → PluginMetadata
- 解析失败返回 nil（静默，不输出错误）
- 多语言翻译从 JSON 的 `key@lang` 动态 key 提取到 `translations` 字典

## 参数传递

- **PluginExecutor.swift**: 构建 `--usageboard-param KEY=value` 格式参数
- 仅传递在 `parameterValues` 中有非空值的参数
- 额外传入 `USAGEBOARD_LANGUAGE` 保留参数（`"zh-Hans"` 或 `"en"`）
- `.py` 文件用 `/usr/bin/env python3 <path>` 执行
- 非/py 文件直接执行

## 子进程执行

- 使用 `Process`（Foundation），设置 stdout/stderr pipe
- `DataBuffer`（NSLock 保护）收集 stdout 和 stderr
- pipe 的 `readabilityHandler` 流式读取
- 用 `DispatchSemaphore` 等待 pipe 排空
- **timeout**: 默认 **15 秒**（`timeoutSeconds: TimeInterval = 15`）
- timeout 后 `process.terminate()`，返回 failed snapshot
- 正常退出后检查 `terminationStatus`

## stdout/stderr 处理

- 非零 exit code：优先用 stderr 文本作为错误消息，stderr 为空则用通用 exit code 消息
- 零 exit code：
    1. 先尝试 `JSONDecoder` 解析为 `PluginOutput`
    2. 解析失败再尝试解析为 `PluginOutputError`（`{"error": "..."}` 格式）
    3. 都失败则返回 jsonParseFailed 错误
- stdout 先 `trimmingCharacters(in: .whitespacesAndNewlines)` 再解码

## 缓存读写

- **PluginStateStore.swift**: 缓存文件存于 `states/{stateID}.json`
- `stateID` 来自 `PluginConfiguration.stateID`（UUID 字符串）
- 读取：`Data(contentsOf:)` → JSONDecoder → PluginCachedState
- 写入：JSONEncoder → atomic write（`.atomic` 选项）
- 目录不存在时自动创建

## 缓存过期判断

```swift
func needsRefresh(stateID: String, intervalSeconds: Int) -> Bool {
    guard let cached = load(stateID: stateID) else { return true }
    let interval = max(intervalSeconds, 5)
    return Date().timeIntervalSince(cached.updatedAt) > Double(interval)
}
```

最小间隔 5 秒。

## 刷新调度

- **UsageBoardStore.swift**: 每个插件独立 `Task` + `Task.sleep`
- 使用 `SchedulerKey(refreshIntervalSeconds, stateID)` 判断是否需要重建调度器
- 首次刷新时间：有缓存则等 `interval - 已过时间`，无缓存则立即
- 防并发：refresh 进行中时新请求被忽略（检查 task 是否 active）
- 手动刷新（`force: true`）会先取消旧 task 再新建
- disabled 插件不参与调度

## 配置写入

- **ConfigStore.swift**: `save()` 使用 atomic write
- **UsageBoardStore**: `scheduleConfigurationWrite()` 用 generation counter 合并短时间多次写入
- 写入后重建 snapshots、重启 schedulers、刷新插件

## 显示名去重

- **PluginDisplayNames.swift**: 同名插件自动加序号 `"Claude 2"`
- 优先用 metadata 的 localizedName，其次用配置的 name，最后 "未命名"

## 系统活动感知

- 监听 `NSWorkspace` 的 `NSWorkspace.willSleepNotification` 和 `NSWorkspace.didWakeNotification`
- 睡眠时暂停所有调度
- 唤醒后恢复调度
- 安全网：如果 wake 通知丢失，4 小时后自动恢复
