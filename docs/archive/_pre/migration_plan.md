# OmniUsage → repo_template 工作流迁移计划

- 状态：待批准执行
- 日期：2026-07-20
- 范围：仅文档结构与工作流入口；代码层不动
- 模板来源：`\\wsl.localhost\Ubuntu-22.04\home\testuser\testuser_ubuntu\repo_template`

______________________________________________________________________

## Context

OmniUsage 当前采用 **omni_powers 工作流**（`docs/omni_powers/` 三区 `op_blueprint`/`op_execution`/`op_record` + 全局 skill `/opintake` `/oprun` `/opstatus`），与用户维护的通用仓库模板 `repo_template` 不兼容。模板是**纯文档工作流**（`AGENTS.md` 行为入口 + `blueprint/tasks/specs/reviews/spikes/archive` 目录 + task=commit 闭环）。

目标：完全重构 OmniUsage 的**文档结构与工作流入口**对齐模板；代码层（Electron `src`/`tests`/`scripts`/`config`/`connectors`/`schemas`/构建配置）不动。

### 已确认决策

- **力度**：全换，废弃 omni_powers 三区与本项目对 skill 的依赖（全局 skill 跨项目共用，不删）
- **入口**：`AGENTS.md` 实体 + `CLAUDE.md -> AGENTS.md` 软链由用户自行创建（需管理员权限）；助手起草 `AGENTS.md` 全文
- **T1-T8**：全部归档到 `docs/archive/tasks/`
- **research/design/prd/test**：全归 `docs/archive/`，其中 prd/test 的**内容**拆进 blueprint
- **本地状态**：`.superpowers/` `.reasonix/` `.playwright-mcp/` 删除（都在 `.gitignore`，不影响仓库）
- **现状**：`tasks_list.json` 空，T1-T8 已提交（`5efb68a`/`30d078b`），无 active task；`review_20260719_1433` 已走完 adoption；`decisions.md`/`progress.md` 均 0 字节。迁移零阻力。

______________________________________________________________________

## 阶段 0：用户操作（不在助手执行范围）

- 用户创建 `D:\Dev\Code\omni_usage\AGENTS.md` 实体（用阶段 1 起草的内容）
- 用户以管理员身份建 `CLAUDE.md -> AGENTS.md` 符号链接
- 起草完 `AGENTS.md` 全文后，内容写入 `AGENTS.md` 普通文件（若软链未建，先以普通文件落地，软链由用户随后替换）

______________________________________________________________________

## 阶段 1：新建骨架文件（复制模板 + 填占位符）

从 `repo_template` 复制以下模板文件到 OmniUsage（路径对齐，内容原样复制，占位符待填）：

|来源（repo_template）|目标（OmniUsage）|说明|
|---|---|---|
|`docs/templates/task/spec.md`|`docs/templates/task/spec.md`|原样|
|`docs/templates/task/plan.md`|`docs/templates/task/plan.md`|原样|
|`docs/templates/task/log.md`|`docs/templates/task/log.md`|原样|
|`docs/templates/task/task_report.md`|`docs/templates/task/task_report.md`|原样|
|`docs/templates/task/review.md`|`docs/templates/task/review.md`|原样（派生 code/test 两路）|
|`docs/templates/task/adoption.md`|`docs/templates/task/adoption.md`|原样|
|`docs/templates/spike/report.md`|`docs/templates/spike/report.md`|原样|
|`docs/blueprint/conventions.md`|`docs/blueprint/conventions.md`|见阶段 2（合并）|
|`docs/specs_index.md`|`docs/specs_index.md`|见阶段 3（录入 13 条）|
|`docs/tasks_index.md`|`docs/tasks_index.md`|原样空表头|
|`docs/handoff.md`|`docs/handoff.md`|原样格式说明|

新建占位空目录（放 `.gitkeep`）：`docs/specs/`、`docs/spikes/`、`docs/guides/`、`docs/tasks/`、`docs/reviews/`、`docs/archive/reviews/`、`docs/archive/specs/`、`docs/archive/spikes/`、`docs/archive/tasks/`。

新建 `docs/blueprint/decisions.md`：采用 template 的 14 行 ADR 格式说明，**首条条目记录本次迁移决策**（见阶段 6）。

新建 `docs/guides/testing.md`（template cf7fd15 暗示位置）：承载 OmniUsage 详细测试命令清单（分层/打包 smoke/契约 live/CI 复现），见阶段 2 test.md 拆分。

______________________________________________________________________

## 阶段 2：迁移 blueprint（4 个核心文件 + 2 个拆分）

**直接平移**（用 `git mv`，保留 rename 历史；平移后编辑删除首行 HTML 锚点 `<!-- omni_powers: blueprint/xxx -->`）：

- `docs/omni_powers/op_blueprint/architecture.md` → `docs/blueprint/architecture.md`（117 行，完整替换 template 3 行占位符）
- `docs/omni_powers/op_blueprint/domain.md` → `docs/blueprint/domain.md`（71 行，完整替换占位符）
- `docs/omni_powers/op_blueprint/conventions.md` + template 元约定 → `docs/blueprint/conventions.md`（**合并**，见下）

**conventions.md 合并规则**：template 上半（元约定：命名格式/task 模板/review 字段/adoption 字段/specs_index 字段/spike 模板/decisions 格式/编码与测试）+ OmniUsage 项目编码约定下半（命名例外 PascalCase、风格、日志 logger、浏览器/网络 NetClient、新连接器步骤、Grok OAuth、提交&质量门）。两份 `## 命名` 章节去重：template 的元命名规则在前，OmniUsage 的项目命名细节作为子节追加。

**prd.md 拆分**（源 42 行，归档原件，内容按下拆）：

- "一句话定位"（L7）→ `AGENTS.md` 首段 `{一句话介绍}` 占位符 + `README.md` 开头介绍段
- "目标用户/核心功能/成功标准/对标"（L9-42）→ 并入 `README.md`（给人看的产品介绍）
- "明确不做"（L32-38，6 条）→ `docs/blueprint/domain.md` 新增 `## 产品边界（明确不做）` 章节

**test.md 拆分**（源 82 行，归档原件，内容按下拆；template cf7fd15 新增 `{test_cmd}` 占位符 + "编码与测试"小节指向）：

- 日常测试命令（L52-61 单测/集成/单文件部分）→ `AGENTS.md` 硬约束 `{test_cmd}` 占位符。OmniUsage 命令分层多（单元/集成/E2E/打包 smoke/契约 live），按 template 规则"命令多时改写为链接"，填 `详见 docs/guides/testing.md`
- 黑盒验证命令（L52-61 打包/契约部分）→ `AGENTS.md` 硬约束 `{blackbox_cmd}` 填 `pnpm test`，并注明打包 smoke 用 `pnpm test:packaged`、契约用 `pnpm test:contract:live`
- 测试规范（命名/层级/回归规则/覆盖率阈值 L67-73/任务完成验证清单 L78-81）→ 并入 `docs/blueprint/conventions.md` 的 `## 编码与测试` 小节（template 该小节当前为空占位，正好填入；基线日 2026-05-30 等项目事实保留）
- 测试分层详表（L7-30 四层表）/打包 smoke 步骤（L40-51）/完整命令清单 → 新建 `docs/guides/testing.md`（给人看的详细测试指南，AGENTS.md `{test_cmd}` 链接至此）

______________________________________________________________________

## 阶段 3：迁移 specs（13 个 spec + 索引重写）

- **13 个 spec 平移**：`git mv docs/omni_powers/op_blueprint/specs/*.md docs/specs/`（文件名不变，删除各自的 HTML 锚点首行）。涉及：`ai-cli-token-stats` `config-store` `connector-cpa` `connector-direct` `connector-runtime` `connector-session` `ipc` `observation-store` `platform-services` `scheduler` `secret-vault` `ui-views` `web-panel` `window-management`（实际以目录为准）
- **`docs/specs_index.md` 重写**：原 OmniUsage `spec_index.md` 是"功能目录"（2 列 spec|功能），与 template 的"需求状态台账"（5 列 slug|状态|task 清单|spec 路径|归档路径）职责不同。采用 template 5 列格式，把 13 条作为 `done` 条目录入：
    - `slug` = spec 文件名
    - `状态` = `done`
    - `task 清单` = `（迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN）`
    - `spec 路径` = `docs/specs/<slug>.md`
    - `归档路径` = 空（当前 active）
    - 文件顶部加说明段：本索引迁移自 omni_powers `spec_index.md`，原"按域分类"（采集层/存储层/宿主平台/消费层/跨切面）信息见 `docs/blueprint/architecture.md` 数据流章节
- **命名统一**：OmniUsage 原文件名 `spec_index.md`（单数）归档；新文件 `specs_index.md`（复数，对齐 template）

______________________________________________________________________

## 阶段 4：归档（全部进 `docs/archive/`）

按 template 四分目录 + 保留 omni_powers 原结构备追溯：

- `git mv docs/tasks/T1-T8_*`（16 文件）→ `docs/archive/tasks/`
- `git mv docs/reviews/review_20260719_1433/` → `docs/archive/reviews/`
- `git mv docs/research/` → `docs/archive/research/`
- `git mv docs/design/` → `docs/archive/design/`
- `git mv docs/omni_powers/` 整体 → `docs/archive/omni_powers_sunset/`（包含 `README.md` `index.md` `op_blueprint/{prd,test,spec_index,baselines/}` `op_execution/{tasks_list.json,issues/,leader_checkpoint.md,grok_completion_plan.md,.test_locks}` `op_record/{decisions.md,progress.md}` 原件）。迁移到 blueprint/specs 的内容是**复制**；原件保留在 sunset 目录，完整可追溯
- 现有 `docs/archive/` 散文件（`_pre_opinit_*`、`superpowers/`、30+ 历史 md）**原位不动**

______________________________________________________________________

## 阶段 5：清理本地状态目录

```
rm -rf .superpowers/ .reasonix/ .playwright-mcp/
```

都在 `.gitignore`，删除不入库、不影响仓库；全局 skill 不碰。

______________________________________________________________________

## 阶段 6：decisions.md 记录迁移

`docs/blueprint/decisions.md` 首条 ADR：

```
## 001 从 omni_powers 迁移到 repo_template 工作流（2026-07-20）

背景：OmniUsage 原用 omni_powers 三区工作流（op_blueprint/op_execution/op_record）+ 全局 skill。
选项：A)保留 omni_powers；B)全量迁移到 repo_template 纯文档工作流。
结论：选 B。废弃 omni_powers 三区（整体归档至 docs/archive/omni_powers_sunset/），
引入 AGENTS.md + blueprint/tasks/specs/reviews/spikes/archive 结构。task ID 从 T001 起编。
替代：保留 omni_powers（否决，与用户 repo 模板不一致）。

路径映射：
- op_blueprint/{architecture,domain}.md        → docs/blueprint/
- op_blueprint/conventions.md                   → docs/blueprint/conventions.md（合并元约定）
- op_blueprint/specs/*.md                       → docs/specs/
- op_blueprint/spec_index.md（功能目录）        → 并入 docs/specs_index.md（状态台账）+ architecture 数据流
- op_blueprint/{prd,test}.md                    → 内容拆进 AGENTS.md/blueprint/README，原件归档
- op_record/{decisions,progress}.md（空）       → docs/blueprint/decisions.md / docs/handoff.md（采用 template 格式）
- op_execution/* + docs/tasks/T1-T8             → docs/archive/（T1-T8 入 archive/tasks/）
- docs/research/, docs/design/                  → docs/archive/{research,design}/
- T1-T8 历史提交 SHA：5efb68a, 30d078b（原 task 编号 T1..T8；git log --grep 仍可用原编号）
```

______________________________________________________________________

## 阶段 7：README.md 更新

- 开头补 prd 的"一句话定位 + 目标用户 + 核心功能 + 成功标准 + 对标"（给人看）
- 删除"文档导航（omni_powers）"段与 `/opintake` `/oprun` `/opstatus` 命令说明
- 新增简短"文档结构"段指向 `AGENTS.md`（不重复 AGENTS.md 内容，符合 template 门牌原则）
- `pnpm *` 项目命令段保留不动

______________________________________________________________________

## AGENTS.md 起草要点（阶段 1 产出的内容）

基于 template 的 `AGENTS.md` 骨架（cf7fd15 最新版），填入 OmniUsage 项目特定值：

- H1 标题 `# {项目名}` ← 填 `# OmniUsage`
- 首段 `{一句话介绍}` ← prd.md L7 定位
- 目录与读写规则：用 template 新的四列表（路径/用途/读取规则/写入规则），原样复制
- 硬约束段（三个占位符 + 密钥/路径/测试纪律 + 测试规范指引）：
    - `{test_cmd}` ← OmniUsage 命令分层多，按 template 规则改写为链接 `详见 docs/guides/testing.md`
    - `{blackbox_cmd}` ← `pnpm test`（主）+ 注明打包 smoke 用 `pnpm test:packaged`、契约用 `pnpm test:contract:live`
    - 密钥规则：沿用 OmniUsage 现有"公网密钥由用户提供，禁自设默认值"
    - 禁写路径：除 `D:\Dev\Code\omni_usage\` 外路径禁写（沿用全局约束）
    - 测试纪律：每 task 完成前 `pnpm test`；涉及打包须真实启动 `artifacts/win-unpacked/OmniUsage.exe`；涉及 UI 须手工点击关键路径
    - 末行"测试规范见 conventions.md 编码与测试小节"原样保留
- 开发原则、开发工作流、单 task 流程（step 2/3 引用 `{test_cmd}`、step 4 引用 `{blackbox_cmd}`）、spike、handoff 段：原样复制 template

______________________________________________________________________

## Commit 策略

拆 4 个连贯 commit（遵循 commit splitting 约定）：

1. `chore(docs): 新建 repo_template 骨架与 AGENTS.md` —— 阶段 1 全部新建 + AGENTS.md 草稿
2. `chore(docs): 迁移 blueprint 与 specs 对齐 template` —— 阶段 2 + 阶段 3 + 阶段 7 README
3. `chore(docs): 归档 omni_powers 三区与 T1-T8 至 archive` —— 阶段 4 + 阶段 6 decisions
4. `chore: 清理 omni_powers 本地状态目录` —— 阶段 5

commit subject 不挂 TNNN（本次是元重构，非产品 task）；在 `docs/blueprint/decisions.md` ADR 001 记录即可追溯。

______________________________________________________________________

## 验证

|检查|命令/方式|预期|
|---|---|---|
|代码未动|`pnpm test`|全绿（代码层零改动）|
|类型/lint|`pnpm check`|通过（未改代码）|
|docs 树对齐|`find docs -type d \| sort` 对照 template|blueprint/tasks/specs/reviews/spikes/archive/templates/guides 齐全，omni_powers 仅存于 archive|
|无残留 HTML 锚点|`grep -rn "omni_powers:" docs/blueprint docs/specs`|无匹配|
|无残留 op 路径引用|`grep -rn "op_blueprint\|op_execution\|op_record" docs/ README.md AGENTS.md`|仅 archive/ 内有|
|归档完整|`ls docs/archive/omni_powers_sunset/ docs/archive/tasks/ docs/archive/reviews/`|T1-T8 + review + sunset 全在|
|git 范围|`git status`|仅 docs/ + AGENTS.md + README.md + 删除的 3 个本地状态目录|
|AGENTS.md 占位符填全|`grep -n "{项目名}\|{test_cmd}\|{blackbox_cmd}\|{一句话介绍}" AGENTS.md`|无残留占位符|
|testing.md 存在|`test -f docs/guides/testing.md && echo ok`|ok|
|软链（用户做）|`cat CLAUDE.md`|内容 = AGENTS.md|

______________________________________________________________________

## 不在本次范围

- 全局 skill `opinit`/`oplinit`/`oms`/`multi-model-*`（在 `~/.claude/skills/`，跨项目）的废弃 —— 用户自行决定
- repo_template 自身补 `prd.md`/`test.md` 模板缺口 —— 另一事，本次只让 OmniUsage 对齐现有 template
- `CLAUDE.md -> AGENTS.md` 软链创建 —— 用户操作（管理员）
