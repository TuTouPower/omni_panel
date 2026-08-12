# Task review t308（reviewer_focus: 代码）

- task：`t308_token_stats_env_local_paths`
- spec：`docs/tasks/t308_token_stats_env_local_paths/spec.md`
- diff_anchor：`a5962cfab4c269c4e7627a7b7c74c5ae8b66c588`
- target：`git diff a5962cfab4c269c4e7627a7b7c74c5ae8b66c588`
- round：1
- reviewed_at：2026-08-11 18:30 UTC+8
  reviewed_scope: 269e7a4e8181f250

## Findings

### t308_code_f001 - spec 测试策略承诺的「全仓 win 残留 grep 断言」未实现

- 严重度：minor
- 锚点：spec 测试策略「全仓 `"win"` 残留断言：grep 校验 collector/ipc/reader 无 `env === "win"` 字面量」（AC-004 的验证手段之一）
- 位置：tests 目录无对应扫描断言（缺失项）
- 问题：spec 上下文区测试策略明确列出该 grep 断言，diff 中未找到任何对 src 目录做残留字面量扫描的测试（`Grep` 检索 tests/ 无命中）。AC-004 实质覆盖未受损害：`tests/unit/main/core/token-stats/paths.test.ts` 用 `tokenStatsEnvSchema.safeParse("win").success === false` + dashboard schema 断言运行时拒绝，类型层面 `TokenStatsEnv` 由 schema 推断；本次独立 `grep src/` 证实 collector（token-stats/collector.ts、readers）、ipc、shared 无 `env === "win"` 字面量残留（仅 token-stats-store.ts 迁移 SQL 的 `WHERE env='win'` 为设计内行为，session-history 残留属 t310 范围）。
- 建议：在 paths.test.ts 或 collector.test.ts 补一个对 `src/main/core/token-stats`、`src/main/ipc`、readers 的残留字面量扫描断言；或明确在测试策略记录该手段撤回（由 test reviewer 复核是否必要）。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大（降级规则不进 finding 表，本 task 均净增）：`src/main/core/token-stats/token-stats-store.ts` 1502 行（+14）；`src/main/core/token-stats/collector.ts` 500 行（旧 454，+46）；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 2408 行（+152，迁移测试）。均为既有大文件继续堆大，无不可拆硬约束说明，建议后续拆分。
    - 范围外观察（非范围，已跟踪）：`src/main/index.ts:475` `env: s.env as Env` cast 使运行时 `local` 透传进 session-history（`subscription-service.ts:44` `Env = "win" | "wsl"`）；session-locator 对 `env === "win"` 之外的取值落入 `wsl_home` 分支（`session-locator.ts:180-186`），Windows 宿主迁移后 `local` 行会解析到错误 WSL 路径。属 spec 非范围（t310 共用路径层），实现侧注释已声明，t310 为既有 tid，不判 blocking。
    - 复杂度：无函数 ≥15（`read_source` 约 CC 8-10），不进表。
    - 测试策略偏差：见 f001。
- 总体判断：实现与 spec 契约区逐条对齐（AC-001~006 全部有实现与测试），collector/迁移/路径层未发现逻辑缺陷，无未解决 critical / important；仅有 1 条 minor。
- 系统性 follow-up：已有 tid t310（session-history 共用路径层，消解上述 cast 桥与 locator 分支错位）。

### AC 复验披露

- AC-001：`re_verified` — `paths.test.ts` linux/macos 宿主 local 源 POSIX 路径 + wsl 源 null 断言；`collector-local.test.ts` 非 Windows 宿主真实读取测试；重跑通过。
- AC-002：`re_verified` — `paths.test.ts` windows 宿主 win_home 路径与 `\\wsl.localhost\...` UNC 断言（含 grok）；重跑通过。
- AC-003：`re_verified` — `paths.test.ts` `wsl_user: ""` + windows 宿主 6 个 wsl 路径全 null 断言；重跑通过。
- AC-004：`re_verified` — schema 运行时断言（`safeParse("win")` 拒绝）+ `pnpm typecheck` 通过 + 独立 grep 证实 collector/ipc/reader 无 `env === "win"` 残留（session-history 残留属 t310 范围）。
- AC-005：`re_verified` — `token-stats-store.test.ts` 迁移 v7 用例灌 win 行、重开触发迁移，断言五表 `env='win'` 计数为 0 且 `env='local'` 计数与迁移前相等；重跑通过。
- AC-006：`re_verified` — 同用例断言 records/daily `SUM(input_tokens)` 迁移前后一致；重跑通过。

coverage = 6 / 6

verdict: PASS

## Round 2 (2026-08-11 18:15 UTC+8)

- round：2
- reviewed_at：2026-08-11 18:15 UTC+8
  reviewed_scope: a252ad8ea1523969

指纹说明：prompt 渲染（18:01）时给出的 16 位指纹 `269e7a4e8181f250` 对应 f001 修复前的 diff 状态；implementer 于 18:18 修改 `paths.test.ts`（新增扫描断言）。现按 `check_review_status.py` 同口径（`git diff a5962cfa` + 流程文件排除）重算为 `a252ad8ea1523969`；mtime 取证：18:01 后变更文件仅 `tests/unit/main/core/token-stats/paths.test.ts`。本轮审查对象即当前工作区，故写当前指纹。

### 前轮 finding 复核

**t308_code_f001（minor）：已消除。** 以 diff 与实测为准，不采信处置表自称：

- 新增 describe「no win env literal remains in collector/ipc/readers (AC-004)」（`paths.test.ts:141-163`）：8 文件白名单（collector / claude/opencode/kimi/grok readers / query-dispatcher / query-worker / reader-utils），正则 `/env\s*[:=]\s*["']win["']/` 断言零命中。
- 实测 `npx vitest run tests/unit/main/core/token-stats/` 257/257 通过（paths.test.ts 11/11）；独立 grep 全 `src/` 仅 token-stats-store.ts 迁移 SQL `WHERE env='win'` 命中（设计内行为，且未纳入名单，符合 Round 1 判断）。
- 主诉求（测试策略承诺的残留扫描断言落地）满足；落地形态的守卫缺口见 f002。

### 本轮新发现

#### t308_code_f002 - 残留扫描断言未覆盖比较运算形态与 ipc 文件（守卫牙齿弱于测试策略承诺）

- 严重度：minor
- 锚点：spec 测试策略「全仓 `"win"` 残留断言：grep 校验 collector/ipc/reader 无 `env === "win"` 字面量」（AC-004 验证手段之一）
- 位置：`tests/unit/main/core/token-stats/paths.test.ts:145-160`（文件枚举 145-154、正则 158-160）
- 问题：f001 修复落地为「8 文件白名单 + 单形态正则」，两处窄于策略承诺：
    1. 正则 `[:=]` 单字符后必须紧跟引号，只命中 `env:` / `env =` / `env=`；`env === "win"` / `env !== "win"` / `env == "win"` 全部放行（独立实测：`if (env === "win") return 1;` 与该正则不匹配）——恰是测试策略点名的字面量形态，也是本仓实际惯用写法（`paths.ts:71` 即 `env === "local"`）。未来回归若以比较式引入 `"win"`，断言不报警。
    2. 文件枚举漏掉策略点名范围 `ipc`：`src/main/ipc/token-stats-ipc.ts`（token-stats IPC handler，过滤参数 `env?: string`）未纳入；同目录 `manager.ts`、`scan-state.ts`、`paths.ts`（本 task 新增）也未纳入。策略承诺「全仓 collector/ipc/reader」，实现为 8 文件白名单。
    - 当前状态本身干净（独立 grep 全 src 零残留，仅迁移 SQL 设计内命中），无现行行为缺陷，仅守卫完整性/牙齿不足。
- 建议：正则扩展比较形态（如 `env\s*(?:===|!==|==|!=|[:=])\s*["']win["']`）；文件枚举补 `src/main/ipc/token-stats-ipc.ts` 与 token-stats 目录其余源文件，或改按目录扫描并显式排除 token-stats-store.ts 迁移 SQL 行。

### 结论（Round 2）

- 前轮 finding 复核：f001 已消除（无撤回、无修不彻底）
- 本轮新发现：1 条（minor）
- 未进表的提示：无新增。文件过大/复杂度沿用 Round 1 结论（本轮仅 paths.test.ts 净增 23 行，未推高任何阈值）。
- 总体判断：f001 修复属实且经测试验证，当前无未解决 critical / important；仅 1 条新 minor（f002）。
- 系统性 follow-up：无

### AC 复验披露（Round 2）

- AC-001/002/003/005/006：`re_verified` — 重跑 `npx vitest run tests/unit/main/core/token-stats/` 257/257 通过，覆盖路径层三平台/UNC/`wsl_user` 空串用例与迁移行数/聚合值断言；本轮 diff 未触及路径层与迁移代码。
- AC-004：`re_verified` — 独立 grep 全 src 零残留（仅迁移 SQL 设计内命中）+ schema 运行时断言 + 新守卫测试通过（守卫覆盖缺口见 f002）；类型层面沿用 Round 1 `pnpm typecheck` 结论（本轮无类型代码变更）。

coverage = 6 / 6

verdict: PASS

## Round 3 (2026-08-11 18:25 UTC+8)

- round：3
- reviewed_at：2026-08-11 18:25 UTC+8
  reviewed_scope: b84fdca233dcc4f8

指纹说明：按 `check_review_status.py` 同口径（`git diff --binary a5962cfa` + 流程文件排除）对当前工作区重算为 `b84fdca233dcc4f8`（Round 2 为 `a252ad8ea1523969`）；mtime 取证：18:15 后实质变更仅 `tests/unit/main/core/token-stats/paths.test.ts`（其余 task.md / review_test.md / review_code.md 为流程文件，已从指纹排除）。本轮审查对象即当前工作区。

### 前轮 finding 复核

**t308_code_f001（minor）：已消除，维持 Round 2 结论。** 本轮无相关改动，守卫测试存在且通过（下述 11/11）。

**t308_code_f002（minor）：已消除（点名缺口全补），残留 `!=` 形态转 f003。** 以 diff 与实测为准：

- 正则 `[:=]` 扩为 `(?::|={1,3}|!==)`：`env === "win"` / `env !== "win"` / `env == "win"` / `env = "win"` / `env: "win"` 全部命中（node 独立实测 5/5 true），f002 点名的三个漏网比较形态已覆盖。
- 白名单 8 → 12 文件：补 `manager.ts` / `scan-state.ts` / `paths.ts` / `src/main/ipc/token-stats-ipc.ts`，与 f002 点名文件一一对应。
- 实测 `npx vitest run tests/unit/main/core/token-stats/` 257/257 通过（paths.test.ts 11/11）；`npx eslint tests/unit/main/core/token-stats/paths.test.ts` 通过；独立全 src 新正则扫描仅命中 session-history（t310 范围）与 `token-stats-store.ts` 迁移 SQL（设计内、未入名单）。

### 本轮新发现

#### t308_code_f003 - 守卫正则未覆盖 `!=` 形态（f002 建议式含 `!=`，落地省略）

- 严重度：minor
- 锚点：spec 测试策略「全仓 `"win"` 残留断言」守卫完整性（AC-004 验证手段之一）；f002 建议修复式 `env\s*(?:===|!==|==|!=|[:=])\s*["']win["']`
- 位置：`tests/unit/main/core/token-stats/paths.test.ts:159`
- 问题：落地正则 `env\s*(?::|={1,3}|!==)\s*["']win["']` 未含 `!=`；node 独立实测 `env != "win"` / `env!="win"` 均不匹配（f002 建议式中明确列出的形态被省略）。本仓 `!=` 为合法写法（如 `src/main/core/session/session-manager.ts:191` 等 `!= null` 惯用），eslint 配置（`tseslint.configs.stylisticTypeChecked` + 自定义规则）未见 `eqeqeq` 强制，未来回归若以 `env != "win"` 引入字面量，守卫不报警。当前全 src 无任何形态残留（独立扫描仅 t310 范围与迁移 SQL 命中），无现行行为缺陷，仅守卫完整性再补一格。
- 建议：正则补 `!=` 分支，如 `env\s*(?::|={1,3}|!==|!=)\s*["']win["']`；可选加词边界 `\benv\b` 以覆盖 `"win" === env` 倒置形态。

### 结论（Round 3）

- 前轮 finding 复核：f001 已消除（维持）；f002 已消除（点名缺口全补，`!=` 残留转 f003）
- 本轮新发现：1 条（minor）
- 未进表的提示：无新增。文件过大/复杂度沿用 Round 1/2（本轮仅 paths.test.ts 净改正则与名单，未推高任何阈值）；范围外观察沿用 Round 1（session-history 的 win 残留属 t310，既有 tid）
- 总体判断：f002 修复经 diff、实测与独立扫描三重核实属实，修复本身未引入新问题；当前无未解决 critical / important，仅 1 条新 minor（f003）
- 系统性 follow-up：无（t310 已有）

### AC 复验披露（Round 3）

- AC-001/002/003/005/006：`re_verified` — 重跑 `npx vitest run tests/unit/main/core/token-stats/` 257/257 通过；本轮唯一实质 diff（paths.test.ts 守卫）不触及路径层与迁移代码，路径/迁移断言沿用 Round 2 详细核对并复跑确认无回归。
- AC-004：`re_verified` — 新守卫测试 11/11 通过（正则覆盖 `===`/`!==`/`==`/`=`/`:` 形态 + 12 文件白名单）；独立全 src 新正则扫描零残留（仅 t310 范围与迁移 SQL 设计内命中）；schema 运行时断言沿用；lint 通过。守卫剩余 `!=` 缺口见 f003（minor，不影响 AC-004 当前满足）。

coverage = 6 / 6

verdict: PASS

## Round 4 (2026-08-11 18:35 UTC+8)

- round：4
- reviewed_at：2026-08-11 18:35 UTC+8
  reviewed_scope: 37378e73785ddda2

指纹说明：按 `check_review_status.py` 同口径（`git diff --binary a5962cfa` + 流程文件排除）对当前工作区重算为 `37378e73785ddda2`（Round 3 为 `b84fdca233dcc4f8`）；mtime 取证：18:25 后实质变更仅 `tests/unit/main/core/token-stats/paths.test.ts`（spec.md 为 spike 结论落盘、task.md 为处置表更新，无行为变化）。本轮审查对象即当前工作区。

### 前轮 finding 复核

**t308_code_f001（minor）：已消除，维持 Round 2/3 结论。** 守卫 describe 存在且通过，本轮无相关改动。

**t308_code_f002（minor）：已消除，维持 Round 3 结论。** 白名单 12 文件（`paths.test.ts:145-158`）与正则形态（`:`/`=`/`==`/`===`/`!==`）均覆盖 f002 点名缺口。

**t308_code_f003（minor）：真修。** 以 diff 与实测为准，不采信处置表自称：

- `paths.test.ts:161` 正则现为 `/env\s*(?::|={1,3}|!==|!=)\s*["']win["']/`，`!=` 分支与 f003 建议式一致；node 独立实测 8/8 形态全命中（含 `env != "win"` / `env!="win"`）。
- 复跑 `npx vitest run tests/unit/main/core/token-stats/` 257/257（paths.test.ts 11/11）；`npx eslint tests/unit/main/core/token-stats/paths.test.ts` exit 0。
- 独立全 src 新正则扫描零残留（仅 session-history 属 t310 范围、token-stats-store.ts 迁移 SQL 为设计内行为，均未入白名单）。

### 本轮新发现

无（0 条）。

### 结论（Round 4）

- 前轮 finding 复核：f001/f002 维持已消除；f003 真修（正则补 `!=`，node 实测 + 全套件复跑 + 独立扫描三重核实）
- 本轮新发现：0 条
- 未进表的提示：f003 建议中可选「词边界 `\benv\b` 覆盖 `"win" === env` 倒置形态」未落地——独立 grep 全 src 无字面量前置比较风格（零 `"literal" === ident`），该缺口仅理论可能，按建议「可选」处理，不升 finding。文件过大/复杂度沿用 Round 1（本轮仅净改正则一行，未推高阈值）。
- 总体判断：f003 修复属实且修复本身未引入新问题；当前无未解决 critical / important，无新 minor。
- 系统性 follow-up：无（t310 已有）

### AC 复验披露（Round 4）

- AC-001/002/003/005/006：`re_verified` — 重跑 257/257 通过；本轮唯一实质 diff（守卫正则一行）不触及路径层与迁移代码，断言沿用 Round 2/3 详核。
- AC-004：`re_verified` — 守卫 11/11 通过（12 文件白名单 + 六形态正则）；独立全 src 扫描零残留；schema 运行时断言与类型检查沿用 Round 1/2。

coverage = 6 / 6

verdict: PASS
