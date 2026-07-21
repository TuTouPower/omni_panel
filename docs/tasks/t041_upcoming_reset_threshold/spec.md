# Task spec

## 背景

「即将重置」面板（t005 UpcomingResetBanner/Rail）当前按固定逻辑展示所有快重置账号，用户无法控制（a）哪些账号纳入监控（b）"剩多少时"才算"即将"。需加账号级开关 + 全局百分比阈值，未设阈值则不展示面板。

## 范围

### 1. 数据模型（config-store）

- `AppConfiguration` 加 `upcomingResetThresholdPercent: number | null`（默认 null = 不监控；0-100 = 剩余占周期百分比 ≤ 该值时进面板）
- `accountOverrides` 加 `upcomingResetOff?: Record<provider, string[]>`（关闭监控的 accountId 集合，结构同现有 `hidden`；默认空 = 全部账号参与监控）
- Zod schema 同步；config 迁移（旧 config 无字段 → 默认 null/空）

### 2. 账号设置按钮（ui-views-web + ipc）

- 账号设置（SettingsView accounts 段，「数据标签映射」按钮旁）加自画 icon 按钮
- icon：自绘 SVG（寓意"即将/倒计时"，如沙漏或闹钟+倒三角；`src/renderer/components/Icon.tsx` 注册新 icon 名）
- tooltip：`是否监控即将重置`
- 点击 toggle 该 accountId 在 `accountOverrides.upcomingResetOff[provider]` 集合（in/out）
- 按钮态：监控开（默认）vs 关，视觉区分（如填充/描边）

### 3. 常规设置阈值输入（ui-views-web）

- SettingsView「常规」段加「即将重置提醒阈值」：number input（0-100，单位 %）+ 说明文案「重置时间剩余占周期的百分之多少时在即将重置展示；留空表示不监控」
- 留空 → 存 null；填数字 → 存 number

### 4. 即将重置面板逻辑（ui-views-web / PopupView）

- 读 `upcomingResetThresholdPercent` + `accountOverrides.upcomingResetOff`
- threshold 为 null → 整个 UpcomingResetBanner/Rail 不渲染
- threshold 非 null：对每个账号（监控开 + 有 resetAt + 可算周期）算 `剩余% = (resetAt - now) / 周期`；剩余% ≤ threshold → 进面板
- 周期来源：`resetAt - prevResetAt`（observation 历史推）；无 prevResetAt 时用 provider 默认周期（manifest 声明或 fallback 30 天）；算不出周期的账号不进面板
- 无符合账号 → 面板不渲染（不展示空态）

## 非范围

- 不改 t005 UpcomingResetBanner/Rail 视觉（仅改过滤逻辑）
- 不改 observation-store 的 resetAt/prevResetAt 写入逻辑（只读）
- 不加重置提醒通知（仅面板展示）
- 不做 provider 默认周期声明的完整体系（fallback 30 天即可，后续 provider 可在 manifest 补 `defaultResetCycleDays`）

## 验收标准

- [ ] config schema 含 `upcomingResetThresholdPercent` + `accountOverrides.upcomingResetOff`，迁移旧 config 不报错
- [ ] 账号设置「数据标签映射」旁有自画 icon 按钮，tooltip「是否监控即将重置」，点击 toggle 持久化
- [ ] 常规设置有阈值输入，留空存 null、填数存 number，持久化
- [ ] 阈值 null → 面板不渲染
- [ ] 阈值非 null + 账号剩余% ≤ 阈值 + 监控开 → 面板展示该账号
- [ ] 监控关的账号不进面板（即使剩余% 达标）
- [ ] 无符合账号 → 面板不渲染
- [ ] config schema 单测 + 面板过滤逻辑单测 + 账号按钮/常规输入组件测

## 依赖与约束

- t005 UpcomingResetBanner/Rail 已存在（本 task 改其过滤条件）
- accountOverrides 结构沿用 hidden 模式（per-provider accountId 集合）
- 纯前端 + config schema，无后端契约变更（resetAt 已由 observation-store 提供）
- 估算示例：7 天周期剩 0.7 天 = 10%；5 小时周期剩 30 分钟 = 10% → 阈值 10% 含义一致
