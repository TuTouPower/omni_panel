# 待办与不办总账

项目里「已知、还欠着」的事只在本文件登记：未修 bug、review 遗留、技术债、该做未做的需求，以及用户已确认暂搁的事项。分两节：「待办」放未闭环、待启动条目；「不办」放用户显式确认暂搁的条目。

- 三态划分：未闭环（「待办」节，`- 处理：未开`） / 已闭环（迁 `docs/archive/pending.md`） / 暂搁（「不办」节，`- 处理：不办` + `- 暂搁`）。
- 「不办」不等于闭环：条目整条留本文件「不办」节，不迁 archive；以后决定复活时移回「待办」节（`- 处理` 改回 `未开`、删 `- 暂搁`、保留原 `pNNN`）。
- 所有条目统一使用 `pNNN`，当前主总账（含「待办」「不办」两节）与归档总账共享一条递增序列，历史编号不复用。
- 新增条目前运行 `scripts/pending.py next`；更新已有条目或迁入归档时保留原编号。

## 待办

两种字段模板，按条目性质选一种；`- 处理` 字段未闭环写「未开」，闭环写 `{tid}` 或外部动作说明。

- 普通（需求 / 遗留 / 技术债）：`- 来源` / `- 内容` / `- 处理`。`- 来源` 写清出处：finding_id、原 tid、用户提出，或技术债自查。
- bug：`- 现象` / `- 影响` / `- 根因` / `- 测试缺口` / `- 线索` / `- 处理`。bug 由 `task-bug` 登记并完成根因与补测分析。

已验证的技术发现不属于待办，写 `docs/findings.md`。

### p012 config-store 并发保存测试疑似 flaky（2026-07-31）

- 来源：t171 黑盒（顺手发现）
- 内容：`tests/integration/config/config-store.test.ts > serializes concurrent saves so final state is consistent` 在 t171 worktree 首次 `pnpm test` 失败、单独重跑即过，疑似时序敏感 flaky。与本 task 改动无关（未碰 config-store）。需复查是否真 flaky 或存在并发断言过弱。
- 处理：未开

### p013 门禁基线红：format:check archive 文档 + knip 未用文件（2026-07-31）

- 来源：t172 顺手发现
- 内容：`pnpm format:check` 全局失败，约 30 个 `docs/archive/tasks/*/` 文档/脚本未过 prettier；`pnpm deadcode`（knip）报 3 个未用文件（`src/renderer/components/add_account/AuthPlaceholder.tsx`、`src/renderer/hooks/useGrokDeviceLogin.ts`、`src/renderer/hooks/useKimiDeviceLogin.ts`）。两者主仓同样报，为存量基线非本次引入。
- 处理：未开

## 不办

用户已显式确认暂搁的条目——「以后再说」，不是闭环。`pending-to-task` / `task-bug` 不自动捞本节；`repo-hygiene` 不迁 archive。

字段复用上方普通 / bug 模板，追加必填项：

- `- 暂搁：YYYY-MM-DD 决定不办的理由`：写清为什么现在不动（风险可控、排期靠后、等外部依赖等）。
- `- 处理` 固定写「不办」。

以下 9 条自 `docs/legacy_backlog.md`「暂不建 task（附理由）」节迁入（2026-07-31 对齐模板时迁移）。

### p001 16 个 connector 删内联 helper 改 ctx.status（2026-07-26 暂搁）

- 来源：t088/t066 遗留
- 内容：16 个 connector 删除内联 helper，统一改 `ctx.status`
- 暂搁：全部未迁移，工作量大；纯 DRY 无功能收益；ctx.status 注入机制已就绪但不阻塞；当前各 connector 内联实现语义已统一（t055 修），重复但正确。等有新 connector 需求或批量改动窗口再做
- 处理：不办

### p002 I19/I21/I22/I23 测试架构改进（2026-07-26 暂搁）

- 来源：t064 遗留
- 内容：测试架构改进（I19/I21/I22/I23）
- 暂搁：需 CI 环境配合验证；其中 I23（取消 skip）已确认无残留 skip，I19/I21/I22 属测试基建增强非缺陷修复；项目当前测试覆盖率足够支撑日常开发
- 处理：不办

### p003 migration 测试改 import 生产迁移入口（2026-07-26 暂搁）

- 来源：t069 遗留
- 内容：migration 测试改为 import 生产迁移入口
- 暂搁：需导出 observation-store 内部迁移函数，属 API 暴露面扩大；当前手写 PRAGMA+ALTER 测试覆盖核心迁移路径，风险可接受
- 处理：不办

### p004 e2e 断言真实刷新（当前死等 1000ms）（2026-07-26 暂搁）

- 来源：t070 遗留
- 内容：e2e 断言真实刷新，替换当前死等 1000ms
- 暂搁：需 e2e 运行环境改造；现有测试通过单元/集成层覆盖刷新逻辑，e2e 死等是已知妥协
- 处理：不办

### p005 setupFiles 拆 renderer-only（2026-07-26 暂搁）

- 来源：t071 遗留
- 内容：setupFiles 拆分 renderer-only 部分
- 暂搁：需 vitest.config 改 + 评估 renderer 测试对 mock 依赖；当前 mock 注入无副作用
- 处理：不办

### p006 完整 rendererIndexPath 白名单（2026-07-26 暂搁）

- 来源：t062 遗留
- 内容：完整的 rendererIndexPath 白名单
- 暂搁：需 helpers 注入 path（架构改）；当前 endsWith index.html 已拒非 HTML file://，攻击面极小
- 处理：不办

### p007 mock os.replace 失败路径测试（2026-07-26 暂搁）

- 来源：t063/t068 遗留
- 内容：mock os.replace 失败路径测试
- 暂搁：当时需 pytest 基建，项目无 Python 测试框架；当前原子写实现（tmp+fsync+os.replace）+ happy path + 中断恢复测试已覆盖核心契约。注：现已引入 `tests/repo_template/` Python 测试，复活门槛降低
- 处理：不办

### p008 taskkill 按路径（PowerShell）（2026-07-26 暂搁）

- 来源：t074 遗留
- 内容：taskkill 改为按路径（PowerShell）
- 暂搁：Windows 特定重构；当前按端口 kill 已覆盖主场景
- 处理：不办

### p009 拆 PopupView.tsx（869行）与 popup_view.test.tsx（1519行）（2026-07-26 暂搁）

- 来源：t153 f002/f003
- 内容：拆分 `PopupView.tsx`（869行）与 `popup_view.test.tsx`（1519行）
- 暂搁：均为 diff 前存量超阈（848/1421 行），t153 净增为必要守卫与验收覆盖；拆分是独立重构（参照 t044/t125/t126 先例），等下次大改面板时一并做
- 处理：不办
