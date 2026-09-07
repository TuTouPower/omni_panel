# OmniPanel

常驻桌面进程，把多个 AI 服务商的用量/额度/余额集中读出来、统一展示，如实标注来源与新鲜度。对标 macOS 原生版 UsageBoard，跨 Windows / macOS / Linux。

本文件是 agent 行为入口：目录权责、状态机与 skill 路由。只加载当前任务所需文档。

命名与格式约定见 `docs/blueprint/conventions.md`「命名与格式」。

## 目录与读写规则

写权归属列声明路径的写入责任与时机；具体步骤见对应 skill 或文件内注释。

|路径|用途|写权归属|
|---|---|---|
|`DESIGN.md`|设计语言真相源（front matter → designmd → globals.css）|改 token/形态走 task，并跑 `pnpm designmd:export` / `check`；UI task 默认只消费、不改数值；不由 `task.py` 管理|
|`docs/specs_index.md`|当前生效 spec 清单（在表即生效）|task 收尾时更新；废弃删除行|
|`docs/specs/<slug>.md`|需求级 spec（按已完成 task 累积）|task 收尾时累积更新；废弃移入 `docs/archive/specs/`|
|`docs/tasks/{tid}_{slug}/`|task 工作区兼**状态权威**（backlog 起即存在）|`spec.md` / `task.md` 正文由实现侧写；`task.md` front matter 只经 `.repo_template/scripts/task.py`；reviewer 写 `review_code.md` / `review_test.md`（`single` 级写 `review_general.md`）；`finish`/`drop` 由脚本移入 archive|
|`docs/tasks/task_template/`|task 文件模板（非工作项）|只改模板本身|
|`docs/archive/tasks/{tid}_{slug}/`|已归档 task 工作区|仅由 `.repo_template/scripts/task.py finish` / `drop` 从 `docs/tasks/` 移入；内部文件只准新增|
|`docs/tasks_index.json` / `docs/archive/tasks_index.json`|活跃/归档 task 派生索引|工作区可由 `add`/`edit`/`rewind`/`purge` 重建；入库 commit：维护期随操作提交，集成时由 `integrate` / `integrate-chain` 重建并放入同一个 merge commit；`list` 只读，`list --rebuild` 手动重建；不进 task worktree 的执行 commit|
|`docs/archive/tasks_audit.log`|rewind/purge 审计（append-only）|仅 `.repo_template/scripts/task.py rewind` / `purge` 独占 append，禁止 agent 手动修改|
|`docs/runtime/dispatch_ledger.jsonl`|attempt 控制面（append-only；已 gitignore，仅主仓）|exact identity 为 `(tid, attempt, execution_id)`；生命周期只经 `task.py attempt reserve/terminal/report` 写入，`integrate` / `integrate-chain` 写 `integrated`；`ledger record` 仅允许 `note`，`ledger tail` 只读；禁止手工编辑|
|`docs/runtime/goal_queue.json`|goal 模式冻结队列快照（已 gitignore，仅主仓）|仅 `task.py goal` 覆盖式写入（同时只服务一个队列）；`task.py goal-check` 只读；禁止手工编辑|
|`docs/handoff.md`|项目级交接（仅最新一节）|记录须含 branch 与交出时 head_commit；过时段落迁 `docs/archive/handoff.md`|
|`docs/pending/{todo,parked}/pNNN_{slug}.md`|待办与不办总账（一条目一文件，统一 `pNNN`；`parked/`=用户确认暂搁，不迁 archive）|条目创建与迁移只经`.repo_template/scripts/pending.py`；skill 流程见`.repo_template/docs/usage.md`「skill 调用」|
|`docs/findings/dNNN_{slug}.md`|已验证的技术发现（一条目一文件，跨 task 复用，`dNNN`）|条目创建只经 `.repo_template/scripts/findings.py`；只新增与就地修订，不迁 archive；spike 收尾或日常验证出的事实写入|
|`docs/archive/pending/pNNN_{slug}.md`|已闭环待办|仅由 `.repo_template/scripts/pending.py archive` 迁入；只准新增|
|`docs/archive/handoff.md`|handoff 的过时历史|只追加；由对应 skill 在用户调用时迁入|
|`docs/blueprint/`|当前长期真相：架构、领域、约定、决策、测试|finalization 时更新；写代码或文档前读`conventions.md`，改跨模块行为前读 `architecture.md`，历史取舍读 `decisions.md`。门禁命令在 `testing.md` 的 `## doctor_cmd` / `## test_cmd` / `## blackbox_verify` 章节。`architecture.md` / `domain.md` 是模板仓占位符，**消费项目复制后自行填充**，未填充前不视为权威。`conventions.md` / `testing.md` 是模板默认，复制后按技术栈修改，不是空壳|
|`docs/reviews/prompts/`|review prompt 模板|改审查标准时更新|
|`docs/reviews/review_*/`|多路 review 会话产物（my-review 等外部评审生成）|报告 `review_*.md` 入库；`_meta/` 过程文件已 gitignore；确认过时由 `repo-hygiene` 迁 `docs/archive/reviews/`|
|`docs/spikes/report_template.md`|spike 报告模板|只改模板本身|
|`docs/spikes/{sid}_{slug}/`|当前 spike（`report.md` 必需；有实验代码建 `code/`）|目录创建只经 `.repo_template/scripts/spikes.py new`；流程见 `task-work`“实施”中的未知契约处理；结论入 `docs/findings/`；完结由 `repo-hygiene` 迁 `docs/archive/spikes/`|
|`.agents/skills/`|项目 skill 正文|改 skill 走文档纪律；不放业务代码|
|`.claude/skills/`|指向 `.agents/skills/` 的软链|只维护软链|
|`docs/guides/`|给人看的使用指南|给人读，不写 agent 行为规则|
|`docs/archive/`|完结或终止的历史|镜像原路径；内部文件只准新增|
|`schemas/`|跨服务接口契约|改契约走 task 流程|
|`config/`|配置（默认 + 环境覆盖 + `.env.example`）|仅 `.env.example` 入库；真值写本地 `.env`|
|`src/` `tests/` `scripts/` `assets/` `connectors/` `vendors/` `patches/`|源码、测试、脚本、静态源、连接器、依赖、补丁|仅在 task 执行期按 spec 修改；debug 复现不得写入|
|`.repo_template/scripts/`|模板自带 task 工具链：`task.py` 是 CLI/兼容 façade，业务实现位于 `repo_task/`，另含 pending.py/findings.py/spikes.py 等|仅模板演进时修改（repo-template-sync）；复制或维护必须保留 `task.py` 与完整 `repo_task/`，并随模板复制进新项目|
|`artifacts/` `data/` `.scratch/`|产物、运行数据、一次性草稿|运行与草稿；debug 复现和临时实验只写 `.scratch/`（已 gitignore）；需保留的 spike 验证材料写 `docs/spikes/{sid}_{slug}/code/`|
|`../{repo}_{tid}/`（仓库外）|task 工作副本（git worktree）|`start` 仅从主仓默认分支调用（不要求干净，主仓未提交改动保留不动）：链式拓扑以 `--base` 指向上一已完成 task 分支；active task 的实施、测试、review、finish/drop 只在自身 worktree 执行；每个 task 一个执行 commit，实施阶段写 exact identity 的 `handoff.json`，调度阶段以同一 identity 清理 worktree 并合并；本地 `.env` 软链回主仓|

## 开发原则

- specs driven：需求拆分为可独立验证的 task，填写 `spec.md`（契约区行为 AC 须非空）；版本号、底层库选型、目录结构不写进行为 AC，需要长期约束的写 `docs/blueprint/decisions.md`。
- TDD：可测部分先红后绿；测试须触达生产逻辑。实现变更让旧测试语义失效时，新增覆盖新语义的测试；旧测试原样保留或整体删除并写明理由，**禁止就地把旧测试的预期改成当前实现的输出**。
- 用户未明确允许或者不在 skill 流程时，绝不准手动直接更改未被 gitignore 的代码文件。
- 主仓负责 task 创建、从主干或上一 task 分支启动 worktree、task commit 后清理 worktree、整批最终合并（派生 index 随同一 merge commit 入库）；除非用户明确允许否则不在主仓直接 `task-run`。
- `start` 无绕过参数；只能从干净主仓默认分支调用。首 task 基于本地主干，后续 task 基于上一已完成且已清理 worktree 的 task 分支；批次执行期间允许 main 并行推进，链与 main 的对齐在合并阶段处理。
- task 状态读取优先级：登记 worktree -> 未合并 task 分支链尾 ref -> main。批次期间 main 中 task 状态可能滞后；`list/show/preflight --ref` 用于只读分支快照，不能据 main 旧 backlog 重复 start 或维护。
- task 执行期一个实现 commit；创建期和状态维护 commit 分开；派生 index 在集成时进入同一个 merge commit。task worktree 的执行 commit 不提交派生 index；整批完成并获用户批准后只合并链尾分支（`integrate-chain`）。每个 commit 必须独立可验证，有工程意义。
- 发现 commit 混入不属于当前工作的改动时，立即停止工作并向用户汇报；未经用户确认，不继续提交、合并或修正。
- 使用模板仓提供的工具链、skills、hooks、模板文件时发现缺陷，不静默处理、不自行绕过或修改，报告用户决定。
- task 状态：`backlog` / `active` / `done` / `dropped`。
- 开发工作流的设计见 `.repo_template/docs/architecture.md`，使用见 `.repo_template/docs/usage.md`。
