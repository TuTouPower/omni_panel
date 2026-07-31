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

### p015 采集失败的 stale 副本时间戳打成尝试时间，卡片「几分钟前」误导为新数据（2026-08-01）

- 现象：期望——采集失败沿用上次数据时，卡片时间应反映数据真实年龄（或明确标注为尝试时间）；实际——每次失败采集都把历史观测复制为 stale 副本，副本 `observed_at` 打成本次尝试时间（`refresh-service.ts` 标 stale 分支 `observed_at = Date.now()`），卡片相对时间每轮失败都被刷新成「几分钟前」，与「已过期」徽标并列时读作「几分钟前刚采的数据」，误导用户。复现：让某连接器持续采集失败 → 卡片时间始终显示刚刚/几分钟前，数据实际可能是数小时或数天前。
- 影响：所有连接器账号行/卡片的相对时间显示；失败窗口内用户无法从时间判断数据真实年龄（grok 2026-07-31 故障期实证：imagine 数据停在 07-29，卡片时间却每 30 分钟刷新）。
- 根因：产品缺陷。stale 副本复制时覆盖了原观测的 `observed_at`（`refresh-service.ts:336,345`），数据年龄在副本中丢失；UI 相对时间直接取该字段（`observation-mapping.ts` → `provider-usage.ts` → `ProviderAccountRow` 的 `relative_time(account.updatedAt)`）。既有测试 `tests/unit/scheduler/refresh-service.test.ts:330` 还断言了误导行为本身（副本 observed_at 必须大于原观测）。
- 测试缺口：stale 副本语义的测试只断言 stale 标记与 last_error，唯一涉及时间戳的断言（上述 :330）锁死了错误语义，没有「副本应保留原数据时间」的覆盖；renderer 层也无「stale 行的时间显示数据年龄」断言。补测方向：refresh-service 层断言 stale 副本保留原 observed_at（旧断言按 TDD 规则整体删除并写明理由，不就地改预期）；renderer 层断言 stale 账号行相对时间取自原数据时间。
- 线索：`.scratch/grok-expired-2026-07-31/notes.md`；`.scratch/grok_imagine_history.py` 查询输出（imagine 副本 observed_at=2026-07-31T23:33:30Z，实际数据 07-29）
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
