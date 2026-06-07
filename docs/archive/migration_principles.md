# 迁移原则

## 最高优先级

**旧插件协议完全兼容。** 新 Electron 项目必须能原样执行旧项目 Python 插件，不修改协议格式。

## 安全边界

- renderer 禁止直接访问 `fs`、`child_process`、`ipcRenderer`
- Python 插件只能由 main process 执行
- preload 通过 `contextBridge` 暴露白名单 API
- secret 参数不得写入日志、错误消息、测试快照

## 开发顺序

```
parser → runner → config/cache → scheduler → IPC → UI
```

不允许先做 UI mock 后补 core。

## 跨平台要求

| 项目        | macOS                                     | Windows                     | Linux                 |
| ----------- | ----------------------------------------- | --------------------------- | --------------------- |
| 数据目录    | `~/Library/Application Support/OmniUsage` | `%APPDATA%/OmniUsage`       | `~/.config/OmniUsage` |
| Python 查找 | `python3`                                 | `python3` → `python` → `py` | `python3` → `python`  |
| 凭证存储    | Keychain                                  | Credential Manager          | libsecret / 明文降级  |
| 托盘        | NSStatusItem 等效                         | Windows 托盘                | 系统托盘              |

## UNCONFIRMED 标记

所有无法从旧项目源码确认的行为必须标记为 `UNCONFIRMED`，记录在 `docs/unconfirmed.md`。不允许猜测。

## 测试先行

每个模块实现前必须有对应测试或 fixture。不允许无测试的代码。

## 不修改旧协议

不允许为了适配新实现而修改插件协议。如果发现旧协议有歧义，记录到 unconfirmed.md，取最保守实现。
