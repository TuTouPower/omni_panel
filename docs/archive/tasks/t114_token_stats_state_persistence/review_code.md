# Task review t114（reviewer_focus: 代码）

- task：`t114_token_stats_state_persistence`
- spec：`docs/tasks/t114_token_stats_state_persistence/spec.md`
- diff_anchor：`095ac2230fc27f9668dacdfeec079c01864cf6a2`
- target：`git diff 095ac2230fc27f9668dacdfeec079c01864cf6a2`
- round：2
- reviewed_at：2026-07-26 15:20 UTC+8

## Findings

### t114_code_f001 - mtime Math.round 破坏 reader 严格相等比较，重启后仍然全量重扫

- 严重度：critical
- 位置：`src/main/core/token-stats/collector.ts:115-117`、`src/main/core/token-stats/collector.ts:123`；与 `src/main/core/token-stats/claude-reader.ts:580,583` / `src/main/core/token-stats/kimi-reader.ts:396,399` 不一致
- 问题：
    - 序列化路径把 mtime 经 `round_mtime`（`Math.round(ms)`，`collector.ts:115-117`）写成整数；反序列化时 `deserialize_bucket` 直接 `mtimes.set(file, mtime)`（`collector.ts:146-148`）保留整数。
    - reader 的命中判断是严格相等：`new_state.mtimes.set(file, stat.mtimeMs)`（`claude-reader.ts:580`，`kimi-reader.ts:396`）写入的是 **未取整的浮点 mtimeMs**；比较用 `prev.mtimes.get(file) === stat.mtimeMs`（`claude-reader.ts:583`，`kimi-reader.ts:399`）。
    - 重启后 `prev.mtimes` 来自反序列化（整数），`stat.mtimeMs` 仍是浮点。两者不等 → 走「changed file」分支 → 重解析该文件、重新产出 records。**所有持久化过的文件** 都会触发，等价于全量重扫一次。
    - 实测（Windows NTFS）：`fs.statSync(f).mtimeMs` = `1785000286795.3518`，`Math.round` 后 = `1785000286795`；`1785000286795 === 1785000286795.3518` → `false`。
    - spec 核心验收标准 #1「collector 重启后不再全量重扫，仅扫 mtime 变化文件」完全失效。task.md 中「mtime Math.round（避免 JSON number 浮点精度导致全量误判）」的理由不成立：JSON 序列化 JS number（IEEE-754 double）round-trip 无损，反而是 `Math.round` 主动引入了精度丢失。
- 建议（最小修复方向，二选一，留给 implementer 决策）：
    1. 删除 `round_mtime`，序列化时直接写 `mtime`（浮点）。JSON round-trip 无损，与 reader 严格相等一致。
    2. 若坚持整数存储，需同时改 reader：写入 `new_state.mtimes` 时 `Math.round(stat.mtimeMs)`、比较时同样 `Math.round(stat.mtimeMs)`。注意 `claude-reader.ts` / `kimi-reader.ts` 属于 spec 非范围（「不改 reader 解析逻辑与 offset 模型」），方案 2 需要扩范围并评估对其他 task 的影响。
    - 推荐方案 1（最小入侵，纯 collector 内修复）。

### t114_code_f002 - deserialize_bucket 返回类型强转 SessionScanState，但被复用于 kimi_states

- 严重度：minor
- 位置：`src/main/core/token-stats/collector.ts:144-165`，调用点 `collector.ts:235`
- 问题：
    - `deserialize_bucket` 末尾 `return { mtimes, files } as unknown as SessionScanState;`（`collector.ts:164`）。内部 `files` 的 `facts` 类型是 `Record<string, unknown>`，与 `SessionFileFacts` / `KimiFileFacts` 的字段形状都不一致。
    - `load_state` 把同一函数的返回值同时塞进 `jsonl_states`（期望 `SessionScanState`）和 `kimi_states`（期望 `KimiScanState`，`collector.ts:234-238`）。两种 `FileFacts` 字段不同（`SessionFileFacts` 有 `directory` / `session_id`，`KimiFileFacts` 没有），但被同一个强转覆盖。
    - 运行时不报错（reader 仅按字段名读取），但绕过了类型层的保障；若未来 reader 给 `SessionFileFacts` 加必填字段，反序列化路径不会产生类型错误。
- 建议：`deserialize_bucket` 改为泛型 `deserialize_bucket<T>(bucket: SerializedScanBucket): T`，或拆出 `deserialize_session_bucket` / `deserialize_kimi_bucket`，让调用点显式指定目标类型。

### t114_code_f003 - collector.ts 已超实现源码 400 行阈值且本 task 仍堆大

- 严重度：minor
- 位置：`src/main/core/token-stats/collector.ts`（514 行，本 task 净增 +170）
- 问题：本 task 把序列化/反序列化、`load_state`（含 4 个字段并行还原 + try/catch）、`save_state` 全部内联到 `collector.ts`。文件已从 ~344 行增至 514 行，超 400 阈值。`SerializedScanState` / `SerializedScanBucket` / 序列化对偶是一组内聚概念，独立成 `collector-state.ts`（或 `scan-state-serde.ts`）后，`collector.ts` 只保留 `load_state` / `save_state` 调用，体积回到阈值内。
- 建议：把 `SerializedScanState` / `SerializedScanBucket` / `round_mtime` / `serialize_bucket` / `deserialize_bucket` / `serialize_state` 抽到 `src/main/core/token-stats/scan-state-serde.ts`，`load_state` / `save_state` 留在 `collector.ts`（依赖模块级 state Map）。`serialize_state` 仍可 re-export 供测试。

## 结论

- 前轮 finding 复核（Round 2 才写）：本轮为 Round 1。
- 本轮新发现：3 条（1 critical，2 minor）。
- 总体判断：序列化/反序列化、损坏回退、async configure + fire-and-forget save 的整体结构正确；但核心不变量「序列化 mtime 与 reader 比较 mtime 一致」被 `Math.round` 破坏，重启后无法实现 spec 唯一价值「不全量重扫」，必须修复。

verdict: FAIL

## Round 2 (2026-07-26 15:20 UTC+8)

### 前轮 finding 复核

- **t114_code_f001（critical，声称已修）— 真修**。`src` 全局 grep `round_mtime|Math\.round.*mtime|Math\.round.*Ms` 无匹配；`serialize_bucket`（`collector.ts:121`）`for (const [file, mtime] of state.mtimes) mtimes[file] = mtime;` 直接写浮点，`deserialize_bucket`（`collector.ts:148`）`mtimes.set(file, mtime)` 直接回填，全程无精度损失。注释（`collector.ts:119-120`）明确「mtimeMs preserved as float ... rounding would mark every file dirty」。reader 比较点未变（`claude-reader.ts:583`、`kimi-reader.ts:399` 仍 `prev.mtimes.get(file) === stat.mtimeMs`），serialize/deserialize 与 reader 严格 `===` 链路一致。测试 `serialize_state keeps float mtime for strict equality round-trip`（`collector-state.test.ts:132-143`）用浮点值 `1785000286795.3518` 验证。AC1（不全量重扫）不变量恢复。
- **t114_code_f002（minor，声称已修）— 真修**。`deserialize_bucket`（`collector.ts:142-166`）返回通用结构 `{ mtimes: Map<string, number>; files: Map<string, { session_id: string; facts: unknown }> }`，移除了原 `as unknown as SessionScanState` 内部强转。调用点（`collector.ts:234, 239`）显式承担类型风险：`jsonl_states.set(k, deserialize_bucket(bucket) as unknown as SessionScanState)` 与 `kimi_states.set(k, deserialize_bucket(bucket) as unknown as KimiScanState)`，`unknown` 中间隔层符合 TS 推荐 cast 模式。JSON 反序列化无法精确推断 `SessionFileFacts` / `KimiFileFacts` 字段形状，由调用点显式标注目标类型是当前实现的合理选择。
- **t114_code_f003（minor，遗留）— 合理**。`wc -l src/main/core/token-stats/collector.ts` = 517 行，超实现源码 400 minor 阈值（未到 800 important）。t114 spec 范围明确「改 collector.ts」单文件，未规划 `scan-state-serde.ts`。抽离需移动 `SerializedScanState` / `SerializedScanBucket` / `serialize_bucket` / `deserialize_bucket` / `serialize_state` 并改 collector + 测试 import，属跨文件重构，符合 CLAUDE.md「精准修改」原则下延后到独立 task 的判定。非本 task 范围，不阻塞。

### 本轮新发现

0 条。

逐项核查未命中新 finding：

- **AC 覆盖**：AC1 由 f001 修复后达成；AC2 损坏回退 `load_state`（`collector.ts:195-249`）双层 try/catch（readFile ENOENT 静默 / JSON.parse 失败 warn 后 return / deserialize 异常 clear + warn），失败时 maps 已先 clear（`collector.ts:206-209`）保证回退空状态；AC3 records 丢弃（`collector.ts:129`）+ 恢复为 `[]`（`collector.ts:154`），mtime 未变时 reader 复用 old entry（`claude-reader.ts:584-587`、`kimi-reader.ts:400-403`）不重发；AC4 `pnpm typecheck` 仅 4 个 pre-existing 错误（t111/t112 遗留，本 task 改动文件 0 错误），ESLint 改动文件 0 错误。
- **不偏航 / 不自由发挥**：diff 范围 = `collector.ts` + `paths.ts`（新增 `getTokenStatsStatePath`）+ `types.ts`（`state_path` 字段）+ `index.ts`（注入）+ 测试。`state_path: z.string().default("")` 可选字段、`writeJsonAtomic` 复用既有原子写（与 vault / usage.db 同基础设施），均未超出 spec 技术决策。
- **不变量**：mtime 浮点一致性（f001 修复）；save 失败不污染下一轮（catch 内 warn，不影响 in-memory state）。
- **DRY / 控制流 / 错误处理 / 边界**：serialize/deserialize 对偶无重复逻辑；`load_state` 圈复杂度手算 ≈ 9（未达 10 minor 阈值，且无本 task 新增分支堆叠）；`if (!state_path) return` 双侧守，`typeof parsed !== "object" || parsed === null` 防 null，`typeof v.offset === "number" && typeof v.size === "number"` / `typeof v === "number"` 字段校验完整。
- **并发时序**：`void save_state(state_path)` fire-and-forget，下轮 collect 可能在前轮 save 完成前启动；但 `writeJsonAtomic` tmp + rename 原子写，最坏情况为后写者覆盖（更新快照赢），不损坏文件。`poll_interval_ms` 默认 600s，save 通常 ms 级，并发概率低。非 critical。
- **资源泄漏**：`writeJsonAtomic` 内 `open` / `handle.sync()` / `handle.close()` 在 finally 释放，无泄漏。

### 结论

- 前轮 finding：3 条（f001 真修 / f002 真修 / f003 遗留合理）。
- 本轮新发现：0 条。
- 总体判断：序列化 mtime 浮点 round-trip 与 reader 严格 `===` 一致，核心不变量恢复；deserialize cast 下放到调用点合理；f003 文件膨胀遗留有据。代码轴本轮可放行。

verdict: PASS
