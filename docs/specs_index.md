# 需求索引

需求索引。task 黑盒验证通过后更新进度；全 task done 后状态改 `done`。新需求开始时不登记，第一个 task 黑盒通过后才首次写入。

> 本索引迁移自 omni_powers `op_blueprint/spec_index.md`（原“按域分类”功能目录，2 列）。原按域分类（采集层 / 存储层 / 宿主平台 / 消费层 / 跨切面）信息见 `docs/blueprint/architecture.md` §4 数据流。下表 14 条已实现 spec 作为历史 `done` 条目录入；因属 omni_powers 时期 ad-hoc 实现，未走 TNNN task 流程，task 清单字段标注来源。

| slug               | 状态 | task 清单                                     | spec 路径                        | 归档路径 |
| ------------------ | ---- | --------------------------------------------- | -------------------------------- | -------- |
| ai-cli-token-stats | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/ai-cli-token-stats.md |          |
| config-store       | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/config-store.md       |          |
| connector-cpa      | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/connector-cpa.md      |          |
| connector-direct   | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/connector-direct.md   |          |
| connector-runtime  | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/connector-runtime.md  |          |
| connector-session  | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/connector-session.md  |          |
| ipc                | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/ipc.md                |          |
| observation-store  | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/observation-store.md  |          |
| platform-services  | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/platform-services.md  |          |
| scheduler          | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/scheduler.md          |          |
| secret-vault       | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/secret-vault.md       |          |
| ui-views           | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/ui-views.md           |          |
| web-panel          | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/web-panel.md          |          |
| window-management  | done | 迁移自 omni_powers，历史 ad-hoc 实现，无 TNNN | docs/specs/window-management.md  |          |
