# Task spec

## 背景

Kimi 新增网页登录模式（对标 opencode_go 的 web_login），登录后查 `https://www.kimi.com/settings/subscription?tab=quota` 用量（含月用量）。动手实现前须先验证该页面的可机读契约：登录入口、Cookie 名、quota 数据形态（5 小时/周/月）。本 task 为纯契约 spike，只产出结论与脱敏材料，不写生产代码。

## 契约区

### 范围

- 在 `docs/spikes/` 下按流程建 spike 目录并实验（目录创建只经 `spikes.py new`，实验代码放 `code/`，真凭据只放本地不入库）。
- 核实：网页登录入口 URL、完成登录后有效的 Cookie 名、quota 页（或其背后接口）返回的 5 小时/周/月用量字段形态。
- 产出：结论写入 `docs/findings/`（`findings.py new`），脱敏 fixture 入 spike 目录供实现 task 用。

### 非范围

- 不写 `connectors/kimi_web/` 生产代码（归 t464）。
- 不改现有 Kimi 设备码/API Key 通路。
- 不入库任何真凭据、真 Cookie、个人账号数据。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`docs/findings/` 存在一条 findings 条目，明确给出 Kimi 网页登录入口 URL、有效 Cookie 名、quota 数据中 5 小时/周/月三个窗口的字段形态与取值示例（脱敏）。
- [ ] AC-002：spike 目录含可复现实验记录（步骤 + 原始响应脱敏样本），他人按记录能复核结论。
- [ ] AC-003：若 quota 页不可机读（需 JS 强交互且无背后接口），结论明确写“不可行 + 依据”，t464 不启动。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：人工实验为主，替代验证为 findings 条目 + 脱敏样本的可复核性（review 人按记录复核）。
- AC-002：同上，以 spike 目录内容为证据。
- AC-003：同上，以明确的不可行结论为证据（结论本身即交付）。

## 上下文区

- 来源：用户需求（2026-09-09：Kimi 两种登录模式 + 网页登录查月用量）；无外部来源

### 有意不测

- 自动化测试：不写，spike 交付物是结论与样本（上游页面随时会变，自动化断言无意义）。

### 测试策略

- review 人按 spike 记录复核结论；样本须脱敏（无真 Cookie/账号标识）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- Kimi 网页登录入口与 Cookie 名：UNVERIFIED-SPIKE，spike 内真实浏览器验证。
- quota 页 5 小时/周/月用量数据形态：UNVERIFIED-SPIKE，spike 内抓包/读接口验证。
- 登录态有效期与失效特征：UNVERIFIED-SPIKE，spike 内验证（决定 connector 失效报错文案）。

### 风险与回退

- 风险：需用户提供 Kimi 网页登录态配合实验（凭据不出本机）；页面强反爬则结论为不可行。
- 回退：spike 无生产改动，无需回退；不可行则 t464 不启动。

### 依赖与约束

- 需用户在实验期提供一次 Kimi 网页登录配合（执行期约）；凭据仅本地、不入库。

### Finalization 时更新的 blueprint

- 无（结论进 findings，不动长期架构）。
