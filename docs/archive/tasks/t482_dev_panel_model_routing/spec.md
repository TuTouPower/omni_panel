# Task spec

## 背景

`project_manager` 的 `app/model_routing.py` 实现了一套 New API 模型路由管理（5 个固定 slot、按渠道模型归属智能分发、自检），随该仓废弃需迁入 omni_panel 的开发面板（t481 建立的面板骨架）。凭证与预设模型列表继续读外部 yaml，不迁入 omni_panel 配置。

用户裁定（2026-09-14，与 t473/t480 一致）：Web 与桌面同权限，模型路由在 **Web 端可完整操作**（配置读取、渠道列表、保存映射、模型自检），不限仅桌面 IPC；宿主持有的外部 token 不下发给 renderer/browser。部分失败与快照策略、二次确认两端一致。

本仓核实（2026-09-14）：开发面板 route `dev` 与窗口/导航骨架由 t481 建立（本 task 依赖 t481）。外部 yaml 与 New API 服务端为外部事实，只读、不实际访问、不读 token。

## 契约区

### 范围

- 主进程实现 New API 路由管理模块：读取外部 yaml（路径见依赖与约束）、拉取渠道列表、解析当前 slot 映射、按渠道归属计算并写回 `model_mapping` / `models`、模型自检请求。
- 通道组：配置读取、渠道列表、保存映射、模型自检；**两端可达**——桌面经 preload IPC（route `dev` 暴露）、Web 经 LocalAPI HTTP/bridge，业务结果一致。Web 端不因入口降级。
- renderer 在开发面板内渲染模型路由区：5 个 slot 下拉选择 + 保存 + 自检结果展示 + 保存后逐渠道变更明细。
- 5 个固定 slot：`default_model`、`default_haiku`、`default_sonnet`、`default_opus`、`default_vision`，并对 `~/.claude/settings.json` 中带 `[1m]` 的 slot 展开 `slot[1m]` 映射。
- 保持旧实现渠道分发语义：别名归一、只写支持该模型的渠道、移除不支持渠道中的 slot、不增删渠道原有真实模型名、保留其他非 slot 映射、保存前调整同一模型渠道优先级唯一。
- **部分失败与快照策略（两端一致）**：
    - 保存遇到多渠道写入部分失败时：**停止后续写入**，报告成功/失败/未执行三类结果（逐渠道），**保留修改前快照**，**不自动回滚**。
    - 快照覆盖本次被修改的全部字段：`models`、`model_mapping`、`priority`；快照安全存放（宿主本地、不入 IPC 明文外泄；token 不下发）。
    - 二次确认在两端一致：保存前须显式确认，失败后展示快照与成功/失败/未执行明细供用户决定。
- **HTTP 200 + success:false** 必须判为失败（保留旧实现回归用例），两端一致。
- 脱敏：外部 token 仅宿主持有；两端响应对象均不含 token（如 `session`），renderer/browser 与日志均不得出现凭证明文。

### 非范围

- 不把 New API 凭证 / 预设模型列表迁入 omni_panel config / vault（继续读外部 yaml，宿主持有）。
- 不改 New API 服务端，不做渠道增删，不做非 slot 映射编辑 UI。
- 不做 commit 历史（见 t481）。
- 不新增认证（t473 基线）；不做 token 下发。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：开发面板展示 5 个 slot 的下拉选择器，选项来自外部 yaml 的 `models` 预设列表；当前渠道映射值不在预设列表中时追加为可选项。
- [ ] AC-002：点「保存」后，对每个 `default` 分组且启用的渠道：模型属于该渠道则写入该 slot 映射并在其 `models` 增补 slot key；不属于则从该渠道 `models` 与 mapping 中移除该 slot。
- [ ] AC-003：保存时模型名与别名视为同一模型（别名归一为 canonical 名展示，写回用该渠道实际存在的名字）；不增删渠道原有真实模型名，保留渠道其他非 slot 映射。
- [ ] AC-004：保存前保证同一模型所属的多个 `default` 启用渠道优先级互不相同；无冲突则不改动。
- [ ] AC-005：保存完成后展示逐渠道变更明细（新增 / 移除的 slot 与模型）。
- [ ] AC-006：点某 slot 的「测试」后展示模型自检返回的模型名；请求失败时展示可读错误，不崩溃。
- [ ] AC-007：外部 yaml 缺失、缺少必需字段或 New API 不可达时，面板展示可读错误与配置路径提示，不崩溃。
- [ ] AC-008：模型路由区全部可见元素使用 DESIGN.md 定义的设计 token 与统一 ui 组件库（`src/renderer/components/ui/`），不出现散落字面量色值或自造组件样式。
- [ ] AC-009：凭证明文（`session` token）不出现在 renderer 日志与 UI；两端响应给 renderer/browser 的配置对象均不含 `session`。
- [ ] AC-010：Web 端可完整执行读取配置、列出渠道、保存映射、发起自检（与桌面同权限），业务结果与桌面一致。
- [ ] AC-011：保存部分失败时停止后续写入，返回成功/失败/未执行逐渠道分类；修改前快照（`models`/`model_mapping`/`priority`）被保留且可查；不自动回滚。
- [ ] AC-012：写接口返回 `HTTP 200 + success:false` 被判为失败并计入失败渠道，两端一致（回归旧实现语义）。
- [ ] AC-013：保存前二次确认在桌面与 Web 两端都存在且语义一致。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001～AC-013 可自动测试（主进程逻辑以本地 mock HTTP 面对 New API 端点 + fixture yaml；UI 以 renderer 测试 + e2e 覆盖；部分失败用可控 mock 返回）。
- AC-002 / AC-004 对真实 New API 的最终落库效果、真实 New API 字段/分页形态、真实模型自检回复名解析：属 `[deploy]` / 执行期 spike 人工签收项（见未知契约），mock 通过不等于真实核实。

## 上下文区

- 来源（核实日期 2026-09-14）：`project_manager` 仓 `app/model_routing.py`（515 行）、`docs/model_routing.md`（行为契约与 New API 交互示例）、`tests/test_model_routing.py`；配置样例 `~/kar/code/my_file/config/files/new_api.yaml`。**注：以上外部仓内容为历史记录引用，本 task 不访问外部仓、不读真实 token；外部事实按未知契约标记待验证。**
- 迁移保留：`MODEL_SLOTS`、`_ENV_TO_SLOT`、`_extract_model_name`（自检返回名解析）、`_resolve_channel_priorities`、`update_all_mappings` 写入算法、`parse_current_mapping` 别名归一。
- 迁移替换：Python `requests` → 宿主 undici NetClient；Streamlit UI → React + 统一 ui 组件库；`/tmp` 文件锁 → 主进程内存串行（单进程无跨会话并发）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- `settings.json` 里 `[1m]` 标签对真实 Claude Code 行为的端到端影响：不在本应用职责内，只测标签读取 → slot 展开。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 主进程逻辑：本地 `node:http` mock 服务模拟 `GET /api/channel/`（分页）与 `PUT /api/channel/`，断言写回 payload 的 `models` 与 `model_mapping`（JSON 字符串）；fixture yaml 写入临时目录。
- 写接口返回 `HTTP 200 + success:false` 必须判失败（保留旧实现回归用例）。
- 部分失败：mock 在第 N 个渠道返回失败，断言「停止后续写入 + 成功/失败/未执行分类 + 快照保留 + 不自动回滚」。
- 不 mock 的部分：别名归一、slot 展开、优先级调整、模型名解析均为真实调用。
- UI：断言 slot 选择器渲染、保存后明细、错误态；web 端断言 HTTP 通路（不依赖真实 New API）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- New API 适配边界已由 s038 本地受控 HTTP spike 固定：渠道列表按 `data.items` 读取并使用 `p` 分页，`status` / `group` 为读取字段，PUT 不发送只读 `status`；真实目标版本字段差异仍属 `[deploy]` 人工复核项（不读取真实 token、不实际访问服务）。
- 自检回复名解析已由 s038 fixture 覆盖普通 `model` 与嵌套 `reasoning_content.model`；未覆盖的真实模型回复仍属 `[deploy]` 人工复核项，不将 mock 结果表述为真实服务核实。

### 风险与回退

- 风险：写错真实渠道映射影响线上模型路由。回退：保存前先拉取并记录原 `models`/`model_mapping`/`priority` 快照，部分失败即停止后续写入并展示快照，不自动回滚；写操作两端均需二次确认。
- 风险：外部 yaml 结构与旧实现漂移（本地样例多出 `context` 字段、别名写法不同）。回退：解析容忍未知字段与字符串 / 数组两种 alias 形态（对齐旧实现）。
- 回退：纯新增能力，出问题整体回退该 commit。

### 依赖与约束

- 依赖：t481（开发面板骨架与 route `dev`）；已用 `task.py edit --depends-on t481` 登记。
- 平台：宿主执行网络与配置读；Web 经 HTTP/bridge 同权限操作。
- 安全：外部 `session` token 属凭证，仅主进程持有，不经 IPC/HTTP 下发、不落日志；写操作需用户显式确认；快照本地安全存放。
- 配置来源路径：`~/kar/code/my_file/config/files/new_api.yaml`（外部仓，只读；未访问，作为目标路径约定）。
- 界面规范：以 `DESIGN.md` 为唯一设计真相源，只消费其 token 与 `src/renderer/components/ui/` 组件；本 task 不改 `DESIGN.md` 数值。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：§5 跨模块契约新增模型路由 IPC/HTTP 通道组与外部配置来源。
- `docs/blueprint/decisions.md`：New API 部分失败策略（停止后续写入、保留快照、不自动回滚）与 web 同权限操作。
- `docs/specs_index.md` + `docs/specs/dev-panel.md`：追加模型路由行为契约（并入 t481 建立的 dev 面板 spec）。
