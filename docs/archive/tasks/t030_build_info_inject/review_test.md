# Task review t030（reviewer_focus: 测试）

- task：`t030_build_info_inject`
- spec：`docs/tasks/t030_build_info_inject/spec.md`
- diff_anchor：`0167f66`
- target：`git diff 0167f66`
- round：1
- reviewed_at：2026-07-21 (UTC+8)

## Findings

### t030_test_f001 - IPC 单测期望值与实现同源，无法检测 branch/commit 字段对调

- 严重度：minor
- 位置：`tests/unit/ipc/build-info-ipc.test.ts:10-14`
- 问题：测试期望 `{ version: "1.2.3", branch: BUILD_INFO.branch, commit: BUILD_INFO.commit }`，而 `BUILD_INFO` 直接 import 自 `src/generated/build-info.ts`——实现 `src/main/ipc/build-info-ipc.ts:14-18` 也是读同一个常量。两者引用同一源，等同写 `expect(x).toEqual(x)` 的 shape 版。
  能检测：shape 改动、`ok` 标志、version 透传。
  不能检测：若实现误写成 `{ branch: BUILD_INFO.commit, commit: BUILD_INFO.branch }`（字段对调），因 dev placeholder `branch === commit === "dev"`（见 `src/generated/build-info.ts:2-5`），`toEqual` 仍通过。这是 spec AC「IPC `app:buildInfo` 返回 version + branch + commit」下一种 plausible 回归。
- 建议：用 vi.mock 或 vi.resetModules 替换 `src/generated/build-info` 为 `{ branch: "br", commit: "co" }`（两者不同），期望硬编码 `{ version: "1.2.3", branch: "br", commit: "co" }`。或直接在测试里硬编码 dev 期期望 `{ version: "1.2.3", branch: "dev", commit: "dev" }` 并注释「dev placeholder，构建期由 gen 脚本覆写」——任一均可暴露对调 bug。

## AC 覆盖核对

- [✓] `pnpm build` 生成 `src/generated/build-info.ts`：非测试 AC，`package.json` build 脚本含 gen 步骤（diff 外），`pnpm test:packaged` smoke 间接覆盖。
- [✓] IPC `app:buildInfo` 返回 version + branch + commit：`build-info-ipc.test.ts` 断言 shape（见 f001 的覆盖弱点）。
- [✓] 设置页版本号下方显示 `branch@commit`：`settings_view.test.tsx:1306-1314` 断言 `.ah-build` textContent === `"t030_test@abc1234"`。
- [—] `src/generated/` 在 .gitignore：非测试 AC。
- [✓] IPC handler 单测 + renderer 单测通过：两类测试就位。
- [—] pnpm test / pnpm check 绿：非测试 AC。

## 危险模式扫描

逐条扫描结果：

- 恒真断言 / `expect(true).toBe(true)` / 纯 `toBeDefined`：无。
- 删除/反转 expect：无。
- 注释掉断言：无。
- 弱化断言（`toBe` → `toContain` / 正则 / `>=` / `toBeTruthy` / `toMatchObject`）：无，renderer 测试用严格 `toBe`。
- 删测试 / describe / it 块：无。
- `.skip` / `.only` / `@Ignore`：无。
- `eslint-disable` / `@ts-ignore` / `@SuppressWarnings`：无。
- mock 误用（mock 关键副作用 / mock 自己类或模块 / mock 被测逻辑）：无。renderer 测试只 mock `window.usageboard.buildInfo.get`（系统边界 IPC），未 mock 内部模块。
- 阈值掩盖（timeout / 重试 / 容差）：无。
- 条件跳过弱化断言：无。
- `.value =` 或 API 替代真实交互：无，settings 测试用 `user.click` 导航到 about。
- 存在即通过（`toBeVisible` 当 AC 证据）：无，断言 textContent 具体字符串。

## 其他观察（不进 finding 表）

- `gen-build-info.ts` 无单测：spec 测试范围显式列「IPC handler 单测 + renderer 展示单测」，gen 脚本不在内。脚本纯 IO（execSync + writeFileSync），测试需 mock `child_process` 或 fixture git repo，成本高收益低。`pnpm test:packaged` smoke 会真实跑 gen 并启动打包产物，间接覆盖。可接受。
- `popup_view*.test.tsx`（3 个）+ `tests/smoke/setup.ts`：仅加 `buildInfo.get` mock，无 build-info 断言。原因：`UsageboardApi` 类型新增 `buildInfo` 必选字段，mock 对象需补齐以满足 TS 类型。PopupView 不展示 build info，无需断言。类型合规维护，非凑数。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：1 条（minor）。
- 总体判断：测试覆盖满足 spec AC，renderer 展示测试断言严格真实行为，mock 边界正确。唯一弱点是 IPC 单测期望值与实现同源，无法暴露字段对调——minor，不阻塞。

verdict: PASS
