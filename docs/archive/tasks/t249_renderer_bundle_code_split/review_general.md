# Task review t249（reviewer_focus: 通用）

- task：`t249_renderer_bundle_code_split`
- spec：`docs/tasks/t249_renderer_bundle_code_split/spec.md`
- diff_anchor：`ab402d3bd515638ab40f2938862844dc4c29a246`
- target：`git diff ab402d3bd515638ab40f2938862844dc4c29a246`
- round：1
- reviewed_at：2026-08-07 20:44 UTC+8

## Findings

### t249_gen_f001 - 构建产物断言测试使 `pnpm test` 在全新 checkout / CI 必挂

- 严重度：important
- 锚点：行为缺陷——CI 的 `test` job 在全新 checkout 跑 `pnpm test`（`.github/workflows/ci.yml`），`out/` 被 gitignore（`git check-ignore out`），产物不存在时 `tests/unit/build_code_split.test.ts` 对 `out/web/index.html` / `out/renderer/index.html` 的 `readFileSync` 直接抛 ENOENT。
- 位置：`tests/unit/build_code_split.test.ts:39-42`（「产物存在」对 `out/web/index.html` / `out/renderer/index.html` 直接 `readFileSync`；`read_entry_chunk` 依赖入口 `index.html` 于 `:17-23`）；门禁 `vitest.config.mts` node project `include: ["tests/unit/*.test.{ts,tsx}", ...]` 收纳本测试；CI `.github/workflows/ci.yml` `test` job 仅 `pnpm install` + `pnpm test`，无 build 步骤。
- 问题：本 task 在 worktree 内 `pnpm test` 通过，是因为 worktree 已跑过 `pnpm build` 留有 `out/`；但 CI 的 unit 测试 job 与未来 task 的全新 worktree 都没有 `out/`，该测试必然红灯（ENOENT）。这使项目日常门禁 `pnpm test` 失去自含性，并让本分支 CI 全红。测试内不跑构建的理由（better-sqlite3 ABI 污染并行 worker）是合理工程取舍，但未因此对缺失产物做 skip/条件降级，属测试环境依赖未收敛。
- 建议：产物缺失时跳过断言（如 `it.skipIf(!existsSync(out_web_html))` 或前置 `describe.skipIf`），并在 skip 消息里注明需先 `pnpm build`；或把该测试移入独立 suite（如 `test:build` script）由 CI 在 build 后显式调用，避免混入 `pnpm test` 默认门禁。

### t249_gen_f002 - spec 上下文区与 findings 声称「所有 chunk < 500 kB」，renderer 产物不符

- 严重度：minor
- 锚点：文档/配置与代码改动不一致（处置为改 spec，不计 FAIL）
- 位置：`docs/tasks/t249_renderer_bundle_code_split/spec.md`「未知契约清单」、`docs/findings.md` d024、`docs/spikes/s018_code_split_dynamic_import/report.md` 结论段；证据为 `out/renderer/assets/charts-B9hFA9cv.js`（655 KB）、`components-KMEYfxNp.js`（620 KB）、`Axis--VLCorje.js`（611 KB）、`index-Dr-SzFOk.js`（539 KB）。
- 问题：三处文档写「按需注册（仅注册 Bar/Heatmap/Pie + Grid/Tooltip/DataZoom/VisualMap + CanvasRenderer）后所有 chunk < 500 kB，两端构建均无 chunk size 警告」。实际 renderer 构建 4 个 chunk 均 > 500 kB（spike 报告自身证据表已列 654.62/620.48/610.57/539.56 kB，与其结论段矛盾）；我用 `npx electron-vite build` 复核，renderer 端确实不输出 chunk size 警告（grep 无匹配），故「两端均无警告」成立，但「所有 chunk < 500 kB」仅 web 端成立。另外，「按需注册」并未真正裁剪 bundle：renderer 与 web 的 `charts-*.js` 都仍含未注册的 `series.line` / `series.treemap` / `series.gauge` 等类型，chunk 缩小来自 echarts 子模块（core/charts/components/renderers）拆分而非注册裁剪。
- 建议：把 spec 上下文区与 findings 的措辞改为「web 端所有 chunk < 500 kB；renderer 端 echarts 按子模块拆分为独立 chunk（最大约 655 kB）但 electron-vite 构建不输出 chunk size 警告」；并同步修正 spike 报告结论段与证据表的自相矛盾。AC1/AC2 不受影响。

### t249_gen_f003 - loadECharts 失败路径无错误处理，chunk 加载失败后图表永久失效

- 严重度：minor
- 锚点：行为缺陷（异常路径/资源健壮性）
- 位置：`src/renderer/hooks/use-echarts.ts:9-31`（模块级 `echartsLoading` 缓存）与 `:55-61`（`void loadECharts().then(...)` 无 `.catch`）
- 问题：`echartsLoading` 一旦 reject，缓存永留 rejected 状态；每次 `useECharts` 挂载都对该 promise 附加无 `.catch` 的 `.then`，每次产生未处理 rejection，且后续所有图表都不会初始化、无重试、无错误上报（未走 `window.usageboard.log`）。正常打包场景 chunk 加载不会失败（packaged smoke 已证），故仅在产物损坏等异常运行态触发，不阻断 AC4。
- 建议：`loadECharts()` 增加 `.catch`（记录日志并将 `echartsLoading` 置回 `null` 以便重试，或至少上报错误），避免未处理 rejection 与永久失效。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：3 条（f001 important，f002/f003 minor）
- 未进表的提示：
    - `build_code_split.test.ts` 的 chunk 断言只检查入口 chunk 不含特征串 + 存在某非入口 chunk 含特征串，未校验「首屏启动即加载的共享 chunk」不含 echarts/SessionShell；当前实现下成立（与 AC「不在首屏入口 chunk 内」措辞一致），作覆盖可更广的提示，不进表。
    - `App.tsx` 的 `let view;`（隐式 any）与 `RouteLoading` 内联样式属风格，不判 finding。
    - spec 上下文区「契约区 drift 警告」所示变更（非范围去掉「不做 ECharts 模块级裁剪」条款）在 task.md Step 1 已记载「用户已确认无警告为达成目标」，视为经确认的需求变更，非未确认 AC 变更。
- 总体判断：实现本身正确（懒加载、卸载竞态防护、e2e 修复均到位，AC1/AC2/AC4/AC5 依据产物与黑盒记录成立），但 f001 使 `pnpm test` 在 CI/全新 worktree 必红，属未解决 important，本轮 FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-07 21:25 UTC+8)

### 前轮 finding 复核

- **t249_gen_f001（important）— 已修**。`tests/unit/build_code_split.test.ts:44` 改为 `describe.skipIf(!has_build_output)` 包裹整组；`has_build_output` 在模块加载期由 `existsSync` 判定 `out/web/index.html` 与 `out/renderer/index.html`。所有文件读取（`readFileSync`、`read_entry_chunk`、`chunk_containing`、`list_asset_chunks`）均只在 `it` 回调内执行，suite 被 skip 时不会触碰文件系统，ENOENT 不再可能。已实测本 worktree（产物存在）7 passed；产物缺失时整组 7 skipped、不红。CI/全新 worktree 不再破坏 `pnpm test` 自含性。残留代价：CI 无 build 步骤时 AC1/AC2 断言被跳过而非执行——这正是 f001 建议的两条出路之一（skipIf 注明先构建），属已接受取舍，不计新 finding。
- **t249_gen_f002（minor）— 已修**。`spec.md`「未知契约清单」、`docs/findings.md` d024、`docs/spikes/s018_code_split_dynamic_import/report.md` 结论段三处措辞统一改为「web 端所有 chunk < 500 kB；renderer 端 echarts 按子模块拆分为独立 chunk（最大约 655 kB），electron-vite 构建不输出 chunk size 警告」，与 spike 证据表（654.62/620.48/610.57 kB）自洽，不再断言 renderer「所有 chunk < 500 kB」。spec「非范围」去掉「不做 ECharts 模块级裁剪」条款在 task.md Step 1 记载为用户确认，属已批准需求变更；契约清单已无 `UNVERIFIED-BLOCKING` / `UNVERIFIED-SPIKE` / 裸 `UNVERIFIED` 标记。
- **t249_gen_f003（minor）— 已修**。`src/renderer/hooks/use-echarts.ts` `loadECharts` 增加内部 `.catch`：复位 `echartsLoading = null`（后续挂载可重试，不再永久 rejected）、经 `window.usageboard.log`（TrayMenu.tsx:204 等既有真实 API）上报后 rethrow；调用处 `.then(...).catch(() => {})` 吞掉 rejection，无未处理 rejection。`const c = init(...)` 先赋局部变量再赋 `chart` / `chartRef.current`，init 同步抛错不污染 chart 引用。缓存 promise 被并发挂载共享时，rejection 经 catch 链在每个调用点消化；disposed 竞态防护保留（resolve 前卸载不 init、不加 resize 监听）。`tests/unit/renderer/hooks/use_echarts_lazy.test.ts` 3 tests 实测通过。

### 本轮新发现

- 0 条。
- 未进表的提示：`window.usageboard` 在 renderer（preload contextBridge）与 web（`install_web_usageboard` 先于 App 挂载）均已就绪，`.catch` 内日志调用在真实运行态安全；单元测试不触达失败路径故无此依赖。无。

### 验证

- `pnpm typecheck` 通过；`pnpm lint --max-warnings=0` 通过；`build_code_split.test.ts` 7 passed（产物存在）；`use_echarts_lazy.test.ts` 3 passed。

### 总体判断

前轮 3 条 finding 均按建议真修（f001 以 skipIf 达成「缺失跳过不红」，f002 措辞与证据自洽，f003 消除未处理 rejection 并支持重试），修复未引入新 blocker；仅存 CI 下 AC1/AC2 断言跳过的已接受取舍。本轮 PASS。

- 系统性 follow-up：无

verdict: PASS
