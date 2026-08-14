# Task review t369（reviewer_focus: 通用）

- task：`t369_platform_process`
- spec：`docs/tasks/t369_platform_process/spec.md`
- diff_anchor：`9e77a188fa7bbb23703de49555e21a242010f43c`
- target：`git diff 9e77a188fa7bbb23703de49555e21a242010f43c`
- round：1
- reviewed_at：2026-08-14 14:10 UTC+8

## Findings

### t369_gen_f001 - web_platform UA 正则把 iOS 误判为 darwin

- 严重度：minor
- 锚点：行为缺陷 + 「iPhone/iPad 浏览器打开 web 面板时，About 页显示 macOS」
- 位置：`src/web/usageboard-web.ts:257`
- 问题：`/Mac/i.test(ua)` 会命中 iPhone/iPad/iPod 的 UA（如 `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)` 含 "Mac OS X"），返回 `darwin`。web 面板经 local-api 监听 `0.0.0.0`（LAN 可达），手机浏览器可访问；此时 About 页（`about_section.tsx:47`）显示 "macOS"，且 `PopupView.tsx:679`（titlebar 不可拖拽）、`general_section.tsx:42`（mainPanelMode 走 popup）会误走 darwin 分支。三个目标桌面宿主（Linux/Mac/Win）均正确映射且有单测覆盖，仅非目标 iOS 边缘误判。评审要点「UA 正则是否误判」正是此类。
- 建议：在 `/Mac/` 前先排除移动端标记（`/iPhone|iPad|iPod/` 先判并落入默认 linux），或把 Mac 判定收紧为 `/\bMac OS X\b/` 且不含 iPhone/iPad 标记。若接受「iOS 无枚举值、落入 darwin 可接受」也可关闭，但建议在注释说明取舍。

### t369_gen_f002 - Linux wait_for_exit 的 pgrep/pkill -f 自匹配 sh -c（前史行为，非本 task 引入）

- 严重度：minor（信息性，前史）
- 锚点：非 AC 违反；AC-001/002 均不受影响
- 位置：`scripts/package-and-run.ts:43`、`scripts/package-and-run.ts:62`
- 问题：已实测确认：`/bin/sh -c 'pgrep -f omni_panel'` 会匹配自身调用 shell（cmdline 含 "omni_panel"），`execSync` 恒 exit 0 → `running` 恒为 true → Linux 下 `log("all OmniPanel processes exited")` 早退分支永不触发，`wait_for_exit` 恒烧满 5000ms 后走 force-kill；force-kill 的 `pkill -9 -f omni_panel` 亦 SIGKILL 自身 sh，`execSync` throw 被 `catch {}` 吞掉。此为「pkill 误杀无关进程」spec 风险类内行为。但该自匹配在原始 `OmniPanel` 字面量下语义完全一致（仅大小写变化），t369 未引入或恶化；AC-001 的 kill 仍能命中真实产物（cmdline 含 `omni_panel` 路径），AC-002 无 `>nul` 也不再触发。故不作为本轮阻断项。
- 建议：如后续要让早退分支生效，可用进程名判定（pgrep 不含 `-f`）或 `[o]mni_panel` 括号技巧排除自身 shell；本轮无需处理。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：2 条（均 minor/非阻断）
- 未进表的提示：
  - 非范围守住：打包流程未动（`package.json` / `electron-builder.yml` 无 diff），符合范围「不改打包流程本身」。
  - `about_section.tsx:44-52` 移除「· x64」（含 Windows 分支）：spec 范围明示「arch 用 process.arch 或省略」，接受。
  - `package-and-run.ts:43/62` 的 `procs[0] ?? "omni_panel"` 中 `??` 为防御性死代码（Linux 分支恒有值），无害。
  - AC-003 未补 darwin→"macOS" 单测（现有默认 win32 用例覆盖 Windows、新增 linux 用例覆盖 Linux），darwin 分支经 code review 确认三平台映射完备，非门禁缺口。
- 总体判断：AC-001~004 全部实现，测试真实区分（linux→Linux 映射与 UA→枚举推导在旧实现下均会红），tsc/eslint 通过；仅 2 条 minor 观察，不阻断。
- 系统性 follow-up：无

verdict: PASS
