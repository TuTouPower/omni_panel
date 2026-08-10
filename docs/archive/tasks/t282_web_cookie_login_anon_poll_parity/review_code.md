# Code review — t282

reviewed_scope: 558c997cabf70eac

## Round 1 (2026-08-10 21:20 UTC+8)

### 范围

`git diff e0ccad3ec41005bb92a3dcb781bf2c6ea054da6b` 生产改动：

- 新建 `src/renderer/lib/cookie_login_poll.ts`（共享轮询 + 中文错误映射）
- `WebLoginSection.tsx`：web+instance 走共享 poll；web 匿名降级指引；桌面仍 session.login
- `SettingsForm.tsx`：`handle_session_login` 改为 `poll_cookie_login`
- 文档：architecture / connector-session / 新 spec / specs_index

### AC 对照

| AC | 实现 | 结论 |
| -- | ---- | ---- |
| AC-001 | web 无 instance 路径展示 `anon_web_guide` + 既有手动粘贴 Textarea/「添加账号」 | 满足（降级方案，非 vault 方案；spec 允许） |
| AC-002 | 两组件均 import `poll_cookie_login` / 同常量同文案 | 满足 |
| AC-003 | `format_cookie_login_error` 映射 CONFLICT/already in progress；`startCookieLogin` 本就中文 CONFLICT | 满足 |
| AC-004 | `COOKIE_LOGIN_POLL_TIMEOUT_MS=120_000` + 中文 timeout 文案 | 满足 |
| AC-005 | 非 web 或 web 无 instance 外的桌面路径仍 `session.login` | 满足 |

### Findings

无。

### 结论段提示（不进表）

- `format_cookie_login_error` 分支较多（CC 接近 10），属映射表性质，可接受；未新增可观测缺陷。
- `SettingsForm` 对 `poll_cookie_login` 再包一层 `format_cookie_login_error` 与 poll 内 catch 略冗余，行为幂等，不构成缺陷。
- `SettingsForm.tsx` 行数仍大（历史），本 task 净减 poll 内联逻辑，未再膨胀。

### 规格合规

- 范围外无顺手改动；桌面行为未改。
- 选择「明确降级指引」而非临时 vault 实例，与 p106/spec「或」条款一致。

verdict: PASS
