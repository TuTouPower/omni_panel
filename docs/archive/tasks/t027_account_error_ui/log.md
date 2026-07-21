# Task plan / log

## 记录

- ProviderAccountRow L47-49：`error: _error` 解构，`void _error`（T027 deferred）。header L101-110：card-name + rel-time（updatedAt + stale-badge）。
- 实现：删 void \_error，header rel-time 行加 `{_error && <span className="error-badge" title={_error}>采集失败</span>}`。
- CSS `.error-badge` 参照 `.stale-badge`（L605），用 `--risk-red`（红色，与 critical 一致）。
- web e2e：synthetic fixture 有 KIMI error account，断言 `.error-badge` 可见 + title 含 error message。
