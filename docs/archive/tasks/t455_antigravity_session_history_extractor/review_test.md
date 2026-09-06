# Task review t455（reviewer_focus: 测试）

- task：`t455_antigravity_session_history_extractor`
- spec：`docs/tasks/t455_antigravity_session_history_extractor/spec.md`
- diff_anchor：`284914af9dec4051c88d142ebe9a03903ce10f61`
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t455' diff 284914af9dec4051c88d142ebe9a03903ce10f61`
- round：1
- reviewed_at：2026-09-06 08:02 UTC+8

## Round 1 (2026-09-06 08:02 UTC+8)

reviewed_scope: 48e99f34c52e9e7c

落点校验：不带 `-C` 的 `git rev-parse --show-toplevel`（工作目录 `/home/testuser/testuser_ubuntu/omni_panel_t455`）输出去空白后精确等于 `/home/testuser/testuser_ubuntu/omni_panel_t455`，通过。

diff 审查范围：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t455' diff 284914af9dec4051c88d142ebe9a03903ce10f61`，测试改动仅新增一个文件 `tests/unit/main/core/session-history/antigravity-extractor.test.ts`（5 个 it），无既有测试修改/删除。`spec.md` 上下文区「未知契约清单」已无 `UNVERIFIED-BLOCKING` / `UNVERIFIED-SPIKE` / 裸 `UNVERIFIED`（两项均标已验证），门禁项通过。

### 测试可信核查

- 测的是 AC 而非 mock：5 个测试直调生产实现 `extract_antigravity` / `extract_antigravity_incremental` / `extract_antigravity_first_user` / `resolve_session_file`，断言经真实 `better-sqlite3` 落盘 fixture 读出的 role/text/timestamp/id。零 mock，无 mock 边界问题。
- 断言用户可观察：断言 role/文本/毫秒时间戳/id 命名空间/定位命中与 null，均属调用方可观察行为，非内部状态。
- 异步时序：全同步代码与测试，无 race / 漏 await / timeout。
- 测试内 protobuf 编码（`varint`/`len_field`/`user_step` 等）是 fixture 构造器（编码侧），生产实现是解码侧（`walk_fields`），非平行实现冒充覆盖；符合上下文区「fixture 脱敏自建」测试策略。
- `if (first.cursor === null) throw` 为 `expect(first.cursor).not.toBeNull()` 后的 TS 收窄守卫，非条件跳过式弱化断言；`found?.` 可选链断言在 null 时必然失败（`undefined` ≠ 期望值），无静默通过路径。

### 危险模式扫描（逐条调查结论）

- 恒真断言：无（全为 `toEqual`/`toBe` 具体值比较）。
- 删除/反转 expect、注释掉断言：无（新文件，无既有断言改动）。
- 弱化断言：无。`expect(found?.file_path.endsWith(...)).toBe(true)` 中 `endsWith` 作用于具体文件名后缀断言，null 时失败而非通过，不构成弱化；其余均为 `toEqual` 精确比较（含时间戳 `TS*1000` 精确值与 id 精确值）。
- 删测试：无（仅新增；`--name-status` 确认测试文件仅此一新增）。
- 跳过/独占：无（无 `.skip`/`.only`/`skipIf`）。
- 静默错误：无（无 `eslint-disable`/`ts-ignore`/`type: ignore`）。
- mock 误用：无（零 mock）。
- 阈值掩盖：无（无 timeout/重试/容差）。
- 条件跳过弱化断言：无（见上段守卫分析）。
- 程序赋值替代真实交互：不适用（非 UI task，无 `.fill()`/`.value`）。
- 存在即通过：无（无裸 `toBeVisible`/`toBeDefined` 当 AC 证据；`not.toBeNull` 后均跟进具体值断言）。

### AC 覆盖核对

- AC-001（索引命中解析到 `conversations/<id>.db`，`extractor_kind` 为 antigravity）：`AC-001/AC-004` 测试命中路径断言 `extractor_kind`、`file_path` 后缀。覆盖。
- AC-002（全量含用户首条文本，全部 `timestamp` 非空）：`AC-002` 测试精确断言 roles/texts/timestamps/ids（含首条 `"hello antigravity"` 与秒→毫秒换算）。覆盖。
- AC-003（增量同 id 命名空间，游标续读不丢不重）：`AC-003` 测试全量后追加 step，断言增量仅返回新增且 id 为 `antigravity:3`。覆盖。
- AC-004（不存在 id 返回 null 不抛错）：`AC-001/AC-004` 测试对未知 id 断言 `toBeNull`（同步调用无抛即不抛错）。覆盖。
- AC-005（tool 输出与 system notice 行过滤）：`AC-005` 测试断言 tool 文本不在结果中；生产实现按 `step_type` 白名单（仅 14/15 成消息，8/132 一律丢弃），tool 用例即覆盖该白名单分支。覆盖。
- 有意不测两项（索引缺行回退性能、macOS/Windows 目录形态）未据此出 finding；fixture 仅 linux 与策略一致。
- 改测方向复核：无（无既有测试改动，无「迁就实现」改测）。

只读验证：`npx vitest run tests/unit/main/core/session-history/antigravity-extractor.test.ts` → 5 passed。

## Findings

无。

## 结论

- 改测方向复核：无
- 本轮新发现：0 条
- 未进表的提示：可选扩展（非阻断，均不进 finding 表）：(1) 可加一个 `step_type=132`/field140 行验证 system notice 与 tool 共用白名单分支被滤除；(2) 可加一个索引缺行但文件存在的 locator 用例，命中回退扫目录成功路径（当前命中/未命中两端已覆盖，该中间路径属同一 `resolve_antigravity` 逻辑）；(3) `first_user` 空库返回 `""` 与游标类型不匹配退化全量属防御分支，无 AC 要求，按需补充。
- 总体判断：新增 5 测试全部直触生产实现、精确断言 5 条 AC 对应行为，危险模式零命中，只读重跑 5/5 通过。
- 系统性 follow-up：无
- AC 复验方式：
    - AC-001：re_verified（复跑测试中 locator 命中断言通过，且查验 `resolve_antigravity` 索引优先+回退扫实现存在）。
    - AC-002：re_verified（复跑测试中 roles/texts/timestamps/ids 精确断言通过）。
    - AC-003：re_verified（复跑测试中增量仅返回 `antigravity:3` 断言通过）。
    - AC-004：re_verified（复跑测试中未知 id `toBeNull` 断言通过）。
    - AC-005：re_verified（复跑测试中 tool 文本被滤除断言通过，且查验 `row_to_message` 非 14/15 一律返回 null）。
    - coverage = 5 / 5。

verdict: PASS
