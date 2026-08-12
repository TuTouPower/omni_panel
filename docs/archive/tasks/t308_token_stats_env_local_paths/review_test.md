# Task review t308（reviewer_focus: 测试）

- task：`t308_token_stats_env_local_paths`
- spec：`docs/tasks/t308_token_stats_env_local_paths/spec.md`
- diff_anchor：`a5962cfab4c269c4e7627a7b7c74c5ae8b66c588`（t306 执行 commit；prompt 正文与 task.md front matter 一致。任务详情给的 `a5962cfa0aa0f9db6f262096ae265b6bd1dbbdb6` 为笔误 hash，仓库中不存在该 object）
- target：`git diff a5962cfab4c269c4e7627a7b7c74c5ae8b66c588`（含工作区未提交改动）
- round：1
- reviewed_at：2026-08-11 18:14 UTC+8

## Findings

无（0 条）。危险模式逐条扫描均调查后放行，详见结论段。

## 结论

- 前轮 finding 复核：本轮为 round 1，无前轮
- 改测方向复核：diff 中所有既有测试改动均为 `win→local` 枚举语义迁移（旧 `win` 源 ≡ 新 `local` 源，spec 契约区明确该语义），断言预期随枚举值同步更新，非「迁就实现」。`collector.test.ts` 删除 10 个旧 path builder 用例（builds Win/WSL Claude/OpenCode/Kimi paths 等），被 6 个新 host-injected 用例等价且更强地替代：三平台 local 路径、wsl 非 Windows host null、wsl_user 不可探测 null、grok wsl+null——旧语义全覆盖，无覆盖丢失。无「把旧测试预期改成新实现输出」情形
- 本轮新发现：0 条
- 未进表的提示（范围外观察）：
    1. `TokenStatsView.tsx:185` `useState<PlatformFilter>(saved.platform ?? "all")`：升级前用户 localStorage 若存 `platform:"win"`，新版本下该值不再合法，dashboard IPC/HTTP 侧 `tokenStatsDashboardPlatformSchema.safeParse` 会拒绝（`src/main/ipc/token-stats-ipc.ts:122`、`src/main/core/local-api/server.ts:1091`）。spec 未要求 prefs 迁移（AC 只覆盖枚举/路径/迁移），属范围外边缘场景，建议 follow-up 或 t309/t310 顺带处理；未验证 renderer 端失败表现，故不构成 AC 违反
    2. `collector-local.test.ts:1` 文件头 `eslint-disable @typescript-eslint/no-non-null-assertion`：危险模式扫描命中「test 文件加 eslint-disable」，调查后放行——该 disable 仅豁免 TS 类型断言 lint 规则（`mock.calls[0]![0]` 数组取值），不吞运行期错误、不掩盖失败；同目录 pre-existing 测试文件（collector.test.ts、token-stats-store.test.ts、claude-reader.test.ts 等 8 个）文件头同样 disable，属既有惯例
    3. `tests/unit/main/scripts/designmd.test.ts` AC5 drift 门禁用例在本工作区失败（已复跑确认），t308 diff 不触碰 DESIGN.md/globals.css，属存量 drift，与 t308 无关
- 总体判断：AC 全覆盖、测试可信（路径层纯函数三平台注入 + 迁移 SQL 五表行数/聚合断言 + 真实 reader 集成）、无危险模式、改测全部为语义迁移。0 finding，PASS

### AC 复验方式

- AC-001：`re_verified`。`paths.test.ts` linux/macos local POSIX 路径与 wsl null 断言精确 `toBe`；`collector-local.test.ts` 重定向 `os.homedir()` 到 temp dir，真实 claude-reader 解析 fixture jsonl 并断言 postMessage 载荷 env=local、记录 1 条（已跑：3 tests pass）。另有 `collector.test.ts` AC-001 用例（linux host 注入）
- AC-002：`re_verified`。`paths.test.ts`「windows host」describe 断言 win_home 反斜杠路径与 `\\wsl.localhost\Ubuntu-22.04\home\karon\...` UNC（`toBe` 精确匹配，已跑通过）；`collector.test.ts` `set_collector_host("windows")` 下 local sources 走 `C:\Users\Test`（`stringContaining("Users")`）
- AC-003：`re_verified`。`paths.test.ts`「undetectable wsl_user」describe 六 builder 全 null；`collector.test.ts` `cfg.wsl_user:""` + windows host 用例（已跑通过）
- AC-004：`re_verified`。`paths.test.ts` schema 断言：`tokenStatsEnvSchema.options toEqual(["local","wsl"])`、`safeParse("win").success=false`；dashboard platform schema 同步。独立复核：全仓 `tsc --noEmit` EXIT:0；grep `src/` 无 `env:"win"` 字面量残留（session-history 系统的 3 处 `"win"` 属 spec 非范围 t310，`src/main/index.ts` cast 注释已声明）
- AC-005：`re_verified`。`token-stats-store.test.ts`「migration v7」用例：五表（records/sessions/daily/buckets/hour_rollup）`UPDATE env='win'→'local'` 后 `user_version=7`、每表 win_count=0、local_count=迁移前 win_count（已跑：89 tests pass）
- AC-006：`re_verified`。同用例断言 `records/daily` 的 `SUM(input_tokens)` 迁移前后一致（local 侧 = win 侧）
- coverage = 6 / 6

系统性 follow-up：无（无跨 task 测试基础设施缺口）

reviewed_scope: 269e7a4e8181f250

verdict: PASS

## Round 2 (2026-08-11 18:35 UTC+8)

- round：2
- reviewed_at：2026-08-11 18:35 UTC+8
  reviewed_scope: 37378e73785ddda2

指纹说明：Round 1 指纹 269e7a4e8181f250 已过期。按 `check_review_status.py` 同口径（`git diff --binary a5962cfa` + 流程文件排除；task.md/review\_\*.md/handoff.json 不计入）对当前工作区重算为 `37378e73785ddda2`（脚本内部函数与手工 sha1sum 双核一致）。指纹变化仅源于 `paths.test.ts` 守卫断言迭代（code 侧 f001 新增、f002/f003 修复）；task.md 处置表虽更新但按口径排除、不影响指纹。本轮审查对象即当前工作区。

### 前轮 finding 复核

Round 1 test verdict PASS、0 finding（危险模式逐条扫描放行）。以当前 diff 复核：

- AC-001/002/003/005/006 对应测试（paths.test.ts 路径用例、collector.test.ts host-injected 用例、collector-local.test.ts、token-stats-store.test.ts 迁移 v7 用例）本轮零改动，Round 1 逐条核对结论维持；重跑 `tests/unit/main/core/token-stats/` 257/257、受影响 renderer/shared/web 8 文件 213/213、integration server 62/62 全绿。
- AC-004 覆盖未削弱：schema 断言（`options`/`safeParse("win")` 拒绝）未动；守卫 describe（无 → f001 → f002 → f003）为净加强。守卫测试可信性独立核验：
    - 非恒真：`fs.readFileSync` 读真实源码文件，文件缺失/路径错则抛 ENOENT fail loud，非存在性断言；
    - 断言带失败消息（`${f} contains env win literal`）；
    - 正则 `/env\s*(?::|={1,3}|!==|!=)\s*["']win["']/` 覆盖 `:`/`=`/`==`/`===`/`!==`/`!=` 六形态 + 单双引号（`!==` 位于 `!=` 前，alternation 顺序正确）；
    - 独立 grep 全 src 零残留，仅 session-history 4 处（`session-locator.ts:180/185/192`、`subscription-service.ts:180`）属 t310 范围；
    - 白名单 12 文件与 `src/main/core/token-stats/`（12 文件）+ `src/main/ipc/token-stats-ipc.ts` 目录清单核对一致；token-stats-store.ts 未入名单（含设计内迁移 SQL `WHERE env='win'`），策略口径为 collector/ipc/reader，符合承诺。
- 危险模式逐条复扫（.only/.skip/注释断言/弱化断言/eslint-disable/ts-ignore/静默错误）：新增行仅命中 collector-local.test.ts:1 pre-existing 类型 lint disable（Round 1 已调查放行，本轮无新增）。
- Round 1 结论无被削弱或推翻项。

### 本轮新发现

无（0 条）。

### 结论（Round 2）

- 前轮 finding 复核：Round 1 0 finding，本轮复核无推翻项，结论维持
- 改测方向复核：本轮 paths.test.ts 守卫迭代属新增测试与守卫自身强化，非修改既有断言预期；无「迁就实现」改测
- 本轮新发现：0 条
- 未进表的提示：
    1. 守卫正则不覆盖倒置形态（`"win" === env`）与反引号模板串（`` env === `win` ``）：code reviewer f003 已将倒置形态列为可选增强；反引号字面量比较在 TS 中极罕见。守卫完整性经 code 侧三轮收口，test 视角不重复出 finding
    2. token-stats-store.ts 未入守卫白名单（设计内迁移 SQL 若入名单须按行排除）；策略承诺口径为 collector/ipc/reader，当前实现干净
    3. t259 集成测试外层 `SessionRow.env` 仍 `"win"`（session-history 类型未变，t310 范围），内层 token-stats 字段已改 `local`——与 code 侧 Round 1 判断一致，非 t308 覆盖对象
- 总体判断：Round 1 结论在守卫迭代后的当前 diff 下仍成立——AC 覆盖未削弱、守卫测试可信（fail loud、六形态正则、白名单与目录核对一致）、无危险模式、无迁就实现改测。0 finding，PASS
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified` — paths.test.ts linux/macos local POSIX 路径 + wsl null 断言（重跑通过）；collector-local.test.ts 真实 claude-reader 解析 fixture 并断言 postMessage 载荷 env=local
- AC-002：`re_verified` — paths.test.ts windows host win_home 反斜杠路径与 `\\wsl.localhost\Ubuntu-22.04\home\karon\...` UNC 精确 `toBe`；collector.test.ts `set_collector_host("windows")` 下 local 源走 `C:\Users\Test`
- AC-003：`re_verified` — paths.test.ts wsl_user 空串六 builder 全 null；collector.test.ts `wsl_user:""` + windows host 用例
- AC-004：`re_verified` — `tokenStatsEnvSchema.options` toEqual `["local","wsl"]` + `safeParse("win")` 拒绝；守卫测试 12 文件六形态正则零命中（重跑通过）；独立 grep t308 范围 src 零残留（session-history 4 处属 t310）；类型层面沿用 code 侧 typecheck 结论（本轮无类型变更）
- AC-005：`re_verified` — token-stats-store.test.ts 迁移 v7 用例：五表 `win_count=0`、`local_count=迁移前 win_count`、`user_version=7`（重跑通过）
- AC-006：`re_verified` — 同用例 records/daily `SUM(input_tokens)` 迁移前后一致

coverage = 6 / 6

verdict: PASS
