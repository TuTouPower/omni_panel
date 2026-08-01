# Task review t178（reviewer_focus: 测试）

- task：`t178_renderer_index_path_whitelist`
- spec：`docs/tasks/t178_renderer_index_path_whitelist/spec.md`
- diff_anchor：`60559e4e383f89cad4b60596ef6b86d84b912841`
- target：`git diff 60559e4e383f89cad4b60596ef6b86d84b912841`
- round：1
- reviewed_at：2026-08-01 12:20 UTC+8

## Findings

### t178_test_f001 - I15 测试语义漂移：验证路径与测试名/意图不符

- 严重度：minor
- 锚点：行为缺陷——`tests/unit/ipc/helpers.test.ts:200-208` 测试名声明「rejects file:// sender whose path is not index.html (I15)」，但运行时模块全局状态 `renderer_index_pathname` 为 null（describe "assert_valid_sender" 中唯一 set 的 159 行测试传 `""`，其后无恢复），实际验证的是「未初始化拒绝一切 file://」，与测试名意图（已初始化下精确比对拒绝非 index.html 路径）不符。
- 位置：`tests/unit/ipc/helpers.test.ts:200-208`
- 问题：该测试对「已初始化 + 路径不匹配拒绝」的覆盖已由 t067 describe 测试 2（`helpers.test.ts:31-38`「rejects file:// sender with different pathname」）承担，I15 当前与 159-168 测试功能重复（同为 null 状态拒绝 file://，仅 URL 不同）；无论 `renderer_index_pathname` 为何值该断言恒通过（null → 拒绝一切；非 null 且不匹配 → 拒绝），弱化了测试的自描述性，无法区分其声称的失败原因。覆盖未丢失，故非 blocking。
- 建议：显式 `set_renderer_index_path("D:\\app\\out\\renderer\\index.html")` 后再断言 `file:///evil/page.html` 拒绝，恢复「非 index.html 路径」原意；或重命名测试以反映「未初始化拒绝」。

### t178_test_f002 - describe "assert_valid_sender" 未恢复 renderer_index_pathname 全局状态

- 严重度：minor
- 锚点：行为缺陷——`helpers.test.ts:135` describe 仅 afterEach 恢复 `ELECTRON_RENDERER_URL`，未恢复 `set_renderer_index_path`；159-168 测试 `set_renderer_index_path("")` 后，模块级 `renderer_index_pathname` 保持 null 直至文件结束。
- 位置：`tests/unit/ipc/helpers.test.ts:135-219`
- 问题：模块级全局状态跨测试泄漏，当前所有测试通过是依赖「该 describe 中唯一 set 的测试传空串」的巧合顺序；后续在 159-168 与 200-208 之间插入任何带非空 `set_renderer_index_path` 的测试都会静默改变 I15 的验证路径。与 t067 describe 的 `beforeEach`/`afterEach` 对称清理（13-20 行）不一致。
- 建议：为该 describe 增加 `afterEach(() => set_renderer_index_path(""))`，与 t067 describe 保持一致。

### t178_test_f003 - popup-ipc/token-stats-ipc 顶层 set_renderer_index_path 为冗余误导

- 严重度：minor
- 锚点：行为缺陷——`tests/unit/ipc/popup-ipc.test.ts:14`、`tests/unit/ipc/token-stats-ipc.test.ts:7` 顶层 `set_renderer_index_path` 初始化的模块实例在 `beforeEach` 的 `vi.resetModules()` 后成为孤儿；测试体 `await import(...)` 得到的被测模块引用的 helpers 是 beforeEach 中动态 import 并重新 set 的新实例，顶层 set 对被测试代码路径无实际作用。
- 位置：`tests/unit/ipc/popup-ipc.test.ts:14`、`tests/unit/ipc/token-stats-ipc.test.ts:7`
- 问题：实测 7 个 IPC 测试文件 97 用例全通过，说明 beforeEach 重新 set 才是生效路径；顶层 set 不生效但给人「顶层已初始化即足够」的错误暗示——若删除 beforeEach 中的重新 set，测试将失败（新实例未初始化拒绝一切 file://）。无害但冗余且具误导性。
- 建议：删除两文件顶层 set 调用，保留 beforeEach 动态 import + set（其上的注释已说明 resetModules 原因）；或明确注释顶层 set 仅为 collect 阶段兜底。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：`helpers.test.ts:159-168` 旧测试「allows file:// sender (packaged app pages)」断言从 `.not.toThrow()` 反转为 `.toThrow()` 并更名——该场景（未初始化 + `file:///index.html`）正是 spec AC1 明确要求拒绝的输入，属于契约变化驱动的预期更新，非迁就实现；正向「已初始化打包页面允许」场景由 t067 describe 测试 1（`helpers.test.ts:22-29`）保留覆盖。其余文件仅改 fixture sender URL（未初始化 `file:///index.html` → 生产格式 `file:///D:/app/out/renderer/index.html`），断言预期未变。无「迁就实现」改测。
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
    - `tests/unit/ipc/grok_auth_ipc.test.ts:7` 初始化路径用 `D:/Dev/Code/omni_panel/out/renderer/index.html`，其余文件用 `D:/app/out/renderer/index.html`；各自 set 与 sender 自洽，风格不一致。
    - helpers.test.ts 中「未初始化拒绝 file://」用例（40-48 与 159-168）功能重复；一在 t067 describe（beforeEach 先 set 再覆盖）一在通用 describe，冗余但刻意，可不改。
- 总体判断：实现与 6 个 IPC 测试文件的适配已实测通过（7 文件 97 用例），AC1/AC2/AC3 均有直接覆盖，改测方向符合契约，仅 3 条 minor 级状态卫生/语义漂移问题，不阻断。
- 系统性 follow-up：无

verdict: PASS
