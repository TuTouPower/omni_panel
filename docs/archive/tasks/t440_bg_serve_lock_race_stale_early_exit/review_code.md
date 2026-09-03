# Task review t440（reviewer_focus: 代码）

- task：`t440_bg_serve_lock_race_stale_early_exit`
- spec：`docs/tasks/t440_bg_serve_lock_race_stale_early_exit/spec.md`
- diff_anchor：`a39420f94a1f9698374b08896a2e70ab33326ae4`
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t440' diff a39420f94a1f9698374b08896a2e70ab33326ae4`
- round：1
- reviewed_at：2026-09-04 00:34 UTC+8

reviewed_scope: 7ffdbd5f85e9f888

## Findings

无。7 视角已逐一扫描（规格合规 / 代码质量与圈复杂度 / 实现正确性 / 安全 / 契约与类型 / 性能与资源 / 健壮性与可观测），未命中任何达到 Pre-Report Gate 的可辩护 finding。实现与 spec 契约区 AC-001~004 逐条吻合，单元测试实际运行通过。

## 结论

### AC 复验方式

- AC-001：`re_verified`。`pnpm vitest run tests/unit/main/cli/background_serve.test.ts` 6 例全绿；「非0退出→exited」用例断言 `exitCode:3` → `{kind:"exited",code:3}`。`background_serve.ts:139-145` 保留原诊断文案 + serve 日志路径 + `process.exit(code)`（原错误码透传路径未改）。
- AC-002：`re_verified`。用例断言 `exitCode:0` → `{kind:"exited_code0"}`（修复点：不再把 code0 当启动中）。`background_serve.ts:146-153` 新分支 `closeSync(log_fd)` + stderr 含日志路径 + `process.exit(1)` 非 0 退出。exit(1)/stderr 文本为同步立即调用，以代码读证复验，未做真实锁冲突 e2e。
- AC-003：`re_verified`。`background_serve.ts:149-150` 诊断文本含「单实例锁冲突」「另一实例正在启动或关闭」「若刚执行过 quit 请稍候重试」，与 spec 措辞语义等价；该分支在 code0 早退时立即命中，不再表现为「等待 serve 启动超时」空等 15s。
- AC-004：`re_verified`。用例断言存活 + cli.json pid 匹配 → `{kind:"ready",url,port}`；`background_serve.ts:154-164` ready 分支打印 URL、`child.unref()`、`process.exit(0)`，与改动前逐行等价（原内联 `info.url && info.pid===child.pid` 判定被等价迁移进纯函数）。

coverage = 4 / 4

### 总体判断

- 规格合规：改动面严格收敛于 `src/main/cli/background_serve.ts` 一处生产文件 + 新增单测，符合「非范围」约束（未动锁策略、foreground/GUI/瘦客户端、`index.ts`）。超时路径（子进程存活 15s 未写 cli.json → 保留 kill + 原超时报文）原样保留，满足 spec「风险与回退」中「不缩短存活子进程等待时间」的约束。
- 正确性：`classify_poll_result` 判定顺序固定为退出优先于 cli.json，正是修复核心——code0 早退不再被误判为继续等待。ready 需 `pid===childPid` 保证旧实例残留 cli.json 不误判成功（测试第 5 例覆盖）。`child.pid ?? 0` 兜底 spawn error 前 pid 为空的情形，不会误匹配真实 OS pid。
- 边界扫描：子进程恰在 deadline 边界（末次轮询后、退出 while 前）code0 退出且父进程未观测到，会落入原超时报文而非锁冲突诊断——这是 ~200ms 极端窗且属既有超时语义边界，spec 风险节也明言保持现超时路径，不构成 AC 差距，未出 finding。
- 未进表的提示：无文件过大（`background_serve.ts` 174 行、测试 51 行，均远低于阈值）；`classify_poll_result` CC≈3，轮询父函数 CC≈9，均 <10，无复杂度提示。
- 范围外观察：无。

### 系统性 follow-up

无。spec 上下文区已确认 p209 受控复现、未知契约已清空，无需新建 task。

verdict: PASS

## Round 2 (2026-09-04 00:40 UTC+8)

Round 1 code review = 0 finding、PASS。此后处置动作为抽 `build_early_exit_msg` 纯函数（`src/main/cli/background_serve.ts:43-55`）+ 把 AC-001/003 诊断文案移入单测断言，对应 task.md 处置表 t440_test_f001 的「已修」。本复核聚焦该抽取是否引入行为回归，以及父进程接线是否与抽取后函数正确衔接。

reviewed_scope: de5f4918b65a8f80

## Findings

### t440_code_f001 - build_early_exit_msg 的 exitCode 参数 optional，且仅在 kind="exited" 分支消费，kind 与参数未绑定

- 严重度：minor
- 锚点：契约·类型（签名把 kind 特定所需的退出码设为可省，编译器不阻止缺参）
- 位置：`src/main/cli/background_serve.ts:47`（`exitCode?: number`），`src/main/cli/background_serve.ts:48-53`（code0 分支不读该参数）、`:54`（exited 分支拼接 `code=${String(exitCode)}`）
- 问题：签名允许 `build_early_exit_msg("exited", log_path)` 缺省退出码——非0分支会输出字面量 `code=undefined`，退出码在诊断文案层丢失，且 TS 不报错。code0 分支则完全不读该参数。当前两处调用点（`:156` 传 `outcome.code`、`:161` 不传）均正确，故无现存可观测缺陷；风险在函数为 export 的公共接口，未来维护者按可选签名误用时不具防御。属把「kind 特有必传参」建模成全局 optional 的类型契约不严密。
- 建议：最小收紧为把 kind 与参数绑定——抽两条函数（如 `early_exit_msg(code: number, log_path: string)` 与 `lock_conflict_msg(log_path: string)`），或在保留单函数前提下以判别联合做重载使 `kind: "exited"` 时 `exitCode: number` 必传。二者皆让缺参在编译期失败。

## 结论

- 前轮 finding 复核（code 侧）：Round 1 code = 0 finding，无 blocker 需复核。处置引入的生产改动仅 `build_early_exit_msg` 抽取 + `run_background_serve_parent` 两处接线改为调用它（`background_serve.ts:154-163`）。逐项核：
  - 非0 早退文案抽取前后逐字等价：内联原句 `serve 进程提前退出（code=${String(child.exitCode)}）；日志：\n  ${log_path}\n`（diff 删除段）→ 函数 `code=${String(exitCode)}`（`:54`），调用传 `outcome.code`（由 classify 从 `child.exitCode` 透传，`:34`）。退出码从子进程 → classify → build → `process.exit(outcome.code)`（`:157`）全程无丢失，AC-001 原错误码透传路径未改。
  - code0 分支接线：`build_early_exit_msg("exited_code0", log_path)`（`:161`）输出锁冲突诊断 + 日志路径，随后 `process.exit(1)`（`:162`），与 AC-002/003 措辞语义等价；文案含「另一实例正在启动或关闭」「若刚执行过 quit 请稍候重试」「日志」三要素。
  - ready 分支（`:164-174`）从原内联 `cliInfo.url && cliInfo.pid===child.pid` 判定迁移为 classify 返回 ready（`:36-38` 内部等价判定），stdout URL、stderr pid/port/停止提示、`child.unref()`、`closeSync(log_fd)`、`exit(0)` 与改动前逐行等价；stop 文案 port 改用 `outcome.port`（=原 `info.port`）。无回归。
  - 循环体顺序变化：原先查非0退出再 parse cli.json，现先 `parse_cli_json` 再 classify（`:148-153`）。语义等价——classify 仍退出优先，parse 失败 `cliInfo:null` 不干扰退出判定；多一次文件读在 200ms 轮询内可忽略。
  - `child.pid ?? 0` 兜底：classify 需 `cliInfo.pid === childPid` 才 ready，故 ready 分支执行时 `child.pid` 必非 null，`:167` `String(child.pid)` 安全，无新增空值路径。
- 本轮新发现：1 条（f001，minor，非 blocking）。
- 未进表的提示：无文件过大（`background_serve.ts` 185 行、测试 84 行，远低于阈值）；`build_early_exit_msg` CC≈2、`classify_poll_result` CC≈3、轮询父函数 CC≈9，均 <10 无复杂度提示。
- 总体判断：处置新增的纯函数抽取正确、与父进程接线无误，非0/超时原路径无行为回归，code0 新分支按 spec 落位；仅 1 条 minor（参数建模收紧建议），不阻断。测试实跑 9 passed。
- AC 复验方式：
  - AC-001：`re_verified`。单测断言 `{exitCode:3}`→`{kind:"exited",code:3}` 且文案含 `code=3`；diff 核非0接线 `exit(outcome.code)` 透传未改。
  - AC-002：`re_verified`（判定层 + 接线读证）。单测断言 code0→`exited_code0`；接线 `exit(1)` 非0 + stderr 文案含日志路径（`build_early_exit_msg` 内 `log_path` 拼接，`:51`）。进程级真实锁冲突行为沿用 test reviewer 登记的 e2e follow-up 豁免。
  - AC-003：`re_verified`。诊断文案已抽为纯函数并被单测断言（`build_early_exit_msg` describe 两条用例 toContain「单实例锁冲突」「启动即退出」「稍候重试」与日志路径）——较 Round 1 该 AC 从 `trust_prior`（文案仅代码读证）升为可直接复验。
  - AC-004：`re_verified`。单测断言 pid+url 匹配→ready 携 url/port；接线打印 URL、`exit(0)` 逐字等价读证。
  - coverage = 4 / 4
- 系统性 follow-up：无（code 侧无新缺口；进程级 e2e 建议已由 test reviewer 以 slug `bg_serve_lock_e2e_build` 登记，非阻断）。

verdict: PASS

## Round 3 (2026-09-04 00:45 UTC+8)

Round 2 code review = 1 minor（t440_code_f001）。本复核聚焦 f001 修复（`build_early_exit_msg` 参数签名改判别联合重载）是否真修、接线/文案是否逐字正确、有无引入回归。

reviewed_scope: a5a75de945bd61b9

## Findings

无。

## 结论

- 前轮 finding 复核（code 侧）：
  - **t440_code_f001 已正确消除**。签名现为 `build_early_exit_msg(msg: { kind: "exited_code0" } | { kind: "exited"; code: number }, log_path: string): string`（`src/main/cli/background_serve.ts:43`）——判别联合下 `kind:"exited"` 必带 `code: number`，缺参在编译期报错，不再可能输出字面量 `code=undefined`；`kind:"exited_code0"` 分支类型无 `code` 字段，调用侧也无法误传。Round 2 建议的两种最小方案中选用了判别联合重载，收紧到位。
  - 接线核对：`:153` exited 分支传 `{ kind: "exited", code: outcome.code }`、`:159` exited_code0 分支传 `{ kind: "exited_code0" }`，均与联合精确匹配；exited 必带 `code` 满足。`process.exit(outcome.code)`（`:155`）错误码透传、`process.exit(1)`（`:160`）code0 非0退出，与 Round 2 一致，无回归。
  - 文案逐字核对：code0 分支含「启动即退出（code=0）」「单实例锁冲突——另一实例正在启动或关闭」「若刚执行过 quit 请稍候重试」「日志：\n path」四要素（`:45-48`）；非0 分支含「提前退出（code=${code}）」「日志：\n path」（`:50`）。与 Round 1/2 复核时逐字等价，spec AC-001/002/003 措辞语义吻合。
  - grep 全仓确认两 helper 导出仅被父进程 `:145/:153/:159` 与单测引用，无旁路调用点漏接线；改动面仍收敛于 `background_serve.ts` 生产文件 + 新增单测 + task.md（`git status` 三文件，无范围外扩散）。
- 本轮新发现：0 条。
- 未进表的提示：无文件过大（`background_serve.ts` 183 行、测试 84 行，远低于阈值）；`build_early_exit_msg` CC≈2、`classify_poll_result` CC≈3、轮询父函数 CC≈9，均 <10 无复杂度提示。范围外观察：无。
- 总体判断：f001 修复正确、彻底，判别联合使 kind 与必传参编译期绑定，杜绝缺参输出 `code=undefined`；接线与文案无回归，实跑 9 例单测全绿。无未解决 blocker。
- AC 复验方式：
  - AC-001：`re_verified`。`node_modules/.bin/vitest run tests/unit/main/cli/background_serve.test.ts` 9 例全绿，其中 `{exitCode:3}→{kind:"exited",code:3}`；接线 `process.exit(outcome.code)` 透传读证。
  - AC-002：`re_verified`（判定层 + 接线读证）。单测 code0→`exited_code0`；接线 `exit(1)` 非0 + stderr 文案含日志路径。
  - AC-003：`re_verified`。`build_early_exit_msg` 单测 toContain「单实例锁冲突」「另一实例正在启动或关闭」「若刚执行过 quit 请稍候重试」「启动即退出」四要素（test:70-76），文案逐字锚定。
  - AC-004：`re_verified`。单测 pid+url 匹配→ready 携 url/port；接线打印 URL、`exit(0)` 读证无回归。
  - coverage = 4 / 4
- 系统性 follow-up：无。

verdict: PASS

## Round 4 (2026-09-04 00:50 UTC+8)

Round 3 code review = 0 finding、PASS。此后 R3 结论 0 finding，仅两处机械修复：① eslint --fix（prefer-optional-chain）把 `classify_poll_result` 内 `cliInfo != null && cliInfo.pid === childPid && cliInfo.url` 收为 `cliInfo?.pid === childPid && cliInfo.url`；② prettier 把 `build_early_exit_msg` 判别联合签名单行多行化（`src/main/cli/background_serve.ts:43-46`）。本复核只确认这两处无逻辑回归、类型/语义仍正确。行数佐证改动面：R3 记 `background_serve.ts` 183 行 → 现值 185 行，+2~3 恰为 prettier 签名拆 4 行所致；eslint 改写同处原行无增减；测试文件 84 行未变。

reviewed_scope: 2f89e4afa4b00eee

## Findings

无。逐项核两处改动（见结论），未命中达 Pre-Report Gate 的可辩护 finding。

## 结论

- 前轮 finding 复核（code 侧）：
  - **t440_code_f001（R2 minor，R3 已消除）不受本轮影响，closure 成立**。f001 修复点判别联合 `build_early_exit_msg(msg: { kind: "exited_code0" } | { kind: "exited"; code: number }, log_path)`（`:43`）仅被 prettier 多行化排版，联合类型与必带 `code` 约束逐字未改；`exited`/`exited_code0` 两调用点（`:153`/`:160`）不变，缺参仍编译期报错。prettier 为纯排版，不触碰 f001 论证的任何语义。
  - **改动① optional chain 语义等价核**。原 C1 = `cliInfo != null && cliInfo.pid === childPid && cliInfo.url` → 现 C2 = `cliInfo?.pid === childPid && cliInfo.url`（`:36`）。逐输入比对：cliInfo 为 null 时 C1 短路 false、C2 得 `undefined === childPid` 亦 false（childPid 恒为 number：来自 `child.pid ?? 0`，`:150`，不可能是 undefined）→ 两者皆回落 `continue`，**null 情形不误判 ready，正确 continue**；cliInfo 非 null 且 `pid === childPid` 时两者同 true，url 真值门（`&& cliInfo.url`）两者一致保留；pid 缺省或不等时两者同 false → continue。prefer-optional-chain 收 `!= null`（同时排除 null/undefined）为 `?.` 短路，判定结果完全一致。单测锚定：`:48` null-cliInfo→continue、`:54` 旧 pid 残留→continue、`:60` 无 pid→continue、`:27` code0 退出优先于 pid 匹配仍判 exited_code0，全绿。
  - **改动① TS 收窄安全核**。ready 分支返回体 `{ kind:"ready", url: cliInfo.url, port: cliInfo.port }`（`:37`）：`PollOutcome.ready` 的 `url: string` 为必填，需 `cliInfo.url`（类型 `string | undefined`）收窄为 `string`、且 cliInfo 本身收窄为非 null 才能通过 `strictNullChecks` + `exactOptionalPropertyTypes`。实跑 `pnpm exec tsc --noEmit` exit 0，编译器级确认 C2 真值分支下 cliInfo 非 null、`cliInfo.url` 收窄为 string——即 `?.` + 真值 `&&` 的组合收窄依然成立，无空值穿透。
  - **改动② prettier 纯排版**：`build_early_exit_msg` 签名由单行折为 `:43-46` 四行，token 与类型逐字等价；函数体、两分支文案、`run_background_serve_parent` 接线均未动。非0 分支 `code=${String(msg.code)}`（`:53`）、code0 文案（`:47-51`）与 R3 逐字一致。
  - 回归扫描：`classify_poll_result` / `build_early_exit_msg` 两 helper 调用点仍仅父进程 `:148-163` 与单测（`git diff a39420f9` 三文件：task.md + background_serve.ts + 新增单测；工作树无其它生产改动），无旁路漏接线。
- 本轮新发现：0 条。
- 未进表的提示：无文件过大（`background_serve.ts` 185 行、测试 84 行，远低于阈值）；`classify_poll_result` CC≈3、`build_early_exit_msg` CC≈2，均 <10 无复杂度提示。范围外观察：无。
- 总体判断：两处机械修复无逻辑回归——optional chain 改写后 cliInfo null 正确回落 continue、ready 分支 TS 收窄由编译器证实安全，prettier 签名多行化为纯排版；R3 全部结论不失效。实跑 `pnpm exec tsc --noEmit` exit 0、9 例单测全绿。无未解决 blocker。
- AC 复验方式：
  - AC-001：`re_verified`。非0 分支 `:34` 与接线 `:153-158` 本轮未触，单测 `{exitCode:3}→{kind:"exited",code:3}` 仍绿。
  - AC-002：`re_verified`（判定层 + 接线读证）。code0 分支 `:35`/`:160-163` 未触，单测 code0→exited_code0 仍绿；`exit(1)` 非0 + stderr 含日志路径读证。
  - AC-003：`re_verified`。`build_early_exit_msg` 文案本轮仅排版，`toContain` 四要素断言（test:70-76）实跑通过。
  - AC-004：`re_verified`。ready 分支收窄安全由 `tsc --noEmit` exit 0（strictNullChecks/exactOptionalPropertyTypes/noUncheckedIndexedAccess）证实；单测 pid+url 匹配→ready 仍绿。
  - coverage = 4 / 4
- 系统性 follow-up：无。

verdict: PASS
