# Task review t448（reviewer_focus: 测试）

- task：`t448_codex_panel_tool_tokens_cache_fix`
- spec：`docs/tasks/t448_codex_panel_tool_tokens_cache_fix/spec.md`
- diff_anchor：`2eb2aabba154ae7848cd9b5744f1210db9bd38b8`
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t448' diff 2eb2aabba154ae7848cd9b5744f1210db9bd38b8`
- round：1
- reviewed_at：2026-09-04 20:20 UTC+8

reviewed_scope: 95ab0499c9a458e4

## Findings

### t448_test_f001 - AC-006 input 归一断言无判别力：cache 加回不等号两边抵消，「不双计」回归仍 PASS

- 严重度：important
- 锚点：AC-006「input 已含 cached 部分须归一，不双重计数」
- 位置：`tests/unit/main/core/token-stats/codex-reader.test.ts:246`
- 问题：断言 `expect(input + cache_read + output).toBeLessThanOrEqual(2000 + cache_read)` 在代数上抵消 `cache_read`，退化为 `input + output ≤ 2000`。该上界在本 fixture（total 1000→2000 单调、无重复事件）下恒成立：生产代码每事件 `in_delta + out_delta = attributable`，session 的 `input + output` 恒等于累计差分 2000，与归一是否发生无关。反例：把归一去掉（`normalized_in = in_delta`，即 codex input 已含 cache 却仍单独加 cache_read——正是 AC-006 要防的双计），本 fixture 得 input=1800、output=200、cache=1500，`1800+200 ≤ 2000` 仍通过。测试注释声称「锁不双重计数上界」，但该断言对 AC-006 核心的归一不变量没有任何判别力。
- 建议：改用能区分双计的断言，例如 `expect(input + cache_read + output).toBe(2000)`（归一后 300+1500+200=2000；未归一则 1800+1500+200=3500，红），或精确断言 `expect(input).toBe(300)`，或断言缓存率 `cache_read/(input+cache_read)` 在 (0,1]。运行时已验证当前实现下期望值确定、无舍入抖动。

### t448_test_f002 - AC-004 测试仅存 codex 单行，agent=codex「过滤排除非 codex」分支未被触发

- 严重度：minor
- 锚点：AC-004「agent=codex 过滤返回 codex 行且不丢字段」的「过滤」语义
- 位置：`tests/integration/local-api/server.test.ts:1397-1432`
- 问题：文件级 `beforeEach`（:64）每测重建 `:memory:` store，AC-004 测试 store 内只有一条 codex 行；即使服务端完全忽略 `agent` 参数返回全表，结果仍是该单行，`toHaveLength(1)` 与 `toMatchObject` 照常通过。测试验证了 codex 行可经 HTTP 取回且字段不丢（含 cache_read_tokens=5），但没有证据表明 `agent=codex` 参与了过滤。
- 建议：查询前再 upsert 一条非 codex 记录（如 claude-code），断言结果 length=1 且仅 codex——使排除分支真实触发。若认为过滤是通用机制已被其它用例覆盖，可仅作注释说明，不计阻断。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：修改的既有测试仅一处——`tests/unit/renderer/lib/codex_panels_wiring.test.ts:30-32`，旧断言「codex 回退 primary（待 design token）」改为「codex 走 `var(--color-agent-codex)`」。此为 t448 AC-003 / 范围新增 DESIGN codex 品牌 token 后的规格驱动更新（旧测试自身注明待 design token），非迁就实现的改测。`codex-reader.test.ts` fixture helper 增 `cached?` 可选字段为纯增量。无「就地把旧测试预期改成新实现输出」的情形。
- 本轮新发现：2 条（1 important、1 minor）
- 未进表的提示：
  - AC-005 用合成小规模 fixture（2500 量级）验证去重语义，未在真实复现量级（1356472098→196124034）上锁；spec 允许不逐字锁定且测试策略指明自造最小 fixture，不阻断。可作为可选扩展：用复现文件同形态数据跑一次量级校验。
  - AC-001 仅测抽取出的纯函数 `agentBadgeLabel`，未做组件渲染级断言；生产代码确已在 `SessionTable.tsx:272` 调用该函数，可达性成立，够用。
  - `codex-reader.test.ts:246` 同块含 `for (const r of result.records) expect(r.cache_read_tokens >= 0)`，为弱但无害；真正的透传证据在 `records.some(cache>0)`。
- AC 复验方式：
  - AC-001 `re_verified`：`agentBadgeLabel("codex")==="Codex"` 及四既有文案用例实际运行绿（SessionTable.test.tsx 5 tests pass），生产组件调用点查证。
  - AC-002 `re_verified`：records/buckets/rollup 三段独立测试实际运行绿（chart-data.test.ts 68 tests pass），chart-data 三套 labels 与顺序数组均含 codex，断言值（150/150/105）与生产 `agent_segments` 求和核对一致。
  - AC-003 `re_verified`：palette.test 新增 codex 断言绿、fallback map toEqual 含 codex；codex_panels_wiring 断言 `var(--color-agent-codex)`；`slots.ts:167-178` AGENT_COLOR_VAR 含 codex、未知回退 primary 保留。
  - AC-004 `re_verified`：集成测试实际运行绿（server.test.ts 95 tests pass），HTTP 返回 codex 行且 cache_read_tokens=5 字段不丢；「过滤排除」分支未触发见 f002。
  - AC-005 `re_verified`：重复 total fixture 单测实际运行绿，`tokens===2500` 精确断言与去重差分生产逻辑核对一致；旧实现（重复计全量=3500）会红。
  - AC-006 `re_verified`（部分）：cache>0 透传断言有判别力（旧实现 cache 恒 0 会红）；但 input 归一不变量断言无判别力，见 f001。
  - coverage = 6 / 6
- 总体判断：AC-006 归一不变量存在无判别力断言（important），需修正；余为 minor。当前有未解决 important，FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-09-04 20:30 UTC+8)

reviewed_scope: c4c00ae78589b579

### 前轮 finding 复核

- **t448_test_f001（important）已修**：弱断言 `expect(input + cache_read + output).toBeLessThanOrEqual(2000 + cache_read)` 已从 `codex-reader.test.ts` 移除，替换为 AC-006 测试（:221-258）内的两条独立强断言——`expect(panel_total).toBe(2000)`（:248）与 `expect(input).toBe(300)`（:249）。判别力经逐事件推演验证：fixture 为 total 1000→2000、cached 800→1500；当前实现（cache 独立差分 + input 扣 cache 归一）下 input 增量 = (900−800)+(900−700)=300、cache 增量 = 800+700=1500、output = 100+100=200，panel_total 恰为 2000。任一回归均红：归一缺失时 input=1800 → panel_total=3500≠2000；cache 不透传时 cache_read=0 → panel_total=500≠2000。该测试已实际运行绿（codex-reader.test.ts 7 tests pass），且注释（:244-246）说明了总账语义，非「把旧预期改成新输出」。
- **t448_test_f002（minor）已修**：AC-004 测试（server.test.ts:1397-1455）在 upsert 中补入一条 `agent: "claude-code"` 记录，断言 `agent=codex` 查询结果 `toHaveLength(1)` 且仅 codex 行。生产 `query_records` 含 `agent = @agent` 精确过滤（token-stats-store.ts:1530），若服务端忽略 agent 参数透传全表则返回 2 行致红——排除分支现被真实触发。集成测试实际运行绿（server.test.ts 95 tests 中该例通过）。

### 本轮新发现

0 条。

### 改测方向复核

修复仅强化断言与补测试数据，方向为「断言应有的预期」，无「迁就实现」改测。

### AC 复验方式

- AC-005 `re_verified`：codex-reader.test.ts:190-219 实际运行绿；推演 e2 重复 total 归零增量后 input+output=2500 精确，旧实现 3500 红。
- AC-006 `re_verified`：见 f001 复核逐事件推演，panel_total=2000 与 input=300 均精确成立且判别。
- AC-004 `re_verified`：server.test.ts 该例实际运行绿，排除分支经 store agent 过滤实证。
- AC-001/AC-002/AC-003 `re_verified`：本轮重跑 SessionTable/chart-data/palette/codex_panels_wiring 四个文件 86 tests 全绿（无改动，沿用 Round 1 结论）。
- coverage = 6 / 6

### 未进表提示

- 无（AC-005 的 `toBeLessThan(4500)` 与精确 `toBe(2500)` 并存，冗余但非弱化）。

- 总体判断：Round 1 两条 finding 均已修复且判别力实证；本轮无新增 blocker。PASS。
- 系统性 follow-up：无

verdict: PASS
