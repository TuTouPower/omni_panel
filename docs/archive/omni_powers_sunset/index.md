<!-- omni_powers: index -->

# OmniUsage omni_powers 索引

> 给 agent 的导航。SessionStart 注入本文件摘要。给人看的入口是 `README.md`。

## 三区模型

| 区            | 路径            | 语义                       | 内容                                                                                                                     |
| ------------- | --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **blueprint** | `op_blueprint/` | "应该是什么"（稳定契约）   | prd / architecture / domain / conventions / test / spec_index / specs/\* / baselines                                     |
| **execution** | `op_execution/` | "现在在干什么"（只放活的） | specs/（工作 spec）/ tasks/（task 子目录）/ issues/ / acceptance/ / tasks_list.json / leader_checkpoint.md / .test_locks |
| **record**    | `op_record/`    | "发生过了什么"（归档）     | progress.md / decisions.md / specs/ / tasks/ / acceptance/                                                               |

**资产与工单分离**：生效规格（`op_blueprint/specs/`）回答"系统是什么"，只收经实现+验收淬炼的结论；工作 spec（`op_execution/specs/`）回答"这次改动要做什么"，任务闭环后归档进 `op_record/`。

## blueprint 文档定位

| 文档                 | 回答                                              | 不重复（指向）    |
| -------------------- | ------------------------------------------------- | ----------------- |
| `prd.md`             | 产品是什么 / 不做什么                             | —                 |
| `architecture.md`    | 技术栈 / 目录 / 模块 / 数据流（**唯一架构真相**） | 命名→conventions  |
| `domain.md`          | 术语 / 业务不变量                                 | 编码→conventions  |
| `conventions.md`     | 命名 / 风格 / 日志 / 新连接器步骤                 | 业务→domain       |
| `test.md`            | 测试分层 / 覆盖 / 打包 smoke / 调试入口           | —                 |
| `spec_index.md`      | 已实现功能清单 → specs/                           | 架构→architecture |
| `specs/{feature}.md` | 各功能生效规格                                    | —                 |

## 工作流入口

- 新需求：`/opintake "<需求>"` → spec 编写（闸门 A）→ 自动拆 task → tasks_list.json 就绪
- 续跑：`/oprun` → 逐 task 循环 → spec 级验收（闸门 C）→ 归档
- 状态：`/opstatus`

## 当前状态

- 初始化：opinit 完成（2026-07-05）
- tasks_list：待提取未执行计划（见步骤六）
- 旧文档：归档于 `docs/archive/_pre_opinit_20260705/`
