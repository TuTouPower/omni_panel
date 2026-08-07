---
tid: "t249"
slug: "renderer_bundle_code_split"
title: "渲染包代码分割：路由懒加载 + ECharts 动态加载"
status: "done"
branch: "t249_renderer_bundle_code_split"
worktree: ""
review_level: "single"
diff_anchor: "ab402d3bd515638ab40f2938862844dc4c29a246"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### Step 1（SPIKE s018）

- `{doctor_cmd}` 无独立命令，靠 `{test_cmd}` 失败信号判定环境。
- worktree 缺 node_modules，`pnpm install --frozen-lockfile` 装依赖（7.9s）；`src/generated/` 被 gitignore，worktree 缺目录致 `gen-build-info.ts` 写文件 ENOENT，`mkdir -p src/generated` 解决。
- SPIKE 实验直接在源码实施最小实现：App 五 route 改 `React.lazy` + `<Suspense>` fallback「加载中…」；use-echarts 顶层静态 `import * as echarts` 移除，改 effect 内动态加载。
- 关键发现：echarts 整包动态加载后 web 端独立 chunk 1,128 kB 仍超 Vite 默认 500 kB 阈值，构建继续告警，与 spec AC1 冲突。用户指示「让他无警告」→ 采用 `echarts/core` 按需注册（Bar/Heatmap/Pie + Grid/Tooltip/DataZoom/VisualMap + CanvasRenderer，模块级缓存一次注册）。按需注册后所有 chunk < 500 kB，web 与 electron 两端构建均无 chunk size 警告，AC1 原样满足。
- 因采用按需注册，spec「非范围」去掉「不做 ECharts 模块级裁剪」条款（用户已确认无警告为达成目标）；「未知契约清单」SPIKE 项改写为验证结论。spike 报告 `docs/spikes/s018_code_split_dynamic_import/report.md`。
- preflight `--require-verified` PASS。

### Step 2/3（测试与实现）

- 新增 `tests/unit/build_code_split.test.ts`（node project，7 tests）：只读 `out/` 产物断言 web 与 electron renderer 入口 chunk 不含 echarts 运行时（`echarts_instance_`）与 SessionShell（`session-shell`）特征；存在含两特征的非入口独立 chunk。**不在测试内跑 `pnpm build`**——会触发 better-sqlite3 ABI 切换污染并行 worker；产物缺失时测试失败提示先构建。SessionShell 特征最初用 `className="session-shell"` 不匹配（压缩后属性名变化），改裸 `session-shell`（已验证入口不含）。
- 新增 `tests/unit/renderer/hooks/use_echarts_lazy.test.ts`（renderer project，3 tests）：`vi.mock` echarts/core 等 4 子模块 + `vi.resetModules()` 隔离模块级 `echartsLoading` 缓存；覆盖「挂载后 init 并注册」「动态 import resolve 前卸载不调用 init（disposed 防护）」「卸载后不再响应 resize」。

### Step 4（黑盒）

- `pnpm test`：239 files / 2566 passed / 1 skipped，全绿。
- web e2e（`MOCK_FIXTURE=synthetic pnpm test:e2e:web`）：52 passed / 4 failed。4 个失败全在 `session_panel.spec.ts`（t228 搜索闭环 + t237 三个虚拟列表），**主仓基线（未改动代码）同样 4 failed**——既有 fixture/测试问题，非本 task 引入。根因线索：会话库显示「统计不可用」，测试等「9 个会话」计数，synthetic fixture 未提供；LARGE_SESSION 注入测试等 `.lib-card`。待收尾登记 pending。
- playwright webServer 自动启动 vite preview 在 Windows 失败（connection refused），需手动起 preview 供 `reuseExistingServer` 复用；fixtures `data/responses.json` 与 `synthetic.json` 为 gitignore 数据，worktree 需从主仓复制或 `pnpm e2e:gen-data`/`e2e:gen-synthetic` 生成。
- electron e2e：首轮 32 passed / 3 failed / 4 skipped。3 个失败在 `secrets_persistence.spec.ts`（openSettings 等 `[data-testid="settings-sidebar"]`），**主仓基线 3 passed**——确认由懒加载引入。根因：`openSettings` predicate 用 `isVisible({ timeout: 5000 })`，Playwright 的 `isVisible()` 不支持 timeout（立即检查）。静态 import 时窗口事件触发瞬间 SettingsView 已含在入口 chunk，sidebar 立即可见；懒加载后窗口事件触发瞬间 chunk 未加载完，sidebar 不可见 → predicate 误拒窗口 → 10s 超时。诊断脚本确认 sidebar 实际 2s 内可见、无 chunk 加载错误。修复：predicate 改 `waitFor({ state: "visible", timeout: 5000 })` 真正等待。修后完整 electron e2e：35 passed / 4 skipped / 0 failed。属修测试 API 误用（`isVisible` 无 timeout 参数），非改断言值。
- 打包黑盒：`pnpm package` 首次 electron-builder 因残留 electron 进程占用 `better_sqlite3.node` 失败（EPERM unlink），杀残留进程后成功；`pnpm test:packaged` **4 passed**（无白屏 + 无 pageerror、provider overview、agent 面板打开 + dashboard 查询、popup 高度）。file:// 下动态 chunk 加载正常（agent 面板打开证明懒加载 chunk 在打包 app 加载成功）。
- AC5 覆盖决策：曾尝试组件级 fallback 断言（mock view 模块 + 断言 role=status 占位），但 RTL `render` 的 act 会 flush lazy import 的微任务，fallback 从不稳定显示（async mock factory 亦不解决）。判定占位时序不可组件级测，删除测试；AC5 由 packaged smoke「无白屏 + 无 pageerror」覆盖（验证懒加载 chunk 加载成功、无白屏、无未捕获错误），符合 spec「e2e 或组件测试」二选一。

### AC 判定

- AC1：web 构建 echarts 运行时在独立 chunk、不在入口；两端构建无 chunk size 警告（构建产物断言测试 + 构建输出确认）。
- AC2：electron renderer SessionShell 与 echarts 分别独立 chunk、不在入口（构建产物断言测试）。
- AC3：web e2e 52 passed / 4 既有失败（主仓基线一致）；electron e2e 35 passed / 4 skipped / 0 failed；packaged 4 passed。
- AC4：agent 面板打开 + dashboard 查询（packaged smoke）；卸载竞态由 use_echarts_lazy 测试覆盖。
- AC5：packaged smoke 无白屏 + 无 pageerror。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-07 20:44 UTC+8)

| finding_id    | severity  | status | rationale                                                                        | fix_ref                                              |
| ------------- | --------- | ------ | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| t249_gen_f001 | important | 已修   | describe.skipIf 产物缺失时跳过                                                   | tests/unit/build_code_split.test.ts:44               |
| t249_gen_f002 | minor     | 已修   | spec/findings/spike 措辞改准确（仅 web 端全 chunk<500k）                         | spec.md 未知契约 / findings.md d024 / s018 report.md |
| t249_gen_f003 | minor     | 已修   | loadECharts 加 .catch 重置缓存+日志；init 结果先赋局部变量防 rejected 污染 chart | src/renderer/hooks/use-echarts.ts:9,55               |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1/AC2 由 `tests/unit/build_code_split.test.ts` 构建产物断言 + 构建输出确认（web 端无 chunk size 警告，echarts 运行时独立 chunk 且不在入口；electron renderer SessionShell 与 echarts 独立 chunk 不在入口）；AC3 由 web e2e 52 passed（4 既有失败主仓基线一致，登记 p075）+ electron e2e 35 passed/4 skipped + packaged 4 passed；AC4 由 packaged smoke agent 面板打开 + dashboard 查询 + use_echarts_lazy 卸载竞态测试；AC5 由 packaged smoke 无白屏 + 无 pageerror。

### Reviewer verdict

`single`：

- Round 1 general：FAIL（3 finding：f001 important 构建产物断言 CI 必挂；f002 minor spec/findings 措辞；f003 minor loadECharts 失败路径）
- Round 2 general：PASS（3 finding 全部已修，0 新 finding，typecheck/lint/test 全绿）

### 结果摘要

- 渲染层代码分割完成：五 route 懒加载 + echarts/core 按需注册，web 端无 chunk 警告，electron renderer 独立 chunk 且 electron-vite 无警告；修正 e2e openSettings 的 isVisible→waitFor 适配懒加载时序；存量 web e2e 4 失败登记 p075。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 渲染层代码分割完成：五 route 懒加载 + echarts/core 按需注册，web 端无 chunk 警告，electron renderer 独立 chunk 且 electron-vite 无警告；修正 e2e openSettings 的 isVisible→waitFor 适配懒加载时序；存量 web e2e 4 失败登记 p075。
