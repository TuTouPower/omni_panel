# p241 已启用但缺必填密钥的连接器持续报错：commandcode 实例每轮 refresh 失败

- 来源：打包版实测（2026-09-16，`artifacts/mac-arm64`，日志 `~/Library/Application Support/OmniPanel/logs/app-2026-09-16.log`）
- 内容：
    - **现象**：本机配置里 `commandcode` 实例 `enabled: true`、`parameterValues` 只有 `API_BASE`，而 manifest 的 `API_KEY` 是 `required: true` 的 secret（`connectors/commandcode/manifest.json`）。每轮刷新固定失败：`Connector 5684d471-… (COMMANDCODE) attempt 2/3 failed: Missing required secret: API_KEY`（`refresh-service` 的 `build_params` 在缺必填 secret 时显式抛错，属设计行为），卡片长期停留在失败态。
    - **待决定的事项**：
        1. 「添加账号」是否应允许在必填密钥缺失时就把实例置为 `enabled: true`（当前允许，用户可跳过密钥直接保存），或应改为禁用态 + 明确提示；
        2. 已启用的实例缺必填 secret 时，是继续每轮抛错（当前行为，日志噪音 + 失败卡片），还是自动置为 disabled / 进入「待配置」态；
        3. 失败文案对用户是否足够可操作（当前 `Missing required secret: API_KEY` 为英文内部串，卡片上是「采集失败」+ 该串）。
    - **为什么现在没做**：属产品行为决策（是否允许无密钥启用、缺密钥如何呈现），且与本轮 p228/p236-238 的修复无耦合；`config-store` 已有 `prune_unhealthy_plugins` 之类机制，改动面需要先定策略。
- 线索：本机 `~/Library/Application Support/OmniPanel/config.json` 中该实例（`manifestId: "commandcode"`，`parameterValues` 无 `API_KEY`）；日志 grep `Missing required secret`。相关实现 `src/main/core/scheduler/refresh-service.ts` 的 `build_params` 必填 secret 分支、`src/renderer/lib/common-services.ts`（commandcode 入口由 t489 新增）。
- 处理：未开
