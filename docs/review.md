# 当前代码审阅报告

## 范围

本次审阅对照 `TASKS.md` 中已经标记完成的任务，重点检查功能缺失、架构不足、代码健壮性和测试门禁。UI 美观不在本次评价范围内。

## 总体结论

当前代码不是“只是 UI 丑”的状态。基础架构已经搭起来，但多个已勾选完成的 MVP 能力仍有高风险缺口：密钥可能进入日志、多实例密钥闭环不完整、Settings 表单没有完整按 metadata 渲染、默认插件实例创建逻辑弱于任务描述、E2E 门禁也不可靠。

建议先修下面 HIGH 问题，再继续做 UI 美化或新增功能。

## HIGH

### 1. Secret/API Key 仍可能写入日志

- 文件：`src/main/core/plugin/command-builder.ts:20-26`
- 文件：`src/main/core/plugin/runner.ts:23-28`
- 文件：`src/main/core/scheduler/refresh-service.ts:110-116`
- 文件：`src/main/core/scheduler/refresh-service.ts:153-156`

`buildPluginCommand()` 会把参数拼成 `KEY=value` 放入命令行参数。`runner.ts` 虽然注释写着“不暴露 secret values”，但 `safeArgs` 实际没有脱敏，`log.debug("spawn: ...")` 会完整输出参数。

`refresh-service.ts` 还会记录插件 stdout/stderr 前 500 字符，以及解析失败时的 raw stdout。真实插件或错误响应如果把请求参数、认证信息、URL query、token 回显出来，也会进入日志。

这直接违反 `TASKS.md` 中“secret 值不进入日志”和“secret / API key 值绝不进入日志”的完成声明。

建议：

- 命令参数日志按 metadata 的 secret key 精确脱敏，至少把 `--usageboard-param` 后面的 `KEY=value` 按 key 过滤。
- stdout/stderr/raw stdout 日志不要默认记录原文；需要诊断时也要经过统一 redaction。
- 增加测试：传入真实 secret，断言 logger 输出不包含 secret 值。

### 2. 非零退出码没有被 RefreshService 当作失败

- 文件：`src/main/core/plugin/runner.ts:82-86`
- 文件：`src/main/core/scheduler/refresh-service.ts:109-133`

`executePlugin()` 返回了 `exitCode`，但 `refresh-service.ts` 不检查它，直接解析 stdout。插件非零退出但 stdout 恰好是合法 JSON 时，应用会保存 cache 并把状态标记为 ready。

这和插件契约里“非零退出码是执行失败，应优先展示 stderr”的语义不一致，也会造成缓存和 UI 状态误判。

建议：

- `result.exitCode !== 0` 时进入 failed 路径。
- 错误消息优先使用安全脱敏后的 stderr 摘要。
- 补集成测试：非零退出码加合法 stdout 也必须失败，不能写 cache。

### 3. 复制出来的插件实例无法保存或注入密钥

- 文件：`src/main/index.ts:168-180`
- 文件：`src/main/ipc/config-ipc.ts:97-103`
- 文件：`src/main/ipc/config-ipc.ts:128-143`
- 文件：`src/main/core/scheduler/refresh-service.ts:50-58`

`secretParamKeys` 只在启动时根据当时的 config 构建一次。`handleConfigDuplicate()` 运行时创建新实例后，没有更新 `secretParamKeys`，也没有触发 `onConfigSaved` 重建调度。

结果：

- 新复制实例的 `saveSecrets()` 找不到 allowed keys，直接 `ok(undefined)`，但实际没有保存任何 secret。
- refresh 时也找不到 secret keys，不会从 `SecretsStore` 注入密钥。
- UI 看起来复制成功，但多账号 API key 插件不可用，且没有错误提示。

这破坏了 Round 11 多实例/多账号和 Round 14.2 密钥回注的核心目标。

建议：

- 不要用一次性 `Map` 保存 secret metadata；改为按插件 executable path / definition 动态解析，或在配置变化和 duplicate 后统一重建。
- `handleConfigDuplicate()` 成功后调用同一套 config saved 回调。
- `allowedKeys` 缺失时不应静默成功，至少记录 warning 或返回验证错误。

### 4. Settings 的 metadata 表单能力没有兑现

- 文件：`src/renderer/components/SettingsForm.tsx:52-80`

`TASKS.md` 标记已完成“secret→password / choice→select / boolean→checkbox”，但当前实现只有 boolean 特判；choice 参数仍渲染成普通 text input。真实 bundled plugin 中 Claude 插件存在 choice 参数。

另外 boolean 保存也有缺陷：未勾选的 checkbox 不会出现在 `FormData` 中，当前代码遇到 `null` 就跳过，因此之前保存为 true 的值无法可靠改回 false。

建议：

- 对 `choice` 渲染 `<select>`，选项来自 metadata。
- 对 boolean 参数显式写入 false 或删除旧值，不能跳过。
- 对 integer 增加 metadata / 业务范围约束。

### 5. Secret 输入框首次打开就显示 `***`，会误导用户且阻止首次保存

- 文件：`src/renderer/components/SettingsForm.tsx:72-75`
- 文件：`src/renderer/components/SettingsForm.tsx:33-35`

所有 secret 参数都无条件 `defaultValue="***"`。如果用户首次配置 API key，页面看起来像已经有 key；required 校验也会因为 `***` 非空而通过。提交时 `***` 又被当作“不修改”，不会保存任何 secret。

结果是用户可能以为密钥已保存，但插件刷新仍然拿不到 key。

建议：

- 只有确认 secret 已存在时才显示占位/掩码。
- DTO 中增加 `hasSecret` 之类布尔值，而不是把 `***` 当真实表单值。
- 首次无 secret 时输入框应为空，并让 required 正常生效。

### 6. 默认插件实例创建只处理“完全空配置”，不是按 executablePath 去重补齐

- 文件：`src/main/index.ts:139-159`

`TASKS.md` 要求用 `executablePath` 做去重保护，并避免重复创建。但当前逻辑只有：`config.plugins.length === 0` 时一次性 seed 所有 definitions。

问题：

- 部分配置、迁移配置、损坏后恢复的配置只要已有 1 个 plugin，就不会补齐其他 bundled plugins。
- 后续版本新增 bundled plugin，老用户不会自动看到。
- 实际没有实现“同一脚本不创建重复实例”的 executablePath 去重逻辑，只是空数组保护。

建议：

- 抽出 `seedMissingPluginInstances(config, definitions)` 纯函数。
- 对每个 definition 检查现有 canonical executable path，不存在才创建。
- 单元测试覆盖空配置、部分配置、重复路径、新插件加入、instanceId 唯一。

### 7. 用户插件和内置插件同名时 metadata 可能匹配错

- 文件：`src/main/index.ts:170-171`
- 文件：`src/main/ipc/plugin-ipc.ts:53-58`

定义查找使用 `basename(plugin.executablePath)` 和 `definition.scriptName` 匹配。若用户插件和内置插件文件名相同，会拿到错误的 metadata。

影响：

- Settings 参数表单可能渲染成另一个插件的表单。
- secret key 集合错误，导致 secret 保存/注入失败。
- displayName 也可能基于错误 metadata。

建议：

- 使用规范化后的完整 executable path 作为定义身份。
- 或在 `PluginConfiguration` 中持久化明确的 definition id。

### 8. E2E CI 门禁声明不可靠

- 文件：`package.json:27`
- 文件：`.github/workflows/ci.yml:61-62`
- 文件：`tests/user_e2e/global_setup.ts:1-8`
- 文件：`tests/user_e2e/fixtures/electron_app.ts:6-35`

E2E launcher 直接启动 `.vite/build/index.js`，但 CI 只运行 `pnpm test:e2e`，没有先构建 Electron main entry。`global_setup.ts` 也明确写着“Build is expected to exist”。

这意味着 fresh checkout 的 CI E2E 不是稳定门禁：可能因为没有构建产物而失败，也可能在本地依赖旧 `.vite/build` 产物误通过。

建议：

- 增加明确的 `test:e2e` 前置构建步骤。
- 或在 `global_setup.ts` 检查 `.vite/build/index.js` 不存在时直接给出清晰错误。
- `TASKS.md` 里提到的 `pnpm test:e2e:core` 当前 `package.json` 没有该脚本，也需要同步。

## MEDIUM

### 9. 手动刷新可以执行 disabled 插件

- 文件：`src/main/ipc/plugin-ipc.ts:97-105`
- 文件：`src/main/core/scheduler/refresh-service.ts:74-83`

调度和 `refreshAll()` 会过滤 disabled 插件，但单插件 refresh IPC 只校验 instanceId，然后 `force: true` 执行。`refresh-service.refresh()` 也不拒绝 disabled plugin。

如果 disabled 的语义是“不执行”，这里不一致。建议在 `refresh()` 或 IPC 层统一拒绝 disabled 插件，除非明确设计为“手动刷新可绕过 enabled”。

### 10. 配置保存防抖可能丢数据

- 文件：`src/main/core/config/config-store.ts:68-77`
- 文件：`src/main/ipc/config-ipc.ts:64-72`
- 文件：`src/main/index.ts:354-363`

`handleConfigSave()` 调用 `scheduleSave()` 后立即返回成功。如果用户保存后 500ms 内退出应用，`before-quit` 没有 flush pending save，配置可能没有落盘，但 UI 已经认为保存成功。

建议：

- `ConfigStore` 增加 `flushPendingSave()`。
- `before-quit` 调用并等待 flush。
- 或对用户点击保存这种明确动作使用立即保存，只对高频输入自动保存使用防抖。

### 11. Duplicate Plugin 后 Settings UI 不刷新

- 文件：`src/renderer/hooks/use-config.ts:68-75`
- 文件：`src/renderer/views/SettingsView.tsx:93`
- 文件：`src/main/ipc/config-ipc.ts:111-143`

renderer 调用 duplicate 后没有重新加载 config，也没有把新增实例合并进本地 state。用户点击“复制”后通常看不到新实例，除非重新打开窗口或刷新。

建议：duplicate 成功后重新 `config.get()`，或让 duplicate IPC 返回新配置 / 新实例。

### ~~12. Dashboard/Popup 没显示上次更新时间，失败状态也丢掉 lastSuccess 内容~~ ✅ 已修复

- 文件：`src/main/ipc/plugin-ipc.ts:31-39`
- 文件：`src/renderer/components/PluginCard.tsx:23-30`
- 文件：`src/renderer/components/PluginCard.tsx:32-55`

**Phase 15 已修复**：PluginCard ready 和 failed 状态均显示相对时间（”刚刚” / “X 分钟前”），通过 `useRelativeTime` hook 每秒刷新。failed 状态同时展示 stale 数据和错误信息。

### 13. refresh 按钮错误不会进入 UI error state

- 文件：`src/renderer/components/RefreshButton.tsx:14-18`
- 文件：`src/renderer/hooks/use-plugins.ts`

`RefreshButton` 使用 `void onClick().finally(...)`。如果 refresh promise reject，finally 返回的 promise 仍会 reject，但被丢弃。hook 层也没有把 refresh 失败写入 error state。

建议：按钮或 hook 捕获错误，停止 spinner 并显示错误信息。

### 14. IPC config save 信任 renderer 传入完整配置

- 文件：`src/main/ipc/config-ipc.ts:64-72`
- 文件：`src/main/core/config/types.ts`

`handleConfigSave()` 只做 schema 结构校验，然后接受 renderer 传来的完整 `AppConfiguration`。`executablePath` 只要求非空字符串，未验证是否来自已发现插件或允许目录。

**Phase 14 已修复**：refresh interval 已由 schema 强制为 60–3600 秒（1–60 分钟）。

考虑到 renderer 是信任边界外侧，这里建议至少：

- 只允许修改已存在 instance 的可编辑字段。
- executablePath / stateId / instanceId 不由 renderer 任意改。

## 测试覆盖缺口

### 1. Auto-seeding 测试过弱

当前 E2E 多处只验证 `count > 0`。这不能证明：

- N = bundled plugin 数量
- 6 个内置插件都创建了
- instanceId 唯一
- 同一脚本不会重复创建
- 非空部分配置会补齐缺失插件

建议抽纯函数做单元测试，E2E 只保留关键冒烟。

### 2. Scheduler wiring 测试过弱

`plugin-scheduler` 自身有测试，但 `main/index.ts` 中的 wiring 缺少可验证测试：

- app ready 后只启动 enabled plugins
- config save 后 stop/restart 并使用新间隔
- suspend 调用 stopAll
- resume / 4 小时 safety net 重启调度

建议把 app bootstrap 中的调度 orchestration 抽成可注入函数测试。

### 3. Settings 保存 E2E 没验证真正持久化和密钥回注

现有 E2E 填表后主要断言表单还可见，不能证明：

- config 已保存
- secret 已保存
- 下次打开显示已保存状态
- 手动刷新实际拿到了 key

建议使用 fake plugin 或测试专用 userData 验证参数传递闭环。

### 4. GLM null schema 修复缺少 fixture 回归

Phase 13 的核心 bug 是 `resetAt` 和 `chart.message` 显式为 `null`。schema 当前允许 null，但测试 fixture 没有覆盖这个 case。

建议新增 fixture：`resetAt: null`、`chart.message: null`，并在 parser 测试中断言成功。

### 5. Tray / Popup E2E 并没有真正覆盖托盘行为

E2E 设置 `E2E=1`，`main/index.ts` 会跳过 tray 创建并自动打开 dashboard。`popup_view.spec.ts` 实际拿的是第一个窗口，并不能证明托盘点击、popup 定位、右键菜单等行为。

建议：

- route-level 打开 `#popup` 的测试可以保留，但不要声称覆盖托盘。
- 托盘行为放入 packaged/manual smoke 或平台专用测试。

## UI / 交互问题

### 1. 整体视觉缺少产品方向

当前 UI 更像默认组件拼装：卡片、按钮、表单、侧栏都很基础，没有形成“用量监控桌面应用”的明确气质。对于这个产品，更适合偏“仪表盘 / 控制台 / 数据监控”的视觉语言：清晰层级、强数据焦点、状态颜色明确、密度适中，而不是普通设置页和普通列表。

建议：

- 先确定一个统一方向，例如“工业监控台 / 数据驾驶舱”。
- Dashboard 应突出数值、额度、剩余量、状态和更新时间，而不是只显示普通列表。
- Settings 应像配置面板，有清晰分组、状态提示和保存反馈。

### ~~2. Dashboard 信息层级太弱~~ ✅ 大部分已修复

- 文件：`src/renderer/components/PluginCard.tsx:32-55`

**已修复**：百分比文本、接近上限警告（>=75% 黄色，>=90% 红色）、相对更新时间（Phase 15）。

未修复：

- badge / chart：IPC 和 schema 支持这些字段，但 UI 基本没有利用。

建议：

- `badge` 和 `chart` 如果插件返回，应在卡片中有稳定展示位置。

### 3. 失败状态交互不够友好

- 文件：`src/renderer/components/PluginCard.tsx:23-30`
- 文件：`src/main/ipc/plugin-ipc.ts:31-39`

失败卡片只显示错误文本，没有展示可恢复操作，也没有展示 lastSuccess 的旧数据。用户看到失败后不知道：

- 是缺 API key、网络失败、schema 错误，还是 Python 环境问题。
- 是否仍有上次成功数据可参考。
- 下一步应该去 Settings 填 key，还是点刷新重试。

建议：

- failed 状态显示“错误摘要 + 上次成功数据 + 重试按钮 + 去设置入口”。
- 对常见错误给出行动提示，例如“缺少 API Key，请前往设置”。
- 错误详情可以折叠展示，避免卡片被长错误撑爆。

### 4. Settings 表单不像配置中心

- 文件：`src/renderer/views/SettingsView.tsx`
- 文件：`src/renderer/components/SettingsForm.tsx:45-105`

Settings 当前只是侧栏加表单，缺少配置中心应有的交互反馈：

- 保存后没有明显成功提示。
- duplicate 后 UI 不刷新，新实例不出现。
- secret 字段无条件显示 `***`，会误导首次配置用户。
- choice 没有 select，boolean false 无法可靠保存。
- 参数缺少说明文本、默认值提示、必填标识和错误提示。

建议：

- 每个插件配置页顶部显示插件状态、启用状态、刷新间隔、最后刷新结果。
- 保存后显示明确 toast 或 inline success 状态。
- secret 字段区分“未设置”和“已保存”。
- 参数按 metadata 类型渲染完整控件，并展示 help/description。

### 5. 刷新交互反馈不足

- 文件：`src/renderer/components/RefreshButton.tsx:14-18`
- 文件：`src/renderer/hooks/use-plugins.ts`

刷新按钮只有 spinner，没有错误反馈、成功反馈或防重复点击语义。刷新失败时 promise 可能被丢弃，UI 也不会明显提示用户。

建议：

- 刷新中禁用按钮，避免重复触发。
- 刷新成功后短暂显示“已刷新”或更新相对时间。
- 刷新失败时在对应卡片或页面顶部展示错误。

### 6. 空状态缺少引导

- 文件：`src/renderer/components/EmptyState.tsx`
- 文件：`src/renderer/views/DashboardView.tsx`
- 文件：`src/renderer/views/SettingsView.tsx`

首次启动、无插件、无参数、缺 Python、缺 API key 这些状态需要不同引导。当前空状态偏通用，不能告诉用户下一步做什么。

建议：

- 无插件：提示插件目录和重新扫描。
- 有插件但缺 key：引导到 Settings。
- 缺 Python：显示安装 Python 的说明和当前检测结果。
- 无数据但可刷新：提供刷新按钮和状态说明。

### 7. Popup / Dashboard / Settings 的产品关系不清晰

- 文件：`src/main/index.ts:266-318`
- 文件：`src/renderer/views/PopupView.tsx`
- 文件：`src/renderer/views/DashboardView.tsx`

当前同时存在 Popup、Dashboard、Settings，但信息架构不清楚：Popup 和 Dashboard 展示内容接近，托盘行为和测试覆盖也不稳定。`TASKS.md` 后续还写了“移除 popup 独立窗口”的需求，但当前代码仍保留 popup。

建议：

- 明确三者职责：Popup 是轻量速览，Dashboard 是完整监控，Settings 是配置。
- 如果决定移除 Popup，就同步删除入口、测试和文档，避免维护两套近似 UI。
- 托盘左键/右键行为要和窗口职责一致。

### 8. 可访问性和键盘操作还不够

- 文件：`src/renderer/components/SettingsForm.tsx`
- 文件：`src/renderer/components/RefreshButton.tsx`

已有基础 label 和 aria-label，但还不够完整：

- 表单错误没有 `aria-describedby`。
- 保存状态没有 live region。
- 侧栏插件导航需要明确当前选中状态。
- loading / failed / success 状态应可被屏幕阅读器感知。

建议：

- Settings 侧栏使用明确的选中语义。
- 保存成功/失败使用 `aria-live` 区域。
- 表单字段错误和帮助文本用 `aria-describedby` 关联。

### 9. 缺少桌面应用应有的“质感”细节

当前界面缺少这些能显著提升可用感和完成度的细节：

- 窗口最小宽高下的布局适配。
- 卡片 hover / focus / active 状态。
- 加载时骨架屏和真实内容尺寸不一致。
- 长插件名、长错误、长参数 label 的溢出处理。
- 明暗主题或系统主题适配的一致性验证。

建议先补信息层级和交互反馈，再做视觉风格；否则只是换皮，功能感仍然弱。

## 已完成得比较好的部分

- TypeScript strict、lint、dependency-cruiser、Knip 等基础门禁已经配置并能形成约束。
- 插件发现和 bundled metadata 的基础测试有价值，至少能证明 6 个内置插件 metadata 可解析。
- `parsePluginOutputOrError` 方向正确，能区分业务错误 JSON 和 schema 错误。
- 调度器 primitive 自身测试相对扎实，主要缺口在 app wiring。
- Windows 反斜杠路径 bug 已有针对性回归测试，比之前的 E2E 假断言强很多。

## 建议修复顺序

1. 先修 secret 日志泄漏，并补 redaction 测试。
2. 修非零退出码处理，避免失败插件被标记 ready。
3. 修 duplicate 后的 secret metadata / scheduler / UI 刷新闭环。
4. 修 SettingsForm：secret 首次显示、choice select、boolean false、refresh interval。
5. 抽出 auto-seeding 和 scheduler wiring 纯逻辑，补精确测试。
6. 修 E2E 构建前置和 CI 脚本声明不一致。
7. 再处理 Dashboard stale cache / updatedAt 展示和托盘行为测试。

## 最终判断

Request changes。当前代码不是“UI 丑但功能基本完成”的状态，而是核心 MVP 仍有几个会直接影响真实使用的缺口。尤其是 secret 日志、复制实例密钥、Settings 表单和 E2E 门禁，需要先修。

注意：本次审阅未执行完整 `pnpm test` / `pnpm test:e2e` / 打包 smoke；结论来自静态审阅和关键文件抽查。

## 审阅过的重点文件

- `TASKS.md`
- `package.json`
- `.github/workflows/ci.yml`
- `tests/user_e2e/global_setup.ts`
- `tests/user_e2e/fixtures/electron_app.ts`
- `src/main/index.ts`
- `src/main/ipc/plugin-ipc.ts`
- `src/main/ipc/config-ipc.ts`
- `src/main/core/plugin/command-builder.ts`
- `src/main/core/plugin/runner.ts`
- `src/main/core/scheduler/refresh-service.ts`
- `src/main/core/config/config-store.ts`
- `src/renderer/components/SettingsForm.tsx`
- `src/renderer/components/PluginCard.tsx`
- `src/renderer/components/RefreshButton.tsx`
- `src/renderer/hooks/use-config.ts`
- `src/renderer/hooks/use-plugins.ts`
