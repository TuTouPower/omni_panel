# Task review t307（reviewer_focus: 通用）

- task：`t307_web_session_history_button`
- spec：`docs/tasks/t307_web_session_history_button/spec.md`
- diff_anchor：`862f2a48503c8d4705aefd5706525bf9a1c82e10`
- target：`git diff 862f2a48503c8d4705aefd5706525bf9a1c82e10`
- round：1
- reviewed_at：2026-08-12 00:14 UTC+8

## Findings

无（0 findings，clean review）。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：0 条。
- 未进表的提示：全量 `pnpm test` 存在 1 个与本 task 无关的既存红灯——`tests/unit/main/scripts/designmd.test.ts`「真实 globals.css 导出区与 DESIGN.md 一致（AC5 drift 门禁）」。drift 由 36bb7cb1（热力图换单色相强度梯度，向 globals.css 导出区加 `--color-heat-N` 未同步 DESIGN.md）引入，早于本 diff anchor；t307 未触碰 DESIGN.md/globals.css，非本 task 引入。t307 相关测试（popup_view 单测、web e2e popup_view、typecheck、lint）全部实测绿。
- AC 复验方式：
    - AC-001：re_verified。单测「renders the session history button in web mode」设 `dataset.web` 断言按钮在文档且窗口控制三钮（最小化/最大化/关闭）隐藏；web e2e「session history button is visible in web titlebar」在真实 SPA（install_web_usageboard 设 data-web=1）断言可见。两者均实测通过。
    - AC-002：re_verified。单测点击断言 `session_history_open("", "", "")`；web e2e 实测点击后 onFocus 订阅者收到 `{source:"",env:"",session_id:""}`、hash 变 `#session`、`.session-shell` 挂载可见。链路与真实 web bridge 一致：usageboard-web.ts:608 `open` → onFocus 分发 + `hash=session`（623 行）；App.tsx:29 `#session` → SessionShell（根节点 `.session-shell`）。
    - AC-003：re_verified。TitleBar.tsx 仅移除会话历史按钮那处守卫（现 99-108 行无条件渲染），124 行窗口控制 `!is_web() && !is_floating` 守卫未动；既有桌面用例「标题栏按钮序…会话历史」「opens the session history window from the title bar button」仍绿（25/25 内含）。
    - AC-004：re_verified。实测 t307 相关测试全绿：`popup_view.test.tsx` 25/25、web e2e `popup_view.spec.ts` 7/7（含 2 新用例）、`pnpm typecheck`、`pnpm lint`（--max-warnings=0）均通过。
    - coverage = 4/4
- 总体判断：diff 仅一行守卫移除 + 注释与用例更新，范围精准无偏航，实现/测试/文档与 spec 一致，未发现未解决 critical/important。
- 系统性 follow-up：建议标题「修复 DESIGN.md 与 globals.css 导出区 drift（--color-heat-N）」，slug `designmd_heat_tokens_drift`（非阻断，main 已存在既存红灯，与本 task 无关）。

reviewed_scope: dc393fe64f3814b6

verdict: PASS
