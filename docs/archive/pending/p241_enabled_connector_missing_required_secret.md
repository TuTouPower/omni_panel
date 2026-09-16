# p241 缺必填密钥的账号每轮重试 3 次并抛英文内部串，用户看不出要做什么

- 现象：本机 `COMMANDCODE` 实例（`enabled: true`、`parameterValues` 只有 `API_BASE`、无 `API_KEY`）每轮刷新固定失败：`refresh-service: Connector 5684d471-… (COMMANDCODE) attempt 1/3 failed: Missing required secret: API_KEY`（2026-09-16 日志，30 分钟内 6 条 = 2 轮 × 3 次重试），卡片长期停失败态。
- 影响：日志里是英文内部串（未告知缺哪个字段、去哪儿补），且对**不会自愈**的配置缺口做了 3 次重试与 error 级噪音；用户侧表现为「莫名其妙一直失败」。
- 根因：
    - **机制**：`refresh-service.ts` 的 `build_params` 在「无 vault 条目 + 无 parameterValues + 无 default」时对 `required` secret 抛错（这是刻意的：静默发空凭据会得到更误导的 401），错误进入通用重试循环 → 3 次 `trace_log.error` → 稳态 `failed`。文案是给开发看的英文串，且不区分「配置缺口」与「采集故障」。
    - **来源**：该实例是 t489 新增 commandcode 连接器后由 `auto_seed_connectors` 播下的（`name: manifest.id.toUpperCase()` = `COMMANDCODE`、`refreshIntervalSeconds: 0` 跟随全局、`parameterValues` 只含非 secret 默认值 = `API_BASE`，三项与该实例逐字吻合）；auto-seed 与 `handleConfigCreateInstance` 都以 `enabled: true` 落库，而必填 secret 只能事后填 → 未配置的连接器必然先进入失败循环。
    - **时序旁证**（无法完全重建，仅记录）：该实例所在 `config.json` 的 `removedConnectorIds` 已含 `commandcode`，但实例仍在且启用——与 t357 的「add account 失败后清理实例并写墓碑」路径吻合（清理删的是新建实例，早先 auto-seed 的实例留下）。
- 修复：`build_params` 抛带类型的 `MissingRequiredSecretError`（中文可操作文案，带账号名与字段 label）；`refresh-service` 捕获后按配置缺口处理——立即 `break`，不做重试，日志降为一条 warn：`Connector <id> (<name>) is not configured: 账号「<name>」缺少必填配置：<label>（在设置中填入后即可采集）`。稳态 `failed` 的 `error` 字段随之变为可操作中文。
- 同类位点（已扫，结论：不改）：6 个连接器脚本内另有 `Missing required secret: <NAME>` 的防御性检查（commandcode/deepseek/tikhub/kimi/kimi_web/opencode_go），因其 manifest 中该 secret 均 `exposeToScript: true`，`build_params` 会先抛错，脚本层不可达；保留为兜底。
- 未做（需产品决策，非本次范围）：是否允许「必填 secret 未配置」的实例以 `enabled: true` 存在（本次只让提示可操作、不再空重试）；以及是否为这种状态引入独立于 `failed` 的「待配置」态。用户侧可选动作：填密钥，或在设置里删除/停用该账号。
- 测试缺口：既有用例 `fails refresh when a required secret is missing instead of sending empty credentials` 只断言 failed 与错误含 `API_KEY`，不会发现「重试 3 次 + 英文串」。补断言：缺配置时 attempt 级日志为 0、有一条含账号名与「缺少必填配置」的 warn、state.error 为该中文文案。
- 线索：`~/Library/Application Support/OmniPanel/logs/app-2026-09-16.log` grep `Missing required secret`；本机 `config.json` 中该实例（`manifestId: "commandcode"`，无 `API_KEY`）。
- 处理：main-direct-fix
