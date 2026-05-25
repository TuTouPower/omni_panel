# Platform Notes

## Python 依赖

- 需要 Python 3.8+
- 自动检测顺序: `python3` → `python` → `py`
- 未检测到时 Dashboard 显示错误提示
- Windows 用户需手动安装 Python 并加入 PATH

## 插件路径

| 环境   | 路径                             |
| ------ | -------------------------------- |
| 开发   | `<project>/resources/plugins/`   |
| 打包后 | `process.resourcesPath/plugins/` |

`getBundledPluginsDir()` 自动区分两种环境。

## 跨平台注意事项

### GLM 插件缓存目录

原版 macOS 路径 `~/Library/Application Support/UsageBoard/plugin-caches`，Linux 改为 `~/.cache/UsageBoard/plugin-caches`（遵循 XDG 规范）。

### Claude / Codex 插件

读取本地 `~/.claude` / `~/.codex` 目录下的用量文件，无需 API Key。

### 第三方依赖

所有 bundled 插件仅使用 Python stdlib（`urllib`, `json`, `os`, `sys`, `glob`），无需 pip install。

## 已知限制

- Windows 需用户自行安装 Python
- 系统托盘图标为空（需后续替换为实际图标资源）
- 打包格式: Squirrel (Windows), ZIP (macOS), DEB/RPM (Linux)
