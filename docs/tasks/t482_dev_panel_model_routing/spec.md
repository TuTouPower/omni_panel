# Task spec

## 背景

`project_manager` 的 `app/model_routing.py` 实现了一套 New API 模型路由管理（5 个固定 slot、按渠道模型归属智能分发、自检），随该仓废弃需迁入 omni_panel 的开发面板（t481 建立的面板骨架）。凭证与预设模型列表继续读外部 `new_api.yaml`，不迁入 omni_panel 配置。

## 契约区

### 范围

- 主进程实现 New API 路由管理模块：读取 `new_api.yaml`、拉取渠道列表、解析当前 slot 映射、按渠道归属计算并写回 `model_mapping` / `models`、模型自检请求。
- IPC 通道组：配置读取、渠道列表、保存映射、模型自检；经 preload 仅对 route `dev` 暴露（桌面端）。
- renderer 在开发面板内渲染模型路由区：5 个 slot 下拉选择 + 保存 + 自检结果展示 + 保存后逐渠道变更明细。
- 5 个固定 slot：`default_model`、`default_haiku`、`default_sonnet`、`default_opus`、`default_vision`，并对 `~/.claude/settings.json` 中带 `[1m]` 的 slot 展开 `slot[1m]` 映射。
- 保持旧实现渠道分发语义：别名归一、只写支持该模型的渠道、移除不支持渠道中的 slot、不增删渠道原有真实模型名、保留其他非 slot 映射、保存前调整同一模型渠道优先级唯一。

### 非范围

- 不把 New API 凭证 / 预设模型列表迁入 omni_panel config / vault（继续读外部 `new_api.yaml`）。
- 不改 New API 服务端，不做渠道增删，不做非 slot 映射编辑 UI。
- 不做 commit 历史（见 t481）。
- 不在 web 端提供写操作。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：开发面板展示 5 个 slot 的下拉选择器，选项来自 `new_api.yaml` 的 `models` 预设列表；当前渠道映射值不在预设列表中时追加为可选项。
- [ ] AC-002：点「保存」后，对每个 `default` 分组且启用的渠道：模型属于该渠道则写入该 slot 映射并在其 `models` 增补 slot key；不属于则从该渠道 `models` 与 mapping 中移除该 slot。
- [ ] AC-003：保存时模型名与别名视为同一模型（别名归一为 canonical 名展示，写回用该渠道实际存在的名字）；不增删渠道原有真实模型名，保留渠道其他非 slot 映射。
- [ ] AC-004：保存前保证同一模型所属的多个 `default` 启用渠道优先级互不相同；无冲突则不改动。
- [ ] AC-005：保存完成后展示逐渠道变更明细（新增 / 移除的 slot 与模型）。
- [ ] AC-006：点某 slot 的「测试」后展示模型自检返回的模型名；请求失败时展示可读错误，不崩溃。
- [ ] AC-007：`new_api.yaml` 缺失、缺少必需字段或 New API 不可达时，面板展示可读错误与配置路径提示，不崩溃。
- [ ] AC-008：模型路由区全部可见元素使用 DESIGN.md 定义的设计 token 与统一 ui 组件库（`src/renderer/components/ui/`），不出现散落字面量色值或自造组件样式。
- [ ] AC-009：凭证明文（`session` token）不出现在 renderer 日志与 UI；IPC 返回给 renderer 的配置对象不含 `session`。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001～AC-006、AC-008、AC-009 可自动测试（主进程逻辑以本地 mock HTTP 面对 New API 端点 + fixture `new_api.yaml`；UI 以 renderer 测试 + e2e 覆盖）。
- AC-007 的「New API 不可达」可自动测试（指向闭端口）；AC-002 / AC-004 对真实 New API 的最终落库效果属 `[deploy]` 人工签收项。

## 上下文区

- 来源（核实日期 2026-09-14）：`project_manager` 仓 `app/model_routing.py`（515 行）、`docs/model_routing.md`（行为契约与 New API 交互示例）、`tests/test_model_routing.py`；配置样例 `~/kar/code/my_file/config/files/new_api.yaml`。
- 迁移保留：`MODEL_SLOTS`、`_ENV_TO_SLOT`、`_extract_model_name`（自检返回名解析）、`_resolve_channel_priorities`、`update_all_mappings` 写入算法、`parse_current_mapping` 别名归一。
- 迁移替换：Python `requests` → 宿主 undici NetClient；Streamlit UI → React + 统一 ui 组件库；`/tmp` 文件锁 → 主进程内存串行（单进程无跨会话并发）。

### 有意不测

- `settings.json` 里 `[1m]` 标签对真实 Claude Code 行为的端到端影响：不在本应用职责内，只测标签读取 → slot 展开。

### 测试策略

- 主进程逻辑：本地 `node:http` mock 服务模拟 `GET /api/channel/`（分页）与 `PUT /api/channel/`，断言写回 payload 的 `models` 与 `model_mapping`（JSON 字符串）；fixture `new_api.yaml` 写入临时目录。
- 写接口返回 `HTTP 200 + success:false` 必须判失败（保留旧实现回归用例）。
- 不 mock 的部分：别名归一、slot 展开、优先级调整、模型名解析均为真实调用。
- UI：断言 slot 选择器渲染、保存后明细、错误态；不依赖真实 New API。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- New API 渠道接口在目标版本的字段与分页形态（`data.items`、`p` 参数、`status` / `group` 字段、PUT 拒绝 `status` 字段）：`UNVERIFIED-BLOCKING`，实施时以本地 mock 对齐旧实现已核实契约，并用 `curl` 对真实实例复核一次。
- 回复名解析对新型推理模型（`reasoning_content` 字段）的覆盖：`UNVERIFIED-SPIKE`，实施时对目标模型实测一次。

### 风险与回退

- 风险：写错真实渠道映射影响线上模型路由。回退：保存前先拉取并记录原 mapping，写失败即中止不改动；该写操作在面板内需二次确认。
- 风险：`new_api.yaml` 结构与旧实现漂移（本地样例多出 `context` 字段、别名写法不同）。回退：解析容忍未知字段与字符串 / 数组两种 alias 形态（对齐旧实现）。
- 回退：纯新增能力，出问题整体回退该 commit。

### 依赖与约束

- 依赖：t481（开发面板骨架与 route `dev`）。
- 平台：桌面端（主进程网络 + 配置读）；web 端只读展示或不展示。
- 安全：`session` token 属凭证，仅主进程持有，不经 IPC 下发、不落日志；写操作需用户显式确认。
- 配置来源路径：`~/kar/code/my_file/config/files/new_api.yaml`（外部仓，只读）。
- 界面规范：以 `DESIGN.md` 为唯一设计真相源，只消费其 token 与 `src/renderer/components/ui/` 组件；本 task 不改 `DESIGN.md` 数值，需要新形态时先走设计变更再实现（对齐 AGENTS.md 门禁）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：§5 跨模块契约新增模型路由 IPC 通道组与外部配置来源。
- `docs/specs_index.md` + `docs/specs/dev-panel.md`：追加模型路由行为契约（并入 t481 建立的 dev 面板 spec）。
