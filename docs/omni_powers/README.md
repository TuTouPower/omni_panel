# OmniUsage · omni_powers 工作流

本项目用 [omni_powers](https://github.com/...) 工作流管理需求与执行。文档分三区：

- **`op_blueprint/`** — 稳定真相（产品 / 架构 / 术语 / 约定 / 测试 / 功能 spec）。改这里 = 攥契约。
- **`op_execution/`** — 在做的事（工作 spec / task / issue / tasks_list / checkpoint）。任务闭环后归档。
- **`op_record/`** — 归档（progress / decisions / 历史 spec 与 task）。

入口：`index.md`（给 agent 的导航）。

## 常用命令

```bash
/opintake "<需求>"   # 新需求入口：分拣 → spec → 闸门 A → 拆 task
/oprun                # 从 checkpoint 续跑 task 循环
/opstatus             # 看当前进度
```

## 项目命令

```bash
pnpm start            # 开发
pnpm test             # 测试
pnpm package          # 打包 + 启动产物
pnpm check            # typecheck + lint + format + deadcode + arch
```

## 文档约定

- 蓝图真相在 `op_blueprint/`，根 `CLAUDE.md` 只指路不重复。
- 旧文档归档于 `docs/archive/`（opinit 前的 SPEC / TASKS / TEST / PLAN 等）。
- UI 设计 demo 在 `docs/design/omni-usage/`，历史设计参考。
