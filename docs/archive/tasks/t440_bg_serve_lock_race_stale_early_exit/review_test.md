# Task review t440（reviewer_focus: 测试）

- task：`t440_bg_serve_lock_race_stale_early_exit`
- spec：`docs/tasks/t440_bg_serve_lock_race_stale_early_exit/spec.md`
- diff_anchor：`a39420f94a1f9698374b08896a2e70ab33326ae4`
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t440' diff a39420f94a1f9698374b08896a2e70ab33326ae4`
- round：1
- reviewed_at：2026-09-04 00:35 UTC+8

## Findings

### t440_test_f001 - AC-003 诊断文案无任何测试断言,「全部 AC 可自动测试」声明未兑现到文案层

- 严重度：minor
- 锚点：AC-003（诊断信息须覆盖单实例锁冲突场景,含「另一实例正在启动/关闭,若刚退出请稍候重试」提示）
- 位置：`src/main/cli/background_serve.ts:146-153`（exited_code0 接线分支）;`tests/unit/main/cli/background_serve.test.ts` 全文件无文案断言
- 问题：交付新增 6 用例全部只断言 `classify_poll_result` 的返回对象（kind 判别层),无一断言 AC-003 的验收文本本身。文案字符串落在父进程接线分支 `background_serve.ts:149-150`(`serve 进程启动即退出（code=0）。通常为单实例锁冲突——另一实例正在启动或关闭。若刚执行过 quit 请稍候重试；日志：`),该分支及 exit 1 行为全仓无任何测试触达（`grep` 仅 classify 层命中;`run_background_serve_parent` 只被 `index.ts:136` 生产调用）。若接线层回归——如文案漏「稍候重试」、exit 码误写 0、未给日志路径——现有单测全绿、AC-002/003 实际违反。spec 契约区「可测试性声明」称全部 AC 可自动测试,该 claim 在文案/接线层未兑现。
- 建议：成本最低路径是把 exited_code0 的诊断文案构造抽为纯函数（如 `lock_conflict_msg(log_path)`）并在单测 toEqual 断言其含「另一实例正在启动或关闭」与「若刚执行过 quit 请稍候重试」;进程级 exit 1 行为按本任务指令归入打包 e2e follow-up,不做 blocking。若采纳该豁免,应在 spec「可测试性声明」登记 AC-003 文案仅可由进程级/e2e 断言,否则「全部可自动测试」表述与交付不符。

### t440_test_f002 - 冗余用例测试名宣称覆盖 deadline,实际输入与 case4 完全相同,构成超时语义假覆盖

- 严重度：minor
- 锚点：测试可信（异步时序 / 测试名与断言脱节）
- 位置：`tests/unit/main/cli/background_serve.test.ts:46-50`（case6）
- 问题：case6 命名为「child 存活但无 cli.json 且已过 deadline → continue(父进程外层负责超时)」,但 `classify_poll_result` 的 `PollInput` 根本没有 deadline 字段,该用例输入（`exitCode: null, childPid: 10, cliInfo: null`）与 case4（`:33-37`）逐字段相同、断言相同,是 case4 的完全重复。它并未测 deadline/超时行为——deadline 在父进程 `while (Date.now() < deadline)` 循环（`background_serve.ts:132`),classify 不感知。返回 continue 只因 cliInfo 为 null,与 deadline 无关。测试名让后续维护者误以为「超时路径」有自动覆盖,实为假覆盖表象。
- 建议：删除该重复用例（continue 分支已由 case4/case5 真覆盖）;若意图保留对「父进程外层负责超时」的说明,移到 it 描述外作注释,不要把未测语义写进测试名。deadline 语义若需自动覆盖,只能针对父进程轮询循环接线另写测试（当前无此基建,同 f001 范畴）。

### t440_test_f003 - 「退出优先于 cli.json」关键不变量缺组合边界用例

- 严重度：minor
- 锚点：覆盖 edge case（修复核心竞态的优先级不变量）
- 位置：`tests/unit/main/cli/background_serve.test.ts:18-22`
- 问题：实现注释明确「顺序有意固定:退出优先于 cli.json」（`background_serve.ts:26-31`),这是本次修复语义核心——子进程 code0 即使 cli.json 恰好已有匹配 pid+url 也必须判 `exited_code0` 而非 `ready`,否则仍可能把「先写盘后早退」的竞态误当成功。现有 code0 用例 cliInfo 全为 `null`,未覆盖「exitCode: 0 同时 cliInfo 含匹配 pid+url」这一组合,无法证明退出优先级不被 cliInfo 抢跑。
- 建议：补一例 `classify_poll_result({ exitCode: 0, childPid: 10, cliInfo: { port: 18263, url: "http://localhost:18263/", pid: 10 } })` 期望 `{ kind: "exited_code0" }`,直接固化退出优先不变量。

## 结论

- 前轮 finding 复核：Round 1,无前轮。
- 改测方向复核：无。diff 未修改任何既有测试,`background_serve.test.ts` 为纯新增;无「让断言迁就当前实现」的改测,无删/反转/弱化/注释断言,无 `.skip`/`.only`,无静默错误指令,无 mock 被测逻辑（`classify_poll_result` 为真实生产实现直接 import 调用,`toEqual` 精确断言对象,非恒真/存在性断言）。测试文件命名、放置、4 空格缩进、中文 it 描述与同目录 `args.test.ts`/`cli-json.test.ts` 风格一致。
- 本轮新发现：3 条（f001~f003,均 minor）。
- 未进表的提示：① AC-001/002/004 的「父进程打印 URL / 以特定码退出 / 给日志路径」等进程级接线同样无自动测试,与 f001 同源,按任务指令豁免入打包 e2e;② ready 缺 url（pid 匹配但 url undefined）→ continue 的细分未单测,属「可加 case」扩展,不阻断;③ case4 与 case6 重复、f002 建议删除其一后 6→5 用例,不影响 coverage 判定。
- 总体判断：单元层覆盖了 spec 测试策略预授权的 `classify_poll_result` 全部输出分支（exited / exited_code0 / ready / continue）及 core0 不再 continue 的核心修复断言,测试真实触达生产实现、断言强度合格;AC-003 文案与父进程接线层缺口按本任务指令豁免且不建议 blocking,故仅有 minor,可 PASS。严重度说明:若严格以 spec 文件「有意不测:无」为准,AC-003 缺测试可按 AC 覆盖缺口升 important;但本任务指令已声明该缺口在 spec 上下文登记、不做 blocking,故按 minor 出表,f001 建议中已给不依赖进程级的补测方向（抽文案纯函数）。
- AC 复验方式（以 diff 与代码/测试为准,独立重跑 `pnpm vitest run tests/unit/main/cli/background_serve.test.ts` → 6 passed）：
  - AC-001：`re_verified`——单测断言 `{exitCode:3}` → `{kind:"exited",code:3}`（`:11-16`）;父进程 exit(outcome.code) 接线读证（`background_serve.ts:139-145`）。
  - AC-002：`re_verified`（判定层）——单测断言 code0 → `exited_code0`（`:18-22`）;父进程 exit 1 + 给日志路径仅接线代码读证、无自动测试,注:此缺口按豁免入打包 e2e。
  - AC-003：`trust_prior`——文案无自动测试,仅接线代码人工读证 `background_serve.ts:149-150` 含「另一实例正在启动或关闭」「若刚执行过 quit 请稍候重试」。
  - AC-004：`re_verified`（判定层）——单测断言 pid+url 匹配 → ready 携 url/port（`:24-31`）;父进程打印 URL、exit 0 接线读证（`background_serve.ts:154-164`）。
  - coverage = 3/4 re_verified
- 系统性 follow-up：建议标题「打包(build)形态下 electron dev 透传缺陷的进程级 serve 锁冲突 e2e」,slug 建议 `bg_serve_lock_e2e_build`——覆盖 AC-002/003/004 进程级行为（先起健康实例占锁再后台 serve,断言父进程秒级失败、非 0 退出、stderr 含锁冲突提示而非「等待 serve 启动超时」）,以兑现 spec「全部 AC 可自动测试」对进程级层的 claim。阻断性:非阻断。

reviewed_scope: 7ffdbd5f85e9f888

verdict: PASS

## Round 2 (2026-09-04 00:41 UTC+8)

Round 2 审查范围 = `git -C '/home/testuser/testuser_ubuntu/omni_panel_t440' diff a39420f94a1f9698374b08896a2e70ab33326ae4`(当前工作区态;测试 9 用例、`pnpm vitest run tests/unit/main/cli/background_serve.test.ts` → 9 passed,2ms)。

### 前轮 finding 复核(以当前工作区测试与源码为准)

- **f001(已消除)**：`src/main/cli/background_serve.ts:43-55` 已抽 `build_early_exit_msg(kind, log_path, exitCode?)` 纯函数;`tests/unit/main/cli/background_serve.test.ts:68-83` 新增 describe 直接 import 该生产函数并断言:exited_code0 文案含「单实例锁冲突」「启动即退出」「稍候重试」与日志路径参数 `/tmp/serve.log`;exited 文案含「提前退出」「code=3」与日志路径。AC-003 文案层由 Round 1 的零断言转为 re_verified。接线分支(`background_serve.ts:159-163`)改用该函数输出 exit 1,文案单一来源,无重复字符串漂移。处置核心到位,可关闭。粒度次优点见 f004(验收引导句未逐字锁定,不构成未修)。
- **f002(已消除)**：原「child 存活但无 cli.json 且已过 deadline → continue」假覆盖用例已删除;continue 分支现由三例真覆盖:cli.json 未写入(`:47-51`)、pid 不匹配旧实例残留(`:53-58`)、**url 有但无 pid**(`:60-65`)。后者即 f002 建议补的细分,补齐「无 pid」continue 来源。无残留 deadline 命名用例,测试名与断言脱节的假覆盖已清除。
- **f003(已消除)**：`tests/unit/main/cli/background_serve.test.ts:27-36` 新增组合用例,`{exitCode:0, childPid:10, cliInfo 含 pid+url 匹配}` → `{kind:"exited_code0"}` 且追加 `{exitCode:3, childPid, 同 cliInfo}` → `{kind:"exited", code:3}`,两分支共同固化「退出优先于 cli.json」不变量。断言用 toEqual 精确匹配,非弱化;真触达生产 `classify_poll_result` 分支顺序。

### 本轮新发现

### t440_test_f004 - AC-003 验收引导句「另一实例正在启动/关闭」「若刚执行过 quit」未逐字锚定,删句回归测试仍绿

- 严重度：minor
- 锚点：AC-003(提示「另一实例正在启动/关闭,若刚退出请稍候重试」)
- 位置：`tests/unit/main/cli/background_serve.test.ts:69-75`(exited_code0 文案用例)
- 问题：f001 处置后文案测试断言子串「单实例锁冲突」「启动即退出」「稍候重试」「/tmp/serve.log」。其中「启动即退出」命中主句(`serve 进程启动即退出`),「单实例锁冲突」命中前导诊断词,但**让用户识别「是别家实例在启动/关闭、非本进程自身问题」的那句引导**「另一实例正在启动或关闭」(源码 `background_serve.ts:50`)与「若刚执行过 quit」前缀,均非任何断言目标。若回归把该句删成 `...通常为单实例锁冲突。请稍候重试;日志:`(保住「单实例锁冲突」「稍候重试」),当前测试全绿,而 AC-003 核心用户引导信息(另一实例)失守。Round 1 f001 建议本即点明断言「另一实例正在启动或关闭」与「若刚执行过 quit 请稍候重试」,处置采用了另一组关键词。测试已验文案构造函数本身与诊断场景,非假绿,故不阻断。
- 建议：`build_early_exit_msg("exited_code0", log_path)` 用例补 `expect(msg).toContain("另一实例正在启动或关闭")` 与 `expect(msg).toContain("若刚执行过 quit")` 两条,逐字锁 AC-003 引导句;或确认该粒度豁免后移入「有意不测」。

## 结论(Round 2)

- 前轮 finding 复核：f001 / f002 / f003 均已消除,处置以 diff 与代码核实、非采信处置表自述;唯一未收尾粒度记为 f004 minor。
- 改测方向复核：无。`background_serve.test.ts` 自 anchor 起为纯新增(6→9 用例),无任何「迁就当前实现」的对既有测试断言改写;无删/反转/弱化/注释断言、`.skip`/`.only`、静默错误指令、mock 被测逻辑。测试直接 import 生产纯函数 `classify_poll_result` / `build_early_exit_msg`,断言 toEqual/toContain 精确,生产逻辑可达。
- 本轮新发现：1 条(f004,minor)。
- 未进表的提示：① 文案用例未断言 `code=0` 字样(AC-002 判失败场景由 classify 层 toEqual 断言非 0 覆盖),不阻断;② `:47` it5 测试名「cli.json 未写入或无 pid」中「无 pid」实由 `:60-65` 覆盖,it5 输入 `cliInfo:null` 仅表未写入,名称略宽,属命名微瑕;③ 进程级接线(父进程 exit 1/exit code、打印 URL、锁冲突文案经 stderr)仍无自动测试,同 Round 1 豁免,归打包 e2e。
- AC 复验方式(Round 2,以当前工作区 diff 与测试为准,重跑 `pnpm vitest run tests/unit/main/cli/background_serve.test.ts` → 9 passed)：
  - AC-001：`re_verified`——it「非0退出 → exited(code 3)」+ build exited 文案断言「code=3」;父进程 `exit(outcome.code)` 接线读证(`background_serve.ts:154-158`)。
  - AC-002：`re_verified`(判定+文案构造层)——it code0 → `exited_code0`;build exited_code0 断言含日志路径;父进程 `exit(1)` 接线读证(`background_serve.ts:159-163`)。
  - AC-003：`re_verified`(文案构造层,较 Round 1 由 trust_prior 转正)——build_early_exit_msg 单测断言「单实例锁冲突」「稍候重试」「启动即退出」与日志路径;引导句字面锚定缺漏见 f004。
  - AC-004：`re_verified`(判定层)——it ready 分支携 url/port;父进程打印 URL、exit 0 接线读证(`background_serve.ts:164-174`)。
  - coverage = 4/4 re_verified(进程级接线行为仍以代码读证,进程级豁免入打包 e2e,同 Round 1)。
- 总体判断：三条前轮 minor 处置核实到位、原 finding 可关闭;本轮 1 条 minor(f004)不阻断,无未解决 critical / important,verdict PASS。
- 系统性 follow-up：同 Round 1「打包(build)形态下 electron dev 透传缺陷的进程级 serve 锁冲突 e2e」(slug `bg_serve_lock_e2e_build`),不重复报 tid。

reviewed_scope: de5f4918b65a8f80

verdict: PASS

## Round 3 (2026-09-04 00:46 UTC+8)

Round 3 审查范围 = `git -C '/home/testuser/testuser_ubuntu/omni_panel_t440' diff a39420f94a1f9698374b08896a2e70ab33326ae4`(当前工作区态;测试 9 用例,`pnpm vitest run tests/unit/main/cli/background_serve.test.ts` → 9 passed,2ms,独立重跑确认)。

### 前轮 finding 复核(以当前工作区测试与源码为准)

- **f004(已消除)**：`tests/unit/main/cli/background_serve.test.ts:72-73` 已在 AC-003 文案用例补两条逐字锚定断言——`toContain("另一实例正在启动或关闭")`、`toContain("若刚执行过 quit 请稍候重试")`。与源码 `background_serve.ts:46-47` 产出文案逐字比对:「...另一实例正在启动或关闭。」与「若刚执行过 quit 请稍候重试;日志:」两引导句均为断言目标,删除任一句该用例即红。Round 2 f004 建议的断言方向(锁定引导句而非仅诊断词)已兑现;是**追加**断言(1 条 it 内由 4 断言增至 6),属加强而非改弱,无换形式弱化。非假绿——测试 import 生产纯函数 `build_early_exit_msg` 直调,断言子串与真实返回串逐字吻合。
- **f001 / f002 / f003(仍消除,当前工作区状态复核)**：`build_early_exit_msg` 纯函数与两文案用例仍在(`test:68-83`),父进程接线 `background_serve.ts:157-161` 复用该函数输出 exit 1,单一文案来源无漂移;假 deadline 用例未复现,continue 分支仍由三例真覆盖(`test:47-65`);「退出优先于 cli.json」组合用例仍在(`test:27-36`)固化不变量。各处置未因本轮改动回退。

### 本轮新发现

0 条。

### 签名与判别联合一致性复核

`build_early_exit_msg(msg: { kind: "exited_code0" } | { kind: "exited"; code: number }, log_path: string)`(`background_serve.ts:43`)为判别联合首参 + 字符串次参;测试两调用 `({ kind: "exited_code0" }, "/tmp/serve.log")`(`test:70`)、`({ kind: "exited", code: 3 }, "/tmp/serve.log")`(`test:79`)与签名逐一匹配,type 层无偏。`classify_poll_result` 7 用例覆盖 exited / exited_code0 / ready / continue 全输出分支,与接线 `background_serve.ts:145-173` 的判别分派一致。9 用例实测全绿,无 mock 被测逻辑、无 `.skip`/`.only`、无静默错误指令。

## 结论(Round 3)

- 前轮 finding 复核：f001 / f002 / f003 当前工作区状态核实仍消除;f004(唯一待收尾 minor)本轮核实已修——AC-003 两条引导句「另一实例正在启动或关闭」「若刚执行过 quit」已逐字锚定,断言为加强非弱化,以 diff 与重跑测试核实、非采信处置表自述。
- 改测方向复核：无。Round 2 → Round 3 之间测试改动仅为 AC-003 用例**追加**两条 toContain 断言(由 Round 2 报告的 4 断言增至当前 6 断言),是收紧预期方向,与 TDD 顺序一致,无「迁就当前实现」改测。
- 本轮新发现：0 条。
- 未进表的提示：同 Round 2——① 文案用例未断言「code=0」字样,由 classify 层 code0 判 exited_code0 覆盖,不阻断;② `test:47` it5 测试名「未写入或无 pid」中「无 pid」实由 `:60-65` 承担,it5 输入 cliInfo:null 仅表未写入,命名略宽,属微瑕;③ 父进程进程级接线(exit 1/exit code、打印 URL、文案经 stderr)仍无自动测试,同 Round 1/2 豁免,归打包 e2e follow-up。
- AC 复验方式(Round 3,以当前工作区 diff、源码与重跑测试为准,`pnpm vitest run tests/unit/main/cli/background_serve.test.ts` → 9 passed)：
  - AC-001：`re_verified`——it「非0退出 → exited(code 3)」+ build exited 文案断言「提前退出」「code=3」;父进程 `exit(outcome.code)` 接线读证(`background_serve.ts:150-156`)。
  - AC-002：`re_verified`(判定+文案构造层)——it code0 → `exited_code0`;build exited_code0 断言含日志路径 `/tmp/serve.log`;父进程 `exit(1)` 接线读证(`background_serve.ts:157-161`)。
  - AC-003：`re_verified`(文案构造层,较 Round 2 补逐字锚定)——toContain「另一实例正在启动或关闭」「若刚执行过 quit 请稍候重试」均逐字命中源码 `background_serve.ts:46-47`,与源码字符串手工比对成立。
  - AC-004：`re_verified`(判定层)——it ready 分支携 url/port;父进程打印 URL、exit 0 接线读证(`background_serve.ts:162-172`)。
  - coverage = 4/4 re_verified(进程级接线行为仍以代码读证,进程级豁免入打包 e2e,同 Round 1/2)。
- 总体判断：f004 minor 修复到位、逐字锚定真收紧,三条历史 minor 维持已消除;无未解决 critical / important,verdict PASS。
- 系统性 follow-up：同 Round 1「打包(build)形态下 electron dev 透传缺陷的进程级 serve 锁冲突 e2e」(slug `bg_serve_lock_e2e_build`),不重复报 tid。

reviewed_scope: a5a75de945bd61b9

verdict: PASS

## Round 4 (2026-09-04 00:52 UTC+8)

Round 4 审查范围 = `git -C '/home/testuser/testuser_ubuntu/omni_panel_t440' diff a39420f94a1f9698374b08896a2e70ab33326ae4`(当前工作区态)。R3→R4 阶段改动声明为:仅 `src/main/cli/background_serve.ts` 的 eslint --fix(prefer-optional-chain:`cliInfo != null && cliInfo.pid` → `cliInfo?.pid`)+ prettier 格式化,测试文件无逻辑改动。本轮独立重跑 `pnpm vitest run tests/unit/main/cli/background_serve.test.ts` → 9 passed,2ms。

### 前轮 finding 复核(以当前工作区测试与源码为准)

- **f001(仍消除)**：`build_early_exit_msg` 纯函数在 `background_serve.ts:43-54`,exited_code0 / exited 两文案用例仍在 `test:68-83`;父进程接线(`background_serve.ts:157-161` exited_code0 分支)复用该函数输出 exit 1,文案单一来源无漂移。本轮 optional-chain/prettier 未触碰该函数与接线。
- **f002(仍消除)**：continue 分支仍由三例真覆盖(cli.json 未写入 `test:47-51`、pid 不匹配旧残留 `:53-58`、url 有但无 pid `:60-65`),假 deadline 命名用例未复现。
- **f003(仍消除)**：「退出优先于 cli.json」组合用例仍在 `test:27-36`(`exitCode:0 + cliInfo 含匹配 pid+url → exited_code0`,另 `exitCode:3` → exited code 3),固化不变量未回退。
- **f004(仍消除,本轮专项复核 optional-chain 不破坏 ready 判定锚点)**：AC-003 引导句逐字锚定断言仍在 `test:71-72`(`toContain("另一实例正在启动或关闭")`、`toContain("若刚执行过 quit 请稍候重试")`),与源码 `background_serve.ts:49-50` 产出文案逐字吻合。

### 本轮新发现

0 条。

### optional-chain 语义一致性专项复核(R3→R4 源码机械改动的正确性)

改动仅命中 `classify_poll_result` 的 ready 判定一行。当前源码 `background_serve.ts:36`:`if (cliInfo?.pid === childPid && cliInfo.url)`。语义逐分支核对:

- `cliInfo` 为 null:旧式 `cliInfo != null && cliInfo.pid === childPid` 因判空短路不入 ready;新式 `cliInfo?.pid` 求值为 `undefined`,`undefined === childPid(数值)` 为 false,`&&` 短路使 `cliInfo.url` 不求值,无空引用——结果同为不入 ready,落到 continue。两条路径可观测行为一致。
- `cliInfo` 非 null 且 pid 匹配 + url 存在:两式同判 ready,返回 `{ready, url, port}`。
- `cliInfo` 非 null 但 pid 不匹配 / url 缺失:两式同判 continue。
- 类型层 `PollInput.cliInfo: { port; url?; pid? } | null`(`background_serve.ts:23`),联合不含 `undefined`,optional-chain 的判空覆盖与原 `!= null` 完全一致,无新增可达分支。

受影响的 ready 判定恰为测试用例的核心锚点:`test:38-45`(pid+url 匹配 → ready)与 `test:53-65`(pid 不匹配 / url 无 pid → continue)均 import 生产 `classify_poll_result` 直调,9 passed 实测确认转换后各分支输出不变。危险模式扫描:test 文件无新增删除/反转/弱化断言、无 `.skip`/`.only`、无 mock 被测逻辑、无静默错误指令;测试未迁就实现(源码转换前后断言未改,真触达 optional-chain 后生产逻辑)。exitCode 判定分支(`:34-35`)不涉 optional-chain,exited/exited_code0 用例(`:14-36`)不受本轮改动影响。

## 结论(Round 4)

- 前轮 finding 复核：f001 / f002 / f003 / f004 当前工作区状态核实全部仍消除;R3→R4 源码仅 optional-chain + prettier 机械等价改动,ready 判定语义逐分支核验与原判空等价,测试侧 9 用例结构自 R3 起无逻辑改动(与 Round 3 报告描述的用例结构与断言锚点逐一比对一致),无假绿、无迁就实现。
- 改测方向复核：无。R3→R4 测试文件无任何改动(用户声明 + 与 R3 报告结构比对双重核证),无「迁就当前实现」改测。
- 本轮新发现：0 条。
- 未进表的提示：同 Round 2/3——① 文案用例未断言「code=0」字样,由 classify 层 code0 → exited_code0 覆盖,不阻断;② `test:47` it5 测试名「未写入或无 pid」中「无 pid」实由 `:60-65` 承担,it5 输入 cliInfo:null 仅表未写入,命名略宽,属微瑕;③ 父进程进程级接线(exit 1/exit code、打印 URL、文案经 stderr)仍无自动测试,同 Round 1~3 豁免,归打包 e2e follow-up。
- AC 复验方式(Round 4,以当前工作区源码、测试与重跑为准,`pnpm vitest run tests/unit/main/cli/background_serve.test.ts` → 9 passed)：
  - AC-001：`re_verified`——it「非0退出 → exited(code 3)」(`test:14-19`) + build exited 文案断言「提前退出」「code=3」(`test:78-83`);父进程 `exit(outcome.code)` 接线读证(`background_serve.ts:153-158`)。
  - AC-002：`re_verified`(判定+文案构造层)——it code0 → `exited_code0`(`test:21-25`);build exited_code0 断言含日志路径 `/tmp/serve.log`;父进程 `exit(1)` 接线读证(`background_serve.ts:160-163`)。
  - AC-003：`re_verified`(文案构造层)——toContain「另一实例正在启动或关闭」「若刚执行过 quit 请稍候重试」逐字命中源码 `background_serve.ts:49-50`,字符串手工比对成立。
  - AC-004：`re_verified`(判定层)——it ready 分支携 url/port(`test:38-45`);父进程打印 URL、exit 0 接线读证(`background_serve.ts:165-174`)。
  - coverage = 4/4 re_verified(进程级接线行为仍以代码读证,进程级豁免入打包 e2e,同 Round 1~3)。
- 总体判断：optional-chain + prettier 为语义等价机械改动,ready 判定分支逐分支核对与原判空一致,9 用例实测全绿、测试自 R3 后无逻辑改动,f001~f004 处置全数维持消除;无未解决 critical / important,verdict PASS。
- 系统性 follow-up：同 Round 1「打包(build)形态下 electron dev 透传缺陷的进程级 serve 锁冲突 e2e」(slug `bg_serve_lock_e2e_build`),不重复报 tid。

reviewed_scope: 2f89e4afa4b00eee

verdict: PASS
