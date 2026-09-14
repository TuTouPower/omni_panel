---
tid: "t484"
slug: "commandcode_session_history"
title: "Command Code 会话历史提取器与两面板接线"
status: "done"
branch: "t484_commandcode_session_history"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "b5d4949f6125fdeed0a789b217983a76b6ba2b54"
depends_on: ""
conflicts_with: "t483"
note: "来源 s037/d059；commandcode-extractor.ts + locator + HistorySource + 两面板接线（AgentFilter/resume/logo/色）；拆分见 t483"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 登记关系：`task.py edit --conflicts-with t483`（同触碰 `paths.ts` 与 source/agent 注册点，不可并行）；未登记硬 `depends_on`，因 extractor/locator 可独立于 reader 实现与测试——理由已写入「依赖与约束」。
- 补生产 subscription 路径（AC-007：真实 watcher → `on_update`）、边界行为契约（半行/多字节/非法 JSON/未知块/截断替换恢复/畸形 timestamp）与测试（AC-008）。
- 两端均可打开订阅查询（AC-010）；resume 在宿主执行、不因 Web 禁用、不扩大为任意命令执行（AC-009）。依据现状 `SessionPane.tsx:119-130` 仅 renderer `navigator.clipboard`、web 非安全上下文直接 return。
- 明确公共接线归属：HistorySource/ExtractorKind、locator、subscription 四处 switch、extractor、两面板映射与 resume 归本 task；reader/collector/store 归 t483。原 AC-001..006 编号保持不动，新增 AC-007..010。
- 来源注记：外部迁移仓内容为历史采样引用，本 task 未访问。

调查路径：读 `src/main/core/session-history/session-locator.ts`、`subscription-service.ts`、`codex-extractor.ts`、`src/renderer/lib/session-resume.ts`、`src/renderer/components/workspace/SessionPane.tsx`、`docs/findings/d059_commandcode_session_jsonl_format.md`。

### 2026-09-15 实施与验证

- 新增 `commandcode-extractor.ts`：全量、字节游标增量、首/末条 user 提取；只接收
    `type=message` 的 user/assistant text block，user 必须为
    `message.meta.source=user`，过滤 thinking/tool/tool_result/未知块、非法 JSON 和
    畸形 timestamp。游标处理半行、多字节截断、尾部未完成行，并在截断或同尺寸重写时
    返回 `replace_cache` 让订阅缓存全量替换。
- locator 复用 t483 的 `commandcode_projects_path`，只按
    `projects/<encoded-cwd>/<session_id>.jsonl` 精确文件名匹配；subscription-service
    四个提取分支和本机 watcher 已接入，IPC 与 LocalAPI/Web 的 query/subscribe 推送沿用
    同一 service。
- 两面板和 TokenStats 接线已补齐：source/agent schema、AgentFilter、dashboard
    标签/图例/颜色、会话 friendly/slug/abbrev/logo/accent，以及设置页 Command Code
    标题。Command Code resume 由宿主固定无 shell 执行
    `spawn("cmd", ["--resume", session_id])`，IPC/LocalAPI 只接受已定位的 linux/mac
    session，renderer 自定义模板不会改变该固定路径。
- 定向验证：Command Code extractor 8、IPC 31、Web bridge 69、subscription/locator
    等相关集合通过；合并定向集合 `220 passed / 1 existing SQLite failure`，失败为
    OpenCode 测试缺 `better-sqlite3` native binding。全量直接 Vitest 为 `3740 tests`：
    `3371 passed`、`2 skipped`、`367 failed`，失败均集中在相同 native SQLite 环境阻塞。
- 静态门禁：直接 `tsc`、高堆内存 ESLint、Prettier、Knip、dependency-cruiser、
    Design token drift、`git diff --check` 通过；Electron main/preload、renderer 与
    Web 生产构建通过，只有仓库既有 CSS 优化 warning。`pnpm test` 因无 TTY 的依赖状态
    门禁中止；Markdown formatter 因环境缺 `md_kx` 中止。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-15 03:35 UTC+8)

Round 1 零 finding。实现侧与测试侧均 PASS；复核范围包含 extractor、locator、订阅
watcher、IPC/LocalAPI/Web bridge、固定 host resume、TokenStats/两面板接线及边界测试。
`better-sqlite3` native binding、pnpm 无 TTY 与缺少 `md_kx` 均为验证环境阻塞，不落在
本 task 的业务 diff。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足（宿主真实终端启动为 `[deploy]` 人工签收项）
- 测试：定向新增/受影响集合通过；全量直接 Vitest `3371 passed / 2 skipped / 367 failed`，失败集中于缺少 `better-sqlite3` native binding
- 黑盒：`pnpm test` 因无 TTY 的 pnpm 依赖状态检查阻塞；生产 main/preload/renderer/Web 构建通过
- review：Round 1 code + test PASS，0 finding，scope 见 `handoff.json`
- AC 证据：见 `handoff.json`

### 结果摘要

- 已完成 Command Code 会话历史提取、跨入口 query/subscribe、两端固定 host resume 与
    TokenStats/两面板接线。遗留仅为 native SQLite、pnpm 无 TTY、md_kx 缺失和真实终端
    启动的环境/人工验收，不影响本 task 代码验收。
