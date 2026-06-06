# 骨架屏优化

_Started 2026-06-06 13:27 UTC_

---

## User

DeepSeek 这种没有刷新时间的直接置空就行，不要搞个 占位符

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: str_replace_edit]_

Now I'll make the change. The fix: missing reset → blank (not `--`), while keeping `--` for the genuine no-data state.

_[tool: str_replace_edit]_

_[tool: done]_

DeepSeek 余额行的刷新时间现在直接置空了——`splitTime` 区分了"真无数据"（仍显示 `--`）和"无刷新时间"（留空），数据里的占位 `--` 也改成了空值。

