# Task spec

## 背景

来源：Grok 全仓评审（2026-08-11）Issue 6。`src/renderer/components/workspace/MarkdownMessage.tsx` 渲染 `<a href={href}>` 无 scheme 白名单、无 `rel`/`target` 加固；消息内容不可信（user/agent 日志）。`javascript:`/`file:` 或意外 scheme 链接可导航会话历史窗口 webContents——面板窗口无 `will-navigate` 守卫（仅 `setWindowOpenHandler` 管新窗口）。

## 契约区

### 范围

- MarkdownMessage 链接仅允许 `http:`/`https:`（其余渲染为纯文本）
- 允许链接加 `target="_blank"` + `rel="noopener noreferrer"`（或经 IPC `shell.openExternal`）
- 面板窗口加 `will-navigate` deny-except-allowlist 守卫（主进程 window-manager）

### 非范围

- 其它渲染面（token-stats/会话库）的同类链接——如存在同模式一并修或登记
- markdown 渲染引擎整体替换

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：含 `javascript:`/`file:`/未知 scheme 链接的消息渲染为纯文本（无 `<a href>`），`http:`/`https:` 保留链接
- [ ] AC-002：允许的链接带 `rel="noopener noreferrer"`（或经 `shell.openExternal`，不导航本窗口）
- [ ] AC-003：面板窗口导航到非白名单 URL 被拒绝（`will-navigate` 阻止），正常内部导航（file:// 渲染入口）不受影响

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002：渲染单测可测；AC-003：主进程窗口守卫单测（mock will-navigate 事件断言 preventDefault）。

## 上下文区

- 来源：Grok 全仓评审 Issue 6（MarkdownMessage.tsx:61 / window-manager.ts:187）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 渲染单测：各 scheme 链接渲染输出断言
- 主进程单测：will-navigate handler 白名单行为

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：见 spec 背景与范围；实施失败影响限本 task 涉及面
- 回退：改动可整段回退，回归测试守护

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
